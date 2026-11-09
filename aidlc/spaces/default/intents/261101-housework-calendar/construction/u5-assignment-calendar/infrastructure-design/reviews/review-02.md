## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-08T14:40:15Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > 前の版に戻す の表（「本番に Calendar の項目がまだない」の行）と monitoring-design.md > Logs & Tracing の最後の箇条書き | 「本番の Calendar にまだ項目がない」と判断する根拠が、Logs Insights の問い合わせ 2 で `ASSIGNMENT_SAVED` が 0 件、という 1 点だけになっている。ところが `api` のロググループの保管は 30 日で、最初の保存から 30 日たつと 0 件に見える。また、保存が途中で失敗した場合は `ASSIGNMENT_PARTIAL_FAILURE` で担当だけがテーブルに残り、`ASSIGNMENT_SAVED` は 0 件のままになる。この判断を誤って `git revert` に進むと、本番の `RETAIN` のテーブルに入った家族の担当が使われない孤児になる。その行には「空のテーブルを消すかどうかは作り手が決める」とも書いてあり、中身がある表を消すと、「本番のデータを手で書き換えない」決まり（`team.md` / `project.md`）の外で失われる。 | 「項目がない」と言える確かめを、ログに頼らない形にする。たとえば、本番の `Calendar` を読み取りだけの操作で数える（`describe-table` の `ItemCount` は更新が遅いので、Query の COUNT など遅れのない読み取りを使う）か、`ConsumedWriteCapacityUnits` の全期間の合計が 0 であることを見る。ログで見る場合も、`ASSIGNMENT_PARTIAL_FAILURE` を含め、保管の 30 日より前のことは分からないと書く。孤児になった表を消す前に、中身が 0 件であることを同じ方法で確かめる、という手順を足す。確かめができないときは「戻さず前に進んで直す」側に倒すと書く。 | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > 前の版に戻す の表（「本番に Calendar の項目がまだない」の行と、最後の「テーブルまで外すとき」の行） | 2 行目は「`git revert` できる」と書くが、U5 のプルリクエストには `data-stack.ts` の `calendar` と `app-stack.ts` の `props.calendar.tableName`（`Housework-<env>-Data` の出力を `App` が参照する）が一緒に入っている。そのままの `git revert` を 1 回の `cdk deploy Housework-production-Data Housework-production-App` で反映すると、`App` が使っている出力を `Data` が消すことになり、CloudFormation が断る。2 回に分ける手順は最後の行にだけあり、2 行目からは辿れない。失敗しても元に戻るので安全だが、本番の反映が止まる。 | 2 行目に「テーブルごと戻すなら、最後の行のとおり 2 回に分ける（先に `App` から `Calendar` の環境変数・権限・props を外す）」と書き、単純な `git revert` では反映できないことを明記する。 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > ステージングでの手での確かめ の下の注（コールドスタートを作る手順） | 「`api` の環境変数にダミーの値を書き足して実行環境を作り直す。次の自動の反映で元に戻る」とあるが、CloudFormation は今回のテンプレートと前回のテンプレートの差だけを反映し、実際の設定のずれ（手で足した値）は直さない。`api` の設定（環境変数）がテンプレートで変わらない反映では、ダミーの値が残る。また `aws lambda update-function-configuration --environment` は環境変数の一覧を丸ごと置き換えるので、足したい値だけを渡すと `CALENDAR_TABLE` や `SSM_PREFIX` が消えてステージングの `api` が動かなくなり、これも自動では戻らない。 | 手順を直す。たとえば、「新しい実行環境」はワークフローの再実行（コードが変わった反映）か、一定時間使わないで待つ方法で作る。環境変数を触るなら、`get-function-configuration` で取った全変数にダミーを足して渡す、元に戻す手順も書く、と明記する。「次の反映で戻る」という記述は消す。 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > CDK のスタックテストの下の注（「上の 3 か所以外の既存テストは、そのまま通ります」） | この言い方は、テスト全体について言い切っている。実際には、バックエンド側にも影響がある。`entries/api.ts` の起動時に本物の C8 の窓口を取り付けると、`handler` を直接呼ぶ既存のテスト（`packages/backend/test/u1-skeleton-family/apiEntry.test.ts`、`create-family.steps.ts`、`session.steps.ts`、`u2-invitation/helpers/seed.ts` など）が、U4 の仮の窓口に頼っているか、`helpers/world.ts` が環境変数 `CALENDAR_TABLE` を入れていない・`helpers/fakeDynamo.ts` に `Calendar` の表がない、ために影響を受けうる。インフラの設計書の範囲外だが、「漏れがない」と読めてしまう。 | 「そのまま通る」の範囲を `infrastructure/test/` に限ると書く。バックエンド側の影響（`world.ts` の環境変数、`fakeDynamo.ts` の `Calendar` の表と ConditionCheck の扱い、窓口の取り付けの場所）は、コード生成で直すこととして 1 行で引き継ぐ。 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/monitoring-design.md > Metrics & KPIs（DynamoDB `ThrottledRequests`、`SystemErrors` の行）と、その下の「`TableName` は…探します」 | `ThrottledRequests` と `SystemErrors` は、`TableName` だけでなく `Operation` もディメンションに持つ指標（`TableName` だけでは合計が出ない）。`ConsumedWriteCapacityUnits`、`ConsumedReadCapacityUnits`、`TransactionConflict`、`ConditionalCheckFailedRequests` は `TableName` だけで足りる。書かれたまま探すと、`ThrottledRequests` と `SystemErrors` が「出ていない」ように見え、前提（Assumptions）の「メトリクスが出ていなければ請求の画面だけで確かめる」に流れてしまう。 | 2 つの指標の行に「`Operation` ごと（`PutItem`、`UpdateItem`、`DeleteItem`、`TransactWriteItems` など）に見る」と書く。 | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > CDK のスタックテスト > 変えないもの（と traceability.json の NFR3.6） | NFR3.6（同時実行数の上限 5 の中で動く）の確かめ方は「CDK の構成で確かめる」だが、テストの一覧に `api` の `ReservedConcurrentExecutions` が出てこない。実際の上限は GitHub の Variables の `RESERVED_CONCURRENCY` で決まり、未設定だと予約しない。 | 「変えないもの」に「コンテキスト `reservedConcurrency` を渡したとき `api` に `ReservedConcurrentExecutions` がつく（U1 のテストが確かめている）」を加えるか、NFR3.6 の対応先に U1 のテストを書く。上限は変数で決まり、未設定なら予約しないことも 1 行で明記する。 | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > README に足すこと | 既存の README には、U4 の確かめの 6 番「（U5 ができるまでは、割り当てがないので常に消せます）」と、スモークチェックの「全 15 件」がある。足す項目に、この 2 か所の書き換えが入っていない（19 件への変更は「README に足すこと」の 2 番目に近い記述があるが、U4 の 6 番の文は U5 の後は誤りになる）。 | 「README に足すこと」に、U4 の確かめの 6 番の注の書き換え（U5 以降は使っている種類は消せない）と、「全 15 件」の 19 件への書き換えを、明示して加える。 | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > 前の版に戻す の表（2 行目と 4 行目） | 2 行目の「2 回に分ける（次の行）」は、実際には次の行が「戻さない」の行で、2 回に分ける手順は 4 行目にある。また 4 行目の見出しは「反映前の本番、またはステージング」だが、2 行目は「反映後の本番で 0 件と確かめられたとき」も 2 回に分ける対象にしているので、4 行目の範囲と食い違う。反映前の本番にはテーブル自体がないので、「反映前の本番」という書き方も紛らわしい。読み違えると、本番でテーブルを外すときに 1 回の `git revert` で進めかねない。 | 2 行目の「（次の行）」を「（下の「テーブルまで外すとき」の行）」のように正しい行を指す書き方に直す。4 行目の場面を「項目が 0 件と確かめられた本番、またはステージング」に直す。 | New |
| R-09 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > Assumptions & Open Questions | 方法 1（読み取り専用の `scan` と `list-tables`）は、作り手の手元に本番の DynamoDB を読める読み取り専用の資格があることが前提だが、この前提が Assumptions に書かれていない。ない場合は、方法 1 を実行できず、本番ではテーブルを戻す場面がつねに「前に進んで直す」に倒れる。設計の安全側には倒れるので、害は小さい。 | Assumptions に「作り手は本番の DynamoDB を読み取り専用で読める資格を持つ。ない場合は方法 1 を実行できないので、戻し方はつねに『前に進んで直す』になる」を 1 行足す。 | New |

