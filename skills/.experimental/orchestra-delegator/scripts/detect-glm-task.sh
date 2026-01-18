#!/bin/bash
# GLM-4.7 Task Detection Hook
# Detects code-review and general tasks, suggests GLM-4.7 delegation
# Priority: GLM > Codex (cost optimization)

PROMPT="$CLAUDE_USER_PROMPT"

# ========================================
# GLM-4.7 優先キーワード（コスト効率のため最初にチェック）
# ========================================

# コードレビュー関連（GLM優先）
GLM_REVIEW_KEYWORDS="コードレビュー|code review|レビューして|チェックして|確認して|見て|品質|quality"

# リファクタリング関連（GLM優先）
GLM_REFACTOR_KEYWORDS="リファクタ|refactor|整理|cleanup|きれいに|改善|improve|最適化|optimize"

# 数学・ロジック関連（GLM得意）
GLM_MATH_KEYWORDS="計算|calculation|アルゴリズム|algorithm|ロジック|logic|数学|math|パフォーマンス|performance|計算量|complexity"

# 汎用分析（GLM優先）
GLM_GENERAL_KEYWORDS="分析して|analyze|説明して|explain|何が|what|どうして|why|比較|compare"

# ========================================
# Codex 専用キーワード（GLMでは難しいもの）
# ========================================

# 設計・アーキテクチャ（Codex専用）
CODEX_ARCH_KEYWORDS="設計|design|アーキテクチャ|architecture|システム設計|system design|技術選定|tech stack"

# セキュリティ（Codex専用）
CODEX_SECURITY_KEYWORDS="セキュリティ|security|脆弱性|vulnerability|認証|auth|XSS|CSRF|SQL|injection|OWASP"

# 要件・スコープ（Codex専用）
CODEX_SCOPE_KEYWORDS="要件定義|requirement|仕様策定|スコープ|scope定義"

# ========================================
# 判定ロジック（GLM優先）
# ========================================

# まず Codex 専用タスクかチェック（これらは GLM に回さない）
if echo "$PROMPT" | grep -qiE "($CODEX_ARCH_KEYWORDS)"; then
    # 設計タスク → Codex（設計はCodexの専門）
    exit 0
fi

if echo "$PROMPT" | grep -qiE "($CODEX_SECURITY_KEYWORDS)"; then
    # セキュリティタスク → Codex（セキュリティはCodexの専門）
    exit 0
fi

if echo "$PROMPT" | grep -qiE "($CODEX_SCOPE_KEYWORDS)"; then
    # 要件定義タスク → Codex
    exit 0
fi

# ========================================
# GLM-4.7 に委譲（コスト効率優先）
# ========================================

# コードレビュー → GLM
if echo "$PROMPT" | grep -qiE "($GLM_REVIEW_KEYWORDS)"; then
    echo "---"
    echo "glm_trigger: code-reviewer"
    echo "reason: コードレビューを検出 → GLM-4.7 に委譲（コスト効率優先）"
    echo "instruction: |"
    echo "  GLM-4.7 (code-reviewer) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-glm.js -a code-reviewer -t \"<タスク>\" [-f <ファイル>]"
    echo "  "
    echo "  思考モード有効化: --thinking オプションを追加"
    echo "---"
    exit 0
fi

# リファクタリング提案 → GLM
if echo "$PROMPT" | grep -qiE "($GLM_REFACTOR_KEYWORDS)"; then
    echo "---"
    echo "glm_trigger: refactor-advisor"
    echo "reason: リファクタリングを検出 → GLM-4.7 に委譲"
    echo "instruction: |"
    echo "  GLM-4.7 (refactor-advisor) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-glm.js -a refactor-advisor -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# 数学・アルゴリズム → GLM（得意分野）
if echo "$PROMPT" | grep -qiE "($GLM_MATH_KEYWORDS)"; then
    echo "---"
    echo "glm_trigger: math-reasoning"
    echo "reason: 数学/アルゴリズムを検出 → GLM-4.7 に委譲（得意分野）"
    echo "instruction: |"
    echo "  GLM-4.7 (math-reasoning) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-glm.js -a math-reasoning -t \"<タスク>\" [-f <ファイル>] --thinking"
    echo "---"
    exit 0
fi

# 汎用分析 → GLM
if echo "$PROMPT" | grep -qiE "($GLM_GENERAL_KEYWORDS)"; then
    echo "---"
    echo "glm_trigger: general-reviewer"
    echo "reason: 汎用分析を検出 → GLM-4.7 に委譲"
    echo "instruction: |"
    echo "  GLM-4.7 (general-reviewer) に委譲してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-glm.js -a general-reviewer -t \"<タスク>\" [-f <ファイル>]"
    echo "---"
    exit 0
fi

# No trigger
exit 0
