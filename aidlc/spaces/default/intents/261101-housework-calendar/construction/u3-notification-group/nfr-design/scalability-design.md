# 量と費用の設計（Scalability Design）— U3 お知らせ先

U3（`u3-notification-group`）の量と費用の要件（NFR1.12〜NFR1.15、NFR3.4）を、どう作るかを書きます。U1・U2 の設計（オンデマンドの DynamoDB、同時実行数の上限 5、Budgets、濫用されたときの止め方）はそのまま使います。

## テーブルの形 [Q1]

| テーブル | キー | 索引 | TTL | U3 での変更 |
|---------|------|------|-----|------------|
| `NotificationGroups`（新しく作る） | パーティションキー `groupId`（文字列） | なし | なし | 新しく作る。項目は `familyId`、`groupName`、`registeredByUserId`、`registeredAt` |
| `Families` | `familyId` | なし | なし | 項目 `notificationGroupId` を足す（スキーマの変更はいらない） |

- 家族からは `Families.notificationGroupId` → `NotificationGroups` の GetItem で読む（索引はいらない）
- グループからは `NotificationGroups` の GetItem で読む
- オンデマンド。保存は数件で、無料枠（25 GB）の中

## 読み書きの量の見込み

| 操作 | 読み書き |
|------|---------|
| 参加の案内 | 読み書きなし（U1 の二度処理しない記録だけ）+ reply 1 回 |
| 登録 | 読み取り 2〜3 回 + LINE のグループの概要 1 回 + TransactWriteItems 2〜3 件 + reply 1 回 |
| 解除 | 読み取り 1 回 + TransactWriteItems 2 件 |
| 画面で見る | Families と NotificationGroups の GetItem 各 1 回 |
| ただの会話 | 読み書きなし（二度処理しない記録の前に打ち切る。返事なし。レビュー R-01） |

## Lambda

- U3 の LINE のイベントは U1 の `line` の Lambda、画面の操作は `api` の Lambda に足す。新しい Lambda は作らない
- 返事は reply だけで、push の呼び出しはない（NFR1.12）

## Sources

- `construction/u3-notification-group/nfr-requirements/scalability-requirements.md`
- `construction/u2-invitation/nfr-design/scalability-design.md`
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- 費用の見込みは U2 と同じく、読み書きの従量の課金が月 1 円に満たない見込みです
