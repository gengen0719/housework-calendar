# 反映の流れ（CI/CD Pipeline）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。変えるのは、CDK のテスト、反映したあとの確かめ（`scripts/smoke-check.sh`）、README だけです。

## ワークフロー

| ワークフロー | U5 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U5 のコードも Prettier、ESLint、型の検査（`tsc` の 4 つのプロジェクト。`infrastructure` を含む）、Vitest（行カバレッジ 80% 以上。NFR8.9）、gitleaks、`cdk synth` を通す。`cdk synth` は `Calendar` を含む 2 つの環境を組み立てる |
| `deploy-staging.yml` | 変更なし。`main` への取り込みで、CI のあと `cdk deploy Housework-staging-Data Housework-staging-App` が走り、そのあと `smoke-check.sh` が走る |
| `deploy-production.yml` | 変更なし。作り手が手で動かす。`main` にあるコミットだけ反映でき、GitHub の環境 `production` の承認を待つ |

- 新しい秘密の情報、GitHub の Variables、パラメータストアのパラメータは足しません
- `cdk deploy` は `--require-approval never` なので、権限の追加（`Calendar` の新しい文、`ChoreTypes` への `ConditionCheckItem`）は、配備の途中で止まりません。権限の中身は、次の CDK のテストが「ちょうどこの操作」と固定して守ります

## CDK のスタックテスト（`infrastructure/test/u5-assignment-calendar/stacks.test.ts`）

U4 のテスト（`u4-chore-types/stacks.test.ts`）と同じ作り（`buildApp` でスタックを組み立て、`Template` で確かめる。ダミーの秘密の値は `test/fixtures/fakeSecrets.ts`）で、次を確かめます（NFR8.7、NFR8.9 と同じ考え方で、インフラの設定をテストで固定します）。

| 区分 | 確かめること |
|------|-------------|
| Data スタック | `Calendar` テーブルがある（PK `familyId` の HASH、SK `sk` の RANGE、ともに文字列） |
| Data スタック | `BillingMode = PAY_PER_REQUEST`、`SSESpecification.SSEEnabled = true`、`TimeToLiveSpecification` がない |
| Data スタック | **`GlobalSecondaryIndexes` と `LocalSecondaryIndexes` がない**（索引なしの決め） |
| Data スタック | `tableName` を指定していない（`TableName` がテンプレートにない） |
| Data スタック | 本番の `Calendar` は `DeletionPolicy = Retain`、ステージングは `Delete` |
| Data スタック | `PointInTimeRecoverySpecification` がない（既存と同じ。費用 0 円の条件） |
| Data スタック | 本番・ステージングとも、テーブルの合計が 8 つ（既存 7 + `Calendar`） |
| App スタックの環境変数 | `api` に `CALENDAR_TABLE` がある。`line` にはない |
| `api` の `Calendar` の許可 | `GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`、`ConditionCheckItem` が**ちょうど 6 つ**。`Scan`、`BatchGetItem`、`BatchWriteItem`、`dynamodb:*` がない。資源はテーブルの ARN だけで、`/index/` を含まない。`Calendar` を資源に含む文は 1 つだけ |
| `api` の `ChoreTypes` の許可 | `GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`、**`ConditionCheckItem`** が**ちょうど 6 つ**。`Scan` がない。文は 1 つのまま |
| `api` の `Users` の許可 | U1〜U2 のまま（追加なし）。`GetItem` がある（子供の確かめ） |
| `line` の許可 | `Calendar` を含む文がない。`ChoreTypes` を含む文もない |
| 全体の広がり | `api` のロールに `Resource: "*"` の DynamoDB の文がない（`kms:Decrypt` の条件つきの文は U1 のまま） |
| 変えないもの | `api` の Lambda の `MemorySize = 256`、`reservedConcurrency` の扱い（コンテキスト `reservedConcurrency` を渡すと `api` に `ReservedConcurrentExecutions` がつき、渡さなければつかない。U1 の `infrastructure/test/u1-skeleton-family/stacks.test.ts` の「予約された同時実行数は既定では付けず、コンテキストで付く」で確かめ済み。上限は GitHub Variables の `RESERVED_CONCURRENCY` で決まり、未設定なら予約しない）、`Timeout = 30`、ロググループの保管 30 日、`AllowedMethods` が `ALLOW_ALL` のまま、`AWS::Logs::MetricFilter` が 1 つのまま（U5 でメトリクスフィルターを足さない） |

