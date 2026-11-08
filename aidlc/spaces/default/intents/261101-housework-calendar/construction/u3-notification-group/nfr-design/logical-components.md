# 論理コンポーネント（Logical Components）— U3 お知らせ先

U3（`u3-notification-group`）で足す・変えるコードと構成の部品です。U1・U2 の構成に足します。

## 足す・変える部品

```
packages/
  shared/src/
    reasons.ts                        # 変える: GROUP_USED_BY_OTHER_FAMILY
    messages.ts                       # 変える: NOTIFICATION_GROUP_ADMIN_ONLY、GROUP_JOIN_GUIDE、GROUP_REGISTER_BUTTON、
                                      #         NOTIFICATION_GROUP_REGISTERED、NOTIFICATION_GROUP_HOWTO、GROUP_REGISTER_IN_GROUP_ONLY
    api-types.ts                      # 変える: NotificationGroupView
  backend/src/
    entries/line.ts                   # 変える: join、leave、message、postback を振り分け表に足す
    entries/api.ts                    # 変える: GET /v1/family/notification-group
    handlers/line/types.ts            # 変える: source.groupId、message、postback の項目
    handlers/line/joinHandler.ts      # 足す
    handlers/line/leaveHandler.ts     # 足す
    handlers/line/messageHandler.ts   # 足す
    handlers/line/postbackHandler.ts  # 足す
    handlers/line/groupCommand.ts     # 足す: parseGroupCommand
    handlers/family/getNotificationGroup.ts  # 足す
    services/groupCommandGate.ts      # 足す: グループの操作の入口（U8 も使う）
    services/familyMemberService.ts   # 変える: registerNotificationGroup、unregisterNotificationGroupByGroup、
                                      #         getNotificationGroup、getNotificationGroupView、findFamilyByGroup
    services/lineApiService.ts        # 変える: getGroupSummary（時間切れ 2 秒）、ボタンつきの reply
    repositories/notificationGroupRepository.ts  # 足す
    repositories/familyRepository.ts  # 変える: 登録し直しと解除のトランザクション
    lib/logger.ts                     # 変える: groupName、text、displayName を型で禁止
  frontend/src/
    pages/CalendarFramePage.tsx       # 変える: 管理者でお知らせ先がないときの表示と手順
    pages/FamilySettingsPage.tsx      # 変える: 「お知らせ先: （名前）」
    api/client.ts                     # 変える: GET /v1/family/notification-group
infrastructure/lib/
  data-stack.ts                       # 変える: NotificationGroups テーブル
  app-stack.ts                        # 変える: line と api のロールの許可、環境変数 NOTIFICATION_GROUPS_TABLE
```

## 障害の波及範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `NotificationGroups` テーブル | 登録・解除・画面のお知らせ先の表示ができない | 友だち登録、家族、招待 |
| LINE のグループの概要の取得 | グループの名前が空になる（登録はできる） | 登録そのもの |
| LINE の reply | 返事が届かない（登録は残る） | 登録の記録 |

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| イベントの振り分けと形（NFR4.27、NFR4.28） | `entries/line.ts`、`handlers/line/types.ts`、`groupCommand.ts` |
| グループの操作の入口（NFR4.29、NFR4.31） | `services/groupCommandGate.ts` |
| 1 グループ 1 家族、登録し直し、解除（NFR4.30、NFR2.16〜NFR2.18） | `familyRepository.ts`、`notificationGroupRepository.ts` |
| 画面用 API（NFR4.32、NFR4.33） | `handlers/family/getNotificationGroup.ts` |
| グループの名前の時間切れ（NFR7.14、NFR2.19） | `lineApiService.getGroupSummary` |
| ログ（NFR2.21〜NFR2.23、NFR5.8） | `lib/logger.ts`、各ハンドラー |
| テーブルと権限（NFR1.14、NFR6.4） | `data-stack.ts`、`app-stack.ts` |

## Sources

- `construction/u3-notification-group/nfr-requirements/*.md`
- `construction/u3-notification-group/functional-design/functional-spec.md`
- `construction/u2-invitation/nfr-design/logical-components.md`
- いまのコード（`packages/backend/src/entries/line.ts`、`services/lineApiService.ts`）
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- ファイルの分け方は目安で、コード生成の計画で決めます
- README に足すこと（NFR10.4 のグループへの参加を許可する設定、NFR10.5 の困ったとき）は、インフラ設計の `cicd-pipeline.md` に書き、コード生成で README に入れます（レビュー R-07）
- [assumption] グループの概要の取得（`GET /v2/bot/group/{groupId}/summary`）は、認証済みでない（未認証の）公式アカウントでも使えます。B3 でステージングで確かめ、使えなければ名前なしで登録する（NFR2.19）だけで動きます（レビュー R-08）
- U6 で 1 対 1 のトークの message を扱うとき、`messageHandler.ts` に振り分けを足します
