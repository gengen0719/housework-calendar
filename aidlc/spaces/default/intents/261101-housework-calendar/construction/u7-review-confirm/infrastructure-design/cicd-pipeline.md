# 反映の流れ（CI/CD Pipeline）— U7 確認・修正と確定

U7（`u7-review-confirm`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。U6 と違い、CDK のインフラ定義（`app-stack.ts`）も変えません。変えるのは、CDK のテスト（新規 `infrastructure/test/u7-review-confirm/stacks.test.ts`）、スモークチェック（`scripts/smoke-check.sh` に 3 件追加）、README、アプリコード（`packages/*`）だけです。

## ワークフロー

| ワークフロー | U7 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U7 のコードも Prettier、ESLint、型の検査（`tsc` の 4 つのプロジェクト。`infrastructure` を含む）、Vitest（行カバレッジ 80% 以上。NFR8.11）、gitleaks、`cdk synth` を通す |
| `deploy-staging.yml` | 変更なし。`main` への取り込みで、CI のあと `cdk deploy Housework-staging-App` が走り（`DataStack` は変更なし、`AppStack` の IAM・環境変数の追加もなし）、そのあと `smoke-check.sh` が走る |
| `deploy-production.yml` | 変更なし。作り手が手で動かす |

- 新しい秘密の情報、GitHub の Variables、パラメータストアのパラメータは足しません
- U7 は `AppStack` の IAM・環境変数を変えないので、`cdk deploy` の差分はアプリコード（Lambda のバンドル）だけです。権限の追加がないため配備の途中で止まる要素もありません。権限と環境変数が U7 の前後で同じであることは CDK のテストが固定して守ります

## CDK のスタックテスト（`infrastructure/test/u7-review-confirm/stacks.test.ts`）

U6 のテスト（`u6-recording/stacks.test.ts`）と同じ作り（`buildApp` でスタックを組み立て、`Template` で確かめる。ダミーの秘密の値は `test/fixtures/fakeSecrets.ts`）で、**U7 の前後で構成が変わらないこと**を確かめます（NFR4.71、NFR4.72、NFR1.31、NFR6.8、NFR3.13）。U7 は `app-stack.ts` を変えないので、このテストは「変わっていない」ことの固定が中心です。

### 確かめること（U7 の前後で同じであること）

