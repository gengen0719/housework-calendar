# インフラの仕様（Infrastructure Specification）— U3 お知らせ先

U3（`u3-notification-group`）で、U1・U2 の構成（`construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md`、`construction/u2-invitation/infrastructure-design/infrastructure-specification.md`）に足す・変える AWS の資源です。新しいスタック・Lambda・有料サービス・秘密の情報は足しません。U2 と同じ形の変更なので、この段階では質問をしていません（反映後の確かめは U2 の [Q1] の答えと同じ形にします）。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の Lambda `line`（join、leave、message、postback）と `api`（`GET /v1/family/notification-group`）に処理を足す | NFR1.14。新しい関数は作らない（U1 の Shared Infrastructure） |
| 入口 | 変更なし。`/line/webhook` と `/v1/*` の振り分けのまま | 新しい道はいらない |
| ネットワーク | 変更なし（VPC なし）。`line` は LINE のグループの概要の API を HTTPS で呼ぶ | U1 のとおり |
| 保存 | `Housework-<env>-Data` に DynamoDB テーブル `NotificationGroups` を足す。`Families` は項目を足すだけ | `nfr-design/scalability-design.md` [Q1] |
| 環境 | ステージングと本番の両方に同じ変更 | U1 のとおり（NFR10.2） |
| IaC | `infrastructure/lib/data-stack.ts`、`app-stack.ts`、`app.ts` を変える | U1 のとおり |
| 大きさ | 変更なし（256 MB、30 秒、予約 5） | U3 の処理は軽い |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `NotificationGroups`（新しく作る） | database | オンデマンド、PK `groupId`（文字列）、TTL なし、暗号化 `AWS_MANAGED`、`tableName` は指定しない | 本番は `RemovalPolicy.RETAIN`、ステージングは `DESTROY`（U1・U2 と同じ）（NFR6.4） |
| DynamoDB `Families` | database | 変更なし（項目 `notificationGroupId` を足すだけ） | キーと設定は変えない |
| LINE 公式アカウント（AWS の外） | 外部の設定 | ステージングと本番の両方の公式アカウントで、LINE Official Account Manager の「グループ・複数人チャットへの参加を許可する」を有効にする（手で設定） | NFR10.4。手順は README（`cicd-pipeline.md`） |

### Lambda のロールの権限（変える）

U2 と同じく、コードが使う操作だけを `addToRolePolicy` で許可します。

| ロール | 資源 | 足す操作 |
|--------|------|---------|
| `line` | `NotificationGroups` のテーブル（新しい） | `dynamodb:GetItem`、`PutItem`、`DeleteItem` |
| `line` | `Families` のテーブル | `dynamodb:GetItem`、`UpdateItem`（いまは許可なし） |
| `api` | `NotificationGroups` のテーブル | `dynamodb:GetItem` |
| `api` | — | ほかは変更なし（`Families` の GetItem は U1 からある） |

- TransactWriteItems は、中の項目ごとの操作（Put は `PutItem`、Update は `UpdateItem`、Delete は `DeleteItem`）の許可で確かめられる
- `line` には `Invitations` と `RequestRecords` の許可を足さない（使わない）
- `AppStackProps` に `notificationGroups: dynamodb.Table` を足し、`line` と `api` の環境変数に `NOTIFICATION_GROUPS_TABLE`、`line` の環境変数に `FAMILIES_TABLE` を足す
- U3 は TransactWriteItems の中で ConditionCheck を使わない（条件は Put・Update・Delete に付ける）ので、`dynamodb:ConditionCheckItem` は足さない（レビュー R-05）
- CDK のテスト（`infrastructure/test/u3-notification-group/`）で、次を確かめる（レビュー R-06）
  - `line` の `NotificationGroups` の許可が GetItem・PutItem・DeleteItem だけで、UpdateItem・Query・Scan がない
  - `line` の `Families` の許可が GetItem・UpdateItem だけで、PutItem・DeleteItem がない
  - `line` に `Invitations` と `RequestRecords` の許可がない
  - `api` の `NotificationGroups` の許可が GetItem だけ

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `NotificationGroups` テーブル | U3（家族とメンバーの部品） | U8（グループの操作の入口）、U10（お知らせの宛先。C6 `getNotificationGroup` を通す） | 家族とメンバーの部品のコードだけが使う |
| グループの操作の入口（`services/groupCommandGate.ts`） | U3 | U8 | U8 の操作はこの入口を通して呼ぶ |

## 費用の見込み

| サービス | 家族 4 人の 1 か月の量（U3 の分） | 無料枠 | 見込み |
|---------|-----------------------------|--------|--------|
| DynamoDB（保存） | 1 件 | 25 GB | 0 円 |
| DynamoDB（読み書き、オンデマンド） | 数回（ただの会話では書かない。`nfr-design/security-design.md` の打ち切り） | なし（従量） | 1 円未満 |
| Lambda | 家族の会話の数（1 日に数十回） | 月 100 万回 | 0 円 |
| LINE の reply、グループの概要 | 数回 | 無料（メッセージ数に数えない） | 0 円 |

## Sources

- `construction/u3-notification-group/nfr-design/scalability-design.md`、`security-design.md`、`logical-components.md`
- `construction/u2-invitation/infrastructure-design/infrastructure-specification.md`
- `infrastructure/lib/app-stack.ts`（いまの `line` と `api` の権限）
- `inception/domain-design/components.md`（家族とメンバーの部品が `NotificationGroups` を持つ）
- `construction/u3-notification-group/functional-design/functional-spec.md`（U3 で作る操作: join、leave、登録、`GET /v1/family/notification-group`）

## Assumptions & Open Questions

- [assumption] グループへの参加を許可する設定は、LINE Official Account Manager で公式アカウントごとに行います。画面の場所は B3 の反映の前に作り手が確かめます（レビュー R-03）
