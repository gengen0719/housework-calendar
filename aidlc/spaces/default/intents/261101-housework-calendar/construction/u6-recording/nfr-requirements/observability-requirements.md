# 見守りの要件（Observability）— U6 記録

U6（`u6-recording`）の見守りの要件です。U1〜U5 の要件（ログの形、リクエスト ID、30 日、書かないもの。NFR2.5〜NFR2.8、NFR2.21〜NFR2.23、NFR2.32、NFR7.6、NFR7.24）をそのまま使います。作り手への知らせ（15 分以内）は U10 で入れます。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.40 | 記録のできごとをログに残す（BR7.16）。`DUTY_RECORDED`（家族の ID、担当の ID、経路 `line` か `api`、`alreadyRecorded`、かかった時間）、`DUTY_RECORD_REJECTED`（家族の ID、担当の ID（分かるとき）、経路、理由の印: `NOT_OWN_DUTY`、`DUTY_ALREADY_DONE`、`MONTH_CONFIRMED`、`DUTY_SKIPPED_BY_ADMIN`、`FUTURE_DUTY`、`NOT_TODAY_DUTY`、`DUTY_CHANGED`、`NOT_FOUND`、`INTERNAL`）、`RECORD_LIST_SHOWN`（家族の ID、利用者の ID、選べる担当の数、選べない担当の数、理由の印があるときはその印）、`RECORD_GUIDE_SENT`（理由 `ADMIN` か `NOT_IN_FAMILY`。家族の ID は分かるときだけ）、`DUTY_RECORD_RETRY`（取引の読み直しをしたこと。担当の ID。warn ではなく info）、`LINE_REPLY_FAILED`（warn。U1〜U3 と同じ名前）、`DUTY_RECORDED_HOOK_FAILED`（warn）。思いがけない失敗は、U1 の `describeError` で `error` として残す。利用者は、LINE の ID ではなくアプリの `userId` で残す | ログの出し方の単体テストで、成功、各理由の断り、`alreadyRecorded`、読み直し、返事の失敗、思いがけない失敗のそれぞれに、上のイベントが 1 件ずつ出て、必要な項目が入っていること |
| NFR2.41 | ログに、名前や秘密の情報を残さない。書かないもの: LINE のユーザー ID、利用者・子供の表示名、種類の名前、reply トークン、postback の data の全文、Flex Message や返事の本文、Webhook の本文、チャネルのトークンとシークレット、署名、秘密のヘッダーの値、単価と金額（U1 の NFR2.8、NFR5.4、U5 の NFR2.32、U3 の NFR5.8 と同じ考え） | 作り物の値（`<作り物の値>` の目印を付けた表示名、種類の名前、LINE のユーザー ID、reply トークン、data）を入れたイベントを、成功、すべての断り、`INTERNAL`、思いがけない例外、返事の失敗の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと |
| NFR2.42 | 形の外れた `record.*` の postback、`group` と `room` からの `record.*` を無視するときは、`LINE_EVENT_IGNORED` に `type` だけを書く（既存の形）。data の中身は書かない（NFR4.54、NFR4.55） | 外れた data を送り、ログに data の文字が出ないこと |
| NFR2.43 | U6 の失敗を、ログから `event` と `reason` で検索できる形で残す（`DUTY_RECORD_REJECTED` の `reason: INTERNAL`、`REQUEST_ERROR`、`LINE_REPLY_FAILED`、`DUTY_RECORDED_HOOK_FAILED`）。U6 は指標とアラームを足さない（NFR1.25）。U10 が、これらのイベントを作り手への知らせの対象に入れる（15 分以内。NFR2）。それまでは、作り手が CloudWatch Logs で `INTERNAL` と 500 を検索して気づく | 上のイベントがすべて 1 行 1 件の JSON で `event` と `reason` を持つこと（NFR2.5 の形）。引き継ぎは U10 の入力に書く |
| NFR7.32 | U6 の経路も、かかった時間をログに残す（U1 の NFR7.6）。`LINE_EVENT_DONE` の `durationMs`（既存）に加え、`DUTY_RECORDED` の `durationMs`（記録の処理だけの時間）を残す。画面用 API の記録は、リクエストごとの `path`（パスの型 `/v1/duties/:dutyId/record`）と時間を残す（U5 の NFR7.24 と同じ）。冷たい起動かどうかは、Lambda の `REPORT` の行の `Init Duration` で見分けられる（追加の実装は要らない）。3 秒の目標（NFR7.25〜NFR7.29）を、サーバー側の時間（NFR7.27）と照らして原因を分けられること | ログから `durationMs` を読めること。ステージングの測定で、`REPORT` の `Init Duration` の有無で冷たい起動を数えられること |

## ログの項目の対応

| 経路 | 項目 | 使う値 |
|------|------|--------|
| LINE | `event`、`familyId`、`dutyId`、`route: "line"`、`alreadyRecorded`、`durationMs` | アプリの ID と数だけ |
| 画面 | `event`、`familyId`、`dutyId`、`route: "api"`、`alreadyRecorded`、`durationMs` | 同上 |
| 共通 | `requestId`（NFR2.6）、環境（NFR2.5） | 既存の形 |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u6-recording/functional-design/rules.md`（BR7.16、BR7.17）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`（NFR2.5〜NFR2.8、NFR7.6）
- `construction/u3-notification-group/nfr-requirements/observability-requirements.md`（NFR2.21〜NFR2.23）
- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`（NFR2.32、NFR7.24）
- 既存コード（読むだけ）: `lib/logger.ts`（`describeError`、`setRequestId`）、`entries/line.ts`（`REQUEST_START`、`LINE_EVENT_DONE`、`LINE_EVENT_IGNORED`）

## Assumptions & Open Questions

- [assumption] 金額（単価）をログに書かないのは、ログに残す利点（調べもの）より、家族のお小遣いの情報を残さない方を優先するためです。記録の調べものには、担当の ID と家族の ID で足ります
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
