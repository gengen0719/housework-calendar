## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Logs & Tracing の問い合わせ 6、問い合わせ 3 | 問い合わせ 6 は `stats count() as n by via \| filter event = "SWAP_OFFER_CLOSED"` の順になっている。`stats` のあとには `event` が残らないので、結果は常に 0 行になる。この問い合わせは「掃除が効いているか」(NFR2.64、cicd-pipeline.md の確かめ 8・11) を確かめる唯一の手段なので、確かめが成り立たない。問い合わせ 3 も `stats ... by event, reason` のあとに `filter` を置いている。`SWAP_RETRY` は `reason` ではなく `op` を持つので、`by event, reason` では `SWAP_RETRY` の行が集計から落ちる。問い合わせ 4 も全イベントを集計してから絞る無駄な形になっている。 | 6 は `filter event = "SWAP_OFFER_CLOSED" \| stats count() as n by via` に直す。3 は `filter` を先にし、`SWAP_REJECTED` を `reason` 別、`SWAP_RETRY` を `op` 別に分けて集計する。4 も `filter` を先に置く。直したあと、`observability-design.md` のイベント項目名と一致することを確かめる。 | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Alerts（U10 への引き継ぎの文）、traceability.json > NFR2.66 | 「この一覧を U10 に引き継ぎます（functional-spec.md の『次の単位への引き継ぎ』の U10 の行）」とあるが、実際の `functional-design/functional-spec.md` の U10 の行には、16 時のリマインドと reply が無料枠に数えられないことしか書かれていない。作り手へ 15 分以内に知らせる対象のイベント一覧（`SWAP_REJECTED` の `INTERNAL`、`REQUEST_ERROR`、`LINE_REPLY_FAILED`、`DUTY_HOOK_FAILED` など）は、どの文書にも引き継ぎとして書かれていない。`construction/u8-swap/` に「引き継ぎの記録」も存在しない。それでも traceability.json は NFR2.66 を OK としている。フックの失敗は画面にもグループにも出ず、ログでしか分からないため、引き継ぎが抜けると U10 で拾われない。 | 引き継ぎの一覧（イベント名、条件、重さ、出る Lambda）を実在する場所に書く。monitoring-design.md 内の表にして U10 から読めるようにするか、functional-spec.md の U10 の行を更新する。monitoring-design.md の参照先の記述と、traceability.json の NFR2.66 の target を、その実在する場所に合わせる。 | New |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Metrics & KPIs・SLIs / SLOs、cicd-pipeline.md > ステージングでの手での確かめ 13、traceability.json > NFR7.46 | NFR7.46 の合格条件のうち、(1) 確定の応答が 20 回中 19 回以上 3 秒以内（画面録画）、(3) `Calendar` の `WriteThrottleEvents`／`ThrottledRequests` が 0 で、書き込みが 300 件以内の `UpdateItem`、(4) 1 回目の確定で開いていた申し出がすべて `cancelled` になり、開いていなかった担当に `SWAP#` の項目が作られていないこと、が落ちている。確かめ 13 は「確定が 2,000 ms 以内、フックが 1,000 ms 以内」だけで、スロットルの指標も監視の表にない。並行数 4 の設計 (NFR3.15) は「スロットルが 0」を前提にしているので、これが測られないと並行数の妥当性を確かめられない。それでも traceability.json は NFR7.46 を OK としている。 | monitoring-design.md の Metrics & KPIs に `Calendar` の `WriteThrottleEvents`／`ThrottledRequests`（標準メトリクス、追加費用なし）を足し、SLO の表に (1) の 3 秒の基準を足す。cicd-pipeline.md の確かめ 13 に (1)(3)(4) と「作り直し有り／無し」の記録を加える。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/infrastructure-specification.md > 残る危険 | 「害は申し出の項目に限られ、担当そのものは取引の条件（`version`・`status`）が無ければ書き換えられません」は言い過ぎ。`line` に `Calendar` への `UpdateItem` を許している以上、IAM は項目のキー（`sk`）を絞れない。条件はアプリのコードにあり、`line` が乗っ取られたらその条件も外せる。実際には、`line` の `UpdateItem` の許可は `Calendar` の同じ家族の担当や月の状態の項目も書き換えられる（U6 からすでに存在）。 | 文を「`Calendar` 全体に及ぶ（U6 から同じ）。コードの条件では守れない」と正確に直す。残す危険として人が承認の場で確認できる形にする。 | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/cicd-pipeline.md > ワークフロー（deploy-staging.yml）、反映の順番 1 | `cdk deploy Housework-staging-App` と書かれているが、実際の `.github/workflows/deploy-staging.yml` は `cdk deploy Housework-staging-Data Housework-staging-App` を実行する。`DataStack` に差分がなければ実害はないが、記述が実物と違う。 | `Housework-staging-Data` と `Housework-staging-App` の両方を実行し、`Data` は差分なしと書き直す。 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/infrastructure-design/monitoring-design.md > Logs & Tracing（作り手が手で使う問い合わせ）、infrastructure-specification.md > 費用の見込み | 0 円の条件に対し、CloudWatch Logs Insights の問い合わせには検索したデータ量に応じた従量の費用がある。monitoring-design.md の問い合わせの前提に、手で使うこと自体の費用への言及がない。30 日のログ量では 0 円に近いが、費用の見込みの表の項目にもない。DynamoDB の従量の増分が「1 円に満たない」とされている点は、U5 の最初の請求の確認に含める方針で矛盾はない。 | 費用の見込みの表に Logs Insights（手で使うだけ、検索量は少ない）を 1 行足し、広い期間の検索を常用しないことを書く。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `infrastructure/lib/app-stack.ts` の権限の読み合わせ（手動） | PASS | `line` の `Calendar` は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`、`ChoreTypes` は `GetItem`・`Query`・`ConditionCheckItem`。`api` の `Calendar`・`ChoreTypes` は各 6 操作。`Users`・`Families`・`NotificationGroups`・`ProcessedLineEvents` の許可と SSM、`kms:Decrypt`（`ssm` 経由のみ）、環境変数（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` を含む）、256 MB・30 秒・ARM64、ロググループ 1 か月、`MetricFilter` 1 つ、CloudFront の `/line/webhook`・`/v1/*` は、infrastructure-specification.md の記述と一致した。`line` に `PutItem`・`DeleteItem`・`Scan`・`Batch*` は無い。 |
| `infrastructure/lib/data-stack.ts` の読み合わせ（手動） | PASS | テーブル 8、`Calendar` は索引なし・TTL なし、本番 `RETAIN`、ステージング `DESTROY`。記述と一致した。 |
| `.github/workflows` と `scripts/smoke-check.sh` の読み合わせ（手動） | PASS（軽微な差 1 件） | `ci.yml` の `tsc` 4 プロジェクト・`vitest --coverage`・gitleaks・`cdk synth`、`smoke-check.sh` の「全 23 件」は記述と一致した。`it.skip` は U4・U5 に各 1 件。`deploy-staging.yml` のデプロイ対象は記述と差がある（上の Minor）。 |
| traceability.json の ID の突き合わせ（nfr-design の traceability.json との集合比較） | PASS | upstream_ids 54 件と coverage 54 件が一致。nfr-design 側の ID の欠落も余分もない。ただし NFR2.66 と NFR7.46 の「OK」は上の Major の理由で裏づけが足りない。 |
| 権限の主張の検証（`TransactWriteItems` が項目ごとの操作で通ること） | 設計上は妥当、実行では未確認 | 引き受けの 3 項目の取引（担当の `Update`・申し出の `Update`・月の `ConditionCheck`）は、`line` の `UpdateItem`・`ConditionCheckItem` で足りる。U6 の同じ形が通っている記録に依る。実際の通りはステージングの確認で確かめる、と文書に書いてある。 |

### Summary

権限・環境変数・構成の数・0 円の条件に関する「インフラの変更なし」の結論は、実コードと一致していて妥当です。一方で、掃除の確認に使う Logs Insights の問い合わせ 6 が構文の順序のため常に 0 行になること、U10 への引き継ぎの参照先が実在しないこと、NFR7.46 の合格条件（3 秒の基準・スロットル・結果の確認）が監視と手での確かめから落ちていることの 3 点は、traceability.json の OK の裏づけを欠くため、直してからの再レビューが必要です（NOT-READY）。
