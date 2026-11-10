# 業務の決まり（Rules）— U8 代わりにやる

U8（`u8-swap`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U7 の決まり（BR1.x〜BR8.x）はそのまま使い、ここでは U8 で足す決まりを BR9.x として書きます。日付と「今日」は日本時間です（NFR11）。「今」は、要求の入口で 1 回だけ取る裏側の時計の時刻です（端末の時計は使いません）。

申し出を始める言葉は「家事交代」だけです [Q1]。要件・ストーリー（FR7.1、AC7.1.1〜AC7.1.3、AC7.1.11 など）の「代わって」と送る、という書き方は、すべて「家事交代」と送る、に読み替えます。返事の文言の中の案内も「『家事交代』と送ってください」に直します [Q1、Q2]。FR7.2 や AC7.1.4 の「代わってくれる人を探しています」は、申し出の知らせの文言で、始める言葉ではないのでそのままです。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR9.1
    statement: 申し出を始める言葉は「家事交代」だけ。前後の空白を除いて完全一致のときだけ受け付ける
    category: validation
    applies_to: グループ（source.type が group）に届いた message（text）、handlers/line/groupCommand.ts、entries/line.ts の accepts
    trigger: グループにテキストのメッセージが届いたとき
    logic: >-
      message.type が text で、長さが 5000 文字以内のとき、text の前後の空白（全角の空白を含む。JavaScript の trim と同じ）を除いた文字列が
      「家事交代」と完全に同じなら、申し出の一覧の操作（listSwappable）として扱う [Q1]。
      U3 の「登録」と同じ「ちょうど一致」の決まり。大文字小文字・全角半角・濁点や空白の正規化はしない（「家事交代」は漢字だけなので、見た目が同じ別の文字列は、正規化しないことで通さない）。
      「代わって」「かわって」「家事 交代」「家事交代して」「明日家事交代できる？」は受け付けない（雑談に公式アカウントが反応しない）。
      どの条件にも合わないメッセージは、二度処理しない記録を書く前に打ち切る（accepts が false。entries/line.ts の決まり）
    violation: 何もしない（返事もしない）
    source: FR7.1、AC7.1.1、Q1
  - id: BR9.2
    statement: グループの申し出の操作はすべて groupCommandGate.runGroupOperation を通し、登録されていないグループとメンバーでない人は決まった文で断る
    category: authorization
    applies_to: 申し出の一覧・担当の選択・引き受ける・申し出をやめる（グループの message と postback）
    trigger: BR9.1 に合う message、または swap.offer・swap.accept・swap.withdraw の postback がグループに届いたとき
    logic: >-
      runGroupOperation(groupId, source.userId, operation) を通す（U3 の BR4.10。AC1.2.5 の決まりをそのまま使う）。
      1. findFamilyByGroup で家族を決める。登録されていなければ GROUP_NOT_REGISTERED の文
         「このグループは家族のお知らせ先として登録されていません」を返事して終わり（operation は呼ばない）。
      2. source.userId の利用者が、友だちで、そのグループの家族のメンバーのときだけ、ctx={familyId, userId, role} と表示名で operation を呼ぶ。
         違えば NOT_FAMILY_MEMBER の文を返事する。家族の名前・メンバー・担当は文に入れない。
      家族は、グループの登録から決める。ボタンの値（dutyId・offerId）やイベントから家族を決めない。
      断りの返事は、押した人にだけ見える形ではなくグループへの返事になるので、決まった文だけにして、中身を漏らさない。
      source.type が room や、groupId がないものは、何もしない（U3 の決まり）
    violation: GROUP_NOT_REGISTERED・NOT_FAMILY_MEMBER の決まった文を返事。操作しない
    source: AC1.2.5、FR7.1、NFR4、U3 の BR4.10
  - id: BR9.3
    statement: 申し出られるのは子供だけ。管理者が送った・押したときは、操作の種類ごとに決まった文で断り、何も変えない
    category: authorization
    applies_to: 申し出の一覧、担当の選択、引き受ける、申し出をやめる
    trigger: BR9.2 を通った利用者の role が admin のとき
    logic: >-
      管理者（お母さん）は自分の担当を持たない [Q2]。
      - 「家事交代」を送った → 「代わってもらう申し出は子供だけができます」と返事する（担当も申し出も読まない）。
      - 担当を選ぶボタン（swap.offer）を押した → 担当の子供ではないので、BR9.7 の判定で OFFER_OWNER_ONLY
        「この操作は申し出た人だけができます」と返事する。
      - 「引き受ける」（swap.accept）を押した → BR9.9 の判定で CANNOT_ACCEPT_OWN_OFFER「この申し出には応えられません」（AC7.1.7）。
      - 「申し出をやめる」（swap.withdraw）を押した → 申し出た本人ではないので、BR9.10 の判定で OFFER_OWNER_ONLY。
      子供が、ほかの子供の担当を選ぶボタンや「申し出をやめる」を押したときも、同じ OFFER_OWNER_ONLY で、何も変えない（mockups.md の T2）。
      管理者は引き受けられない（FR7.3 は子供だけ）
    violation: 決まった文を返事。担当・申し出は変えない
    source: FR7.3、AC7.1.7、Q2、mockups.md の T2
  - id: BR9.4
    statement: 1 対 1 のトークで「家事交代」と送られたら、グループで送るよう案内する。誰が送っても同じ案内で、何も読まない
    category: policy
    applies_to: 1 対 1（source.type が user）に届いた「家事交代」の message、handlers/line/groupCommand.ts
    trigger: BR9.1 の文字が 1 対 1 のトークに届いたとき
    logic: >-
      「代わってほしいときは、家族のグループで『家事交代』と送ってください」と返事する [Q1、Q2]。
      子供でも管理者でも家族でない人でも同じ文にし、利用者・家族・担当は読まない（U3 の BR4.13「登録」の 1 対 1 の案内と同じ作り。runGroupOperation も通さない）。
      1 対 1 の postback（swap.*）は何もしない（申し出のボタンはグループにだけ出る。BR9.16）。
      受け口の accepts は、この 1 対 1 の「家事交代」も受け付ける（返事を送るため）
    violation: なし
    source: FR7.1、Q1、Q2、U3 の BR4.13
  - id: BR9.5
    statement: 「家事交代」の返事に出す担当は、自分の、今日以降の、「未」の、確定していない月の担当だけ。出せるものがないときは理由を返事する
    category: calculation
    applies_to: C8 listSwappableDuties(ctx, today)、グループの「家事交代」
    trigger: 子供が BR9.1 の言葉を送ったとき（BR9.2 を通ったあと）
    logic: >-
      対象の月は、今日の月と、その次の月（割り当てを保存できるのは今月と来月だけなので、担当はこの 2 か月にしかない。U5 の BR6.2）。
      2 つの月を並行して読む（月の Query は担当・月の状態を 1 回で返す。U5 の loadMonth）。
      候補 = childUserId が ctx.userId で、status が todo で、date が今日以降（今日を含む。FR7.1、requirements のレビュー R-05）で、
      その月が確定していない担当。過ぎた日・「済」「×」・ほかの子供の担当・確定している月の担当は出さない。
      引き受けた担当（origin が swap）も同じ条件を満たせば候補に入れる（BR9.12）。申し出が出ている担当も候補から外さない（もう一度選ぶと BR9.7 で「この担当はもう申し出ています」。AC7.1.9）。
      候補が 1 件以上 → SwappableDuty の並び（BR9.6 の順）を返す。
      候補が 0 件のとき: 今日の月が確定していれば MONTH_CONFIRMED「この月は確定済みです」（AC7.1.2、FR7.1）、そうでなければ
      NO_SWAPPABLE_DUTY「申し出られる担当はありません」（AC7.1.3）。ボタンは出さない。
      来月だけが確定していて今月に候補がない場合は、NO_SWAPPABLE_DUTY（FR7.1 の「今月が確定していて」に当たらない）
    violation: MONTH_CONFIRMED、NO_SWAPPABLE_DUTY（返事の文。ボタンなし）
    source: FR7.1、AC7.1.1、AC7.1.2、AC7.1.3
  - id: BR9.6
    statement: ボタンは日付の近い順（同じ日はお手伝いの種類の順）に、先頭の 10 件まで出し、超えるときは案内を添える
    category: policy
    applies_to: 「家事交代」の返事、handlers/line の返事の組み立て
    trigger: BR9.5 の候補が 1 件以上のとき
    logic: >-
      並び順: date の昇順。同じ日は C7 の一覧の順（「使う」を登録順、そのあとに「使わない」を登録順。U4 の BR5.11）。それも同じなら dutyId の昇順（結果をいつも同じにする）。
      先頭の 10 件を、1 担当 1 つのボタンとして carousel に並べる [Q3]（LINE の carousel は 12 までなので 10 は収まる。U6 の記録の 12 件と同じ作りで、上限の数だけを変える）。
      ボタンの文字は「1/8 皿洗い」（月/日 と お手伝いの名前。AC7.1.1）、ボタンの値は swap.offer の postback（BR9.16）。
      メッセージの形は U6 と同じ Flex の carousel（1 バブル 1 担当。buildRecordCarousel と同じ作りで、ボタンの文字と値だけが違う）。
      ボタンの文字の上限は最大 26 文字（＝「M/D」最大 5 文字 + 空白 1 文字 + 種類の名前 20 文字まで）。種類の名前が 20 文字を超えるときは、末尾の「…」を入れて 20 文字に収める（19 文字 + 「…」）ので、26 文字を超えない。
      26 文字が LINE のボタンの文字の上限内かは、公式の資料の確認が要るので仮定にする（Assumptions）。
      【2026-11-10 確認済み（コード生成 Step 1b）】Flex の button の label の公式の上限は 40 文字で、26 文字は収まる。名前を 20 文字に収める決まりはそのまま。altText の公式の上限は 1500 文字（仮定の 400 より緩い）。詳細は docs/contract-changes-u8.md。
      候補が 11 件以上のときは、carousel のあとに「近い日の担当だけ出しています。ほかの担当は、その日が近づいたらまた『家事交代』と送ってください」を添える [Q3、Q1]。
      返事の先頭に「代わってほしい担当を選んでください」の見出しを付ける。見出し・carousel・案内の 3 通以内の 1 回の返事にする。
      altText は必須（LINE の SDK は使わない）。一覧の窓口は全件を返し、10 件に絞るのは受け口（handlers）
    violation: なし
    source: FR7.1、AC7.1.1、Q3、Q1
  - id: BR9.7
    statement: 子供が担当を選ぶと、その担当に申し出を 1 つだけ作り、グループに「引き受ける」「申し出をやめる」のボタンつきで知らせる
    category: constraint
    applies_to: C8 offerSwap(ctx, dutyId, options)、swap.offer の postback
    trigger: 子供が「家事交代」の返事のボタンを押したとき
    logic: >-
      判定の順番（最初に当てはまったもので終える。reliability の「探す→判定→書く」の形は U6 と同じ）。
      1. 担当を探す（C8 の findDuty。家族の中だけ。DID# → 担当 → 月の状態）。ない・ほかの家族 → NOT_FOUND。
      2. 担当の子供が ctx.userId でない（ほかの子供の担当・管理者）→ OFFER_OWNER_ONLY「この操作は申し出た人だけができます」。
      3. その月が確定している → MONTH_CONFIRMED。
      4. 担当が「未」でない、または担当の日が今日より前 → DUTY_NOT_TODO。
      5. 有効な申し出（BR9.8）がすでにある → ALREADY_OFFERED「この担当はもう申し出ています」（AC7.1.9）。
      6. 取引で書く。申し出の項目（sk=SWAP#<dutyId>）を UpdateItem で、dutyId（entities.md の SwapOffer.dutyId と同じ値）・新しい offerId（UUID）・offererUserId=ctx.userId・dutyVersion=読んだ担当の version・status=open・createdAt=updatedAt=今にし、
         acceptedByUserId・acceptedAt を取り除く。条件は「項目がない、または status が open でない、または dutyVersion が今の担当の version と違う」
         （＝有効な open の申し出がない。取り下げ・引き受け・自動でなくなったあとの申し出し直しと、フックの失敗で open のまま残った古い項目の上書きを許す）。
         同じ取引に、担当が読んだ値のままであることの ConditionCheck（status=todo、version、dutyId、childUserId=ctx.userId）と、
         月の状態が確定していないことの ConditionCheck（U5 の buildMonthGuard）を入れる。担当そのものは書き換えない。
      成功したら、グループへの返事は「{名前}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています」と、
      「引き受ける」（swap.accept&dutyId&offerId）・「申し出をやめる」（swap.withdraw&dutyId&offerId）のボタン（AC7.1.4）。
      断られたら BR9.15 の読み直し。同じ担当への二度押しは 2 回目が 5. で ALREADY_OFFERED になる。
      LINE の返事の対応: NOT_FOUND・DUTY_NOT_TODO は「この担当は先に変更されました」（U6 の DUTY_CHANGED の文）、MONTH_CONFIRMED は「この月は確定済みです」。
      古い選択ボタンの決め: 担当が引き受けなどで変わっていて、元の持ち主が古い選択ボタンを押した場合は、2. で断るときに DUTY_CHANGED の文「この担当は先に変更されました」を返す。
      押した人が管理者かほかの子供の場合は、2. のとおり OFFER_OWNER_ONLY のまま。
      元の持ち主かどうかは、ボタンの値でなく、1. と並行して読む申し出の項目の offererUserId が ctx.userId と同じで、かつ担当の子供が ctx.userId でなくなっているかで決める（申し出の項目がなければ元の持ち主とは言えないので OFFER_OWNER_ONLY）。
      この項目は 1. の探索で並行して読む（追加の読み取りは増やさない。BR9.17）。
      メッセージの形（知らせ）: 「引き受ける」「申し出をやめる」の 2 ボタンの組み立ては、lineApiService に新しく作る（いまの buildPostbackButtonMessage はボタン 1 つ）。
      本文は「{表示名}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています」で、表示名は 20 文字まで、お手伝いの名前は 20 文字までに切るので、日付と固定の文を足しても 100 文字ほど。
      ボタン 2 つの template（buttons）は、タイトルも画像もない本文が 160 文字まで、ボタンの文字が 20 文字まで、altText が 400 文字までと仮定する（公式の資料の確認は仮定として Assumptions に残す）。
    violation: NOT_FOUND、OFFER_OWNER_ONLY、MONTH_CONFIRMED、DUTY_NOT_TODO、ALREADY_OFFERED、INTERNAL
    source: FR7.2、FR7.5、AC7.1.4、AC7.1.9、mockups.md の T2
  - id: BR9.8
    statement: 申し出が「有効」なのは、開いていて、担当が申し出たときのままで、日が過ぎておらず、月が確定していない間だけ。それ以外は自動でなくなったものとして扱う
    category: constraint
    applies_to: 申し出を読むすべての場所（BR9.7 の 5.、BR9.9、BR9.10）
    trigger: 申し出の項目を読んだとき
    logic: >-
      申し出が有効 ＝ 次をすべて満たす。
      (a) status が open
      (b) 担当が見つかり、担当の version が dutyVersion と同じ（担当の子供が変わる・状態が変わる・記録される・割り当ての保存し直しで書き換えられる、のどれもが version を増やすので、どれも「申し出たときから変わった」になる）
      (c) 担当の status が todo、担当の childUserId が offererUserId
      (d) 担当の date が今日以降（日本時間。「担当の日が過ぎた」は、イベントがないので読んだときに今日と比べて決める）
      (e) 担当の月が確定していない
      (a) が accepted の項目は「引き受けられた」、withdrawn・cancelled と、(a) が open で (b)〜(e) のどれかを満たさないものは「なくなった」。
      この判定は、FR7.5 の 4 つの条件（担当の日が過ぎた・「未」でなくなった・管理者が担当を変更した・その月が確定された）をすべて含む。
      フック（BR9.11）が失敗しても、遅れても、この判定が正しさを守る。判定のために項目を書き換えない（読むだけ）。
      確定の取り消し（U7）では、申し出を戻す処理はしない。フックが成功していれば cancelled のまま戻らず、失敗して open のまま残っていれば (e) を満たすので有効に戻る。この差を許容する（実装が単純。BR9.11）
    violation: なし（判定の決まり）
    source: FR7.5、AC7.1.10
  - id: BR9.9
    statement: 引き受けは最初に押した 1 人だけが成立し、担当の子供を引き受けた子供に変えて origin を swap にする。押した子供の自分の担当は動かない
    category: constraint
    applies_to: C8 acceptSwap(ctx, dutyId, offerId, options)、swap.accept の postback
    trigger: 子供または管理者が「引き受ける」を押したとき
    logic: >-
      判定の順番（最初に当てはまったもので終える）。
      1. 申し出の項目と担当を並行して探す（SWAP#<dutyId> の GetItem と findDuty）。項目がない・offerId がボタンの値と違う・status が withdrawn か cancelled → OFFER_GONE「この申し出はもうありません」（AC7.1.8）。
      2. status が open で、BR9.8 の (b)〜(e) を満たさない → OFFER_GONE（FR7.5）。
      3. ctx.role が admin、または ctx.userId が offererUserId → CANNOT_ACCEPT_OWN_OFFER「この申し出には応えられません」（AC7.1.7）。引き受けられたあとでも、この人たちにはこの文を返す。
      4. status が accepted → OFFER_ALREADY_ACCEPTED「この申し出はもう引き受けられています」（AC7.1.6）。
      5. 取引で書く（3 項目）。
         ・担当の Update: childUserId=ctx.userId、origin=swap、version+1、updatedAt=今。条件は dutyId・version（申し出の dutyVersion）・status=todo・childUserId=offererUserId。
         ・申し出の Update: status=accepted、acceptedByUserId=ctx.userId、acceptedAt=updatedAt=今。条件は status=open かつ offerId が同じ。
         ・月の状態の ConditionCheck（確定していない。U5 の buildMonthGuard）。
      2 人が同時に押しても、申し出の status=open の条件が片方だけを通すので、成立するのは 1 人だけ（FR7.3）。負けた側は読み直して、4.（OFFER_ALREADY_ACCEPTED）か 1.〜2.（OFFER_GONE）の文になる。
      成功の返事は「{名前}が {M}月{D}日 の{お手伝い}を引き受けました」（AC7.1.5）。
      引き受けた子供の担当・状態・記録、ほかの担当は書かない。担当を作らない・消さない。onDutyReassigned は呼ばない
      （申し出は同じ取引で accepted になっており、取り下げる申し出が残らない。型の newOrigin も rule か manual だけ）
    violation: OFFER_GONE、CANNOT_ACCEPT_OWN_OFFER、OFFER_ALREADY_ACCEPTED、INTERNAL
    source: FR7.3、AC7.1.5、AC7.1.6、AC7.1.7、AC7.1.8
  - id: BR9.10
    statement: 申し出た本人は、引き受けられる前なら「申し出をやめる」で取り下げられる。本人以外は取り下げられない
    category: constraint
    applies_to: C8 withdrawSwap(ctx, dutyId, offerId, options)、swap.withdraw の postback
    trigger: 「申し出をやめる」を押したとき
    logic: >-
      判定の順番（最初に当てはまったもので終える）。
      1. 申し出の項目を探す（SWAP#<dutyId>）。ない・offerId が違う・status が withdrawn か cancelled → OFFER_GONE。
      2. 申し出た本人でない（ctx.userId ≠ offererUserId。管理者を含む）→ OFFER_OWNER_ONLY「この操作は申し出た人だけができます」。何も変えない。
      3. status が accepted → OFFER_ALREADY_ACCEPTED（引き受けられたあとは取り下げられない。FR7.4）。
      4. status が open だが BR9.8 の (b)〜(e) を満たさない → OFFER_GONE（すでに自動でなくなっている）。
      5. 申し出の Update: status=withdrawn、updatedAt=今。条件は status=open かつ offerId が同じ。担当は書き換えない。
      成功したら「{名前}が {M}月{D}日 の{お手伝い}の申し出をやめました」と返事する。そのあと「引き受ける」を押すと OFFER_GONE「この申し出はもうありません」（AC7.1.8）。
      条件で断られたら読み直して 1.〜4. をやり直す（引き受けと競合したときは OFFER_ALREADY_ACCEPTED）
    violation: OFFER_GONE、OFFER_OWNER_ONLY、OFFER_ALREADY_ACCEPTED、INTERNAL
    source: FR7.4、AC7.1.8、mockups.md の T2
  - id: BR9.11
    statement: 担当が変わった・「未」でなくなった・月が確定されたときは、フックで申し出を cancelled にして掃除する。フックは api と line の両方の起動の枠で登録する
    category: policy
    applies_to: onDutyReassigned（kind が child-changed・deleted・status-changed）、onDutyRecorded、entries/api.ts、entries/line.ts
    trigger: U5 の担当の子供の変更・保存し直し、U7 の状態の変更・月の確定、U6 の記録が成功したあと
    logic: >-
      U8 は次の 2 つを登録する（コードは swapService の registerSwapHooks にまとめ、起動の枠で 1 回だけ呼ぶ。二重に登録しない）。
      ・onDutyReassigned: kind が child-changed（U5 の PATCH・保存し直し）、deleted（U5 の保存し直しで担当が消えた）、status-changed（U7 の状態の変更と、月の確定を担当ごとに展開した分）の 3 つすべて。
      ・onDutyRecorded: 担当が「済」になった（U6 の記録）。U6 の記録は status-changed を出さないので、別に登録が要る。
      フックの中身は、event.dutyId の申し出（SWAP#<dutyId>）の UpdateItem 1 回: status=cancelled、updatedAt=今。条件は status=open。項目がない・すでに open でないときは条件で断られるので、
      そのまま何もしない（ConditionalCheckFailed を握りつぶす）。申し出がある担当にだけ書き込みが起きる。
      月の確定は、U7 が「確定の時点で『未』だった担当ごとに status-changed を 1 件」に展開して渡す（'month-confirmed' という種類は作らない。docs/contract-changes-u7.md）。
      NFR 設計で決める項目（未決）: 月の確定の掃除の件数と時間。目安は「1 か月の『未』の担当 300 件でも、確定の応答が NFR7 の 3 秒に収まるか」。手段の候補は次の 3 つで、NFR 設計が測定の結果で選ぶ。
        (a) 測定で足りるとする（担当ごとの条件つき書き込みのまま。申し出がない担当は条件で断られるだけ）。
        (b) フック側で並行数を限る（同時に走らせる書き込みを数件までにして、DynamoDB の絞りと確定の応答時間を両方守る）。
        (c) 月単位のイベントを U7 の契約に足す（種類は 'month-confirmed'。U7 の契約の変更になるので、U7 の持ち主と決める）。
      申し出の項目を Query で一括して掃除する形は、(c) が前提になる（いまの契約は担当ごとの status-changed だけを渡すので、月単位の合図がなく、一括の Query に切り替える場所がない）。
      遅れたフックの許容: 遅れて届いたフックが、その間に作り直された新しい申し出を cancelled にしてしまう窓は、同じ要求の中（フックは保存の応答を返す前に呼ばれる）だけで許容する。
      要求をまたいだ遅れは、フックの条件が status=open だけなので新しい申し出も cancelled にし得るが、そのときも BR9.8 が正しさを守り、押し直せば BR9.7 で申し出し直せる。
      確定の取り消しのあとの申し出の扱い（決め）: 許容する。確定の取り消しでは、申し出を戻す処理はしない。確定のときにフックが成功して cancelled になった申し出は戻らない。
      フックが失敗して open のまま残った申し出は、BR9.8 が「読んだときの判定」なので、取り消しのあとは有効に戻る。どちらも誤りではなく、実装は BR9.8 のままで単純（理由: 取り消しのための分岐とイベントを足さずに済む）。
      登録の場所: 書き込む起動の枠が呼ぶので、api（U5 の PATCH・保存し直し → child-changed・deleted、U7 の状態の変更・確定 → status-changed、画面からの記録 → onDutyRecorded）と
      line（リッチメニューの記録 → onDutyRecorded）の両方で登録する。line では onDutyReassigned を呼ぶ書き込みがない（U8 の引き受けも呼ばない）ので、line の登録は onDutyRecorded だけでよい。
      フックが投げても元の保存の結果は変えない（U5〜U7 の決まり。DUTY_HOOK_FAILED・DUTY_RECORDED_HOOK_FAILED の警告が残る）。
      正しさはフックに頼らない。フックが失敗・遅延・未登録でも、BR9.8 が「なくなった」と判定し、BR9.7 は古い open の項目を上書きできる。フックは、状態を実態にそろえる掃除である
    violation: 警告のログ（元の保存の結果は変えない）
    source: FR7.5、AC7.1.10、U5・U6・U7 の引き継ぎ
  - id: BR9.12
    statement: 引き受けた担当も、自分の「未」の担当なので、同じように申し出られる。何回引き継いでも origin は swap のまま
    category: policy
    applies_to: BR9.5 の候補、BR9.7、BR9.9
    trigger: 引き受けた子供が「家事交代」を送ったとき
    logic: >-
      origin で候補を絞らない [Q4]。太郎が花子から引き受けた担当は、太郎の担当（childUserId=太郎）なので、BR9.5 の候補になり、BR9.7 で申し出られ、
      次郎が引き受ければ担当は次郎になる。そのたびに origin は swap のまま（BR9.9）。
      申し出の項目は担当ごとに 1 つで、引き受け後は accepted のまま残る。太郎が同じ担当を申し出ると、BR9.7 の条件（status が open でない）で新しい offerId の open に上書きされる。
      花子の古い申し出のボタンは offerId が違うので OFFER_GONE になる（古いボタンが新しい申し出に当たらない）。
      回数の上限・禁止はしない（管理者が見たくなったときは U5 の日の詳細の担当の子供の名前で分かる）
    violation: なし
    source: FR7.1、FR7.3、Q4
  - id: BR9.13
    statement: 引き受けた担当は画面には何も出さない。元の子供を担当に残さず、履歴も別に保存しない。管理者の上書きの確認（U5）は今の担当の子供で出す
    category: policy
    applies_to: 担当の項目、日の詳細・カレンダーの画面、U5 の保存し直しの確認
    trigger: 引き受けが成立したあと
    logic: >-
      担当の子供の名前が変わるだけで、日の詳細にもカレンダーにも「代わりにやる」の印や元の子供の名前を出さない [Q5]。
      origin は内部の項目として swap を持つ。担当に「元の子供」の項目を足さない。引き受けのやり取り（いつ・誰が申し出て誰が引き受けたか）は、
      担当にも別の履歴の項目にも保存しない。申し出の項目（acceptedByUserId・acceptedAt）は次の申し出で上書きされる状態の記録であって、履歴ではない。
      U5 の保存し直しの確認（BR6.7）は、origin が manual か swap の「未」の担当の子供が変わる・なくなるときに、変化の一覧（日付・種類・今の担当の子供・作り直したあとの子供）を出す。
      一覧は「1月22日 皿洗い: 太郎 → 花子」の形で、今の担当の子供と作り直したあとの子供だけを使うので、元の子供の項目がなくても AC3.1.5 を満たす。U5 の仕組みは変えない。
      画面の Duty の型には origin がすでにあるが、画面は表示に使わない
    violation: なし
    source: FR3.3、AC3.1.5、Q5
  - id: BR9.14
    statement: 返事はすべて reply で出し、push は使わない。返事の文言は共有の文言の一覧から引き、返事が失敗しても業務の結果は変えない
    category: policy
    applies_to: handlers/line の返事、packages/shared の messages
    trigger: 申し出の操作が終わったとき
    logic: >-
      reply トークンで返事する。push・multicast・broadcast は使わない（NFR1。月 200 通の無料枠に数えない）。
      返事の宛先はイベントが届いたグループ（申し出の知らせ・引き受けの結果はグループに見える。mockups.md の T2）。
      文言（既存の理由の印の文言は C10 のまま）:
      ・NO_SWAPPABLE_DUTY「申し出られる担当はありません」、MONTH_CONFIRMED「この月は確定済みです」、ALREADY_OFFERED「この担当はもう申し出ています」、
        OFFER_ALREADY_ACCEPTED「この申し出はもう引き受けられています」、OFFER_GONE「この申し出はもうありません」、
        CANNOT_ACCEPT_OWN_OFFER「この申し出には応えられません」、DUTY_CHANGED「この担当は先に変更されました」
      ・足すもの（理由の印）: OFFER_OWNER_ONLY「この操作は申し出た人だけができます」
      ・足すもの（LINE の文言。理由の印ではない）: 「代わってほしい担当を選んでください」（見出し）、「近い日の担当だけ出しています。ほかの担当は、その日が近づいたらまた『家事交代』と送ってください」、
        「代わってもらう申し出は子供だけができます」、「代わってほしいときは、家族のグループで『家事交代』と送ってください」、
        「{名前}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています」、「{名前}が {M}月{D}日 の{お手伝い}を引き受けました」、
        「{名前}が {M}月{D}日 の{お手伝い}の申し出をやめました」、「うまく申し出られませんでした。もう一度お試しください」、「うまく引き受けられませんでした。もう一度お試しください」
      ・書いたあとに名前が引けなかったとき: 子供の名前は「だれか」、お手伝いの名前は「お手伝い」と言い換える（書いたあとの返事を止めない）。
      書いたあとに reply が失敗しても、書いた結果は変えない。LINE_REPLY_FAILED の警告を残す（U6 と同じ）。書いたあとに投げない作りにする
    violation: なし
    source: FR7.2、FR7.3、FR7.4、NFR1、NFR7、AC7.1.4〜AC7.1.8
  - id: BR9.15
    statement: 申し出・引き受け・取り下げの書き込みは、取引の条件が断られたら読み直して 1 回だけやり直し、2 回続けて断られたら INTERNAL にする
    category: constraint
    applies_to: offerSwap、acceptSwap、withdrawSwap の書き込み
    trigger: 取引や条件つきの書き込みが断られたとき
    logic: >-
      最初の 1 回を含めて 2 回まで（U6 の MAX_ATTEMPTS と同じ）。断られたら、担当・申し出・月の状態を読み直して、それぞれの判定の最初から評価する。
      読み直しで理由が決まれば（OFFER_ALREADY_ACCEPTED・OFFER_GONE・ALREADY_OFFERED・MONTH_CONFIRMED など）その印を返す。
      2 回続けて断られたら INTERNAL（何も書かれていない。取引は全部書くか全部書かない）。LINE は「うまく申し出られませんでした。もう一度お試しください」
      （または引き受け用の文）と返事する。もう一度押せば、いまの状態から判定し直される
    violation: INTERNAL
    source: FR7.3、NFR2、U6 の取引の読み直し
  - id: BR9.16
    statement: ボタンの値は厳密に読み、申し出の操作はグループに届いたものだけを受け付ける。dutyId と offerId は呼び出した家族の範囲でだけ引く
    category: validation
    applies_to: handlers/line/groupCommand.ts の postback の読み取り、entries/line.ts の accepts
    trigger: postback がグループに届いたとき
    logic: >-
      source.type が group で、replyToken があり、data が 300 文字以内のときだけ読む。生の文字列に対する正規表現で、次の 3 つの形に完全に一致したときだけ操作として扱う
      （URLSearchParams は使わない。項目の重複・順序・エンコードの違いなど「同じ値に見える違う文字列」を通さないため。U6 の recordCommand と同じ作り）。
      ・action=swap.offer&dutyId=<小文字の UUID>
      ・action=swap.accept&dutyId=<UUID>&offerId=<UUID>
      ・action=swap.withdraw&dutyId=<UUID>&offerId=<UUID>
      形が違う・長すぎる・1 対 1 から届いたものは、何もしない（二度処理しない記録を書く前に打ち切る）。
      dutyId・offerId は信用しない。家族は BR9.2 でグループから決め、担当と申し出は ctx.familyId の中でだけ引く（ほかの家族の dutyId は「ない」と同じ。NOT_FOUND か OFFER_GONE で、ほかの家族のデータがあることを知らせない）。
      権限（誰の担当か、誰の申し出か）はボタンの値でなく、読んだ担当と申し出で決める
    violation: 何もしない
    source: FR7.2〜FR7.4、NFR4、U6 の recordCommand
  - id: BR9.17
    statement: 返事は 3 秒以内。読み取りは並行して走らせ、担当や申し出の数で増やさない
    category: constraint
    applies_to: 「家事交代」・担当を選ぶ・引き受ける・申し出をやめる の返事
    trigger: 操作が届いたとき
    logic: >-
      20 回の操作で 19 回以上、3 秒以内に返事が届くこと（AC7.1.11、NFR7）。
      ・一覧: 今月と来月の月の Query（各 1 回）と種類の一覧の Query（1 回）を並行して走らせる。読み取りは担当の数で増えない。
      ・選ぶ / 引き受ける / やめる: 担当の探索（GetItem 3 回）と申し出の GetItem（1 回）を並行して走らせ、種類の一覧（名前）も並行して走らせる（待つのは返事を作る直前）。表示名は、グループの入口が読んだ利用者の記録から取り、追加の読み取りはしない。
      ・書き込みは 1 つの取引（引き受けは 3 項目）。LINE のプロフィール取得は呼ばない。
      reply の時間切れは U1 の決まり（5 秒、やり直さない）のまま。取引が 2 回断られても読み直しは 1 回だけなので、最悪でも時間は固定の範囲に収まる
    violation: なし
    source: NFR7、AC7.1.11
  - id: BR9.18
    statement: ログには操作の事実と ID だけを残し、名前・LINE のユーザー ID・秘密の情報は残さない
    category: policy
    applies_to: ログ
    trigger: 申し出の一覧・申し出・引き受け・取り下げ・フックが成功・失敗したとき
    logic: >-
      SWAP_LISTED（familyId、件数）、SWAP_OFFERED（familyId、dutyId、offerId）、SWAP_ACCEPTED（familyId、dutyId、offerId）、SWAP_WITHDRAWN（familyId、dutyId、offerId）、
      SWAP_REJECTED（familyId、dutyId、理由の印）、SWAP_RETRY（取引を読み直した）、SWAP_OFFER_CLOSED（フックが cancelled にした。kind か recorded）を残す。
      子供や管理者の表示名、お手伝いの名前、LINE のユーザー ID・グループ ID、秘密の情報（例 <作り物の値>）は残さない
    violation: なし
    source: NFR2、NFR4、NFR5
  - id: BR9.19
    statement: U8 は新しいテーブル・索引・TTL・権限・環境変数を足さない。申し出は Calendar テーブルの SWAP# の項目に UpdateItem と取引だけで書く
    category: constraint
    applies_to: データの置き方、line と api のロール、infrastructure/lib
    trigger: 申し出を保存・更新するとき
    logic: >-
      申し出の項目は Calendar（PK familyId、SK sk=SWAP#<dutyId>）。作成・取り下げ・引き受け・フックの掃除は、すべて UpdateItem（条件つき）と TransactWriteItems で行い、
      PutItem・DeleteItem・Scan・BatchGet・BatchWrite は使わない。line のロール（Calendar に GetItem・Query・UpdateItem・ConditionCheckItem。U6）と
      api のロールで足りるので、IAM と環境変数（CALENDAR_TABLE、CHORE_TYPES_TABLE。どちらも line と api にある）は変えない。費用は 0 円のまま（読み書きは数件）。
      U5 の月の Query（M#<month>#）と種類の使用の確かめ（M#）は SWAP# を読まない。項目は消さずに残す（TTL なし）。
      担当の書き込みは U5〜U7 と同じく dutyId・version・status を条件にし、月の確定の ConditionCheck を同じ取引に入れる
    violation: なし
    source: NFR1、NFR4、U5・U6 の引き継ぎ
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR9.1 | 申し出を始める言葉は「家事交代」の完全一致だけ | 検証 | FR7.1、Q1 |
| BR9.2 | グループの操作は runGroupOperation を通し、登録なし・メンバー外は決まった文で断る | 権限 | AC1.2.5、FR7.1 |
| BR9.3 | 申し出られるのは子供だけ。管理者・本人以外は決まった文で断る | 権限 | FR7.3、AC7.1.7、Q2 |
| BR9.4 | 1 対 1 の「家事交代」はグループでの案内を返す | 方針 | Q1、Q2 |
| BR9.5 | 自分の・今日以降の・「未」の・確定していない月の担当を出す。なければ理由 | 計算 | FR7.1、AC7.1.1〜AC7.1.3 |
| BR9.6 | 日付の近い順に 10 件、超えるときは案内 | 方針 | Q3 |
| BR9.7 | 担当を選ぶと申し出を 1 つ作り、グループにボタンつきで知らせる | 制約 | FR7.2、FR7.5、AC7.1.4、AC7.1.9 |
| BR9.8 | 申し出が有効な条件（開いている・担当が同じ・日が過ぎていない・確定していない） | 制約 | FR7.5、AC7.1.10 |
| BR9.9 | 引き受けは先着 1 人。担当の子供を変え origin=swap。自分の担当は動かない | 制約 | FR7.3、AC7.1.5〜AC7.1.7 |
| BR9.10 | 申し出た本人だけが、引き受けられる前に取り下げられる | 制約 | FR7.4、AC7.1.8 |
| BR9.11 | フックで申し出を掃除する。api と line の両方で登録 | 方針 | FR7.5、AC7.1.10 |
| BR9.12 | 引き受けた担当も申し出られる。origin は swap のまま | 方針 | Q4 |
| BR9.13 | 画面に出さない。元の子供も履歴も残さない | 方針 | Q5、AC3.1.5 |
| BR9.14 | 返事のみで push は使わない。文言の一覧 | 方針 | NFR1、FR7.2〜FR7.4 |
| BR9.15 | 取引は読み直し 1 回、2 回続けて断られたら INTERNAL | 制約 | NFR2 |
| BR9.16 | ボタンの値は厳密に読む。家族の範囲でだけ引く | 検証 | NFR4 |
| BR9.17 | 3 秒以内。読み取りは並行 | 制約 | NFR7、AC7.1.11 |
| BR9.18 | ログに名前や秘密を残さない | 方針 | NFR2、NFR4、NFR5 |
| BR9.19 | 新しい保存先・権限を足さない | 制約 | NFR1、NFR4 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR7.1〜FR7.5、FR3.3、NFR1、NFR2、NFR4、NFR5、NFR7、NFR11、レビュー R-04・R-05）
- `inception/user-stories/stories.md`（US7.1、AC7.1.1〜AC7.1.11、AC1.2.5、AC3.1.5、「あとの段階で決めること」）
- `inception/units-generation/unit-of-work.md`、`unit-of-work-story-map.md`（U8 の受け持つこと、AC1.2.5 の分担）
- `inception/refined-mockups/mockups.md`（T2。申し出のやり取りと返事の表）
- `inception/contract-design/contract-summary.md`（C3 postback、C8 の申し出の窓口、C10 の理由の印と文言）
- `construction/u5-assignment-calendar/functional-design/`、`docs/contract-changes-u5.md`（担当の書き換えの条件、月の状態の ConditionCheck、`origin`、`onDutyReassigned`、BR6.7 の上書きの確認）
- `construction/u6-recording/functional-design/`、`docs/contract-changes-u6.md`（`onDutyRecorded`、1 対 1 の入口、`line` の権限、取引の読み直し）
- `construction/u7-review-confirm/functional-design/`、`docs/contract-changes-u7.md`（`status-changed` と月の確定の展開）
- `construction/u3-notification-group/functional-design/rules.md`（BR4.10 グループの入口、BR4.13 1 対 1 の案内）
- 既存コード（読むだけ）: `services/groupCommandGate.ts`、`services/oneToOneGate.ts`、`services/dutyReassignedHook.ts`、`services/dutyRecordedHook.ts`、`services/recordingService.ts`、`services/lineApiService.ts`、`repositories/calendarRepository.ts`、`handlers/line/`、`entries/line.ts`、`entries/api.ts`
- `functional-design-questions.md` の回答 [Q1]〜[Q5]

