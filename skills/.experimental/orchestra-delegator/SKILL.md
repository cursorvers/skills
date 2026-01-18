---
name: orchestra-delegator
description: Codex MCP (GPT-5.2) + GLM-4.7 + Gemini 3 Pro を使った専門エージェントへのタスク委任オーケストレーター。GitHub Actionsで自動レビュー。「Codexに委任」「GLMに委任」「専門家に相談」「オーケストラ」で発動。
---

# Orchestra Delegator

Codex (GPT-5.2) + **GLM-4.7** + Gemini 3 Pro に専門家として委任するスキル。

---

## 委譲先の役割分担

| 委譲先 | モデル | 用途 | 並列数 |
|--------|--------|------|--------|
| **GLM-4.7** | glm-4.7 | コードレビュー、数学、汎用分析 | **7並列（安定上限）** |
| **Codex** | GPT-5.2 | 設計、セキュリティ、要件分析 | - |
| **Gemini** | gemini-3-pro | UI/UXデザインレビュー | 制限あり |

**コスト最適化**: 軽量タスクは GLM-4.7 に優先委譲（月$15で高頻度利用可能）

---

## GLM-4.7 委譲（推奨）

**スクリプト:** `scripts/delegate-glm.js`

```bash
node ~/.claude/skills/orchestra-delegator/scripts/delegate-glm.js \
  -a <agent> -t "<task>" [-f <file>] [--thinking]
```

**エージェント:**
| エージェント | 用途 |
|-------------|------|
| `code-reviewer` | コード品質レビュー（7点満点） |
| `general-reviewer` | 汎用レビュー |
| `math-reasoning` | 数学・アルゴリズム検証 |
| `refactor-advisor` | リファクタリング提案 |

**環境変数:** `ZAI_API_KEY` （必須）

---

## 委譲の原則

**Stateless**: 各呼び出しは独立。Codexは前の会話を知らない。
**Context-complete**: 必要な情報は全てプロンプトに含める。

### 7セクション形式

Codexに渡すプロンプトは以下の構造で構築:

| セクション | 内容 |
|-----------|------|
| TASK | 単一の明確なゴール |
| EXPECTED OUTCOME | 成功の定義 |
| CONTEXT | コード、diff、背景情報 |
| CONSTRAINTS | 技術制約、既存パターン |
| MUST DO | 必須事項 |
| MUST NOT DO | 禁止事項 |
| OUTPUT FORMAT | JSON等の出力形式 |

---

## Codex活用の原則

Codexは「もう一人の専門家」。**Claude Codeが自律的に判断し、自動で委任する。**

### 自動委任する（確認不要）
- 第三者の視点が欲しい時
- 専門的な分析が必要な時
- 判断に自信がない時
- 調査に時間がかかりそうな時
- コミット前のレビュー

### 委任しない
- 単純なファイル操作
- 軽微な修正（typo、1行変更等）
- ユーザーとの対話

**閾値は低め。ただし不要な時は使わない。Claude Codeが自動判断。**
**GPT Pro契約済み、コスト気にせず活用。**

---

## 自動実行ルール

Claude Codeは以下を**自動実行**する（ユーザー確認不要）:

| トリガー | 実行内容 | エージェント |
|---------|---------|-------------|
| コミット前 | レビュー自動実行 | Code Reviewer + Security |
| 大きな変更 | レビュー自動実行 | Code Reviewer |
| 設計判断時 | 設計相談 | Architect |
| 要件が曖昧 | スコープ分析 | Scope Analyst |
| 計画立案後 | 計画検証 | Plan Reviewer |

**実行後、結果をユーザーに報告。**

---

## 呼び出し方法

**MCP経由:**
```
mcp__codex__codex({ prompt: "..." })
```

**CLI経由:**
```bash
codex exec "プロンプト"
```

---

## Scope Analyst（要件分析）

**いつ使う:** 「〜したい」「改善したい」「要件を整理」

**プロンプト:**
```
あなたはScope Analystです。要件の曖昧さを特定し、スコープを明確化します。

## 必ずやること
- 曖昧な点を質問形式でリストアップ
- IN SCOPE / OUT OF SCOPE / DEFERRED を明示
- 意図分類（リファクタリング/新規構築/バグ修正/機能拡張）

## 出力形式
### 意図分類
### 明確な点
### 曖昧な点（表形式）
### 確認すべき質問（優先度順）
### スコープ定義案

## タスク
{ユーザーの要求}
```

---

## Architect（設計）

**いつ使う:** 「設計して」「アーキテクチャ」「構成を考えて」

**プロンプト:**
```
あなたはArchitectです。システム設計の専門家として提案します。

## 必ずやること
- 複数の選択肢を提示（トレードオフ付き）
- 図解（Mermaid形式）を含める
- 非機能要件（スケーラビリティ、保守性）を考慮

## 禁止
- 1つの案だけ提示して終わる
- 実装詳細に踏み込みすぎる

## 出力形式
### 要件の理解
### 設計案（複数）
### 比較表
### 推奨案と理由
### 次のステップ

## タスク
{設計対象}
```

