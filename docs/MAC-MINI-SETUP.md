# Mac Mini セットアップ指示書

M5 MAX と同じ開発環境を Mac Mini に構築する手順です。

---

## 前提条件

- macOS がインストール済み
- インターネット接続あり
- GitHub アカウントでログイン可能

---

## Step 1: 基本ツールのインストール

ターミナルを開いて実行:

```bash
# Homebrew インストール（未インストールの場合）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 基本ツール
brew install git node gh
```

---

## Step 2: GitHub 認証

```bash
# GitHub CLI でログイン
gh auth login

# SSH キー生成（未作成の場合）
ssh-keygen -t ed25519 -C "your-email@example.com"

# SSH キーを GitHub に登録
gh ssh-key add ~/.ssh/id_ed25519.pub --title "Mac Mini"
```

---

## Step 3: リポジトリのクローン

```bash
# 作業ディレクトリ作成
mkdir -p ~/Dev

# skills リポジトリ
git clone git@github.com:cursorvers/skills.git ~/Dev/skills

# claude-config リポジトリ
git clone git@github.com:cursorvers/claude-config.git ~/.claude
```

---

## Step 4: セットアップスクリプト実行

```bash
cd ~/Dev/skills
chmod +x scripts/setup-any-pc.sh
./scripts/setup-any-pc.sh
```

---

## Step 5: 環境変数の設定

~/.zshrc に以下を追加:

```bash
# API Keys
export ZAI_API_KEY="your-zai-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
export OPENAI_API_KEY="your-openai-api-key"

# Hybrid Cloud Auto-Sync
source ~/Dev/skills/scripts/hooks/cd-extension.zsh
```

設定を反映:

```bash
source ~/.zshrc
```

---

## Step 6: Claude Code インストール

```bash
npm install -g @anthropic-ai/claude-code
```

---

## Step 7: Git Hooks インストール

```bash
cd ~/Dev/skills
./scripts/install-hooks.sh
```

---

## Step 8: 動作確認

```bash
# 環境変数確認
echo $ZAI_API_KEY | head -c 10

# Git 同期確認
cd ~/Dev/skills
git status

# Claude Code 起動
claude
```

---

## 完了チェックリスト

- [ ] Homebrew インストール済み
- [ ] git, node, gh インストール済み
- [ ] GitHub 認証完了
- [ ] skills リポジトリ クローン済み
- [ ] claude-config リポジトリ クローン済み
- [ ] セットアップスクリプト実行済み
- [ ] 環境変数設定済み
- [ ] Claude Code インストール済み
- [ ] Git Hooks インストール済み

---

## トラブルシューティング

### SSH 接続エラー

```bash
# SSH 接続テスト
ssh -T git@github.com

# 失敗時: SSH エージェントに鍵を追加
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### 環境変数が反映されない

```bash
# zsh を再起動
exec zsh
```

### Claude Code が見つからない

```bash
# パス確認
which claude

# npm グローバルパスを確認
npm config get prefix
```

---

## 同期の使い方

```bash
# M5 MAX での作業後、Mac Mini で:
cd ~/Dev/skills
# (自動で git pull が実行される)

# 作業完了後:
git add . && git commit -m "作業内容"
# (自動で git push が実行される - feature ブランチのみ)
```

---

## 関連ドキュメント

- [MULTI-PC-SETUP.md](./MULTI-PC-SETUP.md) - 複数PC構成の詳細
- [hybrid-cloud-native-plan.md](../.claude/plans/hybrid-cloud-native-plan.md) - ハイブリッド構成計画

---

作成日: 2026-01-20
