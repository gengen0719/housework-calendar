# 反映の流れ（CI/CD Pipeline）— U8 代わりにやる

U8（`u8-swap`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。U7 と同じく、CDK のインフラ定義（`app-stack.ts`・`data-stack.ts`）も変えません。変えるのは、CDK のテスト（新規 `infrastructure/test/u8-swap/stacks.test.ts`）、README、`docs/contract-changes-u8.md`、アプリコード（`packages/*`）だけです。**スモークチェック（`scripts/smoke-check.sh`）は変えません**（理由は下）。

## ワークフロー

| ワークフロー | U8 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U8 のコードも Prettier、ESLint、型の検査（`tsc` の 4 つのプロジェクト。`infrastructure` を含む）、Vitest（行カバレッジ 80% 以上。NFR8.14）、gitleaks、`cdk synth` を通す |
| `deploy-staging.yml` | 変更なし。`main` への取り込みで、CI のあと `cdk deploy Housework-staging-Data Housework-staging-App` が走り（`Housework-staging-Data` は差分なし、`AppStack` の IAM・環境変数の追加もなし）、そのあと `smoke-check.sh` が走る |
| `deploy-production.yml` | 変更なし。作り手が手で動かす |

- 新しい秘密の情報、GitHub の Variables、パラメータストアのパラメータは足しません
- `cdk deploy` の差分はアプリコード（Lambda のバンドル）だけです。権限の追加が無いため、配備の途中で止まる要素もありません

## CDK のスタックテスト（`infrastructure/test/u8-swap/stacks.test.ts`）

U7 のテスト（`u7-review-confirm/stacks.test.ts`）と同じ作り（`buildApp` でスタックを組み立て、`Template` で確かめる。ダミーの秘密の値は `test/fixtures/fakeSecrets.ts`）で、**U8 の前後で構成が変わらないこと**を固定します（NFR4.82、NFR1.33、NFR3.16、NFR6.9）。

