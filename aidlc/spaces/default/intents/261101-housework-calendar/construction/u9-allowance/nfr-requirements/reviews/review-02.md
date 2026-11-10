## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/reliability-requirements.md > NFR2.72 の (b) と (c)、および performance-requirements.md > NFR7.53 の (c)、scalability-requirements.md > NFR1.38 の (d) | 月の移動ボタンの押し方に対する要求と確かめが、同時には満たせない。(1) NFR2.72(b) の確かめは「2月→3月と続けて移し、3月の答えが先に届いてから2月の答えが届く」ことを作るので、2月と3月の要求が両方とも飛んでいる必要がある。(2) NFR2.72(c) は「結果が返る前に [>] を3回押しても要求が増えない」ので、読み込み中は2つ目の要求を出せない。(3) NFR7.53(c) と NFR1.38(d) は「月を5回続けて移しても、要求が出る月は最後の1つだけ」なので、最初に押した月の要求も出せない。読み込み中は押しても無視する作りにすると (3) が崩れ（最初の月が要求される）、遅らせてまとめる作りにすると (1) の古い答えが作れず、(2) の説明とも合わない。どの作りを選んでも、3つの確かめのどれかが落ちる。機能設計の BR10.12 に同じ文面があるため、このまま画面を作ると実装者が推測で選ぶことになり、画面と画面のテストの作り直しにつながる | 月の移動の動きを1つの作りに決めて、3か所を同じ言い方にそろえる。例: 「ボタンは読み込み中も押せる。押すたびに目標の月だけを更新し、短い待ち時間（または読み込み完了）のあとで最新の目標の月だけを要求する。要求に番号を付け、古い番号の答えは描かない」。そのうえで、(a) 要求の数の確かめ（5回続けて押したときに何回の要求が出るか）、(b) 古い答えを捨てる確かめ、(c) 二重に要求しない確かめを、その作りで両立する形に書き直す | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/performance-requirements.md > NFR7.55 と「内訳」表の 1b（Families の行）、および tech-stack-decisions.md > 「U9 で変えないこと」の読み取りの項 | 実際のコードと食い違う記述と、実現の道すじの欠けがある。(1)「内訳」表は Families の GetItem を「強い整合性（U3 の既存）」と書くが、listMembers が呼ぶ familyRepository.findById(ctx.familyId) は consistent を渡しておらず、ConsistentRead が付かない（packages/backend/src/services/familyMemberService.ts、repositories/familyRepository.ts を確認）。(2) NFR7.55 は Families の読みを1回に限り、確かめ(4)で「GetItem が1回だけ」とするが、listMembers は Member の配列しか返さず家族の項目を外に出さない。さらに tech-stack-decisions.md は getFamilyCreatedAt に必要な最小の読み取りを足すと書いており、別の GetItem を足す読み方もできて、NFR7.55 と食い違う | 表の整合性の欄を実際に合わせる（作成時刻は変わらないので結果整合で足りる、と理由を書くか、強い整合性にするなら listMembers 側の変更として書く）。1回に限るための形（例: listMembers の内部を家族の項目も返す関数に分け、getFamilyCreatedAt と共有する）を1つ示し、tech-stack-decisions.md の文面もそれに合わせる | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/performance-requirements.md > NFR7.55 の「+2」、NFR7.56 の (a) と「内訳」表の末尾の段数、scalability-requirements.md > NFR3.18 | 抜けた子供の確かめの数字がそろわない。findFamilyChild が NOT_FOUND のときだけ findDisplayName を読むので、2つは順に待つ関係になり、順番に待つ段は「認証→同時の3つ→抜けた子供の確かめ」の3段ではなく4段になる。逆に2つを同時に始める作りなら、同時に動く呼び出しは「3＋k」ではなく3＋2k になり、NFR3.18 の「10並行まで」の確かめ（抜けた子供10人で10以内）に収まらない。NFR7.56(a) の「最大3段」と NFR3.18 の確かめは、字句どおりには同時に通らない | 作りを1つに決めて数字をそろえる（例: 段は最大4段とする、または子供ごとに findFamilyChild から findDisplayName までを1つの連なりとして並行数を10以内に抑える）。NFR7.55、NFR7.56、NFR3.18 の数と単体テストの期待を同じにする | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/security-requirements.md > NFR4.92 と Assumptions の Cache-Control の項、tech-stack-decisions.md > NFR8.19 の (d)(e) | Cache-Control: no-store の理由づけと実現の道すじが実際の構成と合っていない。理由は「Lambda の関数 URL が直接の入口なら既定では途中で保存されない」とあるが、/v1/* は CloudFront の背後にあり、cachePolicy は CACHING_DISABLED（infrastructure/lib/app-stack.ts）なので、途中の保存は元から起きない。また、振り分け表の RouteResult は status と body だけで、json() にもヘッダーを足す口がなく、このヘッダーを付けるには api.ts と lib/http.ts の変更が要るが、NFR8.19 の入口の説明にも契約変更の一覧にも、その変更の置き場所が書かれていない | 理由を「CloudFront は無効化済み。残るのは端末のブラウザの保存で、念のために付ける」と実態に直す。ヘッダーを付ける方法（RouteResult に任意のヘッダーを足す、など）と、その変更が既存の入口の応答を変えないことを NFR8.19 に書く | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/security-requirements.md > NFR4.91 の adjustments の許可リスト | 許可リストが adjustments を adjustmentId、amount、reason だけに固定している。機能設計の entities.md は、U11 が加算・減額の行に項目を足してよい（ここにある項目は消さない）としているので、U11 が項目を足すたびに、許可リストの確かめを U9 側の仕様まで戻って直すことになる | adjustments の許可リストは「U11 が決める。U9 の確かめは adjustments が空であること」とし、U11 の nfr-requirements で許可リストを確定する、と引き継ぎに書く | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/scalability-requirements.md > NFR1.36 と NFR3.18、security-requirements.md > NFR4.89、threat 表の「大量の呼び出し」の行 | 参照が実際とずれている。(1) 同時実行の上限を「U1 の NFR3.6」と書くが、NFR3.6 は U5 の番号で、U1 の要件は NFR1.6。(2) 上限は infrastructure/lib/app.ts で context の reservedConcurrency を渡したときだけ設定され、未指定なら予約されない。「U1 が決めた値のまま」の確かめは、値の出どころ（context かテストの期待値）を決めないと書けない。(3) `scheduled` の Lambda は app-stack.ts にまだなく（U10 が足す）、「line と scheduled の権限が変わらない」という確かめは scheduled が存在する前提で書かれている | 参照を NFR1.6（U1）と NFR3.6（U5）に直す。上限の確かめは「reservedConcurrency の context を渡したときの値が変わらないこと」のように成立する形にする。`scheduled` は「U10 で足される Lambda。U9 の時点では存在しない」と書き、確かめは line と api に限る | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/reliability-requirements.md > NFR2.72 の (b) と (c)（同じ文面が functional-design/rules.md > BR10.12 の (4)(5) と functional-spec.md > F2 手順3 にある） | 「同じ月の要求が飛んでいる間は重ねて出さず、その答えを待つ」と「最新の番号の答えだけを描く」が、次の場面で食い違う。2月の要求（番号1）が遅れて飛んだまま、3月へ移して待ち時間が過ぎ、3月の要求（番号2）が出たあとで、2月に戻した場合。目標の2月は飛んでいる番号1の要求と同じ月なので「待つ」ことになるが、最新の番号は2なので、番号1の答えは古い番号として捨てられ、画面が読み込み中のまま止まりうる。NFR2.72(c) の確かめは待ち時間内に2月へ戻る場面だけで、この場面は覆わない。読み取りだけなので額は壊れないが、実装者が推測で「飛んでいる」の意味を選ぶことになる | 「飛んでいる要求」を「最新の番号を持つ要求」と定義するか、「目標の月が最新の番号の要求の月と同じときだけ重ねない。違うときは新しい番号で出し直す」と書く。NFR2.72 の確かめに「2月の要求が飛んだまま3月の要求が出て、2月に戻したとき、新しい番号の2月の要求が出て描かれること」を足し、BR10.12 の (5) も同じ言い方にそろえる（コード生成までに直せばよい） | New |

