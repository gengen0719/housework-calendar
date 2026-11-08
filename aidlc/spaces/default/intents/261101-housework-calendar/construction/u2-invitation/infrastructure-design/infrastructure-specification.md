# インフラの仕様（Infrastructure Specification）— U2 招待

U2（`u2-invitation`）で U1 の構成（`construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md`）に足す・変える AWS の資源です。新しいスタック、新しい Lambda、新しい有料サービスは足しません。仕組みの考え方は `nfr-design/` にあり、CDK の中身はコード生成で作ります。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の Lambda `api` に処理を足す。`line` は変えない | NFR3.3。U1 の Shared Infrastructure の決まり（新しい関数は作らない） |
| 入口 | U1 の CloudFront の `/v1/*` の振り分けのまま。新しい道はいらない（`/v1/family/*`、`/v1/invitations/*` は `/v1/*` に入る） | 振り分けの変更なし |
| ネットワーク | 変更なし（VPC なし） | U1 のとおり |
| 保存 | `Housework-<env>-Data` に DynamoDB テーブル `Invitations` を足す。`Users` に GSI `familyId-index` を足す | `nfr-design/scalability-design.md` [Q1、Q2 の NFR 設計の答え] |
| 環境 | ステージングと本番の両方に同じ変更。`main` に取り込むとステージングに、本番は手で反映 | U1 のとおり（NFR10.2） |
| スタックの分け方 | 変更なし。テーブルは Data、権限とメトリクスフィルタは App | U1 のとおり |
| IaC | AWS CDK（TypeScript）、`infrastructure/lib/data-stack.ts`、`app-stack.ts` を変える | U1 のとおり |
| 大きさ | 変更なし（256 MB、30 秒、予約 5） | U2 の処理は軽い（`nfr-design/performance-design.md`） |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Invitations`（新しく作る） | database | オンデマンド、PK `token`（文字列）、TTL `ttl`（期限 + 7 日、エポック秒）、暗号化 `AWS_MANAGED` | 本番は `RemovalPolicy.RETAIN`（NFR6.3）。ステージングは U1 のテーブルと同じ扱い |
| DynamoDB `Users`（変える） | database | GSI `familyId-index` を足す: PK `familyId`、射影 `INCLUDE`（`displayName`、`role`、`familyJoinedAt`） | CloudFormation は 1 回の更新で GSI を 1 つしか足せない。U2 で足すのは 1 つだけなので、1 回の反映で済む。既存の項目の索引づくりは自動 |
| DynamoDB `Families`、`RequestRecords` | database | 変更なし（項目を足すだけで、キーと設定は変えない） | U1 の「既存のテーブルのキーは変えない」の決まりのとおり |
| CloudWatch Logs のメトリクスフィルタ（新しく作る） | monitoring | Lambda `api` のロググループに、`{ $.event = "INVITATION_REJECTED" && $.reason = "INVITATION_INVALID" }` を数えるフィルタ。名前空間 `Housework/<env>`、メトリクス `InvitationInvalidCount`、値 1、`defaultValue` 0（データがない時間を 0 として数え、U10 のアラームで「データなし」を扱わずに済むようにする） | NFR2.15。アラームは U10 で足す。いまの `app-stack.ts` は `createFunction` の中でロググループを作っているので、関数と一緒にロググループも返すように変え、そのロググループにフィルタを付ける（レビュー R-05） |
| CloudFront、S3 | cdn、storage | 変更なし。アクセスログは有効にしない（NFR4.26） | 画面のファイルは U2 の画面を含めてビルドし直して入れる |
| LINE Developers の LIFF アプリ（AWS の外） | 外部の設定 | ステージングと本番の両方の LIFF アプリで、shareTargetPicker を有効にする（手で設定） | NFR10.3。手順は README（`cicd-pipeline.md`） |

### Lambda のロールの権限（変える）

いまの `app-stack.ts` は、操作ごとに `addToRolePolicy` で許可を書いています（`grantReadWriteData` は使っていません）。U2 では、次の許可を同じ書き方で足します（レビュー R-01）。

| ロール | 資源 | 足す操作 |
|--------|------|---------|
| `api` | `Invitations` のテーブル（新しい） | `dynamodb:GetItem`、`PutItem`、`UpdateItem`、`ConditionCheckItem` |
| `api` | `Users` の索引 `familyId-index`（`<Users の ARN>/index/familyId-index`） | `dynamodb:Query` |
| `api` | `Users` のテーブル | `dynamodb:ConditionCheckItem`（いまは GetItem、PutItem、UpdateItem） |
| `api` | `Families` のテーブル | `dynamodb:UpdateItem`、`ConditionCheckItem`（いまは GetItem、PutItem） |
| `api` | `RequestRecords` のテーブル | 変更なし（GetItem、PutItem）。TransactWriteItems の中の Put も `PutItem` の許可で足りる |
| `line` | — | 変更なし。`Invitations` と `familyId-index` には届かない |

- TransactWriteItems は、中の項目ごとの操作（Put は `PutItem`、Update は `UpdateItem`、ConditionCheck は `ConditionCheckItem`）の許可で確かめられる
- `AppStackProps` に `invitations: dynamodb.Table` を足し、`app.ts` で Data スタックから渡す。`api` の環境変数に `INVITATIONS_TABLE` を足す
- CDK のテスト（`infrastructure/test`）で、`api` のロールに上の許可があり、`line` のロールに `Invitations` がないことを確かめる

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Invitations` テーブル | U2（家族とメンバーの部品） | U2 だけ | `api` のロールだけ。家族とメンバーの部品のコードだけが使う |
| `Users` の `familyId-index` | U2（家族とメンバーの部品） | U2（メンバーの一覧）。U5 以降が子供の一覧に使ってよい（C6 `listMembers` を通して） | 部品の窓口を通す |
| メトリクス `Housework/<env>/InvitationInvalidCount` | U2 | U10（アラーム） | 読み取りだけ |

