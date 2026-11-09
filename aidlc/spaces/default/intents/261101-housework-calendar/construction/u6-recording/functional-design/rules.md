# 業務の決まり（Rules）— U6 記録

U6（`u6-recording`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U5 の決まり（BR1.x〜BR6.x）はそのまま使い、ここでは U6 で足す決まりを BR7.x として書きます。日付と「今日」は日本時間です（NFR11）。「今」は、要求の入口で 1 回だけ取る裏側の時計の時刻です（画面や端末の時計は使いません）。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR7.1
    statement: リッチメニューの「やった」を押した人を見分け、子供だけが記録に進む。管理者と家族に入っていない人には、本人にだけ決まった案内を返す
    category: authorization
    applies_to: LINE の postback（action=record.list）、1 対 1 のトーク
    trigger: 1 対 1 のトークで「やった」が押されたとき
    logic: >-
      source.userId の利用者を探し、友だちで、家族に入っているかを確かめる（グループの入口 groupCommandGate と同じ考えで、1 対 1 用の入口を足す）。
      IF 家族に入っている子供 THEN BR7.2 に進む。
      IF 管理者 THEN 「お手伝いの記録は子供のメニューです。記録の修正は画面からできます」と本人にだけ返し、何も記録しない [Q2]。
      IF 家族に入っていない人、利用者の記録がない人、ブロック中の人 THEN 「先に家族に参加してください」と本人にだけ返す [Q2]。
      どの返事にも、家族の名前・メンバー・担当を入れない。家族のグループには何も送らない
    violation: 決まった案内の返事（記録しない）
    source: FR5.1、FR1.7、NFR4、Q2
  - id: BR7.2
    statement: 「やった」を押した子供には、自分の今日の担当から、記録できるものを選ぶ選択肢を出す。担当が 1 つでも選択肢を出す
    category: policy
    applies_to: C8 listTodayRecordableDuties、LINE の返事
    trigger: BR7.1 で子供と分かったとき
    logic: >-
      今日 = 今を日本時間にした日付。月 = 今日の月。
      IF その月が確定している THEN MONTH_CONFIRMED（「この月は確定済みです」）を返す（AC5.1.6）。
      ELSE 自分（ctx.userId）の今日の担当を、その日の担当の並びから探す。
      IF 状態が「未」の担当が 0 件 THEN selectable が 0 件の成功の形 { selectable, notSelectable } を返し、呼び出し側が NO_RECORDABLE_DUTY の返事にする。返事は「今日記録できる担当はありません」の文に、「済」「×」の担当があれば、
      選べない文字の並び（「皿洗い（済 16:42）」「掃除機（×）」。1 担当 1 行）を同じ返事の中に続けて付ける（AC5.1.3、AC5.1.5、FR5.4）。
      今日の担当が 1 件もないときは、最初の文だけを返す。listTodayRecordableDuties が理由の印として返すのは MONTH_CONFIRMED だけで、NO_RECORDABLE_DUTY は返事の種類（呼び出し側が選ぶ）として扱う。
      ELSE 「未」の担当を選択肢にし、「済」「×」の担当は同じ形の選べない文字の並びとして、選択肢のあとに添える（FR5.3、AC5.1.3）。
      「未」が 1 件だけのときも、選択肢を出して、選んだものだけを記録する。選ぶ前には記録しない [Q1]。
      メッセージの形: 返事は 1 回の reply に収め、(a) 見出しの文「どのお手伝いを記録しますか」、(b) Flex Message の carousel（1 つの担当 = 1 つのバブル。
      バブルに種類の名前と「記録する」ボタン 1 つ）、(c) 選べない文字の並び（あれば）の順にする。LINE の carousel は最大 12 個のバブルと仮定し（公式の上限はコード生成のときに確かめる。Assumptions）、
      定数 MAX_RECORD_CHOICES = 12 として 1 か所に置く。「未」の担当が 13 件以上のときは先頭の 12 件だけをバブルにし、(c) の末尾に「ほかの担当はアプリから記録してください」を添える。
      テスト: 「未」が 12 件 → 12 個のバブルで案内文なし。13 件 → 先頭 12 個のバブルと案内文あり、13 件目のバブルなし
    violation: MONTH_CONFIRMED、NO_RECORDABLE_DUTY（どちらも記録しない）
    source: FR5.1、FR5.3、FR5.4、AC5.1.3、AC5.1.5、AC5.1.6、Q1
  - id: BR7.3
    statement: 選択肢のボタンの値は、担当の ID と、見せた時点の担当の版（version）を持つ
    category: constraint
    applies_to: LINE の postback データ
    trigger: 選択肢を作るとき、選択肢が押されたとき
    logic: >-
      ボタンの値は action=record.do と dutyId と v（見せた時点の version）の組にする。長さは 300 文字以内（U3 の postback の決まり）。
      知らない action や、dutyId・v の形が違う値は、何もしない（LINE_EVENT_IGNORED）。
      値の中身を信じない。dutyId は、押した人の家族の中だけで探す（ほかの家族の担当は「ない」と同じ）
    violation: 何もしない（記録しない）
    source: FR5.1、FR5.7、NFR4
  - id: BR7.4
    statement: 記録の確かめは、LINE からも画面からも、同じ窓口 recordDuty が同じ順で行う
    category: validation
    applies_to: C8 recordDuty、POST /duties/{dutyId}/record、LINE の record.do
    trigger: 担当を記録する要求が届いたとき
    logic: >-
      次の順に確かめ、最初に当てはまったもので終える。
      1. 担当を探す（家族の中だけ）。なければ NOT_FOUND
      2. 担当の子供が ctx.userId でなければ NOT_OWN_DUTY（ほかの子供の担当、管理者による要求。AC5.1.12）
      3. 状態が「済」なら BR7.8（記録した人が本人なら最初の結果をそのまま返す。ほかの人（管理者）が記録していれば DUTY_ALREADY_DONE）
      4. その担当の月が確定していれば MONTH_CONFIRMED（AC5.1.9）
      5. 状態が「×」なら DUTY_SKIPPED_BY_ADMIN（AC5.1.11）
      6. 担当の日付が今日より後なら FUTURE_DUTY（AC5.1.10）
      7. LINE からのときだけ、担当の日付が今日でなければ NOT_TODAY_DUTY（FR5.1 は今日の担当）
      8. 要求の version が今の version と違えば DUTY_CHANGED（BR7.5）
      9. BR7.7 で単価を決め、BR7.6 で書く。
      画面からの記録は、確定していない月なら何か月前の担当でも、月をまたいでも記録できる（AC5.1.7、AC5.1.8）。
      「使わない」の種類の担当も記録できる（FR2.3）
    violation: 上の理由の印（何も書かない）
    source: FR5.1、FR5.3、FR5.5、FR5.6、FR5.7、AC5.1.7〜AC5.1.12
  - id: BR7.5
    statement: 選んだ担当が、見せたあとに変わっていたときは、変更されたことを伝え、いまの選択肢を出し直す
    category: policy
    applies_to: LINE の record.do、画面の記録
    trigger: BR7.4 が DUTY_CHANGED、NOT_OWN_DUTY、NOT_TODAY_DUTY、DUTY_SKIPPED_BY_ADMIN、DUTY_ALREADY_DONE、FUTURE_DUTY、NOT_FOUND を返したとき
    logic: >-
      印ごとの返事の文言と読み直しの有無は、functional-spec.md の「記録の結果の印と返事の対応」の表で決める（LINE と画面を 1 つの表にまとめた）。
      NOT_OWN_DUTY は「担当が変更された」として扱う。選択肢も「やった」ボタンも、自分の担当にしか出さないので、押された時点で自分の担当でなければ、
      見せたあとに管理者が担当を変えたとみなしてよい（直接 API を呼ぶ場合も、API の応答は 403 NOT_OWN_DUTY のままで、画面の文言だけが変更されたとして扱う）。
      LINE では、同じ返事の中に BR7.2 の今の選択肢を付ける。記録できる担当がなくなっていれば、BR7.2 の NO_RECORDABLE_DUTY の返事にする。
      月が確定していれば、MONTH_CONFIRMED の文言だけを返す [Q3]。画面では、表のとおりに文言を出して、カレンダーを読み直す。
      どの場合も、何も書かない。書き込みの途中で条件が合わなかったとき（BR7.6）も、1 回だけ読み直して BR7.4 をやり直し、同じ分かれ方にする
    violation: DUTY_CHANGED の文言と、出し直した選択肢
    source: FR5.3、FR5.4、Q3
  - id: BR7.6
    statement: 「済」にする書き込みは、担当の ID と版と「未」であること、月が確定していないこと、単価が書き写した値のままであることを、同じ取引で確かめる
    category: constraint
    applies_to: 担当の書き込み（記録）
    trigger: BR7.4 の確かめを通ったとき
    logic: >-
      1 つの取引で、担当の項目を更新する。条件は dutyId が同じ・status が todo・version が読んだ値と同じ。
      同じ取引に、月の状態が確定していないことの確かめと、お手伝いの種類の単価が読んだ値と同じことの確かめを入れる。
      更新する中身は 6 項目で、status=done、recordedAt=今（UTC）、recordedBy=ctx.userId、unitPrice=書き写す単価、updatedAt=今（recordedAt と同じ値。U5 の更新と同じく書き換えのたびに更新する）、version+1。origin は変えない。
      担当を作らない・消さない（U5 からの引き継ぎ）。
      条件が合わなかったときは、読み直して BR7.4 をやり直す（1 回だけ）。2 回続けて合わなければ INTERNAL（もう一度押してもらう）。
      月が先に確定された場合は、読み直しで MONTH_CONFIRMED になる
    violation: INTERNAL、または読み直した結果の理由の印
    source: FR5.1、FR5.3、FR6.5、U5 からの引き継ぎ
  - id: BR7.7
    statement: 記録のとき、お手伝いの種類の今の単価を担当に書き写す。書き写した単価はあとから変わらない
    category: calculation
    applies_to: C7 getCurrentUnitPrice、Duty.unitPrice
    trigger: BR7.4 の 9. のとき
    logic: >-
      C7 の getCurrentUnitPrice(ctx, choreTypeId) を、書き込みの直前に 1 回呼ぶ（強い整合性。「使わない」の種類にも今の単価を返す）。
      その値を unitPrice に書き、同じ取引で「単価がその値のまま」を確かめる（BR7.6）。単価を読んでから書くまでの間に管理者が単価を変えたら、
      取引が合わず、読み直して新しい単価でやり直す（1 回だけ。FR2.2 の「変更したあとに付いた記録から新しい単価」を守る）。
      NOT_FOUND（種類がない）は起きない前提で、起きたら INTERNAL にして何も書かない。
      U6 は、書き写したあとの unitPrice を二度と書き換えない。単価の変更が、すでに「済」の担当の金額を変えることはない
    violation: INTERNAL（何も書かない）
    source: FR2.2、FR5.1、AC5.1.13
  - id: BR7.8
    statement: 同じ担当を二重に記録しない。2 回目以降の要求は、書き込まずに最初の結果を返す
    category: constraint
    applies_to: C8 recordDuty
    trigger: すでに「済」の担当に、記録の要求が届いたとき
    logic: >-
      IF 状態が「済」で、recordedBy が ctx.userId THEN 何も書かず、成功として今の担当を返す（alreadyRecorded=true。recordedAt は最初の時刻のまま）。
      LINE の返事は最初の記録と同じ文（最初の時刻を使う）。画面は「済」の表示にそろえる。
      IF 状態が「済」で recordedBy が本人でない（管理者が「済にする」を先にした）THEN DUTY_ALREADY_DONE（「この担当はすでに『済』になっています」）。
      この確かめは version の比べより先に行う（二重に押した 2 回目は、版が古くても成功と同じ扱いにするため）。
      同時に届いた 2 つの要求は、BR7.6 の条件で片方だけが書き、もう片方は読み直して上の分かれ方になる。
      LINE が同じイベントを送り直したときは、U1 の BR2.7（イベント ID の二度処理しない記録）で止まる
    violation: なし（成功と同じ結果）または DUTY_ALREADY_DONE
    source: FR5.3、AC5.1.4、U1 の BR2.7
  - id: BR7.9
    statement: LINE で記録したら、記録した本人にだけ「{お手伝い}を記録しました（{時:分}）」と返事する。家族のグループには何も送らない
    category: policy
    applies_to: LINE の返事
    trigger: LINE の record.do が成功したとき
    logic: >-
      reply トークンで、押した本人の 1 対 1 のトークに返事する。時刻は recordedAt を日本時間の時と分にしたもの（例 16:42）。
      push は使わない（グループにも本人にも）。月 200 通の無料枠を使わない（NFR1）。
      画面からの記録では、LINE に何も送らない（FR5.5。返事も push もしない）
    violation: なし
    source: FR5.2、FR5.5、AC5.1.2、AC5.1.7
  - id: BR7.10
    statement: 画面では、記録できる担当にだけ「やった」を付け、押すと確認を出してから記録する。記録できない担当には、ボタンの代わりに理由を文字で出す
    category: policy
    applies_to: カレンダーの日の中、日の詳細
    trigger: 子供がカレンダーまたは日の詳細を見たとき、「やった」を押したとき
    logic: >-
      ボタンを出す条件は、自分の担当で、状態が「未」で、日付が今日まで（画面では MonthCalendar.today で決める）で、その月が確定していないこと。
      出さないときの文字は次のとおり。明日以降は「まだ来ていない日の担当は記録できません」、「×」は「お母さんが『やらなかった』にしています」、
      確定した月は「この月は確定済みです」。「済」は状態の文字（「済 16:42 太郎が記録」）がその役目をするので、ボタンも理由も足さない。
      ほかの子供の担当には、ボタンも理由も出さない。管理者にはボタンを出さない（管理者の修正は U7）。
      ボタンを押すと「1/5 皿洗いを記録しますか」と「記録する」「やめる」を出す [Q4]。「記録する」を押したら、結果が返るまでボタンを押せなくする。
      成功したらカレンダーを読み直し、「済」の表示にする。失敗したら理由の文言を出し、カレンダーを読み直す（担当が変わっていたときの 409 を含む）。
      画面の判断は見た目のためで、記録できるかの判断は裏側の BR7.4 が行う。確定していない月なら、前の月の担当にもボタンを出す（月をまたいでよい）
    violation: 理由の文言（BR7.4 の理由の印）
    source: FR5.3、FR5.5、FR5.6、FR5.7、AC5.1.7〜AC5.1.12、Q4
  - id: BR7.11
    statement: 日付の区切りと記録の時刻は日本時間で扱う。日本時間の 23:59 と 0:00 の記録は、別の日の担当として扱われる
    category: calculation
    applies_to: 「今日」の決め方、担当の日付、時刻の表示
    trigger: 今日の担当を探すとき、今日より後かを比べるとき、時刻を出すとき
    logic: >-
      今日は今を日本時間にした日付で決める。担当の日付は日本時間の日付そのもの（記録した時刻で担当の日付は変わらない）。
      recordedAt は UTC で保存し、表示だけ日本時間にする。日本時間の 1 月 7 日 23:59 に今日の担当を記録すれば 1 月 7 日の担当が、
      1 月 8 日 0:00 に今日の担当を記録すれば 1 月 8 日の担当が記録される。1 月 7 日 23:59 に開いた選択肢を 0:00 を過ぎて押したときは、1 月 7 日の担当は「今日の担当」ではなくなるので NOT_TODAY_DUTY（BR7.5）
    violation: なし
    source: NFR11、AC5.1.14
  - id: BR7.12
    statement: 記録は、お小遣いの回数に、すぐ数えられる
    category: calculation
    applies_to: Duty の読み取り
    trigger: 記録が成功したあと、担当を読むとき
    logic: >-
      「済」と unitPrice を同じ書き込みで書くので、記録の直後に強い整合性で読めば、「済」の担当として数えられる。
      U6 は回数や金額を別に保存しない（合計は保存せず、読むたびに計算する。ADR-005）。
      額の表示は U9 で作る。U6 では、記録した担当が「済」で、unitPrice に書き写した単価が入っていることで確かめる（例 100 円の皿洗いが 3 回あるところに 1 回記録すると、「済」が 4 件で unitPrice の合計が 400 円）
    violation: なし
    source: FR5.8、ADR-005、AC5.1.13
  - id: BR7.13
    statement: 子供が自分で「済」を取り消す仕組みは作らない
    category: policy
    applies_to: U6 の範囲
    trigger: 子供が押し間違えたとき
    logic: >-
      間違えて記録したときは、管理者が U7 の画面で取り消す（FR6.2）。U6 は、押し間違いを減らすために、LINE の選択肢（BR7.2）と画面の確認（BR7.10）を置く。
      「済」の担当に出る操作はない。記録後に取り消す API・postback・画面の入口を U6 は持たない [Q5]
    violation: なし
    source: FR6.2、Q5
  - id: BR7.14
    statement: 担当が「済」になったことを、C8 の中で伝える仕組み（onDutyRecorded）を用意する
    category: policy
    applies_to: C8 onDutyRecorded
    trigger: 記録の書き込みが成功したあと
    logic: >-
      U5 の onDutyReassigned と同じ形で、書けたあとに呼ばれる登録の仕組みを置く。イベントは familyId・dutyId・date・choreTypeId・childUserId。
      U8 が、その担当に出ている「代わりにやる」の申し出を取り下げるために登録する（FR7.5）。U8 までは登録がなく、何もしない。
      呼んだ関数が投げても、記録の結果は変えない（警告のログを残す）。書き込みをやり直しても、同じ記録について 2 回呼ばない
    violation: なし
    source: FR7.5、U5 からの引き継ぎ
  - id: BR7.15
    statement: リッチメニューは、公式アカウントの初期のメニューとして、全員に同じものを出す
    category: policy
    applies_to: リッチメニューの設定
    trigger: 配備のとき
    logic: >-
      メニューには「やった」のボタンが 1 つあり、押すと postback（action=record.list）を送る。管理者にも家族に入っていない人にも同じメニューが見えるので、
      押されたときの返事は BR7.1 で分ける [Q2]。ステージングと本番は、それぞれの公式アカウントに別に設定する（NFR10）。
      設定に使うトークンは秘密の情報で、リポジトリに入れない（例 <作り物の値>）
    violation: なし
    source: FR5.1、NFR10、project.md の禁止事項
  - id: BR7.16
    statement: ログには記録の事実だけを残し、名前や秘密の情報は残さない
    category: policy
    applies_to: ログ
    trigger: 記録が成功・失敗したとき
    logic: >-
      DUTY_RECORDED（familyId、dutyId、経路 line か api、alreadyRecorded、所要時間）、DUTY_RECORD_REJECTED（理由の印）を残す。
      LINE のユーザー ID、表示名、返事のトークン、postback の全文は残さない
    violation: なし
    source: NFR2、NFR4
  - id: BR7.17
    statement: 取引の読み直しが 2 回続けて断られたときだけ、本人にだけ「うまく記録できませんでした。もう一度お試しください」と返す。それ以外の予期しない例外は reply せず 500 にして、LINE の再送に任せる。記録が途中で残ることはない
    category: policy
    applies_to: LINE の返事、画面
    trigger: 記録の書き込みが 2 回続けて合わなかったとき（INTERNAL）、予期しない例外のとき（reply しない）。残り時間は見ず、Lambda の時間切れも予期しない例外と同じ扱いにする
    logic: >-
      記録は 1 つの取引なので、「一部だけ書かれた」状態はない。LINE では、INTERNAL（読み直しが 2 回続けて断られた）のときだけ文言を本人にだけ返し、イベントを処理済みにして 200 を返す（BR2.7）。
      予期しない例外（DynamoDB に接続できない等）では reply のトークンを使わず、「処理中」の記録を消して 500 を返し、LINE の再送に任せる（U1 の NFR2.2、U3 の NFR2.18）。返事のあとに 500 にすると、再送で記録だけが黙って書かれ、返事と実際が食い違うため。
      画面では INTERNAL の文言と「読み込み直す」を出す。返事は 3 秒以内を目標にし、読み取りは担当の探索（最大 3 回）と単価の 1 回、LINE の返事に使うお手伝いの名前の一覧（ChoreTypes の Query 1 回）、書き込みは 1 回に絞る（NFR7）。
      改訂（2026-11-09、理由: NFR 要件レビュー R-01）: 以前は予期しない例外と残り時間が足りないときにも本人へ返す書き方だったが、上のとおりに直した
    violation: INTERNAL
    source: NFR7、NFR2、AC5.1.15
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR7.1 | 「やった」は子供だけが記録に進む。管理者と家族外には決まった案内 | 権限 | FR5.1、Q2 |
| BR7.2 | 自分の今日の担当から選ぶ。1 つでも選択肢を出す | 方針 | FR5.1、FR5.3、FR5.4、Q1 |
| BR7.3 | ボタンの値は dutyId と見せた版 | 制約 | FR5.1、NFR4 |
| BR7.4 | 記録の確かめは LINE も画面も同じ順 | 入力の確かめ | FR5.1〜FR5.7 |
| BR7.5 | 見せたあとに変わっていたら、伝えて出し直す | 方針 | Q3 |
| BR7.6 | 書き込みは ID・版・「未」・月・単価を同じ取引で確かめる | 制約 | FR5.3、U5 の引き継ぎ |
| BR7.7 | 今の単価を書き写す。あとから変わらない | 計算 | FR2.2 |
| BR7.8 | 二重に記録しない。2 回目は最初の結果 | 制約 | FR5.3 |
| BR7.9 | LINE の返事は本人にだけ。画面からは LINE に知らせない | 方針 | FR5.2、FR5.5 |
| BR7.10 | 画面のボタン・確認・理由の文字 | 方針 | FR5.5〜FR5.7、Q4 |
| BR7.11 | 日本時間で日付を区切る | 計算 | NFR11 |
| BR7.12 | 記録はすぐ回数に数えられる | 計算 | FR5.8 |
| BR7.13 | 子供が自分で取り消す仕組みは作らない | 方針 | Q5 |
| BR7.14 | 「済」になったことを伝える仕組み（U8 向け） | 方針 | FR7.5 |
| BR7.15 | リッチメニューは全員に同じものを出す | 方針 | FR5.1 |
| BR7.16 | ログに名前や秘密を残さない | 方針 | NFR4 |
| BR7.17 | 思いがけない失敗の返事（INTERNAL だけ返事。ほかの例外は 500 で再送） | 方針 | NFR7 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR2.2、FR5.1〜FR5.8、FR6.1〜FR6.5、FR7.5、NFR1、NFR2、NFR4、NFR7、NFR11）
- `inception/user-stories/stories.md`（AC5.1.1〜AC5.1.15）
- `inception/contract-design/contract-summary.md`（C1 の記録、C3 の postback、C7、C8、C10）
- `construction/u5-assignment-calendar/functional-design/rules.md`、`docs/contract-changes-u5.md`（引き継ぎ）
- `docs/contract-changes-u3.md`（グループの入口 `groupCommandGate`、postback の決まり）、`docs/contract-changes-u4.md`
- `functional-design-questions.md` の回答 [Q1]〜[Q5]