| 区分 | 確かめること |
|------|-------------|
| `line` の `Calendar` | `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` の 4 操作のまま（NFR4.82） |
| `line` の `ChoreTypes` | `GetItem`・`Query`・`ConditionCheckItem` の 3 操作のまま |
| `line` に足さないものがない | `Calendar` に `PutItem`・`DeleteItem`・`Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*` が無い。`ChoreTypes` に書き込み系が無い。`Resource: "*"` の DynamoDB の文が無い（`kms:Decrypt` の条件つき文は U1 のまま） |
| `line` の既存の権限 | `Users`・`ProcessedLineEvents`・`NotificationGroups`・`Families`・SSM（`line/*`・`cloudfront/*`）が U6 のまま |
| `line` の環境変数 | U6 のまま（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` を含む）。新しい環境変数が無い |
| `api` の `Calendar`・`ChoreTypes` | それぞれ 6 操作のまま。`api` の環境変数も変わらない（NFR4.82） |
| 環境の分離 | ステージングの `line`・`api` が本番のテーブルの ARN を含まない |
| Lambda の大きさ | `api`・`line` とも MemorySize 256・Timeout 30・ARM64 のまま。`reservedConcurrency` をコンテキストで与えないとき予約が付かない（U1 のまま。NFR3.16） |
| ロググループ | 保管 30 日のまま |
| 構成の数 | テーブル 8、Lambda、ロググループ、`AWS::Logs::MetricFilter`（1 つ）、アラーム（0 件）が U7 の後と同じ（NFR1.33） |
| 本番の `Calendar` | `DeletionPolicy = Retain` のまま（NFR6.9） |

```ts
// U7 の stacks.test.ts と同じヘルパーを使う（設計の説明。≤15 行）
it('line の Calendar は U6 のまま（4 操作）。U8 で増えない', () => {
  expect(actionsOnTable(lineStatements(), 'Calendar')).toEqual([
    'dynamodb:ConditionCheckItem', 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem',
  ]);
});
it('line の環境変数に新しい表の名前が足されていない', () => {
  expect(Object.keys(lambdaVariables('line')).sort()).toEqual(LINE_VARIABLES_AFTER_U6);
});
```

### 既存テストへの影響

U8 は `app-stack.ts`・`data-stack.ts` を変えないので、既存の CDK テストは U8 で**1 件も壊れません**。`u4-chore-types/stacks.test.ts` と `u5-assignment-calendar/stacks.test.ts` の `it.skip`（U6 で `line` に権限を足したため）は、そのまま触りません。`u6-recording`・`u7-review-confirm` のテストも U8 後に通ります。

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

**変更なし（全 23 件のまま）。** U8 は新しい HTTP の入口（`/v1/*`）を足さず、LINE の webhook と postback は既存の `POST /line/webhook`（署名なしで 401。smoke-check の 3）を通ります。「家事交代」と `swap.*` の動きを確かめるには、本物のチャネルのシークレットで計算した署名が要り、スモークチェックにシークレットを持たせないため、**スモークチェックでは確かめません**。代わりに、次の手での確かめ（ステージング）と、`line` の統合に近い単体テストで確かめます。

## 反映の順番

1. U8 のプルリクエストを `main` に取り込む（CI が通ってから squash-merge）→ ステージングに自動で反映される（`Housework-staging-Data` と `Housework-staging-App` の両方を反映。`Data` は差分なし、`App` はコード反映のみ）
2. `smoke-check.sh` が通ることを確かめる（23 件。U8 で件数は変わらない）
3. 作り手がステージングで手で確かめる（下の表）
4. `deploy-production.yml` を手で動かす（本番に同じコードが入る）
5. 本番で `smoke-check.sh` の結果と、`monitoring-design.md` の問い合わせ 3・4（失敗・フックの失敗が 0 件）を確かめる

### ステージングでの手での確かめ

ステージング用の公式アカウントと、作り手だけのグループを使います。グループに、子供の役割のテスト用の利用者を 2 人以上と管理者を入れます。ステージングの公式アカウントを本番のお知らせ先のグループに入れません（NFR10.9）。データはアプリの操作（割り当ての保存、LINE の操作）で作り、直接書き換えて用意しません（NFR6.9）。

| # | 操作 | 期待 |
|---|------|------|
| 1 | 子供 A がグループで「家事交代」と送る | 代われる担当の一覧（carousel。10 件まで、11 件以上は案内）が出る。金額・UUID が本文に出ない |
| 2 | 子供 A が一覧から担当を選ぶ | 申し出た旨が、日付・お手伝いの名前・A の名前でグループに出る（「引き受ける」「申し出をやめる」の 2 ボタン） |
| 3 | 子供 B が「引き受ける」を押す | 担当が B に変わる。カレンダー（画面）で B の担当として見える。金額は変わらない |
| 4 | 子供 A が自分の申し出を別の担当で出し、B と C が同時に「引き受ける」を押す | 先着の 1 人だけが引き受けられ、もう 1 人は「もう引き受けられています」の文（`OFFER_ALREADY_ACCEPTED`）になる |
| 5 | 子供 A が自分の申し出を自分で引き受けようとする | 断られる（`CANNOT_ACCEPT_OWN_OFFER`） |
| 6 | 子供 A が申し出をやめる | 申し出が取り下げられ、古い「引き受ける」を押すと「もうありません」（`OFFER_GONE`） |
| 7 | 管理者が「家事交代」と送る | 管理者向けの案内だけが出る（`SWAP_GUIDE_SENT`）。1 対 1 のトークでも案内だけ |
| 8 | 申し出のあと、管理者が画面で同じ担当の子供を変える（または担当を済にする、月を確定する） | 申し出が自動でなくなる（古いボタンは「もうありません」）。`SWAP_OFFER_CLOSED` が 1 件出る |
| 9 | 確定済みの月の担当を申し出る | `MONTH_CONFIRMED` の文で断られる |
| 10 | 登録されていないグループ、友だちでない人、ほかの家族のボタン貼り付け | 決まった文で断られる、またはグループの入口で止まる。`Calendar` を読み書きしない |
| 11 | `line` と `api` のログを見る（`monitoring-design.md` の問い合わせ 1〜7） | 各イベントが 1 件ずつ出る。表示名・お手伝いの名前・LINE のユーザー ID・グループ ID・単価がログに出ない。`GROUP_COMMAND_REJECTED` に `groupId` が無い |
| 12 | 速さを測る（NFR7.39〜NFR7.42。コールドスタートを含めて 20 回ずつ） | 一覧は 20 回中 19 回以上が 3 秒以内。選ぶ・引き受ける・やめるは 95% が 3 秒以内（結果は `build-and-test` の記録に残す） |
| 13 | 月の確定とフックを測る（NFR7.46）。担当の作り直し有り／無しを分けて記録する。1 回目の確定の前に、いくつかの担当に開いた申し出を作っておく | (1) 確定の応答が 20 回中 19 回以上、3 秒以内（画面録画）。(2) 確定の `REQUEST_END.durationMs` が 2,000 ms 以内、`DUTY_HOOKS_DONE.durationMs` が 1,000 ms 以内（95%）。(3) 測定の間 `Calendar` の `WriteThrottleEvents`・`ThrottledRequests` が 0 で、書き込みは 300 件以内の `UpdateItem`。(4) 1 回目の確定で、開いていた申し出がすべて `cancelled` になり（問い合わせ 6）、開いていなかった担当に `SWAP#` の項目が作られていない |
| 14 | U8 の反映後の測り直し（U5〜U7 の既存の目標。NFR7.48） | 既存の目標のまま |

- コールドスタートの作り方は U5〜U7 と同じ（コードが変わる反映、または数十分以上待つ）。環境変数や設定を手で書き換える方法は使いません（NFR6.9、NFR10.9）
- 本番ではテストデータを入れません
- LINE の carousel／ボタンの大きさ・色の差（NFR9.9）と LINE の上限（NFR8.15）は、コード生成の最初の手順で公式資料と色の値で確かめた結果を `docs/contract-changes-u8.md` に残します。ステージングの手での確かめでは目で見て確認します

## 前の版に戻す

| 場面 | 戻し方 |
|------|--------|
| U8 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する（NFR10.10） |
| 権限・環境変数を戻す必要があるか | ない。U8 は `app-stack.ts` を変えないので、戻しても消える権限・環境変数はない |
| データ | 移行も削除も要らない。`SWAP#` の項目は前の版から読まれず無害で残る |

- 戻すと「家事交代」と `swap.*` のボタンは反応しなくなります。引き受けた担当は画面からの担当の変更と同じ状態として残ります。並行数の変更を戻しても保存の結果は変わりません

## 費用の確かめ

U8 の増分（月に 1 円に満たない見込み）は、U5 の最初の請求の確認（`construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md` の「費用の確かめ（最初の請求）」）に含めて見ます。U8 は reply だけを使い（無料のメッセージ数に数えない。NFR1.32）、新しい有料のサービスも足さないので、U5 の範囲内に収まるはずです。

## README に足すこと

- 速さの測り方（NFR7.48）: 「家事交代」の一覧・担当を選ぶ・引き受ける・やめるを、ステージングで 20 回ずつ測る手順（冷たい起動 10 回以上、`REPORT` の `Init Duration` の読み方、画面録画（グループのトーク画面）から読み取る手順、除外しない）。一覧は 20 回中 19 回以上、ほかは 95% が 3 秒以内。理由つきの返事（候補なし・確定済み）は各 3 回
- フックの測り方（NFR7.46）: 月の確定の時間と `DUTY_HOOKS_DONE.durationMs` の測り方（300 件規模の用意の仕方、問い合わせ 5）
- U8 の反映後の測り直し（U5〜U7 の既存の目標）の手順
- 環境変数や設定を手で書き換えてコールドスタートを作らないこと（NFR6.9）
- スモークチェックの記述は変更なし（全 23 件）。U8 の動作はスモークチェックでは確かめず、手での確かめで行うことを書く

## 秘密の情報

U8 で新しい秘密の情報はありません。チャネルのシークレット・トークンは U1 の SSM（`line/*`）を `line` が起動時に読む、これまでどおりです。スクリプトにも README にもテストにも値を書きません（例は `<作り物の値>`。署名の確かめのテストは作り物の秘密で計算した HMAC を使う。NFR5.15）。gitleaks（CI）が通ること。

## Sources

- `construction/u8-swap/infrastructure-design/infrastructure-specification.md`、`monitoring-design.md`
- `construction/u8-swap/nfr-design/logical-components.md`（CDK のテスト、配備の順番、元に戻す手順、費用）
- `construction/u8-swap/nfr-design/security-design.md`（NFR4.82、NFR5.14、NFR5.15）
- `construction/u8-swap/nfr-design/performance-design.md`（NFR7.39〜NFR7.48、測り方）
- `construction/u8-swap/nfr-design/reliability-design.md`（NFR6.9、先着、`Calendar` の RETAIN）
- `construction/u7-review-confirm/infrastructure-design/cicd-pipeline.md`（形の手本）
- `scripts/smoke-check.sh`（既存。全 23 件）、`.github/workflows/`（既存）、`infrastructure/test/u7-review-confirm/stacks.test.ts`（テストの形の手本）、`infrastructure/test/u4-chore-types/stacks.test.ts`・`u5-assignment-calendar/stacks.test.ts`（`it.skip` 済みの各 1 件）、`infrastructure/lib/app-stack.ts`・`data-stack.ts`（U8 で変えない）

## Assumptions & Open Questions

- [assumption] スモークチェックに U8 の確かめを足しません。署名つきの webhook を作るには本物のチャネルのシークレットが要り、スクリプトにシークレットを持たせない方針（NFR5.14）に反するためです。`POST /line/webhook`（署名なしで 401）は既存の 3 で確かめ済みです
- [assumption] U8 は `app-stack.ts` を変えないため、既存の `it.skip` 2 件は触れずスキップのままで、U8 で追加で壊れる既存の CDK テストはありません
- [assumption] `docs/contract-changes-u8.md`、README の文、アプリコードはコード生成で作ります。Infrastructure Design の成果物には含みません
- [assumption] `LINE_VARIABLES_AFTER_U6` のような固定値の持ち方は、U7 のテストの書き方に合わせてコード生成で決めます
- 追加の質問はありません
