# 見守りの設計（Monitoring Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）で、U1〜U6 の見守りに足すものです。`nfr-design/observability-design.md` の戦略を、既存の仕組み（`lib/logger.ts` の JSON ログ、`api` のロググループの 30 日保管、CloudWatch Logs Insights、Lambda と DynamoDB の標準メトリクス、U1 の Budgets）の上で実現します。**メトリクスフィルターもアラームもダッシュボードも足しません**（NFR1.31、NFR2.53。知らせの仕組みは U10）。U7 は画面用 API だけなので、見るのは `api` のログだけです（`line` のログは U7 では増えません）。追加の費用はありません。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda `api` の `Errors`・`Throttles`・`Duration` | Lambda の標準メトリクス（U1） | U1 のとおり（新しいしきい値なし） | U7 の操作の思いがけない失敗と遅さも含まれる |
| `REQUEST_END` の `durationMs`（`path = /v1/duties/:dutyId/status`） | `api` のログ | 95% が 2,000 ms 以内（NFR7.37。画面の 3 秒目標の補助） | 状態の変更のサーバー側の時間。`REPORT` の `Init Duration` の有無でコールドスタートを分けて読む |
| `REQUEST_END` の `durationMs`（`path = /v1/months/:month/confirmation`） | `api` のログ | 95% が 2,000 ms 以内（NFR7.37） | 確定・取り消しのサーバー側の時間 |
| `DUTY_STATUS_CHANGED` の処理の `durationMs`（`action` 別） | `api` のログ（Logs Insights で作り手が問い合わせる） | 参考（`REQUEST_END` との差で入口の共通処理の時間が分かる） | `changeDutyStatus` の処理時間（読み直しを含む）。`cancel`・`markDone`・`markSkipped`・`unmarkSkipped` に分けて読む |
| `DUTY_STATUS_CHANGED` の件数（`action` 別） | `api` のログ | なし（参考） | 修正の操作がどれくらい使われているか |
| `DUTY_STATUS_REJECTED` の件数（`reason` 別） | 同上 | `INTERNAL` は 0 を目指す（U10 で知らせる） | 断った理由の分布。`INTERNAL`（取引が 2 回続けて断られた）は調べものの対象 |
| `DUTY_STATUS_RETRY` の件数 | 同上 | なし（参考） | 想定内の競合のやり直しの件数。多ければ条件と順番を見直す。通常は 0 に近いはず |
| `CALENDAR_TRANSACTION_CANCELED` の件数（warn） | `api` のログ（既存の共有コードが競合のたびに出す） | U5・U6 と同じ水準（U7 で増えない） | 取引が断られた生の事実（`codes` 付き）。想定内の競合は `DUTY_STATUS_RETRY`（info）の件数で追う |
| `DUTY_REASSIGN_HOOK_FAILED` の件数（warn） | `api` のログ | 0 を目指す（U8 まで登録がなく出ない） | 登録されたフックが投げた件数。U10 で知らせる対象。`dutyId`・`kind` だけ |
| DynamoDB `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits`（`Calendar`、`ChoreTypes`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 見込み: 月に数百ユニット未満（U7 の増分。`scalability-design.md`） | 費用の見込みが合っているかを、U5 の最初の請求の確認に含めて見る |

- 見るのは作り手が必要なときだけです。ステージングの確認（`cicd-pipeline.md`）と、請求の確かめのときに使います
- `TABLE_NAME` は CloudFormation が付けた名前。`aws dynamodb list-tables` で `Calendar` を含む名前を探します

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用 | U1 の Budgets（月 1 ドル）が基準を超える見込み | 高 | メール（U1 のとおり） |
| U7 の新しいアラーム | **足さない** | — | — |

