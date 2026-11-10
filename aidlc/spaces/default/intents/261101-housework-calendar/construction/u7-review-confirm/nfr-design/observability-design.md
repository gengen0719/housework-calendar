# 見守りの設計（Observability Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）の見守りの要件（NFR2.51〜NFR2.53、NFR7.38）を、どう作るかを書きます。U1〜U6 の `lib/logger.ts`（JSON の 1 行、リクエスト ID、30 日、伏せ字）と、`entries/api.ts` の既存のログ（`REQUEST_START`・`REQUEST_REJECTED`・`REQUEST_ERROR`・`REQUEST_END`）をそのまま使います。U7 は画面用 API だけなので、`api` の既存のログに U7 の操作のできごとを足します。U7 は指標とアラームを足しません（NFR1.31）。作り手への知らせ（15 分以内）は U10 で入れます。

## U7 のできごとのログ（NFR2.51）

| `event` | レベル | いつ | 項目 |
|---------|-------|------|------|
| `DUTY_STATUS_CHANGED` | info | 状態の変更が成功した | `familyId`、`dutyId`、`action`（cancel・markDone・markSkipped・unmarkSkipped）、`fromStatus`、`toStatus`、`durationMs`（処理だけ） |
| `DUTY_STATUS_REJECTED` | info | 状態の変更を断った | `familyId`、`dutyId`（形が正しく分かるとき）、`action`、`reason`（`ADMIN_ONLY`・`NOT_FOUND`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`INVALID_REQUEST`・`INTERNAL`） |
| `MONTH_CONFIRMED_SET` | info | 月を確定・取り消しした | `familyId`、`month`、`confirmed`（新しい値。true か false） |
| `CALENDAR_TRANSACTION_CANCELED` | warn | 取引が競合で断られた（`classifyCancellation` が必ず出す） | `codes`（断られた Code の一覧）だけ。`dutyId`・名前は書かない（既存の形） |
| `DUTY_STATUS_RETRY` | info | 取引の読み直しをした（競合） | `familyId`、`dutyId`（warn ではなく info。想定内の競合） |
| `DUTY_REASSIGN_HOOK_FAILED` | warn | `onDutyReassigned` に登録された関数が投げた（BR8.15 の口。実行は `notifyDutyReassigned`） | `dutyId`、`kind`（`status-changed`。確定も担当ごとに `status-changed`。`reliability-design.md` R-01）だけ。名前は書かない |
| 思いがけない失敗 | error | 例外 | `REQUEST_ERROR`（U1 の入口。`describeError`） |

