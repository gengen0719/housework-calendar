# 見守りの設計（Observability Design）— U6 記録

U6（`u6-recording`）の見守りの要件（NFR2.40〜NFR2.43、NFR7.32）を、どう作るかを書きます。U1〜U5 の `lib/logger.ts`（JSON の 1 行、リクエスト ID、30 日、伏せ字）と、`entries/line.ts` の既存のログ（`REQUEST_START`、`LINE_EVENT_IGNORED`、`LINE_EVENT_SKIPPED`、`LINE_EVENT_DUPLICATE`、`LINE_EVENT_DONE`、`REQUEST_REJECTED`、`REQUEST_ERROR`、`REQUEST_END`）をそのまま使います。U6 は指標とアラームを足しません（NFR1.25）。

## 記録のできごとのログ（NFR2.40）

| `event` | レベル | いつ | 項目 |
|---------|-------|------|------|
| `DUTY_RECORDED` | info | 記録が成功した（書けた、または `alreadyRecorded`） | `familyId`、`dutyId`、`route`（`line` か `api`）、`alreadyRecorded`（真偽値）、`durationMs`、`userId` |
| `DUTY_RECORD_REJECTED` | info | 記録を断った | `familyId`、`dutyId`（形が正しく分かるとき）、`route`、`reason`（`NOT_OWN_DUTY`、`DUTY_ALREADY_DONE`、`MONTH_CONFIRMED`、`DUTY_SKIPPED_BY_ADMIN`、`FUTURE_DUTY`、`NOT_TODAY_DUTY`、`DUTY_CHANGED`、`NOT_FOUND`、`INTERNAL`）、`userId` |
| `RECORD_LIST_SHOWN` | info | 「やった」で今日の担当の返事を出した | `familyId`、`userId`、`selectableCount`、`notSelectableCount`、`reason`（`MONTH_CONFIRMED` か `NO_RECORDABLE_DUTY`。選択肢を出したときは付けない） |
| `RECORD_GUIDE_SENT` | info | 管理者・家族外に決まった案内を返した | `reason`（`ADMIN` か `NOT_IN_FAMILY`）、`familyId` と `userId`（分かるときだけ） |
| `DUTY_RECORD_RETRY` | info | 取引が競合で断られ、読み直した | `familyId`、`dutyId`、`route`、`failed`（断られた項目の組。`duty`、`month`、`price` のうち当てはまるもの） |
| `LINE_REPLY_FAILED` | warn | 書けたあと（または案内の）reply が失敗した | `type`、`error`（`describeError`。U1〜U3 と同じ名前と形） |
| `DUTY_RECORDED_HOOK_FAILED` | warn | `onDutyRecorded` に登録された関数が投げた | `familyId`、`dutyId`、`error` |
| 思いがけない失敗 | error | 例外（(b)） | `REQUEST_ERROR`（U1 の入口。`describeError`） |

- 記録の成否の事実は、`recordDuty` の中（`recordingService.ts`）で出す。LINE と画面の両方で同じ項目になる（`route` で分ける）。`durationMs` は `recordDuty` の最初から、結果が決まるまでの時間（LINE の reply と `markDone` は含めない）
- 利用者は、LINE のユーザー ID ではなく**アプリの `userId`** で残す。取引の読み直しは warn ではなく info（想定内の競合）。`DUTY_RECORD_REJECTED` の `INTERNAL`（読み直しが 2 回続けて断られた）も info だが、検索の対象にする（下の「失敗の見つけ方」）。info にする理由: 2 回連続の断りは再試行で回復しうる想定で、U10 が知らせの対象にする。異常が続く場合は U10 のアラートが検知する（Minor 3/3）
- `RECORD_LIST_SHOWN` は、出し直し（`DUTY_CHANGED` などのあとに今の選択肢を付けた）でも出す。出し直しのときは直前に `DUTY_RECORD_REJECTED` が出ているので、続けて読める

## ログに出さないもの（NFR2.41、NFR2.42、NFR5.12）

次は、成功、すべての断り、`INTERNAL`、思いがけない例外、返事の失敗のどの分かれ道でも、ログに残さない。

