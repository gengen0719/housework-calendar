# インフラの仕様（Infrastructure Specification）— U8 代わりにやる

U8（`u8-swap`）で、U1〜U7 の構成に足す・変える AWS の資源を決めます。結論は **インフラの変更なし**です。新しいテーブル・索引・Lambda・IAM の文・環境変数・SSM パラメータ・指標・アラーム・費用は足しません（NFR1.33、NFR4.82）。U8 は `line` の Lambda に「家事交代」と `swap.*` の入口を、`line` と `api` の起動の枠にフックの登録を足すアプリコードだけです。決めることはすべて NFR 設計（`nfr-design/logical-components.md` の「Infrastructure Design へ渡すこと」）で決まっていたため、この段階で人に聞くことはありませんでした。

## 実コードで確かめた結果（`infrastructure/lib/app-stack.ts`・`data-stack.ts` を読んだ）

U8 の読み書きを、実際の IAM の文と環境変数に当てて確かめました。**食い違いは見つかりませんでした**。

### `line` の Lambda

| 資源 | 実コードの許可（読んだ結果） | U8 で使う操作 | 足りるか |
|------|---------------------------|--------------|---------|
| `Calendar` | `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`（U6 の文。資源は表の ARN のみ。索引なし） | 申し出の `GetItem`（強い整合性）、担当の探索の `GetItem`、一覧の月の `Query`、申し出の条件つき `UpdateItem`（申し出る・取り下げ・掃除の `closeOffer`）、引き受けの 3 項目の取引（担当の `Update`・申し出の `Update`・月の状態の `ConditionCheck`） | 足りる |
| `ChoreTypes` | `GetItem`・`Query`・`ConditionCheckItem`（U6 の文。読むだけ） | 種類の名前の `Query`・`GetItem`（返事と一覧の表示）。引き受けの取引に `ChoreTypes` は含めない | 足りる（`ConditionCheckItem` は U8 では使わないが、U6 のまま残す） |
| `Users` | `GetItem`・`PutItem`・`UpdateItem`、`lineUserId-index` に `Query` | `runGroupOperation` が送った人を `lineUserId-index` で 1 回読む。表示名と役割はその結果から取る（追加の読み取りなし） | 足りる |
| `Families` | `GetItem`・`UpdateItem` | 家族の読み取り（既存の入口） | 足りる |
| `NotificationGroups` | `GetItem`・`PutItem`・`DeleteItem` | `findFamilyByGroup` の `GetItem` | 足りる |
| `ProcessedLineEvents` | `GetItem`・`PutItem`・`UpdateItem`・`DeleteItem` | 二度処理しない記録（`begin`・`markDone`・`release`） | 足りる |
| SSM | `line/*`・`cloudfront/*` の `ssm:GetParameter(s)`、条件つき `kms:Decrypt` | チャネルのシークレット・トークンを起動時に読む（reply 用） | 足りる。`jwt/*` は `line` に無く、U8 も使わない |
| 環境変数 | `SSM_PREFIX`・`USERS_TABLE`・`FAMILIES_TABLE`・`PROCESSED_LINE_EVENTS_TABLE`・`NOTIFICATION_GROUPS_TABLE`・`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`・`ENV`・`ENTRY` | U8 は新しい環境変数を使わない | 足りる |

- 引き受けの `TransactWriteItems` 自体の許可は無く、項目ごとの操作（`UpdateItem`・`ConditionCheckItem`）で確かめられます。U6 の記録（担当の `Update` ＋ 月の `ConditionCheck`）で通った形と同じです
- 申し出の項目（`SWAP#<dutyId>`）の作成は `UpdateItem`（存在しなければ作られる）で行い、`line` に `PutItem` を足しません（ADR-U8-02、NFR4.81）

### `api` の Lambda

