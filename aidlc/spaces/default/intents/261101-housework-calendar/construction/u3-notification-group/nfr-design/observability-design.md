# 見守りの設計（Observability Design）— U3 お知らせ先

U3（`u3-notification-group`）の見守りの要件（NFR2.21〜NFR2.23、NFR7.16）を、どう作るかを書きます。U1 の `lib/logger.ts`（1 行 1 件の JSON、リクエスト ID、30 日）と、U2 の `LogData` の型で項目を禁止する作りを使います。

## お知らせ先のできごとのログ（NFR2.21）

| `event` | いつ | 項目 |
|---------|------|------|
| `GROUP_JOINED` | グループに参加して案内を送った | `groupId` |
| `NOTIFICATION_GROUP_REGISTERED` | 登録した | `groupId`、`familyId`、`userId`、`replacedGroupId`（置き換えたとき）、`groupNameFetched`（true/false） |
| `NOTIFICATION_GROUP_REJECTED` | 登録を断った | `groupId`、`userId`（分かるとき）、`reason`（`ADMIN_ONLY`、`GROUP_USED_BY_OTHER_FAMILY`） |
| `NOTIFICATION_GROUP_UNREGISTERED` | 公式アカウントが外されて解除した | `groupId`、`familyId` |
| `GROUP_COMMAND_REJECTED` | グループの操作を断った（U8 の操作で使う） | `groupId`、`userId`（分かるとき）、`reason`（`GROUP_NOT_REGISTERED`、`NOT_FAMILY_MEMBER`） |

## 書かないもの（NFR2.22）

- グループの名前、`message.text`、表示名は書かない。`LogData` の型で `groupName`、`text`、`displayName` を禁止し、単体テストで、登録の流れのどのログの行にもグループの名前と本文が出ないことを確かめる

## warn（NFR2.23）

| `event` | いつ |
|---------|------|
| `GROUP_SUMMARY_FAILED` | グループの名前を受け取れなかった（時間切れ・LINE の失敗）。`groupId`、`reason`（`timeout`、`http_<status>`） |
| `LINE_REPLY_FAILED` | reply を送れなかった（U1 のできごとを使う） |
| `NOTIFICATION_GROUP_TRANSACTION_CANCELED` | トランザクションが断られた。`CancellationReasons` の Code の一覧 |

## かかった時間（NFR7.16）

- U1 の `REQUEST_END` の `durationMs` で、LINE のイベントの処理と画面の操作の時間を読める。LINE のイベントごとの時間は `LINE_EVENT_DONE` に `type` と `durationMs` を足して残す

## Sources

- `construction/u3-notification-group/nfr-requirements/observability-requirements.md`
- `construction/u2-invitation/nfr-design/observability-design.md`
- `packages/backend/src/lib/logger.ts`

## Assumptions & Open Questions

- U3 では新しいメトリクスやアラームは足しません。お知らせ先が外されたことを作り手に知らせるかは U10 で決めます
