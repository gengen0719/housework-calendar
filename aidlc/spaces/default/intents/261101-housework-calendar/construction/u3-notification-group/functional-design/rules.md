# 業務の決まり（Rules）— U3 お知らせ先

U3（`u3-notification-group`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1・U2 の決まり（BR1.x、BR2.x、BR3.x）はそのまま使い、ここでは U3 で足す決まりを BR4.x として書きます。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR4.1
    statement: 公式アカウントがグループに参加したら、お知らせ先にする手順をボタンつきで案内する
    category: policy
    applies_to: join イベントへの返事
    trigger: 公式アカウントがグループに招待されて参加したとき（source.type が group）
    logic: >-
      reply で「公式アカウントを招待してくれてありがとうございます。管理者の方が下のボタンを押すと、このグループが家族のお知らせ先になります。
      ボタンが見えなくなったら『登録』と送ってください」と、ボタン「このグループをお知らせ先にする」（postback）を送る [Q1]。
      複数人のトーク（source.type が room）では何も返事しない
    violation: 返事を送れなかったときは記録する
    source: FR1.5、Q1
  - id: BR4.2
    statement: グループで、ボタンを押すか「登録」と送ると、お知らせ先の登録の操作として扱う
    category: policy
    applies_to: グループの postback と message イベント
    trigger: グループでボタンが押されたとき、グループで文字が送られたとき
    logic: >-
      IF postback の data が action=group.register THEN 登録の操作。
      IF message の文字が、前後の空白を除いて「登録」とちょうど同じ THEN 登録の操作。
      それ以外の文字は、アプリの操作でなければ何もしない（家族の会話に返事しない）[Q1]
    violation: なし
    source: FR1.5、Q1
  - id: BR4.3
    statement: お知らせ先を登録できるのは、そのグループにいる家族の管理者だけ
    category: authorization
    applies_to: 登録の操作
    trigger: BR4.2 の登録の操作が届いたとき
    logic: >-
      source.userId から利用者を探し（C6 findUserByLineId）、友だちで（friendStatus が friend）、家族に入っていて、役割が admin のときだけ登録する。
      IF 子供 THEN 登録せず「お知らせ先を登録できるのは管理者だけです」と返事する（AC1.2.3）
    violation: 登録しない。BR4.4 の返事
    source: FR1.5、AC1.2.3
  - id: BR4.4
    statement: 家族に入っていない人・友だちでない人・分からない人の登録の操作は、子供と同じ文言で断る
    category: authorization
    applies_to: 登録の操作
    trigger: BR4.3 で、利用者の記録がない、ブロック中、家族に入っていない、または source.userId が届かないとき
    logic: 登録せず「お知らせ先を登録できるのは管理者だけです」と返事する [Q5]
    violation: 登録しない
    source: FR1.5、Q5
  - id: BR4.5
    statement: 1 つのグループは 1 つの家族だけのお知らせ先になる
    category: constraint
    applies_to: NotificationGroup
    trigger: 管理者が登録の操作をしたとき
    logic: >-
      IF そのグループがすでに別の家族のお知らせ先 THEN 登録せず「このグループはほかの家族のお知らせ先になっています」と返事する [Q4]。
      IF そのグループがすでに同じ家族のお知らせ先 THEN 何も変えず、BR4.7 と同じ返事をする（何度押しても同じ結果）
    violation: 登録しない
    source: FR1.5、Q4
  - id: BR4.6
    statement: 別のグループを登録すると、お知らせ先は新しいグループに置き換わる
    category: constraint
    applies_to: NotificationGroup、Family
    trigger: すでにお知らせ先がある家族の管理者が、別のグループで登録したとき
    logic: >-
      前のグループの記録を消し、新しいグループの記録を作り、家族の notificationGroupId を新しいグループにする。
      3 つの書き込みは 1 つの操作（1 回のトランザクション）として行い、次の条件をすべて満たすときだけ成功させる（レビュー R-03）:
      新しいグループの記録は「まだない、またはこの家族のもの」、家族の notificationGroupId は「読んだときの値と同じ（なければ属性がない）」、
      前のグループの記録は「この家族のもの」。
      1 つのグループは 1 つの記録（グループ ID がキー）で、1 つの家族は 1 つの notificationGroupId（家族の記録の項目）なので、
      どちらの一意もこのトランザクションの条件で守られる。家族→グループの向きは家族の notificationGroupId、グループ→家族の向きは
      お知らせ先のグループの記録が持ち、いつも同じトランザクションで一緒に変える。
      前のグループには何も送らない（push は使わない。費用 0 円）
    violation: 条件に合わなければ、読み直して 1 回だけやり直す。それでも合わなければ「表示できませんでした。もう一度お試しください」と返事する
    source: FR1.5、AC1.2.2
  - id: BR4.7
    statement: 登録できたら、家族の名前と届くお知らせを返事する
    category: policy
    applies_to: 登録の返事
    trigger: BR4.5、BR4.6 の登録ができたとき
    logic: reply で「このグループを（家族の名前）のお知らせ先にしました。毎日 16 時のリマインドと、月末のまとめがここに届きます」と返す [Q2]
    violation: 返事を送れなかったときは記録する（登録は取り消さない）
    source: FR1.5、Q2
  - id: BR4.8
    statement: 登録のときに、グループの名前を LINE から受け取って残す
    category: policy
    applies_to: NotificationGroup.groupName
    trigger: 登録するとき
    logic: >-
      LINE からグループの名前を受け取り、groupName に入れる。受け取りは 2 秒で打ち切り、受け取れなかったとき（時間切れ、失敗）は
      空のまま登録する（登録は止めない。reply トークンの期限と NFR7 の 3 秒に収めるため。レビュー R-07）[Q6]
    violation: なし
    source: Q6
  - id: BR4.9
    statement: お知らせ先のグループから公式アカウントが外されたら、お知らせ先の登録を外す
    category: policy
    applies_to: NotificationGroup、Family
    trigger: leave イベント（公式アカウントがグループから退出させられた）が届いたとき
    logic: >-
      IF そのグループがある家族のお知らせ先 THEN その記録を消し、家族の notificationGroupId を空にする（1 回のトランザクション。
      条件は「グループの記録がその家族のもの」と「家族の notificationGroupId がこのグループ」。登録し直しと重なって条件に合わなければ、
      読み直して、まだお知らせ先なら 1 回だけやり直す。お知らせ先でなくなっていれば何もしない）[Q3]。
      IF お知らせ先でない THEN 何もしない。返事はしない（もうグループにいないため）
    violation: なし
    source: FR1.5、Q3
  - id: BR4.10
    statement: 登録されていないグループでのアプリの操作は、決まった文言で断る
    category: authorization
    applies_to: グループでのアプリの操作（登録の操作を除く。U8 の「代わって」など）
    trigger: グループでアプリの操作が届いたとき
    logic: >-
      操作の前に C6 findFamilyByGroup でそのグループの家族を決める。IF 登録されていない THEN 何もせず
      「このグループは家族のお知らせ先として登録されていません」と返事する（AC1.2.5）。
      登録されていれば、操作した人（source.userId）が友だちで、そのグループの家族のメンバーであることを C6 getMembership で確かめる。
      IF 記録がない・ブロック中・別の家族・家族に入っていない・source.userId がない THEN 何もせず
      「このアプリは家族のメンバーだけが使えます」と返事し、そのグループの家族の情報は返さない（レビュー R-02）。
      確かめが通ったときだけ、ctx を { familyId: グループの家族, userId, role } にして操作を呼ぶ。
      U3 ではこの確かめの仕組み（グループの操作の入口）を作り、U8 が操作に使う
    violation: 操作しない
    source: FR1.5、AC1.2.5
  - id: BR4.13
    statement: グループ以外で登録の操作が届いたときの扱い
    category: policy
    applies_to: 1 対 1 のトーク、複数人のトーク（room）の message と postback
    trigger: source.type が user または room で、BR4.2 の登録の操作にあたるものが届いたとき
    logic: >-
      IF 1 対 1 のトーク（source.type が user）THEN 登録せず「お知らせ先の登録は、家族のグループ LINE の中で行ってください」と返事する。
      IF 複数人のトーク（room）THEN 登録せず、何も返事しない（BR4.1 で案内も送っていない）（レビュー R-05）
    violation: 登録しない
    source: FR1.5
  - id: BR4.11
    statement: お知らせ先がないとき、管理者が画面を開くと、登録されていないことと登録の手順を出す
    category: policy
    applies_to: カレンダーの枠の画面
    trigger: 管理者がカレンダーの枠の画面を開いたとき
    logic: >-
      IF 家族にお知らせ先がない THEN 画面の上に「お知らせ先のグループが登録されていません」と、
      手順「公式アカウントを家族のグループ LINE に招待し、届いたボタンを押してください」を出す [Q6]。子供には出さない
    violation: なし
    source: FR1.5、AC1.2.4
  - id: BR4.12
    statement: 家族の設定の画面に、いまのお知らせ先のグループの名前を出す
    category: policy
    applies_to: 家族の設定の画面
    trigger: 家族のメンバーが家族の設定の画面を開いたとき
    logic: >-
      お知らせ先があれば「お知らせ先: （グループの名前）」を出す（名前が空なら「お知らせ先: 登録済み」）。
      なければ「お知らせ先: 登録されていません」を出す。管理者も子供も見られる（家族のメンバーだけ。U1 の BR2.3）[Q6]
    violation: メンバーでなければ 403 NOT_FAMILY_MEMBER
    source: Q6
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR4.1 | グループに参加したら、ボタンつきで登録の手順を案内 | 方針 | FR1.5、Q1 |
| BR4.2 | ボタンか「登録」で登録の操作。ほかの会話には返事しない | 方針 | FR1.5、Q1 |
| BR4.3 | 登録できるのは管理者だけ。子供は断る | 権限 | FR1.5、AC1.2.3 |
| BR4.4 | 家族でない人・友だちでない人・分からない人も同じ文言で断る | 権限 | FR1.5、Q5 |
| BR4.5 | 1 グループは 1 家族だけ。同じ家族の登録し直しは同じ結果 | 制約 | FR1.5、Q4 |
| BR4.6 | 別のグループを登録すると置き換わる（1 つの操作） | 制約 | FR1.5、AC1.2.2 |
| BR4.7 | 登録できたら家族の名前と届くお知らせを返事 | 方針 | FR1.5、Q2 |
| BR4.8 | 登録のときにグループの名前を残す | 方針 | Q6 |
| BR4.9 | 公式アカウントが外されたら登録を外す | 方針 | FR1.5、Q3 |
| BR4.10 | 登録されていないグループの操作は断る。登録済みでも、そのグループの家族のメンバーでなければ断る | 権限 | FR1.5、AC1.2.5、NFR4 |
| BR4.13 | 1 対 1 のトークで「登録」と送られたら、グループの中で行うよう案内する。room では何もしない | 方針 | FR1.5 |
| BR4.11 | お知らせ先がないとき、管理者の画面に表示と手順 | 方針 | FR1.5、AC1.2.4 |
| BR4.12 | 家族の設定にグループの名前を出す | 方針 | Q6 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR1.5）
- `inception/user-stories/stories.md`（AC1.2.1〜AC1.2.5）
- `inception/contract-design/contract-summary.md`（C3、C4、C6、C10）
- `construction/u1-skeleton-family/functional-design/rules.md`（BR1.5、BR2.3、BR2.6、BR2.7）
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- BR4.4 で、家族でない人にも「管理者だけです」と返すのは [Q5] の答えです。断るときは、家族の情報（家族の名前など）を返事に入れません。ブロック中の管理者にも同じ文言を返します。分かりにくさはありますが、[Q5] の答えに合わせ、README の「困ったとき」に「ブロックを解除してからもう一度」と書きます（レビュー R-07）
- BR4.7 の登録できたときの返事には家族の名前が入り、グループにいる家族以外の人にも見えます。登録するグループは管理者が選んだ家族のグループで、家族の名前は 1〜20 文字の呼び名のため、受け入れます（レビュー R-06）
- 理由の印は、子供の登録を断るときも U1 の `ADMIN_ONLY` を使います。LINE のトークでの返事の文言だけを、AC1.2.3 の「お知らせ先を登録できるのは管理者だけです」（文言のキー `NOTIFICATION_GROUP_ADMIN_ONLY`）にします。新しい理由の印は足しません（レビュー R-04）
- BR4.9（外されたら登録を外す）は、この段階の [Q3] で決めました。要件（FR1.5）にはまだ書かれていないため、要件への反映を待つ一覧（`docs/contract-changes-u3.md`）に載せます（レビュー R-08）
- BR4.5 の 1 グループ 1 家族では、別の家族の管理者がいるグループで先に登録した家族が使い続けます。移したいときは、先の家族の管理者が別のグループを登録する（BR4.6 で外れる）か、公式アカウントを外す（BR4.9）必要があります
- [assumption] 公式アカウントが外されると LINE から leave イベントが届きます。グループがなくなったときも届くかは、B3 でステージングで確かめます。届かない場合でも、U10 でお知らせが送れなかったときに気づけます
