---
name: tool-search-tool
description: |
  Tool Search Tool を活用した大規模ツールセットの効率的な管理。
  Use when: 「ツールが多すぎる」「MCP統合」「ツール検索」「defer_loading」「tool discovery」
  「コンテキスト節約」「30個以上のツール」「動的ツールロード」「tool_search_tool」
  Do NOT use for: 少数ツール（<10）、単純なツール呼び出し、ツール定義の作成
metadata:
  short-description: 数百〜数千のツールを動的に検索・ロードする機能
---

# Tool Search Tool スキル

数百〜数千のツールを動的に検索・ロードし、コンテキスト効率とツール選択精度を最大化します。

## いつ使うか

| 状況 | 推奨 |
|------|------|
| 10個以上のツール | 使用推奨 |
| MCP サーバー統合 | 必須 |
| ツール定義が10K+トークン | 使用推奨 |
| 30-50個以上でツール選択精度低下 | 必須 |

## クイックスタート

### 1. Beta ヘッダー設定

```python
# Claude API / Microsoft Foundry
betas=["advanced-tool-use-2025-11-20"]

# Google Cloud Vertex AI / Amazon Bedrock
betas=["tool-search-tool-2025-10-19"]
```

### 2. ツール検索タイプの選択

| タイプ | 検索方法 | 使用場面 |
|--------|----------|----------|
| `tool_search_tool_regex_20251119` | Python正規表現 | 明確なツール名パターン |
| `tool_search_tool_bm25_20251119` | 自然言語 | 曖昧な検索 |

### 3. 基本実装パターン

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-sonnet-4-5-20250929",
    betas=["advanced-tool-use-2025-11-20"],
    max_tokens=2048,
    messages=[{"role": "user", "content": "天気を教えて"}],
    tools=[
        # 検索ツール（defer_loading なし）
        {
            "type": "tool_search_tool_regex_20251119",
            "name": "tool_search_tool_regex"
        },
        # 遅延ロードツール
        {
            "name": "get_weather",
            "description": "指定場所の天気を取得",
            "input_schema": {
                "type": "object",
                "properties": {"location": {"type": "string"}},
                "required": ["location"]
            },
            "defer_loading": True  # 検索されるまでロードしない
        }
    ]
)
```

## 検索パターン（Regex）

```python
# 基本パターン
"weather"                    # "weather" を含む
"get_.*_data"               # get_user_data, get_weather_data 等
"database.*query|query.*database"  # OR パターン
"(?i)slack"                 # 大文字小文字無視

# 最大200文字
```

## MCP 統合

```python
tools=[
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
    {
        "type": "mcp_toolset",
        "mcp_server_name": "database-server",
        "default_config": {"defer_loading": True},  # 全ツールをデフォルトで遅延
        "configs": {
            "search_events": {"defer_loading": False}  # 頻用ツールは即時ロード
        }
    }
]
```

## ベストプラクティス

### 推奨構成

```
非遅延（即時ロード）: 3-5個の頻用ツール
遅延（検索ロード）: 残り全て
```

### ツール説明の最適化

```python
# Good - 検索可能なキーワード含む
{
    "name": "fetch_user_profile",
    "description": "ユーザープロファイル、アカウント情報、プリファレンス設定を取得"
}

# Bad - 検索しにくい
{
    "name": "fetch_user_profile",
    "description": "プロファイルを取得"
}
```

### システムプロンプトでカテゴリ説明

```
利用可能なツールカテゴリ:
- Slack連携（メッセージ送信、チャンネル操作）
- GitHub連携（PR、Issue、コードレビュー）
- Jira連携（チケット管理、スプリント）
```

## 制限

| 項目 | 上限 |
|------|------|
| 最大ツール数 | 10,000 |
| 検索結果 | 3-5件/検索 |
| 正規表現長 | 200文字 |
| 対応モデル | Sonnet 4.0+, Opus 4.0+ |

## エラーハンドリング

| エラー | 原因 | 解決 |
|--------|------|------|
| `All tools deferred` | 検索ツールにも defer_loading | 検索ツールから defer_loading 削除 |
| `Missing tool definition` | 参照ツールが定義されていない | tools配列に完全な定義を追加 |
| `invalid_pattern` | 不正な正規表現 | パターンを修正 |

## カスタム検索実装（Embeddings）

独自の検索ロジックを実装する場合:

```python
# tool_result で tool_reference を返す
{
    "type": "tool_result",
    "tool_use_id": "toolu_xxx",
    "content": [
        {"type": "tool_reference", "tool_name": "discovered_tool"}
    ]
}
```

詳細: [reference/custom-search-implementation.md](reference/custom-search-implementation.md)

## 参考リンク

- [公式ドキュメント](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [Embeddings Cookbook](https://platform.claude.com/cookbooks)
