# 業務の決まり（Rules）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U4 の決まり（BR1.x〜BR5.x）はそのまま使い、ここでは U5 で足す決まりを BR6.x として書きます。日付と「今日」は日本時間です（NFR11）。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR6.1
    statement: 割り当ての保存と、日ごとの担当の子供の変更は、管理者だけができる
    category: authorization
    applies_to: PUT /months/{month}/assignment、PATCH /duties/{dutyId}、割り当ての画面
    trigger: 要求が届いたとき、画面を出すとき
    logic: C6 の requireAdmin で確かめる。IF 子供 THEN 403 ADMIN_ONLY で何も変えない。画面は子供に割り当ての画面と「担当を変える」を出さない
    violation: 403 ADMIN_ONLY
    source: FR3.1、FR3.2、AC3.1.8、NFR4
  - id: BR6.2
    statement: 割り当てを保存できるのは、今月と来月だけ
    category: constraint
    applies_to: PUT /months/{month}/assignment
    trigger: 保存の要求が届いたとき
    logic: >-
      IF その月が確定している THEN 409 MONTH_CONFIRMED（「この月は確定済みです」。AC3.1.7）。
      ELSE IF その月が今月でも来月でもない THEN 422 MONTH_NOT_EDITABLE（「割り当てを入力できるのは今月と来月だけです」）[Q1]。
      画面は、今月と来月にだけ割り当ての画面への入口を出す
    violation: 409 MONTH_CONFIRMED、422 MONTH_NOT_EDITABLE
    source: FR3.5、Q1
  - id: BR6.3
    statement: 割り当ての行は、その家族の「使う」の種類と、その家族の子供と、1〜7 個の曜日でできている
    category: validation
    applies_to: AssignmentRule
    trigger: 保存のとき
    logic: >-
      種類は C7 で、その家族の種類で「使う」であること（なければ 404 NOT_FOUND、「使わない」なら 422 CHORE_TYPE_INACTIVE）。
      子供は C6 isChildOfFamily で、その家族の子供であること（違えば 404 NOT_FOUND）。
      曜日は 0〜6 の整数で 1 個以上。同じ曜日が 2 回あれば 1 回にまとめる。
      同じ種類と子供の行が 2 つあれば、曜日を合わせて 1 行にまとめる。行が 0 行の割り当ても保存できる（その月の明日以降の「未」の担当がなくなる）
    violation: 422 INVALID_ASSIGNMENT（形の誤り）、422 CHORE_TYPE_INACTIVE、404 NOT_FOUND
    source: FR3.1、FR2.3
  - id: BR6.4
    statement: 同じ日の同じお手伝いに 2 人入る割り当ては保存できず、重なりをすべて出す
    category: constraint
    applies_to: Assignment
    trigger: 保存のとき
    logic: >-
      その月のすべての日（1 日から月末まで。作る範囲かどうかにかかわらない）で、同じ日付・同じ種類に 2 人以上の子供が入る組をすべて探す（レビュー R-01）。
      IF 1 つでもある THEN 保存せず、422 ASSIGNMENT_OVERLAP と、重なりの一覧（日付・曜日・種類）を返す。
      画面は「1月4日(月) の皿洗いに担当が 2 人います」のように、重なりをすべて並べる（AC3.1.6）。
      重なりの確かめは、作る範囲に入らない日（過ぎた日など）も含めて、その月のすべての日で行う（入力の誤りを先に知らせるため）
    violation: 422 ASSIGNMENT_OVERLAP
    source: FR3.4、AC3.1.6
  - id: BR6.5
    statement: その月の割り当てを初めて保存すると、今日から月末までの担当を作る
    category: policy
    applies_to: Duty
    trigger: その月の割り当て（Assignment の記録）がまだ保存されていないときの保存（担当があるかどうかでは決めない。行が 0 行の割り当ても「保存した」に数える。レビュー R-01）
    logic: >-
      今月なら今日から月末まで、来月なら 1 日から月末までの、それぞれの日について、その曜日にあたる行ごとに「未」の担当（origin は rule）を作る。
      過ぎた日には作らない [Q2]。
      その範囲に同じ日付・種類の担当がすでにある（前の保存が途中で失敗して担当だけができた）ときは、新しく作らず、BR6.6 と同じく比べて直す（「未」なら子供を合わせ、「済」「×」はそのまま）
    violation: なし
    source: FR3.1、AC3.1.1、Q2
  - id: BR6.6
    statement: 保存し直すと、明日以降の「未」の担当だけを作り直す
    category: policy
    applies_to: Duty
    trigger: その月の割り当て（Assignment の記録）がすでに保存されているときの保存（レビュー R-01）
    logic: >-
      明日（来月なら 1 日）から月末までの日について、新しい割り当てで作るべき担当と、今の担当を、日付と種類の組ごとに比べる。
      今の担当が「未」で、子供が変わるなら、同じ担当（dutyId はそのまま）の子供を変え、origin を rule にする（日ごとに変えた担当や、代わりに引き受けた担当も上書きする）。
      今の担当が「未」で、子供が同じなら、何も変えない（origin もそのまま。次の保存し直しでも、日ごとの変更や引き受けとして確かめの対象に残る。レビュー R-07）。
      今の担当が「未」で、作るべき担当がなければ、その担当を消す。
      今の担当がなく、作るべき担当があれば、新しい担当（新しい dutyId）を作る。
      今の担当が「済」か「×」なら、そのまま残し、その日のその種類には新しい担当を作らない。
      今日と過ぎた日の担当は変えない（AC3.1.4）。
      子供を変える・消すときは、担当の状態が「未」で、読んだときから変わっていない（version が同じ）ことを書き込みの条件にする。
      記録（U6）や引き受け（U8）が先に入っていたら、その担当は変えず、保存全体をやり直す（レビュー R-02）。
      担当の子供が変わる・担当が消えるときは、その担当に出ている「代わりにやる」の申し出を取り下げる（FR7.5。申し出は U8 が作るので、U5 は C8 の中に「担当が変わった」ことを伝える仕組みを用意し、U8 がそこで申し出を取り下げる。U8 まではなにもしない。レビュー R-03）
    violation: なし
    source: FR3.3、AC3.1.4
  - id: BR6.7
    statement: 保存し直しで上書きされる「日ごとに変えた担当」と「代わりに引き受けた担当」があれば、保存の前に変化の一覧で確かめる
    category: policy
    applies_to: PUT /months/{month}/assignment
    trigger: BR6.6 で、origin が manual か swap の「未」の担当の子供が変わる、またはなくなるとき
    logic: >-
      IF そのような担当があり、要求に、いまの変化の一覧と同じ確かめの印（confirmedChangesHash）がない THEN 保存せず、
      409 OVERWRITE_CONFIRMATION_REQUIRED と変化の一覧（日付・種類・今の子供・作り直したあとの子供か「なし」）と、
      その一覧から作った確かめの印（changesHash。一覧と、それぞれの担当の version から作る）を返す。
      画面は「1月22日 皿洗い: 太郎 → 花子」のように並べ、「この内容で保存する」を押すと、受け取った changesHash を confirmedChangesHash として送り直す（AC3.1.5）。
      確かめのあとに担当が変わっていたら（ほかの操作が先に入った）、印が合わないので、もう一度新しい一覧を返す。
      契約の confirmOverwrite（真偽値）は、確かめの印に置き換える（レビュー R-02）
    violation: 409 OVERWRITE_CONFIRMATION_REQUIRED
    source: FR3.3、AC3.1.5
  - id: BR6.8
    statement: 割り当ての保存は、使う種類がすべて「使う」のときだけ成功する
    category: constraint
    applies_to: Assignment、ChoreType
    trigger: 保存の書き込みのとき
    logic: >-
      担当の書き込みのまとまりごとに、使う種類ごとに「使う」であることを条件として確かめる。
      IF 書き込みまでの間に種類が「使わない」になった、または消えた（U4 の消す操作は先に「使わない」にする）THEN 422 CHORE_TYPE_INACTIVE（U4 からの引き継ぎ）。
      確かめの前の段階（BR6.3）で種類がないときだけ 404 NOT_FOUND にする（レビュー R-05）。
      1 回の保存で担当は最大で約 124 件（4 種類 × 31 日）変わるので、書き込みは 1 回の操作に収まらない。
      担当の書き込みをまとまりに分けて先に行い、最後に割り当て（Assignment）の記録を書く。
      途中で失敗したら 500 を返し、管理者はもう一度保存する。保存は「今の担当と作るべき担当を比べて直す」作りなので、もう一度保存すれば同じ結果に収まる（BR6.18。レビュー R-03）
    violation: 422 CHORE_TYPE_INACTIVE
    source: FR2.3、FR2.4、U4 の BR5.9
  - id: BR6.9
    statement: 日ごとの担当の子供は、「未」で、確定していない月の担当だけ変えられる
    category: constraint
    applies_to: PATCH /duties/{dutyId}
    trigger: 管理者が日ごとの担当の子供を変えたとき
    logic: >-
      IF 担当がない、またはほかの家族の担当 THEN 404 NOT_FOUND（U1 の BR2.5）。
      IF 月が確定している THEN 409 MONTH_CONFIRMED（AC3.1.7）。
      IF 状態が「未」でない THEN 409 DUTY_NOT_TODO（「記録を取り消してから変更してください」。AC3.1.3）。
      IF 新しい子供がその家族の子供でない THEN 404 NOT_FOUND。
      ELSE 子供を変え、origin を manual にする（AC3.1.2）。同じ子供に変えたときは何も変えずに同じ結果を返す。
      過ぎた日の「未」の担当も、確定していなければ変えられる（月末の見直しのため）
    violation: 404、409 MONTH_CONFIRMED、409 DUTY_NOT_TODO
    source: FR3.2、FR3.5、AC3.1.2、AC3.1.3、AC3.1.7
  - id: BR6.10
    statement: 種類が割り当てに使われたことがあるかを答える
    category: policy
    applies_to: C8 isChoreTypeAssigned
    trigger: U4 の種類を消す操作のとき
    logic: >-
      その家族のどの月の割り当ての行か、どの担当（状態を問わない）にその種類があれば true。
      直前に保存した割り当ても見落とさないよう、遅れて反映される読み取りは使わない（U4 からの引き継ぎ）
    violation: なし
    source: FR2.4、U4 の BR5.9
  - id: BR6.11
    statement: カレンダーは日ごとの縦の一覧で、日ごとにお手伝い・担当の子供・状態を文字で出す
    category: policy
    applies_to: カレンダーの画面
    trigger: カレンダーを開いたとき
    logic: >-
      その月の 1 日から月末までを上から並べ、それぞれの日に「皿洗い=太郎(済)」のように担当を全部出す。状態は「済」「未」「×」の文字で出す（色だけに頼らない）。
      今月を開いたときは、今日の日の位置を最初に見せる [Q3]。担当のない日は「担当なし」と出す。
      確定した月は、月の名前の横に「確定済み」と出す（AC4.1.1）。
      アプリを開くと、最初に今月を出す（FR4.1）
    violation: なし
    source: FR4.1、AC4.1.1、NFR9、Q3
  - id: BR6.12
    statement: 前の月・次の月へのボタンで、どの月でも見られる
    category: policy
    applies_to: カレンダーの画面
    trigger: 「前の月」「次の月」を押したとき
    logic: 月を 1 つ前・後にして、その月のカレンダーを読む [Q4]。割り当ても担当もない月は BR6.14 の表示になる
    violation: なし
    source: FR4.1、Q4
  - id: BR6.13
    statement: 日付を選ぶと、その日の担当ごとに、状態・記録した時刻・記録した人を出す
    category: policy
    applies_to: 日の詳細の画面
    trigger: カレンダーで日付を押したとき
    logic: >-
      担当ごとに「皿洗い　太郎　済 16:42 太郎が記録」のように出す（時刻は日本時間の時と分）。
      記録した人が管理者なら「お母さんが記録」のように、その人の表示名で出す（U7）。「未」は「未」だけを出す（AC4.1.2）。
      管理者には、「未」の担当に「担当を変える」を出す（BR6.9）
    violation: なし
    source: FR4.2、AC4.1.2
  - id: BR6.14
    statement: 割り当てがない月は、その旨を出し、管理者には割り当ての画面への入口を出す
    category: policy
    applies_to: カレンダーの画面
    trigger: 割り当ての記録がない月（hasAssignment が false）を開いたとき（行が 0 行の割り当てが保存されている月は、日ごとに「担当なし」を出す）
    logic: >-
      「この月の割り当てはまだありません」と出す。管理者で、その月が今月か来月なら「割り当てを入力する」ボタンも出す（BR6.2）。
      子供にはボタンを出さない（AC4.1.4）
    violation: なし
    source: FR4.4、AC4.1.4
  - id: BR6.15
    statement: 家族のメンバー全員が、全員の担当を見られる
    category: authorization
    applies_to: GET /months/{month}/calendar、GET /months/{month}/assignment
    trigger: カレンダーや割り当てを開いたとき
    logic: C6 の getMembership で家族を決め、その家族の担当と割り当てだけを返す。メンバーでなければ 403 NOT_FAMILY_MEMBER
    violation: 403 NOT_FAMILY_MEMBER
    source: FR4.3、AC4.1.3、NFR4
  - id: BR6.16
    statement: 表示に失敗したら、もう一度読めるようにする
    category: policy
    applies_to: カレンダー、日の詳細、割り当ての画面
    trigger: 読み込みに失敗したとき
    logic: 「表示できませんでした。もう一度お試しください」と「読み込み直す」を出す。押すと読み直す（AC4.1.5）
    violation: なし
    source: FR4.5、AC4.1.5
  - id: BR6.17
    statement: 割り当ての画面で「先月と同じにする」を押すと、先月の割り当てを入力欄に入れる
    category: policy
    applies_to: 割り当ての画面
    trigger: 管理者が「先月と同じにする」を押したとき
    logic: >-
      先月の割り当ての行（種類・子供・曜日）を入力欄に入れる。「使わない」の種類と、消えた種類の行は入れず、
      入れなかった行があれば「使わないお手伝いは入れませんでした」と出す。保存はしない（直してから「保存」を押す）。
      先月の割り当てがなければ「先月の割り当てはありません」と出す [Q5]
    violation: なし
    source: Q5
  - id: BR6.18
    statement: 割り当ての保存の送り直しは、同じ結果になる
    category: constraint
    applies_to: PUT /months/{month}/assignment
    trigger: 同じ内容の保存が 2 回届いたとき
    logic: >-
      保存は割り当て全体の置き換えなので、同じ内容で 2 回送っても、2 回目は作り直す担当がなく同じ結果になる（Idempotency-Key は使わない）。
      ただし、1 回目と 2 回目の間に日付が変わると、作り直す範囲（明日以降）が変わる
    violation: なし
    source: NFR4、U1 の BR2.8
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR6.1 | 保存と日ごとの変更は管理者だけ | 権限 | FR3.1、FR3.2、AC3.1.8 |
| BR6.2 | 保存できるのは今月と来月だけ。確定済みは断る | 制約 | FR3.5、Q1 |
| BR6.3 | 行は家族の「使う」種類・家族の子供・1〜7 個の曜日 | 入力の確かめ | FR3.1、FR2.3 |
| BR6.4 | 重なりは保存せず、すべて出す | 制約 | FR3.4、AC3.1.6 |
| BR6.5 | 初めての保存は今日から月末まで作る | 方針 | FR3.1、Q2 |
| BR6.6 | 保存し直しは明日以降の「未」だけ作り直す | 方針 | FR3.3、AC3.1.4 |
| BR6.7 | 日ごとの変更・引き受けの上書きは、保存の前に確かめる | 方針 | FR3.3、AC3.1.5 |
| BR6.8 | 使う種類がすべて「使う」のときだけ保存できる | 制約 | FR2.3、U4 |
| BR6.9 | 日ごとの変更は「未」で確定していない月だけ | 制約 | FR3.2、FR3.5 |
| BR6.10 | 種類が使われたことがあるかを答える | 方針 | FR2.4、U4 |
| BR6.11 | カレンダーは日ごとの縦の一覧。状態は文字で | 方針 | FR4.1、NFR9、Q3 |
| BR6.12 | 前後の月のボタンでどの月でも見られる | 方針 | FR4.1、Q4 |
| BR6.13 | 日の詳細に状態・時刻・記録した人 | 方針 | FR4.2 |
| BR6.14 | 割り当てがない月の表示と、管理者の入口 | 方針 | FR4.4 |
| BR6.15 | メンバー全員が全員の担当を見られる | 権限 | FR4.3 |
| BR6.16 | 表示の失敗と読み込み直し | 方針 | FR4.5 |
| BR6.17 | 「先月と同じにする」 | 方針 | Q5 |
| BR6.18 | 保存の送り直しは同じ結果 | 制約 | NFR4 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR3.1〜FR3.5、FR4.1〜FR4.5、NFR4、NFR9、NFR11）
- `inception/user-stories/stories.md`（AC3.1.1〜AC3.1.8、AC4.1.1〜AC4.1.7）
- `inception/contract-design/contract-summary.md`（C1 の割り当てとカレンダーと担当の操作、C6、C7、C8、C10）
- `construction/u4-chore-types/functional-design/rules.md`（BR5.9 の引き継ぎ）
- `functional-design-questions.md` の回答 [Q1]〜[Q5]

