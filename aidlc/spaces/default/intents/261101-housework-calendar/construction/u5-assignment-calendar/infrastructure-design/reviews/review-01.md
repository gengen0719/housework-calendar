## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-08T14:33:48Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > 前の版に戻す の表（「本番に Calendar の項目がまだない」の行）と monitoring-design.md > Logs & Tracing の最後の箇条書き | 「本番の Calendar にまだ項目がない」と判断する根拠が、Logs Insights の問い合わせ 2 で `ASSIGNMENT_SAVED` が 0 件、という 1 点だけになっている。ところが `api` のロググループの保管は 30 日で、最初の保存から 30 日たつと 0 件に見える。また、保存が途中で失敗した場合は `ASSIGNMENT_PARTIAL_FAILURE` で担当だけがテーブルに残り、`ASSIGNMENT_SAVED` は 0 件のままになる。この判断を誤って `git revert` に進むと、本番の `RETAIN` のテーブルに入った家族の担当が使われない孤児になる。その行には「空のテーブルを消すかどうかは作り手が決める」とも書いてあり、中身がある表を消すと、「本番のデータを手で書き換えない」決まり（`team.md` / `project.md`）の外で失われる。 | 「項目がない」と言える確かめを、ログに頼らない形にする。たとえば、本番の `Calendar` を読み取りだけの操作で数える（`describe-table` の `ItemCount` は更新が遅いので、Query の COUNT など遅れのない読み取りを使う）か、`ConsumedWriteCapacityUnits` の全期間の合計が 0 であることを見る。ログで見る場合も、`ASSIGNMENT_PARTIAL_FAILURE` を含め、保管の 30 日より前のことは分からないと書く。孤児になった表を消す前に、中身が 0 件であることを同じ方法で確かめる、という手順を足す。確かめができないときは「戻さず前に進んで直す」側に倒すと書く。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > 前の版に戻す の表（「本番に Calendar の項目がまだない」の行と、最後の「テーブルまで外すとき」の行） | 2 行目は「`git revert` できる」と書くが、U5 のプルリクエストには `data-stack.ts` の `calendar` と `app-stack.ts` の `props.calendar.tableName`（`Housework-<env>-Data` の出力を `App` が参照する）が一緒に入っている。そのままの `git revert` を 1 回の `cdk deploy Housework-production-Data Housework-production-App` で反映すると、`App` が使っている出力を `Data` が消すことになり、CloudFormation が断る。2 回に分ける手順は最後の行にだけあり、2 行目からは辿れない。失敗しても元に戻るので安全だが、本番の反映が止まる。 | 2 行目に「テーブルごと戻すなら、最後の行のとおり 2 回に分ける（先に `App` から `Calendar` の環境変数・権限・props を外す）」と書き、単純な `git revert` では反映できないことを明記する。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > ステージングでの手での確かめ の下の注（コールドスタートを作る手順） | 「`api` の環境変数にダミーの値を書き足して実行環境を作り直す。次の自動の反映で元に戻る」とあるが、CloudFormation は今回のテンプレートと前回のテンプレートの差だけを反映し、実際の設定のずれ（手で足した値）は直さない。`api` の設定（環境変数）がテンプレートで変わらない反映では、ダミーの値が残る。また `aws lambda update-function-configuration --environment` は環境変数の一覧を丸ごと置き換えるので、足したい値だけを渡すと `CALENDAR_TABLE` や `SSM_PREFIX` が消えてステージングの `api` が動かなくなり、これも自動では戻らない。 | 手順を直す。たとえば、「新しい実行環境」はワークフローの再実行（コードが変わった反映）か、一定時間使わないで待つ方法で作る。環境変数を触るなら、`get-function-configuration` で取った全変数にダミーを足して渡す、元に戻す手順も書く、と明記する。「次の反映で戻る」という記述は消す。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > CDK のスタックテストの下の注（「上の 3 か所以外の既存テストは、そのまま通ります」） | この言い方は、テスト全体について言い切っている。実際には、バックエンド側にも影響がある。`entries/api.ts` の起動時に本物の C8 の窓口を取り付けると、`handler` を直接呼ぶ既存のテスト（`packages/backend/test/u1-skeleton-family/apiEntry.test.ts`、`create-family.steps.ts`、`session.steps.ts`、`u2-invitation/helpers/seed.ts` など）が、U4 の仮の窓口に頼っているか、`helpers/world.ts` が環境変数 `CALENDAR_TABLE` を入れていない・`helpers/fakeDynamo.ts` に `Calendar` の表がない、ために影響を受けうる。インフラの設計書の範囲外だが、「漏れがない」と読めてしまう。 | 「そのまま通る」の範囲を `infrastructure/test/` に限ると書く。バックエンド側の影響（`world.ts` の環境変数、`fakeDynamo.ts` の `Calendar` の表と ConditionCheck の扱い、窓口の取り付けの場所）は、コード生成で直すこととして 1 行で引き継ぐ。 | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/monitoring-design.md > Metrics & KPIs（DynamoDB `ThrottledRequests`、`SystemErrors` の行）と、その下の「`TableName` は…探します」 | `ThrottledRequests` と `SystemErrors` は、`TableName` だけでなく `Operation` もディメンションに持つ指標（`TableName` だけでは合計が出ない）。`ConsumedWriteCapacityUnits`、`ConsumedReadCapacityUnits`、`TransactionConflict`、`ConditionalCheckFailedRequests` は `TableName` だけで足りる。書かれたまま探すと、`ThrottledRequests` と `SystemErrors` が「出ていない」ように見え、前提（Assumptions）の「メトリクスが出ていなければ請求の画面だけで確かめる」に流れてしまう。 | 2 つの指標の行に「`Operation` ごと（`PutItem`、`UpdateItem`、`DeleteItem`、`TransactWriteItems` など）に見る」と書く。 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > CDK のスタックテスト > 変えないもの（と traceability.json の NFR3.6） | NFR3.6（同時実行数の上限 5 の中で動く）の確かめ方は「CDK の構成で確かめる」だが、テストの一覧に `api` の `ReservedConcurrentExecutions` が出てこない。実際の上限は GitHub の Variables の `RESERVED_CONCURRENCY` で決まり、未設定だと予約しない。 | 「変えないもの」に「コンテキスト `reservedConcurrency` を渡したとき `api` に `ReservedConcurrentExecutions` がつく（U1 のテストが確かめている）」を加えるか、NFR3.6 の対応先に U1 のテストを書く。上限は変数で決まり、未設定なら予約しないことも 1 行で明記する。 | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md > README に足すこと | 既存の README には、U4 の確かめの 6 番「（U5 ができるまでは、割り当てがないので常に消せます）」と、スモークチェックの「全 15 件」がある。足す項目に、この 2 か所の書き換えが入っていない（19 件への変更は「README に足すこと」の 2 番目に近い記述があるが、U4 の 6 番の文は U5 の後は誤りになる）。 | 「README に足すこと」に、U4 の確かめの 6 番の注の書き換え（U5 以降は使っている種類は消せない）と、「全 15 件」の 19 件への書き換えを、明示して加える。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| 指示によりエンジンのコマンド・`cdk`・テストは実行していない | 未実行 | 読み合わせだけで確かめた。下の「確かめたこと」は、既存コードとの突き合わせの結果 |
| traceability.json と nfr-design/traceability.json の ID の照合 | 一致 | 31 個の ID がすべて対応している。`status` はすべて `OK`。GAP なし |
| `Calendar` の定義と `data-stack.ts` の `common` | 整合 | 課金・暗号化・削除の扱いは `common` の展開で揃う。キーは `ChoreTypes` と同じ形で、索引なし、`tableName` なし。本番 `RETAIN`、ステージング `DESTROY` |
| IAM の最小権限 | 整合 | `Calendar` は 6 つ、`ChoreTypes` は `ConditionCheckItem` を足して 6 つ。`Scan`、`BatchGetItem`、`BatchWriteItem` なし。`line` に `Calendar` なし。`Users` は既存の `GetItem` で足りる。TransactWriteItems の許可が「項目ごとの操作とテーブルごと」という説明も正しい（`TransactWriteItems` という IAM の操作はない） |
| 既存の CDK テストへの影響 | 3 か所の特定は正しい | `u1` のテーブル数 7（2 か所）、`u4` の `findChoreTypes`（キーの形が `Calendar` と同じ）、`u4` の `ChoreTypes` の許可 5 つ。`u2`、`u3` は影響なし。`AppStackProps` に `calendar` を足すので `tsc -p infrastructure` で確かめる、も妥当（`AppStack` を直接作るテストはない） |
| スモークチェック | 整合 | 現状 15 件（4 + 5 + 1 + 5）、3i〜3l の 4 件で 19 件。`api.ts` の順序（振り分け → 秘密のヘッダー → 認証）なので 401 で止まり、書き込みなし |
| 費用 | 計算は整合 | 書き込み約 1100（2 回の保存 × 約 540 + 変更）、読み取り約 7000 ユニット。約 0.002 ドル。オンデマンドは無料枠の対象外と明記し、丸めの前提を未確認と認めて確かめ方（量 → 請求の増分）も決めている。単価は概算で未確認（Assumptions に明記済み） |

### Summary

構成の設計（テーブル、環境変数、権限、CDK テスト、スモークチェック、費用の確かめ、traceability）は、既存コードと突き合わせて実装できる水準で、Critical はない。NOT-READY の理由は Major 1 件だけで、「本番に項目がまだない」という戻し方の分岐の根拠がログだけ（30 日保管、途中失敗を見落とす）なので、誤ると家族のデータが孤児になり、さらに表を消す操作まで書かれている点である。Minor は、戻し方の手順の矛盾、コールドスタートの作り方の誤り、既存テストの影響の範囲の書き方、DynamoDB の指標のディメンション、NFR3.6 の確かめ、README の更新の漏れ。
