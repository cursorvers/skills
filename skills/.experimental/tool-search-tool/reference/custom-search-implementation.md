# カスタム Tool Search 実装ガイド

Embeddings や独自アルゴリズムを使った Tool Search の実装方法。

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  Claude                                         │
│  ├─ ユーザーリクエスト解析                        │
│  └─ カスタム検索ツール呼び出し                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  Your Custom Search Tool                        │
│  ├─ Embedding 生成                              │
│  ├─ ベクトル検索                                 │
│  └─ tool_reference 返却                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  API 自動展開                                    │
│  └─ tool_reference → 完全なツール定義            │
└─────────────────────────────────────────────────┘
```

## 実装例: Embeddings ベース検索

### 1. ツールインデックス作成

```python
import numpy as np
from openai import OpenAI

client = OpenAI()

def create_tool_embeddings(tools: list[dict]) -> dict:
    """ツール定義からEmbeddingsを生成"""
    index = {}
    for tool in tools:
        # 検索用テキスト生成
        text = f"{tool['name']} {tool['description']}"

        # Embedding生成
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        index[tool['name']] = {
            'embedding': response.data[0].embedding,
            'tool': tool
        }
    return index
```

### 2. 検索関数

```python
def search_tools(query: str, index: dict, top_k: int = 5) -> list[str]:
    """クエリに最も関連するツールを検索"""
    # クエリのEmbedding
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    )
    query_embedding = np.array(response.data[0].embedding)

    # コサイン類似度計算
    scores = []
    for name, data in index.items():
        tool_embedding = np.array(data['embedding'])
        similarity = np.dot(query_embedding, tool_embedding) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(tool_embedding)
        )
        scores.append((name, similarity))

    # 上位k件を返す
    scores.sort(key=lambda x: x[1], reverse=True)
    return [name for name, _ in scores[:top_k]]
```

### 3. カスタム検索ツール定義

```python
custom_search_tool = {
    "name": "semantic_tool_search",
    "description": "意味的に関連するツールを検索。自然言語クエリで最適なツールを発見",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "検索クエリ（自然言語）"
            }
        },
        "required": ["query"]
    }
}
```

### 4. ツール結果の返却

```python
def handle_tool_search(tool_use_id: str, query: str, index: dict) -> dict:
    """検索結果を tool_reference 形式で返却"""
    found_tools = search_tools(query, index)

    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": [
            {"type": "tool_reference", "tool_name": name}
            for name in found_tools
        ]
    }
```

### 5. 完全な統合例

```python
import anthropic

def run_conversation(user_message: str, tools: list[dict], tool_index: dict):
    client = anthropic.Anthropic()

    messages = [{"role": "user", "content": user_message}]

    # カスタム検索ツール + 遅延ロードツール
    api_tools = [custom_search_tool] + [
        {**tool, "defer_loading": True} for tool in tools
    ]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            messages=messages,
            tools=api_tools
        )

        if response.stop_reason == "end_turn":
            return response.content

        # ツール呼び出し処理
        for block in response.content:
            if block.type == "tool_use":
                if block.name == "semantic_tool_search":
                    # カスタム検索実行
                    result = handle_tool_search(
                        block.id,
                        block.input["query"],
                        tool_index
                    )
                else:
                    # 通常のツール実行
                    result = execute_tool(block.name, block.input, block.id)

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": [result]})
```

## ハイブリッドアプローチ

Regex + Embeddings の組み合わせ:

```python
def hybrid_search(query: str, tools: list[dict], index: dict) -> list[str]:
    """正規表現とEmbeddingsのハイブリッド検索"""
    results = set()

    # 1. 正規表現マッチ（高速、正確）
    import re
    pattern = re.compile(query, re.IGNORECASE)
    for tool in tools:
        if pattern.search(tool['name']) or pattern.search(tool['description']):
            results.add(tool['name'])

    # 2. Embedding検索（意味的関連）
    semantic_results = search_tools(query, index, top_k=5)
    results.update(semantic_results)

    return list(results)[:5]  # 最大5件
```

## パフォーマンス最適化

### インデックスのキャッシュ

```python
import pickle
import os

CACHE_PATH = "tool_index.pkl"

def get_or_create_index(tools: list[dict]) -> dict:
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, 'rb') as f:
            return pickle.load(f)

    index = create_tool_embeddings(tools)
    with open(CACHE_PATH, 'wb') as f:
        pickle.dump(index, f)
    return index
```

### バッチ Embedding 生成

```python
def create_tool_embeddings_batch(tools: list[dict]) -> dict:
    """バッチ処理でEmbedding生成（API呼び出し削減）"""
    texts = [f"{t['name']} {t['description']}" for t in tools]

    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )

    return {
        tools[i]['name']: {
            'embedding': response.data[i].embedding,
            'tool': tools[i]
        }
        for i in range(len(tools))
    }
```

## 注意事項

1. **必ず tools 配列に定義を含める**: `tool_reference` で参照するツールは `defer_loading: true` で定義必須
2. **検索ツール自体は遅延しない**: カスタム検索ツールに `defer_loading` を付けない
3. **最大5件推奨**: 返却する tool_reference は 3-5 件が最適