**このとき、既存のテストの 3 か所が壊れるので、U5 のコード生成で同時に直します**（直さないと CI が落ちます）。

| 既存のテスト | 壊れる理由 | 直し方 |
|-------------|-----------|--------|
| `u1-skeleton-family/stacks.test.ts` の「DynamoDB は 7 つ」と、本番のテーブルが 7 つで `Retain` | テーブルが 8 つになる | 8 に直し、テストの題名の「（U2 で … U4 で ChoreTypes を追加）」に「U5 で Calendar を追加」を足す |
| `u4-chore-types/stacks.test.ts` の `findChoreTypes` と「`ChoreTypes` に tableName を指定していない」 | `Calendar` が `ChoreTypes` と**同じキーの形**（`familyId` + `sk`）なので、キーの形で探すと 2 つ見つかり、`toHaveLength(1)` が落ちる | キーの形ではなく**論理 ID が `ChoreTypes` で始まる**テーブルを探すように直す。U5 のテストも同じ探し方で `Calendar` を見つける（キーの形で探さない） |
| `u4-chore-types/stacks.test.ts` の「`ChoreTypes` の許可がちょうど 5 つ」と「`ConditionCheckItem` がない」 | U5 が `ConditionCheckItem` を足す（U4 の設計が「U5 で足す」と予告したもの） | 6 つ（`ConditionCheckItem` を含む）に直し、`Scan` がないことは残す。コメントに「U5 で足した」と書く |

- 上の 3 か所以外の `infrastructure/test/` の既存テストは、そのまま通ります（U2 の `line` に `ConditionCheckItem` がないこと、U3 の `line` に `ConditionCheckItem` がないこと、U4 の `Families` の許可は、`line` と `Families` の許可を変えないので影響しない）
- **バックエンド側のテストへの影響は、コード生成への引き継ぎ**です（この段階では直しません）: `packages/backend/test/u1-skeleton-family/helpers/world.ts` に `CALENDAR_TABLE` の環境変数を足すこと、`helpers/fakeDynamo.ts` に `Calendar` の表（キー `familyId` + `sk`）と、`Calendar` への `ConditionCheck` の扱いを足すこと、C8 の本物の窓口（`calendarService`）の取り付け場所（仮の窓口の差し替え箇所）を特定すること、handler を直接呼ぶ既存テストが `CALENDAR_TABLE` なしで落ちないか確かめること
- `buildApp` の呼び出し（`AppStackProps` に `calendar` が増える）の型は、`tsc -p infrastructure` が確かめる

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

U2・U4 と同じ形（セッションなしで 401 になる確かめを足し、ログインしての確かめは手で行う）で、U4 の確かめ（3d〜3h）のあとに次の 4 つを足し、先頭コメントの件数も直します。401 は、CloudFront を通って `api` に届き、パスの型に合ったことを示します（型に合わなければ 404）。操作が正しく登録されているか（PUT が保存に届くか、など）は、Vitest の振り分けの筋書きで確かめます。

| 番号 | 確かめ | curl の引数 | 期待 |
|------|--------|------------|------|
| 3i | `GET /v1/months/2000-01/calendar`（セッションなし） | なし | 401 |
| 3j | `GET /v1/months/2000-01/assignment`（セッションなし） | なし | 401 |
| 3k | `PUT /v1/months/2000-01/assignment`（セッションなし） | `-X PUT -H "$json" --data '{}'` | 401 |
| 3l | `PATCH /v1/duties/00000000-0000-4000-8000-000000000000`（セッションなし） | `-X PATCH -H "$json" --data '{}'` | 401 |

