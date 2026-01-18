#!/usr/bin/env node
/**
 * Orchestra Delegator - GLM-4.7 Agent Delegation Script
 *
 * GLM-4.7 を OpenAI SDK 互換エンドポイント経由で呼び出し
 * Codex より低コストで高頻度タスク（コードレビュー、軽量分析）を処理
 *
 * Usage:
 *   node delegate-glm.js -a <agent> -t "<task>" [-f <file>]
 *
 * Agents:
 *   - code-reviewer: コード品質レビュー（7点満点）
 *   - general-reviewer: 汎用レビュー
 *   - math-reasoning: 数学・ロジック検証
 *   - refactor-advisor: リファクタリング提案
 *
 * Environment:
 *   ZAI_API_KEY: Z.AI API キー（必須）
 */

const fs = require('fs');
const path = require('path');

// ========================================
// Configuration
// ========================================
const CONFIG = {
  baseURL: 'https://api.z.ai/api/coding/paas/v4/',
  model: 'glm-4.7',
  timeout: 180000, // 3分
  maxTokens: 8192,
  maxRetries: 3,        // リトライ回数
  retryDelay: 5000,     // リトライ間隔（ms）
  parallelLimit: 7,     // 並列上限（8以上で429エラー）
};

// ========================================
// Retry Helper
// ========================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callWithRetry(fn, retries = CONFIG.maxRetries) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.status === 429;
      const isTimeout = error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED';
      const isRetryable = isRateLimit || isTimeout || (error.status && error.status >= 500);

      if (!isRetryable || i === retries - 1) throw error;

      const delay = isRateLimit ? CONFIG.retryDelay * (i + 1) : CONFIG.retryDelay;
      console.log(`⚠️ Retry ${i + 1}/${retries} after ${delay}ms (${error.message})`);
      await sleep(delay);
    }
  }
}

// ========================================
// Parse command line arguments
// ========================================
const args = process.argv.slice(2);
let agent = '';
let task = '';
let file = '';
let thinking = false; // 思考モード

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-a' && args[i + 1]) {
    agent = args[++i];
  } else if (args[i] === '-t' && args[i + 1]) {
    task = args[++i];
  } else if (args[i] === '-f' && args[i + 1]) {
    file = args[++i];
  } else if (args[i] === '--thinking') {
    thinking = true;
  }
}

if (!agent || !task) {
  console.error('Usage: node delegate-glm.js -a <agent> -t "<task>" [-f <file>] [--thinking]');
  console.error('Agents: code-reviewer, general-reviewer, math-reasoning, refactor-advisor');
  process.exit(1);
}

// ========================================
// Agent Prompts (GLM-4.7 optimized)
// ========================================
const AGENT_PROMPTS = {
  'code-reviewer': `あなたはCode Reviewerです。GLM-4.7の高いコーディング能力を活かしてレビューします。

## 評価観点（7点満点）
- 正確性 (3点): バグ、ロジックエラー、エッジケース、型安全性
- パフォーマンス (2点): N+1、不要な計算、メモリリーク、非同期処理
- 保守性 (2点): 可読性、命名規則、DRY原則、SOLID原則

## 必須チェック項目
- TypeScript/JavaScript: 型定義、null safety、async/await
- React: hooks依存配列、メモ化、レンダリング最適化
- API: エラーハンドリング、バリデーション、レート制限

## 出力形式（JSON）
{
  "scores": { "accuracy": 0-3, "performance": 0-2, "maintainability": 0-2 },
  "total": 0-7,
  "issues": [{ "severity": "critical|major|minor", "file": "", "line": "", "description": "", "suggestion": "" }],
  "positives": ["良い点を列挙"],
  "summary": "総評"
}`,

  'general-reviewer': `あなたはGeneral Reviewerです。コード全般を多角的にレビューします。

## レビュー観点
- コードの意図が明確か
- エッジケースの考慮
- エラーハンドリング
- テスタビリティ
- ドキュメント/コメント

## 出力形式
### 概要
コードの目的と構造の理解

### 良い点
- 箇条書き

### 改善点
| 優先度 | 箇所 | 問題 | 提案 |
|--------|------|------|------|

### 総評
全体的な品質評価と次のアクション`,

  'math-reasoning': `あなたはMath/Logic Specialistです。数学的・論理的な検証を行います。

## 検証項目
- アルゴリズムの正確性
- 計算量（時間/空間）
- 境界条件
- オーバーフロー/アンダーフロー
- 浮動小数点の精度

## 出力形式
### アルゴリズム分析
- 時間計算量: O(?)
- 空間計算量: O(?)

### 正確性検証
ステップバイステップでロジックを追跡

### 問題点
見つかった問題と修正案

### 最適化提案
より効率的なアプローチがあれば提案`,

  'refactor-advisor': `あなたはRefactoring Advisorです。リファクタリングの提案を行います。

## 分析観点
- コードの重複
- 関数/クラスの責務
- 抽象化レベル
- 命名の適切さ
- 依存関係

## 禁止
- 機能変更を伴う提案
- 過度な抽象化
- 既存テストを壊す変更

## 出力形式
### 現状分析
コードの構造と問題点

### リファクタリング提案
| 優先度 | 種類 | 対象 | 提案 | 理由 |
|--------|------|------|------|------|

### 実装手順
1. ステップバイステップの手順
2. 各ステップでのテスト確認ポイント

### リスク
リファクタリングに伴うリスクと対策`
};

