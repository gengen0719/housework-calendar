# 反映の流れ（CI/CD Pipeline）— U9 お小遣いの額

U9（`u9-allowance`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。CDK のインフラ定義（`app-stack.ts`・`data-stack.ts`）も変えません。変えるのは、CDK のテスト（新規 `infrastructure/test/u9-allowance/stacks.test.ts`）、**スモークチェック（`scripts/smoke-check.sh`）に 1 件**、README、`docs/contract-changes-u9.md`、アプリコード（`packages/*`）です。

## ワークフロー

| ワークフロー | U9 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U9 のコードも Prettier、ESLint、型の検査（`tsc`）、Vitest（行カバレッジ 80% 以上。NFR8.17）、gitleaks、画面のビルド、`cdk synth` を通す。BDD の筋書き（`*.feature`）も Vitest の実行に含まれる |
| `deploy-staging.yml` | 変更なし。`main` への取り込みで、CI のあと `cdk deploy Housework-staging-Data Housework-staging-App`（`Data` は差分なし、`App` はコードと画面の反映のみ）が走り、そのあと `smoke-check.sh` が走る（`./scripts/smoke-check.sh "https://${domain}" "${api_url}"`。実コードで確かめた） |
| `deploy-production.yml` | 変更なし。作り手が手で動かす。反映後に同じ `smoke-check.sh` が走る（117 行目付近で確かめた） |

- 新しい秘密の情報、GitHub の Variables、パラメータストアのパラメータは足しません
- `cdk deploy` の差分は Lambda のバンドルと画面の塊だけです。権限の追加が無いため、配備の途中で止まる要素もありません

## CDK のスタックテスト（`infrastructure/test/u9-allowance/stacks.test.ts`）

U8 のテスト（`u8-swap/stacks.test.ts`）と同じ作りで、**U9 の前後で構成が変わらないこと**を固定します（NFR1.36、NFR4.89、NFR6.10）。

| 区分 | 確かめること |
|------|-------------|
| `api` の `Users` | 表: `GetItem`・`PutItem`・`UpdateItem` のまま。索引 `lineUserId-index`・`familyId-index` は `Query` のまま |
| `api` の `Families` | `GetItem`・`PutItem`・`UpdateItem`・`ConditionCheckItem` のまま |
| `api` の `ChoreTypes`・`Calendar` | それぞれ 6 操作のまま（U9 で増えない） |
| `api` に足さないものがない | `Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*` が無い。`Resource: "*"` の DynamoDB の文が無い（`kms:Decrypt` の条件つき文は U1 のまま） |
| `api` の環境変数 | U8 のまま（`USERS_TABLE`・`FAMILIES_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE` を含む）。新しい環境変数が無い |
| IAM の文の数 | U8 の後と同じ（`api` 11、`line` 9）。害のない文が 1 つ増える変更や、同じ操作を別の表に足す変更もここで拾う（NFR1.36、NFR4.89。U8 の `stacks.test.ts` と同じ固定） |
| `line` | 権限と環境変数が U8 のまま |
| SSM | 読み取りの許可が `api`: `jwt/*`・`line/*`・`cloudfront/*`、`line`: `line/*`・`cloudfront/*` のまま |
| CloudFront | `/v1/*` の `CachePolicy` が CACHING_DISABLED のまま。振り分けの数が変わらない（`/v1/*`・`/line/webhook`）。`AllowedMethods` が変わらない |
| 環境の分離 | ステージングの `api` が本番のテーブルの ARN を含まない |
| Lambda の大きさ | `api`・`line` とも MemorySize 256・Timeout 30・ARM64 のまま。`reservedConcurrency` をコンテキストで与えないとき予約が付かない |
| ロググループ | 保管 30 日のまま |
| 構成の数 | テーブル 8、Lambda、ロググループ、`AWS::Logs::MetricFilter`（1 つ）、アラーム（0 件）が U8 の後と同じ（NFR1.36） |
| 本番の `Calendar` | `DeletionPolicy = Retain` のまま（NFR6.10） |

