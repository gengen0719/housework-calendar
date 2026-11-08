# 信頼性の設計（Reliability Design）— U4 お手伝いの種類

U4（`u4-chore-types`）の信頼性の要件（NFR2.24〜NFR2.26、NFR6.5、NFR11.3）を、どう作るかを書きます。U2・U3 の作り（条件つきの TransactWriteItems、`CancellationReasons` の読み分け、`ConditionalCheckFailed` と `TransactionConflict` だけ 1 回やり直し、ほかの Code は投げ直す）をそのまま使います。

## 登録（NFR2.24、BR5.3、BR5.12）

1. 送り直しの記録を読む（U2 と同じ。同じなら前の結果、本文が違えば 422）
2. TransactWriteItems で次を一緒に書く
   - 種類の Put（`sk = TYPE#<新しい ID>`）: 条件 `attribute_not_exists(sk)`
   - 名前の印の Put（`sk = NAME#<名前>`、`choreTypeId`）: 条件 `attribute_not_exists(sk)`
   - 送り直しの記録の Put（U1）
3. 名前の印の条件で断られたら 409 `CHORE_TYPE_NAME_TAKEN`（`security-design.md` の文言の出し分け）。送り直しの記録の条件なら 1 に戻る。競合なら 1 回だけやり直す

## 変更（NFR2.24、BR5.3）

1. 種類を GetItem（強い整合性）
2. 名前が変わらないなら、種類の Update（条件 `attribute_exists(sk)` かつ `name = :oldName`）だけ。読んだあとに別の要求が名前を変えていたら条件で断られるので、1 から 1 回だけやり直す（名前の印とずれない。レビュー R-02）
3. 名前が変わるなら、TransactWriteItems で次を一緒に書く
   - 新しい名前の印の Put: 条件 `attribute_not_exists(sk)`
   - 古い名前の印の Delete: 条件 `choreTypeId = :id`
   - 種類の Update: 条件 `attribute_exists(sk)` かつ `name = :oldName`（読んでから変えるまでに名前が変わっていない）
4. 新しい名前の印の条件なら 409。種類か古い印の条件、または競合なら 1 から 1 回だけやり直す。ほかの Code は投げ直す

## 使わない・使う（BR5.8）

- 種類の Update（`active`、`updatedAt`）。条件 `attribute_exists(sk)`。断られたら 404

## 消す（NFR2.25、BR5.9）

1. 種類の Update で `active = false`（条件 `attribute_exists(sk)`。なければ 404）
2. C8 `isChoreTypeAssigned(ctx, choreTypeId)` を呼ぶ（U4 では仮の窓口）
3. 使われていれば 409 `CHORE_TYPE_IN_USE`（種類は使わないのまま）
4. 使われていなければ、TransactWriteItems で種類の Delete（条件 `attribute_exists(sk)` かつ `active = false`）と名前の印の Delete（条件 `choreTypeId = :id`）。1 と 4 の間に別の画面が「使う」に戻した（そのあと U5 が割り当てを保存したかもしれない）ときは、`active = false` の条件で断られるので消さず、409 `CHORE_TYPE_IN_USE` ではなく「状態が変わりました。もう一度お試しください」（409 `CHORE_TYPE_STATE_CHANGED`）を返す。種類がもうなければ 404（レビュー R-01）
5. 2〜4 で失敗したときは、種類は「使わない」のまま残る（受け入れたこと）

## U5 への引き継ぎ（BR5.9）

- U5 の `saveAssignment` は、割り当ての書き込みのトランザクションに、使う種類ごとの ConditionCheck（`familyId`、`sk = TYPE#<id>`、条件 `active = true`）を入れる。U4 の消す手順の 1 で `active = false` になったあとは、割り当ての保存が断られる
- U5 の本物の C8 `isChoreTypeAssigned` は、割り当ての記録を強い整合性の読み取り（GetItem か、テーブル本体の Query。GSI は使わない）で確かめる。結果整合の索引だと、保存した直後の割り当てを見落として消してしまうため（レビュー R-03）

## 読み取りの整合性（レビュー R-04、R-07）

- 一覧の Query、`getCurrentUnitPrice` の GetItem、変更・使わない・消すの前の GetItem、名前の重なりの 409 で文言を出し分けるための印と種類の読み取りは、どれも強い整合性（`ConsistentRead: true`）で読む。テーブル本体なので強い整合性で読める
- 409 の出し分けで、印の `choreTypeId` の種類が見つからない（直後に消された）ときは、「使う」の相手と同じ文言を出す

## データと時刻（NFR6.5、NFR11.3）

- `ChoreTypes` は本番では `RemovalPolicy.RETAIN`。`createdAt`・`updatedAt` は UTC の ISO 8601
- 種類のデータはアプリの操作でだけ変わる

## 筋書きにする競合と失敗（NFR8.7）

- 同じ名前で 2 つ同時に登録すると、1 つだけが登録される
- 2 つの種類を同時に同じ名前に変えると、1 つだけが変わる
- 名前を変えている間に別の変更が先に入ると、1 回だけやり直す
- 消すとき、使われていれば「使わない」のまま残り、409
- 消す途中で別の画面が「使う」に戻すと、消さずに 409 `CHORE_TYPE_STATE_CHANGED`
- 名前を変えない変更の途中で別の要求が名前を変えると、名前を書き戻さずにやり直す
- 消したあとに名前の印が残らず、同じ名前でまた登録できる
- トランザクションが思いがけない Code で断られると 500

## Sources

- `construction/u4-chore-types/nfr-requirements/reliability-requirements.md`
- `construction/u4-chore-types/functional-design/rules.md`（BR5.3、BR5.8、BR5.9、BR5.12）
- `construction/u3-notification-group/nfr-design/reliability-design.md`

## Assumptions & Open Questions

- [assumption] 同じトランザクションで、同じテーブルの別の項目（種類と名前の印）を書けます（DynamoDB の決まり。同じ項目への 2 つの操作だけが禁じられています）