| 資源 | 実コードの許可（読んだ結果） | U8 で使う操作 | 足りるか |
|------|---------------------------|--------------|---------|
| `Calendar` | `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（U5 の文。6 操作） | フックの `closeOffer`（`status = open` の条件つき `UpdateItem`）。月の確定・割り当て保存・状態変更・担当の子供の変更から呼ばれる | 足りる。`PutItem`・`DeleteItem` は U8 で新たには使わない |
| `ChoreTypes` | 6 操作（U4 の文） | U8 の新しい使い方なし | 足りる |
| 環境変数 | `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` ほか（U1〜U5） | 新しいものなし | 足りる |

### 資源の定義（`data-stack.ts`）

| 項目 | 実コード | U8 の影響 |
|------|---------|----------|
| `Calendar` | 主キー `familyId`＋`sk`、索引なし、TTL なし。`RemovalPolicy` は本番 `RETAIN`・ステージング `DESTROY`（共通の `common`） | 変更なし。`SWAP#<dutyId>` の項目は同じ表の別の `sk` で、索引も TTL も要らない（`GetItem` だけで読む。NFR3.14） |
| Lambda の大きさ | `api`・`line` とも 256 MB・30 秒・ARM64・Node.js 22（`createFunction`） | 変更なし |
| 同時実行の予約 | `reservedConcurrency` は CDK のコンテキストで与えたときだけ有効（未指定なら予約しない） | 変更なし。「U1 のまま」は「コードで変えない」の意味 |
| ロググループ | 各 Lambda に 1 つ、保管 1 か月（30 日） | 変更なし。新しいロググループなし |
| `MetricFilter` | `api` のロググループに 1 つ（`InvitationInvalidCount`） | 足さない |
| CloudFront | `/line/webhook` が `line`、`/v1/*` が `api`。`AllowedMethods.ALLOW_ALL` | 変更なし。U8 は新しい HTTP の入口を足さない（LINE の webhook と postback は既存の `/line/webhook` を通る） |

> **結論**: U8 に必要なインフラの変更は**ありません**。`infrastructure/lib/` の差分は作りません。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | 既存の `line` の Lambda に「家事交代」と `swap.*` の入口、`line` と `api` の起動の枠にフックの登録を足す。新しい Lambda は作らない | NFR1.33、NFR4.82。`line` の `/line/webhook` は U3〜U6 で既に通っている |
| 入口 | 変更なし。LINE のグループから届く webhook と postback は既存の `/line/webhook` → `line` を通る。画面の新しい API は足さない | U8 は画面を足さない。`api` はフックの登録（月の確定などの後の掃除）が増えるだけ |
| 保存 | `DataStack` は変えない。申し出は `Calendar` の `SWAP#<dutyId>`（担当 1 つにつき 1 項目、`GetItem` だけで読む） | NFR1.33、NFR3.14 |
| 環境 | ステージングと本番の両方に同じ変更（`AppStack` のコード反映のみ）。環境ごとの新しい設定・秘密・パラメータはない | NFR10.9 |
| IaC | `app-stack.ts`・`data-stack.ts`・`app.ts` は変えない。変えるのは `infrastructure/test/u8-swap/stacks.test.ts`（新規。前後で同じことを固定）、README、アプリコード（`packages/*`）、`docs/contract-changes-u8.md` | `line`・`api` の権限と環境変数は U4〜U6 で足し済み |
| 配備の順番 | `Housework-<env>-App` のコード反映だけ。`main` への取り込みでステージングに自動、本番は作り手が確認してから手で。コードが変わる反映は冷たい起動を作る機会にもなる（環境変数や設定を手で書き換えない） | NFR10.9、NFR6.9 |
| 大きさ | 256 MB・30 秒・ARM64 のまま。測定で 3 秒を超えたときだけ 512 MB を検討する（無料枠に収まるかを先に確かめる）。Provisioned Concurrency は使わない | NFR7.48、NFR1.33 |
| 秘密の情報 | 足さない。`line/*` の SSM はこれまでどおり起動時に読む。`jwt/*` は `line` に無く使わない。テストと前提データは `<作り物の値>` を使う | NFR5.14、NFR5.15 |
| 本番の初期データ | CDK でも配備の手順でも入れない。申し出・引き受けはアプリ（LINE）の操作でだけ変わる | NFR6.9 |
| ステージングでの確認 | ステージング用の公式アカウントと作り手だけのグループで、子供の役割のテスト用の利用者を 2 人以上使う。ステージングの公式アカウントを本番のお知らせ先のグループに入れない | NFR10.9 |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Calendar`（既存） | database | 変更なし | `line` は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`、`api` は 6 操作。U8 の読み書きはこの範囲内。`line` に `PutItem`・`DeleteItem`・`Scan`・`Batch*` を足さない |
| DynamoDB `ChoreTypes`（既存） | database | 変更なし | `line` は読むだけ（`GetItem`・`Query`・`ConditionCheckItem`）。U8 は書かない |
| DynamoDB `Users`・`Families`・`NotificationGroups`・`ProcessedLineEvents`（既存） | database | 変更なし | 入口の確かめと二度処理しない記録に既存の権限で使う |
| Lambda `line`（コードのみ変更） | compute | 権限・環境変数・メモリ・時間切れは U8 の前後で同じ | 「家事交代」と `swap.*`。reply だけで返す |
| Lambda `api`（コードのみ変更） | compute | 同上 | フックの登録（掃除）が増える。月の確定の後のフックは 4 並行（ADR-U8-01） |
| IAM | access control | 追加なし | `grantReadWriteData` は使わない（`Scan` などが付くため）。絞った文のまま |
| CloudWatch Logs | logging | 変更なし（30 日） | `monitoring-design.md`。指標とアラームは U10 |
| CloudFront | cdn | 変更なし | `/line/webhook` と `/v1/*` はそのまま |
| LINE Messaging API（外部） | external | reply だけ（`POST /v2/bot/message/reply`）。`push`・`multicast`・`broadcast` は使わない | 月 200 通の無料枠に数えない（NFR1.32） |