| 出さないもの | 備え |
|-------------|------|
| LINE のユーザー ID（`source.userId`） | ログに渡す値はアプリの `userId` だけ。`oneToOneGate` の戻りは `userId` を持ち、LINE のユーザー ID を返さない |
| 利用者・子供の表示名、種類の名前 | `LogData` の型が `name`・`displayName`・`description` を受け付けない（U3・U4）。返事の組み立ての中の値をログの引数に渡さない |
| reply トークン | 名前に `token` を含む項目は型でも伏せ字でも防がれる。`replyToken` を変数名にもログに渡さない |
| postback の data の全文、Webhook の本文 | 形の外れた値は `LINE_EVENT_IGNORED` に `type` だけを書く（NFR2.42）。`dutyId` は**パースできたあと**にだけログに渡す。生の `data` 文字列は渡さない |
| Flex Message や返事の本文 | 返事は組み立てて送るだけ。`reply` に渡す配列をログに渡さない |
| チャネルのトークン・シークレット、署名、秘密のヘッダーの値 | 既存のとおり（`REQUEST_REJECTED` は `reason` だけ） |
| 単価と金額 | 記録の事実は担当の ID と家族の ID で足りる（調べものには `DUTY_RECORDED` と担当の ID）。家族のお小遣いの情報をログに残さない |

- 項目の名前に `body`、`token`、`secret`、`signature`、`password`、`cookie` を含む語を使わない（伏せ字になるため、調べものに使えなくなる）
- `describeError` の `error` はエラーの `message` とスタックで、U6 の例外は DynamoDB・LINE の API の失敗。`LineApiError` の message は経路の先頭の 4 区切りまでで、トークンを含まない（U1）。**例外を作るときに postback の data や名前を message に入れない**
- 確かめ方（NFR2.41）: 作り物の値（`<作り物の値>` の目印を付けた表示名、種類の名前、LINE のユーザー ID、reply トークン、data）を入れたイベントを、成功、すべての断り、`INTERNAL`、思いがけない例外、返事の失敗の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないことを、単体テストで確かめる。`DUTY_RECORD_REJECTED` の各理由で必要な項目が入ることも確かめる

## 既存のログの印との関係（NFR7.32）

1 つの `record.do` のイベントで、ログは次の順に出ます（同じ `requestId`）。

```text
REQUEST_START → (accepts) → [DUTY_RECORDED | DUTY_RECORD_REJECTED] (+ RECORD_LIST_SHOWN) → LINE_EVENT_DONE → REQUEST_END
```

- **`LINE_EVENT_DONE`**（既存。`type`、`durationMs`）に、`action` を足す。値は `parseRecordCommand` の結果から決まる**固定の 2 つの値**（`record.list`、`record.do`）か、記録以外の操作では付けない。data の文字そのものは書かない。これで、NFR7.27 の `record.do` と `record.list` を、ログから分けて読める。`durationMs` は、`begin` の後から `markDone` の後まで（`handle` と `markDone`。`getConfig`、署名の確かめ、`begin` は入らない。NFR7.27 のとおり）
- **`REQUEST_END`**（既存。`durationMs`）は、`handler` の最初から最後まで。署名の確かめと `begin` を含むので、実態に近い。両者の差が `getConfig`、署名の確かめ、`begin` の合計で、冷たい起動の `Init Duration` は Lambda の `REPORT` の行で別に読む。U6 は `line` の `REQUEST_END` に項目を足さない（`coldStart` は `REPORT` の `Init Duration` で見分けられる。追加の実装は要らない）
- **`LINE_EVENT_IGNORED`**（既存。`type` だけ）は、形の外れた `record.*`、`group` と `room` からの `record.*`、`replyToken` のない `record.*` で出る
- 画面の記録: `REQUEST_END` の `path` はパスの型（`/v1/duties/:dutyId/record`）で、ID の実際の値は入らない。`durationMs` と `coldStart`（U5 の `takeRequestMetrics`）が付く。`dutyCount` は付かない（保存の操作ではないため）
- `LINE_EVENT_DONE` に `action` を足すと、既存のログの形を確かめる単体テストが影響を受けるか、コード生成で確かめる（項目の追加だけで、既存の項目は変えない）

## 失敗の見つけ方（NFR2.43）

U6 の失敗を、ログから `event` と `reason` で検索できる形で残します。すべて 1 行 1 件の JSON で、`event` と（あれば）`reason` を持ちます（NFR2.5 の形）。