## Assumptions & Open Questions

- AC5.1.3（「済」の担当は選べない状態で表示）と FR5.4（記録できる担当がなければ「今日記録できる担当はありません」）は、1 通の返事で両方を満たすと決めました（BR7.2）。「未」が 0 件で「済」「×」の担当があるときは、「今日記録できる担当はありません」に続けて「皿洗い（済 16:42）」のような選べない文字の並びを付けます。「未」が 1 件以上あるときは、選択肢のあとに同じ並びを添えます。確かめは書き分けます: AC5.1.3 は「皿洗いが『済』の 1 件だけ」で、返事に案内文と「皿洗い（済 …）」の両方が出ること。AC5.1.5 は「今日の担当が 0 件」で、案内文だけが出て並びがないこと
- [assumption] 同じ担当を管理者が先に「済にする」で記録していた場合の文言 `DUTY_ALREADY_DONE`（「この担当はすでに『済』になっています」）は、要件にない新しい文言です。契約への追加として `docs/contract-changes-u6.md` に残します
- [assumption] 選択肢は Flex Message の carousel とし、LINE の carousel は最大 12 個のバブルと仮定して、上限を 12 件（MAX_RECORD_CHOICES）にします。公式の上限は、この段階では確かめられていません。コード生成で LINE の公式の資料と照らし、違えば定数と BR7.2 のテストの件数を直します。1 日に 12 件を超える担当は現実的でないため、超えた分はアプリで記録します
