# 見守りの設計（Monitoring Design）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）で、U1〜U4 の見守りに足すものです。`nfr-design/observability-design.md` の戦略を、既存の仕組み（`lib/logger.ts` の JSON ログ、`api` のロググループの 30 日保管、CloudWatch Logs Insights、Lambda と DynamoDB の標準メトリクス、U1 の Budgets）の上で実現します。**メトリクスフィルターもアラームもダッシュボードも足しません**（知らせの仕組みは U10）。追加の費用はありません。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda `api` の `Errors`、`Throttles`、`Duration` | Lambda の標準メトリクス（U1） | U1 のとおり（新しいしきい値なし） | U5 の操作の思いがけない失敗と遅さも含まれる |
| `REQUEST_END` の `durationMs`（`path` 別、`coldStart` 別） | `api` のログ（Logs Insights で作り手が問い合わせる） | 95% が 3 秒以内（NFR7.20〜NFR7.23） | 画面で測る時間の裏付け。コールドスタートの有無で分けて読む |
| `REQUEST_END` の `dutyCount`（保存のときだけ） | 同上 | なし（読み方の目印） | 保存が 3 秒に近づいたとき、担当の数と照らして原因を切り分ける（NFR7.24） |
| `ASSIGNMENT_SAVED` の `attempts = 2` の件数 | 同上 | なし（参考） | 競合のやり直しが多ければ、条件と書く順番を見直す |
| `ASSIGNMENT_PARTIAL_FAILURE` の件数 | 同上 | 0 を目指す（U10 まで手で見る） | 担当が新旧まざった状態が残った印。管理者に保存し直してもらう |
| `DUTY_HOOK_FAILED` の件数 | 同上 | 0 を目指す | U8 の取り下げ漏れの元（U8 が入るまでは何も登録されないので 0 のはず） |
| DynamoDB `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits`（`Calendar` の `TableName`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 見込み: 書き込み約 1100 ユニット、読み取り約 7000 ユニット / 月 | 費用の見込みが合っているかを、請求より先に確かめる（`cicd-pipeline.md` の「費用の確かめ（最初の請求）」） |
| DynamoDB `ThrottledRequests`、`SystemErrors`、`TransactionConflict`、`ConditionalCheckFailedRequests`（`Calendar`） | CloudWatch の標準メトリクス。`ThrottledRequests` と `SystemErrors` は **Operation ごと**（`PutItem`、`UpdateItem`、`DeleteItem`、`TransactWriteItems`、`Query`、`GetItem` など）のディメンションで分けて見る | 0 に近いこと（見るだけ。アラームなし） | 条件による断りは設計どおりの動き。`TransactionConflict` が続けて出るなら、同時の保存が重なっている。Operation で分けないと、どの操作が詰まったか分からない |

- 見るのは作り手が必要なときだけです。ステージングの確認（`cicd-pipeline.md`）と、請求の確かめのときに使います
- DynamoDB の標準メトリクスは CloudWatch に自動で出ます。`TableName` は CloudFormation が付けた名前なので、`aws dynamodb list-tables`（または CloudWatch のメトリクス一覧）で `Calendar` を含む名前を探します

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用 | U1 の Budgets（月 1 ドル）が基準を超える見込み | 高 | メール（U1 のとおり） |
| U5 の新しいアラーム | **足さない** | — | — |

- 保存の途中の失敗（`ASSIGNMENT_PARTIAL_FAILURE`）を 15 分以内に作り手へ知らせる仕組みは U10 で入れます（`nfr-design/observability-design.md`）。それまでは、ステージングの確認のあとと、本番で管理者から「保存できなかった」と聞いたときに、下の問い合わせで確かめます
- U1 の `InvitationInvalidCount` のメトリクスフィルターは変えません。U5 の理由の印は別の `event` なので、そのフィルターには掛かりません

## SLIs / SLOs

目標（SLO）を決めるだけで、自動の判定は足しません（U10）。

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| カレンダーを開く時間（`path = /v1/months/:month/calendar`、前後の月を含む）。コールドスタートを含める | 95% が 3 秒以内（NFR7.20、NFR7.21） | ステージングで 20 回ずつ。本番は Logs Insights で直近 30 日 |
| 割り当ての保存の時間（`path = /v1/months/:month/assignment` の PUT）。124 件と、種類 10 個の約 310 件 | 95% が 3 秒以内（NFR7.22） | ステージングで各 20 回。本番は直近 30 日 |
| 日ごとの担当の変更の時間（`path = /v1/duties/:dutyId`） | 95% が 3 秒以内（NFR7.23） | ステージングで 20 回。本番は直近 30 日 |
| 保存の成功の割合 | 部分的な失敗は 0。1 つも書けない `INTERNAL` も 0 を目指す | 直近 30 日（`ASSIGNMENT_SAVED` と `ASSIGNMENT_PARTIAL_FAILURE`、`ASSIGNMENT_REJECTED` の `reason = INTERNAL` の件数） |