- 月は形の合った値 `2000-01` を使います。入口は「振り分け → 秘密のヘッダー → 認証（401）→ 本文の確かめ」の順に動くので、本文が空でも 401 になり、月の形や本文で 422・400 になることはありません
- `dutyId` は、U4 の `chore_type_id` と同じ形の小文字の UUID（`00000000-0000-4000-8000-000000000000`）を使います。小文字の 16 進数だけなので、形の確かめ（404）にも掛かりません。変数は新しく `duty_id` として置き、`chore_type_id` と取り違えないようにします
- スクリプトの先頭コメントを「全 19 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件、3i〜3l が U5 の 4 件」に直します（U1 が 4 件、U2 が 5 件、U3 が 1 件、U4 が 5 件、U5 が 4 件で 19 件）
- 管理者の確かめ（403）や、ログイン後の応答は、セッションが要るので自動の確かめには入れません。ステージングの手での確かめ（下）と、Vitest の筋書きで確かめます
- スモークチェックは書き込みをしません（本番のデータを作らない）

## 反映の順番

1. U5 のプルリクエストを `main` に取り込む（CI が通ってから squash-merge）→ ステージングに自動で反映される。Data スタックで `Calendar` ができ、App スタックで環境変数 `CALENDAR_TABLE` と権限が足される
2. ワークフローの `smoke-check.sh` が通ることを確かめる（19 件）
3. 作り手がステージングで手で確かめる（下の表）
4. `deploy-production.yml` を手で動かす（承認は作り手）。本番に同じ変更が入り、本番の `Calendar` が `RETAIN` で作られる
5. 本番で、`smoke-check.sh` の結果（ワークフロー内）と、`monitoring-design.md` の問い合わせ 4（部分的な失敗が 0 件）を確かめる
6. 本番で最初の割り当ての保存が済んだら、費用の確かめ（下）の予定を作り手が決める

### ステージングでの手での確かめ

| # | 操作 | 期待 |
|---|------|------|
| 1 | 管理者でアプリを開く（割り当てのない今月） | カレンダーに「この月の割り当てはまだありません」と「割り当てを入力する」が出る |
| 2 | 種類ごとに子供と曜日を入れて保存（今月） | 今日から月末まで担当ができる。過ぎた日は作られない |
| 3 | 来月に切り替えて保存 | 1 日から月末まで担当ができる |
| 4 | 同じ曜日に同じ種類の担当を 2 人入れて保存 | 「担当が 2 人います」の一覧が出て、保存されない |
| 5 | 保存し直す（子供を変える） | 明日以降の「未」だけが変わる。今日と過ぎた日は変わらない |
| 6 | 日の詳細で「担当を変える」から子供を変え、そのあと割り当てを保存し直す | 上書きの確かめの一覧が出て、「この内容で保存する」で保存できる |
| 7 | 子供のアカウントで開く | カレンダーは見られる。「割り当てを入力する」と「担当を変える」は出ない |
| 8 | 管理者で、割り当てに使っている種類を消そうとする（U4 の「消す」） | 409 の案内が出て消えない（`isChoreTypeAssigned` が本物になったことの確認） |
| 9 | 割り当てに使っていない種類を消す | 消える |
| 10 | `api` のログを見る（`monitoring-design.md` の問い合わせ 1・2） | `ASSIGNMENT_SAVED` に `dutyCount` などが出る。`REQUEST_END` に `coldStart` が出る。名前は出ない |
| 11 | 速さを測る（NFR7.20〜NFR7.23。コールドスタートを含めて 20 回ずつ。`nfr-design/performance-design.md` の測り方） | 95% が 3 秒以内。結果は `build-and-test` の記録に残す |
| 12 | CloudWatch で `Calendar` の `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits` を見る | 確かめの量に見合う。見込みから大きく外れていない |

