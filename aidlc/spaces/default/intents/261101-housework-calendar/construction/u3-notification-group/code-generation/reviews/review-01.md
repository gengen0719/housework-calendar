## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 全体の所見

U3（お知らせ先）のコードを、NFR 設計（security-design.md、reliability-design.md）とルール（rules.md）に照らして読みました。`npx vitest run u3-notification-group` を実行し、13 ファイル・318 件がすべて通ることを確認しました（読み取りのみ。カバレッジの数字と U1・U2 を含む全体の実行は、今回は走らせていません）。反論を試みましたが、実装を止めるほどの欠陥（Critical）や、手戻りが大きい欠陥（Major）は見つかりませんでした。以下は、直しておくと安全な Minor の指摘です。

確かめて、設計どおりだったところ:

- 登録・置き換え・解除のトランザクション（`familyRepository.ts` の `buildRegisterNotificationGroupItems`、`classifyRegisterCancellation`、`buildUnregisterNotificationGroupItems`）は、`CancellationReasons` の並び（`kinds`）と項目の順が一致しています。新しいグループの条件の外れは再読み込み、家族・前のグループの条件の外れと競合だけは 1 回やり直し、それ以外の Code は投げ直す、という分け方が設計の 5 と合っています。前の記録が実在しないときは Delete を入れないので、同じ項目への 2 操作（DynamoDB が禁じる形）にもなりません。
- 二度処理しない記録の前の打ち切り: `entries/line.ts` の `accepts` が `message`・`postback` を `parseGroupCommand` と 1 対 1 の判定で振り分け、操作でなければ `lineEventRepository.begin` の前に終えます。`line-routing.steps.ts` が `world.events.size` が 0 であることまで確かめています。5000 文字を超える文字や 300 文字を超える data は zod では弾かず、そのイベントだけ無視します。
- グループの操作の入口: 登録は友だち・家族あり・管理者のときだけ通り、記録なし・ブロック中・子供・`source.userId` なしは同じ文言で断ります。登録以外の操作は、グループの家族を決めてから、友だちかつ同じ家族のメンバーだけを通し、断る文言は固定の文だけです。
- reply: 失敗しても登録を取り消さず、warn だけを残します（`groupEventHandler.ts` の `replyText`）。
- IAM: `line` は `NotificationGroups` に Get/Put/Delete、`Families` に Get/Update だけ。`api` は `NotificationGroups` に Get だけ。`ConditionCheckItem` は足していません。コードが使う操作（トランザクションの Put・Update・Delete と強い整合性の Get）と過不足なく一致します。
- 画面: 子供のカレンダーの枠ではお知らせ先の API を呼びません（`App.tsx` の `enabled`）。グループの名前は React の文字として出ます。
- U1・U2 への影響: U1 のテストの変更は、新しい URL の素通りの差し替えと、テーブル数の期待（4→6）の更新だけで、期待を弱めてはいません。偽の DynamoDB の条件式の評価は、存在しない属性に対する比較を偽にするなど、実際の動きに沿っています。

### 指摘

1. **Minor** — `packages/backend/src/services/familyMemberService.ts:516`（`registerNotificationGroup`）、`:596` 付近（`unregisterNotificationGroupByGroup`）
   グループの記録が同じ家族のものとしてあれば、家族の `notificationGroupId` を見ずに「登録できた」と返します。家族の表だけが戻された場合など、記録は残っていて家族の側の指す先が空か別のグループ、という食い違いが起きると、そのままでは直りません。管理者は登録できたと返事を受け取りますが、画面は「登録されていません」のままで、U10 の宛先（`getNotificationGroup`）も引けません。また、そのグループから外されたときの解除は、家族側の条件（`notificationGroupId = :groupId`）が毎回外れ、`:617` で投げて 500 を返し続けます。
   直し方: 同じ家族の記録があっても、`family.notificationGroupId === groupId` のときだけ書かずに成功を返す。違うときはそのままトランザクションに進める（Put の条件は同じ家族なら通り、家族の条件は読んだ値で通る）。解除は、家族側の条件が外れた理由が食い違いだけなら、グループの記録だけを消して終える。食い違いの筋書きを `register-group.feature` に 1 つ足す。

