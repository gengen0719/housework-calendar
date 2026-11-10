## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/monitoring-design.md > Metrics & KPIs（DynamoDB `ConsumedReadCapacityUnits` の行）／cicd-pipeline.md > 3 秒の測定「補助の記録」 | 3 秒の測定の記録には「DynamoDB の呼び出しの数」を表に入れる（NFR7.55 の 5／6／5+2k 回の確かめ、NFR7.57 の記録項目）と決めているが、その数を取る手段が設計にない。観測設計は「読み取りの回数はログに出さない」と決めており、代わりに挙げた `ConsumedReadCapacityUnits` は消費した容量の合計で、呼び出しの回数ではない（強い整合性の Query は 4 KB ごとに 1 ユニット。通常の月 約 124 件×約 400 バイトで十数ユニット、大きい月 300 件で約 30 ユニットになり、Query が 1 回でも件数で増える）。そのため「表示 1 回で数ユニット」という見込みも実際より小さく、「読み取りが設計の回数（5／6／5+2k）を超えていないかの目安」にもならない。また 1 分単位の合計なので、1 回ごとの表示と結びつけにくい | 呼び出し回数を取る手段を決めて書く。例: 追加費用のない `AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`（`TableName`×`Operation` ごと）を、測定の前後または 1 回ごとの間隔で読む。または測定のあいだだけ 1 回ずつ操作して差を取る手順にする。あわせて `ConsumedReadCapacityUnits` の見込みの数字を容量の計算（4 KB ごと）に合わせて直し、「回数の目安」としての説明は外す。`Users` の索引は `GlobalSecondaryIndexName` の次元で別に出ることも書く | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/cicd-pipeline.md > ステージングでの手での確かめ 14・3 秒の測定 | NFR7.50〜NFR7.52・NFR7.57 の条件のうち、手順に落ちていないものがある。(1) 端末: 実際のスマートフォンで LIFF（LINE アプリ内）と外部ブラウザの直接の入口の両方で測る（NFR7.57 の 3.）。(2) 冷たい起動: 20 回のうち 10 回以上は前の操作から 30 分以上あけ、`Init Duration` の有無で 10 回以上を数えて確かめる（4.。cicd は「数十分以上待つ」とだけ）。(3) 画面録画は 1 秒 30 コマ以上（6.）。(4) 月の移動は [<] 10 回・[>] 10 回、うち 5 回は「読み込み直す」も押す（NFR7.52）。monitoring-design の SLO 表の「月の移動」の行にも「読み込み直す」がない。(5) 通常の月の家族の組み立て（管理者 1・子供 3・種類 4・担当約 124 件・「済」約 60 件以上・単価変更あり）と、大きい月の「済」200 件以上 | 手での確かめ 14 と 3 秒の測定の表に、上の 5 点を NFR7.57 の番号つきで書き足す（または「NFR7.57 の 1.〜9. をそのまま満たす」と明記し、記録の表の列に端末の種類・入口・30 分以上あけた回かどうかを入れる） | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/cicd-pipeline.md > CDK のスタックテスト（確かめる表） | U8 の `stacks.test.ts` には「IAM の文の数は U7 のまま」（api 11、line 9 の文の数）を固定するテストがあるが、U9 のテストの表にはその項目がない。「api に足さないものがない」の行は、禁止した操作と `Resource: "*"` を見るだけで、害のない文が 1 つ増える変更や、同じ操作を別の表に足す変更は拾えない。インフラの差分なし（NFR1.36・NFR4.89）を固定するという目的に対して、穴がある | テストの表に「IAM の文の数が U8 の後と同じ（api 11、line 9）」の行を足す | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/infrastructure-specification.md > 食い違い 3／cicd-pipeline.md > 反映したあとの確かめ（README の更新） | README の件数の直し方が 2 つの文書で食い違う。infrastructure-specification.md は「古い数が残っている箇所をコード生成で直す（全 24 件）」、cicd-pipeline.md は「U4〜U7 の節の『全 23 件』はそのまま残し、U9 の節に『U9 のあとは全 24 件』と書く」。実際の README には 14 行目（4 つ）、385・428・499・542・564 行目に件数がある。564 行目（U8 の節の「U7 のまま**全 23 件**」）は、食い違いの表の行番号の列挙にない | 直し方を 1 つに決める（各節は「その単位の時点の件数」として残し、14 行目と U9 の節で全 24 件を示す、など）。行番号の列挙に 564 行目を加える | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/monitoring-design.md > Logs & Tracing（最後の箇条書き）／cicd-pipeline.md > 手での確かめ 12 | 「ログに名前や金額が出ていないことは、問い合わせ 3 の結果の項目を目で見る程度で足りる」とあるが、問い合わせ 1〜6 は `fields` で選んだ項目しか表示しないため、選ばなかった項目に名前や金額が混ざっていても見えない。手での確かめ 12 の「出ていない」はこの方法では確かめられない | 手での確かめ 12 に、生の行を見る問い合わせ（例: `fields @message \| filter event = "ALLOWANCE_COMPUTED" \| sort @timestamp desc \| limit 5`）を足し、表示名・種類の名前・金額が行にないことを目で見る手順にする | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/infrastructure-design/monitoring-design.md > 冒頭の段落／Logs & Tracing の費用の項 | 冒頭に「追加の費用はありません」とあるが、同じ文書の後半と infrastructure-specification.md の費用の表では、Logs Insights の検索に従量の費用があり「0 円に近い」と書いている。費用 0 円の条件に対して、言い方が揺れている（実際の額は小さく、手で使うだけなので許容範囲） | 冒頭を「新しい資源の費用はない。手で使う Logs Insights の検索だけ、検索したデータ量の従量（月 1 ドルの Budgets の範囲内）」のように、後半と同じ言い方にそろえる | Resolved (reviewer) |