## Assumptions & Open Questions

- 「今日」は裏側の時刻（要求の入口で 1 回だけ取る）を日本時間にした日付です。画面の時計は使いません。カレンダーの応答に `today` を入れ、画面はそれで今日の位置と「今月」を決めます（レビュー R-04）
- 月の状態の記録（MonthState）がない月は「確定していない」として扱います（レビュー R-06）
- 担当をまとまりに分けて書いているあいだに、U7 の月の確定が先に入ることがあります（今月と来月の確定は月末のあとなので、めったに起きません）。担当のまとまりごとの書き込みと、最後の割り当ての記録の書き込みに「その月が確定していない」ことを条件として入れ、確定していたら 409 MONTH_CONFIRMED で止めます（2 回目のレビュー）
- 割り当ての保存の途中で失敗し、担当だけができて割り当ての記録がない状態になっても、次の保存は「初めての保存」として扱われ、今の担当と作るべき担当を比べて直すので、同じ結果に収まります
- [Q2] の答えで、今月の初めての保存は今日から作ります（今日を含む）。保存し直し（BR6.6）は明日からです。今日の担当は、初めての保存で作ったあとは、日ごとの変更（BR6.9）で直します
- BR6.9 で、過ぎた日の「未」の担当も確定していなければ子供を変えられるのは、月末の見直し（U7）で実際にやった子供に直せるようにするためです。割り当ての保存（BR6.2）とは範囲が違います
- 割り当ての保存は全体の置き換えなので、2 つの画面で同時に保存すると、あとから保存したほうが残ります（家族に管理者は 1 人なので受け入れます）
