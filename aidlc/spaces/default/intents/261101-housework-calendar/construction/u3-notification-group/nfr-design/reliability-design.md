# 信頼性の設計（Reliability Design）— U3 お知らせ先

U3（`u3-notification-group`）の信頼性の要件（NFR2.16〜NFR2.20、NFR6.4、NFR11.2）を、どう作るかを書きます。U2 の作り（条件つきの TransactWriteItems、`CancellationReasons` の読み分け、競合だけ 1 回やり直す、ほかの Code は投げ直す）をそのまま使います。

## 登録・登録し直し（NFR2.16、NFR2.18、BR4.5〜BR4.7）[Q1]

1. `NotificationGroups` を `groupId` で強い整合性で読む
   - 別の家族の記録なら `GROUP_USED_BY_OTHER_FAMILY`（書かない）
   - 同じ家族の記録なら、何も書かずに登録できたときと同じ結果を返す（何度押しても同じ）
2. `Families` を強い整合性で読み、いまの `notificationGroupId`（なければ空）を覚える。値があれば、そのグループの `NotificationGroups` の記録も強い整合性で読み、この家族の記録が実在するときだけ、4 の前のグループの Delete を入れる。記録がない（前の版に戻してテーブルが新しくなった、など）か別の家族の記録なら、Delete は入れず、Families の条件は覚えた値のままにする（インフラ設計のレビュー R-01）
3. LINE からグループの名前を受け取る（2 秒で打ち切り。失敗しても名前なしで続ける。NFR2.19）
4. TransactWriteItems で次を一緒に書く（前のお知らせ先があれば 3 件、なければ 2 件）
   - `NotificationGroups` の Put（新しいグループ）: 条件は「`attribute_not_exists(groupId)` または `familyId = :myFamily`」
   - `Families` の Update: `notificationGroupId` を新しいグループにする。条件は「`attribute_exists(familyId)`」かつ「`notificationGroupId` が 2 で覚えた値と同じ（なければ属性がない）」（ない家族の記録を作らない。レビュー R-06）
   - `NotificationGroups` の Delete（前のグループ。2 で値があったときだけ）: 条件は「`familyId = :myFamily`」
5. 断られたら（`TransactionCanceledException`）、`CancellationReasons` の並びで見る
   - 新しいグループの Put の `ConditionalCheckFailed` → 1 から読み直す（別の家族なら `GROUP_USED_BY_OTHER_FAMILY`）
   - Families または前のグループの `ConditionalCheckFailed`、または `TransactionConflict` だけ → 1 から 1 回だけやり直す
   - ほかの Code → 投げ直す（思いがけない失敗）
   - やり直しても断られたら、「表示できませんでした。もう一度お試しください」を reply する（500 にはしない。reply トークンを使うため）
6. 成功したら、`NOTIFICATION_GROUP_REGISTERED` の文言（家族の名前を入れる）を reply する。reply が失敗しても、登録は取り消さずに warn でログに残す（NFR2.20）

## 解除（NFR2.17、NFR2.18、BR4.9）

1. leave イベントの `groupId` で `NotificationGroups` を強い整合性で読む。なければ何もしない。記録の `registeredAt` が leave イベントの `timestamp`（LINE がイベントに付ける時刻）より後なら、古い leave（500 で送り直されたものなど）が登録し直しのあとに届いたとみなし、何もしない（レビュー R-02）
2. TransactWriteItems で次を一緒に書く
   - `NotificationGroups` の Delete: 条件は「`familyId = :thatFamily`」
   - `Families` の Update: `notificationGroupId` を消す。条件は「`notificationGroupId = :groupId`」
3. 断られたら、`ConditionalCheckFailed` か `TransactionConflict` だけなら 1 から 1 回だけやり直す（そのときお知らせ先でなくなっていれば何もしない）。ほかの Code、またはやり直しても断られたら投げ直し、500 を返して LINE に送り直してもらう（U1 の NFR2.2）

## 時刻（NFR11.2）

- `registeredAt` は ISO 8601 の UTC。画面は U2 の `formatExpiry` と同じく `Asia/Tokyo` で出す（家族の設定では日付だけ）

## データ（NFR6.4）

- `NotificationGroups` も、本番では `RemovalPolicy.RETAIN`（U1 の NFR6.2）
- お知らせ先のデータは、アプリの操作（登録、公式アカウントを外す）でだけ変わる

## 筋書きにする競合と失敗（NFR8.6）

- 2 つの家族の管理者が同じグループで同時に登録すると、先の 1 つだけが登録され、もう一方は「ほかの家族のお知らせ先になっています」
- 同じ家族の管理者が 2 つのグループで同時に登録すると、家族のお知らせ先は 1 つだけになり、どの家族のものでもない記録は残らない
- 登録し直しと、前のグループからの leave が重なっても、家族のお知らせ先は新しいグループのまま
- グループの名前を受け取れなくても登録でき、画面は「登録済み」
- reply が失敗しても、登録は残る
- 解除のトランザクションが思いがけない Code で断られたら 500

## Sources

- `construction/u3-notification-group/nfr-requirements/reliability-requirements.md`
- `construction/u3-notification-group/functional-design/rules.md`（BR4.5〜BR4.9）
- `construction/u2-invitation/nfr-design/reliability-design.md`、`construction/u2-invitation/code-generation/code-summary.md`（レビューの直しの R-01、R-02）
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- [assumption] TransactWriteItems の条件に `OR` を使えます（DynamoDB の条件式の決まり）