> R-01 Reviewer note: cicd-pipeline.md「項目がないことの確かめ方」が、ログに頼らない読み取りだけの確かめに変わった。主は強い整合性の `scan --select COUNT --consistent-read`（書き込みなし、`describe-table` の `ItemCount` は判断に使わない）、補助は `ConsumedWriteCapacityUnits` の全期間の合計。ログで見る場合も `ASSIGNMENT_PARTIAL_FAILURE` を含め、30 日より前は分からないと明記。確かめられなければ「戻さず前に進んで直す」、テーブルを消す直前にも同じ方法 1 で 0 件を確かめ直す。monitoring-design.md の末尾も同じ判断基準を指している。traceability.json の NFR6.6 も更新済み。

> R-02 Reviewer note: 戻し方 2 行目に「テーブルごと戻すなら 2 回に分ける」「単純な `git revert` 1 回では反映できない」「本番の Calendar は RETAIN で残り、再反映で新しい空のテーブルができる」が入った。2 回に分ける理由（App が Data の書き出しを取り込んでいる）は README の U3 の節と一致する。ただし参照先の書き方に小さな誤りが残る（New findings の 1 件目）。

> R-03 Reviewer note: コールドスタートの作り方は「コードが変わる反映」か「数十分以上待つ」になった。`update-function-configuration --environment` は変数を丸ごと置き換えるので使わない理由を書き、「次の反映で戻る」は削除された。どうしても触るときは全変数に足して渡し、測り終わったら元に戻す手順まで書かれている。本番ではやらない。

