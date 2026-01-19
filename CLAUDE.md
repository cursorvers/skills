# CLAUDE.md - Skills Repository

Fork of openai/skills. スキル開発・テスト・コントリビューション用。

## Structure

```
skills/
├── .system/       # システムスキル（自動インストール）
├── .curated/      # 安定版スキル
└── .experimental/ # 実験的スキル
```

## Skill Requirements

| 必須 | 推奨 |
|------|------|
| SKILL.md | examples/ |
| LICENSE.txt | evaluations/ |

## Commands

```bash
npm run lint        # JS lint
npm run lint:shell  # Shell lint
npm run check       # 全チェック
```

## Workflow

```
開発 → npm run check → PR → CLA署名 → マージ
```

CLA署名: PR に `I have read the CLA Document and I hereby sign the CLA` をコメント

## References

- [Agent Skills Standard](https://agentskills.io)
- [Contributing Guide](./contributing.md)
