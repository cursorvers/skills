#!/bin/bash
# ============================================
# DevContainer / Any PC セットアップスクリプト
# パス抽象化版 - ローカル依存なし
# ============================================

set -e

echo "🚀 開発環境セットアップ開始"
echo "=========================================="

# 環境検出
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
IS_DEVCONTAINER="${REMOTE_CONTAINERS:-false}"
IS_CODESPACES="${CODESPACES:-false}"

echo "📍 環境: $([ "$IS_CODESPACES" = "true" ] && echo "Codespaces" || ([ "$IS_DEVCONTAINER" = "true" ] && echo "DevContainer" || echo "ローカル"))"
echo "📁 WORKSPACE_ROOT: $WORKSPACE_ROOT"

# Claude設定ディレクトリの決定
if [ "$IS_CODESPACES" = "true" ] || [ "$IS_DEVCONTAINER" = "true" ]; then
  CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$WORKSPACE_ROOT/.claude-local}"
else
  CLAUDE_DIR="${HOME}/.claude"
fi

echo "🔧 CLAUDE_DIR: $CLAUDE_DIR"

# 1. ディレクトリ作成
echo ""
echo "📁 ディレクトリ作成..."
mkdir -p "$CLAUDE_DIR"
mkdir -p "$CLAUDE_DIR/state"
mkdir -p "$CLAUDE_DIR/memory"
mkdir -p "$CLAUDE_DIR/logs"

# 2. シンボリックリンク作成（skillsへの参照）
echo ""
echo "🔗 シンボリックリンク作成..."
if [ ! -L "$CLAUDE_DIR/skills" ]; then
  ln -sf "$WORKSPACE_ROOT" "$CLAUDE_DIR/skills"
  echo "✓ $WORKSPACE_ROOT → $CLAUDE_DIR/skills"
else
  echo "✓ skills symlink already exists"
fi

# 3. ホスト側の設定をコピー（DevContainer/Codespaces時）
if [ -d "/home/node/.claude-host" ]; then
  echo ""
  echo "📋 ホスト設定をコピー..."

  # settings.json があればコピー
  if [ -f "/home/node/.claude-host/settings.json" ]; then
    cp "/home/node/.claude-host/settings.json" "$CLAUDE_DIR/"
    echo "✓ settings.json copied"
  fi

  # memory/ があればコピー
  if [ -d "/home/node/.claude-host/memory" ]; then
    cp -r "/home/node/.claude-host/memory/"* "$CLAUDE_DIR/memory/" 2>/dev/null || true
    echo "✓ memory/ synced"
  fi
fi

# 4. npm依存関係インストール
echo ""
echo "📦 npm依存関係インストール..."
if [ -f "$WORKSPACE_ROOT/package.json" ]; then
  cd "$WORKSPACE_ROOT" && npm install --silent
  echo "✓ npm install完了"
fi

# 5. 環境変数チェック
echo ""
echo "⚙️  環境変数チェック..."
check_env() {
  if [ -n "${!1}" ]; then
    echo "✓ $1: 設定済み"
  else
    echo "⚠️ $1: 未設定"
  fi
}
check_env "ZAI_API_KEY"
check_env "GEMINI_API_KEY"
check_env "OPENAI_API_KEY"

# 6. 完了
echo ""
echo "=========================================="
echo "✅ セットアップ完了!"
echo ""
echo "構成:"
echo "  WORKSPACE_ROOT:  $WORKSPACE_ROOT"
echo "  CLAUDE_DIR:      $CLAUDE_DIR"
echo "  skills symlink:  $CLAUDE_DIR/skills"
echo ""
echo "次のステップ:"
if [ -z "${ZAI_API_KEY}" ] || [ -z "${GEMINI_API_KEY}" ]; then
  echo "  1. 環境変数を設定（.envファイルまたはシークレット）"
  echo "  2. コンテナを再起動"
else
  echo "  ✓ すぐに開発を開始できます"
fi
echo ""
