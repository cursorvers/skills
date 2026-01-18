#!/bin/bash
# ============================================
# Cursorvers 汎用開発環境セットアップスクリプト
# どのPCでも動作するパス抽象化版
# ============================================

set -e

echo "🚀 Cursorvers 開発環境セットアップ開始"
echo "=========================================="

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 環境検出
detect_environment() {
  if [ -n "$CODESPACES" ]; then
    echo "codespaces"
  elif [ -n "$REMOTE_CONTAINERS" ]; then
    echo "devcontainer"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

ENV_TYPE=$(detect_environment)
echo "📍 検出環境: $ENV_TYPE"

# パス設定（環境に応じて抽象化）
case $ENV_TYPE in
  codespaces|devcontainer)
    DEV_ROOT="${WORKSPACE_ROOT:-/workspaces}"
    CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$DEV_ROOT/.claude-local}"
    ;;
  macos|linux)
    DEV_ROOT="${DEV_ROOT:-$HOME/Dev}"
    CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
    ;;
  *)
    DEV_ROOT="$HOME/Dev"
    CLAUDE_DIR="$HOME/.claude"
    ;;
esac

SKILLS_DIR="${SKILLS_DIR:-$DEV_ROOT/skills}"

echo "📁 DEV_ROOT: $DEV_ROOT"
echo "📁 SKILLS_DIR: $SKILLS_DIR"
echo "🔧 CLAUDE_DIR: $CLAUDE_DIR"

# 1. ディレクトリ作成
echo ""
echo "📁 ディレクトリ作成..."
mkdir -p "$DEV_ROOT"
mkdir -p "$CLAUDE_DIR"
mkdir -p "$CLAUDE_DIR/state"
mkdir -p "$CLAUDE_DIR/memory"
mkdir -p "$CLAUDE_DIR/logs"

# 2. GitHub認証確認（ローカルのみ）
if [ "$ENV_TYPE" = "macos" ] || [ "$ENV_TYPE" = "linux" ]; then
  echo ""
  echo "🔐 GitHub認証確認..."
  if command -v gh &> /dev/null; then
    if ! gh auth status &>/dev/null; then
      echo -e "${YELLOW}GitHub CLIにログインしてください:${NC}"
      gh auth login
    else
      echo -e "${GREEN}✓ GitHub認証済み${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️ GitHub CLI未インストール。手動でgit cloneしてください${NC}"
  fi
fi

# 3. リポジトリのクローン/更新
echo ""
echo "📥 リポジトリ確認..."

# SSH接続テスト（共通）
USE_HTTPS=false
if ! ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo -e "${YELLOW}⚠️ SSH認証失敗。HTTPSを使用します。${NC}"
  USE_HTTPS=true
fi

# クローン用関数
clone_or_update_repo() {
  local repo=$1
  local dest=$2
  local ssh_url="git@github.com:cursorvers/${repo}.git"
  local https_url="https://github.com/cursorvers/${repo}.git"

  if [ ! -d "${dest}/.git" ]; then
    [ -d "$dest" ] && rm -rf "$dest"
    echo -n "  クローン中: $repo → $dest ... "
    if [ "$USE_HTTPS" = true ]; then
      git clone --quiet "$https_url" "$dest"
    else
      git clone --quiet "$ssh_url" "$dest" 2>/dev/null || git clone --quiet "$https_url" "$dest"
    fi
    echo -e "${GREEN}完了${NC}"
  else
    echo -n "  更新中: $repo ... "
    cd "$dest" && git pull --ff-only --quiet 2>/dev/null && echo -e "${GREEN}完了${NC}" || echo -e "${YELLOW}スキップ${NC}"
  fi
}

# ローカル環境の場合は全リポジトリをセットアップ
if [ "$ENV_TYPE" = "macos" ] || [ "$ENV_TYPE" = "linux" ]; then
  # claude-config → ~/.claude
  clone_or_update_repo "claude-config" "$CLAUDE_DIR"

  # skills → ~/Dev/skills
  clone_or_update_repo "skills" "$SKILLS_DIR"

  # harness → ~/.claude/harness
  HARNESS_DIR="$CLAUDE_DIR/harness"
  clone_or_update_repo "claude-code-harness" "$HARNESS_DIR"
else
  # DevContainer/Codespaces の場合は skills のみ
  if [ ! -d "$SKILLS_DIR/.git" ]; then
    clone_or_update_repo "skills" "$SKILLS_DIR"
  else
    echo -e "${GREEN}✓ skills already exists${NC}"
  fi
fi

# 4. シンボリックリンク作成
echo ""
echo "🔗 シンボリックリンク作成..."
if [ ! -L "$CLAUDE_DIR/skills" ]; then
  ln -sf "$SKILLS_DIR" "$CLAUDE_DIR/skills"
  echo -e "${GREEN}✓ $SKILLS_DIR → $CLAUDE_DIR/skills${NC}"
else
  echo -e "${GREEN}✓ skills symlink already exists${NC}"
fi

# 5. npm依存関係インストール
echo ""
echo "📦 npm依存関係インストール..."
if [ -f "$SKILLS_DIR/package.json" ]; then
  cd "$SKILLS_DIR" && npm install --silent 2>/dev/null || npm install
  echo -e "${GREEN}✓ npm install完了${NC}"
fi

# 6. 環境変数チェック
echo ""
echo "⚙️  環境変数チェック..."
check_env() {
  if [ -n "${!1}" ]; then
    echo -e "${GREEN}✓ $1: 設定済み${NC}"
    return 0
  else
    echo -e "${YELLOW}⚠️ $1: 未設定${NC}"
    return 1
  fi
}

MISSING_VARS=0
check_env "ZAI_API_KEY" || MISSING_VARS=$((MISSING_VARS + 1))
check_env "GEMINI_API_KEY" || MISSING_VARS=$((MISSING_VARS + 1))
check_env "OPENAI_API_KEY" || MISSING_VARS=$((MISSING_VARS + 1))

# 7. 完了
echo ""
echo "=========================================="
echo -e "${GREEN}✅ セットアップ完了!${NC}"
echo ""
echo "構成:"
echo "  DEV_ROOT:        $DEV_ROOT"
echo "  SKILLS_DIR:      $SKILLS_DIR"
echo "  CLAUDE_DIR:      $CLAUDE_DIR"
echo ""

if [ $MISSING_VARS -gt 0 ]; then
  echo "次のステップ:"
  echo "  1. 環境変数を設定:"
  echo "     export ZAI_API_KEY=\"your-key\""
  echo "     export GEMINI_API_KEY=\"your-key\""
  echo "     export OPENAI_API_KEY=\"your-key\""
  echo ""
  echo "  2. ~/.zshrc または ~/.bashrc に追加"
  echo "  3. source ~/.zshrc を実行"
else
  echo -e "${GREEN}✓ すぐに開発を開始できます${NC}"
fi
echo ""
