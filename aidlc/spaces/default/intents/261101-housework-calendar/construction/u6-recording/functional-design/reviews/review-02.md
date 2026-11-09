## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T00:40:07Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.2、functional-spec.md > F1 の 4.、「受け入れ条件との対応」の AC5.1.3 の行、Assumptions & Open Questions の最初の項目、traceability.json > AC5.1.3 | AC5.1.3 の筋書き（太郎の皿洗いが「済」の 1 件だけ。「やった」を押す。皿洗いが選べない状態で表示される）が、この設計では成り立たない。「未」が 0 件のときは「今日記録できる担当はありません」だけを返す作りで、「済」「×」の担当を文字で並べるのは「未」が 1 件以上のときに限られる。設計者自身が Assumptions で「後者になります」と認めているのに、対応表と traceability.json は AC5.1.3 を「すべて」「OK」にしている。AC のとおりにテストすると、期待する表示が出ない。FR5.4（すべて「済」か「×」なら「今日記録できる担当はありません」）と AC5.1.3 は、1 通の返事に両方を入れれば同時に満たせる | 「未」が 0 件で「済」「×」の担当があるときは、「今日記録できる担当はありません」に続けて、選べない文字の並び（「皿洗い（済 16:42）」など）を同じ返事に付ける、と BR7.2、F1 の 4.、TodayRecordableList（`NO_RECORDABLE_DUTY` のときも `notSelectable` を返す）に書く。Assumptions の「レビューで確かめてください」の項目を、決めた内容に書き換える。AC5.1.3 を単独で試すシナリオ（「済」が 1 件だけ）と AC5.1.5（担当が 0 件）の両方を、受け入れ条件の確かめとして書き分ける | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/functional-spec.md > 「次の単位への引き継ぎ」の「配備」の行（`line` の Lambda の権限） | `line` の権限の一覧が、設計の中で必要になる読み取りに足りない。担当の選択肢と返事にはお手伝いの名前が要り、既存の `getMonthCalendar` は `choreTypeService.list`（`ChoreTypes` の Query）で名前を読んでいる。ところが一覧は `ChoreTypes` の `GetItem`・`ConditionCheckItem` だけで、Query がない。また、記録の取引には月の状態の ConditionCheck（`Calendar` の表）が入るのに、`Calendar` の側の一覧に `ConditionCheckItem` が明示されていない（「TransactWriteItems 相当」と書くだけ）。U5 の `api` のロールは `ConditionCheckItem` を明示している。このままだと、ステージングで 1 対 1 の経路だけ AccessDenied になるおそれがある | 名前をどう読むか（`list` の Query か、種類ごとの `GetItem`）を決め、それに合わせて `ChoreTypes` の権限を書く。`Calendar` は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` と明示し、CDK のテストの期待に入れる前提で書く | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.4 の 2.、BR7.5、functional-spec.md > F2 の 5.、F3 の 7.、「画面用 API と LINE の操作」の表 | 結果の印と返事の対応が一部あいまいで、テストが書き分けられない。(a) 画面で、管理者が担当を別の子供に変えたあとに元の子供が押すと、順番の 2. で 403 `NOT_OWN_DUTY` になり、BR7.5 の「担当が先に変わったときは DUTY_CHANGED の文言」と食い違う（既存の文言は「自分の担当ではありません」）。(b) LINE の `record.do` で `FUTURE_DUTY` が返ったときの返事が、F2 の 5. の一覧にも BR7.5 にもない。(c) 画面の 403 `NOT_OWN_DUTY` の後にカレンダーを読み直すかが書かれていない | 画面と LINE のそれぞれについて、`recordDuty` が返しうる印ごとに、返事の文言と読み直しの有無を 1 つの表にまとめる（`NOT_OWN_DUTY` を「変更された」として扱うか、自分の担当だったものが変わった場合だけそうするかも決める） | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/traceability.json > coverage の AC5.1.15、AC5.1.13 | AC5.1.15（20 回中 19 回が 3 秒以内）は、対象に挙げた BR7.17 が測れる目標を持たず、測定は NFR の段階に回すと書いているのに、状態が `OK` になっている。AC5.1.13 も、額の表示は U9 と書いたうえで `OK` にしている。未完の部分が「済」に見える | 測定を NFR の段階に回す AC5.1.15 は `Deferred`（target は `nfr-requirements` の u6-recording）にする。AC5.1.13 も、U9 に渡す部分を `Deferred`（u9-allowance）として分けて書くか、`OK` の注記が U6 の範囲だけを指すと分かる形にする | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/functional-spec.md > 「契約への追加」の冒頭と C8 の行 | 「壊す変更はありません」と書きながら、C8 の `recordDuty` の引数 `at` を `options.now` に置き換え、`listTodayRecordableDuties` の結果の形（選べない担当の並び）と成功の結果（`Duty` から `Duty` と `alreadyRecorded`）を変えている。U5 は同じ種類の変更を「置き換え」と明記して `docs/contract-changes-u5.md` に残した。呼び出し元が今は U6 だけなので害は小さいが、記述が事実と合わない | 「壊す変更はありません」を、「形を変えるもの（`at` の置き換え、結果の形）は U6 だけが呼ぶ」と書き直し、`contract-changes-u6.md` の一覧で「形（変更）」と「足したもの」を分ける | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.2 の「12 件を超えるとき」、functional-spec.md > Assumptions の 1 つ目 | 選択肢の上限 12 件を決まりとして書いているが、メッセージの形は未定としている。既存の `lineApiService` にあるのはボタン 1 つの buttons テンプレートの組み立てだけで、buttons テンプレートは 4 つ、カルーセルのテンプレートは 10 列までが上限になる。形によっては 12 件が成り立たない | 上限の数は、形を決めてから書くか、形を柔軟なレイアウトの carousel（最大 12 個）に絞って書く。決まりを確かめるテスト（13 件のとき先頭 12 件と案内文）が書ける形にする | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/entities.md > まとめの 1 つ目、Duty の attributes | 「U6 が書くのは status、recordedAt、recordedBy、unitPrice、version の 5 項目だけ」とあるが、`DutyRecord` には `updatedAt` があり、U5 の担当の更新も `updatedAt` を書く。書くか書かないかが決まっていない | `updatedAt` を書くかどうかを entities.md と BR7.6 の更新する中身に書く（書くなら 6 項目） | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/traceability.json > coverage の AC5.1.15、reverse | 前回まで AC5.1.15 の target だった BR7.17 が、AC5.1.15 を `Deferred` にしたことで、coverage にも reverse にも出てこなくなった。BR7.1〜BR7.16 は、どちらかに入っている。BR7.17 だけが追跡から抜けている | `reverse` に BR7.17 を足す（例 `N/A`、「NFR7 と NFR2 の失敗時の返事。AC5.1.15 の測定は nfr-requirements に渡す」）か、AC5.1.15 の target に BR7.17 を併記する | New |

