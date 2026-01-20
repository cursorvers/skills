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
 *   -t, --task        タスク内容（必須）
 *   --browser         ブラウザ操作タスク
 *   --research        長時間リサーチタスク
 *   --market-research Similarweb市場調査（12ヶ月トラフィック、SEO、競合）
 *   --alert           異常検知アラート（トラフィック急変、バウンス率悪化）
 *   --seo             SEOキーワード深掘り
 *   --estimate        クレジット消費量を見積もり（実行しない）
 *   --max-credits     最大クレジット消費量（デフォルト: 100）
 *   --severity        異常レベル (minor|moderate|severe)
 *   --skip-approval   承認チェックをスキップ（CI用）
 *
 * Environment:
 *   MANUS_API_KEY: Manus API キー（GitHub Secrets から注入）
 *   QUALITY_GATES_PATH: quality-gates.json のパス
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// Load Quality Gates Configuration
// ========================================
function loadQualityGates() {
  const defaultPath = path.join(
    process.env.HOME || '',
    '.claude/rules/quality-gates.json'
  );
  const configPath = process.env.QUALITY_GATES_PATH || defaultPath;

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to load quality-gates.json: ${err.message}`);
  }
  return null;
}

const QUALITY_GATES = loadQualityGates();

// ========================================
// Configuration (with Quality Gates fallback)
// ========================================
const manusConfig = QUALITY_GATES?.manus || {};

const CONFIG = {
  baseURL: 'https://api.manus.im',
  apiVersion: 'v1',
  timeout: 300000,
  pollInterval: 30000,
  maxPollAttempts: 120,
  credits: {
    limit: parseInt(process.env.MANUS_CREDIT_LIMIT, 10) || 1500,
    dailyLimit: manusConfig.credits?.dailyLimit || 200,
    weeklyLimit: manusConfig.credits?.weeklyLimit || 500,
    warningThreshold: manusConfig.credits?.warningThreshold || 300,
    emergencyReserve: manusConfig.credits?.emergencyReserve || 100
  },
  costPerTask: manusConfig.costPerTask || {
    browser: { base: 50, maxMultiplier: 2.0 },
    research: { base: 100, maxMultiplier: 1.5 },
    'market-research': { base: 100, maxMultiplier: 1.5 },
    'alert': { base: 40, maxMultiplier: 1.2 },
    'seo-deepdive': { base: 80, maxMultiplier: 1.8 },
    default: { base: 30, maxMultiplier: 1.2 }
  },
  approval: manusConfig.approval || {
    autoApprove: { maxCredits: 50, taskTypes: ['default', 'alert'] },
    requireConsensus: { minCredits: 51, taskTypes: ['browser', 'research', 'market-research', 'seo-deepdive'] },
    requireUserApproval: { minCredits: 150, keywords: ['本番', 'production'] }
  },
  thresholds: manusConfig.thresholds || {},
  fallback: manusConfig.fallback || {}
};

// ========================================
// Parse command line arguments
// ========================================
const args = process.argv.slice(2);
let task = '';
let taskType = 'default';
let estimateOnly = false;
let maxCredits = 100;
let severity = null;
let skipApproval = false;

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
    case '--market-research':
      taskType = 'market-research';
      break;
    case '--alert':
      taskType = 'alert';
      break;
    case '--seo':
    case '--seo-deepdive':
      taskType = 'seo-deepdive';
      break;
    case '--estimate':
      estimateOnly = true;
      break;
    case '--max-credits':
      maxCredits = parseInt(args[++i], 10);
      break;
    case '--severity':
      severity = args[++i];
      break;
    case '--skip-approval':
      skipApproval = true;
      break;
  }
}

if (!task) {
  console.error('Error: Task is required (-t "<task>")');
  process.exit(1);
}

// ========================================
// API Key Check
// ========================================
const apiKey = process.env.MANUS_API_KEY;
if (!apiKey) {
  console.error('Error: MANUS_API_KEY environment variable is not set');
  console.error('   Set it in GitHub Secrets');
  process.exit(1);
}

// ========================================
// Guard Rail: Approval Check
// ========================================
function checkApproval(estimated, type, taskContent) {
  const { autoApprove, requireConsensus, requireUserApproval } = CONFIG.approval;

  // Check for user approval keywords
  const hasUserApprovalKeyword = requireUserApproval.keywords.some(
    keyword => taskContent.toLowerCase().includes(keyword.toLowerCase())
  );

  if (hasUserApprovalKeyword || estimated >= requireUserApproval.minCredits) {
    return {
      approved: false,
      level: 'user_required',
      reason: `High-cost task (${estimated} credits) or sensitive keyword detected`,
      action: 'Request user approval via AskUserQuestion'
    };
  }

  // Check if consensus is required
  if (estimated >= requireConsensus.minCredits ||
      requireConsensus.taskTypes.includes(type)) {
    return {
      approved: false,
      level: 'consensus_required',
      reason: `Task type "${type}" requires 3-party consensus`,
      action: 'Run consensus-vote.js before proceeding'
    };
  }

  // Auto-approve for low-cost default tasks
  if (estimated <= autoApprove.maxCredits &&
      autoApprove.taskTypes.includes(type)) {
    return {
      approved: true,
      level: 'auto_approved',
      reason: `Low-cost task (${estimated} <= ${autoApprove.maxCredits})`,
      action: 'Proceed with execution'
    };
  }

  // Default: require consensus
  return {
    approved: false,
    level: 'consensus_required',
    reason: 'Default policy requires consensus',
    action: 'Run consensus-vote.js before proceeding'
  };
}

// ========================================
// Guard Rail: Severity Threshold Check
// ========================================
function checkSeverityThreshold(severityLevel) {
  if (!severityLevel) return { proceed: true };

  const threshold = CONFIG.thresholds[severityLevel];
  if (!threshold) {
    return { proceed: true, warning: `Unknown severity level: ${severityLevel}` };
  }

  if (!threshold.triggerManus) {
    return {
      proceed: false,
      reason: threshold.description,
      action: 'Log warning only, do not invoke Manus'
    };
  }

  if (threshold.consensusRequired) {
    return {
      proceed: true,
      requireConsensus: true,
      reason: threshold.description
    };
  }

  return { proceed: true, reason: threshold.description };
}

// ========================================
// Guard Rail: Credit Limits
// ========================================
function estimateCredits(type) {
  const taskCost = CONFIG.costPerTask[type] || CONFIG.costPerTask.default;
  return taskCost.base;
}

function checkCreditLimits(estimated) {
  const issues = [];

  if (estimated > maxCredits) {
    issues.push(`Exceeds max-credits limit: ${estimated} > ${maxCredits}`);
  }

  if (estimated > CONFIG.credits.dailyLimit) {
    issues.push(`Exceeds daily limit: ${estimated} > ${CONFIG.credits.dailyLimit}`);
  }

  if (CONFIG.credits.limit - estimated < CONFIG.credits.emergencyReserve) {
    issues.push(`Would deplete emergency reserve (${CONFIG.credits.emergencyReserve})`);
  }

  const warnings = [];
  if (CONFIG.credits.limit - estimated < CONFIG.credits.warningThreshold) {
    warnings.push(`Low credits remaining after task (~${CONFIG.credits.limit - estimated})`);
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings
  };
}

// ========================================
// Fallback Handler
// ========================================
function handleFallback(errorType, error) {
  const fallbackConfig = CONFIG.fallback[errorType] || CONFIG.fallback.onApiError;

  console.error(`\n[FALLBACK] ${errorType}`);
  console.error(`   Action: ${fallbackConfig?.action || 'log_and_notify'}`);
  console.error(`   Error: ${error?.message || error}`);

  // Output structured fallback info for CI
  const fallbackInfo = {
    errorType,
    error: error?.message || String(error),
    config: fallbackConfig,
    timestamp: new Date().toISOString()
  };

  console.log('\n[FALLBACK_JSON]');
  console.log(JSON.stringify(fallbackInfo, null, 2));

  return fallbackConfig;
}

// ========================================
// API Helpers
// ========================================
function makeRequest(method, urlPath, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CONFIG.baseURL}/${CONFIG.apiVersion}${urlPath}`);
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
      delegated_at: new Date().toISOString(),
      guard_rail_version: '2.0'
    }
  };

  return makeRequest('POST', '/tasks', payload);
}

