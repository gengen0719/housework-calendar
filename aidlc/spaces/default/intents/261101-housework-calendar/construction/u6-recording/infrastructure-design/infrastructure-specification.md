# インフラの仕様（Infrastructure Specification）— U6 記録

U6（`u6-recording`）で、U1〜U5 の構成に足す・変える AWS の資源です。**新しいテーブル・Lambda・索引・指標・アラームは足しません**（NFR1.25）。変えるのは `AppStack` だけ（`DataStack` は変えない）で、`line` の Lambda に環境変数 2 つと権限 2 文を足します。決めることはすべて NFR 設計（`nfr-design/logical-components.md` の「Infrastructure Design へ渡すこと」）で決まっているため、この段階では人に聞くことはありませんでした。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の Lambda `line` に 2 つの操作（`record.list`、`record.do`）を足す。`api` の Lambda には `POST /v1/duties/:dutyId/record` を足す（環境変数・権限はすでに U5 で `CALENDAR_TABLE` と `Calendar` の全 6 操作が入っている）。新しい Lambda は作らない | NFR1.25、NFR3.9。U6 は `line` と `api` の既存の Lambda に処理を足すだけ |
| 入口 | 変更なし。`/line/webhook` はすでに `line` に届く。`/v1/*` の `api` に `POST /v1/duties/:dutyId/record` は `AllowedMethods.ALLOW_ALL` で通る（`PATCH /v1/duties/:dutyId` の U5 と同じパス型。新しい behavior は不要） | スモークチェック（`cicd-pipeline.md`）で 401 が返ることを確かめる |
| 保存 | `DataStack` は変えない（`Calendar` テーブルは U5 で作済み。`ChoreTypes` テーブルは U4 で作済み） | NFR1.25 |
| 環境 | ステージングと本番の両方に同じ変更（`AppStack` の更新のみ） | U1 のとおり |
| IaC | `infrastructure/lib/app-stack.ts` だけを変える（環境変数 2 つ・権限 2 文）。`data-stack.ts`、`app.ts` は変えない | DataStack の props に `calendar` と `choreTypes` はすでにある（U4、U5） |
| 配備の順番 | `Housework-<env>-App` だけ（`DataStack` に変更なし）。ステージングで確かめてから本番へ | U5 の Calendar が既存なので Data スタックの更新は不要 |
| 大きさ | `line` の Lambda: 256 MB、30 秒、ARM64 のまま。測定で 3 秒を超えたときだけ 512 MB への引き上げを検討（無料枠に収まるかを先に確かめる） | NFR3.9。U1 の設定を変えない |
| 秘密の情報 | 足さない。`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` の値はテーブル名（CloudFormation が付けた名前）で、秘密ではない | NFR5.10 |
| 本番の初期データ | CDK でも配備の手順でも入れない | 本番のデータは手で書き換えない決まり |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Calendar`（既存。U5 で作済み） | database | 変更なし（`DataStack` は触らない） | `line` の Lambda から読み書きするための権限だけ `AppStack` に足す |
| DynamoDB `ChoreTypes`（既存。U4 で作済み） | database | 変更なし | `line` の Lambda から読むための ConditionCheckItem の権限を足す（GetItem と Query は U6 で追加） |
| Lambda `line`（変更） | compute | 環境変数 `CALENDAR_TABLE`（`props.calendar.tableName`）と `CHORE_TYPES_TABLE`（`props.choreTypes.tableName`）を追加 | `api` の環境変数は変えない |
| IAM（`line` のロール） | access control | 下の表（2 文追加）。`api` のロールは変えない | `grantReadWriteData` は使わない（Scan などが付くため） |
| CloudWatch Logs | logging | 変更なし（`line` と `api` のロググループ、保管 30 日） | `monitoring-design.md` |
| CloudFront | cdn | 変更なし | `/v1/*` が `api` の関数 URL に届く。`/line/webhook` が `line` に届く |

### Lambda のロールの権限（変える）

`TransactWriteItems` 自体の IAM アクションはありません。取引は、項目ごとの操作（`UpdateItem`、`ConditionCheckItem`）でテーブルごとに確かめられます（U5 の `NotificationGroups` の取引と同じ）。

U6 が `line` の Lambda に足す権限（**変更前 → 変更後**）:

| テーブル | 変更前（U5 まで） | 変更後（U6） | 追加アクション数 |
|---------|-----------------|------------|----------------|
| `Calendar` | （なし） | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:UpdateItem`、`dynamodb:ConditionCheckItem` | 4 つ（新しい文 1 つ） |
| `ChoreTypes` | （なし） | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:ConditionCheckItem` | 3 つ（新しい文 1 つ） |

既存の `line` の権限（変えない）:

| テーブル / 資源 | アクション |
|---------------|-----------|
| `Users` テーブル | `GetItem`、`PutItem`、`UpdateItem` |
| `Users` の `lineUserId-index` | `Query` |
| `ProcessedLineEvents` | `GetItem`、`PutItem`、`UpdateItem`、`DeleteItem` |
| `NotificationGroups` | `GetItem`、`PutItem`、`DeleteItem` |
| `Families` | `GetItem`、`UpdateItem` |
| SSM `line/*`、`cloudfront/*` | `ssm:GetParameter`、`ssm:GetParameters` |

**足さないもの（NFR4.64）**: `Calendar` と `ChoreTypes` への `PutItem`、`DeleteItem`、`BatchGetItem`、`BatchWriteItem`、`Scan`、`dynamodb:*`。`Users` の `familyId-index` の Query。`jwt/*` の SSM パラメータ。`line` の既存の権限は増やさない。`api` のロールは U6 で変えない。

### `app-stack.ts` の変更イメージ（設計の説明用）

```ts
// U6: line の Lambda に CALENDAR_TABLE と CHORE_TYPES_TABLE を追加
// （createFunction の environment に足す）
// CALENDAR_TABLE: props.calendar.tableName
// CHORE_TYPES_TABLE: props.choreTypes.tableName

// U6: line の Calendar への権限（新しい文 1 つ）
this.lineFunction.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
      'dynamodb:ConditionCheckItem',
    ],
    resources: [props.calendar.tableArn],
    // 索引の ARN は含めない（Calendar に索引はない。NFR4.64）
  }),
);

// U6: line の ChoreTypes への権限（新しい文 1 つ）
this.lineFunction.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:ConditionCheckItem',
    ],
    resources: [props.choreTypes.tableArn],
  }),
);
```

これは設計の説明用のイメージ（≤15 行）で、完成したコードはコード生成で作ります。

### `dynamoClient.ts` のコメント変更

`tables.calendar()` と `tables.choreTypes()` のコメント（「画面用の Lambda だけが持つ」）を、「`line` も持つ（U6）」に直します（関数の中身は変えない）。アプリコードの変更なので、Infrastructure Design の成果物には含まれません。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Calendar` テーブル（U5 の持ち物） | U5 | U6（記録）、U7（状態の変更・月の確定）、U8（代わりにやる）、U9（読むだけ）、U10 | U6 は `UpdateItem` と `ConditionCheckItem` だけ（`PutItem`・`DeleteItem` なし）。記録は `recordingService.ts`（C8 の窓口）を通す |
| `ChoreTypes` テーブル（U4 の持ち物） | U4 | U5（`ConditionCheckItem`）、U6（`GetItem`・`Query`・`ConditionCheckItem`） | U6 は `ChoreTypes` を**読むだけ**（書かない）。種類の名前の取得と単価の確かめに使う |

## 費用の見込み

| サービス | U6 の増分（月） | 無料枠 | 見込み |
|---------|---------------|--------|--------|
| DynamoDB（書き込み、オンデマンド） | 約 3,600 ユニット（`scalability-design.md`。取引は 2 倍で数え ConditionCheck も含む） | 対象外（従量） | 約 0.003 ドル（約 0.5 円） |
| DynamoDB（読み取り、オンデマンド） | 約 3,300 ユニット | 対象外（従量） | 約 0.0005 ドル |
| Lambda `line` の呼び出し増分 | 月約 720 回（`scalability-design.md`） | 月 100 万回 | **月 0 円**（無料枠の 0.1% 未満） |
| LINE の reply | 無料（reply は月 200 通の課金対象外） | — | 0 円 |
| 新しい有料のサービス | なし | — | なし |

- 合計（U5 と合わせた 1 環境の月の増分）: 約 0.003 ドル（約 0.5 円）。U5 の見込みの 2 倍に届かない小さな量。月 1 円未満
- **U5 の最初の請求の確認**（`cicd-pipeline.md`）に、U6 の増分を含めて見ます。U6 だけを切り出して確かめる手順は不要です
- オンデマンドの読み書きは無料枠の対象外です（U5 の説明のとおり）

## 本番のデータの決まりとの関係

| 決まりの守り方 | 内容 |
|---------------|------|
| 書く経路を最小にする | `Calendar` への `PutItem` と `DeleteItem` を `line` に付けない。担当を作る・消すのは引き続き `api`（U5）だけ |
| 秘密を含まない | `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` はテーブル名のみ。SSM や GitHub Variables に新しい値は足さない |
| リッチメニューは設定の操作 | Lambda の起動中にリッチメニューの API を呼ばない（NFR1.28）。設定スクリプトは Calendar にも ChoreTypes にも触れない |
| 戻す手順が安全 | 前の版に戻して反映すると `line` の環境変数と権限が消える。`Calendar` の記録済みデータは壊れない（項目の形は U5 のまま） |

## Sources

- `construction/u6-recording/nfr-design/logical-components.md`（Infrastructure Design へ渡すこと）
- `construction/u6-recording/functional-design/functional-spec.md`（C3 postback、C8 の操作、line の Lambda の入口の変更範囲）
- `inception/domain-design/components.md`（コンポーネントの所有境界と line の Lambda の役割）
- `construction/u6-recording/nfr-design/security-design.md`（NFR4.63、NFR4.64、権限）
- `construction/u6-recording/nfr-design/scalability-design.md`（費用、読み書きの量）
- `construction/u6-recording/nfr-design/reliability-design.md`（取引の形、ConditionCheck）
- `construction/u5-assignment-calendar/infrastructure-design/infrastructure-specification.md`（形の手本、Calendar の共有、本番のデータの決まり）
- `infrastructure/lib/app-stack.ts`、`data-stack.ts`、`app.ts`（既存の作りと権限）

## Assumptions & Open Questions

- [assumption] `app-stack.ts` の `createFunction('Line', 'line', props, { ... })` の environment オブジェクトに `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` を追加します。既存の `api` の environment には `CALENDAR_TABLE` がすでにあります（U5）ので、`line` への追加だけです
- [assumption] `ChoreTypes` の索引（`line` が使わない）は足しません。`line` が `choreTypeService.list` で読む `ChoreTypes` の Query はテーブル本体への Query で、U4 の `api` と同じ許可の形です
- 追加の質問はありません
