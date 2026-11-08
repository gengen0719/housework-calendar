# 業務の決まり（Rules）— U4 お手伝いの種類

U4（`u4-chore-types`）で守る決まりです。データの形は `entities.md`、流れの順番は `functional-spec.md` にあります。U1〜U3 の決まり（BR1.x〜BR4.x）はそのまま使い、ここでは U4 で足す決まりを BR5.x として書きます。

## 決まりの一覧（機械で読む形）

```yaml
rules:
  - id: BR5.1
    statement: お手伝いの種類の登録・変更・使わない・使うに戻す・消すは、管理者だけができる
    category: authorization
    applies_to: POST /chore-types、PUT・PATCH・DELETE /chore-types/{choreTypeId}、お手伝いの種類の画面のボタン
    trigger: 要求が届いたとき、画面を出すとき
    logic: >-
      裏側は C6 の requireAdmin で確かめる（U1 の BR2.4）。IF 子供 THEN 403 ADMIN_ONLY で断り、何も変えない。
      画面は、管理者にだけ「追加」「変更」「使わない」「使う」「消す」を出す [Q5]
    violation: 403 ADMIN_ONLY
    source: FR2.1、AC2.1.3、NFR4
  - id: BR5.2
    statement: 名前は前後の空白を除いて 1〜20 文字で必須
    category: validation
    applies_to: ChoreTypeInput.name
    trigger: 登録・変更のとき
    logic: >-
      Unicode の NFC に正規化し、前後の空白（全角を含む）を除いて数える（コードポイントで数える）。
      IF 0 文字、21 文字以上、または改行などの制御文字を含む THEN 保存せず「名前を 1〜20 文字で入力してください」と出す。入力した内容は残す
      （NFR 要件のレビュー R-03）
    violation: 422 INVALID_CHORE_TYPE_NAME
    source: FR2.1、Q1
  - id: BR5.3
    statement: 同じ家族の中で、同じ名前の種類は登録できない（「使わない」の種類も含む）
    category: constraint
    applies_to: ChoreType.name
    trigger: 登録・名前の変更のとき
    logic: >-
      IF 同じ家族に、前後の空白を除いた名前がちょうど同じ別の種類がある THEN 保存せず、
      重なる相手が「使う」なら「同じ名前の種類があります。1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように、別の名前で登録してください」、
      重なる相手が「使わない」なら「『使わない』になっている同じ名前の種類があります。『使う』に戻すか、別の名前で登録してください」と出す（レビュー R-05）。
      入力した内容は残す [Q1]。
      登録と名前の変更の両方で、家族と名前の組の一意の印を、種類の保存と同じ書き込みで取る。取れなければ 409 にする。
      これで、同時に同じ名前で登録・変更されても 1 つだけが保存される（レビュー R-03）
    violation: 409 CHORE_TYPE_NAME_TAKEN
    source: FR2.1、Q1
  - id: BR5.4
    statement: 名前の入力欄の近くに、同じお手伝いが 1 日に何回もあるときの登録のしかたを案内する
    category: policy
    applies_to: お手伝いの種類の登録・変更の画面
    trigger: 管理者が登録・変更の画面を開いたとき
    logic: 名前の欄の下に「1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように分けて登録します」と出す [Q1]
    violation: なし
    source: Q1
  - id: BR5.5
    statement: 単価は 0 円以上の整数（上限なし）
    category: validation
    applies_to: ChoreTypeInput.unitPrice
    trigger: 登録・変更のとき
    logic: >-
      IF 空欄、負の数、小数、数でない、扱える整数の範囲を超える THEN 保存せず「単価は 0 円以上の整数で入力してください」と出す。
      入力した内容は残す（AC2.1.2）[Q2]。
      裏側は JSON の数値で整数のものだけを受ける（`"100"` のような文字列は 422。`100.0` は JSON では整数と区別できないので 100 として受ける）。
      画面は入力欄の文字を、数字だけのときに整数にしてから送る（レビュー R-06）
    violation: 422 INVALID_UNIT_PRICE
    source: FR2.1、AC2.1.2、Q2
  - id: BR5.6
    statement: 説明は入れなくてもよく、入れるなら 100 文字まで
    category: validation
    applies_to: ChoreTypeInput.description
    trigger: 登録・変更のとき
    logic: >-
      NFC に正規化し、前後の空白を除いて残す。空なら説明なし。改行は許し、ほかの制御文字は断る。
      IF 101 文字以上（コードポイントで数える）THEN 保存せず「説明は 100 文字までで入力してください」と出す。入力した内容は残す [Q3]
    violation: 422 INVALID_DESCRIPTION
    source: FR2.1、Q3
  - id: BR5.7
    statement: 単価を変えても、すでに付いた記録の金額は変わらない
    category: constraint
    applies_to: ChoreType.unitPrice
    trigger: 単価を変えたとき
    logic: >-
      種類の記録には今の単価だけを持つ。記録のとき（U6、U7）にカレンダーが C7 getCurrentUnitPrice で今の単価を受け取り、記録に書き写す（ADR-003）。
      getCurrentUnitPrice は「使わない」の種類にも今の単価を返す（すでにある担当の記録や「済にする」に使うため）。
      NOT_FOUND を返すのは、種類がない（消した）か、ほかの家族の種類のときだけ（レビュー R-02）。
      U4 は単価の変更のときに、ほかのデータを書き換えない
    violation: なし
    source: FR2.2、AC2.1.4
  - id: BR5.8
    statement: 「使わない」にした種類は新しい割り当てで選べず、管理者は「使う」に戻せる
    category: policy
    applies_to: ChoreType.active
    trigger: 管理者が「使わない」「使う」を押したとき
    logic: >-
      active を false（使わない）または true（使う）にする。使わないにしても、過去の記録とお小遣いは消さない（U4 は記録に触れない）。
      C7 list は「使わない」の種類も返す（active つき）。新しい割り当てで選べないことは、U5 が active で絞って確かめる [Q4]（レビュー R-02）。
      「使わない」「使う」の切り替えは、名前や単価の変更とは別の操作（PATCH の active だけ）にし、古い画面の変更で気づかずに戻らないようにする（レビュー R-04）
    violation: なし
    source: FR2.3、AC2.1.5、Q4
  - id: BR5.9
    statement: 割り当てに一度も使われていない種類だけ、完全に消せる
    category: constraint
    applies_to: DELETE /chore-types/{choreTypeId}
    trigger: 管理者が「消す」を押したとき
    logic: >-
      「この種類を消しますか？ 消すと元に戻せません」と確かめる。消す手順は次の順にする（レビュー R-01）:
      (1) まずその種類を「使わない」（active=false）にする。これで、このあと新しい割り当てに選ばれることはなくなる。
      (2) 入口が C8 isChoreTypeAssigned で使われたかを確かめる（契約の C1）。
      (3) IF 使われたことがある THEN 消さず、「使わない」のまま残し、「割り当てに使われたことがあるので消せません。『使わない』にしました」と出す（AC2.1.6）。
      もともと「使う」だった種類でも「使わない」のまま残る（管理者が消したかった種類なので、新しい割り当てで選べなくなるのは望みに近い。戻したければ「使う」を押す）。
      (4) IF 使われていない THEN 完全に消し、一覧からなくなる（AC2.1.7）。
      U5 の割り当ての保存は、種類が「使う」であることを保存と同じ書き込みの条件にする（確かめと保存の間に隙間を作らない。U5 の機能設計に引き継ぐ）。
      U5 ができるまで、C8 isChoreTypeAssigned は「使われていない」を返す仮の窓口とし、テストでは「使われている」を返すように差し替えられる作りにする（レビュー R-07）。
      消す要求の送り直しで種類がもうないときは 404 を返し、画面は「すでに消えています」として一覧を読み直す（レビュー R-04）
    violation: 409 CHORE_TYPE_IN_USE
    source: FR2.4、AC2.1.6、AC2.1.7
  - id: BR5.10
    statement: ほかの家族の種類を指定した要求は、見つからないとして断る
    category: authorization
    applies_to: PUT・DELETE /chore-types/{choreTypeId}、C7 の窓口
    trigger: 要求が届いたとき
    logic: 種類の記録の familyId が ctx.familyId と違う、または種類がない THEN 404 NOT_FOUND（U1 の BR2.5）
    violation: 404 NOT_FOUND
    source: NFR4
  - id: BR5.11
    statement: 種類の一覧は家族のメンバー全員が見られる。並びは登録した順で、「使わない」の種類は下にまとめる
    category: policy
    applies_to: GET /chore-types、お手伝いの種類の画面
    trigger: 家族のメンバーがお手伝いの種類の画面を開いたとき
    logic: >-
      「使う」の種類を登録した順（createdAt、同じなら choreTypeId の順）に並べ、そのあとに「使わない」の種類を同じ順で並べ、「使わない」と出す。
      子供には名前・単価・説明だけを見せ、ボタンは出さない [Q5]
    violation: メンバーでなければ 403 NOT_FAMILY_MEMBER
    source: FR2.1、Q5
  - id: BR5.12
    statement: 登録の送り直しは 1 回の操作として扱う
    category: constraint
    applies_to: POST /chore-types
    trigger: 登録の要求が届いたとき
    logic: U1 の BR2.8、U2 の BR3.5 と同じく Idempotency-Key で扱う。同じ印の送り直しは前と同じ結果を返し、種類を 2 つ作らない
    violation: 印がない要求は 400 IDEMPOTENCY_KEY_REQUIRED
    source: NFR4、BR2.8
```