> R-01 Reviewer note: 月の移動は「読み込み中も押せる → 目標の月だけ更新 → 最後の押しから 250 ms 後に最新の目標の月だけ要求 → 連番を付け古い番号の答えは捨てる → 同じ月の要求が飛んでいる間は重ねない」の1つの作りにそろった。reliability の NFR2.72(b)(c)、performance の NFR7.53(c)、scalability の NFR1.38(d)、機能設計の BR10.12 の (1)〜(5) と functional-spec F2 手順3、S32 が同じ言い方。確かめも両立する: NFR2.72(b) は待ち時間を過ぎてから2月の要求が飛び、そのあと3月へ移して3月の要求も飛ぶ形で古い答えを作る。NFR7.53・NFR1.38 の「5回続けて押して（250 ms 未満）要求は最新の目標の月で1回」は debounce で成り立つ。NFR2.72(c) の「2月の要求中に [>] [<] で2月に戻る」は待ち時間内なので要求が増えない

> R-02 Reviewer note: performance の内訳表 1b が Families の読みを「結果整合（`ConsistentRead` なし。作成時刻は変わらないので足りる）」に直した。NFR7.55 と tech-stack-decisions.md が `loadFamilyAndMembers` を `listMembers` の内部から分ける形に1つにそろい、確かめ(4)（GetItem が1回）も成り立つ

