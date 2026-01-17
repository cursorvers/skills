#!/usr/bin/env node
/**
 * Orchestra Delegator - MCP Protocol Bridge
 *
 * 記事「Claude Delegator」のアーキテクチャに準拠
 * https://note.com/masa_wunder/n/n5ddb3219f76f
 *
 * 7ステップ委譲Workflow:
 * 1. Expert Identification - トリガーパターンでエージェント選択
 * 2. Prompt Loading - プロンプトファイル読み込み
 * 3. Mode Selection - Advisory/Implementation モード選択
 * 4. User Notification - 委任を通知
 * 5. Prompt Construction - 7セクション構築
 * 6. Expert Invocation - Codex MCP呼び出し
 * 7. Response Processing - 結果の合成・検証
 */

import { execSync, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========================================
// 設定
// ========================================
const TIMEOUT_MS = {
  DEFAULT: 10 * 60 * 1000,  // 10 minutes
  XHIGH: 30 * 60 * 1000,    // 30 minutes (for large-scale tasks)
};

const CONFIG = {
  codexTimeout: TIMEOUT_MS.DEFAULT,
  codexTimeoutXhigh: TIMEOUT_MS.XHIGH,
  codexModel: "gpt-5.2-codex",
  maxRetries: 2,
  // Reasoning Effort 設定
  reasoningEffort: {
    default: "medium",
    // xhigh トリガー: 大規模・複雑なタスク
    xhighTriggers: [
      "大規模リファクタリング", "リファクタリング", "refactor", "refactoring",
      "アーキテクチャ変更", "アーキテクチャ再設計", "architecture",
      "マイグレーション", "migration", "移行",
      "全体設計", "システム再設計", "redesign", "システム刷新",
      "パフォーマンス最適化", "performance optimization",
      "セキュリティ監査", "security audit", "脆弱性診断",
      "大規模", "large-scale", "全面改修"
    ],
    // high トリガー: 中規模・複数ファイル
    highTriggers: [
      "設計レビュー", "コードレビュー", "PRレビュー", "review",
      "複雑", "complex", "複数ファイル", "multi-file",
      "テスト追加", "テスト拡充", "カバレッジ向上",
      "API設計", "DB設計", "スキーマ変更"
    ]
  }
};

// ========================================
// Layer 3: Expert Prompts - 5つの専門エージェント
// ========================================
const AGENTS = {
  architect: {
    name: "Architect",
    description: "システム設計エキスパート",
    promptFile: "prompts/architect.md",
    mode: "implementation", // ファイル変更可能
    triggers: ["設計", "アーキテクチャ", "構成", "技術選定", "DB設計", "API設計"],
  },
  "plan-reviewer": {
    name: "Plan Reviewer",
    description: "実装計画検証エキスパート",
    promptFile: "prompts/plan-reviewer.md",
    mode: "advisory", // 分析・提案のみ
    triggers: ["計画", "レビュー", "検証", "チェック"],
  },
  "scope-analyst": {
    name: "Scope Analyst",
    description: "スコープ分析エキスパート",
    promptFile: "prompts/scope-analyst.md",
    mode: "advisory",
    triggers: ["スコープ", "要件", "曖昧", "〜したい", "改善", "検討"],
  },
  "code-reviewer": {
    name: "Code Reviewer",
    description: "コードレビューエキスパート",
    promptFile: "prompts/code-reviewer.md",
    mode: "advisory",
    triggers: ["コードレビュー", "PRレビュー", "コードチェック"],
  },
  "security-analyst": {
    name: "Security Analyst",
    description: "セキュリティ分析エキスパート",
    promptFile: "prompts/security-analyst.md",
    mode: "advisory",
    triggers: ["セキュリティ", "脆弱性", "認証", "認可", "OWASP"],
  },
};

// ========================================
// Layer 1: Rules Engine - コマンドライン引数
// ========================================
const { values } = parseArgs({
  options: {
    agent: { type: "string", short: "a" },
    task: { type: "string", short: "t" },
    context: { type: "string", short: "x" },
    "context-file": { type: "string", short: "f" },
    constraints: { type: "string", short: "c" },
    output: { type: "string", short: "o" },
    mode: { type: "string", short: "m" }, // advisory | implementation
    effort: { type: "string", short: "e" }, // minimal | low | medium | high | xhigh | auto
    "list-agents": { type: "boolean", short: "l" },
    help: { type: "boolean", short: "h" },
    verbose: { type: "boolean", short: "v" },
  },
  strict: true,
});

// ========================================
// Reasoning Effort 自動検出
// ========================================
/**
 * タスク内容から reasoning effort を自動判定
 * @param {string} taskText - タスク内容
 * @returns {"minimal"|"low"|"medium"|"high"|"xhigh"} - 推論努力レベル
 */
function detectReasoningEffort(taskText) {
  const taskLower = taskText.toLowerCase();

  // xhigh トリガーチェック
  for (const trigger of CONFIG.reasoningEffort.xhighTriggers) {
    if (taskLower.includes(trigger.toLowerCase())) {
      return "xhigh";
    }
  }

  // high トリガーチェック
  for (const trigger of CONFIG.reasoningEffort.highTriggers) {
    if (taskLower.includes(trigger.toLowerCase())) {
      return "high";
    }
  }

  return CONFIG.reasoningEffort.default;
}

/**
 * 現在の reasoning effort を決定
 * CLI引数 > 自動検出 > デフォルト
 */
function getReasoningEffort() {
  // CLI引数で明示指定された場合
  if (values.effort && values.effort !== "auto") {
    const validEfforts = ["minimal", "low", "medium", "high", "xhigh"];
    if (validEfforts.includes(values.effort)) {
      return { effort: values.effort, source: "cli" };
    }
  }

  // 自動検出
  const detected = detectReasoningEffort(values.task || "");
  return { effort: detected, source: detected !== CONFIG.reasoningEffort.default ? "auto-detected" : "default" };
}

// ========================================
// ヘルプ・エージェント一覧
// ========================================
if (values.help) {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🎭 Orchestra Delegator - MCP Protocol Bridge                  ║
║     Claude Delegator アーキテクチャ準拠                         ║
╚════════════════════════════════════════════════════════════════╝

Usage:
  node delegate.js --agent <name> --task <task> [options]

Options:
  -a, --agent <name>        専門エージェント名（必須）
  -t, --task <task>         タスク内容（必須）
  -x, --context <text>      追加コンテキスト
  -f, --context-file <path> コンテキストファイル
  -c, --constraints <text>  制約条件
  -o, --output <dir>        出力ディレクトリ
  -m, --mode <mode>         advisory | implementation
  -e, --effort <level>      reasoning effort（auto で自動検出）
  -l, --list-agents         エージェント一覧表示
  -v, --verbose             詳細ログ
  -h, --help                ヘルプ表示

Agents:
  scope-analyst     要件分析（Advisory）
  architect         システム設計（Implementation）
  plan-reviewer     計画検証（Advisory）
  code-reviewer     コードレビュー（Advisory）
  security-analyst  セキュリティ分析（Advisory）

Modes:
  advisory        分析・提案のみ（読み取り専用）
  implementation  ファイル変更可能

Reasoning Effort:
  minimal   最小限の推論（高速）
  low       軽い推論
  medium    標準（デフォルト）
  high      深い推論
  xhigh     最大の推論（大規模リファクタリング向け、最大30分）
  auto      タスク内容から自動検出（デフォルト動作）

  ※ "リファクタリング", "マイグレーション" 等のキーワードで自動的に xhigh に切り替わります

Example:
  node delegate.js -a architect -t "マイクロサービス設計"
  node delegate.js -a architect -t "大規模リファクタリング" -e xhigh
  node delegate.js -a code-reviewer -t "PRレビュー" -f code.md -m advisory
`);
  process.exit(0);
}

if (values["list-agents"]) {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  専門エージェント一覧                                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  for (const [id, agent] of Object.entries(AGENTS)) {
    const modeIcon = agent.mode === "advisory" ? "📖" : "✏️";
    console.log(`  ${modeIcon} ${id.padEnd(18)} ${agent.description} [${agent.mode}]`);
  }
  console.log("\n  📖 = Advisory（分析のみ）  ✏️ = Implementation（変更可能）\n");
  process.exit(0);
}

// ========================================
// バリデーション
// ========================================
if (!values.agent) {
  console.error("❌ エラー: --agent オプションは必須です");
  console.error("   利用可能: " + Object.keys(AGENTS).join(", "));
  process.exit(1);
}

if (!AGENTS[values.agent]) {
  console.error(`❌ エラー: 不明なエージェント '${values.agent}'`);
  console.error("   利用可能: " + Object.keys(AGENTS).join(", "));
  process.exit(1);
}

if (!values.task) {
  console.error("❌ エラー: --task オプションは必須です");
  process.exit(1);
}

// Gitリポジトリチェック
function checkGitRepository() {
  try {
    execSync("git rev-parse --git-dir", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

if (!checkGitRepository()) {
  console.error("╔════════════════════════════════════════════════════════════════╗");
  console.error("║  ❌ エラー: gitリポジトリ内でのみ使用可能                       ║");
  console.error("╚════════════════════════════════════════════════════════════════╝");
  console.error("\n解決方法: git init\n");
  process.exit(1);
}

// ========================================
// 7ステップ委譲Workflow
// ========================================

const agent = AGENTS[values.agent];
const task = values.task;

/**
 * Step 1: Expert Identification
 * トリガーパターンでエージェント選択（CLI引数で指定済み）
 */
function step1_expertIdentification() {
  if (values.verbose) {
    console.error(`\n📍 Step 1: Expert Identification`);
    console.error(`   選択: ${agent.name}`);
    console.error(`   トリガー: ${agent.triggers.join(", ")}`);
  }
  return agent;
}

/**
 * Step 2: Prompt Loading
 * プロンプトファイル読み込み
 */
function step2_promptLoading() {
  if (values.verbose) {
    console.error(`\n📍 Step 2: Prompt Loading`);
  }

  const promptPath = join(__dirname, agent.promptFile);
  if (!existsSync(promptPath)) {
    throw new Error(`プロンプトファイルが見つかりません: ${promptPath}`);
  }

  const prompt = readFileSync(promptPath, "utf-8");
  if (values.verbose) {
    console.error(`   読み込み: ${agent.promptFile}`);
    console.error(`   サイズ: ${prompt.length} bytes`);
  }

  return prompt;
}

/**
 * Step 3: Mode Selection
 * Advisory / Implementation モード選択
 */
function step3_modeSelection() {
  // CLI引数で上書き可能、デフォルトはエージェント定義
  const mode = values.mode || agent.mode;

  if (values.verbose) {
    console.error(`\n📍 Step 3: Mode Selection`);
    console.error(`   モード: ${mode}`);
    console.error(`   ${mode === "advisory" ? "📖 分析・提案のみ" : "✏️ ファイル変更可能"}`);
  }

  return mode;
}

/**
 * Step 4: User Notification
 * 委任を通知（バナー表示）
 */
function step4_userNotification(mode, effortInfo) {
  const modeLabel = mode === "advisory" ? "📖 Advisory" : "✏️ Implementation";
  const effortIcons = {
    minimal: "⚡",
    low: "🔹",
    medium: "🔷",
    high: "🔶",
    xhigh: "🔥"
  };
  const effortIcon = effortIcons[effortInfo.effort] || "🔷";
  const sourceLabel = effortInfo.source === "auto-detected" ? " (自動検出)" :
                      effortInfo.source === "cli" ? " (CLI指定)" : "";

  console.error("");
  console.error("┌────────────────────────────────────────────────────────────────┐");
  console.error("│  🎭 Orchestra Delegator - MCP Protocol Bridge                  │");
  console.error("└────────────────────────────────────────────────────────────────┘");
  console.error("");
  console.error(`   📋 エージェント: ${agent.name}`);
  console.error(`   📝 タスク: ${task.slice(0, 50)}${task.length > 50 ? "..." : ""}`);
  console.error(`   🔧 モード: ${modeLabel}`);
  console.error(`   ${effortIcon} 推論レベル: ${effortInfo.effort}${sourceLabel}`);
  console.error("");
}

/**
 * Step 5: Prompt Construction
 * 7セクション構築
 */
function step5_promptConstruction(agentPrompt, mode) {
  if (values.verbose) {
    console.error(`\n📍 Step 5: Prompt Construction (7-Section Format)`);
  }

  // コンテキスト取得
  let context = "";
  if (values["context-file"] && existsSync(values["context-file"])) {
    context = readFileSync(values["context-file"], "utf-8");
  } else if (values.context) {
    context = values.context;
  }

  // 7セクションフォーマット
  const prompt = `${agentPrompt}

---

## TASK
${task}

## EXPECTED OUTCOME
タスクに応じた専門的な分析・提案を日本語で出力

## CONTEXT
${context || "(なし)"}

## CONSTRAINTS
${values.constraints || "特になし"}
モード: ${mode} ${mode === "advisory" ? "(分析・提案のみ、ファイル変更禁止)" : "(必要に応じてファイル変更可能)"}

## MUST DO
- 専門家として忖度なく分析する
- 具体的な提案・修正案を含める
- 日本語で回答する
${mode === "advisory" ? "- ファイルを変更しない（提案のみ）" : ""}

## MUST NOT DO
- 曖昧な表現で終わらない
- 問題点だけ指摘して放置しない
${mode === "advisory" ? "- ファイルを直接編集しない" : ""}

## OUTPUT FORMAT
Markdown形式で構造化された回答
`;

  if (values.verbose) {
    console.error(`   セクション: TASK, EXPECTED OUTCOME, CONTEXT, CONSTRAINTS, MUST DO, MUST NOT DO, OUTPUT FORMAT`);
    console.error(`   総サイズ: ${prompt.length} bytes`);
  }

  return { prompt, context };
}

/**
 * Step 6: Expert Invocation
 * Codex MCP呼び出し（mcp__codex__codex 相当）
 * @param {string} prompt - 構築済みプロンプト
 * @param {string} outputDir - 出力ディレクトリ
 * @param {object} effortInfo - reasoning effort 情報
 * @param {string} mode - "advisory" | "implementation"
 */
async function step6_expertInvocation(prompt, outputDir, effortInfo, mode) {
  const effortLabel = effortInfo.effort === "xhigh" ? "🔥 xhigh" : effortInfo.effort;
  const modeLabel = mode === "advisory" ? "📖 sandbox" : "✏️ bypass";
  console.error("╔════════════════════════════════════════════════════════════════╗");
  console.error(`║  🤖 Codex MCP (${CONFIG.codexModel}) [${effortLabel}] [${modeLabel}]    ║`);
  console.error("╚════════════════════════════════════════════════════════════════╝");
  console.error("");

  const tempPromptPath = join(outputDir, ".delegation-prompt-temp.md");
  writeFileSync(tempPromptPath, prompt, "utf-8");
  writeFileSync(join(outputDir, "delegation-prompt.md"), prompt, "utf-8");

  const start = Date.now();

  // xhigh の場合はタイムアウトを延長
  const effectiveTimeout = effortInfo.effort === "xhigh" ? CONFIG.codexTimeoutXhigh : CONFIG.codexTimeout;

  // プログレス表示
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const effortHint = effortInfo.effort === "xhigh" ? " [xhigh: 最大30分]" : "";
    process.stderr.write(`\r   ${frames[frameIndex++ % frames.length]} mcp__codex__codex() 実行中... ${elapsed}秒経過${effortHint}`);
  }, 100);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(progressInterval);
      process.stderr.write("\r" + " ".repeat(80) + "\r");
      reject(new Error(`Codex タイムアウト (${effectiveTimeout / 1000}秒)`));
    }, effectiveTimeout);

    try {
      // MCP Protocol Bridge: codex exec を mcp__codex__codex() として抽象化
      // [S1] execFileSync でシェル展開を回避（コマンドインジェクション対策）
      // [S2] Advisory モードでは sandbox を維持（安全性向上）
      const promptContent = readFileSync(tempPromptPath, "utf-8");

      const args = ["exec"];

      // Implementation モードのみ sandbox bypass を許可
      if (mode === "implementation") {
        args.push("--dangerously-bypass-approvals-and-sandbox");
      }

      args.push("-c", `reasoning.effort="${effortInfo.effort}"`);
      args.push("--model", CONFIG.codexModel);
      args.push(promptContent);

      const result = execFileSync("codex", args, {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
        timeout: effectiveTimeout,
        stdio: ["pipe", "pipe", "pipe"],
      });

      clearTimeout(timeout);
      clearInterval(progressInterval);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stderr.write("\r" + " ".repeat(80) + "\r");

      console.error("");
      console.error("╔════════════════════════════════════════════════════════════════╗");
      console.error(`║  ✅ mcp__codex__codex() 完了 (${elapsed}秒) [${effortInfo.effort}]     ║`);
      console.error("╚════════════════════════════════════════════════════════════════╝");
      console.error("");

      if (existsSync(tempPromptPath)) unlinkSync(tempPromptPath);

      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      process.stderr.write("\r" + " ".repeat(80) + "\r");

      console.error("");
      console.error("╔════════════════════════════════════════════════════════════════╗");
      console.error("║  ❌ mcp__codex__codex() エラー                                  ║");
      console.error("╚════════════════════════════════════════════════════════════════╝");
      console.error("");

      if (existsSync(tempPromptPath)) unlinkSync(tempPromptPath);

      reject(error);
    }
  });
}

/**
 * Step 7: Response Processing
 * 結果の合成・検証
 */
function step7_responseProcessing(result, outputDir, context, mode, effortInfo) {
  if (values.verbose) {
    console.error(`\n📍 Step 7: Response Processing`);
  }

  const effortIcons = { minimal: "⚡", low: "🔹", medium: "🔷", high: "🔶", xhigh: "🔥" };
  const effortIcon = effortIcons[effortInfo.effort] || "🔷";

  // 結果をMarkdownで保存
  const responsePath = join(outputDir, "response.md");
  writeFileSync(
    responsePath,
    `# ${agent.name} の回答

## タスク
${task}

## モード
${mode === "advisory" ? "📖 Advisory（分析・提案のみ）" : "✏️ Implementation（ファイル変更可能）"}

## 推論レベル
${effortIcon} ${effortInfo.effort} (${effortInfo.source})

---

${result}

---
*生成日時: ${new Date().toISOString()}*
*モデル: ${CONFIG.codexModel}*
*エージェント: ${agent.name}*
*推論レベル: ${effortInfo.effort}*
`,
    "utf-8"
  );
  console.error(`   💾 保存: response.md`);

  // JSON形式でも保存
  const jsonResult = {
    workflow: "7-step-delegation",
    agent: values.agent,
    agentName: agent.name,
    task,
    mode,
    reasoningEffort: effortInfo.effort,
    reasoningEffortSource: effortInfo.source,
    context: context || null,
    constraints: values.constraints || null,
    response: result,
    outputDir,
    model: CONFIG.codexModel,
    timestamp: new Date().toISOString(),
  };

  const jsonPath = join(outputDir, "result.json");
  writeFileSync(jsonPath, JSON.stringify(jsonResult, null, 2), "utf-8");
  console.error(`   💾 保存: result.json`);

  return jsonResult;
}

// ========================================
// メイン処理 - 7ステップWorkflow実行
// ========================================
async function main() {
  // 出力ディレクトリ準備
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sanitizedTask = task
    .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "-")
    .slice(0, 20);
  const defaultOutputDir = resolve(
    __dirname,
    `../output/${values.agent}-${today}-${sanitizedTask}`
  );
  const outputDir = values.output ? resolve(values.output) : defaultOutputDir;

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Step 1: Expert Identification
    step1_expertIdentification();

    // Step 2: Prompt Loading
    const agentPrompt = step2_promptLoading();

    // Step 3: Mode Selection
    const mode = step3_modeSelection();

    // Step 3.5: Reasoning Effort Detection (自動検出)
    const effortInfo = getReasoningEffort();
    if (values.verbose) {
      console.error(`\n📍 Step 3.5: Reasoning Effort Detection`);
      console.error(`   レベル: ${effortInfo.effort}`);
      console.error(`   ソース: ${effortInfo.source}`);
    }

    // Step 4: User Notification
    step4_userNotification(mode, effortInfo);

    console.error(`   🎯 出力先: ${outputDir}`);
    console.error("");

    // Step 5: Prompt Construction
    const { prompt, context } = step5_promptConstruction(agentPrompt, mode);

    // Step 6: Expert Invocation
    const result = await step6_expertInvocation(prompt, outputDir, effortInfo, mode);

    // Step 7: Response Processing
    const jsonResult = step7_responseProcessing(result, outputDir, context, mode, effortInfo);

    // 標準出力にJSON
    console.log(JSON.stringify(jsonResult, null, 2));

    console.error("");
    console.error("┌────────────────────────────────────────────────────────────────┐");
    console.error("│  🎉 7-Step Delegation Workflow 完了                            │");
    console.error("└────────────────────────────────────────────────────────────────┘");
    console.error("");

  } catch (error) {
    console.error(`❌ エラー: ${error?.message ?? error}`);

    const errorResult = {
      workflow: "7-step-delegation",
      agent: values.agent,
      task,
      error: error?.message ?? String(error),
      timestamp: new Date().toISOString(),
    };

    writeFileSync(
      join(outputDir, "error.json"),
      JSON.stringify(errorResult, null, 2),
      "utf-8"
    );

    process.exit(1);
  }
}

main();