## まとめ

| ID | 決まり | 種類 | もと |
|----|-------|------|-----|
| BR5.1 | 登録・変更・使わない・使う・消すは管理者だけ | 権限 | FR2.1、AC2.1.3 |
| BR5.2 | 名前は 1〜20 文字で必須 | 入力の確かめ | FR2.1、Q1 |
| BR5.3 | 同じ家族で同じ名前は登録できない。「皿洗い（追加分）」のような名前を勧める | 制約 | FR2.1、Q1 |
| BR5.4 | 名前の欄の近くに、1 日に何回もあるときの登録のしかたを案内 | 方針 | Q1 |
| BR5.5 | 単価は 0 円以上の整数（上限なし） | 入力の確かめ | FR2.1、AC2.1.2、Q2 |
| BR5.6 | 説明は任意で 100 文字まで | 入力の確かめ | FR2.1、Q3 |
| BR5.7 | 単価を変えても、付いた記録の金額は変わらない | 制約 | FR2.2、AC2.1.4 |
| BR5.8 | 「使わない」は新しい割り当てで選べず、「使う」に戻せる | 方針 | FR2.3、AC2.1.5、Q4 |
| BR5.9 | 割り当てに使われていない種類だけ消せる | 制約 | FR2.4、AC2.1.6、AC2.1.7 |
| BR5.10 | ほかの家族の種類の指定は見つからないとして断る | 権限 | NFR4 |
| BR5.11 | 一覧はメンバー全員が見られる。登録順、「使わない」は下 | 方針 | FR2.1、Q5 |
| BR5.12 | 登録の送り直しは 1 回として扱う | 制約 | NFR4 |

