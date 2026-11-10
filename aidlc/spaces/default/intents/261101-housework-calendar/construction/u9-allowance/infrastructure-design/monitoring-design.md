# 見守りの設計（Monitoring Design）— U9 お小遣いの額

U9（`u9-allowance`）で、U1〜U8 の見守りに足すものです。`nfr-design/observability-design.md` の戦略を、既存の仕組み（`lib/logger.ts` の JSON ログ、`api` のロググループの 30 日保管、CloudWatch Logs Insights、Lambda と DynamoDB の標準メトリクス、U1 の Budgets）の上で実現します。**メトリクスフィルターもアラームもダッシュボードも足しません**（NFR1.36、NFR2.77。知らせの仕組みは U10）。U9 は新しいロググループも足しません。`ALLOWANCE_*` は `api` のロググループだけに出ます（`line` は通らない）。新しい資源の費用はありません。手で使う Logs Insights の検索だけは、検索したデータ量に応じた従量です（月 1 ドルの Budgets の範囲内。下の「Logs & Tracing」と `infrastructure-specification.md` の費用の見込みと同じ言い方）。

U9 のログで特に守ることは、**名前も金額も残さない**ことです（NFR2.76）。Logs Insights の問い合わせの結果にも、名前や金額は出ません。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda `api` の `Errors`・`Throttles`・`Duration` | Lambda の標準メトリクス（U1） | U1 のとおり（新しいしきい値なし） | U9 の思いがけない失敗と遅さも含まれる |
| `REQUEST_END.durationMs`（`path = /v1/months/:month/allowances`） | `api` のログ | 95% が 1,500 ms 以内（補助。NFR7.54） | 受け口全体のサーバー側の時間。画面録画の 3 秒の切り分けに使う |
| `ALLOWANCE_COMPUTED.durationMs` | `api` のログ | 通常の月 95% が 500 ms 以内、大きい月（300 件）95% が 800 ms 以内（補助） | 読み取りと集計の時間。重くなったときに、中身か入口かを切り分ける |
| `ALLOWANCE_COMPUTED.dutyCount`・`REQUEST_END.dutyCount` | `api` のログ | 参考（上限 1,000 件の前提。NFR3.17） | 遅い月の原因を担当の数と照らして分ける |
| `ALLOWANCE_COMPUTED.anomalyCount` | `api` のログ | 0（通常の書き込みでは起きない前提。BR10.13） | 額が実際より少なく見えうる異常。行を省いた分も含む全数 |
| `ALLOWANCE_DUTY_WITHOUT_PRICE`・`ALLOWANCE_CHORE_TYPE_MISSING`・`ALLOWANCE_DUTY_OWNER_NOT_CHILD` の件数 | `api` のログ | 0 を目指す（U10 で知らせる） | 異常の種類の見分け。画面にも出ず、ログでしか分からない |
| `REQUEST_ERROR` の件数（`path` が allowances） | `api` のログ | 0 を目指す（U10 で知らせる） | 500 `INTERNAL`・思いがけない例外 |
| `REQUEST_END.coldStart` と `REPORT` の `Init Duration` | `api` のログ・Lambda の `REPORT` 行 | 冷たい起動は 1,000 ms 台に収める（NFR7.54） | 冷たい起動の割合と時間を、測定の表に残す |
| DynamoDB の呼び出しの回数（`TableName`×`Operation`。`Users` の `familyId-index` は `GlobalSecondaryIndexName` の次元でも別に出る） | CloudWatch の標準メトリクス `AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`（統計 `SampleCount`、期間 60 秒。追加費用なし）。ログには出さない（`observability-design.md`: 読み取りの回数はログに出さない） | 1 回の表示で 5 回以内（認証 `Users` の `GetItem` 1・`Calendar` の `Query` 1・`Families` の `GetItem` 1・`Users` の `familyId-index` の `Query` 1・`ChoreTypes` の `Query` 1）、索引の遅れで本人を補うとき 6 回以内、抜けた子供 k 人で最大 5+2k（NFR7.55）。書き込み系と `Scan`・`BatchGetItem` は 0 | NFR7.55 の読み取りの回数の確かめと、NFR7.57 の記録項目。取り方は下の「呼び出しの回数の取り方」 |
| DynamoDB `ConsumedReadCapacityUnits`（`Calendar`・`Users`・`Families`・`ChoreTypes`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 見込み: 強い整合性の読み取りは 4 KB ごとに 1 ユニット。通常の月（担当約 124 件×約 400 バイト）の `Calendar` の `Query` で十数ユニット、大きい月（300 件）で約 30 ユニット。表示 1 回の合計は通常・大きい月とも数十ユニット程度で、件数に応じて増える | 費用の見込みの確かめ（消費した容量の合計）。**呼び出しの回数の代わりには使わない**（`Query` が 1 回でも件数で増えるため） |
| DynamoDB `ConsumedWriteCapacityUnits`（`Calendar` ほか） | 同上 | U9 の操作の間は増えない（0） | U9 が書かないことの実環境での確かめ |

