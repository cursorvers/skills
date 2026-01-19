# マルチPC開発環境セットアップガイド

## 概要

複数のMacで同一の開発環境を構築するための手順書。

## 前提条件

- macOS (Apple Silicon / Intel)
- Git がインストール済み
- GitHub アカウントで cursorvers organization にアクセス可能

## クイックスタート（新規PC）

```bash
curl -fsSL https://raw.githubusercontent.com/cursorvers/skills/main/scripts/setup-any-pc.sh | bash
```

これで以下が自動実行されます：
1. 3つのリポジトリをクローン
2. `~/.claude/` へのシンボリックリンク設定
3. 環境変数のテンプレート作成

## 手動セットアップ

### 1. リポジトリのクローン

```bash
mkdir -p ~/Dev
cd ~/Dev

git clone https://github.com/cursorvers/claude-config.git
git clone https://github.com/cursorvers/skills.git
git clone https://github.com/cursorvers/harness.git
```

### 2. シンボリックリンク設定

```bash
# 既存の ~/.claude をバックアップ（存在する場合）
[ -d ~/.claude ] && mv ~/.claude ~/.claude.backup.$(date +%Y%m%d)

# シンボリックリンク作成
ln -s ~/Dev/claude-config ~/.claude
```

### 3. 環境変数設定

```bash
# .env.example をコピー
cp ~/Dev/skills/.env.example ~/Dev/skills/.env

# 以下を設定（各自の値に置換）
# ZAI_API_KEY=your-glm-api-key
# GEMINI_API_KEY=your-gemini-api-key
# OPENAI_API_KEY=your-openai-api-key
```

## 日常の同期操作

### 全リポジトリの状態確認

```bash
cd ~/Dev/skills
bash scripts/sync-claude-config.sh status
```

### 全リポジトリをプル

```bash
bash scripts/sync-claude-config.sh pull
```

### 変更をプッシュ

```bash
bash scripts/sync-claude-config.sh push
```

## DevContainer（オプション）

VS Code または GitHub Codespaces で利用可能。

```bash
cd ~/Dev/skills
code .
# → "Reopen in Container" を選択
```

## トラブルシューティング

### シンボリックリンクが壊れている

```bash
rm ~/.claude
ln -s ~/Dev/claude-config ~/.claude
```

### 権限エラー

```bash
chmod +x ~/Dev/skills/scripts/*.sh
```

### Git 認証エラー

```bash
gh auth login
```

## リポジトリ構成

| リポジトリ | 用途 | パス |
|-----------|------|------|
| claude-config | Claude Code 設定・ルール | `~/.claude/` |
| skills | スキル・スクリプト | `~/Dev/skills/` |
| harness | ワークフロー・テンプレート | `~/Dev/harness/` |

## 関連ファイル

- `scripts/setup-any-pc.sh` - 自動セットアップスクリプト
- `scripts/sync-claude-config.sh` - 同期ユーティリティ
- `.devcontainer/` - DevContainer 設定
- `.env.example` - 環境変数テンプレート