- 状態の変更の成否の事実は、`changeDutyStatus` の中（`calendarService.ts`）で出す。`durationMs` は `changeDutyStatus` の最初から結果が決まるまでの時間
- 確定・取り消しは `MONTH_CONFIRMED_SET` に `confirmed` の新しい値（確定で true、取り消しで false）を残す
- 利用者は、LINE の ID ではなくアプリの `userId`（`ctx.userId`）で残す（`requireAdmin` の対象だが表示名は残さない）。取引の読み直しは warn ではなく info（想定内の競合）。`DUTY_STATUS_REJECTED` の `INTERNAL`（読み直しが 2 回続けて断られた）も info だが、検索の対象にする（下の「失敗の見つけ方」）
- **注記（コード生成後）:** 表の `DUTY_REASSIGN_HOOK_FAILED` は、実装では既存の `DUTY_HOOK_FAILED`（`kind` つき）を使う。
- `DUTY_REASSIGN_HOOK_FAILED` は、既存の `dutyReassignedHook.ts` の `DUTY_HOOK_FAILED`（warn）を使うか、U7 の文脈で `kind` を含めた専用のイベント名にするかをコード生成で整える。どちらでも `dutyId`・`kind` だけで、名前は書かない（NFR2.50、`reliability-design.md`）
- **`CALENDAR_TRANSACTION_CANCELED`（warn）と `DUTY_STATUS_RETRY`（info）の役割を分ける（R-03）**。U7 は既存の取引の仕組み（`writeTransaction`／`classifyCancellation`）をそのまま使うので、競合で取引が断られるたびに、共有の `classifyCancellation` が `CALENDAR_TRANSACTION_CANCELED`（warn。断られた `codes` の一覧）を**必ず 1 件出す**（U5・U6 と同じ既存の挙動。U7 はこの既存コードを変えない）。U7 が足す `DUTY_STATUS_RETRY`（info）は、その競合を**読み直してやり直した**という U7 の判断の事実を残すもの。前者は「取引が断られた生の事実（Code 付き）」、後者は「U7 が想定内の競合として 1 回やり直した」で、役割が違う
- 「競合は想定内で warn を増やさない」の狙いは、**U7 が新たに warn を足さない**こと（U7 が足すのは `DUTY_STATUS_RETRY` の info だけ）。既存の `CALENDAR_TRANSACTION_CANCELED`（warn）は共有コードが元から出すもので、U7 はこれを消さない（消すには共有の `classifyCancellation` を変える必要があり、U7 の範囲外）。したがって、競合 1 回につき `CALENDAR_TRANSACTION_CANCELED`（warn）1 件 ＋ `DUTY_STATUS_RETRY`（info）1 件が出る。warn の件数は U5・U6 と同じ水準で、U7 で増えない。想定内の競合を**件数で追うのは info の `DUTY_STATUS_RETRY`**、取引が断られた Code を見たいときは既存の warn を読む
- 2 回とも断られて 500 になったときは、`CALENDAR_TRANSACTION_CANCELED`（warn）が 2 件 ＋ `DUTY_STATUS_RETRY`（info）1 件（1 回目の読み直し）＋ `DUTY_STATUS_REJECTED`（`reason: INTERNAL`、info）1 件が出る（読み直しは 1 回だけなので 2 回目は `DUTY_STATUS_RETRY` を出さない。`reliability-design.md`）
- 確かめ方（NFR2.51）: ログの出し方の単体テストで、成功（5 とおりの状態変更）、確定、取り消し、各理由の断り、読み直し、`INTERNAL`、思いがけない失敗のそれぞれに、上のイベントが 1 件ずつ出て、必要な項目が入っていること

## ログに名前・単価・秘密を残さない（NFR2.52）

次は、成功、すべての断り、`INTERNAL`、思いがけない例外のどの分かれ道でも、ログに残さない。

| 出さないもの | 備え |
|-------------|------|
| 子供・管理者の表示名、お手伝いの名前 | `LogData` の型が `name`・`displayName` を受け付けない（U3・U4）。返事・確認の組み立ての値をログの引数に渡さない |
| LINE のユーザー ID | U7 は LINE を呼ばない。ログに渡す値はアプリの `userId` だけ |
| 単価と金額（markDone で書き写す単価も残さない） | 記録の事実は `familyId`・`dutyId`・`action`・`fromStatus`・`toStatus` で足りる。単価をログの引数に渡さない |
| 確認の 1 行の文言や注意（「お小遣いの回数から外れます」など） | 画面が出す値で、API はログに残さない |
| セッショントークン、署名の鍵、秘密のヘッダーの値 | 既存のとおり（`REQUEST_REJECTED` は `reason` だけ）。名前に `token`・`secret`・`signature`・`password`・`body`・`cookie` を含む項目は伏せ字 |

- `describeError` の `error` は例外の `message` とスタックで、U7 の例外は DynamoDB の失敗。例外を作るときに名前・単価を message に入れない
- 確かめ方（NFR2.52、NFR4.73）: 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・単価）を入れた担当・月で、成功・すべての断り・`INTERNAL`・思いがけない例外の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと

## かかった時間のログ（NFR7.38）

