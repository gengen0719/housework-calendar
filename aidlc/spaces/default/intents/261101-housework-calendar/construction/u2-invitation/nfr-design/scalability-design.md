# 量と費用の設計（Scalability Design）— U2 招待

U2（`u2-invitation`）の量と費用の要件（NFR1.8〜NFR1.11、NFR3.3）を、どう作るかを書きます。U1 の設計（オンデマンドの DynamoDB、同時実行数の上限 画面用 5・LINE 用 5、Budgets）はそのまま使います。

## テーブルの形 [Q1、Q2]

| テーブル | キー | 索引 | TTL | U2 での変更 |
|---------|------|------|-----|------------|
| `Invitations`（新しく作る） | パーティションキー `token`（文字列） | なし | `ttl`（期限 + 7 日、エポック秒）（NFR1.8） | 新しく作る [Q1] |
| `Families` | `familyId` | なし | なし | 項目 `currentInvitationToken`、`currentInvitationId` を足す（スキーマの変更はいらない） |
| `Users` | `userId` | `lineUserId-index`（U1）、`familyId-index`（新しく足す） | なし | GSI を足す。項目 `familyJoinedAt` を足す [Q2] |
| `RequestRecords` | `userId` + `idempotencyKey` | なし | 24 時間（U1） | 項目 `operation`、`target` を足す（NFR4.22） |

- `familyId-index` はパーティションキー `familyId`、射影は `KEYS_ONLY` ではなく `INCLUDE`（`displayName`、`role`、`familyJoinedAt`）にし、一覧を索引だけで読む
- 家族に入っていない利用者は `familyId` を持たないので、索引に入らない（索引の量が増えない）
- GSI の読み取りは結果整合で、参加や家族の作成の直後は本人がまだ出ないことがある。そのため一覧の処理は、索引の結果にセッションの利用者が含まれていなければ、Users を強い整合性で読んで足してから並べる（レビュー R-04）
- `familyJoinedAt` がない利用者（U2 より前に家族を作った人）は、読み取りの側で家族の `createdAt` とみなして並べる。ステージングのデータは手で直さない（NFR6）
- すべてオンデマンド。テーブルと GSI の追加は、DynamoDB の無料枠（25 GB）の中に収まる

## 読み書きの量の見込み

| 操作 | 読み書き |
|------|---------|
| メンバーの一覧 | GSI の Query 1 回（4 人分） |
| いまの招待を見る | Families の GetItem 1 回 + Invitations の GetItem 1 回 |
| 招待を作る | 読み取り 2 回 + TransactWriteItems（Families の更新、新しい招待の Put、前の招待の Update（あれば）、RequestRecords の Put）= 3〜4 件 |
| 招待を開く | Invitations と Families の GetItem 各 1 回 + Users の GetItem 1 回 |
| 参加する | 上の読み取り + RequestRecords の GetItem + TransactWriteItems（Users の更新、Invitations と Families の ConditionCheck、RequestRecords の Put）= 4 件 |

家族 4 人で招待は数回なので、とても小さい量です。

## 費用と、濫用されたときの止め方（レビュー R-03）

- DynamoDB のオンデマンドには、読み書きの回数の無料枠はありません（無料なのは保存の 25 GB）。読み書きは回数に応じた従量の課金で、家族 4 人の量では月 1 円に満たない見込みです（U1 で受け入れた前提）
- 友だち登録した人が使えない印を送り続けると、Lambda の無料枠（月 100 万回）と DynamoDB の読み取りの課金が増えます。同時実行数 5 で 1 回 50 ミリ秒なら 1 日に最大約 864 万回（2^23 回）です
- 濫用への備えは次のとおりです
  1. 使えない印の数のメトリクス（`observability-design.md`）で気づく
  2. U1 の AWS Budgets（月 1 ドル超えで知らせる）で費用に気づく
  3. 止め方: 画面用の Lambda の予約された同時実行数を、AWS CLI（`aws lambda put-function-concurrency`）で 0 にする。GitHub の Variable `RESERVED_CONCURRENCY` は 0 を受け付けず、`line` にも効くので使わない（`infrastructure-design/infrastructure-specification.md`）。手順を README に書く
- 印の強さの見積もり（NFR4.17）も 2^23 回に直す。当たる見込みは 2^23 ÷ 2^128 = 2^-105 で、結論は変わらない

## Lambda

- U2 の処理は U1 の画面用の Lambda（`entries/api.ts`）に足す。新しい Lambda は作らない（NFR3.3）
- 同時実行数の上限は U1 の画面用 5 のまま
- 「LINE で送る」は画面だけで動き、裏側を呼ばない（NFR1.10）

## Sources

- `construction/u2-invitation/nfr-requirements/scalability-requirements.md`
- `construction/u1-skeleton-family/nfr-design/scalability-design.md`
- `infrastructure/lib/data-stack.ts`（いまのテーブル）
- `nfr-design-questions.md` の回答 [Q1]、[Q2]

## Assumptions & Open Questions

- TTL の属性名は、U1 のテーブルが `expiresAt` を TTL に使っています。Invitations では、画面に出す期限（ISO の時刻）と TTL（期限 + 7 日のエポック秒）が違う値なので、別の属性 `ttl` にします
- [assumption] 既存の Users テーブルに GSI を足すと、既存の項目の索引づくり（バックフィル）が自動で行われます。ステージングのデータは数件なので、時間はかかりません
