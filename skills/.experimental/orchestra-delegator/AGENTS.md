# AGENTS.md - Orchestra Delegator

このファイルはAIコーディングエージェント向けのプロジェクトコンテキストです。

## プロジェクト概要

Orchestra Delegatorは、Claude Codeを中心としたマルチエージェントオーケストレーションシステムです。
Codex MCP（GPT-5.2）を活用し、5つの専門エージェントにタスクを委任します。

## ディレクトリ構成

```
orchestra-delegator/
├── AGENTS.md              # このファイル（AIエージェント向けコンテキスト）
├── SKILL.md               # Claude Codeスキル定義
├── scripts/
│   ├── delegate.js        # Codex MCP委任スクリプト
│   └── prompts/           # 専門エージェントプロンプト
│       ├── architect.md
│       ├── plan-reviewer.md
│       ├── scope-analyst.md
│       ├── code-reviewer.md
│       └── security-analyst.md
└── output/                # 委任結果の出力先
```

## 技術スタック

- **オーケストレーター**: Claude Code (Claude Opus)
- **専門エージェント**: Codex CLI (GPT-5.2)
- **言語**: Node.js (ESM)
- **MCP**: Codex MCP Server

## ビルド・実行コマンド

```bash
# 依存関係インストール
npm install

# 単一エージェント委任
node scripts/delegate.js --agent architect --task "設計タスク"

# コンテキスト付き委任
node scripts/delegate.js --agent code-reviewer --task "レビュー" --context-file context.md
```

## 環境変数

```bash
# .env
OPENAI_API_KEY=sk-...  # Codex用
```

## 専門エージェント一覧

| エージェント | 用途 | プロンプトファイル |
|-------------|------|-------------------|
| architect | システム設計 | prompts/architect.md |
| plan-reviewer | 計画検証 | prompts/plan-reviewer.md |
| scope-analyst | スコープ分析 | prompts/scope-analyst.md |
| code-reviewer | コードレビュー | prompts/code-reviewer.md |
| security-analyst | セキュリティ分析 | prompts/security-analyst.md |

## 委任フォーマット（7セクション）

すべての委任は以下の形式を使用：

```markdown
## TASK
[具体的なタスク]

## EXPECTED OUTCOME
[期待する成果物]

## CONTEXT
[背景情報]

## CONSTRAINTS
[制約条件]

## MUST DO
[必須事項]

## MUST NOT DO
[禁止事項]

## OUTPUT FORMAT
[出力形式]
```

## 注意事項

- 各委任は**ステートレス**（前回の会話を記憶しない）
- 必要な情報は全てCONTEXTセクションに含める
- 長いコンテキストは `--context-file` で渡す