- 見るのは作り手が必要なときだけです。ステージングの確認（`cicd-pipeline.md`）と請求の確かめのときに使います

**呼び出しの回数の取り方（NFR7.55・NFR7.57）。** 回数はログにも `ConsumedReadCapacityUnits` にも出ないので、`AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount` を使います。

| 手順 | 内容 |
|------|------|
| 方法 A（前後の差） | 測定の前と後に、`TableName`×`Operation`（`GetItem`・`Query`）ごとの `SampleCount` の合計を、同じ期間（60 秒）で読み、差を取る。`Users` の `familyId-index` の `Query` は `GlobalSecondaryIndexName = familyId-index` の次元で別に出るので、表の `Query` と分けて数える |
| 方法 B（1 回ずつ） | 回数の確かめ用の測定だけは、他の操作を止めて 1 回ずつ表示し、1 回ごとに 1〜2 分あけて `SampleCount` を読む（1 分単位の集計を 1 回の表示に結びつけるため）。3 秒の 20 回の連続測定とは別に行ってよい |
| 期待 | `Calendar` の `Query` 1、`ChoreTypes` の `Query` 1、`Families` の `GetItem` 1、`Users` の `GetItem` 1（認証）と `familyId-index` の `Query` 1。合計は 1 回の表示で 5（索引の遅れで 6）、抜けた子供 k 人で 5+2k を超えない。書き込み系の `Operation` の `SampleCount` は 0 |
| 注意 | 指標の反映には数分かかることがある。他の利用者・他の操作が同じ期間に混ざらないステージングで行う。回数は表の「DynamoDB の呼び出しの数」の列に残す |

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用 | U1 の Budgets（月 1 ドル）が基準を超える見込み | 高 | メール（U1 のとおり） |
| U9 の新しいアラーム | **足さない** | — | — |

- 次のイベントを 15 分以内に作り手へ知らせる仕組みは U10 で入れます。それまでは下の問い合わせで作り手が手で確かめます（NFR2.77）

**U10 への引き継ぎ一覧（作り手へ知らせる対象）。** `nfr-design/observability-design.md` の「U10 への引き継ぎ」と同じ内容を、一覧の形で置きます。

| イベント | 条件 | 重さ | 出る Lambda |
|---------|------|------|------------|
| `REQUEST_ERROR` | `path` が `/v1/months/:month/allowances` のもの 1 件でもある | error | `api` |
| `ALLOWANCE_DUTY_WITHOUT_PRICE` | 1 件でもある | warn | `api` |
| `ALLOWANCE_CHORE_TYPE_MISSING` | 1 件でもある | warn | `api` |
| `ALLOWANCE_DUTY_OWNER_NOT_CHILD` | 1 件でもある | warn | `api` |
| `ALLOWANCE_COMPUTED` | `anomalyCount` が 1 以上（行を省いた分も拾うため） | warn 相当 | `api` |
| 月末のまとめ（U10）が `getAllowances` を呼んで失敗したとき | 例外を送信の失敗と同じ扱いで知らせる（BR10.17、NFR2.68） | error | U10 の `scheduled` |

U10 が守ること（引き継ぎ）:

| 項目 | 内容 |
|------|------|
| `takeRequestMetrics` | `scheduled` の入口は要求の終わりに必ず呼ぶ（`setRequestMetrics` の値が次の要求に残らないように。`entries/api.ts` の `handler` と同じ形） |
| `SystemContext` | `handlers/**`・`entries/api.ts` から import しない。`scheduled` の入口だけが作る |
| `formatYen` | 金額の表示は `shared/yen.ts` を使い回す（マイナスは半角のハイフン） |
| 読み取りの権限 | `scheduled` の Lambda に必要な読み取りの権限は U10 で足す（U9 は足さない） |

