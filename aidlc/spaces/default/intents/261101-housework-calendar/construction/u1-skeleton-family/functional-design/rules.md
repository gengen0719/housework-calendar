# 業務の決まり（Rules）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR1.1
    statement: 友だち登録の記録は、LINE のユーザー ID ごとに 1 人だけにする
    category: constraint
    applies_to: User
    trigger: 友だち登録（follow）のイベントが届いたとき
    logic: IF 同じ lineUserId の利用者がいない THEN 新しく記録する。IF すでにいる THEN 新しく作らず、friendStatus を friend にする
    violation: 起きない（何度届いても結果は同じ）
    source: FR1.1

  - id: BR1.2
    statement: 友だち登録したら、公式アカウントがあいさつ・アプリを開くボタン・使い始め方の短い説明を返事する
    category: policy
    applies_to: 友だち登録の返事
    trigger: BR1.1 の処理が終わったとき
    logic: IF 友だち登録のイベントを処理した THEN reply で「あいさつ」「アプリを開くボタン（LINE の中で画面が開く）」「家族を作る（お母さん）／招待を待つ（子供）の説明」を返す [Q1]
    violation: 返事を送れなかったときは記録する（作り手への知らせは U10 で入れる）
    source: FR1.1

  - id: BR1.3
    statement: ブロックされたら「ブロック中」と記録し、利用者の記録・家族・役割は消さない
    category: policy
    applies_to: User
    trigger: ブロック（unfollow）のイベントが届いたとき
    logic: IF その利用者の記録がある THEN friendStatus を blocked にする。familyId と role は変えない [Q6]
    violation: 記録がない利用者のブロックは何もしない
    source: FR1.1

  - id: BR1.4
    statement: 表示名は友だち登録のときに受け取った名前のまま変えない
    category: policy
    applies_to: User.displayName
    trigger: 友だち登録・登録し直し・ログインのとき
    logic: IF 最初の友だち登録 THEN LINE から受け取った表示名を記録する。ELSE 表示名は変えない [Q4]
    violation: なし
    source: FR1.1

  - id: BR1.5
    statement: 友だちでない人（記録がない人、ブロック中の人）にはセッションを出さず、友だち登録の案内だけを出す
    category: authorization
    applies_to: セッションの発行（C2）と画面用 API
    trigger: セッションの発行を求められたとき、画面用 API への要求
    logic: >-
      IF セッションの発行で、BR1.11 で確かめても友だちでない THEN セッションを出さず、403 NOT_FRIEND を返す。
      IF セッションを持つ人が、そのあとブロックした（friendStatus が blocked）THEN 画面用 API はすべて 403 NOT_FRIEND で断る [Q2、Q6]
    violation: 画面は「家族を作る」「招待を待つ」を出さず、友だち登録の案内（公式アカウントを友だちに追加するボタン）だけを出す
    source: FR1.2

  - id: BR1.6
    statement: 友だちで、どの家族にも入っていない人には「家族を作る」と「招待を待つ」を出す
    category: policy
    applies_to: アプリの画面
    trigger: 画面を開いたとき
    logic: IF friendStatus が friend AND familyId がない THEN 「家族を作る」と「招待を待つ」を出す
    violation: なし
    source: FR1.2

  - id: BR1.7
    statement: 家族を作った人は、その家族の管理者になる
    category: policy
    applies_to: Family、User
    trigger: 「家族を作る」で名前を入れて保存したとき
    logic: IF BR1.8 と BR1.9 を満たす THEN 新しい家族を作り、adminUserId を作った人にし、作った人の familyId をその家族、role を admin にする。家族の作成と利用者の更新は、両方できるか両方できないかのどちらか
    violation: なし
    source: FR1.3

  - id: BR1.8
    statement: すでに家族に入っている人は、2 つ目の家族を作れない
    category: constraint
    applies_to: Family
    trigger: 「家族を作る」で保存したとき（BR2.8 で同じ要求の送り直しと分かったときを除く）
    logic: IF 利用者の familyId がある THEN 家族を作らず 409 ALREADY_IN_FAMILY で断る。同じ人から同時に 2 回届いても、家族は 1 つしかできない
    violation: 「すでに家族に入っています」と表示する
    source: FR1.3

  - id: BR1.9
    statement: 家族の名前は、前後の空白を除いて 1〜20 文字で必須
    category: validation
    applies_to: Family.name
    trigger: 「家族を作る」で保存したとき
    logic: IF 前後の空白を除いた名前が 0 文字 OR 20 文字を超える THEN 保存しない [Q3]
    violation: INVALID_FAMILY_NAME で断り、「家族の名前を 1〜20 文字で入力してください」と表示する。入力した内容は残す
    source: FR1.3

  - id: BR1.11
    statement: セッションの発行のとき、記録がない人とブロック中の人だけは、LINE に友だちかどうかを問い合わせて記録を直す
    category: policy
    applies_to: User
    trigger: セッションの発行で、利用者の記録がない、または friendStatus が blocked のとき
    logic: >-
      IF LINE の Messaging API で、その LINE のユーザー ID のプロフィールを受け取れる（友だちである）THEN
      記録がなければ BR1.1 と同じく友だちとして記録し（表示名もこのとき受け取る）、ブロック中なら友だちに戻す。そのあとセッションを発行する。
      ELSE（受け取れない＝友だちでない）BR1.5 のとおり NOT_FRIEND を返す
    violation: LINE に問い合わせられなかったときは 503 INTERNAL を返し、画面は「表示できませんでした。もう一度お試しください」を出す
    source: FR1.1

  - id: BR1.10
    statement: 家族を作ったあとは中身のないカレンダーの枠を出し、「招待を待つ」を選んだあとは招待のリンクを開くよう案内する
    category: policy
    applies_to: アプリの画面
    trigger: 家族を作ったとき、「招待を待つ」を選んだとき、家族に入っている人が画面を開いたとき
    logic: IF 家族に入っている THEN 今月のカレンダーの枠（担当はまだない）を出す。IF 「招待を待つ」を選んだ THEN 「お母さんから届いた招待のリンクを開いてください」と出す [Q5]
    violation: なし
    source: FR1.2

  - id: BR2.1
    statement: セッションは、LINE の ID トークンを LINE の決まりで確かめてから発行する
    category: authorization
    applies_to: Session
    trigger: 画面がセッションの発行を求めたとき（LINE の中でもパソコンのブラウザでも同じ）
    logic: >-
      IF ID トークンがこのチャネルのもので期限内でない THEN 401 UNAUTHENTICATED で断る。
      ELSE ID トークンの LINE のユーザー ID で利用者を探し、友だちなら（記録がない人とブロック中の人は BR1.11 で確かめてから）その利用者の userId のセッションを発行する。
      友だちでなければ BR1.5 のとおりセッションを出さない
    violation: 401 で断り、画面はログインし直す
    source: FR1.6

  - id: BR2.2
    statement: 画面用 API への要求は、正しいセッションがなければすべて断る
    category: authorization
    applies_to: 画面用 API のすべての操作（セッションの発行を除く）
    trigger: 要求が届いたとき
    logic: IF セッショントークンがない OR 署名が合わない OR 期限切れ THEN UNAUTHENTICATED で断る
    violation: 401。画面は ID トークンを取り直してセッションを発行し直す
    source: NFR4

  - id: BR2.3
    statement: 家族のデータは、その家族のメンバーにしか見せず、変えさせない
    category: authorization
    applies_to: 家族のデータを扱う画面用 API のすべての操作
    trigger: 要求が届いたとき
    logic: IF 利用者がどの家族のメンバーでもない THEN NOT_FAMILY_MEMBER で断る。家族は、URL や本文ではなく、セッションの利用者から決める
    violation: 403。画面は中身を出さず「このアプリは家族のメンバーだけが使えます」と表示する
    source: FR1.7

  - id: BR2.4
    statement: 管理者の操作は、管理者にしかさせない
    category: authorization
    applies_to: 管理者の操作（U1 では仕組みだけ。各操作は、それを作る単位で使う）
    trigger: 管理者の操作の要求が届いたとき
    logic: IF 利用者の role が admin でない THEN ADMIN_ONLY で断る
    violation: 403
    source: NFR4

  - id: BR2.5
    statement: ほかの家族のデータを指定した要求は、見つからないとして断る
    category: authorization
    applies_to: ID を指定する画面用 API の操作
    trigger: 要求が届いたとき
    logic: IF 指定された担当・申し出・種類・加算減額・子供が、セッションの利用者の家族のものでない THEN NOT_FOUND で断る（ほかの家族のデータがあることも知らせない）
    violation: 404
    source: NFR4

  - id: BR2.6
    statement: LINE から届いた Webhook は、署名を確かめてから処理する
    category: authorization
    applies_to: LINE 用の受け口
    trigger: Webhook が届いたとき
    logic: IF 署名がチャネルシークレットで作ったものと合わない THEN 何も処理せず断る
    violation: 401。何も記録しない
    source: NFR4

  - id: BR2.7
    statement: 同じ Webhook のイベントは二度処理しない
    category: constraint
    applies_to: ProcessedLineEvent
    trigger: 署名を確かめたイベントを処理する前
    logic: >-
      処理の前に、その webhookEventId を「処理中」として、まだ記録がないときだけ書く（条件付きの書き込み）。
      IF すでに「処理済み」THEN 処理しない。IF 「処理中」で、書いてから決まった時間（NFR の段階で決める。Lambda の時間切れより長くする）がたっていない THEN 処理しない。
      IF 「処理中」で決まった時間がたっている（前の処理が止まった）THEN 処理し直す。
      処理が終わったら「処理済み」にする。思いがけない失敗のときは記録を消し、LINE の送り直しで処理し直せるようにする。
      LINE の送り直し（Webhook の再送）は、LINE Developers の管理画面で有効にしておく。
      それぞれの処理（BR1.1、BR1.3）は、二度動いても結果が同じになる作りにする
    violation: 処理しないで 200 を返す
    source: NFR4

  - id: BR2.8
    statement: 画面から新しく作る操作は、同じ要求の送り直しを 1 回の操作として扱う
    category: constraint
    applies_to: 新しく作る画面用 API の操作（U1 では POST /families）
    trigger: 新しく作る操作の要求が届いたとき
    logic: >-
      画面は操作ごとに新しい印（Idempotency-Key ヘッダー）を作り、送り直しのときは同じ印を送る。
      IF 同じ利用者から同じ印の要求がすでに成功している THEN 何もせず、前と同じ結果（201 と作った家族）を返す。
      IF 印が新しい THEN ふつうに処理し、結果を印と一緒に決まった時間残す（期間は NFR の段階で決める）
    violation: 印がない要求は 400 IDEMPOTENCY_KEY_REQUIRED で断る
    source: NFR4
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR1.1 | 友だち登録の記録は LINE のユーザー ID ごとに 1 人 | 制約 | FR1.1 |
| BR1.2 | 友だち登録の返事は、あいさつ・アプリを開くボタン・説明 | 方針 | FR1.1、Q1 |
| BR1.3 | ブロックは「ブロック中」と記録し、家族と役割は消さない | 方針 | FR1.1、Q6 |
| BR1.4 | 表示名は友だち登録のときのまま | 方針 | FR1.1、Q4 |
| BR1.5 | 友だちでない人には友だち登録の案内だけ | 権限 | FR1.2、Q2、Q6 |
| BR1.6 | 家族に入っていない人には「家族を作る」「招待を待つ」 | 方針 | FR1.2 |
| BR1.7 | 家族を作った人が管理者 | 方針 | FR1.3 |
| BR1.8 | 2 つ目の家族は作れない | 制約 | FR1.3 |
| BR1.9 | 家族の名前は 1〜20 文字で必須 | 入力の確かめ | FR1.3、Q3 |
| BR1.10 | 家族を作ったあとはカレンダーの枠、招待を待つあとは案内 | 方針 | FR1.2、Q5 |
| BR1.11 | 記録がない人とブロック中の人だけ、セッションの発行で LINE に友だちか問い合わせて直す | 方針 | FR1.1 |
| BR2.1 | セッションは ID トークンを確かめてから発行 | 権限 | FR1.6 |
| BR2.2 | セッションがなければ断る | 権限 | NFR4 |
| BR2.3 | 家族のデータはメンバーだけ | 権限 | FR1.7 |
| BR2.4 | 管理者の操作は管理者だけ | 権限 | NFR4 |
| BR2.5 | ほかの家族のデータの指定は見つからないとして断る | 権限 | NFR4 |
| BR2.6 | Webhook は署名を確かめてから処理 | 権限 | NFR4 |
| BR2.7 | 同じイベントは二度処理しない（処理中・処理済みを分け、止まった処理はやり直す） | 制約 | NFR4 |
| BR2.8 | 新しく作る操作は、同じ印の送り直しを 1 回として扱う | 制約 | NFR4 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR1.1〜FR1.3、FR1.6、FR1.7、NFR4）
- `inception/user-stories/stories.md`（AC1.1.1〜AC1.1.13）
- `inception/contract-design/contract-summary.md`（C1、C2、C3、C6、失敗の返し方）
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- 理由の印 `NOT_FRIEND`（BR1.5）、`INVALID_FAMILY_NAME`（BR1.9）、`IDEMPOTENCY_KEY_REQUIRED`（BR2.8）は、契約の共有パッケージ（C10）の一覧に足す新しい印です。足すのは契約の変更の決まりで自由です。契約への追加の一覧は `functional-spec.md` の「契約への追加」にあります
- BR2.7 の記録の順番は、契約の設計のレビューで残った指摘への答えです
- [assumption] LINE の Messaging API のプロフィールの取得は、公式アカウントの友だちにだけ成功する（BR1.11）。B1 でステージングで確かめる
