#!/bin/bash
# ============================================
# Cursorvers 開発環境セットアップスクリプト
# 新しいPCでこのスクリプトを実行するだけで環境構築完了
# ============================================

set -e

echo "🚀 Cursorvers 開発環境セットアップ開始"
echo "=========================================="

# 1. 必要なディレクトリ作成
echo ""
echo "📁 ディレクトリ作成..."
mkdir -p ~/Dev
mkdir -p ~/.claude

# 2. GitHub認証確認
echo ""
echo "🔐 GitHub認証確認..."
if ! gh auth status &>/dev/null; then
  echo "GitHub CLIにログインしてください:"
  gh auth login
fi

# 3. 必須リポジトリをクローン
echo ""
echo "📥 リポジトリをクローン..."

# claude-config → ~/.claude
if [ ! -d ~/.claude/.git ]; then
  rm -rf ~/.claude
  git clone git@github.com:cursorvers/claude-config.git ~/.claude
  echo "✓ claude-config → ~/.claude"
else
  echo "✓ claude-config already exists"
fi

# skills → ~/Dev/skills
if [ ! -d ~/Dev/skills/.git ]; then
  git clone git@github.com:cursorvers/skills.git ~/Dev/skills
  echo "✓ skills → ~/Dev/skills"
else
  echo "✓ skills already exists"
fi

# claude-code-harness → ~/.claude/harness
if [ ! -d ~/.claude/harness/.git ]; then
  git clone git@github.com:cursorvers/claude-code-harness.git ~/.claude/harness
  echo "✓ claude-code-harness → ~/.claude/harness"
else
  echo "✓ claude-code-harness already exists"
fi

# dotfiles → ~/dotfiles
if [ ! -d ~/dotfiles/.git ]; then
  git clone git@github.com:cursorvers/dotfiles.git ~/dotfiles
  echo "✓ dotfiles → ~/dotfiles"
else
  echo "✓ dotfiles already exists"
fi

# 4. シンボリックリンク作成
echo ""
echo "🔗 シンボリックリンク作成..."

# skills → ~/.claude/skills
if [ ! -L ~/.claude/skills ]; then
  ln -sf ~/Dev/skills ~/.claude/skills
  echo "✓ ~/Dev/skills → ~/.claude/skills"
else
  echo "✓ skills symlink already exists"
fi

# 5. 環境変数の設定案内
echo ""
echo "⚙️  環境変数の設定"
echo "=========================================="
echo "以下を ~/.zshrc に追加してください:"
echo ""
echo 'export ZAI_API_KEY="your-zai-api-key"'
echo 'export GEMINI_API_KEY="your-gemini-api-key"'
echo ""

# 6. npm依存関係のインストール
echo ""
echo "📦 npm依存関係インストール..."
if [ -f ~/Dev/skills/package.json ]; then
  cd ~/Dev/skills && npm install --silent
  echo "✓ skills npm install完了"
fi

# 7. 完了
echo ""
echo "=========================================="
echo "✅ セットアップ完了!"
echo ""
echo "構成:"
echo "  ~/.claude/           ← Claude Code設定"
echo "  ~/.claude/skills/    ← スキル（symlink）"
echo "  ~/.claude/harness/   ← ハーネス"
echo "  ~/Dev/skills/        ← スキルリポジトリ"
echo "  ~/dotfiles/          ← 環境設定"
echo ""
echo "次のステップ:"
echo "  1. ~/.zshrc に環境変数を追加"
echo "  2. source ~/.zshrc を実行"
echo "  3. Claude Code を起動"
echo ""