- 「コールドスタートを含めて」の新しい実行環境は、**コードが変わる反映**（ステージングへの配備）をするか、**一定時間（数十分以上）要求を送らずに待つ**ことで作ります。環境変数を書き換える方法は使いません（`update-function-configuration --environment` は変数の一覧を丸ごと置き換えるので、`CALENDAR_TABLE` などの既存の変数が消えて壊れるため）。どうしても環境変数を触るときは、`get-function-configuration` で取れる**すべての変数に足して**渡し、測り終わったら元の一覧に戻す手順まで行います（「次の反映で戻る」とは考えない）。本番ではやりません
- 本番では、確認のためにテストデータを入れません。本番の最初の使い方は、家族が実際に割り当てを入れる操作そのものです（本番のデータは手で書き換えない決まり）

## 前の版に戻す

| 場面 | 戻し方 |
|------|--------|
| アプリのコードの不具合（`Calendar` に触れない部分） | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する |
| 本番の `Calendar` に項目が**ないと確かめられた**（下の「項目がないことの確かめ方」で 0 件） | コードだけなら `git revert` できる。**テーブルごと戻すなら 2 回に分ける**（この表の最後の行「テーブルまで外すとき」）ので、単純な `git revert` 1 回では反映できない。本番の `Calendar` は `RETAIN` なので、スタックから外れてもテーブルは残る。もう一度 U5 を反映すると新しい空のテーブルができ、残ったテーブルは使われない。残ったテーブルを消すのは、消す直前にも同じ方法で 0 件を確かめられたときだけで、作り手が決める（急がなくてよい。保存量は 0 で費用もかからない） |
| 本番に `Calendar` の項目が**ある**、または**ないと確かめられない** | **戻さない。前に進んで直す**（修正のコミットを足す）。理由は下。中身のある表は消さない（本番のデータは手で書き換えない決まり） |
| ステージング | `DESTROY` なので、テーブルごと消えて作り直せる。データは確認用なので失ってよい |
| テーブルまで外すとき（U5 を反映する前の本番、0 件と確かめた本番、またはステージング） | U3・U4 と同じく **2 回に分ける**。1 回目: App が `Calendar` を使わない形（環境変数 `CALENDAR_TABLE`・権限・`AppStackProps` の `calendar`・`app.ts` の受け渡しを外す）だけを戻して反映する。2 回目: Data から `Calendar` を外して反映する。`git revert` を 1 回で `main` に入れると、1 回の反映で App と Data を同時に変えることになり、App が Data の出力を参照しているので CloudFormation が断る。そのため、1 回目の変更を取り込んで反映が済んでから、2 回目の変更を取り込む |

**項目がないことの確かめ方**（ログに頼らない。読み取りだけで行う）

- 確かめは、作り手が**手元の読み取り専用の権限**で行う。書き込みはしない（項目を作る・消す・直す操作は一切しない）。`api` のロールや、書ける権限は使わない
- 方法 1（主）: 本番の `Calendar` を、**遅れのない読み取り**（強い整合性）で件数だけ数える。例: `aws dynamodb scan --table-name <本番の Calendar の名前> --select COUNT --consistent-read`（件数 0 を確かめる読み取り。ページが続くときは最後まで足す）。テーブルの名前は `aws dynamodb list-tables` で、`Calendar` を含む本番の名前を探す。`describe-table` の `ItemCount` は更新が約 6 時間ごとで遅れるので、**判断に使わない**
- 方法 2（補助）: CloudWatch の `ConsumedWriteCapacityUnits`（`Calendar`、本番）の**全期間の合計が 0**。テーブルを作ってから今までの期間を取れる範囲で見る（保管期間より前は分からない）
- ログで見る場合は `ASSIGNMENT_SAVED` に加えて `ASSIGNMENT_PARTIAL_FAILURE`（保存の途中で失敗しても一部の担当は書かれている）も 0 件であること。ただしログの保管は 30 日なので、**30 日より前のことは分からない**。ログだけでは「ない」と判断しない
- どれかで 1 件以上が見つかった、または方法 1 を実行できなかったときは、「ない」とは扱わず「戻さず前に進んで直す」に倒す。**テーブルを消す前**にも、同じ方法 1 で 0 件を確かめ直す（確かめてから消すまでに家族が保存していないことの確認）