```ts
// U8 の stacks.test.ts と同じヘルパーを使う（設計の説明。≤15 行）
it('api の Calendar は U5 のまま（6 操作）。U9 で増えない', () => {
  expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual(API_CALENDAR_ACTIONS_AFTER_U5);
});
it('CloudFront の /v1/* は CACHING_DISABLED のまま', () => {
  expect(cachePolicyIdOf('/v1/*')).toBe(CACHING_DISABLED_ID);
});
```

### 既存テストへの影響

U9 は `app-stack.ts`・`data-stack.ts` を変えないので、既存の CDK テストは U9 で**1 件も壊れません**。`u4-chore-types`・`u5-assignment-calendar` の `it.skip` 各 1 件は触りません。

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

**1 件足します（3q。全 23 件 → 全 24 件）。** U7 が 3n〜3p を足したのと同じ形（セッションなしで 401、書き込みなし）です。

```bash
# 3q. U9 のお小遣いの読み取りがセッションなしで 401（書き込みはしない）。
# month は current（本物の月ではない。パスの current が CloudFront を通って api に届くことも分かる）
check "GET /v1/months/:month/allowances (セッションなし)" 401 "${base}/v1/months/current/allowances"
```

| 判断 | 理由 |
|------|------|
| 期待は 401 | 確かめの順番は `verifyOrigin → requireAuth → requireMembership → 月の形`（NFR4.86）で、認証が月の形より先。月が `current` でも `2000-01` でも、セッションなしなら必ず 401 になる。既存の 3i（`GET /v1/months/2000-01/calendar`）と同じ流れ |
| 月は `current` を使う | U9 だけが持つ `current` の形が CloudFront を通ることまで分かる（`2000-01` は 3i と重なる）。404 が返れば、振り分けの表にない（=入口が反映されていない）ことが分かる |
| 1 件だけ | 入口は 1 つ（`GET` のみ）。`PUT`・`DELETE` などはない。書き込みの入口がないことは、U9 の単体テスト（振り分け表に他のメソッドがない）で確かめる |
| 署名もシークレットも要らない | 401 を確かめるだけなので、スクリプトに秘密を持たせない（NFR5.16、NFR5.17） |

- **スクリプトの見出しの更新**: 1 行目付近の「全 23 件…3n〜3p が U7 の 3 件」に「3q が U9 の 1 件」を足し、全 24 件にする
- **README の更新（直し方は 1 つ）**: 各単位の節の件数は「その単位の時点の件数」としてそのまま残す（385・428・499・542・564 行目の「全 23 件」は直さない）。**14 行目（「反映後の確かめ（4 つ）」。U1 のころから古い）と U9 の節で、全 24 件を示す**（U9 の節には「U9 のあとは全 24 件」と書く）。`infrastructure-specification.md` の食い違い 3 も同じ方針
- **変更はコード生成で行う**（この設計段階では `scripts/smoke-check.sh` を変えない）。件数の食い違い（スクリプトの見出しと README が 23 件のまま）は、コード生成の完了条件に入れる
- `deploy-staging.yml`・`deploy-production.yml` はスクリプトを呼ぶだけなので、件数が変わっても変更は要らない

## 反映の順番

1. U9 のプルリクエストを `main` に取り込む（CI が通ってから squash-merge）→ ステージングに自動で反映される
2. `smoke-check.sh` が通ることを確かめる（24 件。3q を含む）
3. 作り手がステージングで手で確かめる（下の表）
4. `deploy-production.yml` を手で動かす（本番に同じコードが入る）
5. 本番で `smoke-check.sh` の結果と、`monitoring-design.md` の問い合わせ 3・5（異常・失敗が 0 件）を確かめる

### ステージングでの手での確かめ

ステージング用の公式アカウントと、作り手だけの家族を使います。家族に、管理者と子供の役割のテスト用の利用者を 2 人以上入れます。測定用に家族をもう 1 つ用意します（家族 2 つ。NFR7.57）。データはアプリの画面と LINE の操作（割り当ての保存、記録、確定）で作り、直接書き換えて用意しません（NFR6.10）。本番のお知らせ先のグループにステージングの公式アカウントを入れません。