async function getTaskStatus(taskId) {
  return makeRequest('GET', `/tasks/${taskId}`);
}

async function pollTaskCompletion(taskId) {
  const timeoutConfig = CONFIG.fallback.onTimeout || { timeoutSeconds: 3600 };
  const maxAttempts = Math.ceil(timeoutConfig.timeoutSeconds / (CONFIG.pollInterval / 1000));

  for (let i = 0; i < Math.min(CONFIG.maxPollAttempts, maxAttempts); i++) {
    const status = await getTaskStatus(taskId);

    if (status.status === 'completed') {
      return status;
    }
    if (status.status === 'failed') {
      throw new Error(`Task failed: ${status.error || 'Unknown error'}`);
    }

    console.log(`Task in progress... (${i + 1}/${CONFIG.maxPollAttempts})`);
    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }

  throw new Error('Task polling timeout');
}

// ========================================
// Main Execution
// ========================================
async function main() {
  const estimated = estimateCredits(taskType);

  console.log('Manus API Delegation (Guard Rail v2.0)');
  console.log(`   Task: ${task.substring(0, 50)}${task.length > 50 ? '...' : ''}`);
  console.log(`   Type: ${taskType}`);
  console.log(`   Severity: ${severity || 'not specified'}`);
  console.log(`   Estimated Credits: ~${estimated}`);
  console.log(`   Quality Gates: ${QUALITY_GATES ? 'Loaded' : 'Using defaults'}`);

  // Guard Rail 1: Severity threshold check
  if (severity) {
    const severityCheck = checkSeverityThreshold(severity);
    console.log(`\n[SEVERITY CHECK] ${severity}`);
    console.log(`   Proceed: ${severityCheck.proceed}`);
    console.log(`   Reason: ${severityCheck.reason || 'N/A'}`);

    if (!severityCheck.proceed) {
      console.log(`\n[SKIPPED] ${severityCheck.action}`);
      process.exit(0);
    }
  }

  // Guard Rail 2: Credit limit check
  const creditCheck = checkCreditLimits(estimated);
  if (!creditCheck.passed) {
    console.error('\n[CREDIT CHECK FAILED]');
    creditCheck.issues.forEach(issue => console.error(`   - ${issue}`));
    handleFallback('onCreditExhausted', { message: creditCheck.issues.join('; ') });
    process.exit(1);
  }
  if (creditCheck.warnings.length > 0) {
    console.warn('\n[CREDIT WARNINGS]');
    creditCheck.warnings.forEach(warn => console.warn(`   - ${warn}`));
  }

  // Guard Rail 3: Approval check
  if (!skipApproval) {
    const approvalCheck = checkApproval(estimated, taskType, task);
    console.log(`\n[APPROVAL CHECK]`);
    console.log(`   Level: ${approvalCheck.level}`);
    console.log(`   Approved: ${approvalCheck.approved}`);
    console.log(`   Reason: ${approvalCheck.reason}`);

    if (!approvalCheck.approved) {
      console.log(`\n[BLOCKED] ${approvalCheck.action}`);
      console.log(JSON.stringify({
        status: 'blocked',
        approval: approvalCheck,
        estimated,
        taskType
      }, null, 2));
      process.exit(2); // Exit code 2 = approval required
    }
  } else {
    console.log('\n[APPROVAL CHECK] Skipped (--skip-approval)');
  }

  // Estimate only mode
  if (estimateOnly) {
    console.log('\n[ESTIMATE ONLY] No task created');
    console.log(JSON.stringify({
      estimated,
      taskType,
      severity,
      withinLimit: estimated <= maxCredits,
      approvalLevel: checkApproval(estimated, taskType, task).level
    }, null, 2));
    process.exit(0);
  }

  // Execute task
  try {
    console.log('\nCreating task...');
    const created = await createTask(task, taskType);
    console.log(`Task created: ${created.id}`);

    console.log('\nWaiting for completion...');
    const result = await pollTaskCompletion(created.id);

    console.log('\nTask completed!');
    console.log('='.repeat(50));
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`\nError: ${error.message || error}`);

    if (error.code === 'ETIMEDOUT') {
      handleFallback('onTimeout', error);
    } else {
      handleFallback('onApiError', error);
    }

    process.exit(1);
  }
}

main();
