# 見守りの設計（Monitoring Design）— U8 代わりにやる

U8（`u8-swap`）で、U1〜U7 の見守りに足すものです。`nfr-design/observability-design.md` の戦略を、既存の仕組み（`lib/logger.ts` の JSON ログ、`line` と `api` のロググループの 30 日保管、CloudWatch Logs Insights、Lambda と DynamoDB の標準メトリクス、U1 の Budgets）の上で実現します。**メトリクスフィルターもアラームもダッシュボードも足しません**（NFR1.33、NFR2.66。知らせの仕組みは U10）。U8 は新しいロググループも足しません。「家事交代」と `swap.*` のログは `line` のロググループ、フックの掃除（`SWAP_OFFER_CLOSED`・`DUTY_HOOKS_DONE`）は `line` と `api` の両方に出ます。追加の費用はありません。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda `line`・`api` の `Errors`・`Throttles`・`Duration` | Lambda の標準メトリクス（U1） | U1 のとおり（新しいしきい値なし） | U8 の思いがけない失敗と遅さも含まれる |
| `LINE_EVENT_DONE.durationMs`（`line`） | `line` のログ | 95% が 2,000 ms 以内（補助。NFR7.43） | 「家事交代」と `swap.*` の返事までのサーバー側の時間。画面録画の 3 秒の切り分けに使う |
| `SWAP_LISTED`・`SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN` の `durationMs` | `line` のログ | 参考（入口の確かめと reply を除いた中身の時間） | 重くなったときに、中身か入口か reply かを切り分ける |
| `SWAP_REJECTED` の件数（`reason` 別） | `line` のログ | `INTERNAL` は 0 を目指す（U10 で知らせる） | 断りの分布。`INTERNAL`（取引が 2 回続けて断られた）は調べものの対象 |
| `SWAP_RETRY` の件数 | `line` のログ | なし（参考） | 想定内の競合の読み直し。多ければ条件と順番を見直す |
| `SWAP_OFFER_CLOSED` の件数（`via` 別） | `line`・`api` のログ | 確定時に開いていた申し出の数と一致（測定 1 回目） | 掃除が効いているか。実際に閉じたときだけ出る |
| `DUTY_HOOKS_DONE.durationMs`・`failed`・`concurrency` | `api`・`line` のログ | 95% が 1,000 ms 以内、`failed` は 0（NFR7.46） | 月の確定のフック（4 並行）の時間と失敗 |
| `DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED` の件数 | 同上 | 0 を目指す（U10 で知らせる） | フックが投げた件数。保存の結果は変わらず、ログでしか分からない |
| `DUTY_HOOKS_TRUNCATED`・`CONFIRM_POST_READ_FAILED` の件数 | `api` のログ | 0 を目指す | フックの打ち切り・確定後の読み取りの失敗 |
| `LINE_REPLY_FAILED` の件数（warn） | `line` のログ | 0 に近いこと | 保存は済んでいるが返事が出ていない件数 |
| DynamoDB `WriteThrottleEvents`・`ThrottledRequests`（`Calendar`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 月の確定の測定中に 0（NFR7.46。書き込みは 300 件以内の `UpdateItem`） | 並行数 4（NFR3.15）が「スロットル 0」を前提にしているので、その妥当性の確かめ |
| DynamoDB `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits`（`Calendar`） | CloudWatch の標準メトリクス（`AWS/DynamoDB`。追加費用なし） | 見込み: 月に数百ユニット未満。確定の日に最大 300 回の書き込み | 費用の見込みの確かめ。U5 の最初の請求の確認に含めて見る |

- 見るのは作り手が必要なときだけです。ステージングの確認（`cicd-pipeline.md`）と請求の確かめのときに使います

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用 | U1 の Budgets（月 1 ドル）が基準を超える見込み | 高 | メール（U1 のとおり） |
| U8 の新しいアラーム | **足さない** | — | — |

- 次のイベントを 15 分以内に作り手へ知らせる仕組みは U10 で入れます。それまでは下の問い合わせで作り手が手で確かめます（NFR2.66）

**U10 への引き継ぎ一覧（作り手へ知らせる対象）。** 同じ表を `functional-design/functional-spec.md` の「次の単位への引き継ぎ」の U10 の行にも置きました（U10 はそちらからも読めます）。

| イベント | 条件 | 重さ | 出る Lambda |
|---------|------|------|------------|
| `SWAP_REJECTED` | `reason = INTERNAL` | error 相当 | `line` |
| `REQUEST_ERROR` | 1 件でもある | error | `line`・`api` |
| `LINE_REPLY_FAILED` | 1 件でもある | warn | `line` |
| `DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED` | 1 件でもある | error | `api`・`line` |
| `DUTY_HOOKS_DONE` | `failed` が 1 以上 | warn | `api`・`line` |
| `DUTY_HOOKS_TRUNCATED` | 1 件でもある | warn | `api` |
| `CONFIRM_POST_READ_FAILED` | 1 件でもある | warn | `api` |

