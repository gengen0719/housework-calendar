# 見守りの設計（Monitoring Design）— U6 記録

U6（`u6-recording`）で、U1〜U5 の見守りに足すものです。`nfr-design/observability-design.md` の戦略を、既存の仕組み（`lib/logger.ts` の JSON ログ、`line` と `api` のロググループの 30 日保管、CloudWatch Logs Insights、Lambda と DynamoDB の標準メトリクス、U1 の Budgets）の上で実現します。**メトリクスフィルターもアラームもダッシュボードも足しません**（NFR1.25。知らせの仕組みは U10）。追加の費用はありません。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda `line` の `Errors`、`Throttles`、`Duration` | Lambda の標準メトリクス（U1） | U1 のとおり（新しいしきい値なし） | U6 の操作の思いがけない失敗と遅さも含まれる |
| `LINE_EVENT_DONE` の `durationMs`（`action` 別） | `line` のログ（Logs Insights で作り手が問い合わせる） | 95% が 2,000 ms 以内（NFR7.27。画面の 3 秒目標の補助） | サーバー側の時間。`record.do` と `record.list` に分けて読む。コールドスタートかどうかは Lambda の `REPORT` 行の `Init Duration` で見分ける |
| `REQUEST_END` の `durationMs`（`path = /v1/duties/:dutyId/record`） | `api` のログ | 95% が 3 秒以内（NFR7.29） | 画面からの記録の応答時間 |
| `DUTY_RECORDED` の件数（`route` 別） | `line` と `api` のログ | なし（参考） | 記録が使われている量の目安。`route = line` と `route = api` に分けて読む |
| `DUTY_RECORD_REJECTED` の件数（`reason` 別） | 同上 | `INTERNAL` は 0 を目指す（U10 で知らせる） | 断った理由の分布。`INTERNAL`（取引が 2 回続けて断られた）は調べものの対象 |
| `DUTY_RECORD_RETRY` の件数 | 同上 | なし（参考） | 競合のやり直しが多ければ、条件と順番を見直す。通常は 0 に近いはず |
| `LINE_REPLY_FAILED` の件数 | `line` のログ | 0 を目指す | 書けたのに返事が届かなかった件数。U10 で知らせる対象 |
| DynamoDB `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits`（`Calendar`、`ChoreTypes`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 見込み: 書き込み約 3,600 ユニット、読み取り約 3,300 ユニット / 月（U6 の増分。`scalability-design.md`） | 費用の見込みが合っているかを、U5 の最初の請求の確認に含めて見る |

- 見るのは作り手が必要なときだけです。ステージングの確認（`cicd-pipeline.md`）と、請求の確かめのときに使います
- `TABLE_NAME` は CloudFormation が付けた名前。`aws dynamodb list-tables` で `Calendar` を含む名前を探します

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用 | U1 の Budgets（月 1 ドル）が基準を超える見込み | 高 | メール（U1 のとおり） |
| U6 の新しいアラーム | **足さない** | — | — |

- `DUTY_RECORD_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`（`line`・`api`）、`LINE_REPLY_FAILED`、`DUTY_RECORDED_HOOK_FAILED` を 15 分以内に作り手へ知らせる仕組みは U10 で入れます（`nfr-design/observability-design.md`。`nfr-design/logical-components.md` の他の単位との約束）。それまでは、下の問い合わせで作り手が手で確かめます

## SLIs / SLOs

目標（SLO）を決めるだけで、自動の判定は足しません（U10）。

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| 「記録しました」の返事の時間（LINE の実機。押した瞬間から返事が届くまで） | 95% が 3 秒以内（NFR7.25） | ステージングで 20 回（冷たい起動 10 回以上を含む）。測定の手順は `cicd-pipeline.md` |
| 選択肢の返事の時間（LINE） | 95% が 3 秒以内（NFR7.26） | ステージングで 20 回 |
| サーバー側の時間（`LINE_EVENT_DONE.durationMs`、`action = record.do` / `record.list`） | 95% が 2,000 ms 以内（NFR7.27） | 上の測定と同じ期間（ログから読む） |
| 画面の記録の応答時間（`POST /v1/duties/:dutyId/record`、`coldStart` で分ける） | 95% が 3 秒以内（NFR7.29） | ステージングで 20 回（`api` の冷たい起動 10 回以上） |
| 記録の成功の割合 | `DUTY_RECORD_REJECTED`（`reason = INTERNAL`）は 0 を目指す | 直近 30 日 |

