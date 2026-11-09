## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T00:29:45Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.2、functional-spec.md > F1 の 4.、「受け入れ条件との対応」の AC5.1.3 の行、Assumptions & Open Questions の最初の項目、traceability.json > AC5.1.3 | AC5.1.3 の筋書き（太郎の皿洗いが「済」の 1 件だけ。「やった」を押す。皿洗いが選べない状態で表示される）が、この設計では成り立たない。「未」が 0 件のときは「今日記録できる担当はありません」だけを返す作りで、「済」「×」の担当を文字で並べるのは「未」が 1 件以上のときに限られる。設計者自身が Assumptions で「後者になります」と認めているのに、対応表と traceability.json は AC5.1.3 を「すべて」「OK」にしている。AC のとおりにテストすると、期待する表示が出ない。FR5.4（すべて「済」か「×」なら「今日記録できる担当はありません」）と AC5.1.3 は、1 通の返事に両方を入れれば同時に満たせる | 「未」が 0 件で「済」「×」の担当があるときは、「今日記録できる担当はありません」に続けて、選べない文字の並び（「皿洗い（済 16:42）」など）を同じ返事に付ける、と BR7.2、F1 の 4.、TodayRecordableList（`NO_RECORDABLE_DUTY` のときも `notSelectable` を返す）に書く。Assumptions の「レビューで確かめてください」の項目を、決めた内容に書き換える。AC5.1.3 を単独で試すシナリオ（「済」が 1 件だけ）と AC5.1.5（担当が 0 件）の両方を、受け入れ条件の確かめとして書き分ける | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/functional-spec.md > 「次の単位への引き継ぎ」の「配備」の行（`line` の Lambda の権限） | `line` の権限の一覧が、設計の中で必要になる読み取りに足りない。担当の選択肢と返事にはお手伝いの名前が要り、既存の `getMonthCalendar` は `choreTypeService.list`（`ChoreTypes` の Query）で名前を読んでいる。ところが一覧は `ChoreTypes` の `GetItem`・`ConditionCheckItem` だけで、Query がない。また、記録の取引には月の状態の ConditionCheck（`Calendar` の表）が入るのに、`Calendar` の側の一覧に `ConditionCheckItem` が明示されていない（「TransactWriteItems 相当」と書くだけ）。U5 の `api` のロールは `ConditionCheckItem` を明示している。このままだと、ステージングで 1 対 1 の経路だけ AccessDenied になるおそれがある | 名前をどう読むか（`list` の Query か、種類ごとの `GetItem`）を決め、それに合わせて `ChoreTypes` の権限を書く。`Calendar` は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` と明示し、CDK のテストの期待に入れる前提で書く | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.4 の 2.、BR7.5、functional-spec.md > F2 の 5.、F3 の 7.、「画面用 API と LINE の操作」の表 | 結果の印と返事の対応が一部あいまいで、テストが書き分けられない。(a) 画面で、管理者が担当を別の子供に変えたあとに元の子供が押すと、順番の 2. で 403 `NOT_OWN_DUTY` になり、BR7.5 の「担当が先に変わったときは DUTY_CHANGED の文言」と食い違う（既存の文言は「自分の担当ではありません」）。(b) LINE の `record.do` で `FUTURE_DUTY` が返ったときの返事が、F2 の 5. の一覧にも BR7.5 にもない。(c) 画面の 403 `NOT_OWN_DUTY` の後にカレンダーを読み直すかが書かれていない | 画面と LINE のそれぞれについて、`recordDuty` が返しうる印ごとに、返事の文言と読み直しの有無を 1 つの表にまとめる（`NOT_OWN_DUTY` を「変更された」として扱うか、自分の担当だったものが変わった場合だけそうするかも決める） | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/traceability.json > coverage の AC5.1.15、AC5.1.13 | AC5.1.15（20 回中 19 回が 3 秒以内）は、対象に挙げた BR7.17 が測れる目標を持たず、測定は NFR の段階に回すと書いているのに、状態が `OK` になっている。AC5.1.13 も、額の表示は U9 と書いたうえで `OK` にしている。未完の部分が「済」に見える | 測定を NFR の段階に回す AC5.1.15 は `Deferred`（target は `nfr-requirements` の u6-recording）にする。AC5.1.13 も、U9 に渡す部分を `Deferred`（u9-allowance）として分けて書くか、`OK` の注記が U6 の範囲だけを指すと分かる形にする | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/functional-spec.md > 「契約への追加」の冒頭と C8 の行 | 「壊す変更はありません」と書きながら、C8 の `recordDuty` の引数 `at` を `options.now` に置き換え、`listTodayRecordableDuties` の結果の形（選べない担当の並び）と成功の結果（`Duty` から `Duty` と `alreadyRecorded`）を変えている。U5 は同じ種類の変更を「置き換え」と明記して `docs/contract-changes-u5.md` に残した。呼び出し元が今は U6 だけなので害は小さいが、記述が事実と合わない | 「壊す変更はありません」を、「形を変えるもの（`at` の置き換え、結果の形）は U6 だけが呼ぶ」と書き直し、`contract-changes-u6.md` の一覧で「形（変更）」と「足したもの」を分ける | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/rules.md > BR7.2 の「12 件を超えるとき」、functional-spec.md > Assumptions の 1 つ目 | 選択肢の上限 12 件を決まりとして書いているが、メッセージの形は未定としている。既存の `lineApiService` にあるのはボタン 1 つの buttons テンプレートの組み立てだけで、buttons テンプレートは 4 つ、カルーセルのテンプレートは 10 列までが上限になる。形によっては 12 件が成り立たない | 上限の数は、形を決めてから書くか、形を柔軟なレイアウトの carousel（最大 12 個）に絞って書く。決まりを確かめるテスト（13 件のとき先頭 12 件と案内文）が書ける形にする | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/functional-design/entities.md > まとめの 1 つ目、Duty の attributes | 「U6 が書くのは status、recordedAt、recordedBy、unitPrice、version の 5 項目だけ」とあるが、`DutyRecord` には `updatedAt` があり、U5 の担当の更新も `updatedAt` を書く。書くか書かないかが決まっていない | `updatedAt` を書くかどうかを entities.md と BR7.6 の更新する中身に書く（書くなら 6 項目） | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| traceability（手で確認。エンジンのコマンドは実行していない） | AC5.1.1〜AC5.1.15 はすべて coverage にある。BR7.1〜BR7.17 は、coverage の target か reverse のどちらかに入っていて、孤立した決まりはない | 形の上では通る。ただし AC5.1.3 は target の BR7.2 が AC の筋書きを満たさない（1 つ目の指摘）。AC5.1.15、AC5.1.13 の状態は実態より強い（4 つ目の指摘） |
| 既存コードとの照合（読むだけ） | `DutyRecord` に `recordedAt`・`recordedBy`・`unitPrice` がある。`buildMonthGuard`、`findDuty`、`writeTransaction` があり、U5 の引き継ぎの条件（`dutyId` と `version` と月の確定の確かめ）で書ける。`getCurrentUnitPrice` は「使わない」の種類にも単価を返す。`onDutyReassigned` と同じ形の登録の仕組みを作れる。`accepts` は今、グループの操作だけを通す | 設計の前提とコードは合っている。LINE の受け口に 1 対 1 の `record.*` を足す変更が必要なことも確認した（`accepts` と `handlePostback` が今はグループ専用） |
| 上流との整合（読むだけ） | U5 との約束（`dutyId`・`version`・「未」を条件にする、同じ取引での月の確定の確かめ、`origin` を変えない、担当を作らない・消さない、`onDutyRecorded` が `onDutyReassigned` と同じ形）に沿っている。二重押し（BR7.8 を version の比べより先に行い、同時の 2 件は BR7.6 の条件で片方だけが書く）と、単価の書き写し（直前に読み、同じ取引で「その値のまま」を確かめ、1 回だけやり直す）は成り立つ。グループには push も reply も送らない。管理者・家族外は本人にだけ案内を返す | 指摘した点以外に、競合や認可の穴は見つからなかった |

### Summary

[Q1]〜[Q5] の答えは、二重押し・競合・単価の書き写し・認可・グループに送らないことまで一貫して設計されていて、U5 との約束とも合っています。ただし、設計者が挙げた AC5.1.3 と FR5.4 の合わせ方では、AC5.1.3 の筋書き（「済」の 1 件だけ）に期待どおりの表示が出ません。「未」が 0 件の返事にも選べない担当の並びを付ければ両方を満たせるので、この点を直せば READY に近い状態です。`DUTY_ALREADY_DONE` の追加は妥当で、ほかは権限の一覧、返事の対応表、traceability の状態などの Minor です。
