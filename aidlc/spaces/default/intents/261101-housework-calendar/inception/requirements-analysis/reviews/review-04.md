## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-01T16:29:07Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR6.4 | Q11 で加えた「確定」について、決まっていない点が残っています。(1) どの月を確定できるのか。今月の途中や来月も確定できるのか、月が終わってからだけなのかが書かれていません。月の途中で確定すると、残りの日の記録も代わりにやる申し出もすべて断られます。(2) 間違えて確定したときに元に戻せるのか。NFR6 で本番のデータを手で直すことを禁じているため、戻す操作がないと間違いを直す方法がありません。(3) 母親が確定しなかった月は、いつまでも記録や修正ができるのか。 | 確定できる月の条件（例: その月の最後の日が過ぎてから）、確定を取り消せるかどうか（できる場合は誰が、いつまで）、確定していない過去の月の扱いを FR6.4 に書き、それぞれに Given/When/Then を付けてください。 | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR5.5 | 「同じ月の過去の日の自分の担当」と「その月が確定されるまでできる」の 2 つの書き方が、月が変わったときに食い違います。たとえば 2 月 1 日に、まだ確定していない 1 月 31 日の担当を記録できるかどうかが、読む人によって変わります。前者なら記録できず、後者なら記録できます。Q11 の答え「母親が確定処理をするまで」からは後者と読めますが、受け入れ条件は同じ月の中の例しかありません。今日やこれからの日の担当を画面から記録できるかどうかも書かれていません。 | 子供があとから記録できる範囲を 1 つの書き方にまとめてください（例: 「確定していない月の、今日までの自分の担当」）。月をまたぐ場合（2 月 1 日に 1 月 31 日を記録する）と、これからの日を記録しようとした場合の Given/When/Then を加えてください。 | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR6.1、FR6.2、FR6.3（担当の状態「未」「済」「×」） | 担当の状態がどう移り変わるかが決まっていません。「済」の担当にそのまま「やらなかった」を付けられるのか、先に取り消す必要があるのか。付けた「やらなかった」を母親が外せるのか、外したら「未」に戻るのか。母親が「済にする」を付けたときに、記録した時刻（FR4.2）として何を残し、どの時点の単価（FR2.2）を使うのか。このままだと、作る人が推測で決めることになり、金額の計算にも影響します。 | 「未」「済」「×」の間で、誰がどの操作をするとどの状態に変わるかを表にまとめてください。あわせて、母親の「済にする」で残す時刻と使う単価を FR6.3 に書いてください。 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR3.3 と FR7.3 | 月の割り当てを保存し直すと、まだ来ていない日の担当は作り直されます。このため、子供同士で成立した「代わりにやる」（FR7.3）も、知らせのないまま元に戻ります。引き受けた子供と申し出た子供が気づかないおそれがあります。保存し直すときに「今日」を作り直す日に含めるかどうかも書かれていません。 | 作り直すときに「代わりにやる」で変わった担当を残すのか上書きするのかを母親に確認し、決めた内容を FR3.3 に書いてください。「まだ来ていない日」に今日を含むかどうかも書いてください。 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR7 | 「代わってほしい」の申し出がどうなるかが決まっていません。誰も引き受けないまま残った申し出、申し出た本人の取り消し、同じ担当への二重の申し出、申し出のあいだに母親が担当を変えた場合（FR3.2）が書かれていません。「これからの担当」に今日を含むかどうかも書かれていません。 | 申し出を取り消せるか、同じ担当に申し出が 2 つ出たとき、母親が担当を変えたときに申し出がどうなるかを決め、FR7 に書いてください。「これからの担当」に今日を含むかどうかも書いてください。 | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR5.5 と NFR1 | 子供がアプリの画面からあとで記録したとき（FR5.5）に、公式アカウントから知らせを送るかどうかが書かれていません。返事ではない送信は無料枠の通数に数えられるため、送るなら NFR1 の約 124 通という見込みが変わります。家族のグループに家族以外の人（例: 父親）がいる場合も、グループへの 1 回の送信が人数分の通数になるため、見込みが変わります。 | 画面から記録したときは LINE で知らせない（または知らせる）と FR5.5 に書いてください。お知らせ先のグループに入る人数を前提として NFR1 に書いてください。 | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR9.5、NFR2、NFR7 | いくつかの要件で、合否の決め方がはっきりしません。FR9.5 の「作り手が気づけるように記録する」と「二重に送らない」、NFR2 の「メンテナンスのとき以外は止めない」には、確かめ方がありません。NFR7 の 3 秒は、毎回なのか、大半の場合なのかがわかりません。FR1.6、FR3.2、FR6.1〜FR6.3、FR9.2〜FR9.4 などには、文書の初めで約束している Given/When/Then がありません。 | NFR7 は「95% の要求が 3 秒以内」のように割合を付けてください。FR9.5 と NFR2 は確かめられる形に書き直してください（例: 送信に失敗したら 15 分以内に作り手へ知らせが届く。同じ日のリマインドは 1 通だけ）。受け入れ条件のない要件には、少なくとも 1 つ Given/When/Then を付けてください。 | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR8.3 | 合計がマイナスになったときに 0 円にそろえるかどうかは、子供が受け取る金額にかかわる決めごとです。それを作り手の前提として決めています。 | マイナスの合計をそのまま見せるのか、0 円にそろえるのかを母親に確認し、決めた内容を FR8.3 に書いてください。 | Resolved (reviewer) |
| R-09 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR1.5 | 家族のグループの登録で、決まっていない点があります。お知らせ先をあとから変えられるか。公式アカウントがほかのグループに招待されたらどうするか。お知らせ先がまだ登録されていないときに、FR7 の申し出と FR9 のお知らせがどうなるか。受け入れ条件は、うまくいく場合の 1 つしかありません。 | お知らせ先が未登録の場合と変更する場合の扱いを決め、FR1.5 に Given/When/Then を加えてください。管理者以外がお知らせ先を登録しようとした場合も加えてください。 | Resolved (reviewer) |
| R-10 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR6.5 と FR9.1、FR5.1、FR5.4 | 月の途中で確定できる（例: 1 月 20 日に 1 月を確定）ようになったが、確定したあとの残りの日について、16 時のリマインドを送るかどうかと、リッチメニューの「やった」を押したときの返事が決まっていない。いまのままだと、記録できない担当のリマインドが毎日届き、「やった」を押すと何が返るかわからない | 確定している月の担当について、16 時のリマインドを送るか送らないかを決め、受け入れ条件を足す。FR5.1 か FR5.4 に「今月が確定しているときに『やった』を押すと『この月は確定済みです』と返事する」のような条件を足す | Resolved (reviewer) |
| R-11 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR5.5、FR6.3、FR4.2 と Intent Analysis | 目的に「記録した時刻を残し、取り掛かる時間の現状を把握する」とあるが、あとからの記録（FR5.5）と母親の「済にする」（FR6.3）は操作した時刻を残すため、実際にやった時刻ではない時刻がそのまま混ざる。あとの版で時刻の改善を目安にするときに、もとの数字が正しく読めない。FR5.5 であとから記録したものをカレンダーでどう表示するかも書かれていない | あとから記録したもの（担当の日と記録した日が違うもの、管理者が付けたもの）を見分けられるように残す、と要件に書く。FR4.2 に、あとからの記録の表示例（例: 「済 1/7 16:00 太郎が記録（あとから）」）を受け入れ条件として足す | Unresolved |
| R-12 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR3.5、FR4.4、FR4.5、FR5.2、FR5.4、FR5.8、FR7.2、NFR3、NFR6、NFR10、NFR11 | 進め方で受け入れ条件は Given/When/Then で書くと決めているが、これらの項目には Given/When/Then か確かめ方がない。中身ははっきりしているので作れるが、テストの筋書きを書く人が自分で条件を作ることになる | 各項目に Given/When/Then を 1 つ以上足すか、機能以外の要件には「確かめ方」を足す（例: NFR11 は「23:59 と 0:00 の記録が日本時間の日付で分かれること」） | Resolved (reviewer) |
| R-13 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR1.5 | お知らせ先として登録したグループから、公式アカウントが外された（退出させられた）ときの動きがない。FR9 のお知らせが送れなくなるが、管理者に知らされるかどうかがわからない | 公式アカウントがお知らせ先のグループから外れたとき、お知らせ先を未登録として扱い、管理者がアプリを開くと「お知らせ先のグループが登録されていません」と表示する、のように決めて受け入れ条件を足す | Unresolved |
| R-14 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR7.1 と FR7.5 | 今回、確定している月の「やった」の返事は決まりましたが、確定している月に子供がグループで「代わって」と送ったときの返事が決まっていません。FR7.1 のとおりだと、確定している月の今日以降の「未」の担当がボタンとして出てしまい、選んでも FR6.5 で変更できないので、子供が戸惑います | FR7.1 に、確定している月の担当はボタンに出さないことと、申し出られる担当がないときの返事（例:「この月は確定済みです」や「申し出られる担当はありません」）を Given/When/Then で足してください | Resolved (reviewer) |
| R-15 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/requirements-analysis/requirements.md > FR5.1 と FR7.1〜FR7.2 | 「やった」のあとに出る担当のボタンや、「代わって」の返事で出た「1/8 皿洗い」のボタンを、表示されたあとに月が確定されてから押したときの動きが書かれていません。FR7.5 は「引き受ける」の場合だけを決めています。トークのボタンはあとからでも押せるため、確定した月に記録や申し出が入る隙間が残ります | FR5.1 と FR7.2 に、ボタンを押した時点で月が確定していれば受け付けず「この月は確定済みです」と返事する、という Given/When/Then を 1 つずつ加える | New |

