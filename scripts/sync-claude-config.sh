#!/bin/bash
# ============================================
# Claude Config 同期スクリプト
# 複数PC間で .claude/ 設定を同期
# ============================================

set -euo pipefail

echo "🔄 Claude Config 同期"
echo "=========================================="

# カラー定義
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# パス設定
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/Dev/skills}"
HARNESS_DIR="${HARNESS_DIR:-$HOME/.claude/harness}"

# 操作モード
MODE="${1:-status}"

# GitHub組織名（環境変数で上書き可能）
GITHUB_ORG="${GITHUB_ORG:-cursorvers}"

# SSH/HTTPS フラグ
USE_HTTPS=false

# ============================================
# ユーティリティ関数
# ============================================

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

# パス検証（rm -rf の前に必ず呼び出す）
validate_path() {
  local path="$1"
  local description="${2:-path}"

  # 空文字チェック
  if [ -z "$path" ]; then
    echo -e "${RED}エラー: ${description} が空です${NC}" >&2
    return 1
  fi

  # ルートディレクトリチェック
  if [ "$path" = "/" ]; then
    echo -e "${RED}エラー: ${description} がルートディレクトリです${NC}" >&2
    return 1
  fi

  # ホームディレクトリ直下チェック
  if [ "$path" = "$HOME" ]; then
    echo -e "${RED}エラー: ${description} がホームディレクトリです${NC}" >&2
    return 1
  fi

  # 重要なシステムディレクトリチェック
  case "$path" in
    /bin|/sbin|/usr|/etc|/var|/tmp|/opt|/System|/Library)
      echo -e "${RED}エラー: ${description} がシステムディレクトリです${NC}" >&2
      return 1
      ;;
  esac

  # 最低限のパス深度チェック（$HOME/xxx 以上の深さが必要）
  local depth
  depth=$(echo "$path" | tr '/' '\n' | grep -c .)
  if [ "$depth" -lt 3 ]; then
    echo -e "${RED}エラー: ${description} のパスが浅すぎます: $path${NC}" >&2
    return 1
  fi

  return 0
}

# SSH認証チェック
check_ssh_auth() {
  if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    return 0
  else
    return 1
  fi
}

# リポジトリの状態確認
check_repo_status() {
  local dir="$1"
  local name="$2"

  if [ ! -d "$dir/.git" ]; then
    echo -e "${RED}✗ $name: 未クローン${NC}"
    return 1
  fi

  cd "$dir"
  local branch
  branch=$(git branch --show-current 2>/dev/null || echo "detached")
  local status
  status=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  local ahead
  ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
  local behind
  behind=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")

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

# リポジトリをクローン
clone_repo() {
  local repo="$1"
  local dest="$2"
  local ssh_url="git@github.com:${GITHUB_ORG}/${repo}.git"
  local https_url="https://github.com/${GITHUB_ORG}/${repo}.git"

  if [ ! -d "${dest}/.git" ]; then
    # 既存ディレクトリがある場合は削除（パス検証必須）
    if [ -d "$dest" ]; then
      if ! validate_path "$dest" "クローン先"; then
        echo -e "${RED}エラー: 安全でないパスのため削除をスキップ${NC}" >&2
        return 1
      fi
      rm -rf "$dest"
    fi

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

# リポジトリに対して操作を実行
for_each_repo() {
  local callback="$1"
  for repo_info in "${REPOS[@]}"; do
    local dir="${repo_info%%:*}"
    local name="${repo_info##*:}"
    "$callback" "$dir" "$name"
  done
}

# pull操作
do_pull() {
  local dir="$1"
  local name="$2"
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
}

# push操作
do_push() {
  local dir="$1"
  local name="$2"
  if [ -d "$dir/.git" ]; then
    cd "$dir"
    local local_changes
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
}

# diff操作
do_diff() {
  local dir="$1"
  local name="$2"
  if [ -d "$dir/.git" ]; then
    cd "$dir"
    local local_changes
    local_changes=$(git status --porcelain 2>/dev/null)
    if [ -n "$local_changes" ]; then
      echo ""
      echo -e "${CYAN}[$name]${NC}"
      echo "$local_changes"
    fi
  fi
}

# ============================================
# 同期対象のリポジトリ
# ============================================
REPOS=(
  "$CLAUDE_DIR:claude-config"
  "$SKILLS_DIR:skills"
  "$HARNESS_DIR:harness"
)

# ============================================
# メイン処理
# ============================================
case $MODE in
  status)
    echo ""
    echo "📊 同期状態:"
    for_each_repo check_repo_status
    echo ""
    ;;

  pull)
    echo ""
    echo "📥 リモートから取得:"
    for_each_repo do_pull
    echo ""
    ;;

  push)
    echo ""
    echo "📤 リモートにプッシュ:"
    for_each_repo do_push
    echo ""
    ;;

  setup)
    echo ""
    echo "🛠  初期セットアップ:"
    echo ""

    # SSH接続テスト
    if ! check_ssh_auth; then
      echo -e "${YELLOW}⚠️ SSH認証失敗。HTTPSを使用します。${NC}"
      USE_HTTPS=true
    fi

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
    for_each_repo do_diff
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
