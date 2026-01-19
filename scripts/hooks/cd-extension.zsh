# ============================================
# cd 拡張: skills ディレクトリ移動時の自動同期
# ハイブリッド構成の自動同期 (Phase 2)
#
# 使い方: ~/.zshrc に以下を追加
#   source ~/Dev/skills/scripts/hooks/cd-extension.zsh
# ============================================

# 同期対象ディレクトリ（環境変数で上書き可能）
if [[ -z "${SYNC_DIRS+x}" ]]; then
  SYNC_DIRS=(
    "$HOME/Dev/skills"
    "$HOME/.claude"
    "$HOME/.claude/harness"
  )
fi

# 最後の同期時刻を保持（ディレクトリごと）
typeset -A _LAST_SYNC_TIME

# 同期間隔（秒）- 同じディレクトリへの cd が頻繁な場合にスキップ
SYNC_INTERVAL=${SYNC_INTERVAL:-300}  # デフォルト5分

# 拡張 cd 関数
cd() {
  # 引数なしの場合は HOME へ
  local target="${1:-$HOME}"

  # 通常の cd を実行
  builtin cd "$target" || return $?

  # カレントディレクトリの絶対パスを取得
  local current_dir
  current_dir=$(pwd -P)

  # 同期対象ディレクトリかチェック
  for sync_dir in "${SYNC_DIRS[@]}"; do
    # 絶対パスに正規化
    local normalized_sync_dir
    normalized_sync_dir=$(cd "$sync_dir" 2>/dev/null && pwd -P || echo "$sync_dir")

    if [[ "$current_dir" == "$normalized_sync_dir" ]]; then
      # 最後の同期からの経過時間をチェック
      local now
      now=$(date +%s)
      local last_sync="${_LAST_SYNC_TIME[$current_dir]:-0}"
      local elapsed=$((now - last_sync))

      if [[ $elapsed -ge $SYNC_INTERVAL ]]; then
        _auto_sync_repo "$current_dir"
        _LAST_SYNC_TIME[$current_dir]=$now
      fi
      break
    fi
  done
}

# 自動同期処理
_auto_sync_repo() {
  local dir="$1"

  # git リポジトリでなければスキップ
  if [[ ! -d "$dir/.git" ]]; then
    return 0
  fi

  # リモートが設定されていなければスキップ
  if ! git -C "$dir" rev-parse --abbrev-ref "@{upstream}" >/dev/null 2>&1; then
    return 0
  fi

  # ローカル変更がある場合は警告のみ
  local changes
  changes=$(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$changes" -gt 0 ]]; then
    echo -e "\033[1;33m[sync] ⚠ ローカル変更あり ($changes件) - pullスキップ\033[0m"
    return 0
  fi

  # リモートの更新があるかチェック（fetch は quiet で）
  git -C "$dir" fetch --quiet 2>/dev/null || return 0

  local behind
  behind=$(git -C "$dir" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo "0")

  if [[ "$behind" -gt 0 ]]; then
    echo -e "\033[0;36m[sync] 📥 ${behind}件の更新を取得中...\033[0m"
    if git -C "$dir" pull --ff-only --quiet 2>/dev/null; then
      echo -e "\033[0;32m[sync] ✓ 同期完了\033[0m"
    else
      echo -e "\033[1;33m[sync] ⚠ マージが必要 - 手動で解決してください\033[0m"
    fi
  fi
}

# 手動同期コマンド
sync-now() {
  local current_dir
  current_dir=$(pwd -P)

  if [[ -d "$current_dir/.git" ]]; then
    echo "🔄 強制同期中..."
    _auto_sync_repo "$current_dir"
    _LAST_SYNC_TIME[$current_dir]=$(date +%s)
  else
    echo "❌ git リポジトリではありません"
  fi
}