- 「画面で測った時間」が正です（NFR7.25 は LINE のアプリの画面録画から読み取る）。`LINE_EVENT_DONE.durationMs` は裏側の時間で、原因の切り分けに使います
- 冷たい起動は Lambda の `REPORT` 行の `Init Duration` から読みます

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID、30 日保管。ロググループは `line` と `api` の既存のもの（新しいロググループなし） |
| U6 のできごと（新しい `event` 名） | `DUTY_RECORDED`、`DUTY_RECORD_REJECTED`、`RECORD_LIST_SHOWN`、`RECORD_GUIDE_SENT`、`DUTY_RECORD_RETRY`、`LINE_REPLY_FAILED`（warn）、`DUTY_RECORDED_HOOK_FAILED`（warn）。項目は `nfr-design/observability-design.md` のとおり |
| `LINE_EVENT_DONE` への追加 | `action` を足す（`record.list`、`record.do`、または付けない）。既存の `type`、`durationMs` は変えない |
| `REQUEST_END` への追加 | `line` の `REQUEST_END` は U6 で項目を足さない（`coldStart` は `REPORT` の `Init Duration` で見分ける）。`api` の `REQUEST_END` は U5 の `path`・`durationMs`・`coldStart` のまま |
| `path` の書き方 | `/v1/duties/:dutyId/record`（ID の実際の値は入れない） |
| 書かないもの | LINE のユーザー ID、表示名、種類の名前、reply トークン、postback の data の全文、単価と金額。`nfr-design/observability-design.md` の「ログに出さないもの」のとおり |
| 分散トレース | 使わない（X-Ray なし。費用 0 円の条件） |
| ダッシュボード | 作らない（U10 で決める） |

作り手が手で使う問い合わせ（CloudWatch Logs Insights）:

```text
# 1. record.do / record.list の時間（コールドスタートは REPORT 行で分ける）
fields @timestamp, action, durationMs
| filter event = "LINE_EVENT_DONE" and action in ["record.do", "record.list"]
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, count() as n by action
```

```text
# 2. 記録の結果（成功・断り・理由）
fields @timestamp, event, dutyId, route, reason, alreadyRecorded, durationMs
| filter event in ["DUTY_RECORDED", "DUTY_RECORD_REJECTED"]
| sort @timestamp desc
| limit 50
```

```text
# 3. 競合の読み直しと INTERNAL があったか
stats count() as n by event, reason
| filter event in ["DUTY_RECORD_RETRY", "DUTY_RECORD_REJECTED"]
```

```text
# 4. 返事の失敗とフックの失敗（0 件ならよい）
stats count() as n by event
| filter event in ["LINE_REPLY_FAILED", "DUTY_RECORDED_HOOK_FAILED"]
```

```text
# 5. 画面の記録の時間（path 別、coldStart 別）
fields @timestamp, path, durationMs, coldStart
| filter event = "REQUEST_END" and path = "/v1/duties/:dutyId/record"
| stats pct(durationMs, 95) as p95, count() as n by coldStart
```

- 配備した直後の本番では、問い合わせ 3・4 を一度見て 0 件であることを確かめます
- 問い合わせ 1 の測定期間は、ステージングへの反映から 20 回の測定が終わるまでです

## Sources

- `construction/u6-recording/nfr-design/observability-design.md`（NFR2.40〜NFR2.43、NFR7.32、ログの項目と守り）
- `construction/u6-recording/nfr-design/performance-design.md`（NFR7.25〜NFR7.30、SLO の目標）
- `construction/u6-recording/nfr-design/logical-components.md`（U10 への引き継ぎ、指標とアラームを足さない）
- `construction/u6-recording/infrastructure-design/infrastructure-specification.md`
- `construction/u5-assignment-calendar/infrastructure-design/monitoring-design.md`（形の手本）

## Assumptions & Open Questions

- [assumption] `LINE_EVENT_DONE` に `action` を足しても、`durationMs` や `type` など既存の項目は変わりません。既存のテストへの影響はコード生成で確かめます
- [assumption] `REPORT` の行の `Init Duration` は Lambda が自動で出すので、インフラの追加は要りません。`line` の Lambda でコールドスタートが起きたかどうかは、この値の有無で判断します
- 追加の質問はありません
