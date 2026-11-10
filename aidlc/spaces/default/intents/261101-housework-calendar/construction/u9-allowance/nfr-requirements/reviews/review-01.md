## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/reliability-requirements.md > NFR2.72 の (b) と (c)、および performance-requirements.md > NFR7.53 の (c)、scalability-requirements.md > NFR1.38 の (d) | 月の移動ボタンの押し方に対する要求と確かめが、同時には満たせない。(1) NFR2.72(b) の確かめは「2月→3月と続けて移し、3月の答えが先に届いてから2月の答えが届く」ことを作るので、2月と3月の要求が両方とも飛んでいる必要がある。(2) NFR2.72(c) は「結果が返る前に [>] を3回押しても要求が増えない」ので、読み込み中は2つ目の要求を出せない。(3) NFR7.53(c) と NFR1.38(d) は「月を5回続けて移しても、要求が出る月は最後の1つだけ」なので、最初に押した月の要求も出せない。読み込み中は押しても無視する作りにすると (3) が崩れ（最初の月が要求される）、遅らせてまとめる作りにすると (1) の古い答えが作れず、(2) の説明とも合わない。どの作りを選んでも、3つの確かめのどれかが落ちる。機能設計の BR10.12 に同じ文面があるため、このまま画面を作ると実装者が推測で選ぶことになり、画面と画面のテストの作り直しにつながる | 月の移動の動きを1つの作りに決めて、3か所を同じ言い方にそろえる。例: 「ボタンは読み込み中も押せる。押すたびに目標の月だけを更新し、短い待ち時間（または読み込み完了）のあとで最新の目標の月だけを要求する。要求に番号を付け、古い番号の答えは描かない」。そのうえで、(a) 要求の数の確かめ（5回続けて押したときに何回の要求が出るか）、(b) 古い答えを捨てる確かめ、(c) 二重に要求しない確かめを、その作りで両立する形に書き直す | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/performance-requirements.md > NFR7.55 と「内訳」表の 1b（Families の行）、および tech-stack-decisions.md > 「U9 で変えないこと」の読み取りの項 | 実際のコードと食い違う記述と、実現の道すじの欠けがある。(1)「内訳」表は Families の GetItem を「強い整合性（U3 の既存）」と書くが、listMembers が呼ぶ familyRepository.findById(ctx.familyId) は consistent を渡しておらず、ConsistentRead が付かない（packages/backend/src/services/familyMemberService.ts、repositories/familyRepository.ts を確認）。(2) NFR7.55 は Families の読みを1回に限り、確かめ(4)で「GetItem が1回だけ」とするが、listMembers は Member の配列しか返さず家族の項目を外に出さない。さらに tech-stack-decisions.md は getFamilyCreatedAt に必要な最小の読み取りを足すと書いており、別の GetItem を足す読み方もできて、NFR7.55 と食い違う | 表の整合性の欄を実際に合わせる（作成時刻は変わらないので結果整合で足りる、と理由を書くか、強い整合性にするなら listMembers 側の変更として書く）。1回に限るための形（例: listMembers の内部を家族の項目も返す関数に分け、getFamilyCreatedAt と共有する）を1つ示し、tech-stack-decisions.md の文面もそれに合わせる | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/performance-requirements.md > NFR7.55 の「+2」、NFR7.56 の (a) と「内訳」表の末尾の段数、scalability-requirements.md > NFR3.18 | 抜けた子供の確かめの数字がそろわない。findFamilyChild が NOT_FOUND のときだけ findDisplayName を読むので、2つは順に待つ関係になり、順番に待つ段は「認証→同時の3つ→抜けた子供の確かめ」の3段ではなく4段になる。逆に2つを同時に始める作りなら、同時に動く呼び出しは「3＋k」ではなく3＋2k になり、NFR3.18 の「10並行まで」の確かめ（抜けた子供10人で10以内）に収まらない。NFR7.56(a) の「最大3段」と NFR3.18 の確かめは、字句どおりには同時に通らない | 作りを1つに決めて数字をそろえる（例: 段は最大4段とする、または子供ごとに findFamilyChild から findDisplayName までを1つの連なりとして並行数を10以内に抑える）。NFR7.55、NFR7.56、NFR3.18 の数と単体テストの期待を同じにする | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/security-requirements.md > NFR4.92 と Assumptions の Cache-Control の項、tech-stack-decisions.md > NFR8.19 の (d)(e) | Cache-Control: no-store の理由づけと実現の道すじが実際の構成と合っていない。理由は「Lambda の関数 URL が直接の入口なら既定では途中で保存されない」とあるが、/v1/* は CloudFront の背後にあり、cachePolicy は CACHING_DISABLED（infrastructure/lib/app-stack.ts）なので、途中の保存は元から起きない。また、振り分け表の RouteResult は status と body だけで、json() にもヘッダーを足す口がなく、このヘッダーを付けるには api.ts と lib/http.ts の変更が要るが、NFR8.19 の入口の説明にも契約変更の一覧にも、その変更の置き場所が書かれていない | 理由を「CloudFront は無効化済み。残るのは端末のブラウザの保存で、念のために付ける」と実態に直す。ヘッダーを付ける方法（RouteResult に任意のヘッダーを足す、など）と、その変更が既存の入口の応答を変えないことを NFR8.19 に書く | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/security-requirements.md > NFR4.91 の adjustments の許可リスト | 許可リストが adjustments を adjustmentId、amount、reason だけに固定している。機能設計の entities.md は、U11 が加算・減額の行に項目を足してよい（ここにある項目は消さない）としているので、U11 が項目を足すたびに、許可リストの確かめを U9 側の仕様まで戻って直すことになる | adjustments の許可リストは「U11 が決める。U9 の確かめは adjustments が空であること」とし、U11 の nfr-requirements で許可リストを確定する、と引き継ぎに書く | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-requirements/scalability-requirements.md > NFR1.36 と NFR3.18、security-requirements.md > NFR4.89、threat 表の「大量の呼び出し」の行 | 参照が実際とずれている。(1) 同時実行の上限を「U1 の NFR3.6」と書くが、NFR3.6 は U5 の番号で、U1 の要件は NFR1.6。(2) 上限は infrastructure/lib/app.ts で context の reservedConcurrency を渡したときだけ設定され、未指定なら予約されない。「U1 が決めた値のまま」の確かめは、値の出どころ（context かテストの期待値）を決めないと書けない。(3) `scheduled` の Lambda は app-stack.ts にまだなく（U10 が足す）、「line と scheduled の権限が変わらない」という確かめは scheduled が存在する前提で書かれている | 参照を NFR1.6（U1）と NFR3.6（U5）に直す。上限の確かめは「reservedConcurrency の context を渡したときの値が変わらないこと」のように成立する形にする。`scheduled` は「U10 で足される Lambda。U9 の時点では存在しない」と書き、確かめは line と api に限る | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| ID の連番の確認（u1〜u9 の nfr-requirements の表の ID を集計） | PASS | U9 の ID は U8 の続き。NFR1.36〜38、2.67〜77、3.17〜19、4.86〜93、5.16〜17、6.10、7.50〜58、8.17〜19、9.10〜12、10.11〜12、11.10〜11。U8 の最大（1.35、2.66、3.16、4.85、5.15、6.9、7.49、8.16、9.9、10.10、11.9）の次から始まり、欠けも重なりもない |
| traceability.json の読み込みと表の対応 | PASS | JSON として読め、coverage は NFR1〜NFR11 の11件、reverse は25件。BR10.1、2、6〜17、19 と AC が各ファイルの ID と対応している（BR10.3〜5、18 は計算と U11 の引き継ぎで、NFR の対応先を置かない扱い） |
| 参照した過去の NFR の存在確認（U5 の NFR7.20・21・24、U6 の NFR7.27・30、U7 の NFR7.36、U8 の NFR7.43・44・46・48・49、NFR2.66 ほか） | PASS（一部の帰属に誤り） | 参照先は存在し、内容も合っている。ただし NFR3.6 を U1 のものとして引く箇所は誤り（上の Minor） |
| 実コードの突き合わせ（requireAuth、requireMembership、familyMemberService.listMembers・findFamilyChild、userRepository.listByFamily、calendarRepository.loadMonth、entries/api.ts、parseMonth、app-stack.ts の権限） | 一部不一致 | 次は確認できた。(a) 確かめの順番（セッション→ブロック中 403 NOT_FRIEND→メンバー 403 NOT_FAMILY_MEMBER→月の形 422）。(b) FamilyContext.role は admin／child だけで、system は型にない。(c) 月の Query は ConsistentRead で続きのページも読む。(d) 認証の読みは Users の GetItem が1回。(e) api の権限は Users GetItem と familyId-index Query、Families GetItem、ChoreTypes Query、Calendar Query で足りており、U9 での追加は不要（NFR4.89 の見込みは正しい）。(f) parseMonth は `^\d{4}-\d{2}$` かつ年2000〜2100。不一致は Families の読みが強い整合性でない点（上の Minor）と RouteResult にヘッダーの口がない点 |
| 自動の検査（sensors）と単体テストの実行 | 実行していない | レビューの範囲は文書の突き合わせと読み取り専用のコード確認。3秒の目標、読み取りの回数の実測、費用の見積もり（NFR1.37 の料金単価）は、文書自身が未測定・未確認と書いており、私も確かめていない |

### Summary

NFR の番号の連続、権限（api に追加が要らないこと）、確かめの順番、読み取りの内訳の大筋（通常5回、担当の数で増えない）は、実際のコードと合っており、0円の前提も新しい課金対象を足さない形で守られている。ただし、月の移動ボタンの要求の出し方について、NFR2.72、NFR7.53、NFR1.38 の確かめが同時に満たせないため、画面の作りを決めてから書き直す必要がある（Major 1件）。Families の整合性の記述、抜けた子供の段数、Cache-Control の経路、参照の帰属は Minor で、同じ直しのなかで合わせられる。