| 区分 | 確かめること |
|------|-------------|
| `api` の `Calendar` の許可 | U5 のまま（6 つ: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem）。U7 で増えも減りもしない（NFR4.71） |
| `api` の `ChoreTypes` の許可 | U4 のまま（6 つ: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem）。U7 で変わらない |
| `api` の環境変数 | `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` がある（U4・U5）。U7 で新しい環境変数を足さない |
| `api` の既存の権限 | `Users`・`Families`・`RequestRecords`・`Invitations`・`NotificationGroups`・SSM が U6 のまま変わらない |
| `api` に禁止の形がない | `Calendar`・`ChoreTypes` に `Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*` が含まれない。`Resource: "*"` の DynamoDB の文がない（`kms:Decrypt` の条件つき文は U1 のまま） |
| `line` の許可 | U6 のまま（`Calendar` 4 つ、`ChoreTypes` 3 つ、既存の `Users`・`ProcessedLineEvents`・`NotificationGroups`・`Families`・SSM）。U7 で変わらない（NFR4.72） |
| `line` の環境変数 | U6 のまま（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` を含む）。U7 で変わらない |
| Lambda の大きさ | `api`・`line` とも MemorySize 256・Timeout 30・ARM64 のまま（NFR3.13） |
| ロググループ | 保管 30 日のまま |
| メトリクスフィルター | `AWS::Logs::MetricFilter` は 1 つのまま（U7 でメトリクスフィルターを足さない。NFR1.31、NFR2.53） |
| 構成の数 | テーブル 8、Lambda 4（api・line ＋ CDK の補助 2）、ロググループ 2 が U7 の前後で同じ（NFR1.31） |
| 本番の `Calendar` | `DeletionPolicy = Retain` のまま（NFR6.8） |
| 環境の分離 | ステージングの `api`・`line` が本番の `Calendar`・`ChoreTypes` の ARN を含まない（クロス環境参照がない） |

### テストの形（U6 のテストと同じヘルパーを使う。設計の説明用）

```ts
// U6 の stacks.test.ts と同じ statementsFor/actionsOnTable/lambdaVariables を使う（設計の説明。≤15 行）
it('api の Calendar は U5 のまま（6 つ）。U7 で増えない', () => {
  expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual([
    'dynamodb:ConditionCheckItem', 'dynamodb:DeleteItem', 'dynamodb:GetItem',
    'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem',
  ]);
});
it('api に CALENDAR_TABLE と CHORE_TYPES_TABLE がある（U4・U5）。U7 で足さない', () => {
  const vars = lambdaVariables('api');
  expect(vars.CALENDAR_TABLE).toBeDefined();
  expect(vars.CHORE_TYPES_TABLE).toBeDefined();
});
// line の Calendar(4)・ChoreTypes(3)、構成の数、MemorySize 256/Timeout 30、本番 Calendar の Retain も同様に固定
```

### 既存テストへの影響（U7 で新たに壊れるものがないことの確認）

U7 は `app-stack.ts`（`api`・`line` の IAM と環境変数、Lambda の設定）を**変えません**。したがって、`AppStack`・`DataStack` を確かめる既存の CDK テストは U7 で**1 件も壊れません**。

- U6 で既に `it.skip` にした 2 件（`test/u5-assignment-calendar/stacks.test.ts` の「`line` に Calendar も ChoreTypes も含む文がない（U5 の時点の確認…）」と `test/u4-chore-types/stacks.test.ts` の「`line` に ChoreTypes の許可がない（U4 の時点の確認…）」）は、U6 の権限追加で壊れたためスキップ済みです。U7 は `line` を変えないので、この 2 件は**U7 でも引き続きスキップのまま**で、U7 が新たに戻す・壊すことはありません
- U6 の `u6-recording/stacks.test.ts`（`line` の Calendar 4・ChoreTypes 3、`api` の Calendar 6・ChoreTypes 6、構成の数、Lambda の大きさ、本番 Calendar の Retain）は、U7 で `app-stack.ts` を変えないため**U7 後も通ります**
- U4・U5 の `api` の権限を確かめるテスト（`api` の `ChoreTypes` 6 つ・`Calendar` 6 つ）も、`api` を変えないため変化なし
- U1 の「DynamoDB テーブル 8 つ」テストも、`DataStack` を変えないため変化なし

> **結論**: U7 の CDK コードは `app-stack.ts` に差分を作らないため、U7 の反映で**追加で壊れる既存の CDK テストはありません**。U6 で `it.skip` にした 2 件は、U7 でも触れずスキップのままにします（U7 で復活も削除もしません）。新規の `u7-review-confirm/stacks.test.ts` は「U7 の前後で `api`・`line` の権限・環境変数・構成の数が同じ」ことを新たに固定します。

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

U6 の確かめ（3m）のあとに 3n〜3p の 3 件を追加し（U7 の 3 入口それぞれ）、先頭コメントの件数を 23 件に直します。番号は `3n` から始めます（現在 20 件 → 23 件）。

| 番号 | 確かめ | HTTP メソッド / 引数 | 期待 |
|------|--------|-------------------|------|
| 3n | `POST /v1/duties/:dutyId/status`（セッションなし） | `-X POST -H "$json" --data '{}'` | 401 |
| 3o | `PUT /v1/months/:month/confirmation`（セッションなし） | `-X PUT -H "$json" --data '{}'` | 401 |
| 3p | `DELETE /v1/months/:month/confirmation`（セッションなし） | `-X DELETE` | 401 |

- `duty_id` 変数は U5 で定義済みのもの（`11111111-1111-4111-8111-111111111111`）を使い回します。`month` は `2000-01`（U5 と同じ作り物）をリテラルで URL に埋め込みます（`${month}` のような変数は足しません）
- `POST /v1/duties/:dutyId/status` は U7 で初めて使う入口ですが、`POST …/record`（U6）と同じパス型なので CloudFront を通って `api` まで届き、セッションなしで 401 になることを確かめます。`PUT`・`DELETE /v1/months/:month/confirmation` は U7 で初めて使うメソッド・パスなので、CloudFront を通って `api` まで届く（403・405 にならない）ことも分かります
- スモークチェックは書き込みをしません（セッションなしで 401 で止まる。本文は空でも 401）

**実装の詳細（smoke-check.sh に足す差分）**:

```bash
# 3n〜3p. U7 の状態の変更・確定・取り消しがセッションなしで 401（書き込みはしない）。
# duty_id は U5 で定義済み（11111111-1111-4111-8111-111111111111）、month は U5 と同じ 2000-01 を使う
check "POST /v1/duties/:dutyId/status (セッションなし)" 401 \
  -X POST -H "$json" --data '{}' "${base}/v1/duties/${duty_id}/status"
check "PUT /v1/months/:month/confirmation (セッションなし)" 401 \
  -X PUT -H "$json" --data '{}' "${base}/v1/months/2000-01/confirmation"
