## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Logs & Tracing の問い合わせ 6、問い合わせ 3 | 問い合わせ 6 は `stats count() as n by via \| filter event = "SWAP_OFFER_CLOSED"` の順になっている。`stats` のあとには `event` が残らないので、結果は常に 0 行になる。この問い合わせは「掃除が効いているか」(NFR2.64、cicd-pipeline.md の確かめ 8・11) を確かめる唯一の手段なので、確かめが成り立たない。問い合わせ 3 も `stats ... by event, reason` のあとに `filter` を置いている。`SWAP_RETRY` は `reason` ではなく `op` を持つので、`by event, reason` では `SWAP_RETRY` の行が集計から落ちる。問い合わせ 4 も全イベントを集計してから絞る無駄な形になっている。 | 6 は `filter event = "SWAP_OFFER_CLOSED" \| stats count() as n by via` に直す。3 は `filter` を先にし、`SWAP_REJECTED` を `reason` 別、`SWAP_RETRY` を `op` 別に分けて集計する。4 も `filter` を先に置く。直したあと、`observability-design.md` のイベント項目名と一致することを確かめる。 | Unresolved |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Alerts（U10 への引き継ぎの文）、traceability.json > NFR2.66 | 「この一覧を U10 に引き継ぎます（functional-spec.md の『次の単位への引き継ぎ』の U10 の行）」とあるが、実際の `functional-design/functional-spec.md` の U10 の行には、16 時のリマインドと reply が無料枠に数えられないことしか書かれていない。作り手へ 15 分以内に知らせる対象のイベント一覧（`SWAP_REJECTED` の `INTERNAL`、`REQUEST_ERROR`、`LINE_REPLY_FAILED`、`DUTY_HOOK_FAILED` など）は、どの文書にも引き継ぎとして書かれていない。`construction/u8-swap/` に「引き継ぎの記録」も存在しない。それでも traceability.json は NFR2.66 を OK としている。フックの失敗は画面にもグループにも出ず、ログでしか分からないため、引き継ぎが抜けると U10 で拾われない。 | 引き継ぎの一覧（イベント名、条件、重さ、出る Lambda）を実在する場所に書く。monitoring-design.md 内の表にして U10 から読めるようにするか、functional-spec.md の U10 の行を更新する。monitoring-design.md の参照先の記述と、traceability.json の NFR2.66 の target を、その実在する場所に合わせる。 | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Metrics & KPIs・SLIs / SLOs、cicd-pipeline.md > ステージングでの手での確かめ 13、traceability.json > NFR7.46 | NFR7.46 の合格条件のうち、(1) 確定の応答が 20 回中 19 回以上 3 秒以内（画面録画）、(3) `Calendar` の `WriteThrottleEvents`／`ThrottledRequests` が 0 で、書き込みが 300 件以内の `UpdateItem`、(4) 1 回目の確定で開いていた申し出がすべて `cancelled` になり、開いていなかった担当に `SWAP#` の項目が作られていないこと、が落ちている。確かめ 13 は「確定が 2,000 ms 以内、フックが 1,000 ms 以内」だけで、スロットルの指標も監視の表にない。並行数 4 の設計 (NFR3.15) は「スロットルが 0」を前提にしているので、これが測られないと並行数の妥当性を確かめられない。それでも traceability.json は NFR7.46 を OK としている。 | monitoring-design.md の Metrics & KPIs に `Calendar` の `WriteThrottleEvents`／`ThrottledRequests`（標準メトリクス、追加費用なし）を足し、SLO の表に (1) の 3 秒の基準を足す。cicd-pipeline.md の確かめ 13 に (1)(3)(4) と「作り直し有り／無し」の記録を加える。 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/infrastructure-specification.md > 残る危険 | 「害は申し出の項目に限られ、担当そのものは取引の条件（`version`・`status`）が無ければ書き換えられません」は言い過ぎ。`line` に `Calendar` への `UpdateItem` を許している以上、IAM は項目のキー（`sk`）を絞れない。条件はアプリのコードにあり、`line` が乗っ取られたらその条件も外せる。実際には、`line` の `UpdateItem` の許可は `Calendar` の同じ家族の担当や月の状態の項目も書き換えられる（U6 からすでに存在）。 | 文を「`Calendar` 全体に及ぶ（U6 から同じ）。コードの条件では守れない」と正確に直す。残す危険として人が承認の場で確認できる形にする。 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/cicd-pipeline.md > ワークフロー（deploy-staging.yml）、反映の順番 1 | `cdk deploy Housework-staging-App` と書かれているが、実際の `.github/workflows/deploy-staging.yml` は `cdk deploy Housework-staging-Data Housework-staging-App` を実行する。`DataStack` に差分がなければ実害はないが、記述が実物と違う。 | `Housework-staging-Data` と `Housework-staging-App` の両方を実行し、`Data` は差分なしと書き直す。 | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Logs & Tracing（作り手が手で使う問い合わせ）、infrastructure-specification.md > 費用の見込み | 0 円の条件に対し、CloudWatch Logs Insights の問い合わせには検索したデータ量に応じた従量の費用がある。monitoring-design.md の問い合わせの前提に、手で使うこと自体の費用への言及がない。30 日のログ量では 0 円に近いが、費用の見込みの表の項目にもない。DynamoDB の従量の増分が「1 円に満たない」とされている点は、U5 の最初の請求の確認に含める方針で矛盾はない。 | 費用の見込みの表に Logs Insights（手で使うだけ、検索量は少ない）を 1 行足し、広い期間の検索を常用しないことを書く。 | Resolved (reviewer) |

