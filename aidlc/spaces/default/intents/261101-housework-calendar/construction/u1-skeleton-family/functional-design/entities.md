# データの形（Entities）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で扱うデータの形です。持ち主の部品は `inception/domain-design/components.md` の Entity Ownership のとおりで、利用者と家族は「家族とメンバー」が持ちます。使う技術にかかわらない、論理的な形だけを書きます。

## データの一覧（機械で読む形）

```yaml
entities:
  - name: User
    label: 利用者
    owner: 家族とメンバー
    description: 公式アカウントを友だち登録した LINE の利用者。1 人が入れる家族は 1 つだけ
    attributes:
      - name: userId
        type: string
        required: true
        unique: true
        constraints: 内部で使う利用者の ID
      - name: lineUserId
        type: string
        required: true
        unique: true
        constraints: LINE のユーザー ID。同じ値の利用者は 1 人だけ（AC1.1.2）
      - name: displayName
        type: string
        required: true
        constraints: 友だち登録のときに LINE から受け取った表示名。あとで変えない [Q4]
      - name: friendStatus
        type: enum
        required: true
        allowed: [friend, blocked]
        default: friend
        constraints: 友だち登録で friend、ブロックで blocked、登録し直しで friend [Q6]
      - name: familyId
        type: string
        required: false
        references: Family.familyId
        constraints: 入っている家族。どの家族にも入っていなければ空
      - name: role
        type: enum
        required: false
        allowed: [admin, child]
        constraints: familyId があるときだけ値を持つ。家族を作った人は admin（AC1.1.4）、招待で参加した人は child（U2）
      - name: registeredAt
        type: datetime
        required: true
        constraints: 最初に友だち登録した時刻（UTC）
      - name: friendStatusChangedAt
        type: datetime
        required: true
        constraints: friendStatus が最後に変わった時刻（UTC）
    constraints:
      - familyId と role は、両方あるか両方ないかのどちらか
      - ブロックしても記録は消さず、familyId と role も残す [Q6]
    relationships:
      - target: Family
        cardinality: many-to-one
        direction: User → Family（メンバーとして入る）

  - name: Family
    label: 家族
    owner: 家族とメンバー
    description: お手伝いとお小遣いを共有する家族。管理者は 1 人だけ
    attributes:
      - name: familyId
        type: string
        required: true
        unique: true
      - name: name
        type: string
        required: true
        min: 1
        max: 20
        constraints: 家族を作るときに入れる名前。前後の空白を除いて 1〜20 文字 [Q3]
      - name: adminUserId
        type: string
        required: true
        references: User.userId
        constraints: 家族を作った人。変わらない（管理者を 2 人以上にすることは最初の版ではしない）
      - name: createdAt
        type: datetime
        required: true
    constraints:
      - adminUserId の利用者は、この家族の role=admin のメンバーである
    relationships:
      - target: User
        cardinality: one-to-many
        direction: Family → User（メンバー）
      - target: User
        cardinality: one-to-one
        direction: Family → User（管理者）

  - name: ProcessedLineEvent
    label: 処理済みの LINE のイベント
    owner: LINEのトークの受け口
    description: 同じ Webhook のイベントを二度処理しないための記録（契約 C3）。業務のデータではなく、技術の記録
    attributes:
      - name: webhookEventId
        type: string
        required: true
        unique: true
      - name: status
        type: enum
        required: true
        allowed: [processing, done]
        constraints: 処理を始めるときに processing、終わったら done（BR2.7）
      - name: receivedAt
        type: datetime
        required: true
        constraints: processing を書いた時刻。止まった処理を見分けるのに使う
      - name: expiresAt
        type: datetime
        required: true
        constraints: これを過ぎたら消してよい。残す期間は NFR の段階で決める
    relationships: []

  - name: RequestRecord
    label: 画面からの要求の記録
    owner: 画面用 API の入口
    description: 新しく作る操作の送り直しを 1 回として扱うための記録（BR2.8）。業務のデータではなく、技術の記録
    attributes:
      - name: userId
        type: string
        required: true
        references: User.userId
      - name: idempotencyKey
        type: string
        required: true
        constraints: 画面が操作ごとに作る印。userId と組で一意
      - name: operation
        type: string
        required: true
        constraints: 例 createFamily
      - name: result
        type: object
        required: true
        constraints: 前に返した結果（状態と本文）
      - name: expiresAt
        type: datetime
        required: true
        constraints: 残す期間は NFR の段階で決める
    constraints:
      - userId と idempotencyKey の組は一意
    relationships:
      - target: User
        cardinality: many-to-one
        direction: RequestRecord → User

values:
  - name: Session
    label: セッション
    description: >-
      裏側が発行する署名付きのセッショントークンの中身（契約 C2）。保存するデータではなく、トークンそのものに入る値。
      家族と役割は入れず、要求のたびに User から確かめる
    attributes:
      - name: userId
        type: string
        required: true
        references: User.userId
      - name: expiresAt
        type: datetime
        required: true
        constraints: 期限の長さは NFR の段階で決める
```

## まとめ

- **利用者（User）:** 友だち登録した人です。LINE のユーザー ID で 1 人に決まり、ブロックして登録し直しても同じ人のままです。友だちかブロック中かを持ちます。入っている家族と役割（管理者か子供か）も、利用者のデータとして持ちます。1 人が入れる家族は 1 つだけなので、この形にしています
- **家族（Family）:** 名前（1〜20 文字）と、作った人（管理者）を持ちます
- **処理済みの LINE のイベント（ProcessedLineEvent）:** LINE から同じイベントが二度届いたときに、二度処理しないための技術の記録です。「処理中」と「処理済み」を分けて持ち、途中で止まった処理をやり直せるようにします。持ち主は LINE のトークの受け口です
- **画面からの要求の記録（RequestRecord）:** 「家族を作る」などの新しく作る操作を送り直したときに、二度作らず前と同じ結果を返すための技術の記録です。持ち主は画面用 API の入口です
- **セッション（Session）:** 保存するデータではなく、画面に渡す署名付きトークンの中身です。利用者と期限だけを入れます

## Sources

- `inception/domain-design/components.md`（家族とメンバーの部品、Entity Ownership）
- `inception/contract-design/contract-summary.md`（C2、C3、C6）
- `inception/requirements-analysis/requirements.md`（FR1.1〜FR1.3、FR1.6、FR1.7、NFR4）
- `inception/user-stories/stories.md`（AC1.1.1〜AC1.1.13）
- `functional-design-questions.md` の回答 [Q1]〜[Q6]

## Assumptions & Open Questions

- 処理済みの LINE のイベントと画面からの要求の記録は、`components.md` では LINE のトークの受け口と画面がどちらも「データを持たない」とされています。業務のデータではない技術の記録として、それぞれの入口が持つことにしました。部品の設計の Entity Ownership への追加は、次に部品の設計を見直すときに行います
- セッションの期限の長さ、トークンを画面のどこに持つか、処理済みのイベントと要求の記録を残す期間、「処理中」をやり直してよいまでの時間は、NFR の段階で決めます