- **フックの失敗は画面にもグループにも出ません。ログでしか分かりません**。配備の直後に問い合わせ 4 を見ます

## SLIs / SLOs

目標（SLO）を決めるだけで、自動の判定は足しません（U10）。合格の判断は画面録画です。

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| 一覧の返事（「家事交代」と送ってから一覧が出るまで） | 20 回中 19 回以上が 3 秒以内（NFR7.39）。理由つきの返事（候補なし・確定済み）は各 3 回で同じ基準 | ステージングで 20 回（冷たい起動 10 回以上を含む） |
| 担当を選ぶ（申し出る）の返事 | 95% が 3 秒以内（NFR7.40） | 同上 |
| 引き受けるの返事 | 95% が 3 秒以内（NFR7.41） | 同上 |
| 申し出をやめるの返事 | 95% が 3 秒以内（NFR7.42） | 同上 |
| サーバー側の時間（`LINE_EVENT_DONE.durationMs`・`REQUEST_END.durationMs`） | 95% が 2,000 ms 以内（補助。NFR7.43） | 上の測定と同じ期間。コールドスタートは `REPORT` の `Init Duration` で分ける |
| 月の確定の応答（画面。NFR7.46 (1)） | 20 回中 19 回以上が 3 秒以内（画面録画） | ステージングで 20 回（作り直し有り／無しを分けて記録） |
| 月の確定とフック（NFR7.46） | 確定の `REQUEST_END.durationMs` 95% が 2,000 ms 以内、`DUTY_HOOKS_DONE.durationMs` 95% が 1,000 ms 以内 | ステージングで確定を測る（300 件規模の用意は README の手順） |
| 確定中の書き込みのスロットル（NFR7.46 (3)） | `Calendar` の `WriteThrottleEvents`・`ThrottledRequests` が 0、書き込みは 300 件以内の `UpdateItem` | 確定の測定の期間 |
| 確定時の申し出の掃除（NFR7.46 (4)） | 1 回目の確定で開いていた申し出がすべて `cancelled`。開いていなかった担当に `SWAP#` の項目が作られない（問い合わせ 6 と画面の確認） | 確定の測定 1 回目 |
| U8 反映後の測り直し（NFR7.22・NFR7.25・NFR7.33） | U5〜U7 の既存の目標のまま | U8 の反映後に測り直す（フックが既存の経路に呼び出しを足すため） |
| 申し出の結果 | `SWAP_REJECTED` の `INTERNAL` は 0 を目指す | 直近 30 日 |

- 画面で測った時間が正です。サーバー側の時間は原因の切り分けに使います
- 冷たい起動は `line`／`api` の `REPORT` 行の `Init Duration` から読みます

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID（`requestId`）、30 日保管。ロググループは既存のもの（新しいロググループなし） |
| U8 のできごと（新しい `event` 名） | `SWAP_LISTED`・`SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN`・`SWAP_REJECTED`・`SWAP_RETRY`・`SWAP_GUIDE_SENT`（以上 info）、`SWAP_OFFER_CLOSED`（info。実際に閉じたときだけ）、`DUTY_HOOKS_DONE`（info。1 回の呼び出しごと）、`DUTY_HOOKS_TRUNCATED`（warn）。項目は `nfr-design/observability-design.md` のとおり |
| 結果のイベント | 1 回の操作につき 1 件だけ（成功か断り）。`GROUP_NOT_REGISTERED`・`NOT_FAMILY_MEMBER` は入口の `GROUP_COMMAND_REJECTED` が出し、`SWAP_REJECTED` では重ねない |
| `GROUP_COMMAND_REJECTED` の変更 | U3 の既存のログから `groupId` を外す（`reason` と、分かるときのアプリの `userId`・`familyId` だけ）。U8 の経路の決めで、ほかの既存のログ（`GROUP_JOINED` など）は変えない |
| `DUTY_HOOKS_DONE.kind` | 種類が 1 つなら文字列、混ざるときは種類ごとの件数のオブジェクト（合計は `count` と一致） |
| 書かないもの | 子供・管理者の表示名、お手伝いの名前、LINE のユーザー ID と LINE のグループ ID、reply トークン、postback の data の全文、text、返事の本文、Webhook の本文、チャネルのトークンとシークレット、署名、秘密のヘッダーの値、単価と金額。利用者はアプリの `userId` で残す |
| 形の外れた入力 | `LINE_EVENT_IGNORED` に `type` だけを書く |
| 分散トレース | 使わない（X-Ray なし。費用 0 円の条件） |
| ダッシュボード | 作らない（U10 で決める） |

1 つの操作で、ログは次の順に出ます（同じ `requestId`）:

```text
REQUEST_START → (GROUP_COMMAND_REJECTED | SWAP_LISTED | SWAP_OFFERED | SWAP_ACCEPTED | SWAP_WITHDRAWN | SWAP_REJECTED | SWAP_GUIDE_SENT)
  (競合のとき: CALENDAR_TRANSACTION_CANCELED(warn) + SWAP_RETRY(info) が読み直しごとに 1 件) → [LINE_REPLY_FAILED] → LINE_EVENT_DONE → REQUEST_END
```

作り手が手で使う問い合わせ（CloudWatch Logs Insights。`line` のロググループ、フックは `api` のロググループでも同じ形で）:

```text
# 1. 申し出の操作の中身の時間（操作別）
fields @timestamp, event, durationMs
| filter event in ["SWAP_LISTED", "SWAP_OFFERED", "SWAP_ACCEPTED", "SWAP_WITHDRAWN"]
| stats pct(durationMs, 95) as p95, max(durationMs) as worst, count() as n by event
```

```text
# 2. 返事までの時間とコールドスタート（REPORT 行の Init Duration の有無は別に見る）
fields @timestamp, event, durationMs
| filter event = "LINE_EVENT_DONE"
| stats pct(durationMs, 95) as p95, count() as n
```

```text
# 3a. 断りの理由の分布
fields @timestamp, event, reason
| filter event = "SWAP_REJECTED"
| stats count() as n by reason

# 3b. 読み直しの分布
fields @timestamp, event, op
| filter event = "SWAP_RETRY"
| stats count() as n by op
```

`SWAP_REJECTED` と `SWAP_RETRY` は持つ項目が違うので、2 本に分けます（グループ化の項目が欠けた行が外れるのを避けるため）。filter を先に置きます。

```text
# 4. 失敗の一覧（0 件ならよい）
fields @timestamp, event
| filter event in ["REQUEST_ERROR", "LINE_REPLY_FAILED", "DUTY_HOOK_FAILED", "DUTY_RECORDED_HOOK_FAILED", "DUTY_HOOKS_TRUNCATED", "CONFIRM_POST_READ_FAILED"]
| stats count() as n by event
```

```text
# 5. フックの時間と失敗（api のロググループ。月の確定の測定に使う）
fields @timestamp, kind, count, failed, concurrency, durationMs
| filter event = "DUTY_HOOKS_DONE"
| sort @timestamp desc
| limit 20
```

```text
# 6. 掃除が効いているか（SWAP_OFFER_CLOSED の数）
fields @timestamp, event, via
| filter event = "SWAP_OFFER_CLOSED"
| stats count() as n by via
```

```text
# 7. INTERNAL を時間帯で見る
fields @timestamp, event, reason
| filter event = "SWAP_REJECTED" and reason = "INTERNAL"
| stats count() as n by bin(15m)
```

- **Logs Insights の費用:** 問い合わせは検索したログのデータ量に応じた従量の費用があります。作り手が手で使うだけで、30 日分のログ量も小さいため 0 円に近い（無視できる）見込みです。広い期間の検索を常用しません（自動の問い合わせも足しません）
- 配備した直後の本番では、問い合わせ 3・4 を一度見て失敗が 0 件であることを確かめます
- ログに名前や ID の文字が出ていないことは、単体テストの目印（`<作り物の値>`）で確かめ済みにします。手での確認は問い合わせ 3 の結果の項目を目で見る程度で足ります

## Sources

- `construction/u8-swap/nfr-design/observability-design.md`（NFR2.63〜NFR2.66、NFR7.49、ログの項目と守り、失敗の見つけ方、SLI と見方）
- `construction/u8-swap/nfr-design/performance-design.md`（NFR7.39〜NFR7.48、時間の配分、フックの時間の目標、測り方）
- `construction/u8-swap/nfr-design/security-design.md`（NFR4.84、ログに出さないもの）
- `construction/u8-swap/nfr-design/logical-components.md`（U10 への引き継ぎ、指標とアラームを足さない）
- `construction/u8-swap/infrastructure-design/infrastructure-specification.md`
- `construction/u7-review-confirm/infrastructure-design/monitoring-design.md`（形の手本）

## Assumptions & Open Questions

- [assumption] `REPORT` の行の `Init Duration` は Lambda が自動で出すので、インフラの追加は要りません。コールドスタートの有無はこの値の有無で判断します
- [assumption] 問い合わせの項目名（`count`・`failed`・`concurrency`・`via` など）は `observability-design.md` の表に合わせています。コード生成で名前が変わったら、この文書の問い合わせも合わせます
- [assumption] `GROUP_COMMAND_REJECTED` から `groupId` を外す変更は U3 の既存のログの形を変えます。承認の場で確かめる項目として `observability-design.md` から引き継ぎます
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます。追加の質問はありません