**項目があるときに戻さない理由**

- `Calendar` に家族の担当・割り当てが入っていると、アプリのコードだけを戻しても、U5 以前のコード（`isChoreTypeAssigned` が仮の窓口で常に使われていないと答える）に戻るため、**使っている種類を消せてしまう**。割り当てが指す種類が消えると、カレンダーの表示が種類の名前を引けなくなる
- テーブルを外して作り直すと、`RETAIN` のテーブルは残るが、新しい空のテーブルが使われる。それまでの担当・割り当てが見えなくなり、U6 以降の記録も同じ状態になる
- U6 以降は `Calendar` に頼る。U5 を戻すと U6 以降の組み立ても壊れる
- 割り当ての保存は、何度保存しても今の状態に対して同じ結果に収まる作り（BR6.18）なので、不具合を直したあとに管理者が保存し直せば、正しい状態に収まる

**データが壊れたと思ったとき**: 手でテーブルの項目を編集しません。まず管理者が割り当てを保存し直します。収まらないときは、直す手順をコードとして用意し、プルリクエストと CI、ステージングでの確認を通してから本番に反映します（`infrastructure-specification.md` の「本番のデータの決まりとの関係」）。

## 費用の確かめ（最初の請求）

オンデマンドの読み書きは無料枠の対象外なので、U5 は毎月わずかな金額（見込み約 0.002 ドル）がかかります。「請求額 0 円」が成り立つのは、これが端数の丸めで 0.00 ドルになる前提のときです。この前提を、次の手順で確かめます。

| 段階 | いつ | 何をするか | 見るもの |
|------|------|-----------|---------|
| 0. 基準を控える | U5 を本番に反映する前 | 直近の月次の請求の DynamoDB の行（ap-northeast-1）の金額を控える | 比べる元（U1〜U4 のテーブルも同じオンデマンドなので、DynamoDB の行はすでにある見込み） |
| 1. 量で確かめる | 本番に反映して 1〜2 週間後と、反映した月の終わり | CloudWatch で `Calendar`（本番）の `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits` の期間の合計を見る | 書き込み約 1100、読み取り約 7000 ユニット / 月の見込みと比べる。ユニット数 × 単価で金額を出す |
| 2. 請求で確かめる | U5 を反映した最初の月が終わり、請求が確定したあと（翌月の初め） | Billing の請求書（Bills）で DynamoDB の行（ap-northeast-1）を開き、Cost Explorer で使用タイプ別（Usage type）・日別に見て、段階 0 の控えと比べる | `Calendar` だけの行は出ない（表ごとの内訳はない）ので、増分で見る。DynamoDB 以外に新しい行がないことも見る |

| 結果 | 判断 |
|------|------|
| 請求の DynamoDB の行が 0.00 ドル、または段階 0 から増えていない | 前提が成り立った。「費用 0 円」はそのまま。結果を README の「費用の確認」に記録する |
| 増分が 0.01 ドル程度で、段階 1 の金額が 0.007 ドル（約 1 円）以下 | 見込みどおりで、丸めの結果として載っただけ。月 1 円の見込みの範囲。README の言い方を「ほぼ 0 円（月 1 円未満）」に直すかどうかは、条件を決めた人（作り手）が決める |
| 段階 1 の量が見込みの 10 倍以上、または増分が 0.10 ドル（約 15 円）を超える | 見込みが外れた。原因を調べる（問い合わせ 1・2 でカレンダーを開く回数と保存の回数、`dutyCount` を確認）。直す案: 読み直しの回数を減らす、不要な再読み込みを止める。作り手に知らせ、直すかどうかを決める |
| DynamoDB 以外に新しい行がある | 想定外。原因（暗号化の鍵など）を調べて作り手に知らせる |