- **注記（コード生成後）:** この文書の表と問い合わせにある `DUTY_REASSIGN_HOOK_FAILED` は、実装では既存の `DUTY_HOOK_FAILED`（`kind` つき）を使う。問い合わせの `event` もその名前で読み替える。
- `DUTY_STATUS_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED` を 15 分以内に作り手へ知らせる仕組みは U10 で入れます（`nfr-design/observability-design.md`・`logical-components.md` の他の単位との約束）。それまでは、下の問い合わせで作り手が手で確かめます
- `CALENDAR_TRANSACTION_CANCELED`（warn）は共有の `classifyCancellation` が元から出すもので、U7 はこれを消しも増やしもしません（消すには共有コードを変える必要があり U7 の範囲外）。想定内の競合を件数で追うのは info の `DUTY_STATUS_RETRY` です

## SLIs / SLOs

目標（SLO）を決めるだけで、自動の判定は足しません（U10）。合格の判断は画面録画です。

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| 状態の変更の返事の時間（画面。確認の「はい」から新しい状態の表示まで。代表は取引の項目が最も多い markDone） | 95% が 3 秒以内（NFR7.33） | ステージングで 20 回（冷たい起動 10 回以上を含む）。測定の手順は `cicd-pipeline.md` |
| 確定・取り消しの返事の時間（画面。確認の「はい」から「確定済み」が出る・消えるまで） | 95% が 3 秒以内（NFR7.34） | 確定・取り消し各 20 回（行の無い月への初回の確定を 3 回含める） |
| サーバー側の時間（`REQUEST_END.durationMs`、`path = /v1/duties/:dutyId/status`） | 95% が 2,000 ms 以内（NFR7.37） | 上の測定と同じ期間（ログから読む）。コールドスタートは `REPORT` の `Init Duration` で分ける |
| サーバー側の時間（`REQUEST_END.durationMs`、`path = /v1/months/:month/confirmation`） | 95% が 2,000 ms 以内（NFR7.37） | 同上 |
| 状態の変更の成功の割合 | `DUTY_STATUS_REJECTED`（`reason = INTERNAL`）は 0 を目指す | 直近 30 日 |

- 「画面で測った時間」が正です（NFR7.33・NFR7.34 は画面録画から読み取る）。`REQUEST_END.durationMs` は裏側の時間で、原因の切り分けに使います
- 冷たい起動は `api` の Lambda の `REPORT` 行の `Init Duration` から読みます

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID（`requestId`）、30 日保管。ロググループは `api` の既存のもの（新しいロググループなし） |
| U7 のできごと（新しい `event` 名） | `DUTY_STATUS_CHANGED`（info）、`DUTY_STATUS_REJECTED`（info）、`MONTH_CONFIRMED_SET`（info）、`DUTY_STATUS_RETRY`（info）、`DUTY_REASSIGN_HOOK_FAILED`（warn）。項目は `nfr-design/observability-design.md` のとおり |
| 既存の warn との役割分け | 競合 1 回につき `CALENDAR_TRANSACTION_CANCELED`（warn。既存。`codes` 付き）1 件 ＋ `DUTY_STATUS_RETRY`（info。U7）1 件。U7 が新たに足す warn はない（R-03） |
| `DUTY_STATUS_CHANGED` の項目 | `familyId`・`dutyId`・`action`・`fromStatus`・`toStatus`・`durationMs`（処理だけ）。アプリの ID と数だけ |
| `MONTH_CONFIRMED_SET` の項目 | `familyId`・`month`・`confirmed`（新しい値。確定で true、取り消しで false） |
| `REQUEST_END` への追加 | `api` の `REQUEST_END` は U7 で項目を足さない（U5・U6 の `path`・`durationMs`・`coldStart` のまま）。`path` は型（`/v1/duties/:dutyId/status`、`/v1/months/:month/confirmation`）で ID の実際の値は入れない |
| 書かないもの | 子供・管理者の表示名、お手伝いの名前、LINE のユーザー ID、単価と金額（markDone で書き写す単価も）、確認の文言、セッショントークン・署名の鍵・秘密のヘッダーの値。`nfr-design/observability-design.md`・`security-design.md` の「ログに出さないもの」のとおり。利用者はアプリの `userId`（`ctx.userId`）で残す |
| 分散トレース | 使わない（X-Ray なし。費用 0 円の条件） |
| ダッシュボード | 作らない（U10 で決める） |

