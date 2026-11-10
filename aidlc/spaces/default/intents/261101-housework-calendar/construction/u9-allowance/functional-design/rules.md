# 業務の決まり（Rules）— U9 お小遣いの額

U9（`u9-allowance`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U8 の決まり（BR1.x〜BR9.x）はそのまま使い、ここでは U9 で足す決まりを BR10.x として書きます。日付と「今日」は日本時間です（NFR11）。「今」は、要求の入口で 1 回だけ取る裏側の時計の時刻です（画面や端末の時計は使いません）。U9 は**読み取りだけ**で、何も書きません。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR10.1
    statement: お小遣いの額と内訳は、家族のメンバーなら全員（管理者も子供も）が、家族の全員分を見られる。トークで額を返す機能は作らない
    category: authorization
    applies_to: GET /months/{month}/allowances、C9 getAllowances、お小遣いの画面 S5
    trigger: 要求が届いたとき、画面を開くとき
    logic: >-
      入口は U1 の共通の確かめ（セッション → ブロック中でないこと → 家族のメンバー。requireAuth → requireMembership）を通す。管理者でなくてもよい。
      IF セッションがない THEN 401。IF ブロック中 THEN 403 NOT_FRIEND。IF 家族のメンバーでない THEN 403 NOT_FAMILY_MEMBER で、額も内訳も返さない（AC1.1.11）。
      通ったら、その家族の子供全員の行を返す。自分の行だけに絞らない（FR4.3、AC4.1.3 「太郎と次郎のお小遣い額も表示される」）。
      見る家族は、セッションの利用者から決める（C6 の familyScope）。要求の URL や本文で家族や子供を指定する項目はなく、
      ほかの家族のデータに届く道がない（ほかの家族の月や子供を指す入力がないので、NOT_FOUND が起きる場面もない）。
      U11 の加算・減額が子供の ID を受け取るときは、U11 が C6 の isChildOfFamily で確かめる。
      LINE のトークで「お小遣い」と送って額を返す機能は作らない [Q5]。額は画面と、月末のまとめ（U10）で見る
    violation: 401、403 NOT_FRIEND、403 NOT_FAMILY_MEMBER
    source: FR4.3、FR1.7、NFR4、AC1.1.11、AC4.1.3、Q5
  - id: BR10.2
    statement: 額に数えるのは、状態が「済」の担当だけ。金額は担当に書き写された単価から計算し、額と回数は保存しない
    category: calculation
    applies_to: C9 getAllowances、C8 listDoneDuties
    trigger: お小遣いを読むたび
    logic: >-
      ある月の担当のうち status が done のものだけを集める（C8 listDoneDuties。月は担当の日付 date の月。記録した時刻の月ではない）。
      todo（未）と skipped（×）は数えない。
      金額は、その担当に書き写された unitPrice だけで決める。種類の今の単価（C7）は読まない（FR2.2、ADR-003）。
      額も回数も保存しない。読むたびに計算し直す（ADR-005）ので、記録・取り消し・やらなかったにする・済にする・確定の取り消し・代わりにやるのあとに読み直せば、
      その時点の「済」だけが数に入り、ずれが残らない（FR6.1、FR5.8）。
      例: 12 月 31 日の担当を 1 月 2 日に記録したときは、12 月の額に入る（date の月で決める）。
      例: 皿洗いを 100 円のとき 3 回記録したあとに単価を 120 円に変え、そのあと 1 回記録すると、100 円が 3 回と 120 円が 1 回で数える（AC8.1.4）
    violation: なし（計算の決まり）
    source: FR8.1、FR5.8、FR2.2、FR6.1、ADR-003、ADR-005、AC8.1.1、AC8.1.4、AC5.1.13
  - id: BR10.3
    statement: 額を入れる子供は、担当の子供（childUserId）。記録した人が誰でも変わらない
    category: calculation
    applies_to: 内訳の集計
    trigger: BR10.2 で集めた「済」の担当を子供ごとに分けるとき
    logic: >-
      各担当を、その担当の childUserId の子供の額に入れる [Q1]。記録した人（recordedBy）は見ない。
      母親が日の詳細から「済にする」を押した担当（記録した人は管理者）も、担当の子供の額に入る（U7）。
      代わりにやる（U8）で引き受けた担当は、引き受けた時点で childUserId が引き受けた子供に変わっているので、引き受けた子供の額に入る。
      担当の子供を変えられるのは「未」のときだけなので、「済」の担当の childUserId は「済」の間は変わらない。
      「済」を取り消して「未」に戻し、担当の子供を変えて、もう一度「済」にしたときは、そのときの担当の子供の額に入る（読むたびの計算なので、昔の入れ先は残らない）
    violation: なし（計算の決まり）
    source: FR8.1、FR6.3、FR7.3、Q1、U8 の決まり
  - id: BR10.4
    statement: 内訳の行は「種類の ID × 単価」ごとに 1 行。名前は種類の今の名前。種類の並び順、同じ種類のなかでは単価の低い順に並べる
    category: calculation
    applies_to: 内訳の行（AllowanceChoreLine）の作り方
    trigger: BR10.3 で子供ごとに分けたあと
    logic: >-
      子供ごとに、「済」の担当を (choreTypeId, unitPrice) でまとめる。件数が count、小計が amount = unitPrice × count（円の整数）。count が 0 の行は作らない。
      種類の ID でまとめるので、種類の名前を変えても同じ種類の行は分かれない。月の途中で単価が変わったときだけ、同じ種類でも単価ごとに行が分かれる [Q3]（AC8.1.4、FR2.2）。
      行に出す名前は、C7 の list が返す種類の今の名前。「使わない」にした種類も同じように名前を出す（FR2.3、AC2.1.5）。
      並び順は、1. 種類の並び（C7 の list の並び = 「使う」を登録した順、続けて「使わない」を同じ順）、2. 同じ種類のなかでは単価の低い順 [Q3]。
      単価 0 円の行も出す（0 円 x N回 = 0円）。
      種類が一覧にない（起きない前提。使われた種類は消せない）ときは、名前を「不明なお手伝い」にして一覧の最後に並べ、ログに残す（BR10.13）。
      子供の合計は全行の和（BR10.5）
    violation: なし（計算の決まり）
    source: FR8.1、FR2.2、FR2.3、AC8.1.1、AC8.1.4、AC2.1.5、Q3
  - id: BR10.5
    statement: 子供の合計は、内訳の行の小計の和に加算・減額の行の金額の和を足したもの。円の整数で、0 円を下回っても 0 円にそろえない。合計は窓口が計算して返す
    category: calculation
    applies_to: C9 getAllowances の total、画面の合計
    trigger: 内訳の行が決まったあと
    logic: >-
      total = (lines の amount の和) + (adjustments の amount の和)。U9 では adjustments が常に空なので、total は lines の和 [Q6]。
      金額はすべて円の整数。小数を作る計算はない（unitPrice も count も整数）。
      合計が 0 円を下回るとき（U11 の減額）も、計算どおりのマイナスをそのまま返し、0 円にそろえない（FR8.3、AC8.2.7）。
      U9 の中で金額を 0 円以上に直す処理を書かない（テストで、減額の行を前提データで入れた答えが -200 になることを確かめる）。
      合計は窓口が計算して返し、呼び出し側（画面・U10）は足し算をしない [Q6]。
      例: 皿洗い 100 円 x 8 回と風呂掃除 150 円 x 4 回は、800 円・600 円、合計 1,400 円（AC8.1.1）
    violation: なし（計算の決まり）
    source: FR8.1、FR8.3、Q6、AC8.1.1、AC8.1.3
  - id: BR10.6
    statement: 行を出す子供は、今いる子供の全員と、その月に「済」の担当がある子供。管理者は出さない。並びは家族に入った順
    category: policy
    applies_to: 子供の範囲と並び順
    trigger: 答え（Allowance の配列）を作るとき
    logic: >-
      対象の子供 = (C6 listMembers の今いる子供) ∪ (その月に「済」の担当を持つ子供) [Q2]。管理者は担当を持たないので出さない。
      今いる子供は、その月の記録がなくても出す。記録がなければ lines も adjustments も空で total は 0（AC8.1.2、BR10.10）。
      抜けた（外された）子供で、その月に「済」の担当があれば、名前つきで出す。記録がなければ出さない。名前の読み方は BR10.19。
      担当に出てくる子供が listMembers の一覧にいなければ、まず listMembers の管理者の一覧と突き合わせる（管理者の ID なら行を作らず、BR10.13 の 3 番のログだけを残す）。管理者でなければ、強い整合性で 1 人ずつ確かめる（C6 findFamilyChild。今も家族の子供なら current: true で出す。U5 の buildMonthCalendar と同じ）。
      並び順は、今いる子供を listMembers の順（家族に入った順。同じ時刻は表示名、userId の順）、そのあとに抜けた子供を表示名、userId の順 [Q2]。
      家族に入った直後の子供が結果整合の一覧にまだ出ず、記録もない場合は、一覧が追いつくまでの数秒、行が出ないことがある（許容する。BR10.13 の前提）。
      月は問わない。家族に入る前の月でも、今いる子供の行は 0 円で出す
    violation: なし（表示の決まり）
    source: FR8.1、FR4.3、AC8.1.2、Q2
  - id: BR10.7
    statement: 窓口 getAllowances(ctx, month) は Allowance の配列を返す。1 人分は「子供、内訳の行、加算・減額の行、合計」で、加算・減額の行は U9 では常に空。U11 は行を入れるだけで呼び出し側は変わらない
    category: constraint
    applies_to: C9 getAllowances、GET /months/{month}/allowances、U10 の月末のまとめ、U11
    trigger: 画面・U10 が額を読むとき
    logic: >-
      getAllowances(ctx, month) は Allowance[] を返す（契約のまま）。1 人分は childUserId・displayName・current・month・lines・adjustments・total [Q6]（entities.md）。
      呼べるのは、ctx が { familyId, userId, role } の画面の入口と、{ familyId, role: system } のお知らせ用の入口（U10）。管理者である必要はない。
      家族は ctx.familyId で決まり、引数で家族を渡さない。
      加算・減額の行の取り方は、計算の中の差し込み口（子供ごとの加算・減額の行を返す関数）で受け取る。U9 の既定は「どの子供にも空」。U11 がこの差し込み口に本物を取り付ける。
      U11 を作らない場合は、差し込み口は空のままで、加算・減額なしの額がそのまま答えになる（unit-of-work.md）。
      画面用 API は、この Allowance[] に見出しの値を添えた AllowanceMonthView を返す（functional-spec.md の API の形）。
      予期しない失敗（読み取りが失敗したとき）は、一部だけ返さず、投げる（入口が受け止めて 500 INTERNAL にする。U10 は送信前に失敗に気づく）
    violation: 500 INTERNAL（入口。窓口は投げる）
    source: FR8.1、Q6、ADR-005、unit-of-work.md の U9
  - id: BR10.8
    statement: 月は日本時間の YYYY-MM（current も可）。画面は日本時間の今月で開き、家族が作られた月から翌月までを移れる。裏側は範囲外の月も計算できるが、形の違う月は 422 で断る
    category: validation
    applies_to: GET /months/{month}/allowances のパスの月、画面の月の移動
    trigger: 要求が届いたとき、[<] [>] を押したとき
    logic: >-
      パスの月は YYYY-MM（年 2000〜2100、月 01〜12）。形が違えば、DynamoDB を読む前に 422 INVALID_MONTH（U5 の requireMonthParam と同じ）。
      確かめの順番は、セッション → ブロック中 → 家族のメンバー → 月の形（U5 の getCalendar と同じ）。
      パスの月には、YYYY-MM のほかに current も使える。current は、裏側の日本時間の今日の月として扱う（形の確かめは通り、答えの month には実際の YYYY-MM を入れる）。S5 を S1 を経由せず直接開いたとき（ブックマークなど）は、current で 1 回だけ呼べば today も month も答えに入っているので、先にカレンダーを呼ぶ必要はない。
      画面は、S1 から開くときは S1 のカレンダーの答えが持つ today（裏側の日本時間の今日）の月で、直接開くときは current で開く。月を移す [<] [>] は、firstMonth（家族が作られた月）から lastMonth（今日の月の翌月）まで [Q4]。
      端の月では、押せなくする（無効にして、押しても何も起きない。色だけでなく見た目と読み上げでも無効だと分かるようにする。NFR9）。
      範囲外の月を直接指定された場合、裏側は断らない（範囲の判断は見せ方で、データの安全にかかわらないため）。計算して、その月の答えを返す（記録がなければ今いる子供が 0 円）。
      「確定していない月」と「未来の月」の見出しに、「暫定」などの別の言葉や色を足さない [Q4]。
      firstMonth は家族の作成時刻（UTC）を日本時間の月にしたもの。lastMonth は today の月を 1 か月進めたもの。どちらも裏側で計算して返す
    violation: 422 INVALID_MONTH
    source: NFR11、Q4、FR8.1
  - id: BR10.9
    statement: 画面の見出しに、その月が「確定していません」か「確定済み」かを出す。確定の有無で額の計算は変わらない
    category: policy
    applies_to: 画面 S5 の見出し、AllowanceMonthView.confirmed
    trigger: お小遣いの画面を開くとき、月を移すとき
    logic: >-
      裏側は月の状態の confirmed を読み（行がまだ無い月は false）、AllowanceMonthView.confirmed に入れる。
      見出しの下に、false なら「確定していません」、true なら「確定済み」（U5 の MONTH_CONFIRMED_LABEL と同じ文言）を文字で出す。色だけで伝えない（NFR9）。
      確定していない月の額は、あとから記録や取り消しで変わりうる。確定している月は担当と記録が変わらないので、読み直しても額は変わらない（FR6.5）。
      どちらの月も同じ計算で出し、「途中の金額です」などの添え書きは足さない [Q4]。
      月末の 21 時のまとめ（U10）は確定前にも送られ、届いた額と画面が違うことがある（AC9.1.6）。U9 はまとめを送らず、それを埋める処理も持たない。
      この単位では「この月を確定する」「確定を取り消す」のボタンを S5 に置かない（U7 がカレンダーの月の見出しの近くに置いた。BR8.13）。S5 は確定の状態を表示するだけ
    violation: なし（表示の決まり）
    source: FR6.5、FR8.1、AC9.1.6、Q4
  - id: BR10.10
    statement: 記録のない子供には「今月の記録はまだありません（0 円）」を出し、合計は 0 円。子供が 1 人もいない家族には案内を出す
    category: policy
    applies_to: 画面 S5 の子供ごとの行
    trigger: lines も adjustments も空の Allowance を描くとき
    logic: >-
      lines も adjustments も空の子供は、その行の合計を「0円」とし、内訳の場所に「今月の記録はまだありません（0 円）」を出す（AC8.1.2）。
      見ている月が今日の月でないときは、「今月」を「この月」にして「この月の記録はまだありません（0 円）」を出す（文の意味が合うように）。
      lines が空でなければ（0 円の種類の行だけでも）、この文は出さず、行をそのまま出す。
      allowances が空（家族に子供がひとりもいなくて、その月の記録もない）のときは、「お小遣いを表示する子供がまだいません」を出す。
      この 2 つの文は、行の合計の「0円」の表示と合わせて、状態を色だけで伝えない
    violation: なし（表示の決まり）
    source: FR8.1、AC8.1.2
  - id: BR10.11
    statement: 金額は円の整数でそろえて表示する。内訳は「種類 単価 x 回数 = 小計」、合計は子供の見出しの横に出す。子供が見るときは自分の行を太字と緑の枠で目立たせ、文字でも示す
    category: policy
    applies_to: 画面 S5 の表示
    trigger: お小遣いの画面を描くとき
    logic: >-
      金額は桁区切りの円の整数で出す（例 1,400円）。マイナスは「-200円」と記号つきで出し、0 円にそろえない（FR8.3）。
      内訳の 1 行は「{種類の名前} {単価}円 x {回数}回 = {小計}円」（例 皿洗い 100円 x 8回 = 800円。mockups.md の S5）。単価が変わった月は、単価ごとに行が分かれて並ぶ（例 皿洗い 100円 x 3回、皿洗い 120円 x 1回）。
      各子供の行は見出し（h2）で、名前と合計を横に並べる。
      ログインしているのが子供のとき、自分の行を太字と緑の枠で目立たせ、色に頼らないように行の見出しに「（あなた）」を添える（Q5 のとおり母親も子供も同じ画面で見る。NFR9）。
      管理者が見るときは目立たせない。
      文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上、状態は文字でも表す（NFR9、AC4.1.7）。
      加算・減額の行は、この単位では描かない（adjustments が常に空なため）。合計は Allowance.total をそのまま出す（画面で足し算しない）。U11 が描き方を足す
    violation: なし（表示の決まり）
    source: FR8.1、FR8.3、NFR9、AC8.1.1、AC8.1.3、AC4.1.7、Q5
  - id: BR10.12
    statement: 記録や修正のあとに画面を開き直したり月を移したりすると、最新の「済」で計算し直した額が出る。強い整合性で読み、保存した合計を使わない
    category: calculation
    applies_to: 担当と月の状態の読み取り、画面の読み直し
    trigger: 記録（U6）・状態の変更（U7）・代わりにやる（U8）のあとにお小遣いを読むとき
    logic: >-
      担当の Query と月の状態の読み取りは強い整合性（ConsistentRead）で行う（U5・U6 と同じ）。
      記録が成功した直後に読めば、その担当は「済」で unitPrice つきなので、すぐ回数と金額に入る（FR5.8、AC5.1.13）。
      取り消した・やらなかったにした直後は、「済」でなくなっているので、すぐ外れる。
      画面は、開いたとき、月を移したとき、「読み込み直す」を押したときに読み、自動で定期的に読み直さない。
      月の移動の作りは次の 1 つに決める。(1) [<] [>] は読み込み中も押せる（端の月で無効なときを除く）。
      (2) 押すたびに「目標の月」だけを更新し、その場では要求を出さない。(3) 最後の押しから短い待ち時間（250 ms）が過ぎたら、最新の目標の月だけを要求する（途中の月は要求しない）。
      (4) 要求には連番を付け、画面は最新の番号の答えだけを描く。古い番号の答えが遅れて届いても捨てる。
      (5) 「飛んでいる要求（in-flight）」は、連番が最も新しい要求のこと（新しい要求を出すときに取り消された〔破棄された〕古い要求は数えない）。最新の連番の要求の月が目標の月と同じときだけ、重ねて出さない（その答えを待つ）。違う月のとき（例: 2 月の要求のあと 3 月の要求を出し、2 月へ戻る）は、新しい連番で 2 月の要求を出し、その答えを描く（古い連番の 2 月の要求の答えは捨てる）
    violation: なし（読み取りの決まり）
    source: FR5.8、FR8.1、AC5.1.13、ADR-005
  - id: BR10.13
    statement: 読み取りの失敗と、あり得ないデータは、一部だけ返さない。画面は理由の文言と読み込み直しを出す。異常な担当は数えずにログへ残す
    category: policy
    applies_to: GET /months/{month}/allowances、画面
    trigger: 読み取りの失敗、異常なデータの検出
    logic: >-
      思いがけない失敗（DynamoDB に接続できない等）は、500 INTERNAL。画面は「表示できませんでした。もう一度お試しください」と「読み込み直す」を出す（FR4.5 の文言。AC4.1.5 と同じ）。
      読み取り専用なので、何も中途半端に残らない。「読み込み直す」を押せば、今の状態から計算し直す。
      422 INVALID_MONTH は画面からは起きない（[<] [>] は範囲内の月だけ作る）。起きたら「月の指定が正しくありません」を出す。
      401 は画面の共通の扱い（ログインし直し）、403 NOT_FAMILY_MEMBER は「このアプリは家族のメンバーだけが使えます」（U1）。
      あり得ないデータは、次のとおり扱う。
      1. 「済」なのに unitPrice が空（`undefined` または `null` のときだけ。0 円は有効な値で、空ではない。U6・U7 の不変条件に反する）→ その担当は数えず、ログに ALLOWANCE_DUTY_WITHOUT_PRICE（familyId、dutyId）を残す。画面は止めない。
      2. 「済」の担当の種類が C7 の一覧にない → 名前を「不明なお手伝い」にして出し、ログに ALLOWANCE_CHORE_TYPE_MISSING（familyId、choreTypeId）を残す。
      3. 担当の子供が管理者のユーザー ID → 行を作らず、ログに ALLOWANCE_DUTY_OWNER_NOT_CHILD（familyId、dutyId）を残す。管理者かどうかは、listMembers の管理者（role が admin）の一覧に childUserId があるかで先に判断する（findFamilyChild は、利用者がいない・ほかの家族・管理者のどれも同じ NOT_FOUND を返すので、見分けに使わない）。0 円の担当は異常ではなく、ログも残さない。
      1.〜3. はいずれも「作り手に知らせる」対象で、通常の流れでは起きない。起きたら画面の額が実際より少なくなりうるので、ログの警告から調べる（本番のデータは手で直さず、コードや手順で直す。NFR6）
    violation: 500 INTERNAL、401、403 NOT_FAMILY_MEMBER、422 INVALID_MONTH
    source: FR4.5、NFR2、NFR6、AC4.1.5
  - id: BR10.14
    statement: U9 は読み取りだけで、保存先も権限も環境変数も原則足さない。足りない権限があれば、コード生成で app-stack.ts を確かめたうえで、その差分だけを U9 で足す。同じ読み取りを何度繰り返しても結果が同じ
    category: constraint
    applies_to: U9 全体
    trigger: すべて
    logic: >-
      U9 は DynamoDB に書かない。新しいテーブル・索引・TTL・権限・環境変数は原則足さない（U5〜U8 で足し済みのものを使う）。
      読み取りは、Calendar の Query と GetItem、ChoreTypes の Query、Users と Families の GetItem・Query（C6 経由）。
      足りているかは、コード生成で infrastructure/lib/app-stack.ts を読んで確かめ、足りない権限があれば、その差分だけを U9 で足す（CDK のテストの期待に入れる）。
      状態が変わらない読み取りなので、同じ要求を 2 回送られても、その間に記録や修正がなければ同じ答えが返る。
      Idempotency-Key は要らない（GET）
    violation: なし
    source: NFR1、NFR4、ADR-005、unit-of-work.md の U9
  - id: BR10.15
    statement: ログには読み取りの事実だけを残し、名前・金額・秘密の情報は残さない
    category: policy
    applies_to: ログ
    trigger: お小遣いを読んだとき、異常を見つけたとき
    logic: >-
      ALLOWANCE_COMPUTED（familyId、month、childCount、lineCount、dutyCount）を、要求の測定値（setRequestMetrics の dutyCount）とともに残す。
      異常のログは BR10.13 の 3 種類（ALLOWANCE_DUTY_WITHOUT_PRICE、ALLOWANCE_CHORE_TYPE_MISSING、ALLOWANCE_DUTY_OWNER_NOT_CHILD）。
      子供や管理者の表示名、お手伝いの名前、LINE のユーザー ID、単価や額の値、秘密の情報（例 <作り物の値>）は残さない
    violation: なし
    source: NFR2、NFR4、NFR5
  - id: BR10.16
    statement: 画面の表示は 95% が 3 秒以内。読み取りは並行にして、担当の数で回数を増やさない
    category: constraint
    applies_to: GET /months/{month}/allowances
    trigger: お小遣いの画面を開くとき
    logic: >-
      月の項目の Query（担当と月の状態。強い整合性。続きがあれば最後まで読む）、C6 の listMembers、C7 の list、家族の作成時刻の読み取りを同時に始め、メモリで突き合わせる。
      担当に出てくる子供が一覧にいないときだけ、追加で 1 人ずつ読む（まれ）。
      集計はメモリの 1 回の走査（担当の数に比例）。家族 4 人・1 か月の担当（多くて数百件）で NFR7 の 3 秒に収まる。
      Families の読みは 1 回にまとめる（listMembers と getFamilyCreatedAt が同じ項目を別々に読まない実装にする）。
      S5 を直接開く場合は current で 1 回の呼び出しだけで済む（今日の月の判断に、カレンダーの先読みは要らない）。S1 から開く場合も 1 回。
      計測はステージングで画面を 20 回開き、19 回以上が 3 秒以内（NFR7）。S1 から開く場合と、S5 を直接開く場合（current）の両方を数える。コード生成の後の確かめで行う
    violation: なし（目安）
    source: NFR7、NFR1
  - id: BR10.17
    statement: 月末のまとめ（U10）は、窓口 getAllowances を呼んで金額を取る。U9 はまとめを送らず、まとめのために別の計算を持たない
    category: policy
    applies_to: C9 getAllowances、U10
    trigger: U10 が月の最後の日の 21 時に起動したとき
    logic: >-
      金額の元は 1 つだけにする。U10 は { familyId, role: system } の ctx で getAllowances(ctx, 月) を呼び、各 Allowance の displayName と total を使ってまとめを作る（AC9.1.5）。
      U9 は送信しない（FR9.2 は U10）。getAllowances は失敗したら投げる（一部だけ返さない）ので、U10 は送る前に失敗に気づき、送信の失敗と同じ 15 分以内の知らせの仕組みに乗せられる（FR9.5、NFR2）。
      まとめを送ったあとに記録が変わったとき、まとめは送り直さず、画面の額が新しい額になる（AC9.1.6）。
      抜けた子供（current: false）をまとめに含めるかは U10 が決める。U9 は current で見分けられる形で返す
    violation: なし
    source: FR9.2、FR9.3、FR9.5、AC9.1.5、AC9.1.6、unit-of-work.md の U9・U10
  - id: BR10.18
    statement: U11 の加算・減額は、差し込み口と答えの adjustments・total に足す。確定している月の加算・減額を断るのは U11 で、U9 は確定の有無を渡す
    category: policy
    applies_to: C9、U11
    trigger: U11 を作るとき
    logic: >-
      U11 は、BR10.7 の差し込み口に「子供ごとの加算・減額の行」を返す本物を取り付け、adjustments に行を入れる。total は U9 の計算式（BR10.5）が足す。画面・U10 は直さない。
      U11 を外しても、U9 は差し込み口が空のまま動く。
      確定している月の加算・減額の追加と削除を MONTH_CONFIRMED で断るのは U11（AC8.2.5）。U9 は、そのために C8 isMonthConfirmed を実装し、AllowanceMonthView.confirmed で画面に確定の有無を渡す。
      画面 S5 の「加算・減額を入れる」「消す」のボタンは U11 が足す（確定している月は出さない）。U9 は足さない。
      減額で合計がマイナスになる表示（AC8.2.6、AC8.2.7）は U11 で確かめる。AC8.2.6 の内訳の「-200円」は、adjustments の行として描く（lines には入れない。U11 への引き継ぎ）。U9 の計算と表示は、マイナスをそのまま通せる作りにしておく（BR10.5、BR10.11）
    violation: なし
    source: FR8.2、FR6.5、AC8.2.5、AC8.2.6、AC8.2.7、unit-of-work.md の U9・U11
  - id: BR10.19
    statement: 抜けた子供の名前は、家族の担当に出てくる利用者の表示名だけを読んで出す。読めないときは代わりの文言を出す
    category: policy
    applies_to: 抜けた（外された）子供の行
    trigger: BR10.6 で、今のメンバーにいない子供の行を出すとき
    logic: >-
      担当（家族のデータ）に子供の ID が出ているので、その ID の利用者の表示名だけを C6 の窓口（findDisplayName）で強い整合性で読む。ほかの情報は読まない・返さない。
      読めた表示名をそのまま行の見出しに出し、current は false にする。
      利用者が見つからないときは、見出しを「名前が分からない子供」にする。
      ほかの家族の利用者にならないよう、窓口は、呼び出し側が渡した ID が ctx の家族の担当に出てきたものだけであることを前提にする（U9 以外からは呼ばない）
    violation: なし（表示の決まり）
    source: FR8.1、Q2、NFR4
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR10.1 | 家族の全員が全員分を見られる。トークでは返さない | 権限 | FR4.3、NFR4、Q5 |
| BR10.2 | 数えるのは「済」だけ。書き写した単価で計算し、保存しない | 計算 | FR8.1、FR2.2、FR5.8、ADR-005 |
| BR10.3 | 額は担当の子供に入れる（記録した人は見ない） | 計算 | FR8.1、Q1 |
| BR10.4 | 内訳は種類の ID × 単価ごと。名前は今の名前。種類の並び、単価の低い順 | 計算 | FR8.1、FR2.2、FR2.3、Q3 |
| BR10.5 | 合計は全行の和。円の整数、マイナスもそのまま。窓口が計算する | 計算 | FR8.1、FR8.3、Q6 |
| BR10.6 | 今いる子供と記録のある子供。管理者は出さない。家族に入った順 | 方針 | FR8.1、FR4.3、Q2 |
| BR10.7 | 窓口 `getAllowances` の答えの形。加算・減額の行は U9 では空 | 制約 | Q6、ADR-005 |
| BR10.8 | 月は日本時間。今月から開き、作られた月〜翌月を移る | 検証 | NFR11、Q4 |
| BR10.9 | 見出しに「確定していません」「確定済み」。計算は変わらない | 方針 | FR6.5、Q4 |
| BR10.10 | 記録のない子供は「今月の記録はまだありません（0 円）」 | 方針 | FR8.1、AC8.1.2 |
| BR10.11 | 円の整数の表示。自分の行を目立たせる | 方針 | FR8.3、NFR9、Q5 |
| BR10.12 | 開き直せば最新の額。強い整合性で読む | 計算 | FR5.8、ADR-005 |
| BR10.13 | 失敗は一部だけ返さない。異常な担当は数えずログへ | 方針 | FR4.5、NFR2、NFR6 |
| BR10.14 | 読み取りだけ。保存先・権限を足さない | 制約 | NFR1、ADR-005 |
| BR10.15 | ログに名前・金額を残さない | 方針 | NFR2、NFR4、NFR5 |
| BR10.16 | 3 秒以内。並行に読む | 制約 | NFR7 |
| BR10.17 | 月末のまとめは U10 が窓口を呼ぶ | 方針 | FR9.2、FR9.5 |
| BR10.18 | U11 の加算・減額は差し込み口に足す | 方針 | FR8.2、FR6.5 |
| BR10.19 | 抜けた子供の名前の読み方 | 方針 | Q2、NFR4 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR2.2、FR2.3、FR4.3、FR4.5、FR5.8、FR6.1、FR6.5、FR8.1〜FR8.3、FR9.2、FR9.3、FR9.5、NFR1、NFR2、NFR4〜NFR7、NFR9、NFR11）
- `inception/user-stories/stories.md`（US8.1、AC8.1.1〜AC8.1.4、AC5.1.13、AC1.1.11、AC4.1.3〜AC4.1.7、AC8.2.5〜AC8.2.7、AC9.1.5、AC9.1.6）
- `inception/units-generation/unit-of-work.md`、`unit-of-work-story-map.md`（U9 の受け持つこと、US5.1・US8.1・US9.1 の単位をまたぐ受け入れ条件）
- `inception/domain-design/components.md`（お小遣いの部品、ADR-001、ADR-003、ADR-005）
- `inception/contract-design/contract-summary.md`（C1、C6〜C10、`getAllowances`、`listDoneDuties`、`isMonthConfirmed`、familyScope）
- `inception/refined-mockups/mockups.md`（S5）
- `construction/u7-review-confirm/functional-design/`、`construction/u8-swap/functional-design/`（記録の 3 項目の不変条件、`unitPrice` の書き写し、担当の子供の変更は「未」のときだけ、BR8.13）
- 既存コード（読むだけ）: `services/calendarService.ts`、`services/recordingService.ts`、`repositories/calendarRepository.ts`（`loadMonth`・`getMonthState`）、`services/familyMemberService.ts`、`services/choreTypeService.ts`、`handlers/calendar/`（`getCalendar`・`params`）、`entries/api.ts`
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- [assumption] 見ている月が今日の月でないときの文言「この月の記録はまだありません（0 円）」と、子供がひとりもいないときの案内「お小遣いを表示する子供がまだいません」は、受け入れ条件に文言の指定がない場合の設計上の決めです。受け入れ条件 AC8.1.2 の文言（「今月の記録はまだありません（0 円）」）は、今日の月を見ているときにそのまま出します。違う言い方にしたいときは、承認時に指示してください
- [assumption] 範囲外の月を直接指定されても、裏側は断らず計算して返します（BR10.8）。範囲は見せ方の決まりで、読み取りの安全には関係しないためです
- [assumption] 「家族に入った直後の子供が、結果整合の一覧にまだ出ず、記録もない」場合に、数秒だけ行が出ないことを許容します（BR10.6）。カレンダー（U5）と同じ作りで、記録がある子供は強い整合性で補います
- [assumption] BR10.13 の異常なデータ 3 種類（価格なしの「済」、種類がない、管理者に入った担当）は、U5〜U7 の書き込みの決まりでは作られない前提です。起きたときは数えずにログへ残し、画面を止めません（額が少なく見えるより、画面が開けることを優先）。数えない扱いが望ましくないときは、承認時に指示してください
- [assumption] 差し込み口（BR10.7）の具体的な関数の形（引数・戻り）は、コード生成で決めます。U11 が使うのは「子供ごとの加算・減額の行の配列を返す」ことだけです
- [assumption] S5 に「この月を確定する」「確定を取り消す」を置くかは、`mockups.md` の S5 には書かれていますが、U7 がカレンダーの月の見出しの近くに置いた（BR8.13）ため、U9 では置かず、確定の状態の表示だけにしました。S5 にも置きたいときは、U7 の確認の小窓を使い回す小さな追加で足せます