---

## Plan Reviewer（計画検証）

**いつ使う:** 計画立案後、「この計画をチェック」

**プロンプト:**
```
あなたはPlan Reviewerです。実装計画の妥当性を検証します。

## 必ずやること
- 抜け漏れの指摘
- リスクの洗い出し
- 依存関係の確認
- 優先順位の妥当性評価

## 出力形式
### 計画の概要（理解確認）
### 良い点
### 懸念点・リスク
### 抜け漏れ
### 改善提案

## 対象計画
{計画内容}
```

---

## Code Reviewer（コード品質）

**いつ使う:** 「レビューして」「PRチェック」「コミット前」

**プロンプト:**
```
あなたはCode Reviewerです。以下の観点でレビューします。

## 評価観点（7点満点）
- 正確性 (3点): バグ、ロジックエラー、エッジケース
- パフォーマンス (2点): N+1、不要な計算、メモリ
- 保守性 (2点): 可読性、命名、DRY

## 出力形式（JSON）
{
  "scores": { "accuracy": 0-3, "performance": 0-2, "maintainability": 0-2 },
  "total": 0-7,
  "issues": [{ "severity": "critical|major|minor", "file": "", "line": "", "description": "", "suggestion": "" }],
  "summary": ""
}

## 対象コード
{diff または コード}
```

---

## Security Analyst（セキュリティ）

**いつ使う:** 「セキュリティチェック」「脆弱性」「コミット前」

**プロンプト:**
```
あなたはSecurity Analystです。OWASP Top 10を参考に分析します。

## チェック項目
- SQLインジェクション
- XSS
- CSRF
- 認証・認可の不備
- 機密情報のハードコード
- コマンドインジェクション

## 評価（3点満点）
3点: 問題なし
2点: 軽微な懸念
1点: 要対応
0点: 重大な脆弱性

## 出力形式（JSON）
{
  "score": 0-3,
  "vulnerabilities": [{ "severity": "critical|high|medium|low", "type": "", "description": "", "remediation": "" }],
  "summary": ""
}

## 対象コード
{diff または コード}
```

---

## 並列実行の方法

**Claude Codeは並列が必要な時、自動でSubagentを使用する。**

### 並列実行するケース
- Code Reviewer + Security Analyst（コミット前）
- 複数エージェントへの同時委任
- 時間がかかる調査を複数実行

### 使用方法
`Task({ run_in_background: true })` で並列実行。
結果は `TaskOutput` で取得。

---

## コミット前レビュー

「コミット」検出時、Code Reviewer + Security Analyst を**自動で並列実行**。

### 実行コード

```javascript
// 1. git diff 取得
const diff = Bash("git diff --cached")

// 2. 並列でCodex呼び出し
Task({
  subagent_type: "Bash",
  description: "Code Review",
  prompt: `codex exec "Code Reviewerとして評価。JSON出力。\n${diff}"`,
  run_in_background: true
})

Task({
  subagent_type: "Bash",
  description: "Security Analysis",
  prompt: `codex exec "Security Analystとして評価。JSON出力。\n${diff}"`,
  run_in_background: true
})

// 3. 結果を待って合議スコア算出
```

### 合議スコア

Code Reviewer (7点) + Security Analyst (3点) = **10点満点**

| スコア | 判定 |
|--------|------|
| 9-10 | 承認推奨 |
| 7-8 | 承認可 |
| 5-6 | 修正推奨 |
| 0-4 | 修正必須 |

**結果表示後、ユーザー承認を待つ。**

---

## GitHub Actions

PR作成時は `.github/workflows/codex-review.yml` が自動実行。
設定: `OPENAI_API_KEY` を GitHub Secrets に登録。

---

## Gemini 3 Pro 統合

### 利用可能なエージェント

| エージェント | 用途 | モデル |
|-------------|------|--------|
| ui-reviewer | UI/UXデザインレビュー | gemini-3-pro-preview |
| image-analyst | 画像分析 | gemini-3-pro-preview |

### 自動委任トリガー

以下のキーワードが検出されると、Gemini委任が提案される:

- **デザイン/UI系**: デザイン, UI, UX, レイアウト, 配色, フォント, アクセシビリティ
- **画像系**: 画像, スクリーンショット, 写真, アイコン, ロゴ
- **ファイル拡張子**: .png, .jpg, .jpeg, .gif, .svg, .webp

### 呼び出し方法

```bash
# UI/UXレビュー
node ~/.claude/skills/orchestra-delegator/scripts/delegate-gemini.js \
  -a ui-reviewer -t "このデザインをレビュー" [-i image.png]

# 画像分析
node ~/.claude/skills/orchestra-delegator/scripts/delegate-gemini.js \
  -a image-analyst -t "この画像を分析" -i image.jpg
```

### 環境変数

`GEMINI_API_KEY` または `GOOGLE_API_KEY` が必要。