- **異常なデータは画面にもグループにも出ません。ログでしか分かりません**。配備の直後に問い合わせ 3 を見ます

## SLIs / SLOs

目標（SLO）を決めるだけで、自動の判定は足しません（U10）。合格の判断は画面録画です（NFR7.54）。

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| 画面 S5 の表示（S1 から開く／直接開く。押す・開く瞬間から見出しと子供ごとの行、または失敗の表示が見えるまで） | 20 回中 19 回以上が 3 秒以内（NFR7.50） | ステージングで入口ごとに 20 回（冷たい起動 10 回以上を含む） |
| 大きい月（担当 300 件規模）の表示 | 同じ基準（20 回中 19 回以上が 3 秒以内。NFR7.51） | ステージングで 20 回 |
| 月の移動（前の月・次の月。静まり 250 ms 後の 1 回。[<] 10 回・[>] 10 回、うち 5 回は「読み込み直す」も押す） | 20 回中 19 回以上が 3 秒以内（NFR7.52） | ステージングで 20 回 |
| 「読み込み直す」を押した表示（月の移動の 20 回のうち 5 回） | 同じ基準（3 秒以内） | 月の移動の 20 回に含める |
| サーバー側の時間（`REQUEST_END.durationMs`） | 95% が 1,500 ms 以内（補助） | 上の測定と同じ期間。冷たい起動は `Init Duration` で分ける |
| 読み取りと集計（`ALLOWANCE_COMPUTED.durationMs`） | 通常の月 95% が 500 ms 以内、大きい月 95% が 800 ms 以内（補助） | 同上 |
| 異常なデータの数 | `anomalyCount` が 0 | 直近 30 日 |
| 失敗の数 | 500 `INTERNAL` と `ALLOWANCE_*` の件数（数値目標は置かない） | 直近 30 日 |
| U9 反映後の S1 の測り直し（NFR7.20） | 既存の目標のまま | U9 の反映後に 1 回 |

- 画面で測った時間が正です。サーバー側の時間は原因の切り分けに使います
- 冷たい起動は `REQUEST_END.coldStart` と `REPORT` 行の `Init Duration` から読みます

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID（`requestId`）、30 日保管。ロググループは既存のもの（新しいロググループなし） |
| U9 のできごと（新しい `event` 名） | `ALLOWANCE_COMPUTED`（info。成功した 1 回の読み取りにつき 1 件。0 件の月でも出す）、`ALLOWANCE_DUTY_WITHOUT_PRICE`・`ALLOWANCE_CHORE_TYPE_MISSING`・`ALLOWANCE_DUTY_OWNER_NOT_CHILD`（warn。種類ごとに 20 行まで）。項目は `nfr-design/observability-design.md` のとおり |
| `ALLOWANCE_COMPUTED` の項目 | `familyId`・`month`・`childCount`・`lineCount`・`dutyCount`・`doneCount`・`departedChildCount`・`anomalyCount`・`durationMs`（10 項目に `event` を含む。件数と時間と ID だけ） |
| 出すタイミング | 計算が最後まで成功したあとにまとめて 1 か所。途中で失敗した要求は成功も異常も出さず、既存の `REQUEST_ERROR` だけ |
| 書かないもの | 子供・管理者の表示名、お手伝いの名前、単価・小計・合計・加算・減額の金額と理由、回数の内訳、LINE のユーザー ID とグループ ID、セッションの文字列、`Authorization` の値、例外の文に入る名前・金額 |
| 分散トレース | 使わない（X-Ray なし。費用 0 円の条件） |
| ダッシュボード | 作らない（U10 で決める） |

1 つの要求で、ログは次の順に出ます（同じ `requestId`）:

```text
REQUEST_START → (異常の行 warn 0〜60 行) → ALLOWANCE_COMPUTED → REQUEST_END
  失敗のとき: REQUEST_START → REQUEST_ERROR → REQUEST_END   （ALLOWANCE_* は出ない）
  断りのとき: REQUEST_START → REQUEST_REJECTED(401/403/422) → REQUEST_END
```

作り手が手で使う問い合わせ（CloudWatch Logs Insights。`api` のロググループ）。**filter を stats より前に置きます**（検索するデータを先に絞る）:

```text
# 1. 受け口全体の時間（allowances の入口だけ）
fields @timestamp, path, durationMs, dutyCount, coldStart
| filter event = "REQUEST_END" and path = "/v1/months/:month/allowances"
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, count() as n by coldStart
```

```text
# 2. 読み取りと集計の時間（担当の数と一緒に）
fields @timestamp, month, dutyCount, childCount, durationMs
| filter event = "ALLOWANCE_COMPUTED"
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, max(dutyCount) as maxDuty, count() as n
```

```text
# 3. 異常があった要求（0 件ならよい。行を省いた分も anomalyCount に入る）
fields @timestamp, familyId, month, anomalyCount, durationMs
| filter event = "ALLOWANCE_COMPUTED" and anomalyCount > 0
| sort @timestamp desc
| limit 50
```

```text
# 4. 異常の種類の分布
fields @timestamp, event
| filter event in ["ALLOWANCE_DUTY_WITHOUT_PRICE", "ALLOWANCE_CHORE_TYPE_MISSING", "ALLOWANCE_DUTY_OWNER_NOT_CHILD"]
| stats count() as n by event
```

```text
# 5. 失敗の一覧（0 件ならよい）
fields @timestamp, event, path, error
| filter event = "REQUEST_ERROR" and path = "/v1/months/:month/allowances"
| sort @timestamp desc
| limit 20
```

```text
# 6. 断り（401・403・422）の分布（使う人の操作の結果。失敗には数えない）
fields @timestamp, event, status, reason
| filter event = "REQUEST_REJECTED" and path = "/v1/months/:month/allowances"
| stats count() as n by status, reason
```

- 問い合わせ 1・5・6 は `path` の値が実装の文字列と一致する前提です（既存の `entries/api.ts` の `REQUEST_*` が振り分け表の道の形を出す）。コード生成で実際の文字列を確かめ、違えばこの文書と README を合わせます
- **Logs Insights の費用:** 新しい資源の費用はありません。問い合わせだけが、検索したログのデータ量に応じた従量です。作り手が手で使うだけで、30 日分のログ量も小さいため、月 1 ドルの Budgets の範囲内に収まる見込みです。広い期間の検索を常用しません（自動の問い合わせも足しません）
- 配備した直後の本番では、問い合わせ 3・5 を一度見て 0 件であることを確かめます
- ログに名前や金額が出ていないことは、単体テストの目印（`<作り物の値>` と 98765）で確かめ済みにします。手での確認は、問い合わせ 1〜6 が `fields` で選んだ項目しか見せないため、生の行を見る問い合わせ 7 で行います

```text
# 7. 生の行（名前・金額が行に混ざっていないことを目で見る）
fields @message
| filter event = "ALLOWANCE_COMPUTED"
| sort @timestamp desc
| limit 5
```

## Sources

- `construction/u9-allowance/nfr-design/observability-design.md`（NFR2.74〜NFR2.77、NFR7.58、ログの項目と守り、U10 への引き継ぎ）
- `construction/u9-allowance/nfr-design/performance-design.md`（NFR7.50〜NFR7.57、補助の目標、測り方）
- `construction/u9-allowance/nfr-design/security-design.md`（NFR4.93、ログに出さないもの）
- `construction/u9-allowance/nfr-design/logical-components.md`（U10 への引き継ぎ、指標とアラームを足さない）
- `construction/u9-allowance/infrastructure-design/infrastructure-specification.md`
- `construction/u8-swap/infrastructure-design/monitoring-design.md`（形の手本）

## Assumptions & Open Questions

- [assumption] `REPORT` の行の `Init Duration` は Lambda が自動で出すので、インフラの追加は要りません。コールドスタートの有無は `REQUEST_END.coldStart` と `Init Duration` の有無で判断します
- [assumption] 問い合わせの項目名（`path`・`status`・`reason`・`coldStart`・`anomalyCount` など）は `observability-design.md` と既存の `REQUEST_*` の記述に合わせています。U9 のコードはまだ書かれておらず、`REQUEST_REJECTED` の `status`・`reason`、`path` の正確な文字列はコード生成で確かめます。名前が変わったらこの文書と README の問い合わせを合わせます
- [assumption] `ALLOWANCE_COMPUTED` の `anomalyCount` が 1 以上のときの重さは warn 相当と読みます（イベント自体は info で出る）。U10 が重さを決めます
- [assumption] 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます。追加の質問はありません
