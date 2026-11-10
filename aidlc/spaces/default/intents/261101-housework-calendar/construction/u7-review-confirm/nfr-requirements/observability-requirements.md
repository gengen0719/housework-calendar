# 見守りの要件（Observability）— U7 確認・修正と確定

U7（`u7-review-confirm`）の見守りの要件です。U1〜U6 の要件（ログの形、リクエスト ID、30 日、書かないもの。NFR2.5〜NFR2.8、NFR2.21〜NFR2.23、NFR2.32、NFR2.40〜NFR2.43、NFR7.6、NFR7.24、NFR7.32）をそのまま使います。U7 は画面用 API だけなので、`entries/api.ts` の既存のログ（`REQUEST_START`・`REQUEST_REJECTED`・`REQUEST_ERROR`・`REQUEST_END`）に、U7 の操作のできごとを足します。作り手への知らせ（15 分以内）は U10 で入れます。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.51 | 状態の変更と確定のできごとをログに残す（BR8.17）。`DUTY_STATUS_CHANGED`（`familyId`、`dutyId`、`action`（cancel・markDone・markSkipped・unmarkSkipped）、`fromStatus`、`toStatus`、`durationMs`）、`DUTY_STATUS_REJECTED`（`familyId`、`dutyId`（分かるとき）、`action`、理由の印: `ADMIN_ONLY`・`NOT_FOUND`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`INVALID_REQUEST`・`INTERNAL`）、`MONTH_CONFIRMED_SET`（`familyId`、`month`、`confirmed` の新しい値）、`DUTY_STATUS_RETRY`（取引の読み直しをしたこと。`dutyId`。warn ではなく info）、`DUTY_REASSIGN_HOOK_FAILED`（warn。BR8.15 の口。`dutyId`・`kind` だけ）。思いがけない失敗は、U1 の `describeError` で `REQUEST_ERROR` として残す（`entries/api.ts` の既存の経路）。利用者は、LINE の ID ではなくアプリの `userId`（`ctx.userId`）で残す | ログの出し方の単体テストで、成功（5 とおりの状態変更）、確定、取り消し、各理由の断り、読み直し、`INTERNAL`、思いがけない失敗のそれぞれに、上のイベントが 1 件ずつ出て、必要な項目が入っていること |
| NFR2.52 | ログに、名前や秘密の情報を残さない。書かないもの: 子供・管理者の表示名、お手伝いの名前、LINE のユーザー ID、セッショントークン、署名の鍵、秘密のヘッダーの値、単価と金額（markDone で書き写す単価も残さない）、確認の 1 行の文言や注意（「お小遣いの回数から外れます」など）（U1 の NFR2.8・NFR5.4、U5 の NFR2.32、U6 の NFR2.41・NFR4.73（本 U7）と同じ考え） | 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・単価）を入れた担当・月で、成功・すべての断り・`INTERNAL`・思いがけない例外の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと |
| NFR2.53 | U7 の失敗を、ログから `event` と `reason` で検索できる形で残す（`DUTY_STATUS_REJECTED` の `reason: INTERNAL`、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED`）。U7 は指標とアラームを足さない（NFR1.31）。U10 が、これらのイベントを作り手への知らせの対象に入れる（15 分以内。NFR2）。それまでは、作り手が CloudWatch Logs で `INTERNAL` と 500 を検索して気づく。引き継ぎは U10 の入力に書く | 上のイベントがすべて 1 行 1 件の JSON で `event` と `reason`（または `error`）を持つこと（NFR2.5 の形）。`api` の `REQUEST_END` が U7 の経路でも `durationMs` を持つこと |
| NFR7.38 | U7 の経路も、かかった時間をログに残す（U1 の NFR7.6、U5 の NFR7.24）。`REQUEST_END` の `durationMs` と `path`（パスの型 `/v1/duties/:dutyId/status`、`/v1/months/:month/confirmation`）を残し、状態の変更は `DUTY_STATUS_CHANGED` にも処理だけの `durationMs` を残す。冷たい起動かどうかは、Lambda の `REPORT` の行の `Init Duration` で見分けられる（追加の実装は要らない）。3 秒の目標（NFR7.33、NFR7.34）を、サーバー側の時間（NFR7.37）と照らして原因を分けられること | ログから `durationMs` と `path`（型）を読めること。ステージングの測定で、`REPORT` の `Init Duration` の有無で冷たい起動を数えられること |

## ログの項目の対応

| 操作 | イベント | 使う値 |
|------|---------|--------|
| 状態の変更（成功） | `DUTY_STATUS_CHANGED` | `familyId`、`dutyId`、`action`、`fromStatus`、`toStatus`、`durationMs`（アプリの ID と数だけ） |
| 状態の変更（断り） | `DUTY_STATUS_REJECTED` | `familyId`、`dutyId`（分かるとき）、`action`、`reason` |
| 確定・取り消し | `MONTH_CONFIRMED_SET` | `familyId`、`month`、`confirmed`（新しい値） |
| 共通 | `REQUEST_START` / `REQUEST_END` / `REQUEST_ERROR` | `path`（型）、`durationMs`、`requestId`（NFR2.6）、環境（NFR2.5）。既存の形 |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.15、BR8.17、BR8.18）、`functional-spec.md`（状態の変更の印と返事の対応、次の単位への引き継ぎ）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`（NFR2.5〜NFR2.8、NFR7.6）
- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`（NFR2.32、NFR7.24）
- `construction/u6-recording/nfr-requirements/observability-requirements.md`（NFR2.40〜NFR2.43、NFR7.32。失敗を検索できる形、名前・単価を残さない）
- 既存コード（読むだけ）: `lib/logger.ts`（`describeError`、`setRequestId`、`takeRequestMetrics`）、`entries/api.ts`（`REQUEST_START`・`REQUEST_REJECTED`・`REQUEST_ERROR`・`REQUEST_END`・`durationMs`・`path`）

## Assumptions & Open Questions

- [assumption] 単価（markDone で書き写す値）をログに書かないのは、ログに残す利点（調べもの）より、家族のお小遣いの情報を残さない方を優先するためです（NFR2.52、BR8.17）。調べものには `dutyId` と `familyId`・`action`・`fromStatus`・`toStatus` で足ります
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は画面が数えるので、U7 の API はその数をログに残しません。確定したことは `MONTH_CONFIRMED_SET` で足ります
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