1 つの状態の変更のイベントで、ログは次の順に出ます（同じ `requestId`）:

```text
REQUEST_START → [DUTY_STATUS_CHANGED | DUTY_STATUS_REJECTED]
  (競合のとき: CALENDAR_TRANSACTION_CANCELED(warn) + DUTY_STATUS_RETRY(info) が各読み直しごとに 1 件ずつ) → REQUEST_END
```

作り手が手で使う問い合わせ（CloudWatch Logs Insights）:

```text
# 1. 状態の変更の処理の時間（action 別。コールドスタートは REPORT 行で分ける）
fields @timestamp, action, durationMs
| filter event = "DUTY_STATUS_CHANGED"
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, count() as n by action
```

```text
# 2. 状態の変更の結果（成功・断り・理由）
fields @timestamp, event, dutyId, action, fromStatus, toStatus, reason, durationMs
| filter event in ["DUTY_STATUS_CHANGED", "DUTY_STATUS_REJECTED"]
| sort @timestamp desc
| limit 50
```

```text
# 3. 競合の読み直しと INTERNAL があったか
stats count() as n by event, reason
| filter event in ["DUTY_STATUS_RETRY", "DUTY_STATUS_REJECTED"]
```

```text
# 4. 思いがけない失敗とフックの失敗（0 件ならよい）
stats count() as n by event
| filter event in ["REQUEST_ERROR", "DUTY_REASSIGN_HOOK_FAILED"]
```

```text
# 5. 確定・取り消しの事実と、状態の変更・確定の返事の時間（path 別、coldStart 別）
fields @timestamp, event, path, month, confirmed, durationMs, coldStart
| filter event = "REQUEST_END" and path in ["/v1/duties/:dutyId/status", "/v1/months/:month/confirmation"]
| stats pct(durationMs, 95) as p95, count() as n by path, coldStart
```

```text
# 6. INTERNAL（読み直しが 2 回続けて断られた）を時間帯で見る
fields @timestamp, event, reason, dutyId
| filter event = "DUTY_STATUS_REJECTED" and reason = "INTERNAL"
| stats count() as n by bin(15m)
```

- 配備した直後の本番では、問い合わせ 3・4 を一度見て 0 件であることを確かめます
- 問い合わせ 1・5 の測定期間は、ステージングへの反映から 20 回の測定が終わるまでです

## Sources

- `construction/u7-review-confirm/nfr-design/observability-design.md`（NFR2.51〜NFR2.53、NFR7.38、ログの項目と守り、SLI と見方、失敗の見つけ方、既存 warn と U7 の retry の役割分け）
- `construction/u7-review-confirm/nfr-design/performance-design.md`（NFR7.33・NFR7.34・NFR7.37、SLO の目標、コールドスタートの読み方）
- `construction/u7-review-confirm/nfr-design/security-design.md`（NFR4.73、ログに名前・単価を出さない）
- `construction/u7-review-confirm/nfr-design/logical-components.md`（U10 への引き継ぎ、指標とアラームを足さない）
- `construction/u7-review-confirm/infrastructure-design/infrastructure-specification.md`
- `construction/u6-recording/infrastructure-design/monitoring-design.md`（形の手本）

## Assumptions & Open Questions

- [assumption] U7 のできごとのログは `api` のロググループにだけ出ます（U7 は LINE の経路を持たないため、`line` のログは U7 で増えません）。ロググループの追加はありません
- [assumption] `REPORT` の行の `Init Duration` は Lambda が自動で出すので、インフラの追加は要りません。`api` の Lambda でコールドスタートが起きたかどうかは、この値の有無で判断します
- [assumption] `DUTY_REASSIGN_HOOK_FAILED` の名前は、既存の `DUTY_HOOK_FAILED` を使うか専用の名前にするかをコード生成で整えます。どちらでも `dutyId`・`kind` だけで、名前は書きません（NFR2.50）
- 追加の質問はありません