- **`REQUEST_END`**（既存。`durationMs`・`path`）は、`entries/api.ts` の `handler` の最初から最後まで。`path` はパスの型（`/v1/duties/:dutyId/status`、`/v1/months/:month/confirmation`）で、ID の実際の値は入らない（NFR4.26 の形。U5・U6 と同じ）。`coldStart`（`takeRequestMetrics`）が付く
- 状態の変更は `DUTY_STATUS_CHANGED` にも処理だけの `durationMs` を残す（`changeDutyStatus` の処理時間。読み直しの時間を含む）。`REQUEST_END` との差で、入口の共通処理（署名・`getConfig`）の時間が分かる
- 冷たい起動かどうかは、`api` の Lambda の `REPORT` の行の `Init Duration` で見分けられる（追加の実装は要らない）。3 秒の目標（NFR7.33、NFR7.34）を、サーバー側の時間（NFR7.37）と照らして原因を分けられる
- 確かめ方（NFR7.38）: ログから `durationMs` と `path`（型）を読めること。`api` の `REQUEST_END` が U7 の経路でも `durationMs` を持つこと。ステージングの測定で、`REPORT` の `Init Duration` の有無で冷たい起動を数えられること

## ログの項目の対応

| 操作 | イベント | 使う値 |
|------|---------|--------|
| 状態の変更（成功） | `DUTY_STATUS_CHANGED` | `familyId`、`dutyId`、`action`、`fromStatus`、`toStatus`、`durationMs`（アプリの ID と数だけ） |
| 状態の変更（断り） | `DUTY_STATUS_REJECTED` | `familyId`、`dutyId`（分かるとき）、`action`、`reason` |
| 確定・取り消し | `MONTH_CONFIRMED_SET` | `familyId`、`month`、`confirmed`（新しい値） |
| 共通 | `REQUEST_START` / `REQUEST_END` / `REQUEST_ERROR` | `path`（型）、`durationMs`、`requestId`（NFR2.6）、環境（NFR2.5）。既存の形 |

1 つの状態の変更のイベントで、ログは次の順に出る（同じ `requestId`）:

```text
REQUEST_START → [DUTY_STATUS_CHANGED | DUTY_STATUS_REJECTED]
  (競合のとき: CALENDAR_TRANSACTION_CANCELED(warn) + DUTY_STATUS_RETRY(info) が各読み直しごとに 1 件ずつ) → REQUEST_END
```

## 失敗の見つけ方（NFR2.53）

U7 の失敗を、ログから `event` と `reason` で検索できる形で残します。すべて 1 行 1 件の JSON で、`event` と（あれば）`reason`（または `error`）を持ちます（NFR2.5 の形）。

| 見たいこと | 検索の条件 |
|-----------|-----------|
| 状態の変更の失敗（読み直しが 2 回続けて断られた） | `event = DUTY_STATUS_REJECTED` かつ `reason = INTERNAL` |
| 思いがけない失敗（500） | `event = REQUEST_ERROR` |
| フックの失敗 | `event = DUTY_REASSIGN_HOOK_FAILED`（または `DUTY_HOOK_FAILED`） |
| 競合の多さ | `event = DUTY_STATUS_RETRY` の件数（参考。想定内の競合の件数。既存の `event = CALENDAR_TRANSACTION_CANCELED` の warn は断られた Code を見るときに読む） |

- U7 は指標（メトリクスフィルター）とアラームを足さない（NFR1.31）。U10 が、上のイベントを作り手への知らせ（15 分以内。NFR2）の対象に入れる（引き継ぎは `logical-components.md`）。それまでは、作り手が CloudWatch Logs で `INTERNAL` と 500 を検索して気づく
- 読み方の例（Logs Insights）:

```text
fields @timestamp, event, reason, dutyId
| filter event = "DUTY_STATUS_REJECTED" and reason = "INTERNAL"
| stats count() as n by bin(15m)
```

## SLI と見方

目標を決めるだけで、この段階では自動の判定は足しません（U10）。作り手が CloudWatch Logs Insights で読む目印です。