> R-03 Reviewer note: 順に待つ段を「認証 → 同時の3つ → `findFamilyChild` → `findDisplayName`」の最大4段にそろえた。NFR7.55、NFR7.56(a)、内訳表の末尾、NFR3.18 の確かめ（10人で同時10以内・4段以内）が同じ数。子供ごとの連なりを並行にして同時の呼び出しを10以内に抑える作りも書かれている

> R-04 Reviewer note: NFR4.92 の理由が「CloudFront は CACHING_DISABLED で途中の保存は元から起きない。端末のブラウザの保存への念のための備え」に直った。NFR8.19(d) に `RouteResult` へ任意の `headers` を足す方法と、既存の入口の応答を変えないこと、(e) の契約変更の一覧への記載が入った

> R-05 Reviewer note: NFR4.91 が `adjustments` の許可リストを U9 では「空であること」だけにして、U11 の nfr-requirements で確定する引き継ぎを書いた

> R-06 Reviewer note: 参照が NFR1.6（U1）と NFR3.6（U5）に直った。NFR3.18 の確かめは `reservedConcurrency` の context を渡したときの値が変わらないこと（渡さないときは予約なしのまま）という成り立つ形になった。`scheduled` は「U10 が足す。U9 の時点では存在しない」と書かれ、権限の確かめは `line` と `api` に限られた

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 月の移動の作りの文面の突き合わせ（NFR2.72、NFR7.53、NFR1.38、BR10.12、F2、S32） | PASS（1件の Minor を除く） | 6か所が同じ作りで、debounce 250 ms、連番、同じ月の重ね出しなし、読み込み中も押せる、の4点がそろっている。確かめ同士も、要求の数（5回押して1回）、古い答えを捨てる、二重に出さない、が同時に成り立つ。例外は上の新しい Minor の場面だけ |
| 読み取りの回数・段数・並行の数字の突き合わせ（NFR7.55、NFR7.56、内訳表、NFR3.18、NFR1.37） | PASS | 通常5回、遅れで6回、抜けた子供 k 人で 5+2k、段は最大4段、同時の呼び出しは10以内で全箇所一致 |
| 修正で足した記述と実コードの突き合わせ | 再確認していない | 前回の確認（`familyRepository.findById` に `ConsistentRead` が付かないこと、`RouteResult` に `headers` の口がないこと、`reservedConcurrency` が context 指定のときだけ設定されること）は文書が認めた現状と、今回の記述が合っていることだけを読んで確かめた。コードの再読と単体テストの実行はしていない |
| sensors・単体テスト | 実行していない | 今回の範囲は文書の突き合わせのみ。3秒の目標の実測と費用は文書自身が未測定と書いている |

### Summary

前回の Major（月の移動の作りの矛盾）と5件の Minor はすべて直っており、月の移動の確かめ（NFR2.72、NFR7.53、NFR1.38）は debounce と連番の1つの作りで両立し、機能設計の BR10.12 とも一致する。新しい指摘は Minor 1件（2月の要求が飛んだまま3月へ移って2月に戻す場面で、「重ねない」と「古い番号を捨てる」が食い違う）だけで、ブロックしない。
