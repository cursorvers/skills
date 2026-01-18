#!/bin/bash
# Codex Task Detection Hook
# Detects architecture/review/security prompts and suggests Codex delegation

PROMPT="$CLAUDE_USER_PROMPT"

# 設計・アーキテクチャ関連キーワード
ARCH_KEYWORDS="設計|design|アーキテクチャ|architecture|構成|structure|構造|システム設計|system design|技術選定|tech stack|パターン|pattern|モジュール|module"

# 要件・スコープ関連キーワード
SCOPE_KEYWORDS="要件|requirement|仕様|spec|specification|スコープ|scope|曖昧|ambiguous|不明確|unclear|整理|organize|分析|analyze"

# 計画関連キーワード
PLAN_KEYWORDS="計画|plan|見積|estimate|優先|priority|順番|order|ロードマップ|roadmap|スケジュール|schedule|フェーズ|phase"

# レビュー関連キーワード
REVIEW_KEYWORDS="レビュー|review|チェック|check|確認|verify|品質|quality|テスト|test|リファクタ|refactor"

# セキュリティ関連キーワード
SECURITY_KEYWORDS="セキュリティ|security|脆弱性|vulnerability|認証|auth|authentication|認可|authorization|暗号|encrypt|XSS|CSRF|SQL|injection|OWASP"

# Check for architecture design
if echo "$PROMPT" | grep -qiE "($ARCH_KEYWORDS)"; then
    echo "---"
    echo "codex_trigger: architect"
    echo "reason: 設計・アーキテクチャ判断が検出されました"
    echo "instruction: |"
    echo "  Codex (architect) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate.js -a architect -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# Check for scope/requirements analysis
if echo "$PROMPT" | grep -qiE "($SCOPE_KEYWORDS)"; then
    echo "---"
    echo "codex_trigger: scope-analyst"
    echo "reason: 要件・スコープ分析が検出されました"
    echo "instruction: |"
    echo "  Codex (scope-analyst) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate.js -a scope-analyst -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# Check for planning
if echo "$PROMPT" | grep -qiE "($PLAN_KEYWORDS)"; then
    echo "---"
    echo "codex_trigger: plan-reviewer"
    echo "reason: 計画・見積もりが検出されました"
    echo "instruction: |"
    echo "  Codex (plan-reviewer) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate.js -a plan-reviewer -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# Check for security
if echo "$PROMPT" | grep -qiE "($SECURITY_KEYWORDS)"; then
    echo "---"
    echo "codex_trigger: security-analyst"
    echo "reason: セキュリティ関連が検出されました"
    echo "instruction: |"
    echo "  Codex (security-analyst) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate.js -a security-analyst -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# Check for code review
if echo "$PROMPT" | grep -qiE "($REVIEW_KEYWORDS)"; then
    echo "---"
    echo "codex_trigger: code-reviewer"
    echo "reason: コードレビューが検出されました"
    echo "instruction: |"
    echo "  Codex (code-reviewer) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate.js -a code-reviewer -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# No trigger
exit 0
