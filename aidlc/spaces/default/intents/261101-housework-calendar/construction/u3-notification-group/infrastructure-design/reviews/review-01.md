## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

U3 のインフラ設計を、実コード（`infrastructure/lib/data-stack.ts`、`app-stack.ts`、`app.ts`、`scripts/smoke-check.sh`、`packages/backend/src/lib/dynamoClient.ts`）と、U3 の NFR 設計（`reliability-design.md`、`security-design.md`、`scalability-design.md`）に照らして確かめました。`cdk synth` や CDK のテストは動かしていません（設計段階で U3 のコードがまだ無いため）。以下は、読んで確かめた範囲の指摘です。Critical はなく、Major は 2 件（READY の条件の「2 件以下」）です。

### 確かめて問題がなかった点

- 新しいテーブル: `data-stack.ts` の `common`（オンデマンド、`AWS_MANAGED`、本番 `RETAIN`、ステージング `DESTROY`）をそのまま使えば、`NotificationGroups`（PK `groupId`、TTL なし）を足せます。CDK として実現できます。
- IAM と DynamoDB の操作の対応: `reliability-design.md` の登録・解除で使う操作は、`NotificationGroups` の Put と Delete と GetItem、`Families` の GetItem と Update です。仕様の `line` の権限（`NotificationGroups` に GetItem、PutItem、DeleteItem。`Families` に GetItem、UpdateItem）で足ります。TransactWriteItems は項目ごとの権限で通ります。強い整合性の読み取り（ConsistentRead）は `GetItem` の権限で足ります。設計に ConditionCheck の項目はないので、`ConditionCheckItem` は要りません（R-05 を参照）。
- `api` は `NotificationGroups` の GetItem だけで足ります。`Families` の GetItem は `app-stack.ts` に既にあります。
- 環境変数: `dynamoClient.ts` には `NOTIFICATION_GROUPS_TABLE` の取り出しがまだありません。仕様の「`line` と `api` に `NOTIFICATION_GROUPS_TABLE`、`line` に `FAMILIES_TABLE`」は、`app-stack.ts` の現状（`line` に `FAMILIES_TABLE` がない）と合っています。
- 秘密の情報: 新しいものは足さない設計で、`line` は既に `line/*` のパラメータを読めます。
- 費用: 新しい有料サービスはなく、0 円の条件と矛盾しません。
- トレーサビリティ: `traceability.json` の 10 件は、各文書の節に対応しています。

### 指摘

**R-01（Major）前の版に戻したあとの「登録し直し」が、古い値が残ったままだと失敗し続ける**
- 場所: `construction/u3-notification-group/infrastructure-design/cicd-pipeline.md` の「前の版に戻す」の 2 つ目の項目（`Families.notificationGroupId` に古い値が残っていれば…そのまま置き換わる）。
- 内容: 本番で戻して、もう一度反映すると、`NotificationGroups` は CDK が付ける新しい名前の空のテーブルになります。一方 `Families.notificationGroupId` には古いグループの ID が残っています。`reliability-design.md` の登録の手順 4 は、「2 で値があったときだけ」前のグループの Delete を同じトランザクションに入れ、条件は「`familyId = :myFamily`」です。空のテーブルにはその項目がないので、条件が成り立たず `ConditionalCheckFailed` になります。手順 5 は「前のグループの `ConditionalCheckFailed`」を 1 回だけやり直しますが、やり直しても同じ結果です。その結果、その家族は何度登録しても「表示できませんでした」になり、管理者が登録し直せるという文書の説明が成り立ちません。
- 直し方: 次のどちらかにします。(a) 「登録し直し」の手順 2 で、覚えた前のグループを `NotificationGroups` で読んで実在を確かめ、なければ Delete を入れない（Families の条件は覚えた値のままにする）と `reliability-design.md` に書き足す。(b) 戻す手順に、本番の `RETAIN` のテーブルを残したまま新しいテーブルを作らず、元のテーブルを取り込む（`cdk import`）か、`Families.notificationGroupId` を消す手順を書く。(a) のほうが小さい変更です。どちらでも、`cicd-pipeline.md` の説明を実際の動きに合わせて直してください。

