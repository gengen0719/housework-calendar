## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-01T12:16:17Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > 全体の構成（Information Architecture） | 作業一覧の Must である IB-1（家族のメンバーの登録と LINE ログイン、家族以外は使えない）に当たる画面や流れがどこにもありません。初めて開いたときに誰がどうやって家族として登録されるのか（母親が子供を登録するのか、招待するのか）、家族以外の人が開いたときに何が表示されるのかが決まっておらず、ほかのすべての画面の前提が描かれていません。 | 最初に開いたときの流れ（母親による家族の登録、子供の参加のしかた）と、家族以外の人が開いたときの表示（「このアプリは家族のメンバーだけが使えます」など）を、画面または流れとして 1 つ追加し、IB-1 と対応づけてください。 | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > T1 と S2 日の詳細 / user-flow.md > F2・F3 | 子供が当日に記録し忘れたとき、または日付が変わってから記録しようとしたときの扱いがありません。T1 は「今日の担当」しか選べず、S2 で母親ができるのは取り消し・「やらなかった」・担当の変更だけで、「済にする」操作がありません。やったのに記録がないお手伝いを直す方法がなく、お小遣いが不正確になるという、解決したい課題そのものが残ります。 | 前日以前の記録を子供が後から付けられるのか、母親が S2 で「済にする」を付けられるのか（成功の目安「母親が代わりに入力しない」との兼ね合いも含めて）を決め、T1・S2・F2・F3 に反映してください。決めない場合は、この場合はお小遣いに数えないことを前提として明記してください。 | New |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > Assumptions & Open Questions / user-flow.md > F4 | 枠の交換（Must の IB-7）は、グループのトークで送った子供を公式アカウントが見分けられることが前提ですが、この前提（範囲の定義と作業一覧に書かれた raid-log の R-3）が今回の書類から抜けています。記録は 1 対 1 のトークに移したので R-3 の影響は記録からは外れましたが、交換にはそのまま残っており、見分けられなかったときの代わりの方法もありません。 | wireframes.md と user-flow.md の前提に、交換は R-3（グループでの送り主の見分け）が前提であることを書き、見分けられなかったときの代わり（例: 1 対 1 のトークやアプリの画面から申し出る）を 1 行で決めてください。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > Assumptions & Open Questions（1 つ目） | Q8 の回答 B は「リッチメニューがグループに出ないとわかった場合」という条件つきでしたが、書類では「グループに出るとわかった場合も 1 対 1 で記録し、グループには知らせない」と、回答の範囲を超えて決めています。また、範囲の定義と作業一覧には IB-5 が「グループのトークで記録」のまま残っています。 | 条件なしで 1 対 1 のトークに決めてよいかを承認のときに確認し、あとの段階で範囲の定義の IB-5 と意図の整理の「記録の通知」が今回の決定で置き換わったことがわかるよう、決定として記録してください。 | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > S4 月の割り当て | 月の途中で S4 をもう一度保存したとき、S2 で直した日ごとの担当や、すでに付いた記録がどうなるか（上書きされるのか、残るのか）が書かれていません。また、担当が 2 人重なったときに「知らせる」だけで、保存できるのか止めるのかがはっきりしません。 | 保存し直したときの日ごとの修正と記録の扱い、担当の重なりが保存を止めるのか警告だけなのかを、それぞれ 1 行で決めてください。 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > S3 お手伝いの種類 | 月の途中で単価を変えたとき、その月のすでに数えた回数の金額が変わるのかが決まっていません。種類を消せるのか、割り当て済みの種類を消したらどうなるのかもありません。 | 単価の変更がいつの記録から効くか、種類の削除を最初の版に入れるかを決め、S3 に書いてください。 | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/user-flow.md > F5 月末のまとめ | 月の最後の日にまとめを送ると、そのあとに付いた最終日の記録や、母親の取り消し・加算・減額がまとめの金額に入りません。グループに届く金額と S5 の金額が食い違うおそれがあります。 | まとめを送る時刻と、送ったあとの修正の扱い（翌月 1 日に送る、送ったあとは確定とする など）を、前提として決めるか、要件の段階で決めることとして明記してください。 | New |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > T2 グループのトーク | 承諾のボタンが子供 1 人につき 1 つ（太郎: 12/4 風呂掃除）しかなく、相手の子供にこれからの担当が複数あるとき、どの担当と交換するのかをどう選ぶのかがわかりません。同じ担当に 2 人が同時に承諾したときの扱いもありません。 | 相手側の担当の選び方（ボタンを担当ごとに並べる、など）と、先に承諾した 1 人だけが成立することを、T2 と F4 に書いてください。 | New |
| R-09 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/ideation/rough-mockups/wireframes.md > S5・S6 の見やすさのメモ | S5 と S6 だけ、画面の領域（header / main / nav）とキーボードで最初にフォーカスが当たる場所が書かれていません。S6 には入力に誤りがあるとき（金額が空、理由が空）の表示もありません。 | S5・S6 の見やすさのメモに領域と最初のフォーカスを足し、S6 に S3 と同じ形の入力エラーの表示を書いてください。 | New |

### Summary

画面ごとの空・読み込み中・失敗の状態や確認の出し方はよく描けており、Q1〜Q8 の回答にも沿っています。ただ、家族の登録とログイン（IB-1）の画面がないこと、記録し忘れを直す方法がないこと、交換がグループでの送り主の見分け（R-3）に頼ったままであることの 3 点は、要件の段階で手戻りになるため、承認の前に判断しておくことをおすすめします。
