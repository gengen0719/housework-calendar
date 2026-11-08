# 業務の決まり（Rules）— U2 招待

U2（`u2-invitation`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1 の決まり（BR1.1〜BR1.11、BR2.1〜BR2.8）はそのまま使い、ここでは U2 で足す決まりを BR3.x として書きます。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR3.1
    statement: 招待用のリンクを作れるのは管理者だけ
    category: authorization
    applies_to: POST /family/invitations、GET /family/invitation、家族の設定の画面のボタン
    trigger: 招待を作る・いまの招待を見る要求が届いたとき、家族の設定の画面を出すとき
    logic: >-
      裏側は C6 の requireAdmin で確かめる（BR2.4）。IF 子供 THEN 403 ADMIN_ONLY で断り、招待は作らない。
      画面は、役割が admin のときだけ「招待用のリンクを作る」「LINE で送る」を出す。子供には出さない [Q6]
    violation: 403 ADMIN_ONLY。画面の直接の操作で届いても作らない
    source: FR1.4、NFR4、AC1.1.13
  - id: BR3.2
    statement: 招待は作ってから 24 時間だけ使える
    category: constraint
    applies_to: Invitation
    trigger: 招待を作るとき、招待を使うとき
    logic: 作るときに expiresAt = createdAt + 24 時間 とする。IF 確かめる時刻が expiresAt と同じかそれより後 THEN 使えない（BR3.6）[Q1]
    violation: INVITATION_INVALID
    source: FR1.4、Q1
  - id: BR3.3
    statement: 1 つの招待は、期限まで何人でも使える
    category: policy
    applies_to: Invitation
    trigger: 招待で参加したとき
    logic: 参加しても招待の status は変えない。同じリンクを子供 3 人に送ってよい [Q2]
    violation: なし
    source: FR1.4、Q2
  - id: BR3.4
    statement: 新しい招待を作ると、前の招待は使えなくなる
    category: constraint
    applies_to: Invitation
    trigger: 管理者が招待を作るとき
    logic: >-
      その家族の active の招待を replaced にし、新しい招待を active で作る。2 つの書き込みは 1 つの操作（1 回のトランザクション）として行い、
      家族に active の招待が 2 つある状態を作らない [Q3]。
      家族ごとに「いまの招待の ID」を 1 つ持ち、書き込みは「読んだときの、いまの招待の ID と同じ」ときだけ成功する条件付きにする。
      IF 別の端末から同時に作られて条件に合わない THEN 読み直して 1 回だけやり直す。それでも合わなければ INTERNAL で断り、画面はもう一度押してもらう（レビュー R-04）
    violation: 起きない
    source: FR1.4、Q3
  - id: BR3.5
    statement: 招待を作る要求の送り直しは、1 回の操作として扱う
    category: constraint
    applies_to: POST /family/invitations、POST /invitations/{token}/accept
    trigger: 新しく作る・参加する要求が届いたとき
    logic: >-
      U1 の BR2.8 と同じく Idempotency-Key で扱う。IF 同じ利用者から同じ印の要求がすでに成功している THEN 何もせず前と同じ結果を返す
      （招待を作る要求の送り直しで、送ったばかりのリンクが replaced にならない）。
      記録は利用者・印・操作（createInvitation、acceptInvitation）・対象（accept では招待の印）の組で持ち、
      同じ印で操作か対象が違う要求は、前の結果を返さずに 422 IDEMPOTENCY_KEY_REUSED で断る（レビュー R-05）
    violation: 印がない要求は 400 IDEMPOTENCY_KEY_REQUIRED
    source: NFR4、BR2.8
  - id: BR3.6
    statement: 使える招待は、印が合い、最新で、期限内のものだけ
    category: validation
    applies_to: GET /invitations/{token}、POST /invitations/{token}/accept
    trigger: 招待のリンクを開いたとき、参加を押したとき
    logic: >-
      IF 印に合う招待がない、または status が replaced、または期限が過ぎている THEN INVITATION_INVALID。
      どの理由で使えないかは、画面にも応答にも分けて出さない（「この招待は使えません。管理者に新しい招待を頼んでください」だけ）
    violation: 409 INVITATION_INVALID
    source: FR1.4、AC1.1.9
  - id: BR3.7
    statement: ほかの家族に入っている人は、招待で参加できない
    category: constraint
    applies_to: GET /invitations/{token}、POST /invitations/{token}/accept
    trigger: 招待のリンクを開いたとき、参加を押したとき
    logic: >-
      招待が使える（BR3.6）ことを先に確かめる。IF 開いた人が招待とは別の家族に入っている THEN ALREADY_IN_OTHER_FAMILY で断り、家族と役割は変えない。
      IF 開いた人が招待と同じ家族にすでに入っている（管理者が自分のリンクを開いた場合も含む）THEN ALREADY_IN_FAMILY を返し、役割は変えない
    violation: 409 ALREADY_IN_OTHER_FAMILY（「すでに別の家族に入っています」）、409 ALREADY_IN_FAMILY（「すでに家族に入っています」）
    source: FR1.4、AC1.1.8
  - id: BR3.8
    statement: 招待で参加した人は、その家族の子供になる
    category: policy
    applies_to: User
    trigger: どの家族にも入っていない人が、使える招待で「参加する」を押したとき
    logic: >-
      User.familyId を招待の familyId に、role を child に、familyJoinedAt を参加した時刻にする。
      書き込みは 1 回のトランザクションで、「利用者の familyId がまだない」ことと「家族のいまの招待の ID がこの招待で、status が active で、期限内」であることの
      両方を条件にする（確かめてから書くまでの間に作り直された・期限が過ぎた場合に参加させない。レビュー R-03）。
      IF 利用者の条件に合わない THEN 読み直して BR3.7 のとおり断る。IF 招待の条件に合わない THEN INVITATION_INVALID
    violation: 起きない（条件に合わなければ BR3.7）
    source: FR1.4、AC1.1.7
  - id: BR3.9
    statement: 参加する前に、家族の名前を見せて確かめてもらう
    category: policy
    applies_to: 招待のリンクを開いたときの画面
    trigger: 友だちで、どの家族にも入っていない人が、使える招待のリンクを開いたとき
    logic: GET /invitations/{token} で家族の名前を受け取り、「（家族の名前）に参加しますか？」と「参加する」を出す。押したときだけ参加する（BR3.8）。開いただけでは参加しない [Q5]
    violation: なし
    source: FR1.4、Q5
  - id: BR3.10
    statement: 友だち登録していない人が招待のリンクを開いたら、登録の案内と、登録後にもう一度開く案内を出す
    category: policy
    applies_to: 招待のリンクを開いたときの画面
    trigger: 招待のリンクを開いて、セッションの発行が 403 NOT_FRIEND のとき（U1 の BR1.5）
    logic: >-
      U1 の友だち登録の案内に、「友だち登録したら、もう一度このリンクを開いてください」を足して出す。
      招待の中身（家族の名前）は見せない（セッションがないため問い合わせない）。友だち登録のあと自動で参加の画面には進まない [Q4]
    violation: なし
    source: FR1.2、Q4
  - id: BR3.11
    statement: 家族のメンバーの一覧は、家族のメンバーなら管理者も子供も見られる
    category: authorization
    applies_to: GET /family/members、家族の設定の画面
    trigger: 家族の設定の画面を開いたとき
    logic: >-
      C6 の getMembership で家族を決め（BR2.3）、その家族のメンバーだけを返す。
      並び順は管理者を最初にし、続けて子供を家族に入った順（familyJoinedAt。同じなら表示名の順、それも同じなら userId の順。レビュー R-06）にする。返すのは userId、表示名、役割だけ [Q6]
    violation: メンバーでなければ 403 NOT_FAMILY_MEMBER
    source: FR1.7、Q6
  - id: BR3.12
    statement: 管理者は、家族の設定の画面でいま使える招待のリンクと期限を見られ、LINE で送れる
    category: policy
    applies_to: GET /family/invitation、家族の設定の画面
    trigger: 管理者が家族の設定の画面を開いたとき、招待を作ったとき
    logic: >-
      active で期限内の招待があれば、そのリンクと「（日時）まで使えます」を出す（日時は日本時間）。なければ「招待用のリンクを作る」だけを出す。
      「LINE で送る」を押すと、LINE の送り先を選ぶ画面を開き、招待の文とリンクを送れるようにする。リンクをコピーするボタンも出す
    violation: なし
    source: FR1.4、AC1.1.6、Q6
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR3.1 | 招待用のリンクを作れるのは管理者だけ。子供には作るボタンを出さない | 権限 | FR1.4、NFR4、AC1.1.13 |
| BR3.2 | 招待は作ってから 24 時間だけ使える | 制約 | FR1.4、Q1 |
| BR3.3 | 1 つの招待は期限まで何人でも使える | 方針 | FR1.4、Q2 |
| BR3.4 | 新しい招待を作ると前の招待は使えなくなる | 制約 | FR1.4、Q3 |
| BR3.5 | 作る・参加する要求の送り直しは 1 回として扱う | 制約 | NFR4、BR2.8 |
| BR3.6 | 使える招待は、印が合い、最新で、期限内のものだけ。理由は分けて出さない | 入力の確かめ | FR1.4、AC1.1.9 |
| BR3.7 | ほかの家族に入っている人は参加できない。同じ家族の人は役割を変えない | 制約 | FR1.4、AC1.1.8 |
| BR3.8 | 参加した人はその家族の子供になる（条件付きの書き込み） | 方針 | FR1.4、AC1.1.7 |
| BR3.9 | 参加する前に家族の名前を見せて確かめてもらう | 方針 | FR1.4、Q5 |
| BR3.10 | 友だちでない人には、登録の案内と「もう一度このリンクを開いてください」 | 方針 | FR1.2、Q4 |
| BR3.11 | メンバーの一覧は家族のメンバー全員が見られる | 権限 | FR1.7、Q6 |
| BR3.12 | 管理者はいまのリンクと期限を見られ、LINE で送れる | 方針 | FR1.4、AC1.1.6、Q6 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR1.2、FR1.4、FR1.7、NFR4）
- `inception/user-stories/stories.md`（AC1.1.6〜AC1.1.9、AC1.1.13）
- `inception/contract-design/contract-summary.md`（C1、C6、C10、家族の範囲の決まり）
- `construction/u1-skeleton-family/functional-design/rules.md`（BR1.5、BR2.3、BR2.4、BR2.8）
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- BR3.6 で使えない理由を分けないのは、印を試して有無を探られないようにするためです（NFR4）
- BR3.7 で、同じ家族の人が開いたときに ALREADY_IN_FAMILY を返すのは、ここで決めた扱いです。画面は「すでに家族に入っています」と、カレンダーへ進むボタンを出します
- BR3.9 で、印を持つ友だちには家族の名前を見せます。印は推測できず 24 時間で使えなくなるため、家族の名前を見せてよいと判断しました
- [assumption] 「LINE で送る」は、LIFF の送り先を選ぶ機能（shareTargetPicker）か、LINE のシェアの URL で開きます。どちらを使うかと、LINE Developers の管理画面で有効にする設定は、NFR・インフラの段階で確かめます
- 招待の作成の回数の上限（短い時間に何度も作られたときの扱い）、token の強さの下限（128 ビット以上を目安）、`GET /invitations/{token}` と参加の失敗が続いたときの制限は、NFR の段階で決めます（レビュー R-02）
- token は、管理者に再表示する（BR3.12）ため、取り出せる形で持ちます。ハッシュだけにはしません。24 時間で使えなくなり、データは保存時に暗号化されることを理由に受け入れます（レビュー R-01）
- 受け入れるリスク: 1 つのリンクで何人でも参加できる [Q2] ため、リンクが家族以外の人に転送されると、その人も期限内なら子供として参加できます。最初の版にはメンバーを外す手段がありません。期限の 24 時間 [Q1]、作り直しで前のリンクを使えなくすること [Q3]、参加の前の確認 [Q5]、メンバーの一覧で管理者が気づけること [Q6] で小さくします。メンバーを外す機能は、必要になったら後の版で足します（レビュー R-07）