| # | 確かめること | 操作 | 期待 |
|---|-------------|------|------|
| 1 | S5 の表示（子供ごとの行） | カレンダー（S1）の「お小遣い」から S5 を開く | 見出し（h1）「{年}年{月}月のお小遣い」、子供ごとの見出し（h2）、内訳（種類の名前・回数・単価・小計）、合計が出る。合計は内訳の足し算と一致する。金額は桁区切り、マイナスは半角のハイフン |
| 2 | 確定の表示 | 月が確定済みの月と、未確定の月の両方を開く | 確定していない月は「確定していません」の文字が出る。確定は色だけで示さず文字で出る |
| 3 | 0 円・空の月 | 記録のない今月、担当のない月（範囲内）を開く | 「今月の記録はまだありません（0 円）」「この月の記録はまだありません（0 円）」。今いる子供は必ず行がある。「お小遣いを表示する子供がまだいません」は子供が 0 人の家族でだけ |
| 4 | 抜けた子供 | 家族を抜けた子供の担当が残る月を開く | 抜けた子供の行が決まった並びで出る。名前が分からないときは「名前が分からない子供」 |
| 5 | 月の移動 | 前の月・次の月を続けて押す。範囲の端（家族の作成月・今月の翌月）まで進める | 押しが静まって（250 ms）から 1 回だけ読み込む。端のボタンは無効（`disabled`）。読み込み中も押せる。飛んでいる要求の答えで古い月が表示されない。自動の切り替え・先読みがない（通信の記録で確かめる） |
| 6 | 役割ごとの見え方（管理者） | 管理者で S5 を開く | 全員の行が出る。管理者の情報（管理者自身の行など）は出ない |
| 7 | 役割ごとの見え方（子供） | 子供 A で S5 を開く | 兄弟の行も見える（BR10.1）。自分の行に「（あなた）」が付く |
| 8 | 家族の外・未ログイン | ほかの家族の利用者、ログインしていない状態で開く | ほかの家族の額は見えない。未ログインは 401（ログイン画面へ）。ブロック中の利用者は 403 |
| 9 | 範囲外の月 | 範囲より前の月を直接 URL で指定する | 200 で空の `allowances`（エラーにならない）。形の外れた月は 422 の文言 |
| 10 | 直接開く | S5 を直接開く | 通信は `month=current` の 1 回だけ（先に calendar を呼ばない） |
| 11 | 端末の時計 | 端末の時計を別の月にして S5 を開く | 端末の時計に左右されず、答えの `today` の月で文言が決まる |
| 12 | ログ | `monitoring-design.md` の問い合わせ 1〜6 を見る。加えて生の行の問い合わせ 7（`fields @message \| filter event="ALLOWANCE_COMPUTED" \| sort @timestamp desc \| limit 5`）で、行全体を目で見る | `ALLOWANCE_COMPUTED` が 1 要求 1 件。問い合わせ 7 の生の行に、表示名・種類の名前・金額（単価・小計・合計・加算・減額）がない。`anomalyCount` が 0 |
| 13 | キャッシュ | ブラウザの開発者ツールで応答ヘッダーを見る（成功の 200） | `Cache-Control: no-store` が付いている。`x-cache` が `Hit from cloudfront` にならない（`Miss`・`Error` は想定内。毎回オリジンへ届く） |
| 14 | **3 秒の測定（20 回）** | 下のとおり。NFR7.57 の 1.〜8. をそのまま満たす（端末・入口・冷たい起動・録画・月の移動・家族の組み立てを下の表に落とした） | 20 回中 19 回以上が 3 秒以内（NFR7.50〜NFR7.52） |
| 15 | S1 の測り直し | U9 の反映後に S1（NFR7.20）を 1 回測り直す | 既存の目標のまま |
| 16 | 色・大きさ・読み上げ | 画面を目で見る。スクリーンリーダーで見出しとリストを読ませる | コントラスト・44 ピクセルの押す場所・`role="status"`／`role="alert"` が設計どおり（NFR9.10〜NFR9.12。結果は `build-and-test` の記録に残す） |

#### 3 秒の測定（20 回。NFR7.50〜NFR7.57）