check "DELETE /v1/months/:month/confirmation (セッションなし)" 401 \
  -X DELETE "${base}/v1/months/2000-01/confirmation"
```

先頭コメントを「全 23 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件、3i〜3l が U5 の 4 件、3m が U6 の 1 件、3n〜3p が U7 の 3 件」に直します。

## 反映の順番

1. U7 のプルリクエストを `main` に取り込む（CI が通ってから squash-merge）→ ステージングに自動で反映される（`AppStack` のコード反映のみ。IAM・環境変数の差分なし）
2. `smoke-check.sh` が通ることを確かめる（23 件）
3. 作り手がステージングで手で確かめる（下の表）
4. `deploy-production.yml` を手で動かす（本番に同じコードが入る）
5. 本番で `smoke-check.sh` の結果と、`monitoring-design.md` の問い合わせ 4（思いがけない失敗・フックの失敗が 0 件）を確かめる

### ステージングでの手での確かめ

家族 4 人分（管理者 1 人、子供 3 人、種類 4 つ、1 か月分の担当約 124 件。U5・U6 と同じ量）。データはアプリの画面（割り当ての保存、記録）で作り、直接書き換えて用意しません（NFR6.8）。

| # | 操作 | 期待 |
|---|------|------|
| 1 | 管理者で日の詳細を開き、「済」の担当の「取り消す」を押して確認で「はい」 | 「済 → 未 に戻します」の確認（「お小遣いの回数から外れます」付き）→ 「未」に変わり、カレンダーが読み直される |
| 2 | 「未」の担当の「済にする」を押して確認で「はい」 | 「『済』にします（{単価} 円で数えます）」の確認 →「済 HH:MM お母さんが記録」に変わる |
| 3 | 「未」の担当の「やらなかったにする」、「×」の担当の「やらなかったを外す」 | それぞれ「×」「未」に変わる（FR6.1 の 5 とおり） |
| 4 | 子供のアカウントで日の詳細を開く | 状態を変えるボタンが出ない（見るだけ。BR8.1） |
| 5 | 子供のアカウントで `POST /v1/duties/:dutyId/status` を直接呼ぶ | 403 `ADMIN_ONLY`（担当・月・単価を読み書きしない。NFR4.65） |
| 6 | カレンダーの月の見出しの「この月を確定する」を押す（未が N 件残っている月） | 「未の担当が N 件あります…」の確認 →「確定済み」の表示が出る |
| 7 | 確定済みの月で、記録・状態の変更・割り当ての変更を試す | すべて `MONTH_CONFIRMED` に断られる（各単位の `buildMonthGuard`） |
| 8 | 確定済みの月の「確定を取り消す」を押す | 「確定済み」が消え、また変更・記録ができる |
| 9 | 行の無い月（記録のない月）を確定する | 確定行が作られ「確定済み」になる。取り消すと行が消えずに未確定になる（または何もしない。BR8.11・BR8.12） |
| 10 | 確定していない過去の月（例: 先月）の担当の状態を変える | 変えられる（NFR2.48、AC6.1.8） |
| 11 | 別の端末で同じ担当を先に変えてから、古いボタンで状態を変える | `INVALID_TRANSITION` または `MONTH_CONFIRMED` の文言（「この担当は先に変更されました」など）。読み直す |
| 12 | 確認ダイアログで Esc を押す | ダイアログが閉じ、押したボタンにフォーカスが戻る（`aria-busy`。NFR9.8） |
| 13 | `api` のログを見る（`monitoring-design.md` の問い合わせ 1・2） | `DUTY_STATUS_CHANGED`・`MONTH_CONFIRMED_SET` に `durationMs` が出る。表示名・単価が出ない |
| 14 | 速さを測る（NFR7.33・NFR7.34。コールドスタートを含めて 20 回） | 95% が 3 秒以内（結果は `build-and-test` の記録に残す） |

- コールドスタートを作る方法は U5・U6 と同じ（コードが変わる反映、または数十分以上待つ）。環境変数を手で書き換える方法は使いません（NFR10.8、NFR6.8）
- 本番ではテストデータを入れません

## 前の版に戻す

| 場面 | 戻し方 |
|------|--------|
| U7 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する |
| 権限・環境変数だけを戻す必要があるか | **ない**。U7 は `app-stack.ts` を変えないので、戻しても消える権限・環境変数はない（U6 と違う点。`infrastructure-specification.md` の「元に戻す手順」） |
| ステージング | `Calendar` のデータは確認用なので失ってよい（U5 の `DESTROY` で既存） |

- U7 は `Calendar` の既存の項目（担当の状態・月の状態）を書き換えるので、本番でコードを戻しても、書き込み済みの状態や月の確定は `Calendar` に残ります（U5 の `RETAIN`。消えない）。戻したコードが U7 以前なら状態の変更・確定の入口が無くなりますが、既存のデータは壊れません（月の状態の追加属性 `confirmedAt`・`confirmedByUserId`・`version` は U5・U6 が読まないので無害）
- 元に戻すボタンは画面に置かず、もう一度操作して直します（U5・U6 と同じ）

## 費用の確かめ

U7 の増分（月に 1 円に満たない見込み）は、U5 の最初の請求の確認（`construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md` の「費用の確かめ（最初の請求）」）に含めて見ます。U7 だけを分けて確かめる必要はありません。U7 は LINE を呼ばず（無料のメッセージ数を使わない。NFR1.30）、新しい有料のサービスも足さないので、U5 の範囲内に収まるはずです。

## README に足すこと

- 速さの測り方: 状態の変更・確定・取り消しの 3 秒の測り方（NFR7.36）。確認の「はい」を押した瞬間から新しい状態の表示（または「確定済み」）が出るまでを 20 回、画面録画から読み取る手順（3 秒の基準、コールドスタート 10 回以上の含め方、`REPORT` の `Init Duration` の読み方）。markDone を代表に測り、markDone の 20 件の用意の仕方（過ぎた日の「未／×」を 20 件以上）も書く。確定・取り消しは行の無い月への初回の確定を 3 回含める
- スモークチェックの記述の更新: 「全 20 件」を「全 23 件」に。`POST /v1/duties/:dutyId/status`・`PUT`・`DELETE /v1/months/:month/confirmation` が 401 になることを書き足す
- 環境変数や設定を手で書き換えてコールドスタートを作らないこと（NFR10.8、NFR6.8）

## 秘密の情報

U7 で新しい秘密の情報はありません。`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` の値はテーブル名です。U7 は LINE を呼ばないのでチャネルアクセストークンも使いません。セッションの署名の鍵は U1 の SSM（`jwt/*`）を `api` が起動時に読む、これまでどおりです。スクリプトにも README にも値を書きません（例は `<作り物の値>`）。gitleaks（CI）が通ること。

## Sources

- `construction/u7-review-confirm/infrastructure-design/infrastructure-specification.md`、`monitoring-design.md`
- `construction/u7-review-confirm/nfr-design/logical-components.md`（CDK のテスト、配備の順番、元に戻す手順、費用、追加なしの引き継ぎ）
- `construction/u7-review-confirm/nfr-design/security-design.md`（NFR4.71、NFR4.72、権限と環境変数が足り済み）
- `construction/u7-review-confirm/nfr-design/performance-design.md`（NFR7.33〜NFR7.38、測り方、コールドスタートの作り方）
- `construction/u7-review-confirm/nfr-design/reliability-design.md`（NFR6.8、`Calendar` の RETAIN、元に戻す手順）
- `construction/u7-review-confirm/functional-design/functional-spec.md`（C1 の 3 入口、失敗の形）
- `construction/u6-recording/infrastructure-design/cicd-pipeline.md`（形の手本、費用の確かめ、スモークチェックの足し方）
- `scripts/smoke-check.sh`（既存。現在 20 件）、`.github/workflows/`（既存）、`infrastructure/test/u6-recording/stacks.test.ts`（テストの形の手本）、`infrastructure/test/u4-chore-types/stacks.test.ts`・`u5-assignment-calendar/stacks.test.ts`（U6 で it.skip 済みの 2 件）、`infrastructure/lib/app-stack.ts`（U7 で変えない）

## Assumptions & Open Questions

- [assumption] U7 は `app-stack.ts` を変えないため、U6 で `it.skip` にした 2 件（U5・U4 の「`line` に Calendar/ChoreTypes の文がない」）は U7 でも触れずスキップのままにします。U7 で追加で壊れる既存の CDK テストはありません
- [assumption] `smoke-check.sh` の 3n〜3p は 3 入口それぞれの 401 確認です（U6 が POST の 1 件だったのと違い、U7 は POST・PUT・DELETE の 3 メソッドで、どれも U7 で初めて使うため 3 件に分けます）。23 件で U7 の確かめとして十分です
- [assumption] `docs/contract-changes-u7.md`、README の文、アプリコード（`calendarService.ts`・`calendarRepository.ts`・画面）はコード生成で作ります。Infrastructure Design の成果物には含みません
- 追加の質問はありません