> R-01 Reviewer note: BR7.2、functional-spec.md の F1 の 4.、entities.md の TodayRecordableList、受け入れ条件の対応表が、「未」が 0 件でも `{ selectable, notSelectable }` の成功の形で返し、「今日記録できる担当はありません」に「皿洗い（済 …）」の並びを同じ返事に付ける形にそろっている。AC5.1.3（「済」が 1 件だけ）と AC5.1.5（担当が 0 件）の確かめも書き分けられている。契約の C8 の行も同じ形に直っている

> R-02 Reviewer note: 名前の読み方を `choreTypeService.list`（Query 1 回）に決め、`ChoreTypes` に `GetItem`・`Query`・`ConditionCheckItem`、`Calendar` に `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` を明示している。CDK のテストの期待に入れ、禁止する権限も確かめると書いてある

> R-03 Reviewer note: 「記録の結果の印と返事の対応」の表に、印ごとの LINE の返事・出し直し・画面の応答と文言・読み直しがまとまっている。`FUTURE_DUTY` の LINE の返事もあり、`NOT_OWN_DUTY` は「変更された」として扱い読み直す、と決めている

> R-04 Reviewer note: traceability.json の AC5.1.15 は `Deferred`（nfr-requirements の u6-recording）になった。AC5.1.13 は `OK` のままだが、functional-spec.md の対応表が「OK は U6 の範囲だけを指す」と明記している。形にない `notes` も消えている。なお BR7.17 が traceability から抜けた点は下の New findings に挙げた

> R-05 Reviewer note: 「契約への追加」が「形（変更）」と「足したもの」に分かれ、`at` の置き換えと結果の形の変更を明記している。呼び出し元が U6 だけという理由も書いてある

> R-06 Reviewer note: 返事の形を Flex Message の carousel（最大 12 個のバブル）に絞り、定数 `MAX_RECORD_CHOICES` と 12 件／13 件のテストを書いている。上限の公式の確認はコード生成に回すと Assumptions に残してあり、直し方も決めてある

> R-07 Reviewer note: `updatedAt` を書く（6 項目）と entities.md の Duty、まとめ、BR7.6 にそろえて書いてある

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| traceability（手で確認。エンジンのコマンドは実行していない） | AC5.1.1〜AC5.1.15 はすべて coverage にある。BR7.1〜BR7.16 は coverage か reverse に入っている。BR7.17 だけがどちらにもない | Minor が 1 件（上の New findings）。ブロックしない |
| 成果物どうしの整合（読むだけ） | entities.md、rules.md、functional-spec.md の間で、結果の形（`MONTH_CONFIRMED` か `{ selectable, notSelectable }`）、`updatedAt` を含む 6 項目、確かめの順（BR7.4 と F2 の図）、印ごとの返事（表と BR7.5）が食い違っていない | 通る |

### Summary

前回の R-01（Major）を含む R-01〜R-07 はすべて直っていて、開いている Critical と Major はありません。AC5.1.3 と FR5.4 は 1 通の返事で両方を満たす形に決まり、結果の形、権限、返事の対応表、契約の変更の書き方もそろっています。残るのは、traceability.json から BR7.17 が抜けている Minor が 1 件だけで、ブロックしません。