| 見たいこと | 検索の条件 |
|-----------|-----------|
| 記録の失敗（読み直しが 2 回続けて断られた） | `event = DUTY_RECORD_REJECTED` かつ `reason = INTERNAL` |
| 思いがけない失敗（500） | `event = REQUEST_ERROR`（`line` と `api` の両方） |
| 返事が送れなかった | `event = LINE_REPLY_FAILED` |
| フックの失敗 | `event = DUTY_RECORDED_HOOK_FAILED` |
| 二度処理しない記録の戻しの失敗 | `event = LINE_EVENT_RELEASE_FAILED`（既存） |
| 競合の多さ | `event = DUTY_RECORD_RETRY` の件数（参考） |

- U6 は指標（メトリクスフィルター）とアラームを足さない（無料枠のカスタム指標の数を、U10 が見て使う。NFR1.25）。U10 が、上の表のイベントを作り手への知らせ（15 分以内。NFR2）の対象に入れる（引き継ぎは `logical-components.md`）。それまでは、作り手が CloudWatch Logs で `INTERNAL` と 500 を検索して気づく

## SLI と見方

目標を決めるだけで、この段階では自動の判定は足しません（U10）。作り手が CloudWatch Logs Insights で読む目印です。

| SLI | 読み方 | 目標（要件） |
|-----|-------|------------|
| 「記録しました」の返事の時間（サーバー側） | `LINE_EVENT_DONE`（`action = record.do`）と `REQUEST_END` の `durationMs` の 95 パーセンタイル。`REPORT` の `Init Duration` の有無で分けて読む | NFR7.27（95% が 2,000 ms 以内）。合格の判断は NFR7.25 の画面録画 |
| 選択肢の返事の時間 | `action = record.list` の同じ値 | NFR7.26、NFR7.27 |
| 画面の記録の時間 | `path = /v1/duties/:dutyId/record` の `durationMs`（`coldStart` で分ける） | NFR7.29 |
| 記録の成功の割合 | `DUTY_RECORDED` と `DUTY_RECORD_REJECTED` の理由別の件数 | `INTERNAL` は 0 を目指す（U10 で知らせる） |
| 競合の読み直し | `DUTY_RECORD_RETRY` の件数 | 参考（多ければ条件と順番を見直す） |

読み方の例（Logs Insights）:

```text
fields @timestamp, action, durationMs
| filter event = "LINE_EVENT_DONE" and action in ["record.do", "record.list"]
| stats pct(durationMs, 95) as p95, count() as n by action
```

## 相関と保管

- `requestId` は U1 の仕組みでそのまま付く（`setRequestId`）。1 つのイベントの記録の事実は `DUTY_RECORDED` か `DUTY_RECORD_REJECTED` の 1 行で足りる（取引の途中のログは出さない。読み直したときだけ `DUTY_RECORD_RETRY`）
- ログの保管は 30 日（U1、NFR2.7）。個人の名前は入らない
- 分散トレースは使わない（Lambda と DynamoDB と LINE の reply だけ。費用 0 円の条件）

## Sources

- `construction/u6-recording/nfr-requirements/observability-requirements.md`（NFR2.40〜NFR2.43、NFR7.32）、`performance-requirements.md`（NFR7.27）、`security-requirements.md`（NFR5.12）
- `construction/u6-recording/functional-design/rules.md`（BR7.16、BR7.17）
- `construction/u5-assignment-calendar/nfr-design/observability-design.md`（ログの形、`REQUEST_END`、SLI の書き方）
- 既存コード（読むだけ）: `lib/logger.ts`（`LogData`、伏せ字、`describeError`、`takeRequestMetrics`）、`entries/line.ts`（`REQUEST_START`、`LINE_EVENT_*`、`REQUEST_END`）、`handlers/line/groupEventHandler.ts`（`LINE_REPLY_FAILED`）、`services/lineApiService.ts`（`LineApiError`）

## Assumptions & Open Questions

- [assumption] `LINE_EVENT_DONE` に `action` を足すのは、`processEvent` の 1 か所です。`action` は `parseRecordCommand` の戻りの種類から作る固定の値で、生の `data` を使いません。既存のログの形を使う単体テストは、項目が増えても通るはずですが、コード生成で確かめます
- [assumption] 金額（単価）をログに書かないのは、ログに残す利点（調べもの）より、家族のお小遣いの情報を残さない方を優先するためです（NFR 要件のまま）。記録の調べものには、担当の ID と家族の ID で足ります
- [assumption] `userId`（アプリの ID）は個人を直接示す名前ではないので、ログに残します（U2〜U5 と同じ）
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます。`DUTY_RECORD_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`、`LINE_REPLY_FAILED`、`DUTY_RECORDED_HOOK_FAILED` の名前と形は U10 まで変えません
