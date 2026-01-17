#!/bin/bash
# Orchestra Delegator - CI Setup Script
# プロジェクトにCodexレビューワークフローを追加

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKFLOW_DIR="${SCRIPT_DIR}/../.github/workflows"
TARGET_DIR="${1:-.}"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Orchestra Delegator - CI Setup                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if target is a git repo
if [ ! -d "${TARGET_DIR}/.git" ]; then
  echo "❌ エラー: ${TARGET_DIR} はgitリポジトリではありません"
  exit 1
fi

# Create .github/workflows if not exists
mkdir -p "${TARGET_DIR}/.github/workflows"

# Copy workflow
cp "${WORKFLOW_DIR}/codex-review.yml" "${TARGET_DIR}/.github/workflows/codex-review.yml"

echo "✅ ワークフローをコピーしました:"
echo "   ${TARGET_DIR}/.github/workflows/codex-review.yml"
echo ""

echo "┌────────────────────────────────────────────────────────────────┐"
echo "│  次のステップ                                                  │"
echo "└────────────────────────────────────────────────────────────────┘"
echo ""
echo "  1. GitHub Secretsに OPENAI_API_KEY を設定"
echo "     https://github.com/<owner>/<repo>/settings/secrets/actions"
echo ""
echo "  2. ワークフローをコミット"
echo "     git add .github/workflows/codex-review.yml"
echo "     git commit -m 'Add Codex review workflow'"
echo "     git push"
echo ""
echo "  3. PRを作成すると自動でCodexレビューが実行されます"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  セットアップ完了                                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