## Sources

- `inception/requirements-analysis/requirements.md`（FR2.1〜FR2.4、NFR4）
- `inception/user-stories/stories.md`（AC2.1.1〜AC2.1.7）
- `inception/contract-design/contract-summary.md`（C1 `/chore-types`、C7、C8 `isChoreTypeAssigned`、C10）
- `inception/domain-design/components.md`（ADR-001、ADR-003）
- `construction/u1-skeleton-family/functional-design/rules.md`（BR2.4、BR2.5、BR2.8）
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- [Q1] の答えの「皿洗いは 1 日 1 回とは限らないので『皿洗い（追加分）』のように登録することを促したい」は、名前が重なったときの文言（BR5.3）と、入力欄の案内（BR5.4）の 2 か所で伝えます
- BR5.9 で消したあとに、U5 の割り当てがその種類を使おうとする（消す確かめと割り当ての保存が重なる）場合は、U5 の保存のときに種類があって「使う」であることを C7 で確かめて断ります（U5 の機能設計に引き継ぐ）
- 同じ管理者が 2 つの画面で同じ種類の名前・単価・説明を同時に変えたときは、あとから保存したほうが残ります（家族に管理者は 1 人なので受け入れます）。「使わない」「使う」は別の操作にしたので、名前の変更で気づかずに戻ることはありません（レビュー R-04）
- 単価に上限がないため、U9 の「単価 × 回数」や月の合計が扱える整数の範囲を超えるおそれがあります。超えるときの扱い（計算の前に断るなど）は U9 の機能設計で決めます（レビュー R-06）
