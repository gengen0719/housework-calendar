# インフラの仕様（Infrastructure Specification）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）で、U1〜U4 の構成に足す・変える AWS の資源です。足すのは DynamoDB のテーブル `Calendar` 1 つと、`api` の Lambda の環境変数・権限だけです。新しいスタック・Lambda・有料サービス・秘密の情報は足しません。決めることはすべて NFR 設計（`nfr-design/logical-components.md` の「Infrastructure Design へ渡すこと」）で決まっているため、この段階では人に聞くことはありませんでした。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の Lambda `api` に 4 つの操作（月のカレンダー、割り当ての読み取り・保存、担当の子供の変更）を足す。`line` は変えない | NFR1.19、NFR3.6。U5 は LINE の操作を足さない |
| 入口 | 変更なし。CloudFront の `/v1/*` は `AllowedMethods.ALLOW_ALL` で、GET・PUT・PATCH は U4 までに通っている。新しいパス（`/v1/months/*`、`/v1/duties/*`）も `/v1/*` に含まれる | 新しい振る舞い（behavior）は要らない。ステージングのスモークチェックで届くことを確かめる（`cicd-pipeline.md`） |
| 保存 | `Housework-<env>-Data` に DynamoDB テーブル `Calendar`（PK `familyId`、SK `sk`、索引なし）を足す | `nfr-design/scalability-design.md` ADR-U5-01（案 A〜E を比べて決定済み） |
| 環境 | ステージングと本番の両方に同じ変更 | U1 のとおり。違いは削除の扱いだけ（下の表） |
| IaC | `infrastructure/lib/data-stack.ts`（テーブル）、`app-stack.ts`（環境変数・権限・props）、`app.ts`（props の受け渡し）を変える。AWS CDK（TypeScript） | チームの Deployment の決まり（AWS CDK）。スタックは増やさない |
| 配備の順番 | `Housework-<env>-Data`（`Calendar` を作る）→ `Housework-<env>-App`（環境変数と許可）。`cdk deploy Housework-<env>-Data Housework-<env>-App` が参照の向きから自動で並べるので、ワークフローは 1 回の実行で足りる | 足すテーブルは 1 つで、CloudFormation の「1 回の更新で GSI は 1 つ」の制約には当たらない（索引がない） |
| 大きさ | 変更なし（256 MB、30 秒、予約同時実行は変数 `RESERVED_CONCURRENCY` のまま。上限はこの変数で決まり、未設定なら予約しない） | NFR3.6。保存は 1 つの Lambda の中でトランザクションを順に書くので、1 回の保存が占める同時実行は 1 つ。メモリは、ステージングの測定（NFR7.20〜NFR7.23）で 3 秒を超えたときだけ見直す |
| 秘密の情報 | 足さない。パラメータストアのパラメータも GitHub の Variables も増えない | U5 は新しい外部サービスを呼ばない |
| 本番の初期データ | CDK でも配備の手順でも入れない（`AwsCustomResource` などでテーブルに項目を書かない） | 本番のデータは手で書き換えない決まり（下の「本番のデータの決まりとの関係」） |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Calendar`（新しく作る） | database | オンデマンド（`PAY_PER_REQUEST`）、PK `familyId`（文字列）、SK `sk`（文字列）、**GSI も LSI も作らない**、TTL なし、暗号化 `AWS_MANAGED`、`tableName` は指定しない、PITR は有効にしない | 既存テーブルと同じ `common`（`billingMode`・`encryption`・`removalPolicy`）をそのまま展開して作る。論理 ID は `Calendar`。`DataStack` の公開プロパティは `calendar: dynamodb.Table` |
| Lambda `api`（変更） | compute | 環境変数 `CALENDAR_TABLE` を足す（値は `props.calendar.tableName`）。ほかの設定は変えない | `line` の環境変数には足さない |
| IAM（`api` のロール） | access control | 下の表。`addToRolePolicy` で、コードが使う操作だけを許可する | `grantReadWriteData` は使わない（`Scan`・`BatchGetItem`・`BatchWriteItem` まで付くため） |
| CloudWatch Logs | logging | 変更なし（`api` のロググループ、保管 30 日） | `monitoring-design.md` |
| CloudFront | cdn | 変更なし | `/v1/*` が `api` の関数 URL に届く |

### `Calendar` を既存テーブルに揃えるところ

| 項目 | 既存テーブル（`data-stack.ts`） | `Calendar` | 揃え方 |
|------|-------------------------------|-----------|--------|
| 課金 | `PAY_PER_REQUEST` | `PAY_PER_REQUEST` | `common` を展開する（個別に書かない） |
| 暗号化 | `AWS_MANAGED` | `AWS_MANAGED` | `common` を展開する |
| 削除の扱い | 本番 `RETAIN`、それ以外 `DESTROY` | 同じ。本番は `RemovalPolicy.RETAIN`（NFR6.6）、ステージングは `DESTROY` | `common` を展開する（`isProd` の分岐を増やさない） |
| 削除保護（`deletionProtection`） | 設定していない | 設定しない | 既存と同じ。本番の守りは `RETAIN` と、人が項目を書き換える経路を作らないこと（下の「本番のデータの決まりとの関係」） |
| 時点復旧（PITR） | 有効にしていない | 有効にしない | 既存と同じ。費用 0 円の条件。喪失への備えは `RETAIN` と書き込みの条件つきの作り（`nfr-design/reliability-design.md`） |
| 名前 | `tableName` を指定しない（CloudFormation が付ける） | 指定しない | 環境ごとの重複と、作り直しのときの名前の衝突を避ける。コードは環境変数 `CALENDAR_TABLE` で受ける |
| TTL | 一部のテーブルだけ | なし | 履歴は残す（お小遣いの根拠になる。FR6、U9） |
| 索引 | `Users` だけ GSI あり | なし | LSI は後から足せず、GSI は結果整合で強い整合性の読み取りができない（ADR-U5-01 の案 C・D を採らなかった理由） |

### Lambda のロールの権限（変える）

TransactWriteItems という IAM の操作はありません。トランザクションの許可は、**入っている項目ごとの操作**（Put は `PutItem`、Update は `UpdateItem`、Delete は `DeleteItem`、ConditionCheck は `ConditionCheckItem`）で、**項目があるテーブルごとに**判定されます。そのため、割り当ての保存のトランザクションに入る項目の種類を数えて、許可を決めました。

| トランザクションの項目 | テーブル | 必要な操作 |
|----------------------|---------|-----------|
| 担当の Put（作る）、引き当て `DID#` の Put、割り当て `M#<month>#A` の Put | `Calendar` | `PutItem` |
| 担当の Update（子供を変える。保存し直しと PATCH） | `Calendar` | `UpdateItem` |
| 担当の Delete、引き当て `DID#` の Delete | `Calendar` | `DeleteItem` |
| 月の状態 `M#<month>#S` の ConditionCheck（確定していない） | `Calendar` | `ConditionCheckItem` |
| 種類 `TYPE#<choreTypeId>` の ConditionCheck（`active = true`） | `ChoreTypes` | `ConditionCheckItem` |
| トランザクション以外の読み取り（月の Query、割り当て・月の状態・引き当て・担当の GetItem） | `Calendar` | `Query`、`GetItem`（強い整合性の読み取りに追加の許可は要らない） |

| ロール | 資源 | 操作 | 変更 |
|--------|------|------|------|
| `api` | `Calendar` のテーブル（ARN だけ。索引はないので `/index/*` は不要） | `dynamodb:GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`、`ConditionCheckItem`（6 つ） | 足す（新しい文 1 つ） |
| `api` | `ChoreTypes` のテーブル | `dynamodb:GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`（U4 のまま）に **`dynamodb:ConditionCheckItem` を足す**（6 つ） | 既存の文に 1 つ足す（文は 1 つのまま） |
| `api` | `Users` のテーブル | 変更なし（`GetItem`、`PutItem`、`UpdateItem`） | 子供の確かめの強い整合性の `GetItem` は、すでにある許可で足りる（`app-stack.ts` で確認した）。索引（`familyId-index`）は確かめに使わない |
| `api` | `Families`、`RequestRecords`、`Invitations`、`NotificationGroups` | 変更なし | — |
| `line` | `Calendar` | **足さない** | U5 では `line` は `Calendar` に触れない。U6 以降が LINE から記録・引き受けをするときに、その単位が必要な操作だけを足す |
| すべて | — | **`Scan`、`BatchGetItem`、`BatchWriteItem` は足さない** | `Scan` は NFR1.20・NFR1.22 が禁じている。バッチの操作は使わない |

- `ChoreTypes` の `ConditionCheckItem` を忘れると、割り当ての保存のトランザクションが `AccessDeniedException` で失敗する。これは `CancellationReasons` を持つ取り消しではなく例外として届くので、`reliability-design.md` の決まりどおり 500 `INTERNAL` になり、利用者には「保存できませんでした」としか見えない。そのため CDK のテストで、`ChoreTypes` の許可がちょうど 6 つであることを確かめる（`cicd-pipeline.md`）
- `Calendar` の `Query` はテーブル本体だけ。`isChoreTypeAssigned` の絞り込み付きの Query も、キー条件が `familyId` なのでテーブル本体への `Query` で足りる
- リーディングキー（`dynamodb:LeadingKeys`）で家族の範囲を IAM でも絞る案は採らない。`familyId` は家族ごとに動的に決まり、1 つのロールが全家族の値を扱うため、固定の条件にできない。家族の範囲は、キーに `familyId = ctx.familyId` を入れるコードの作りと単体テストで守る（NFR4.44）
- `AppStackProps` に `calendar: dynamodb.ITable` を足し、`app.ts` で `calendar: data.calendar` を渡す（`ChoreTypes` と同じ受け渡し）

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Calendar` テーブル | U5（カレンダー（担当と記録）の部品。`inception/domain-design/components.md` の Entity Ownership） | U6（記録）、U7（状態の変更・月の確定）、U8（代わりにやる）、U9（お小遣いの根拠として読む）、U10 | ほかの単位は C8 の窓口（`calendarService`）を通して使う。担当の作成と削除、引き当て `DID#` の作成と削除は U5 だけ。U6〜U8 は `version` と `dutyId` の条件つきで更新し、月の状態の ConditionCheck を同じトランザクションに入れる（`nfr-design/logical-components.md` の「他の単位との約束」）。`line` の Lambda に権限を足すのは、LINE から読み書きする単位（U6 以降）が、必要な操作だけを足す |
| `ChoreTypes` テーブル（U4 の持ち物） | U4 | U5（C7 の `list` と、割り当ての保存の ConditionCheck） | U5 が足すのは `api` の `ConditionCheckItem` だけ。U4 の `choreTypeService` を通さずに `ChoreTypes` の中身を読まない |

## 費用の見込み

| サービス | 家族 4 人の 1 か月の量（U5 の分） | 無料枠 | 見込み |
|---------|-------------------------------|--------|--------|
| DynamoDB（保存） | 1 年で担当約 1500 件 + 引き当て同数 + 割り当て 12 件（約 0.6 MB 台） | 25 GB | 0 円 |
| DynamoDB（書き込み、オンデマンド） | 約 1100 ユニット（保存 2 回で約 1080。ConditionCheck も数え、トランザクションは 2 倍で数える） | **対象外**（従量） | 約 0.0008 ドル |
| DynamoDB（読み取り、オンデマンド） | 約 7000 ユニット（カレンダーを開くのが月に約 700 回） | **対象外**（従量） | 約 0.001 ドル |
| Lambda | 月に数百回 | 月 100 万回 | 0 円 |
| CloudWatch Logs | 数百行 | 5 GB | 0 円 |
| 新しい有料のサービス | なし | — | なし |

- 合計は 1 つの環境で月に約 0.002 ドル（約 0.3 円）。ステージングと本番の 2 つの環境を合わせても約 0.6 円以下で、ステージングは確認のときしか使わないので実際はさらに小さい
- **オンデマンドの読み書きは無料枠の対象外**です。DynamoDB の読み書きの無料枠はプロビジョニング型の容量に対するもので、無料になるのは保存量 25 GB までです。U5 は「無料枠で消える」のではなく、毎月わずかな金額（約 0.002 ドル）がかかります
- したがって、費用 0 円の条件（請求額が 0 円）が成り立つのは、**約 0.002 ドルが請求の端数の丸めで 0.00 ドルになる前提のとき**だけです。この前提はまだ確かめていません。最初の請求で確かめる手順と、超えたときの扱いは `cicd-pipeline.md` の「費用の確かめ（最初の請求）」に決めました
- 単価（東京リージョンで書き込み約 0.71 ドル、読み取り約 0.14 ドル / 100 万ユニット）は NFR 設計の概算で、この段階では公式の料金表で再確認できていません。見込みは月 1 円の 3 分の 1 程度なので、単価が数倍違っても月 1 円を超えません。正確な単価は最初の請求で確かめます
- PITR、バックアップ、グローバルテーブル、DAX、CloudWatch のカスタムメトリクスやアラームは足しません

## 本番のデータの決まりとの関係

チームの決まり（`team.md` の Deployment、`project.md` の Forbidden）は「本番のデータは手で書き換えない」です。U5 のインフラは次のように、その決まりを守る側に作ります。

| 決まりの守り方 | 内容 |
|---------------|------|
| 書く経路を 1 つにする | `Calendar` の項目を書くのは `api` のロールだけ（`line` は書けない）。人が使う IAM の許可や、書き込み用の運用ロールは足さない |
| 配備で項目を書かない | CDK の配備（Data スタック・App スタック）はテーブルを作るだけで、項目を入れない。`cdk deploy` のロールは CloudFormation 経由で資源を作る |
| スモークチェックは書かない | `scripts/smoke-check.sh` の確かめはセッションなしの要求で、401 で止まる。データを作らない |
| 確認用のデータはアプリの操作で作る | ステージングの確認は、作り手がアプリで割り当てを保存して作る。本番の確認は、家族が実際に使う操作のまま行い、確認のために本番へテストデータを入れない |
| 直す必要が出たとき | 画面の操作で収まるなら画面から直す（割り当ての保存し直しは何度やっても同じ結果に収まる。BR6.18）。収まらないときは、直す手順をコードとして用意し、プルリクエストと CI を通し、ステージングで試してから本番へ反映する。コンソールで項目を編集しない |
| 消えない守り | 本番の `Calendar` は `RETAIN`。スタックを消してもテーブルは残る。ただし項目の誤った削除は `RETAIN` では防げない（PITR は費用 0 円の条件で有効にしない）。そのため、項目を消せるのは書き込みの条件つきの `api` のコードだけという作りで守る |

## Sources

- `construction/u5-assignment-calendar/nfr-design/logical-components.md`（Infrastructure Design へ渡すこと）、`scalability-design.md`（ADR-U5-01〜03、費用の見込み）、`security-design.md`（権限）、`reliability-design.md`（トランザクションの項目）
- `construction/u5-assignment-calendar/functional-design/functional-spec.md`（U5 で作る 4 つの操作）
- `inception/domain-design/components.md`（Entity Ownership、ADR-001）
- `inception/contract-design/contract-summary.md`（C1、C8）
- `construction/u4-chore-types/infrastructure-design/infrastructure-specification.md`（形の手本）
- `infrastructure/lib/data-stack.ts`、`app-stack.ts`、`app.ts`（既存の作りと権限）

## Assumptions & Open Questions

- [assumption] 東京リージョンのオンデマンドの単価は概算で、この段階では再確認できていません。最初の請求で確かめます（`cicd-pipeline.md`）
- [assumption] 暗号化は既存と同じ `AWS_MANAGED` なので、新しい種類の費用は足されない見込みです。最初の請求で、DynamoDB の行以外に新しい行がないことも見ます
- [assumption] `cdk deploy` が `Data` を先に反映するのは、`App` が `Data` のテーブルを参照しているためです（U4 でも同じ向きで 1 回で反映できた）
- 追加の質問はありません
