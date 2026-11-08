# 見守りの設計（Observability Design）— U4 お手伝いの種類

U4（`u4-chore-types`）の見守りの要件（NFR2.27、NFR7.19）を、どう作るかを書きます。U1〜U3 の `lib/logger.ts` をそのまま使います。

## 種類のできごとのログ（NFR2.27）

| `event` | いつ | 項目 |
|---------|------|------|
| `CHORE_TYPE_CREATED` | 登録した | `familyId`、`userId`、`choreTypeId`、`unitPrice` |
| `CHORE_TYPE_UPDATED` | 変えた | `familyId`、`userId`、`choreTypeId`、`unitPriceBefore`、`unitPriceAfter`（単価が変わったときだけ）、`nameChanged`（true/false） |
| `CHORE_TYPE_ACTIVE_CHANGED` | 使わない・使う | `familyId`、`userId`、`choreTypeId`、`active` |
| `CHORE_TYPE_DELETED` | 消した | `familyId`、`userId`、`choreTypeId` |
| `CHORE_TYPE_REJECTED` | 断った | `familyId`、`userId`、`choreTypeId`（分かるとき）、`reason` |

- 名前と説明は書かない。`LogData` の型で `name`・`description` を受け付けないようにする（U3 の `groupName` と同じ作り）。実行時の伏せ字の完全一致の式を `/^(groupName|text|display_?name|name|description)$/i` にする。確かめは、ログの単体テスト（`name`・`Description` が `[REDACTED]` になる）と、型のテスト（`@ts-expect-error` で `name` を渡すとエラーになる）で行う（レビュー R-05）。U1〜U3 のログは `name` を使っていない（レビューで確かめた）
- 単価の前と後を残すのは、いつ単価が変わったかを作り手が確かめられるようにするため

## かかった時間（NFR7.19）

- U1 の `REQUEST_END` の `durationMs` に、パスの型（`/v1/chore-types/:choreTypeId`）が付く

## Sources

- `construction/u4-chore-types/nfr-requirements/observability-requirements.md`
- `construction/u3-notification-group/nfr-design/observability-design.md`

## Assumptions & Open Questions

- [assumption] `LogData` で `name` を禁止しても、U1〜U3 のログは `name` という項目を使っていません（コード生成で確かめる）