## 費用の見込み

| サービス | 家族 4 人の 1 か月の量（U2 の分） | 無料枠 | 見込み |
|---------|-----------------------------|--------|--------|
| DynamoDB（保存） | 招待の記録は数件、数 KB | 25 GB | 0 円 |
| DynamoDB（読み書き、オンデマンド） | 数十回 | なし（従量） | 1 円未満 |
| Lambda | 数十回 | 月 100 万回 | 0 円 |
| CloudWatch のメトリクスフィルタとカスタムメトリクス 1 つ | 1 つ | カスタムメトリクス 10 個 | 0 円 |

濫用されたときの止め方（レビュー R-02）: いまの `app.ts` は予約された同時実行数に 0 を受け付けず、GitHub の Variable `RESERVED_CONCURRENCY` は `api` と `line` の両方に効きます。そのため、緊急に止めるときは CDK を通さず、作り手が AWS CLI で画面用の Lambda だけを止めます。

```
aws lambda put-function-concurrency --function-name <api の関数名> --reserved-concurrent-executions 0
```

- LINE 用の受け口（`line`）は止めない（友だち登録とブロックは届き続ける）
- 戻すときは、次の反映（`deploy-staging.yml` か `deploy-production.yml`）で CDK の値に戻る。急ぐときは `aws lambda delete-function-concurrency` で予約を外す
- アカウントの同時実行数の枠が小さく（10 など）、`RESERVED_CONCURRENCY` を設定していない環境では、予約がないため「同時実行数 5」の前提が成り立ちません。その場合も上の 0 で止める方法は使えます。枠は README の手順で確かめます
- 手順は README に書く

## Sources

- `construction/u2-invitation/nfr-design/scalability-design.md`、`security-design.md`、`observability-design.md`、`logical-components.md`
- `construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md`
- `infrastructure/lib/data-stack.ts`（いまのテーブル）
- `infrastructure-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- [assumption] CloudFormation の DynamoDB の更新では、1 回に作る・消す GSI は 1 つまでです。U2 の反映は 1 つだけなので問題ありません。U3 以降で GSI を足すときは、1 回の反映に 1 つにします
- [assumption] shareTargetPicker を有効にする設定は、LINE Developers の管理画面で LIFF アプリごとに行います。B2 の反映の前に作り手が設定します
