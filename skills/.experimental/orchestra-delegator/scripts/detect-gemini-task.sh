#!/bin/bash
# Gemini Task Detection Hook
# Detects design/image-related prompts and suggests Gemini delegation

PROMPT="$CLAUDE_USER_PROMPT"

# デザイン・UI関連キーワード
DESIGN_KEYWORDS="デザイン|design|UI|UX|レイアウト|layout|配色|カラー|color|フォント|font|余白|margin|padding|アクセシビリティ|a11y|accessibility|見た目|見栄え|美しい|きれい|使いやすさ|ユーザビリティ|usability"

# 画像関連キーワード
IMAGE_KEYWORDS="画像|image|スクリーンショット|screenshot|写真|photo|イメージ|img|png|jpg|jpeg|gif|svg|アイコン|icon|ロゴ|logo|バナー|banner|サムネイル|thumbnail"

# レビュー関連キーワード
REVIEW_KEYWORDS="レビュー|review|チェック|check|確認|評価|分析|analyze|analysis|改善|improve"

# 画像ファイルパスパターン
IMAGE_PATH_PATTERN="\.(png|jpg|jpeg|gif|svg|webp)([\"'\s]|$)"

# Check for design + review combination
if echo "$PROMPT" | grep -qiE "($DESIGN_KEYWORDS).*($REVIEW_KEYWORDS)|($REVIEW_KEYWORDS).*($DESIGN_KEYWORDS)"; then
    echo "---"
    echo "gemini_trigger: ui-reviewer"
    echo "reason: デザイン/UIレビューが検出されました"
    echo "instruction: |"
    echo "  Gemini (ui-reviewer) に自動委任してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-gemini.js -a ui-reviewer -t \"<タスク>\" [-i <画像パス>]"
    echo "---"
    exit 0
fi

# Check for image analysis
if echo "$PROMPT" | grep -qiE "($IMAGE_KEYWORDS).*($REVIEW_KEYWORDS)|($REVIEW_KEYWORDS).*($IMAGE_KEYWORDS)"; then
    echo "---"
    echo "gemini_trigger: image-analyst"
    echo "reason: 画像分析が検出されました"
    echo "instruction: |"
    echo "  Gemini (image-analyst) に自動委任してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-gemini.js -a image-analyst -t \"<タスク>\" -i <画像パス>"
    echo "---"
    exit 0
fi

# Check for image file paths in prompt
if echo "$PROMPT" | grep -qiE "$IMAGE_PATH_PATTERN"; then
    echo "---"
    echo "gemini_trigger: image-analyst"
    echo "reason: 画像ファイルパスが検出されました"
    echo "instruction: |"
    echo "  画像が指定されています。Gemini (image-analyst) への委任を検討してください："
    echo "  node ~/.claude/skills/orchestra-delegator/scripts/delegate-gemini.js -a image-analyst -t \"<タスク>\" -i <画像パス>"
    echo "---"
    exit 0
fi

# No trigger
exit 0