// ========================================
// Get agent prompt
// ========================================
const agentPrompt = AGENT_PROMPTS[agent];
if (!agentPrompt) {
  console.error(`Unknown agent: ${agent}`);
  console.error('Available agents:', Object.keys(AGENT_PROMPTS).join(', '));
  process.exit(1);
}

// ========================================
// Read file content if provided
// ========================================
let fileContent = '';
if (file) {
  if (fs.existsSync(file)) {
    fileContent = fs.readFileSync(file, 'utf-8');
  } else {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
}

// ========================================
// Build full prompt
// ========================================
let fullPrompt = `${agentPrompt}\n\n## タスク\n${task}`;
if (fileContent) {
  fullPrompt += `\n\n## 対象コード/ファイル\n\`\`\`\n${fileContent}\n\`\`\``;
}

if (thinking) {
  fullPrompt += `\n\n## 思考モード\nInterleaved Thinkingを使用して、ステップバイステップで分析してください。`;
}

// ========================================
// Call GLM-4.7 API
// ========================================
async function callGLM(prompt) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.error('Error: ZAI_API_KEY environment variable is not set');
    console.error('Set it with: export ZAI_API_KEY="your-api-key"');
    process.exit(1);
  }

  // Dynamic import for ESM compatibility
  const OpenAI = require('openai').default || require('openai');

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: CONFIG.baseURL,
    timeout: CONFIG.timeout,
  });

  console.log(`\n🤖 Delegating to GLM-4.7 (${agent})...\n`);
  const startTime = Date.now();

  try {
    const response = await callWithRetry(() =>
      client.chat.completions.create({
        model: CONFIG.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: CONFIG.maxTokens,
        temperature: 0.3, // 低めで一貫性重視
      })
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    console.log(content);
    console.log(`\n---`);
    console.log(`⏱️ 処理時間: ${elapsed}s`);
    if (usage) {
      console.log(`📊 トークン: input=${usage.prompt_tokens}, output=${usage.completion_tokens}, total=${usage.total_tokens}`);
    }

    // Save result to output directory
    saveResult(agent, content, usage);

    return content;
  } catch (error) {
    const isRateLimit = error.status === 429;
    console.error(`❌ Error calling GLM-4.7: ${error.message}`);
    if (isRateLimit) {
      console.error('💡 Rate limit exceeded. Try reducing parallel requests (max 7).');
    }
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// ========================================
// Save result to file
// ========================================
function saveResult(agent, content, usage) {
  const outputDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `glm-${agent}-${timestamp}.md`;
  const filepath = path.join(outputDir, filename);

  const output = `# GLM-4.7 ${agent} Result
Generated: ${new Date().toISOString()}
Model: ${CONFIG.model}
${usage ? `Tokens: ${usage.total_tokens}` : ''}

---

${content}
`;

  fs.writeFileSync(filepath, output);
  console.log(`💾 結果保存: ${filepath}`);
}

// ========================================
// Execute
// ========================================
callGLM(fullPrompt);
