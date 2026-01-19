#!/usr/bin/env node
/**
 * Orchestra Delegator - Manus API Delegation Script
 *
 * Manus でしかできないタスクをピンポイントで委譲:
 * - ブラウザ自動化（認証付きサービス操作）
 * - 長時間自律リサーチ（1h+）
 * - プレミアムデータ収集（Crunchbase, Ahrefs等）
 *
 * Usage:
 *   node delegate-manus.js -t "<task>" [--browser] [--research] [--estimate]
 *
 * Options:
 *   -t, --task      タスク内容（必須）
 *   --browser       ブラウザ操作タスク
 *   --research      長時間リサーチタスク
 *   --estimate      クレジット消費量を見積もり（実行しない）
 *   --max-credits   最大クレジット消費量（デフォルト: 100）
 *
 * Environment:
 *   MANUS_API_KEY: Manus API キー（GitHub Secrets から注入）
 */

const https = require('https');

// ========================================
// Configuration
// ========================================
const CONFIG = {
  baseURL: 'https://api.manus.im',
  apiVersion: 'v1',
  timeout: 300000, // 5分（タスク作成用）
  pollInterval: 30000, // 30秒（ステータス確認間隔）
  maxPollAttempts: 120, // 最大1時間ポーリング
  credits: {
    limit: parseInt(process.env.MANUS_CREDIT_LIMIT, 10) || 1500, // 環境変数優先
    warningThreshold: parseInt(process.env.MANUS_CREDIT_WARNING, 10) || 300,
    estimatePerTask: {
      browser: 50,
      research: 100,
      default: 30
    }
  }
};

// ========================================
// Parse command line arguments
// ========================================
const args = process.argv.slice(2);
let task = '';
let taskType = 'default';
let estimateOnly = false;
let maxCredits = 100;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-t':
    case '--task':
      task = args[++i];
      break;
    case '--browser':
      taskType = 'browser';
      break;
    case '--research':
      taskType = 'research';
      break;
    case '--estimate':
      estimateOnly = true;
      break;
    case '--max-credits':
      maxCredits = parseInt(args[++i], 10);
      break;
  }
}

if (!task) {
  console.error('❌ Error: Task is required (-t "<task>")');
  process.exit(1);
}

// ========================================
// API Key Check
// ========================================
const apiKey = process.env.MANUS_API_KEY;
if (!apiKey) {
  console.error('❌ Error: MANUS_API_KEY environment variable is not set');
  console.error('   Set it in GitHub Secrets: https://github.com/organizations/cursorvers/settings/secrets/actions');
  process.exit(1);
}

// ========================================
// Credit Management
// ========================================
function estimateCredits(type) {
  return CONFIG.credits.estimatePerTask[type] || CONFIG.credits.estimatePerTask.default;
}

function checkCreditLimit(estimated) {
  if (estimated > maxCredits) {
    console.error(`❌ Credit limit exceeded: estimated ${estimated} > max ${maxCredits}`);
    return false;
  }
  if (CONFIG.credits.limit - estimated < CONFIG.credits.warningThreshold) {
    console.warn(`⚠️ Warning: Low credits remaining after task (~${CONFIG.credits.limit - estimated})`);
  }
  return true;
}

// ========================================
// API Helpers
// ========================================
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CONFIG.baseURL}/${CONFIG.apiVersion}${path}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: CONFIG.timeout
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject({ status: res.statusCode, message: json.message || body });
          }
        } catch {
          reject({ status: res.statusCode, message: body });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject({ code: 'ETIMEDOUT', message: 'Request timeout' });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function createTask(taskContent, type) {
  const payload = {
    content: taskContent,
    type: type,
    metadata: {
      source: 'orchestra-delegator',
      delegated_at: new Date().toISOString()
    }
  };

  return makeRequest('POST', '/tasks', payload);
}

async function getTaskStatus(taskId) {
  return makeRequest('GET', `/tasks/${taskId}`);
}

async function pollTaskCompletion(taskId) {
  for (let i = 0; i < CONFIG.maxPollAttempts; i++) {
    const status = await getTaskStatus(taskId);

    if (status.status === 'completed') {
      return status;
    }
    if (status.status === 'failed') {
      throw new Error(`Task failed: ${status.error || 'Unknown error'}`);
    }

    console.log(`⏳ Task in progress... (${i + 1}/${CONFIG.maxPollAttempts})`);
    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }

  throw new Error('Task polling timeout');
}

// ========================================
// Main Execution
// ========================================
async function main() {
  const estimated = estimateCredits(taskType);

  console.log('🤖 Manus API Delegation');
  console.log(`   Task: ${task.substring(0, 50)}...`);
  console.log(`   Type: ${taskType}`);
  console.log(`   Estimated Credits: ~${estimated}`);

  if (estimateOnly) {
    console.log('\n📊 Estimate Only Mode - No task created');
    console.log(JSON.stringify({ estimated, taskType, withinLimit: estimated <= maxCredits }, null, 2));
    process.exit(0);
  }

  if (!checkCreditLimit(estimated)) {
    process.exit(1);
  }

  try {
    console.log('\n📤 Creating task...');
    const created = await createTask(task, taskType);
    console.log(`✅ Task created: ${created.id}`);

    console.log('\n⏳ Waiting for completion (this may take a while)...');
    const result = await pollTaskCompletion(created.id);

    console.log('\n✅ Task completed!');
    console.log('━'.repeat(50));
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`\n❌ Error: ${error.message || error}`);
    process.exit(1);
  }
}

main();
