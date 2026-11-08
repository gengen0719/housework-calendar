# インフラの仕様（Infrastructure Specification）— U4 お手伝いの種類

U4（`u4-chore-types`）で、U1〜U3 の構成に足す・変える AWS の資源です。新しいスタック・Lambda・有料サービス・秘密の情報は足しません。U2・U3 と同じ形の追加なので、この段階では人に聞くことはありませんでした（反映後の確かめは U2 の [Q1] の答えと同じ形にします）。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の Lambda `api` に処理を足す。`line` は変えない | NFR1.16、NFR3.5 |
| 入口 | 変更なし。CloudFront の `/v1/*` は `AllowedMethods.ALLOW_ALL` で、PUT・PATCH・DELETE も通る | U4 で初めて PUT・PATCH・DELETE を使う（NFR 要件のレビュー R-07） |
| 保存 | `Housework-<env>-Data` に DynamoDB テーブル `ChoreTypes`（PK `familyId`、SK `sk`）を足す | `nfr-design/scalability-design.md`（案 A） |
| 環境 | ステージングと本番の両方に同じ変更 | U1 のとおり |
| IaC | `infrastructure/lib/data-stack.ts`、`app-stack.ts`、`app.ts` を変える | U1 のとおり |
| 大きさ | 変更なし（256 MB、30 秒、予約 5） | U4 の処理は軽い |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `ChoreTypes`（新しく作る） | database | オンデマンド、PK `familyId`（文字列）、SK `sk`（文字列）、TTL なし、暗号化 `AWS_MANAGED`、`tableName` は指定しない | 本番は `RemovalPolicy.RETAIN`、ステージングは `DESTROY`（NFR6.5） |
| CloudFront | cdn | 変更なし（`/v1/*` は全メソッドを通し、秘密のヘッダー `X-Origin-Verify` を付ける） | ステージングで PUT・PATCH・DELETE を確かめる（`cicd-pipeline.md`） |

### Lambda のロールの権限（変える）

コードが使う操作だけを `addToRolePolicy` で許可します（U2・U3 と同じ）。

| ロール | 資源 | 足す操作 |
|--------|------|---------|
| `api` | `ChoreTypes` のテーブル | `dynamodb:GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem` |
| `api` | `RequestRecords` のテーブル | 変更なし（GetItem、PutItem） |
| `line` | — | 変更なし。`ChoreTypes` には届かない |

- U4 は TransactWriteItems の中で ConditionCheck を使わない（条件は Put・Update・Delete に付ける）ので、`ConditionCheckItem` は足さない。U5 で割り当ての保存に種類の ConditionCheck を入れるときに、U5 で足す
- `Query` は `ChoreTypes` のテーブル本体だけ（索引はない）
- `AppStackProps` に `choreTypes: dynamodb.Table` を足し、`api` の環境変数に `CHORE_TYPES_TABLE` を足す
- CDK のテスト（`infrastructure/test/u4-chore-types/`）で、`api` の `ChoreTypes` の許可が上の 5 つだけで `Scan`・`ConditionCheckItem` がないこと、`line` に `ChoreTypes` の許可がないことを確かめる

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `ChoreTypes` テーブル | U4（お手伝いの種類の部品。`inception/domain-design/components.md` の Entity Ownership） | U5（割り当て。C7 `list`、ConditionCheck）、U6・U7（記録の単価。C7 `getCurrentUnitPrice`）、U9（お小遣いの内訳の名前） | ほかの部品は C7 の窓口を通して使う。U5 の ConditionCheck だけは、割り当ての保存のトランザクションに入れるため、U5 で `api` のロールに `ConditionCheckItem` を足す |

## 費用の見込み

| サービス | 家族 4 人の 1 か月の量（U4 の分） | 無料枠 | 見込み |
|---------|-----------------------------|--------|--------|
| DynamoDB（保存） | 数十件 | 25 GB | 0 円 |
| DynamoDB（読み書き、オンデマンド） | 数十回 | なし（従量） | 1 円未満 |
| Lambda | 数十回 | 月 100 万回 | 0 円 |

ステージングと本番の両方に同じテーブルができますが、どちらもオンデマンドで量が小さいため、2 つの環境の合計でも 1 円未満です（レビュー R-05）。

## Sources

- `construction/u4-chore-types/nfr-design/scalability-design.md`、`security-design.md`、`reliability-design.md`、`logical-components.md`
- `construction/u4-chore-types/functional-design/functional-spec.md`（U4 で作る画面用 API の 5 つの操作）
- `inception/domain-design/components.md`（お手伝いの種類の部品）
- `construction/u3-notification-group/infrastructure-design/infrastructure-specification.md`
- `infrastructure/lib/app-stack.ts`（CloudFront の `AllowedMethods.ALLOW_ALL`）

## Assumptions & Open Questions

- なし
