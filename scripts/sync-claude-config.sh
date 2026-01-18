#!/bin/bash
# ============================================
# Claude Config 同期スクリプト
# 複数PC間で .claude/ 設定を同期
# ============================================

set -e

echo "🔄 Claude Config 同期"
echo "=========================================="

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# パス設定
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/Dev/skills}"
HARNESS_DIR="${HARNESS_DIR:-$HOME/.claude/harness}"

# 操作モード
MODE="${1:-status}"

show_help() {
  echo "使い方: $0 [コマンド]"
  echo ""
  echo "コマンド:"
  echo "  status    現在の同期状態を表示（デフォルト）"
  echo "  pull      リモートから最新を取得"
  echo "  push      ローカル変更をリモートにプッシュ"
  echo "  setup     新しいPCで初期セットアップ"
  echo "  diff      未コミットの変更を表示"
  echo ""
}

# リポジトリの状態確認
check_repo_status() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir/.git" ]; then
    echo -e "${RED}✗ $name: 未クローン${NC}"
    return 1
  fi

  cd "$dir"
  local branch=$(git branch --show-current 2>/dev/null || echo "detached")
  local status=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  local ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
  local behind=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")

  if [ "$status" -gt 0 ]; then
    echo -e "${YELLOW}⚠ $name: ${status}件の変更あり (${branch})${NC}"
  elif [ "$ahead" != "0" ] && [ "$ahead" != "?" ]; then
    echo -e "${CYAN}↑ $name: ${ahead}件のコミットをプッシュ待ち (${branch})${NC}"
  elif [ "$behind" != "0" ] && [ "$behind" != "?" ]; then
    echo -e "${CYAN}↓ $name: ${behind}件のコミットをプル待ち (${branch})${NC}"
  else
    echo -e "${GREEN}✓ $name: 同期済み (${branch})${NC}"
  fi
}

# 同期対象のリポジトリ
REPOS=(
  "$CLAUDE_DIR:claude-config"
  "$SKILLS_DIR:skills"
  "$HARNESS_DIR:harness"
)

case $MODE in
  status)
    echo ""
    echo "📊 同期状態:"
    for repo_info in "${REPOS[@]}"; do
      dir="${repo_info%%:*}"
      name="${repo_info##*:}"
      check_repo_status "$dir" "$name"
    done
    echo ""
    ;;

  pull)
    echo ""
    echo "📥 リモートから取得:"
    for repo_info in "${REPOS[@]}"; do
      dir="${repo_info%%:*}"
      name="${repo_info##*:}"
      if [ -d "$dir/.git" ]; then
        echo -n "  $name: "
        cd "$dir"
        if git pull --ff-only 2>/dev/null; then
          echo -e "${GREEN}更新完了${NC}"
        else
          echo -e "${YELLOW}マージが必要（手動で解決してください）${NC}"
        fi
      else
        echo -e "  $name: ${RED}スキップ（未クローン）${NC}"
      fi
    done
    echo ""
    ;;

  push)
    echo ""
    echo "📤 リモートにプッシュ:"
    for repo_info in "${REPOS[@]}"; do
      dir="${repo_info%%:*}"
      name="${repo_info##*:}"
      if [ -d "$dir/.git" ]; then
        cd "$dir"
        local_changes=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
        if [ "$local_changes" -gt 0 ]; then
          echo -e "  $name: ${YELLOW}未コミットの変更があります。先にコミットしてください${NC}"
        else
          echo -n "  $name: "
          if git push 2>/dev/null; then
            echo -e "${GREEN}プッシュ完了${NC}"
          else
            echo -e "${YELLOW}プッシュ失敗（権限またはリモート設定を確認）${NC}"
          fi
        fi
      else
        echo -e "  $name: ${RED}スキップ（未クローン）${NC}"
      fi
    done
    echo ""
    ;;

  setup)
    echo ""
    echo "🛠  初期セットアップ:"
    echo ""

    # SSH接続テスト
    USE_HTTPS=false
    if ! ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
      echo -e "${YELLOW}⚠️ SSH認証失敗。HTTPSを使用します。${NC}"
      USE_HTTPS=true
    fi

    clone_repo() {
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
        echo -e "  $repo: ${GREEN}既存${NC}"
      fi
    }

    # claude-config
    clone_repo "claude-config" "$CLAUDE_DIR"

    # skills
    clone_repo "skills" "$SKILLS_DIR"

    # harness
    clone_repo "claude-code-harness" "$HARNESS_DIR"

    # シンボリックリンク
    echo ""
    echo "🔗 シンボリックリンク作成:"
    if [ ! -L "$CLAUDE_DIR/skills" ]; then
      ln -sf "$SKILLS_DIR" "$CLAUDE_DIR/skills"
      echo -e "  ${GREEN}✓${NC} skills → $CLAUDE_DIR/skills"
    else
      echo -e "  ${GREEN}✓${NC} skills symlink 既存"
    fi

    echo ""
    echo -e "${GREEN}✅ セットアップ完了！${NC}"
    echo ""
    ;;

  diff)
    echo ""
    echo "📝 未コミットの変更:"
    for repo_info in "${REPOS[@]}"; do
      dir="${repo_info%%:*}"
      name="${repo_info##*:}"
      if [ -d "$dir/.git" ]; then
        cd "$dir"
        local_changes=$(git status --porcelain 2>/dev/null)
        if [ -n "$local_changes" ]; then
          echo ""
          echo -e "${CYAN}[$name]${NC}"
          echo "$local_changes"
        fi
      fi
    done
    echo ""
    ;;

  help|--help|-h)
    show_help
    ;;

  *)
    echo -e "${RED}不明なコマンド: $MODE${NC}"
    show_help
    exit 1
    ;;
esac