> R-11 Reviewer note: FR5.5 は「記録した時刻（1 月 7 日）が保存される」とし、FR6.3 は「済 1/7 20:00 お母さんが記録」と表示例が加わりましたが、あとから記録したものとその日のうちに記録したものを見分けて残す決まりはなく、FR4.2 の「済 16:42 太郎が記録」の形では、1 月 5 日の担当を 1 月 7 日に記録した時刻が、その日に取り掛かった時刻と区別できません。目的の整理にある「取り掛かる時間の現状を把握する」のデータに混ざります。今回は依頼の対象外のため、そのまま残っています

> R-12 Reviewer note: FR3.5、FR4.4、FR4.5、FR5.2、FR5.8、FR7.2 に Given/When/Then が加わり、NFR3、NFR6、NFR10、NFR11 に確かめ方が加わりました。どれも合否が判断できる書き方です

> R-13 Reviewer note: FR1.5 は、公式アカウントがお知らせ先のグループから外されたとき（退出させられた、グループがなくなった）の動きをまだ書いていません。16 時と月末のお知らせが届かなくなり、FR9.5 の失敗の知らせだけが作り手に届く形になるのかが読めません。今回は依頼の対象外のため、そのまま残っています

> R-14 Reviewer note: FR7.1 で、確定している月の担当はボタンに出さず、今月が確定していて申し出られる担当がないときは「この月は確定済みです」と返事すると決まり、Given/When/Then も加わりました。記録しようとしたとき（FR5.4、FR5.5）と同じ返事で、人の指示どおりです

### Summary

前回の指摘のうち、受け入れ条件の不足（R-12）と確定月の「代わって」の返事（R-14）は、人の指示どおりに直っています。残っている R-11 と R-13、新しい 1 件はどれも軽いもので、設計の段階で決めても大きな手戻りにはならないため、このまま次に進めると判断します。