| 項目 | 内容 |
|------|------|
| 環境・データ | ステージング。家族 2 つ（通常の月と、担当 300 件規模の大きい月）。データは画面と LINE の操作で作る |
| 家族の組み立て（NFR7.57 の 1.、NFR7.50・NFR7.51） | 通常の月: 管理者 1・子供 3・種類 4・担当約 124 件（「済」約 60 件以上）・単価が途中で変わった種類 1 つ以上。大きい月: 種類 10 個×30 日で担当 300 件、「済」200 件以上（U8 の NFR7.46 の家族を使い回してよい） |
| 端末（NFR7.57 の 3.） | 実際のスマートフォンで、LIFF（LINE アプリ内）と外部ブラウザの直接の入口の**両方**で測る。端末の種類・入口・時刻を表に残す |
| 測る入口 | (a) S1 から S5 を開く 20 回、(b) S5 を直接開く 20 回、(c) 月の移動 20 回、(d) 大きい月の表示 20 回。各入口を LIFF と外部ブラウザの両方で行う |
| 月の移動（NFR7.52） | (c) は [<] 10 回・[>] 10 回の計 20 回。うち 5 回は「読み込み直す」も押し、その表示も測る（SLO の表の「月の移動」の行にも同じ条件を書いた） |
| 冷たい起動（NFR7.57 の 4.） | 各 20 回のうち 10 回以上は前の操作から **30 分以上あけて**測る。`REPORT` の行の `Init Duration` の有無で数え、冷たい起動の回が 10 回以上あることを確かめる（足りなければ回を足す）。環境変数や設定を手で書き換えて作らない（NFR6.10） |
| 測り方（NFR7.57 の 5.・6.） | 画面録画（**1 秒 30 コマ以上**）。押す・開く瞬間から、見出しと子供ごとの行（または失敗の表示）が見えるまでのコマの差を読む。失敗した回も除外しない |
| 補助の記録 | `REQUEST_END.durationMs`（問い合わせ 1）、`ALLOWANCE_COMPUTED.durationMs`・`dutyCount`（問い合わせ 2）、`Init Duration`。DynamoDB の呼び出しの数は `monitoring-design.md` の「呼び出しの回数の取り方」（`AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`。`TableName`×`Operation`、前後の差または 1 回ずつ）で取り、ブラウザの通信の記録の数とあわせて表に入れる |
| 合格 | 画面録画の結果だけで判断する（20 回中 19 回以上が 3 秒以内）。サーバー側の補助の目標は合否に使わない |
| 届かないとき | NFR7.57 の 7. の順番: (1) 読み取りの並行の確認、(2) 配信物の大きさ、(3) 起動時の読み込みの整理、(4) Lambda のメモリを 256 MB から 512 MB（無料枠に収まるかを先に確かめる）。Provisioned Concurrency などは使わない |
| 結果の置き場所 | `build-and-test` の成果物に表で残す（日時、環境、端末の種類、入口（LIFF／外部ブラウザ）、30 分以上あけた回かどうか、20 回それぞれの時間と冷たい起動かどうか、サーバー側の時間、DynamoDB の呼び出しの数、通信の数、合否） |

- 本番ではテストデータを入れません。本番では `smoke-check.sh` と、問い合わせ 3・5 の確認だけを行います
- 自動のテストに 3 秒は入れません（ネットワークと端末で不安定になるため。NFR8.17）

## 前の版に戻す

| 場面 | 戻し方 |
|------|--------|
| U9 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する（NFR10.12） |
| 権限・環境変数を戻す必要があるか | ない。U9 は `app-stack.ts` を変えないので、消える権限・環境変数はない |
| データ | 移行も削除も要らない。U9 は何も書かない |
| スモークチェック | 戻すと 3q が 404 で落ちる。`git revert` に `scripts/smoke-check.sh` の 3q の取り消しを含める（コードと一緒に戻る） |

- 戻すと S5 とお小遣いの API が消えます。S1 などほかの画面は変わりません
- U10 が `getAllowances` を使い始めたあとは、U10 を先に戻します

## 費用の確かめ