- U1 の Budgets（月 1 ドル）は、この確かめとは別の最後の見張りとして残ります
- ステージングの `Calendar` も同じ単価ですが、確認のときしか使わないので、本番より小さい見込みです
- 確かめた結果は、`build-and-test` の記録と README に残します

## README に足すこと

- カレンダーと割り当ての画面の使い方（今月と来月だけ保存できる、保存し直しで変わるもの・変わらないもの、日ごとの「担当を変える」、上書きの確かめ）
- ステージングでの手での確かめの手順（上の表）
- スモークチェックの記述の書き換え: README の U4 の節「`scripts/smoke-check.sh` は、セッションなしで `GET`・`POST /v1/chore-types` と、…が 401 になることも確かめます（全 15 件）。」の「全 15 件」を「全 19 件」に直す。U5 の `GET`・`PUT /v1/months/{month}/assignment`、`GET /v1/months/{month}/calendar`、`PATCH /v1/duties/{dutyId}` が 401 になることも同じ形で書き足す
- U4 の確かめ 6 番の注の書き換え: 「（U5 ができるまでは、割り当てがないので常に消せます）」を「（U5 以降は、割り当てに使っている種類は消せません）」に直す
- コールドスタートの測り方（コードが変わる反映か待つ方法。環境変数は触らない）を、測る人向けに短く書く
- **U5 を反映したあとは `Calendar` と U5 のアプリのコードを戻さず、前に進んで直すこと**（U4 の README の言葉と同じ形で）
- 本番のデータは手で書き換えないこと（直す必要があるときは保存し直し、それで収まらなければコードと手順で）
- 費用の確認の手順と結果（上の「費用の確かめ（最初の請求）」）

## 秘密の情報

U5 で新しい秘密の情報はありません。`Calendar` の接続は IAM のロールで、キーやトークンは使いません。パラメータストアのパラメータも GitHub の Variables も足しません。この文書とテストにも、秘密の値の例は書きません（書くときは `<作り物の値>` とする）。

## Sources

- `construction/u5-assignment-calendar/infrastructure-design/infrastructure-specification.md`、`monitoring-design.md`
- `construction/u5-assignment-calendar/nfr-design/logical-components.md`（費用・最初の請求・配備の順番）、`reliability-design.md`（BR6.18、トランザクション）、`performance-design.md`（測り方）
- `construction/u4-chore-types/infrastructure-design/cicd-pipeline.md`（形の手本、U5 を反映したあとは戻さない）
- `scripts/smoke-check.sh`、`.github/workflows/`、`infrastructure/test/`（u1・u4 の既存テスト）

## Assumptions & Open Questions

- [assumption] `ci.yml` の `npx vitest run --coverage` は `infrastructure/test/` 以下のテストも実行します（U1〜U4 のテストと同じ場所・同じ作り）
- [assumption] 請求の確定は月が終わって数日後です。段階 2 は、反映した月の翌月の初めに行います。段階 1 で先に見込みが外れていないかを確かめられるので、請求を待つ間の見落としはありません
- [assumption] 段階 0 の基準は、Billing の画面で作り手が控えます（この設計では請求の画面を見ていません）
- [assumption] 「項目がないことの確かめ方」の方法 1（読み取りだけの件数の数え上げ）は、作り手が手元に本番の `Calendar` を読める資格（読み取り専用）を持っていることが前提です。資格がないときは方法 2（`ConsumedWriteCapacityUnits` の全期間の合計）で確かめ、それもできなければ「戻さず前に進んで直す」に倒します
- 追加の質問はありません