> R-01 Reviewer note: monitoring-design.md に「呼び出しの回数の取り方」（`AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`、`TableName`×`Operation`、`Users` の `familyId-index` は `GlobalSecondaryIndexName` の次元で別に数える、前後の差と 1 回ずつの 2 方法）が入った。`ConsumedReadCapacityUnits` の見込みは 4 KB ごとの計算に直り、「回数の代わりには使わない」と明記された。cicd-pipeline.md の「補助の記録」もこの取り方を参照している

> R-02 Reviewer note: cicd-pipeline.md の 3 秒の測定の表に、端末（LIFF と外部ブラウザの両方）、冷たい起動（30 分以上あけた回が 10 回以上、`Init Duration` で数える）、1 秒 30 コマ以上の録画、月の移動（[<] 10・[>] 10、うち 5 回は「読み込み直す」）、家族の組み立て（通常の月と大きい月）が NFR7.57 の番号つきで入った。SLO の表の「月の移動」の行にも「読み込み直す」が入った

> R-03 Reviewer note: CDK のスタックテストの表に「IAM の文の数が U8 の後と同じ（`api` 11、`line` 9）」の行が入った

> R-04 Reviewer note: 直し方が 1 つに決まった（各単位の節は「その単位の時点の件数」として残し、14 行目と U9 の節で全 24 件）。infrastructure-specification.md の食い違い 3 の行番号の列挙に 564 行目が入り、cicd-pipeline.md と一致している

> R-05 Reviewer note: monitoring-design.md に生の行を見る問い合わせ 7 が足され、手での確かめ 12 がそれを使って名前・金額が行にないことを目で見る手順になった。「問い合わせ 1〜6 は選んだ項目しか見せない」という理由も書かれている

> R-06 Reviewer note: monitoring-design.md の冒頭が「新しい資源の費用はない。手で使う Logs Insights の検索だけ、検索したデータ量の従量（月 1 ドルの Budgets の範囲内）」となり、後半と infrastructure-specification.md の費用の表と同じ言い方にそろった

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 前回の指摘 R-01〜R-06 と 3 つの文書の突き合わせ | 合格 | 6 件とも文書上で解消を確認した |
| 文書間の整合（件数・問い合わせ番号・参照先） | 合格 | 全 24 件、問い合わせ 1〜7、「呼び出しの回数の取り方」の参照が cicd-pipeline.md・monitoring-design.md・infrastructure-specification.md で食い違わない |
| 実コードの再確認（`app-stack.ts` など） | 未実施 | 今回は再確認の範囲で、前回（第 1 回）の「一致」の結果から変わる指摘がないため行っていない |

### Summary

前回の指摘 6 件（Major 1、Minor 5）はすべて直っており、新しい指摘はありません。インフラの変更なし・費用 0 円の結論は引き続き支持でき、開発者が追加の質問なしに実装と測定を進められる状態です。