2. **Minor** — `packages/backend/src/services/familyMemberService.ts:507–558`（再試行のループ）
   やり直しの回数が 2 回で、1 回目が競合や家族の条件の外れ（やり直し）、2 回目が新しいグループの条件の外れ（別の家族が先に登録）になると、ループを抜けて `INTERNAL`（「もう一度お試しください」）を返します。本当は別の家族のグループなので、何度試しても同じ答えになり、利用者は原因が分かりません。
   直し方: 新しいグループの条件の外れ（`group-taken`）は回数に数えず、読み直して `GROUP_USED_BY_OTHER_FAMILY` に進める。もしくは回数を 3 にして、最後の回でも `group-taken` ならその理由を返す。1 回目 stale・2 回目 group-taken の順を `registerNotificationGroupTransaction.test.ts` に足す。

3. **Minor** — `packages/backend/src/lib/logger.ts:35`（`redact`）、`:8`（`REDACTED_EXACT_KEY`）
   深さが 4 を超えた入れ子は、オブジェクトのまま伏せずに返します（`depth > 4 ||` が先に評価されるため）。また、`groupName`・`text`・`displayName` の完全一致は大文字小文字を区別するので、`GroupName` や `display_name` はすり抜けます。型での禁止が主な備えなので今すぐの害はありませんが、「型をすり抜けた値も伏せる」という設計の意図（NFR5.8）に対して穴があります。
   直し方: 深さの上限を超えたオブジェクトは `'[TRUNCATED]'` に置き換える。完全一致の正規表現に `i` を付け、`display_?name` も含める。`groupCommandGate.test.ts` の伏せ字のテストに、深い入れ子と別の表記を 1 件ずつ足す。

4. **Minor** — `packages/frontend/src/hooks/useNotificationGroup.ts:17–28`
   お知らせ先は最初に 1 回読むだけで、読み直しません。管理者がカレンダーの枠で手順を見て、LINE のグループで登録して LIFF に戻っても、画面を開き直すまで「登録されていません」が出続けます。また、`enabled` が false から true に変わったとき（子供が家族の設定を開く）、前の結果が残るか、読み込み中のままの表示が一瞬出ます。
   直し方: `enabled` が true になるたびに状態を `loading` に戻して読み直す。あわせて、アプリが前面に戻ったとき（`visibilitychange`）にも読み直す。screens.feature に「登録後に戻ると手順が消える」場面を 1 つ足す。

5. **Minor** — `aidlc/spaces/default/intents/261101-housework-calendar/construction/u3-notification-group/code-generation/traceability.json`（BR4.7、BR4.2、BR4.3 の行）
   BR4.7（登録できたら家族の名前を返事する）の対応先が `groupCommandGate.ts` になっていますが、返事の文言を組み立てるのは `packages/backend/src/handlers/line/groupEventHandler.ts` の `handleGroupEvent` です。BR4.2（ちょうど一致）は `groupCommand.ts` で合っていますが、BR4.3 は `groupCommandGate.ts` の `judgeRegister` と `groupEventHandler.ts` の文言選びの 2 か所にまたがります。NFR4.27・NFR4.28・NFR5.8 など、受け入れ条件以外の要件への対応も載っていません。
   直し方: BR4.7 の対応先を `groupEventHandler.ts` に直し、BR4.3 に 2 か所を並べる。NFR 側の対応（打ち切りは `entries/line.ts` と `line-routing.steps.ts`、伏せ字は `logger.ts` と `groupCommandGate.test.ts`）も追記する。

6. **Minor** — `packages/backend/src/entries/line.ts:118`、`packages/backend/src/services/familyMemberService.ts:596`
   `now` は Webhook 1 本につき 1 回だけ取った Lambda の時刻で、`registeredAt` にそのまま入ります。古い leave の判定は、この Lambda の時刻と LINE の `timestamp` を比べるため、時計のずれがあると、登録の直後に本当に外された leave を古いものとして無視し、登録が残ることがあります（200 を返すので LINE は送り直しません）。登録の直後に外される場面は少ないので、今は受け入れてよい範囲です。
   直し方: 比較に数秒の余裕を持たせる（`registeredAt - 余裕 > timestamp` のときだけ無視する）、または登録のイベントの `timestamp` を `registeredAt` に使う。どちらも選ばない場合は、`docs/contract-changes-u3.md` の「受け入れたリスク」に書く。

### まとめ

トランザクションの組み立てと読み分け、打ち切り、入口の確かめ、IAM、画面の呼び出しは設計どおりで、テストは中身を確かめる作りです（記録の数、返事の数、書かれた項目、ログの文字列まで見ています）。上の指摘は、食い違った状態からの回復（1）、最後の再試行での誤った返事（2）、ログの穴（3）、画面の読み直し（4）、記録の正確さ（5、6）で、いずれも実装の差し戻しは要りません。Critical は 0 件、Major は 0 件です。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
