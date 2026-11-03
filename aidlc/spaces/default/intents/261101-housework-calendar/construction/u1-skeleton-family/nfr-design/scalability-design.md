# 量と費用の設計（Scalability Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の量と費用の要件（`nfr-requirements/scalability-requirements.md`）をどう作るかです。

## DynamoDB のテーブルの形 [Q1]

テーブルを種類ごとに分けます（User、Family、ProcessedLineEvent。あとの単位でも新しいテーブルを足します）。

| テーブル | パーティションキー | 並べ替えキー | 主な項目 | TTL | インデックス |
|---------|--------------|----------|---------|-----|-----------|
| `Users` | `userId` (S) | — | `lineUserId`、`displayName`、`friendStatus`、`familyId`、`role`、`registeredAt` | なし | GSI: `lineUserId` でユーザーを探す（Webhook で使う） |
| `Families` | `familyId` (S) | — | `name`、`adminUserId`、`createdAt` | なし | — |
| `ProcessedLineEvents` | `webhookEventId` (S) | — | `status`（processing \| done）、`receivedAt`、`expiresAt` | `expiresAt`（7 日） |
| `RequestRecords` | `userId` (S) | `idempotencyKey` (S) | `operation`、`result`、`expiresAt` | `expiresAt`（24 時間） |

テーブルを分ける利点：
- アクセスパターンがシンプルで、ソートキーの設計が不要
- テーブルごとに IAM の権限を絞れる
- あとの単位でテーブルを追加しやすい

テーブルの容量モードはオンデマンドにする（費用の無料枠に収まり、量が増えても設定不要）。

## 同時に動ける数の上限（NFR1.6）

Lambda の予約された同時実行数（Provisioned Concurrency ではなく Reserved Concurrency）を小さく置く。

| Lambda | 上限の初期値 | 変える基準 |
|--------|----------|----------|
| 画面用 API | 5 | 大量の不正な要求の量を見て調整 |
| LINE 用 | 5 | 同上 |

注意: AWS アカウントの同時実行数の枠（デフォルト 1000）の確認と、ステージングと本番に合わせた設定は、U1 を配備するときに確かめる。上限に達すると利用者も断られる（費用 0 円と使えることの引き換えとして受け入れ済み）。

## 費用の知らせ（NFR1.7）

AWS Budgets（月 1 つまで無料）で月の費用の見込みが 1 ドルを超えたら、AWS の連絡先メールに知らせる CDK リソースを作る。

## CloudFront + S3 の画面の配信（NFR1.1）

- S3 のバケットに React のビルド済みのファイルを入れ、CloudFront から配信する
- CloudFront のキャッシュで、同じファイルへの要求が S3 に届かない

## Sources

- `nfr-requirements/scalability-requirements.md`（NFR1.1〜NFR1.7、NFR3.1〜NFR3.2）
- `construction/u1-skeleton-family/functional-design/entities.md`（User、Family、ProcessedLineEvent、RequestRecord）
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- テーブルを分ける設計ではあとの単位でテーブルが増えていく。U2〜U11 でそれぞれ必要なテーブルを追加する
- [assumption] AWS アカウントの同時実行数の枠は 1000。ステージングと本番を同じアカウントに入れる場合は、4 つの Lambda 分の予約（計 20）で問題ない見込み。U1 の配備のときに枠を確かめる