- 「画面で測った時間」が正です（NFR7.20 は LIFF の初期化からカレンダーが描かれるまで）。ログの `durationMs` は裏側の時間で、画面の時間と並べて、遅いときの原因が裏側か画面かを切り分けるために使います
- 起動の遅れは Lambda の `REPORT` 行の `Init Duration` から読みます

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID、30 日保管。ロググループは `api` の既存のもの（新しいロググループなし） |
| U5 のできごと | `ASSIGNMENT_SAVED`、`ASSIGNMENT_REJECTED`、`ASSIGNMENT_PARTIAL_FAILURE`、`DUTY_CHILD_CHANGED`、`DUTY_CHANGE_REJECTED`、`DUTY_HOOK_FAILED`（項目は `nfr-design/observability-design.md` のとおり） |
| `REQUEST_END` への追加 | `coldStart`（実行環境の最初の要求だけ true）、`dutyCount`（保存のときだけ）。既存の項目は変えない |
| `path` の書き方 | パスの型（`/v1/months/:month/calendar`、`/v1/months/:month/assignment`、`/v1/duties/:dutyId`）。月や ID の実際の値は書かない |
| 書かないもの | 種類の名前、子供の表示名、割り当ての行の中身（`rules`）、上書きの一覧、`confirmedChangesHash` の値。型（`LogData`）と実行時の伏せ字の両方で防ぐ。書くのは家族・利用者・担当・種類の ID、数、理由の印だけ |
| 分散トレース | 使わない（X-Ray なし。Lambda 1 つと DynamoDB だけ。費用 0 円の条件） |
| ダッシュボード | 作らない（月に 3 個までの無料枠の外にならないよう、必要になったら U10 で決める） |

作り手が手で使う問い合わせ（CloudWatch Logs Insights。対象は `api` のロググループ）:

```text
# 1. 3 つの操作の時間（コールドスタート別）
fields @timestamp, path, durationMs, coldStart
| filter event = "REQUEST_END" and (path like /months/ or path like /duties/)
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, count() as n by path, coldStart
```

```text
# 2. 保存の結果（成功、断り、途中の失敗）と、担当の数
fields @timestamp, event, month, mode, dutyCount, createdCount, changedCount, deletedCount, chunkCount, attempts, reason, committedChunks, totalChunks
| filter event in ["ASSIGNMENT_SAVED", "ASSIGNMENT_REJECTED", "ASSIGNMENT_PARTIAL_FAILURE"]
| sort @timestamp desc
| limit 50
```

```text
# 3. 担当の子供の変更と、その断り
fields @timestamp, event, dutyId, fromChildUserId, toChildUserId, reason
| filter event in ["DUTY_CHILD_CHANGED", "DUTY_CHANGE_REJECTED"]
| sort @timestamp desc
| limit 50
```

```text
# 4. 部分的な失敗とフックの失敗があったか（0 件ならよい）
stats count() as n by event
| filter event in ["ASSIGNMENT_PARTIAL_FAILURE", "DUTY_HOOK_FAILED"]
```

- 配備した直後の本番では、4 を一度見て 0 件であることを確かめます
- 「本番の `Calendar` にまだ項目がない」かどうかは、**ログだけで判断しません**。ログ（問い合わせ 2）は `ASSIGNMENT_SAVED` に加えて `ASSIGNMENT_PARTIAL_FAILURE` も 0 件であることを見ますが、保管は 30 日なので、30 日より前は分かりません。判断は `cicd-pipeline.md` の「項目がないことの確かめ方」（作り手が手元の読み取り専用の権限で、遅れのない読み取りで件数を数える。書き込みはしない。`describe-table` の `ItemCount` は更新が遅いので使わない。補助は `ConsumedWriteCapacityUnits` の全期間の合計が 0）で行い、確かめられなければ「戻さず前に進んで直す」にします

## Sources

- `construction/u5-assignment-calendar/nfr-design/observability-design.md`、`logical-components.md`（監視は足さない）
- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`、`performance-requirements.md`
- `construction/u5-assignment-calendar/infrastructure-design/infrastructure-specification.md`
- `construction/u4-chore-types/infrastructure-design/monitoring-design.md`（形の手本）
- `infrastructure/lib/app-stack.ts`（`api` のロググループ、既存のメトリクスフィルター）

## Assumptions & Open Questions

- [assumption] DynamoDB の標準メトリクス（`ConsumedWriteCapacityUnits` など）は、オンデマンドのテーブルでも `TableName` のディメンションで出ます。追加費用はかかりません。配備後にメトリクスが出ていなければ、請求の確かめ（`cicd-pipeline.md`）は請求の画面だけで行います
- [assumption] Logs Insights の問い合わせの実行は、スキャンしたデータ量に応じて課金されますが、`api` のログは月に数 MB 以下で、1 回の問い合わせは 1 円未満です
- 追加の質問はありません
