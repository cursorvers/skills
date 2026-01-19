#!/bin/bash
# ============================================
# Git Hooks インストールスクリプト
# scripts/hooks/ を .git/hooks/ にリンク
# ============================================

set -euo pipefail

# カラー定義
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_SOURCE="$SCRIPT_DIR/hooks"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

echo "🔗 Git Hooks インストール"
echo "=========================================="
echo ""
echo "ソース:  $HOOKS_SOURCE"
echo "宛先:    $HOOKS_DEST"
echo ""

# hooks ソースディレクトリ確認
if [[ ! -d "$HOOKS_SOURCE" ]]; then
  echo -e "${RED}エラー: hooks ディレクトリが見つかりません: $HOOKS_SOURCE${NC}"
  exit 1
fi

# .git ディレクトリ確認
if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo -e "${RED}エラー: git リポジトリではありません${NC}"
  exit 1
fi

# hooks 宛先ディレクトリ作成
mkdir -p "$HOOKS_DEST"

# インストール対象の hooks（拡張子なしのファイルのみ）
HOOKS_TO_INSTALL=(
  "post-commit"
  "pre-push"
  "pre-commit"
)

installed=0
skipped=0

for hook in "${HOOKS_TO_INSTALL[@]}"; do
  source_file="$HOOKS_SOURCE/$hook"
  dest_file="$HOOKS_DEST/$hook"

  if [[ -f "$source_file" ]]; then
    # 既存のファイルがある場合
    if [[ -e "$dest_file" ]]; then
      if [[ -L "$dest_file" ]]; then
        # 既にシンボリックリンクの場合は更新
        rm "$dest_file"
        ln -sf "$source_file" "$dest_file"
        echo -e "${CYAN}↻ $hook: 更新${NC}"
        ((installed++))
      else
        # 通常ファイルの場合は警告
        echo -e "${YELLOW}⚠ $hook: 既存ファイルあり（スキップ）${NC}"
        echo -e "  手動で削除してください: rm $dest_file"
        ((skipped++))
      fi
    else
      # 新規インストール
      ln -sf "$source_file" "$dest_file"
      chmod +x "$source_file"
      echo -e "${GREEN}✓ $hook: インストール完了${NC}"
      ((installed++))
    fi
  fi
done

echo ""
echo "=========================================="
echo -e "${GREEN}完了: ${installed}個インストール${NC}"
if [[ $skipped -gt 0 ]]; then
  echo -e "${YELLOW}スキップ: ${skipped}個（手動対応必要）${NC}"
fi

# cd 拡張の案内
echo ""
echo "📝 cd 拡張を有効にするには:"
echo ""
echo "  ~/.zshrc に以下を追加:"
echo -e "  ${CYAN}source $HOOKS_SOURCE/cd-extension.zsh${NC}"
echo ""
echo "  追加後、ターミナルを再起動または:"
echo -e "  ${CYAN}source ~/.zshrc${NC}"
echo ""