### 足さないもの（NFR4.82）

| 区分 | 足さないもの |
|------|-------------|
| `line` の `Calendar` | `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、索引の ARN |
| `line` の `ChoreTypes` | 書き込み系（`PutItem`・`UpdateItem`・`DeleteItem`）、`Scan` |
| 共通 | 別のサービスへの許可、`Resource: "*"` の DynamoDB の文（`kms:Decrypt` の条件つき文は U1 のまま）、`api` への追加 |

### 残る危険（NFR 設計から引き継ぎ）

`UpdateItem` の許可は項目を作れる（`PutItem` と同じ効果）ので、`line` が乗っ取られた場合に `SWAP#` の形の項目を作られ得ます。許可では守れず、コードの条件とキーの固定で守る設計です。IAM は項目のキー（`sk`）を絞れないので、`line` の `UpdateItem` の許可は `Calendar` 全体（同じ家族の担当や月の状態の項目を含む）に及びます（U6 から同じ）。取引の条件（`version`・`status`）はアプリのコードにあり、`line` が乗っ取られたらその条件も外せるので、許可の面では守れません。これを残る危険として、承認の場で確かめる項目にします。申し出の作成を `api` にだけ置く代案は、LINE から申し出る流れに合わないので採りません（`nfr-design/security-design.md`）。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Calendar` テーブル | U5 | U6、U7、U8（申し出の項目 `SWAP#`、引き受け時の担当の更新）、U9、U10、U11 | `line`（U8）は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`。`api`（U8 のフック）は `UpdateItem`（`status = open` の条件）。操作は `swapService.ts`／`swapRepository.ts`（C8 の窓口）を通す |
| `ChoreTypes` テーブル | U4 | U5、U6、U7、U8（名前の読み取り） | U8 は読むだけ |
| `dutyReassignedHook`・`dutyRecordedHook` の登録の口 | U5・U6 | U8（登録する側） | `line` と `api` は実行環境が別なので、登録は別々に 1 回ずつ（`api`: 両方、`line`: `onDutyRecorded` だけ） |
| `Calendar` の同じ家族のパーティション | U5 | 月の確定の最大 300 件のフック書き込み、LINE の操作 | 並行数 4 で毎秒の書き込みを 1 パーティションの目安に収める（`nfr-design/logical-components.md`） |

## 費用の見込み