## Assumptions & Open Questions

- [assumption] 管理者が「家事交代」と送ったときの返事の文は、Q2 の A の文のまま使い、「家事交代」の言葉は入れません。Q1 の読み替えが及ぶのは、案内の中で「送ってください」と書く 1 対 1 の文と、候補が 10 件を超えたときの案内の 2 つです
- [assumption] 「担当を選ぶ」ボタンを担当の子供以外が押したときの文（OFFER_OWNER_ONLY）は、mockups.md の T2 の表のとおりです。契約の理由の印の一覧にないので、`OFFER_OWNER_ONLY` を足します（`docs/contract-changes-u8.md` に残します）
- [assumption] `acceptSwap`・`withdrawSwap` の引数に `dutyId` を足します（契約は `offerId` だけ）。申し出の項目のキーが担当の ID（SWAP#<dutyId>）で、ボタンの値にも dutyId と offerId の両方が入る（契約の postback の形どおり）ためです。壊す変更ではなく、呼ぶのは U8 の受け口だけです
- [assumption] 担当の日が過ぎた申し出は、書き換えずに読んだときに判定します（イベントがないため）。過ぎた日の項目は残りますが、無害です
- [assumption] LINE の上限（Flex のボタンの文字 26 文字、template のボタンの文字 20 文字・本文 160 文字、altText 400 文字、1 回の reply 5 通、carousel 12 バブル）は、公式の資料をこの段階では確かめられていません。リポジトリの `lineApiService.ts` には carousel と 1 ボタンの組み立てしかなく、上限の数字は U6 の設計（`MAX_RECORD_CHOICES = 12`）の仮定と同じ扱いです。コード生成で公式の資料と照らし、違えば BR9.6・BR9.7 の文字数と 10 件の定数を直します
- [assumption] 月の確定時に U7 が展開する status-changed のイベントの数だけ、U8 のフックが条件つき書き込みを試します（担当に申し出がなければ条件で断られる）。確定の掃除の件数と時間（目安: 300 件で NFR7 の 3 秒に収まるか）は、NFR 設計で決める項目です。手段の候補は BR9.11 の (a) 測定で足りるとする、(b) フック側で並行数を限る、(c) 月単位のイベントを U7 の契約に足す、の 3 つです。申し出の項目を Query でまとめて掃除する形は (c) が前提です。正しさは BR9.8 が守るので、掃除が遅れても結果は変わりません
- [assumption] 「引き受けられたあとの二度押し」（同じ人が 2 回押す）は、2 回目に「この申し出はもう引き受けられています」を返します。Webhook の再送（同じイベント）は U1 の二度処理しない記録で止まります