U9 の増分（読み取りの従量で月に 1 円に満たない見込み）は、U5 の最初の請求の確認（`construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md` の「費用の確かめ（最初の請求）」）に含めて見ます。U9 はメッセージを送らず、新しい資源も足しません。従量なのは DynamoDB の読み取りと、手で使う Logs Insights の検索（検索したデータ量に応じる）だけで、どちらも月 1 ドルの Budgets の範囲内に収まる見込みです。

## README に足すこと

- 3 秒の測り方（NFR7.57）: 入口ごとに 20 回（冷たい起動 10 回以上、`Init Duration` の読み方、画面録画から読み取る手順、除外しない、家族 2 つの用意の仕方）
- Logs Insights の検索の例（`monitoring-design.md` の問い合わせ 1〜6。filter を stats より前に置く）
- U9 の反映後の S1 の測り直し（NFR7.20）の手順
- 環境変数や設定を手で書き換えてコールドスタートを作らないこと（NFR6.10）
- スモークチェックの記述を全 24 件に直す（14 行目の「4 つ」と U9 の節。各単位の節の「全 23 件」は、その単位の時点の件数として残す）
- DynamoDB の呼び出しの回数の取り方（`AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`。前後の差または 1 回ずつ）と、問い合わせ 7（生の行）

## 秘密の情報

U9 で新しい秘密の情報はありません。LINE のトークンは読みも使いもしません（NFR5.16）。スクリプトにも README にもテストにも値を書きません（例は `<作り物の値>`。テストの前提データに本物の ID・表示名・額を入れない。NFR5.17）。gitleaks（CI）が通ること。

## Sources

- `construction/u9-allowance/infrastructure-design/infrastructure-specification.md`、`monitoring-design.md`
- `construction/u9-allowance/nfr-design/logical-components.md`（CDK のテスト、配備の順番、元に戻す手順、費用）
- `construction/u9-allowance/nfr-design/security-design.md`（NFR4.86、NFR4.89、NFR5.16、NFR5.17）
- `construction/u9-allowance/nfr-design/performance-design.md`（NFR7.50〜NFR7.57、測り方）
- `construction/u9-allowance/nfr-design/reliability-design.md`（NFR6.10、NFR10.11・NFR10.12、月の移動）
- `construction/u8-swap/infrastructure-design/cicd-pipeline.md`、`construction/u7-review-confirm/infrastructure-design/cicd-pipeline.md`（形の手本。U7 が 3n〜3p を足した形）
- `scripts/smoke-check.sh`（既存。全 23 件、3i〜3p の形）、`.github/workflows/ci.yml`・`deploy-staging.yml`・`deploy-production.yml`、`README.md`、`infrastructure/lib/app-stack.ts`・`data-stack.ts`（実コードを読んで確かめた）

## Assumptions & Open Questions

- [assumption] 3q の期待を 401 とします。認証が月の形の確かめより先に走る設計（NFR4.86）に基づきます。U9 のコードはまだなく、実際の順番はコード生成と単体テストで確かめます。もし `current` の形の確かめが認証より先に走る実装になった場合は 422 が返るため、3q の期待を合わせるのではなく、順番を設計どおりに直します
- [assumption] 食い違いの報告: `scripts/smoke-check.sh` は全 23 件（見出しも実際の `check`／HTML の確かめの数も 23 件で一致）です。README は 14 行目が「4 つ」のまま古く、385・428・499・542・564 行目が「全 23 件」です。各節は単位の時点の件数として残し、14 行目と U9 の節を全 24 件にします（コード生成で実施）
- [assumption] `infrastructure/test/u9-allowance/stacks.test.ts` のヘルパー名（`actionsOnTable`・`cachePolicyIdOf` など）は U8 のテストの書き方に合わせてコード生成で決めます。CloudFront の `/v1/*` の確かめが U8 までのテストにない場合は、このテストで新しく足します
- [assumption] 手での確かめの 13 は CloudFront の `x-cache` ヘッダーで確かめます。`CACHING_DISABLED` では `Miss from cloudfront` が普通に出るため、「`Hit` にならない」ことを期待にします
- [assumption] 手での確かめの 8 のブロック中の利用者の 403 は、既存の認証の動きに合わせた期待です（U9 で新しく作るものではない）
- 追加の質問はありません