| サービス | U8 の増分（月） | 無料枠 | 見込み |
|---------|---------------|--------|--------|
| DynamoDB（書き込み、オンデマンド） | 申し出・引き受け・取り下げが月に数十回、フックの掃除は `status = open` の申し出があるときだけ実際に書く（月の確定の最大 300 件の `UpdateItem` は、条件で断られても書き込みユニットを使う。年に 1 回程度の確定ごとに最大 300 回） | 対象外（従量） | 月に 1 円に満たない（`nfr-design/scalability-design.md`） |
| DynamoDB（読み取り） | 一覧 7 回、選ぶ・引き受けるで約 10 回の読み取り | 対象外（従量） | 1 円に満たない |
| Lambda | `line` の呼び出しが月に数十回増える | 月 100 万回 | 0 円 |
| LINE のメッセージ | reply だけ。無料のメッセージ数に数えない | — | 0 円（NFR1.32） |
| CloudWatch Logs Insights（手で使う問い合わせ） | 作り手が確認のときだけ使う。検索するログは 30 日保管で量が小さい | 対象外（検索したデータ量の従量） | 0 円に近い（無視できる）。広い期間の検索を常用しない |
| 新しい有料のサービス | なし | — | なし |

- U5 の最初の請求の確認に U8 の増分を含めて見ます。U8 だけを分ける手順は要りません

## 元に戻す手順

| 場面 | 戻し方 |
|------|--------|
| U8 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する（NFR10.10） |
| 権限・環境変数を戻す必要があるか | ない。U8 は `app-stack.ts` を変えないので、戻しても消える権限・環境変数はない |
| データ | 移行も削除も要らない。`SWAP#` の項目は前の版から読まれず無害で残る。引き受けた担当の `childUserId`・`origin` は画面からの担当の変更と同じ状態として残る |
| 動作 | 前の版に戻すと「家事交代」と `swap.*` のボタンは反応しなくなる。並行数の変更を戻しても保存の結果は変わらない |

## 本番のデータの決まりとの関係

| 決まりの守り方 | 内容 |
|---------------|------|
| 書く経路を最小にする | 新しい IAM の文を足さない。`line` に `PutItem`・`DeleteItem` を足さない |
| 秘密を含まない | 新しい環境変数・SSM パラメータ・GitHub Variables を足さない |
| 直接の書き換えをしない | `Calendar` を直接書き換えるスクリプト・一括修正の手順を作らない（NFR6.9）。データはアプリの操作でだけ変わる |

## Sources

- `construction/u8-swap/nfr-design/logical-components.md`（Infrastructure Design へ渡すこと、障害の波及範囲、他の単位との約束）
- `construction/u8-swap/nfr-design/security-design.md`（NFR4.81・NFR4.82、権限と環境変数は足さない、残る危険）
- `construction/u8-swap/nfr-design/scalability-design.md`、`reliability-design.md`、`performance-design.md`、`observability-design.md`（構成の数、費用、取引の形、並行数）
- `construction/u8-swap/functional-design/functional-spec.md`（契約への追加、フック）
- `inception/domain-design/components.md`（カレンダーが申し出を持つ。ADR-001）
- `inception/contract-design/contract-summary.md`（C3、C6、C8、C10）
- `construction/u7-review-confirm/infrastructure-design/infrastructure-specification.md`（形の手本）
- `infrastructure/lib/app-stack.ts`、`infrastructure/lib/data-stack.ts`、`infrastructure/lib/app.ts`（実コードを読んで確かめた）

## Assumptions & Open Questions

- [assumption] 食い違いは見つかりませんでした。実コードの `line` の `Calendar`（`GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`）、`ChoreTypes`（`GetItem`・`Query`・`ConditionCheckItem`）、`api` の 6 操作、`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` は、NFR 設計の記述と一致しました
- [assumption] 取引が実際に通ることは、設計だけでは確かめられません。コード生成の統合に近いテストとステージングの動作確認（NFR7.48）で確かめます。コード生成の最初に `app-stack.ts` を再度読み、不足があれば `security-design.md` に戻って理由とともに足します
- [assumption] 月の確定のフックの条件つき `UpdateItem` は、条件で断られても書き込みユニットを消費する前提で見積もっています。年に数回の確定で最大 300 回なので、費用への影響は 1 円に満たない見込みです
- [assumption] 参考: `app-stack.ts` の U4 の文の注記「line には足さない」は、U6 で `line` に読む権限を足したため古くなっています。コードの動作に影響しないので U8 では直しません（コメントの更新だけなので、コード生成で触れるなら直してもよい）
- 追加の質問はありません
