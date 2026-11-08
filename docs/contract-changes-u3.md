# U3 で足した契約の一覧

U3（`u3-notification-group`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したもの、形を変えたものです。項目・操作・理由の印を足すのは契約の決まりで自由です。`contract-summary.md` への反映を待つ一覧として、`docs/contract-changes-u1.md`、`docs/contract-changes-u2.md` に続けて残します。

## C1 画面用 API

| 操作                                | 足したもの   | 中身                                                                                                                                     |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/family/notification-group` | 操作（新規） | 家族のメンバー。200 `{ "groupName": string \| null, "registeredAt": string } \| null`（グループ ID は返さない）、403 `NOT_FAMILY_MEMBER` |

## C3 LINE の Webhook

| イベント・扱い | 足したもの | 中身                                                                                                                                                 |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| join           | 扱い       | `source.type` が group のときだけ、ボタンつきの案内を reply。room は何もしない                                                                       |
| leave          | イベント   | 新しく扱う。お知らせ先のグループなら解除する（`unregisterNotificationGroupByGroup`）。返事はしない                                                   |
| postback       | data       | `action=group.register`（グループのボタン）。知らない data、300 文字を超える data は何もしない                                                       |
| message        | 言葉       | グループで「登録」（前後の空白を除いてちょうど同じ）。1 対 1 の「登録」はグループで行うよう案内。5000 文字を超える本文は、そのイベントだけ何もしない |

- 登録の操作でないグループの会話は、二度処理しない記録も書かず、返事もしない（`LINE_EVENT_IGNORED`）
- 署名のない join・leave・postback・message は、U1 と同じく 401

## C4 LINE の API

| 使う API           | 中身                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| グループの概要     | グループの名前を登録のときに 1 回だけ取る。2 秒で打ち切り、失敗しても名前なしで続ける |
| グループでの reply | ボタンつきの案内と、登録・断りの返事                                                  |

## C6 家族とメンバーの窓口

| 窓口                                                                     | 中身                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `registerNotificationGroup(ctx, groupId, now)`（形を変える）             | `{ familyName }` / `ADMIN_ONLY` / `GROUP_USED_BY_OTHER_FAMILY`。契約の `(ctx, groupId): void \| ADMIN_ONLY` から、結果を足した |
| `getNotificationGroupView(ctx)`（新規）                                  | `NotificationGroupView` / `NOTIFICATION_GROUP_NOT_REGISTERED`（画面用）                                                        |
| `unregisterNotificationGroupByGroup(groupId, eventTimestampMs?)`（新規） | leave で使う。家族はグループの記録から決まる。登録より前の時刻の leave は何もしない                                            |
| `findFamilyByGroup(groupId)`（新規）                                     | `{ familyId }` / `GROUP_NOT_REGISTERED`（強い整合性で読む）                                                                    |
| `getNotificationGroup(ctx)`                                              | 契約のまま（U10 が push の宛先に使う）                                                                                         |

### 形を変える変更: `registerNotificationGroup`

- 機能設計の段階では `(ctx, groupId, groupName)` と決めたが、実装は **`(ctx, groupId, now)`** にした。グループの名前は窓口の中で LINE から受け取る（2 秒で打ち切り）。理由は、LINE を呼ぶ前に「別の家族のグループか」を強い整合性で読んで断る順番を守るため（別の家族のグループには LINE を呼ばない）
- 呼ぶ側は U3 の `groupCommandGate.runRegister` だけ。U3 より前にこの窓口を呼ぶ単位はなく、同じ変更の中で直してある

### U8 向けの入口: `groupCommandGate.runGroupOperation`

- `runGroupOperation(groupId, lineUserId, operation)`: グループの家族を決め、`source.userId` の利用者が友だちでその家族のメンバーのときだけ、`ctx = { familyId, userId, role }` で `operation` を呼ぶ
- 登録されていないグループは `GROUP_NOT_REGISTERED`、メンバーでない人・ブロック中の人は `NOT_FAMILY_MEMBER` で断る。断るときの文言は決まった文だけで、家族の情報を入れない
- U8 の「代わって」の操作は、この入口を通して呼ぶ。`source.type` が group かどうかの確かめは呼ぶ側

## C10 理由の印と文言

| 印または文言                        | 文言                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `GROUP_USED_BY_OTHER_FAMILY`        | 理由の印（このグループはほかの家族のお知らせ先になっています）                             |
| `NOTIFICATION_GROUP_ADMIN_ONLY`     | お知らせ先を登録できるのは管理者だけです（LINE の返事。子供を断る印は U1 の `ADMIN_ONLY`） |
| `GROUP_NOT_REGISTERED`              | このグループは家族のお知らせ先として登録されていません                                     |
| `NOTIFICATION_GROUP_NOT_REGISTERED` | お知らせ先のグループが登録されていません                                                   |
| `NOTIFICATION_GROUP_REGISTERED`     | 登録の返事。家族の名前が入る                                                               |
| `GROUP_JOIN_GUIDE`                  | 参加のあいさつ                                                                             |
| `GROUP_REGISTER_BUTTON`             | このグループをお知らせ先にする                                                             |
| `NOTIFICATION_GROUP_HOWTO`          | 画面の手順                                                                                 |
| `GROUP_REGISTER_IN_GROUP_ONLY`      | お知らせ先の登録は、家族のグループ LINE の中で行ってください                               |

## データと共有の型（決めごと）

- DynamoDB: `NotificationGroups`（PK `groupId`、TTL なし）。`Families` に `notificationGroupId` の項目を足す（キーと設定は変えない）
- `packages/shared`: `NotificationGroupView { groupName: string | null, registeredAt: string }`
- 環境変数: `line` と `api` に `NOTIFICATION_GROUPS_TABLE`、`line` に `FAMILIES_TABLE`

## 要件への反映を待つもの

- **FR1.5**: 「公式アカウントがお知らせ先のグループから外されたら、お知らせ先の登録を外す（解除する）」を足す。U3 は BR4.9 として実装済みで、要件（`inception/requirements-analysis/requirements.md`）にはまだ書かれていない