> R-04 Reviewer note: 「そのまま通る」は `infrastructure/test/` に限定された。バックエンド側は、`world.ts` への `CALENDAR_TABLE`、`fakeDynamo.ts` への Calendar の表と ConditionCheck の扱い、`calendarService` の取り付け場所、handler 直呼びの既存テストの確認、としてコード生成への引き継ぎに分けられた。両ヘルパーは存在し、`calendarPort.ts` の仮の窓口（`isChoreTypeAssigned` が常に false）も確認した。既存テスト 3 か所の壊れ方も実コードと合う: `u4-chore-types/stacks.test.ts` の `findChoreTypes` はキー形で探し Calendar と同形になる。u1 は 7 つの数え方が 2 か所。u4 の ConditionCheckItem なしと 5 つの確認。u2・u3 は別のキーで探し、line 側の確認なので影響しない。

> R-05 Reviewer note: monitoring-design.md の Metrics で、`ThrottledRequests` と `SystemErrors` は Operation ごとに分けて見ると明記され、理由（どの操作が詰まったか分からない）も書かれた。`TransactionConflict` と `ConditionalCheckFailedRequests` は分けない扱いで正しい。

> R-06 Reviewer note: NFR3.6 の行は、U1 のテスト名「予約された同時実行数は既定では付けず、コンテキストで付く」（`u1-skeleton-family/stacks.test.ts` に実在）を指すようになった。`RESERVED_CONCURRENCY` 未設定なら予約しない、という扱いも `deploy-staging.yml` と `deploy-production.yml` の `${RESERVED_CONCURRENCY:+-c reservedConcurrency=...}` と合う。cicd・infrastructure-specification・traceability の 3 つで言い方がそろっている。

> R-07 Reviewer note: README に足すことが具体的になった。U4 の節の「全 15 件」を「全 19 件」にする（スクリプトの現状 15 件 + 3i〜3l の 4 件で 19 件。内訳の式も合う）。U4 の確かめ 6 番の注を「U5 以降は、割り当てに使っている種類は消せません」にする。書き換え元の文は README の 377 行目・381 行目に実在する。スクリプト先頭コメントの書き換え案も合う。

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| エンジン・cdk・テストのコマンド | 実行していない（指示どおり） | 読み取りだけで確かめた。`infrastructure/test/` の u1〜u4、`scripts/smoke-check.sh`（現状 15 件）、README、`.github/workflows/` の `RESERVED_CONCURRENCY`、`packages/backend` のヘルパーと `calendarPort.ts` を読んで、設計の主張と突き合わせた |
| 既存テストの壊れ方の突き合わせ | 一致 | 壊れるのは 3 か所（u1 の数え方、u4 の `findChoreTypes` と tableName、u4 の 5 つの許可と ConditionCheckItem なし）。ほかは影響しない |
| スモークチェックの件数 | 一致 | 15 + 4 = 19 件。内訳の式も正しい |

### Summary

前回の Major（R-01）を含む R-01〜R-07 はすべて直っており、項目がないことの確かめは、読み取りだけで、ログに頼らず、確かめられなければ前に進む形になった。新しい問題は、戻し方の表の参照先と範囲の書き方、読み取り権限の前提の 2 件の Minor だけで、実装を妨げないため READY とする。