| SLI | 読み方 | 目標（要件） |
|-----|-------|------------|
| 状態の変更の返事の時間（サーバー側） | `REQUEST_END`（`path = /v1/duties/:dutyId/status`）の `durationMs` の 95 パーセンタイル。`REPORT` の `Init Duration` の有無で分けて読む | NFR7.37（95% が 2,000 ms 以内）。合格の判断は NFR7.33 の画面録画 |
| 確定・取り消しの返事の時間 | `path = /v1/months/:month/confirmation` の同じ値 | NFR7.37、NFR7.34 |
| 状態の変更の成功の割合 | `DUTY_STATUS_CHANGED` と `DUTY_STATUS_REJECTED` の理由別の件数 | `INTERNAL` は 0 を目指す（U10 で知らせる） |
| 競合の読み直し | `DUTY_STATUS_RETRY` の件数 | 参考（多ければ条件と順番を見直す） |

## 相関と保管

- `requestId` は U1 の仕組みでそのまま付く（`setRequestId`）。1 つの操作の事実は `DUTY_STATUS_CHANGED` か `DUTY_STATUS_REJECTED`（または `MONTH_CONFIRMED_SET`）の 1 行で足りる（取引の途中のログは出さない。読み直したときだけ `DUTY_STATUS_RETRY`）
- ログの保管は 30 日（U1、NFR2.7）。個人の名前は入らない
- 分散トレースは使わない（Lambda と DynamoDB だけ。費用 0 円の条件）

## ADR を立てない判断

見守りの設計に独立した ADR は立てません。U7 のログは U1〜U6 の既存のログの形（JSON の 1 行、`event`・`reason`・`durationMs`、名前・単価を残さない）をそのまま使い、イベント名を足すだけです。重要な判断は `reliability-design.md` の ADR-U7-01 にあります。

## Sources

- `construction/u7-review-confirm/nfr-requirements/observability-requirements.md`（NFR2.51〜NFR2.53、NFR7.38、ログの項目の対応）、`security-requirements.md`（NFR4.73）、`reliability-requirements.md`（NFR2.50）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.15、BR8.17、BR8.18）、`functional-spec.md`（状態の変更の印と返事の対応、次の単位への引き継ぎ）
- `construction/u6-recording/nfr-design/observability-design.md`（ログの形、`REQUEST_END`、SLI の書き方、失敗の見つけ方）
- `construction/u5-assignment-calendar/nfr-design/observability-design.md`（ログの形、`REQUEST_END`）
- 既存コード（読むだけ）: `lib/logger.ts`（`LogData`・伏せ字・`describeError`・`setRequestId`・`takeRequestMetrics`）、`entries/api.ts`（`REQUEST_START`・`REQUEST_REJECTED`・`REQUEST_ERROR`・`REQUEST_END`・`durationMs`・`path`）、`repositories/calendarRepository.ts`（`classifyCancellation` が競合のたびに出す `CALENDAR_TRANSACTION_CANCELED`（warn。`codes`）、`writeTransaction`）、`services/dutyReassignedHook.ts`（`DUTY_HOOK_FAILED`）

## Assumptions & Open Questions

- [assumption] 単価（markDone で書き写す値）をログに書かないのは、ログに残す利点（調べもの）より、家族のお小遣いの情報を残さない方を優先するためです（NFR2.52、BR8.17）。調べものには `dutyId` と `familyId`・`action`・`fromStatus`・`toStatus` で足ります
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は画面が数えるので、U7 の API はその数をログに残しません。確定したことは `MONTH_CONFIRMED_SET` で足ります
- [assumption] `DUTY_REASSIGN_HOOK_FAILED` の名前は、既存の `DUTY_HOOK_FAILED` を使うか専用の名前にするかをコード生成で決めます。どちらでも `dutyId`・`kind` だけで、名前は書きません（NFR2.50）
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます。`DUTY_STATUS_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED` の名前と形は U10 まで変えません