**R-02（Major）戻すときの反映順で、Data スタックが App スタックに使われている書き出し（export）を消せず失敗するおそれ**
- 場所: `cicd-pipeline.md` の「前の版に戻す」、および `infrastructure-specification.md` の `AppStackProps` に `notificationGroups` を足す記述。`infrastructure/lib/app.ts` は Data のテーブルを `props` で App に渡しています。
- 内容: CDK では、スタックをまたいでテーブルを渡すと、Data が表を書き出し、App が取り込みます。U3 を `git revert` すると、App が取り込みを外すのと同時に Data が書き出しを消します。CDK は Data を先に反映するので、App がまだ取り込んでいる間に書き出しを消そうとして、CloudFormation が「使われている書き出しは消せない」と断る既知の落とし穴にあたるおそれがあります。U2 の文書にある説明（「Data の時点で…参照していても…」）は、テーブルが消えるかどうかだけを扱っていて、この書き出しの問題を扱っていません。私は実際に反映して確かめてはいません。
- 直し方: 戻す手順に、まず App だけを、`NotificationGroups` を使わない形で反映し、次に Data を戻すと書き足す。または `DataStack` に `exportValue` で書き出しを残す。どちらを選ぶかは設計で決め、CDK のテスト（または `cdk deploy` の事前確認）に入れてください。U2 の `Invitations` にも同じ問題がありえるので、U2 側も確かめてください。

**R-03（Minor）LINE のグループ参加の許可の設定場所が曖昧**
- 場所: `infrastructure-specification.md` の「Infrastructure Services」の LINE Developers の行、および「Assumptions & Open Questions」の最初の項目。
- 内容: 「LINE Developers の管理画面（または LINE Official Account Manager）」と 2 つ並べていて、手順が決まっていません。「グループトーク・複数人トークへの参加を許可する」は、LINE Official Account Manager の応答設定にある項目で、Messaging API のチャネルの画面にはない可能性があります。README に書く手順が曖昧なままになります。
- 直し方: 実際の画面で場所を 1 つに確かめ、ステージングと本番で同じ手順にして、`cicd-pipeline.md` の「README に足すこと」にそのまま書く。あわせて、設定を忘れた場合に、`join` イベントが来ず案内も届かない動きになる（失敗に気づきにくい）ことを「困ったとき」に書く。

**R-04（Minor）反映後の確かめの数と説明が U3 の追加と合っていない**
- 場所: `scripts/smoke-check.sh` の先頭コメント（「cicd-pipeline.md の 4 つ」）と、`cicd-pipeline.md` の「反映したあとの確かめ」。
- 内容: 現状のスクリプトの確かめは 4 つ（3b を含めると増えている）で、コメントの数と合っていません。U3 は 1 つ足すだけの設計ですが、コメントの数と、足す位置（3b の U2 のあと）が書かれていません。
- 直し方: `cicd-pipeline.md` に「3b のあとに U3 の確かめを足し、先頭コメントの数を直す」と書く。

**R-05（Minor）TransactWriteItems の操作の一覧に ConditionCheck を使わないことが書かれていない**
- 場所: `infrastructure-specification.md` の「Lambda のロールの権限」の箇条書き。
- 内容: 作業の指示では Put、Update、Delete、ConditionCheck を確かめることになっています。U3 の設計は Put、Update、Delete だけで、`dynamodb:ConditionCheckItem` は要りません（U2 の `api` にはあります）。ただし文書は「ConditionCheck を使わないので足さない」とは書いていないので、実装者が U2 に合わせて足すかもしれません。
- 直し方: 「U3 は ConditionCheck を使わないので `ConditionCheckItem` は足さない」と 1 行足し、CDK のテストで確かめる。

**R-06（Minor）`line` の権限の最小性のテストが仕様に足りない**
- 場所: `infrastructure-specification.md` の「Lambda のロールの権限」の最後の項目（CDK のテスト）。
- 内容: 「`line` に `Families` の PutItem/Delete がない」「`line` の `NotificationGroups` に UpdateItem/Query/Scan がない」ことを確かめる項目がありません。設計が使う操作より広い権限が付いても、テストでは気づけません。
- 直し方: テストの項目に、上の 2 点（許可した操作だけがあること）を足す。

**R-07（Minor）ロールバック後のステージングの説明が不足**
- 場所: `cicd-pipeline.md` の「前の版に戻す」の 3 つ目の項目。
- 内容: ステージングは `DESTROY` で、戻すと `NotificationGroups` が消えますが、`Families.notificationGroupId` は残ります。R-01 と同じ古い値の問題がステージングでも起きるため、ステージングでの確かめを繰り返すときに詰まります。
- 直し方: R-01 の直し方 (a) を採れば同時に解決します。採らない場合は、ステージングの確かめの手順に `notificationGroupId` を消す手順を書く。

### まとめ

テーブル、IAM、環境変数、秘密の情報、費用の設計は、実コードと設計した DynamoDB の操作に合っていて、CDK で作れます。直すべき点は、戻すときの動き（R-01、R-02）です。R-01 は文書の説明が実際の動きと食い違っているため、実装の前に直してください。残りは軽微です。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
