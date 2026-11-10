# 業務の決まり（Rules）— U7 確認・修正と確定

U7（`u7-review-confirm`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U6 の決まり（BR1.x〜BR7.x）はそのまま使い、ここでは U7 で足す決まりを BR8.x として書きます。日付と「今日」は日本時間です（NFR11）。「今」は、要求の入口で 1 回だけ取る裏側の時計の時刻です（画面や端末の時計は使いません）。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR8.1
    statement: 記録の確認・修正（状態の変更）と、月の確定・確定の取り消しは、管理者だけができる。子供はできない
    category: authorization
    applies_to: POST /duties/{dutyId}/status、PUT /months/{month}/confirmation、DELETE /months/{month}/confirmation、C8 changeDutyStatus・confirmMonth・unconfirmMonth、修正・確定の画面
    trigger: 要求が届いたとき、画面を出すとき
    logic: >-
      入口は C6 の requireAdmin で管理者を確かめる（U1 の仕組み）。
      IF 管理者でない（子供） THEN 403 ADMIN_ONLY で何も変えない（FR6.6、AC6.1.10）。
      IF 家族のメンバーでない THEN 403 NOT_FAMILY_MEMBER。IF セッションがない THEN 401。
      画面は、状態を変えるボタン（取り消す・済にする・やらなかった・外す）と、月を確定する・取り消すボタンを、管理者にだけ出す（Q5、Q6）。
      子供には、カレンダーと日の詳細を見ることだけを残す（状態は U5 の BR6.13 で見える）
    violation: 403 ADMIN_ONLY、403 NOT_FAMILY_MEMBER、401
    source: FR6.6、NFR4、AC6.1.10
  - id: BR8.2
    statement: 担当の状態は FR6.1 の表の 5 とおりの変わり方だけで変わる。表にない操作は断る
    category: constraint
    applies_to: C8 changeDutyStatus、POST /duties/{dutyId}/status
    trigger: 管理者が状態を変える操作（action）を送ったとき
    logic: >-
      まず本文の形を確かめる（担当を探す前）。
      action が cancel・markDone・markSkipped・unmarkSkipped の 4 つのどれでもなければ 422 INVALID_REQUEST で何も変えない。
      次に、いまの状態と action の組を、FR6.1 の表で引く。許される組は次のとおり。
      cancel: 済 → 未。
      markDone: 未 → 済、× → 済。
      markSkipped: 未 → ×、済 → ×。
      unmarkSkipped: × → 未。
      IF いまの状態と action の組が表にない THEN 409 INVALID_TRANSITION で何も変えない（例: 「未」に cancel、「×」に markSkipped、すでに「済」に markDone）。
      本文の形の確かめ（INVALID_REQUEST）が先、表の確かめ（INVALID_TRANSITION）が後。
      表にある組だけが、BR8.4〜BR8.6 の書き込みに進む
    violation: 409 INVALID_TRANSITION、422 INVALID_REQUEST
    source: FR6.1、AC6.1.1〜AC6.1.5
  - id: BR8.3
    statement: 取り消し・やらなかった・やらなかったを外す・済にするは、操作の前に 1 行の変化と必要な注意を確認として出す
    category: policy
    applies_to: 日の詳細の画面
    trigger: 管理者が状態を変えるボタンを押したとき
    logic: >-
      確認の中身は StatusChangePreview（日付・お手伝い・担当の子供・今の状態・操作後の状態の 1 行）。
      例「1/5 皿洗い 太郎: 済 → 未 に戻します」[Q2]。
      IF cancel（済→未）または markSkipped で今が「済」（済→×） THEN 「お小遣いの回数から外れます」を添える [Q2]。
      IF markDone（未→済・×→済） THEN 「{単価} 円で数えます」を添える。単価は、確認を出す時点の getCurrentUnitPrice を画面が読んで出す（実際に数えるのは書き込み時の単価。BR8.6） [Q3]。
      「済にする」も、ほかの状態変更と同じく確認を出す（要件に確認の指定はないが、単価を書き写すこと・金額に入ることを操作の前に見せる） [Q3]。
      確認は AC6.1.9 のとおり、取り消し・やらなかった・やらなかったを外すで必ず出す。申し出（U8）の知らせは U7 では出さない（Q2 の B は選ばない。U8 までは申し出がない前提）。
      確認して初めて BR8.4 の書き込みに進む。やめれば何もしない
    violation: なし（確認のための表示）
    source: FR6.2、FR6.3、FR6.4、AC6.1.9、Q2、Q3
  - id: BR8.4
    statement: 状態を変える書き込みは、担当の ID と版と今の状態、月が確定していないことを、同じ取引で確かめる
    category: constraint
    applies_to: 担当の書き込み（状態の変更）
    trigger: BR8.1〜BR8.3 を通り、BR8.2 で許された組のとき
    logic: >-
      担当を探す（C8 の findDuty。DID#<dutyId> → 担当 → 月の状態の強い整合性の GetItem 3 回）。
      1. 担当がない・ほかの家族・dutyId の形が違う → 404 NOT_FOUND（ほかの家族のデータを知らせない。NFR4）。
      2. その担当の月が確定していれば → 409 MONTH_CONFIRMED（FR6.5。確定している月は何も変えられない）。
      3. いまの状態と action の組が FR6.1 の表になければ → 409 INVALID_TRANSITION（BR8.2）。
      上を通ったら 1 つの取引で担当を更新する。条件は dutyId が同じ・version が読んだ値と同じ・status が「いまの状態」（表の左）。
      同じ取引に、月の状態が確定していないことの ConditionCheck（U5 の buildMonthGuard。担当の month で引く。今日の月ではない）を入れる。
      条件が合わなかったとき（版が変わった・先に確定された）は、1 回だけ読み直して 1.〜3. をやり直し、同じ分かれ方にする。2 回続けて合わなければ 500 INTERNAL。
      担当を作らない・消さない・origin を変えない（U5・U6 の引き継ぎ）
    violation: 404 NOT_FOUND、409 MONTH_CONFIRMED、409 INVALID_TRANSITION、500 INTERNAL
    source: FR6.1、FR6.5、U5・U6 の引き継ぎ、AC6.1.1〜AC6.1.5
  - id: BR8.5
    statement: 「未」「×」に戻す書き込みは、記録の 3 項目（recordedAt・recordedBy・unitPrice）を同時に空にする
    category: constraint
    applies_to: 担当の書き込み（cancel 済→未、markSkipped 済→×、markSkipped 未→×、unmarkSkipped ×→未）
    trigger: BR8.4 の確かめを通り、操作後の状態が「未」または「×」のとき
    logic: >-
      担当の Update で、status を操作後の状態（todo または skipped）にし、recordedAt・recordedBy・unitPrice を REMOVE で消し、
      updatedAt=今、version+1 を書く（status と version と dutyId の条件つき。BR8.4）。
      3 項目は同時に消す。どれか 1 つだけが残る状態は作らない [Q1]。
      「未」→「×」（markSkipped）と「×」→「未」（unmarkSkipped）は、もともと記録の項目が空なので、消す操作をしても結果は同じ（空のまま）。
      お小遣い（U9）は「済」の担当の unitPrice だけを数えるので、空にしても残しても金額は同じだが、状態と中身を食い違わせないために空にする
    violation: なし（書き込みの決まり）
    source: FR6.1、FR6.2、FR6.4、Q1
  - id: BR8.6
    statement: 「済にする」書き込みは、操作した時点の単価を C7 から読んで書き写し、記録した時刻に今・記録した人に管理者を同時に書く
    category: calculation
    applies_to: 担当の書き込み（markDone 未→済、×→済）、C7 getCurrentUnitPrice
    trigger: BR8.4 の確かめを通り、action が markDone のとき
    logic: >-
      書き込みの直前に C7 の getCurrentUnitPrice(ctx, choreTypeId) を 1 回呼ぶ（強い整合性。「使わない」の種類にも今の単価を返す）。
      担当の Update で、status=done、recordedAt=今（UTC）、recordedBy=ctx.userId（管理者）、unitPrice=読んだ単価、updatedAt=今、version+1 を書く（FR6.3、AC6.1.2、AC6.1.3）。
      3 項目（recordedAt・recordedBy・unitPrice）は同時に書く。どれか 1 つだけが空の「済」は作らない（U6 と同じ不変条件）。
      同じ取引に、単価が読んだ値のままであることの ConditionCheck（U6 の buildUnitPriceGuard）を入れる。
      単価を読んでから書くまでの間に管理者が単価を変えたら、取引が合わず、読み直して新しい単価でやり直す（1 回だけ。FR2.2 の「変更したあとに付いた記録から新しい単価」を守る）。
      childUserId は担当の子供のまま変えない（記録した人 recordedBy は管理者で、担当の子供 childUserId とは別）。
      NOT_FOUND（種類がない）は起きない前提で、起きたら 500 INTERNAL にして何も書かない。書き写した unitPrice はあとから変わらない
    violation: 500 INTERNAL（何も書かない）
    source: FR6.3、FR2.2、ADR-003、AC6.1.2、AC6.1.3
  - id: BR8.7
    statement: 状態の変更は、お小遣いの額と回数に、すぐ反映される
    category: calculation
    applies_to: Duty の読み取り
    trigger: 状態の変更が成功したあと
    logic: >-
      「済にする」で status=done と unitPrice を同じ書き込みで書き、「取り消す」「やらなかったにする」で status を変えて unitPrice を空にするので、
      書き込みの直後に強い整合性で読めば、「済」の担当だけが数に入る。
      U7 は回数や金額を別に保存しない（合計は保存せず、読むたびに計算する。ADR-005）。
      額の表示は U9。U7 では、状態と unitPrice が一致していることで確かめる（例: 120 円の皿洗いを「済にする」と「済」が 1 件増え unitPrice の合計が 120 円増える。取り消すと元に戻る）
    violation: なし
    source: FR5.8、FR6.3、ADR-005、AC6.1.1、AC6.1.2、AC6.1.4
  - id: BR8.8
    statement: データを直接書き換えなくても、FR6.1 の表のすべての変わり方と、確定・確定の取り消しが、画面からできる
    category: policy
    applies_to: 修正と確定の画面、C8 の窓口
    trigger: 管理者が間違いを直したいとき
    logic: >-
      本番のデータを手で書き換えない（NFR6、project.md の禁止事項）。
      間違いは、取り消す・済にする・やらなかったにする・やらなかったを外す（BR8.4〜BR8.6）と、確定の取り消し（BR8.12）で直す。
      FR6.1 の表の 5 とおりすべてと、確定・確定の取り消しに、画面の入口がある（Q5、Q6）。
      確認（BR8.3、BR8.10）を出してから書く。元に戻すボタンは置かない（U5・U6 と同じ。もう一度操作して直す）。
      テスト: FR6.1 の 5 とおりと確定・取り消しを画面から行い、どれもデータの直接の書き換えなしで直せることを確かめる（AC6.1.11）
    violation: なし
    source: NFR6、AC6.1.11、project.md の禁止事項
  - id: BR8.9
    statement: 日の詳細で、担当ごとに、今の状態からできる操作だけをボタンで出す
    category: policy
    applies_to: 日の詳細の画面
    trigger: 管理者が日付を選んで開いたとき
    logic: >-
      担当ごとに、今の状態に応じて FR6.1 の表のとおりの操作だけをボタンで出す [Q5]。
      「未」→「済にする」「やらなかったにする」。
      「済」→「取り消す」「やらなかったにする」。
      「×」→「やらなかったを外す」「済にする」。
      表にない操作のボタンは出さない。ボタンを押すと BR8.3 の確認を出してから BR8.4 の要求を送る。
      要求には、見せた時点の version を持たせる（BR8.4 の条件に使う）。
      結果が返るまでボタンを押せなくし、成功したらカレンダー（または日の詳細）を読み直す。失敗したら理由の文言を出して読み直す。
      画面の判断は見た目のためで、できるかの判断は裏側の BR8.2・BR8.4 が行う。
      「未」の担当の「担当を変える」（子供の変更）は U5 の BR6.9 の入口のままで、U7 では足さない
    violation: 理由の文言（BR8.4 の理由の印）
    source: FR6.1、NFR6、AC6.1.9、AC6.1.11、Q5
  - id: BR8.10
    statement: 月を確定する確認では、残っている「未」の担当の件数を注意として添える
    category: policy
    applies_to: 月の確定の画面、PUT /months/{month}/confirmation
    trigger: 管理者が「この月を確定する」を押したとき
    logic: >-
      確認の中身は MonthConfirmPreview。
      その月に状態が「未」の担当が N 件（N ≥ 1）残っていれば、「未の担当が N 件あります。確定すると、これらは記録もやらなかったにもできなくなります」を添える [Q4]。
      「未」が 0 件なら件数の注意は出さず、「{月}を確定しますか？ 確定すると変更できなくなります」だけを出す。
      「未」が残っていても確定はできる（断らない。FR6.5 の「いつでも確定できる」を守る） [Q4]。
      件数は画面がカレンダー（getMonthCalendar）の担当の状態から数える。確認して初めて BR8.11 の確定の書き込みに進む
    violation: なし（確認のための表示）
    source: FR6.5、AC6.1.6、AC6.1.9、Q4
  - id: BR8.11
    statement: 月を確定すると、その月は担当・記録・状態・割り当て・加算・減額のすべてを、誰も変えられなくなる
    category: constraint
    applies_to: C8 confirmMonth、PUT /months/{month}/confirmation、月の状態の書き込み
    trigger: 管理者が確認のあとで月を確定したとき
    logic: >-
      月の状態（M#<month>#S）を confirmed=true、confirmedAt=今、confirmedByUserId=ctx.userId にする。
      行がまだ無い月（記録のない月。MonthState が無く version 0 として扱う。entities.md の MonthState の version の既定 0）への初回書き込みは、
      行が無いことを条件（attribute_not_exists）にした Put で version=1 の確定行を作る。
      行が既にある月は Update で version+1 にする。出し分けの実装の細かい形（1 回の条件つき Upsert にするか Put と Update を使い分けるか）はコード生成に委ねるが、
      「行が無い月」は新しい確定行を作る、という分岐の意図を設計で確定させる。
      どの月でもいつでも確定できる（今月・来月・過ぎた月を問わない）。すでに確定していれば、何も変えずに同じ結果を返す（二度押しで取り違えない。確定済みをもう一度確定しても true のまま）。
      確定したあとは、担当・記録・状態の変更（BR8.4、U6 の記録、U5 の子供の変更）、割り当ての保存（U5 の BR6.2）、加算・減額（U9・U11）が、それぞれの月の確かめ（buildMonthGuard の ConditionCheck）で MONTH_CONFIRMED に断られる。
      月末のまとめ（FR9.2）は、確定していてもいなくても送る（U10。FR6.5）。16 時のリマインドは確定している月には送らない（U10。FR9.1）
    violation: なし（書き込みの決まり）
    source: FR6.5、FR3.5、AC6.1.6
  - id: BR8.12
    statement: 確定を取り消すと、その月はまた変更できるようになる。確定の取り消しの前にも確認を出す
    category: constraint
    applies_to: C8 unconfirmMonth、DELETE /months/{month}/confirmation、月の状態の書き込み
    trigger: 管理者が確定を取り消したとき
    logic: >-
      確定の取り消しの前に「{月}の確定を取り消しますか？ 取り消すと、また変更できるようになります」を出す（AC6.1.9） [Q6 の入口]。
      行がある月は Update で、confirmed=false、confirmedAt と confirmedByUserId を REMOVE で消し、version+1 にする。
      行がまだ無い月（記録のない月。MonthState が無く、確定していない＝false として扱う。entities.md の MonthState）への取り消しは、行を作らず何もしない（既に false の状態と同じ結果）。
      どの月でもいつでも取り消せる。確定していない月の取り消しは、何も変えずに同じ結果を返す（false のまま）。
      取り消すと、担当・記録・状態・割り当て・加算・減額の変更が、また通るようになる（AC6.1.7）。
      確定前の未確定の期間は期限がない（確定していない月は、いつまでも変更できる。FR6.5）
    violation: なし（書き込みの決まり）
    source: FR6.5、AC6.1.7、AC6.1.9
  - id: BR8.13
    statement: 月の確定・確定の取り消しの入口は、カレンダーの月の見出しの近くに、管理者にだけ出す
    category: policy
    applies_to: カレンダーの画面
    trigger: 管理者がカレンダーを開いたとき
    logic: >-
      確定していない月なら「この月を確定する」、確定済みの月なら「確定を取り消す」ボタンを、月の見出しの近くに出す [Q6]。
      確定済みの月には「確定済み」の表示（U5 の BR6.11）も残す。子供にはボタンを出さない（BR8.1）。
      「この月を確定する」は BR8.10 の確認、「確定を取り消す」は BR8.12 の確認を出してから要求を送る。
      どの月でも確定・取り消しができるので、前後の月のボタン（U5 の BR6.12）で移った先の月にもボタンを出す
    violation: なし
    source: FR6.5、AC6.1.9、Q6
  - id: BR8.14
    statement: いつでも確定でき、いつでも取り消せる。確定していない月は期限なく変更できる
    category: policy
    applies_to: C8 confirmMonth・unconfirmMonth、月の確かめ
    trigger: 確定・確定の取り消し・確定していない月の変更のとき
    logic: >-
      確定と取り消しに、月が今月かどうかなどの時期の制限は付けない（FR6.5。承認時の指示「いつでも確定できる。いつでも取り消しできる。確定しなければいつまででも修正できる」）。
      月をまたいだあとでも、確定していない過去の月の担当は記録・修正できる（U6 の AC5.1.8、AC6.1.8。U7 の状態の変更も同じ）。
      確定・取り消しは、同じ取引で version を条件にしなくてよい（上書きではなく、目的の値にそろえる作りなので、二度押しや確定↔取り消しの連打でも最後の操作の結果にそろう。version は記録と並べ替えの手がかりとして増やす）
    violation: なし
    source: FR6.5、AC6.1.7、AC6.1.8
  - id: BR8.15
    statement: 状態の変更で担当が「未」でなくなったとき、または月を確定したときは、その担当の「代わりにやる」の申し出を取り下げる仕組みを呼ぶ
    category: policy
    applies_to: C8 onDutyReassigned（U5 の仕組みを使う）、changeDutyStatus・confirmMonth のあと
    trigger: 状態の変更の書き込みが成功したあと、月の確定の書き込みが成功したあと
    logic: >-
      状態の変更が成功し、担当が「未」でなくなった（済・×になった）とき、U5 の onDutyReassigned と同じ形の仕組みを、書けたあとに呼ぶ。
      月を確定したときは、その月の「未」でない・または全部の担当にかかる申し出を取り下げるために、U8 が使える手がかりを渡す。
      イベントは familyId・dutyId・date・choreTypeId・kind（status-changed、month-confirmed）。
      U8 が、その担当に出ている申し出を取り下げるために登録する（FR7.5 の「担当の状態が『未』でなくなった」「その月が確定された」）。U8 までは登録がなく、何もしない。
      呼んだ関数が投げても、状態の変更・確定の結果は変えない（警告のログを残す。U5・U6 と同じ）。書き込みをやり直しても、同じ変更について 2 回呼ばない
    violation: なし
    source: FR7.5、U5・U6 の引き継ぎ
  - id: BR8.16
    statement: 状態の変更も確定も、同じ操作を 2 回送られても結果が同じになる
    category: constraint
    applies_to: POST /duties/{dutyId}/status、PUT・DELETE /months/{month}/confirmation
    trigger: 同じ操作が 2 回届いたとき
    logic: >-
      状態の変更: 2 回目は version が進んでいて、かつ状態がすでに操作後の状態なので、BR8.2 の表で「今の状態 → その操作」が引けず INVALID_TRANSITION になるか、
      version の条件で読み直して同じ結果になる（例: 「済」を 2 回取り消すと、2 回目は「未」に cancel で INVALID_TRANSITION）。画面は BR8.9 で、今の状態からできる操作だけを出すので、二度押しは起きにくい。
      確定・取り消し: すでに目的の状態なら何も変えずに同じ結果を返す（BR8.11、BR8.12）。
      画面からの操作も、同じ操作を 2 回送られても結果が同じになる作りにする（契約の二重に届いたときの決まり）
    violation: なし（成功と同じ結果、または INVALID_TRANSITION）
    source: FR6.1、FR6.5、契約の二重送信の決まり
  - id: BR8.17
    statement: ログには操作の事実だけを残し、名前や秘密の情報は残さない
    category: policy
    applies_to: ログ
    trigger: 状態の変更・確定・取り消しが成功・失敗したとき
    logic: >-
      DUTY_STATUS_CHANGED（familyId、dutyId、action、fromStatus、toStatus）、DUTY_STATUS_REJECTED（理由の印）、
      MONTH_CONFIRMED_SET（familyId、month、confirmed の新しい値）を残す。
      子供や管理者の表示名、お手伝いの名前、LINE のユーザー ID、単価の値、秘密の情報（例 <作り物の値>）は残さない
    violation: なし
    source: NFR2、NFR4、NFR5
  - id: BR8.18
    statement: 思いがけない失敗は、画面に「表示できませんでした。もう一度お試しください」を出し、何も中途半端に残さない
    category: policy
    applies_to: 画面、C8 の窓口
    trigger: 取引の読み直しが 2 回続けて断られたとき（INTERNAL）、予期しない例外のとき
    logic: >-
      状態の変更も確定も 1 つの取引なので、「一部だけ書かれた」状態はない。
      INTERNAL（読み直しが 2 回続けて断られた）や、思いがけない失敗（DynamoDB に接続できない等）のときは、500 を返し、画面は「表示できませんでした。もう一度お試しください」と「読み込み直す」を出す（FR4.5 の文言）。
      失敗を 15 分以内に作り手に知らせる仕組み（NFR2）につなげる。もう一度操作すれば、今の状態からやり直せる（BR8.9 で今の状態のボタンを出し直す）
    violation: 500 INTERNAL
    source: NFR2、NFR7、FR4.5
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR8.1 | 状態の変更・確定は管理者だけ。子供はできない | 権限 | FR6.6、AC6.1.10 |
| BR8.2 | FR6.1 の表の 5 とおりだけ。表にない操作は INVALID_TRANSITION | 制約 | FR6.1 |
| BR8.3 | 状態の変更の前に 1 行の変化と注意を確認で出す | 方針 | FR6.2〜6.4、Q2、Q3 |
| BR8.4 | 書き込みは ID・版・今の状態・月の確定を同じ取引で確かめる | 制約 | FR6.1、FR6.5 |
| BR8.5 | 「未」「×」に戻すと記録の 3 項目を同時に空にする | 制約 | Q1 |
| BR8.6 | 「済にする」は今の単価を書き写し、時刻・人・単価を同時に書く | 計算 | FR6.3、FR2.2 |
| BR8.7 | 状態の変更はすぐ額・回数に反映される | 計算 | FR5.8、ADR-005 |
| BR8.8 | すべての直しが画面からできる（手でデータを書き換えない） | 方針 | NFR6、AC6.1.11 |
| BR8.9 | 日の詳細に、今の状態からできる操作だけをボタンで | 方針 | FR6.1、Q5 |
| BR8.10 | 確定の確認に「未」の件数の注意を添える | 方針 | FR6.5、Q4 |
| BR8.11 | 確定すると、その月の全部を誰も変えられなくなる | 制約 | FR6.5、FR3.5 |
| BR8.12 | 確定の取り消しでまた変更できる。前に確認を出す | 制約 | FR6.5、AC6.1.7 |
| BR8.13 | 確定・取り消しの入口は月の見出しの近くに管理者だけ | 方針 | FR6.5、Q6 |
| BR8.14 | いつでも確定・取り消し。確定しなければ期限なく変更 | 方針 | FR6.5 |
| BR8.15 | 「未」でなくなった・確定したら申し出を取り下げる（U8 向け） | 方針 | FR7.5 |
| BR8.16 | 状態の変更も確定も二度送っても結果が同じ | 制約 | FR6.1、FR6.5 |
| BR8.17 | ログに名前や秘密を残さない | 方針 | NFR4、NFR5 |
| BR8.18 | 思いがけない失敗の表示。中途半端に残さない | 方針 | NFR2、NFR7、FR4.5 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR6.1 の状態遷移表、FR6.2〜FR6.6、FR2.2、FR3.5、FR4.5、FR7.5、NFR2、NFR4、NFR5、NFR6、NFR7、NFR11）
- `inception/user-stories/stories.md`（AC6.1.1〜AC6.1.11）
- `inception/contract-design/contract-summary.md`（C6 `requireAdmin`、C7 `getCurrentUnitPrice`、C8 `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`・`isMonthConfirmed`、C10 `INVALID_TRANSITION`・`MONTH_CONFIRMED`・`ADMIN_ONLY`）
- `construction/u5-assignment-calendar/functional-design/rules.md`、`docs/contract-changes-u5.md`（担当の書き換えの条件、月の状態の ConditionCheck、`onDutyReassigned`、`origin`、`version`）
- `construction/u6-recording/functional-design/rules.md`、`docs/contract-changes-u6.md`（記録の 3 項目の不変条件、単価の書き写しと ConditionCheck、取引の読み直し）
- 既存コード（読むだけ）: `repositories/calendarRepository.ts`（`findDuty`・`buildMonthGuard`・`buildUnitPriceGuard`・`buildRecordItems`・`CHECK_DUTY_UNCHANGED`・`writeTransaction`）、`services/calendarService.ts`（`recordDuty`・`changeDutyChild` の形）、`services/recordingService.ts`
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- [assumption] 月の確定・確定の取り消し（BR8.11、BR8.12）は、担当の書き換え（BR8.4）と違い、version を条件にしません。確定と取り消しは「目的の値にそろえる」操作で、二度押しや連打でも最後の操作の結果にそろうためです。version は確定・取り消しの回数の手がかりとして増やします
- [assumption] 月の状態への項目の追加（`confirmedAt`・`confirmedByUserId`・`version`）は、契約への追加として `docs/contract-changes-u7.md` に残します。U5・U6 は `confirmed` だけを読むので、追加は壊す変更になりません
- [assumption] 「済にする」の確認に出す単価（BR8.3 の `{単価} 円で数えます`）は、確認を出す時点の `getCurrentUnitPrice` を画面が読んで出します。実際に数えるのは書き込み時の単価（BR8.6）で、確認から書き込みまでの間に単価が変わるとずれますが、その場合は書き込み時の新しい単価で数え、画面はカレンダーを読み直して正しい値を出します（家族 1 人の管理者が続けて操作することはめったにないため受け入れます）
- [assumption] U7 の状態の変更で「未」でなくなったときの申し出の取り下げ（BR8.15）は、U5 の `onDutyReassigned` と同じ仕組みに `kind: 'status-changed'` と `'month-confirmed'` を足して U8 につなぎます。U8 までは登録がなく、何もしません