> R-01 Reviewer note: 問い合わせ 6 は `filter event = "SWAP_OFFER_CLOSED" \| stats count() as n by via` の順に直り、問い合わせ 4 も `filter` が先になっていて、解消済み。問い合わせ 3 も `filter` が先になったが、集計が `by event, reason, op` のままで、依頼した「`SWAP_REJECTED` は `reason` 別、`SWAP_RETRY` は `op` 別に分ける」形になっていない。文書は「持たない側は空欄の行として出る」と書くが、Logs Insights の `stats ... by` は、グループ化する項目が欠けているイベントを結果から外す動きになるため、両方の行が出ない恐れがある（実機では未確認）。補助の問い合わせで、掃除の確かめ（問い合わせ 6）ではないので Minor に下げる。

> R-02 Reviewer note: `functional-spec.md` の U10 の行（195〜207 行目付近）に、イベント・条件・重さ・出る Lambda の表が実在し、`monitoring-design.md` の Alerts の表と一致している。`traceability.json` の NFR2.66 の target も実在する場所を指している。

> R-03 Reviewer note: Metrics & KPIs に `Calendar` の `WriteThrottleEvents`・`ThrottledRequests` が入り、SLO の表に (1) 3 秒の基準、(3) スロットル 0、(4) 掃除の確認が入った。`cicd-pipeline.md` の確かめ 13 に (1)〜(4) と「作り直し有り／無し」の記録が入っている。

> R-04 Reviewer note: `infrastructure-specification.md` の「残る危険」が、`UpdateItem` の許可は `Calendar` 全体に及び（U6 から同じ）、取引の条件は `line` が乗っ取られたら外せるので許可の面では守れない、と正確に直っている。承認の場で確かめる項目にもなっている。

> R-05 Reviewer note: `cicd-pipeline.md` が `cdk deploy Housework-staging-Data Housework-staging-App` と書き、`Data` は差分なしと明記していて、実物と一致している。

> R-06 Reviewer note: 費用の見込みの表に Logs Insights の行が入り、`monitoring-design.md` にも費用の注意と「広い期間の検索を常用しない」が書かれている。

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| review-brief context | 未解決 R-01〜R-06、確定済みの判断なし | 6 件を再確認した |
| 文書の突き合わせ（grep・読み取り） | R-02〜R-06 は解消を確認。R-01 は問い合わせ 3 のみ残る | 実機の Logs Insights は実行していない。問い合わせ 3 の動きは仕様の知識による判断で、未確認 |

### Summary

Major だった R-02・R-03 は文書に実在する引き継ぎ表と測定の条件で解消し、R-01 も確かめに使う問い合わせ 6 は直った。残るのは問い合わせ 3 の集計の形（`reason` と `op` の分け方）だけで、Minor のため、コード生成の前か途中に直せば足りる。開発者が推測なしで作れる状態なので READY。
