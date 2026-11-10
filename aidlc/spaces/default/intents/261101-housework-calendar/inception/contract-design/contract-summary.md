# 契約のまとめ（Contract Summary）

作業単位（`inception/units-generation/unit-of-work.md`）と部品（`inception/domain-design/components.md`）のあいだで、何を、どんな形で、どうやってやりとりし、うまくいかないときにどうするかの決まりです。答えは `contract-design-questions.md` の [Q1]〜[Q9] にあります。

前提（作業単位の分割で決めたこと）:

- 裏側の入口は Lambda を 3 つに分ける（画面用 API、LINE 用の受け口、お知らせ用）
- 裏側の部品どうしは、同じコードの中で関数の窓口を通して呼ぶ（ネットワーク越しには呼ばない）
- 画面と裏側で共有する型と文言の一覧は、U1 で作る共有の置き場所（以下「共有パッケージ」）に置く

## 契約の一覧

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---------------|----------|-----------|-------|
| C1 | U1 画面用 API の入口（U2〜U11 が操作を足す） | 画面（React。U1〜U11） | REST / HTTPS / JSON（OpenAPI） | 画面用 API の入口。各操作は、その操作を足す単位が持つ |
| C2 | U1 セッションの発行（画面用 API） | 画面（React） | REST / HTTPS / JSON（OpenAPI） | U1 |
| C3 | U1 LINE 用の受け口（U3、U6、U8 がイベントの扱いを足す） | External: LINE プラットフォーム（Webhook） | HTTPS POST / JSON（LINE の Webhook の形） | LINE（形は LINE が決める）。受け口の扱いは U1 |
| C4 | External: LINE Messaging API と LINE ログイン | U1 LINE 用の受け口、U10 お知らせ、U1 セッションの発行 | HTTPS / JSON（LINE の API の形） | LINE。使う側の決まりは U1 |
| C5 | U10 お知らせ用の入口 | External: AWS の決まった時刻の仕組み（スケジューラ） | 起動イベント / JSON（shared schema） | U10 |
| C6 | 家族とメンバーの窓口（U1、U2、U3） | 画面用 API、LINE 用の受け口、お手伝いの種類、カレンダー、お小遣い、お知らせ | 同じコードの中の関数の呼び出し（shared schema） | 家族とメンバー |
| C7 | お手伝いの種類の窓口（U4） | 画面用 API、カレンダー | 同じコードの中の関数の呼び出し（shared schema） | お手伝いの種類 |
| C8 | カレンダーの窓口（U5、U6、U7、U8） | 画面用 API、LINE 用の受け口、お小遣い、お知らせ | 同じコードの中の関数の呼び出し（shared schema） | カレンダー（担当と記録） |
| C9 | お小遣いの窓口（U9、U11） | 画面用 API、お知らせ | 同じコードの中の関数の呼び出し（shared schema） | お小遣い |
| C10 | 共有パッケージ（U1） | 画面、すべての裏側の部品 | 共有する型・理由の印・文言の一覧（shared schema） | U1（各単位が足す） |

## 全体に共通の決まり

### 失敗の返し方 [Q2、Q3]

- 部品の窓口は、業務の決まりで断るとき（例: 確定済みの月、子供による管理者の操作）は、結果の値 `{ ok: false, reason }` で返す。成功は `{ ok: true, value }`
- 思いがけない失敗（データベースにつながらない、LINE につながらないなど）は、エラーを投げる。入口（3 つの Lambda）が受け止めて記録し、作り手への知らせ（NFR2）につなげる
- 部品は、断った理由の印（`reason`）だけを返す。利用者に見せる文言は返さない
- 文言の一覧は共有パッケージに 1 つだけ置き、画面と LINE のトークの受け口の両方が理由の印から引く

### 画面用 API の失敗の形 [Q1、Q3]

| 場合 | HTTP の状態 | 本文 |
|------|------------|------|
| 業務の決まりで断った | 409（確定済み、状態が合わないなど）、422（入力が正しくない） | `{ "error": { "reason": "<理由の印>", "details": { ... } } }` |
| 認証がない、セッションが切れた | 401 | `{ "error": { "reason": "UNAUTHENTICATED" } }` |
| 家族のメンバーではない、子供による管理者の操作 | 403 | `{ "error": { "reason": "NOT_FAMILY_MEMBER" }}` または `"ADMIN_ONLY"` |
| 見つからない | 404 | `{ "error": { "reason": "NOT_FOUND" } }` |
| 思いがけない失敗 | 500 | `{ "error": { "reason": "INTERNAL" } }`（画面は FR4.5 の「表示できませんでした。もう一度お試しください」を出す） |

`details` には、文言を作るのに必要な値だけを入れる（例: FR3.4 の重なっている日とお手伝いの一覧）。

### 日付・時刻・金額 [Q6]

- 担当の日付と月: 日本時間の `YYYY-MM-DD` と `YYYY-MM`
- 記録した時刻など: UTC の ISO 8601（例: `2027-01-07T11:00:00Z`）。画面と LINE の返事で日本時間にして表示する
- 金額: 円の整数（マイナスもそのまま。FR8.3）

### 二重に届いたとき [Q5]

- LINE から届いたイベントは、イベントの ID（`webhookEventId`）を記録し、同じ ID は二度処理しない
- それに加えて、記録・引き受け・登録などの操作そのものを、何度やっても結果が同じになる作りにする（例: 「済」の担当をもう一度記録しても 1 件のまま。FR5.3。引き受けは最初の 1 人だけ。FR7.3）
- 画面からの操作も、同じ操作を 2 回送られても結果が同じになる作りにする

## C1 画面用 API（画面 → 裏側）

URL にバージョンを付ける（`/v1/...`）[Q4]。すべての操作で、`Authorization: Bearer <セッショントークン>` を確かめ、家族のメンバーであること（管理者の操作では管理者であること）を確かめる（NFR4）[Q8、Q9]。家族は、セッションの利用者から裏側が決める（URL で家族を指定しない）。URL や本文の dutyId・offerId・choreTypeId・adjustmentId・childUserId がその家族のものでなければ、404 `NOT_FOUND` で断る（C6〜C9 の家族の範囲の決まり）。

```yaml
openapi: 3.0.3
info:
  title: お手伝いカレンダー 画面用 API
  version: v1
servers:
  - url: /v1
security:
  - sessionToken: []
components:
  securitySchemes:
    sessionToken:
      type: http
      scheme: bearer
      description: C2 で発行した署名付きのセッショントークン
  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [reason]
          properties:
            reason: { type: string, description: 共有パッケージの理由の印 }
            details: { type: object, additionalProperties: true }
    Role:
      type: string
      enum: [admin, child]
    Me:
      type: object
      required: [userId, displayName]
      properties:
        userId: { type: string }
        displayName: { type: string }
        family:
          type: object
          nullable: true
          properties:
            familyId: { type: string }
            name: { type: string }
            role: { $ref: '#/components/schemas/Role' }
            notificationGroupRegistered: { type: boolean }
    Member:
      type: object
      properties:
        userId: { type: string }
        displayName: { type: string }
        role: { $ref: '#/components/schemas/Role' }
    ChoreType:
      type: object
      required: [choreTypeId, name, unitPrice, active]
      properties:
        choreTypeId: { type: string }
        name: { type: string }
        unitPrice: { type: integer, minimum: 0, description: 円の整数 }
        description: { type: string }
        active: { type: boolean, description: false は「使わない」 }
    AssignmentRule:
      type: object
      required: [choreTypeId, childUserId, weekdays]
      properties:
        choreTypeId: { type: string }
        childUserId: { type: string }
        weekdays:
          type: array
          items: { type: integer, minimum: 0, maximum: 6, description: 0=日曜 }
    Duty:
      type: object
      required: [dutyId, date, choreTypeId, childUserId, status]
      properties:
        dutyId: { type: string }
        date: { type: string, format: date, description: 日本時間の日付 }
        choreTypeId: { type: string }
        choreName: { type: string }
        childUserId: { type: string }
        status: { type: string, enum: [todo, done, skipped], description: 未・済・× }
        recordedAt: { type: string, format: date-time, nullable: true, description: UTC }
        recordedBy: { type: string, nullable: true, description: 記録した人の userId }
        unitPrice: { type: integer, nullable: true, description: 記録のときに書き写した単価 }
    MonthCalendar:
      type: object
      properties:
        month: { type: string, example: '2027-01' }
        confirmed: { type: boolean }
        hasAssignment: { type: boolean }
        duties:
          type: array
          items: { $ref: '#/components/schemas/Duty' }
    Allowance:
      type: object
      properties:
        childUserId: { type: string }
        month: { type: string }
        total: { type: integer }
        lines:
          type: array
          items:
            type: object
            properties:
              kind: { type: string, enum: [chore, adjustment] }
              label: { type: string }
              count: { type: integer, nullable: true }
              amount: { type: integer }
paths:
  /me:
    get:
      summary: 自分と、入っている家族と役割（U1。FR1.2、FR1.7）
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Me' } } } }
        '401': { description: 認証なし, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
  /families:
    post:
      summary: 家族を作り、作った人を管理者にする（U1。FR1.3。すでに入っていれば 409 ALREADY_IN_FAMILY）
      responses:
        '201': { description: 作った }
        '409': { description: すでに家族に入っている, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
  /family/members:
    get:
      summary: 家族のメンバーの一覧（U1）
      responses:
        '200': { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Member' } } } } }
  /family/invitations:
    post:
      summary: 招待用のリンクを作る（U2。管理者だけ。FR1.4）
      responses:
        '201': { description: 作った。リンクを返す }
        '403': { description: ADMIN_ONLY }
  /invitations/{token}/accept:
    post:
      summary: 招待で家族に子供として参加する（U2。FR1.4。ALREADY_IN_OTHER_FAMILY、INVITATION_INVALID）
      parameters:
        - { name: token, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: 参加した }
        '409': { description: 断った, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
  /chore-types:
    get:
      summary: お手伝いの種類の一覧（U4）
      responses:
        '200': { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/ChoreType' } } } } }
    post:
      summary: 種類を登録する（U4。管理者だけ。FR2.1。単価が正しくなければ 422 INVALID_UNIT_PRICE）
      responses:
        '201': { description: 登録した }
  /chore-types/{choreTypeId}:
    parameters:
      - { name: choreTypeId, in: path, required: true, schema: { type: string } }
    put:
      summary: 名前・単価・説明・使う／使わないを変える（U4。FR2.1〜FR2.3）
      responses:
        '200': { description: 変えた }
    delete:
      summary: 割り当てに使われていない種類を消す（U4。FR2.4。使われていれば 409 CHORE_TYPE_IN_USE）
      description: >-
        入口が先にカレンダーの窓口（C8 isChoreTypeAssigned）で使われたかを確かめ、使われていなければお手伝いの種類の窓口（C7 delete）を呼ぶ。
        お手伝いの種類はカレンダーに頼らない（頼り方は一方向のまま。ADR-001）。
      responses:
        '204': { description: 消した }
        '409': { description: 使われている }
  /months/{month}/assignment:
    parameters:
      - { name: month, in: path, required: true, schema: { type: string, example: '2027-01' } }
    get:
      summary: 月の割り当て（U5）
      responses:
        '200': { description: OK }
    put:
      summary: 月の割り当てを保存し直す（U5。FR3.1、FR3.3〜FR3.5）
      description: >-
        `confirmOverwrite` が false のとき、上書きされる担当があれば 409 OVERWRITE_CONFIRMATION_REQUIRED と変化の一覧を details で返す。
        重なりは 422 ASSIGNMENT_OVERLAP と重なりの一覧。確定済みは 409 MONTH_CONFIRMED。
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                rules: { type: array, items: { $ref: '#/components/schemas/AssignmentRule' } }
                confirmOverwrite: { type: boolean }
      responses:
        '200': { description: 保存した }
  /months/{month}/calendar:
    get:
      summary: 月のカレンダー（U5。FR4.1〜FR4.4）
      parameters:
        - { name: month, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/MonthCalendar' } } } }
  /duties/{dutyId}:
    parameters:
      - { name: dutyId, in: path, required: true, schema: { type: string } }
    patch:
      summary: 日ごとの担当の子供を変える（U5。FR3.2。「未」だけ。DUTY_NOT_TODO、MONTH_CONFIRMED）
      responses:
        '200': { description: 変えた }
  /duties/{dutyId}/record:
    post:
      summary: 子供が画面から記録する（U6。FR5.5〜FR5.7。FUTURE_DUTY、DUTY_SKIPPED_BY_ADMIN、NOT_OWN_DUTY、MONTH_CONFIRMED）
      parameters:
        - { name: dutyId, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: 記録した（すでに済なら同じ結果を返す） }
  /duties/{dutyId}/status:
    post:
      summary: 管理者が状態を変える（U7。FR6.1〜FR6.4。管理者だけ）
      parameters:
        - { name: dutyId, in: path, required: true, schema: { type: string } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [action]
              properties:
                action: { type: string, enum: [cancel, markDone, markSkipped, unmarkSkipped] }
      responses:
        '200': { description: 変えた }
        '409': { description: INVALID_TRANSITION、MONTH_CONFIRMED }
  /months/{month}/confirmation:
    parameters:
      - { name: month, in: path, required: true, schema: { type: string } }
    put:
      summary: 月を確定する（U7。FR6.5。管理者だけ）
      responses:
        '200': { description: 確定した }
    delete:
      summary: 確定を取り消す（U7。FR6.5。管理者だけ）
      responses:
        '200': { description: 取り消した }
  /months/{month}/allowances:
    get:
      summary: 子供ごとのお小遣いの額と内訳（U9。FR8.1、FR8.3。U11 で加算・減額の行が足される）
      parameters:
        - { name: month, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Allowance' } } } } }
  /months/{month}/adjustments:
    post:
      summary: 加算・減額を記録する（U11。FR8.2。管理者だけ。REASON_REQUIRED、INVALID_AMOUNT、MONTH_CONFIRMED）
      parameters:
        - { name: month, in: path, required: true, schema: { type: string } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [childUserId, kind, amount, reason]
              properties:
                childUserId: { type: string }
                kind: { type: string, enum: [add, subtract] }
                amount: { type: integer, minimum: 1 }
                reason: { type: string, minLength: 1 }
      responses:
        '201': { description: 記録した }
  /adjustments/{adjustmentId}:
    delete:
      summary: 加算・減額を消す（U11。管理者だけ。MONTH_CONFIRMED）
      parameters:
        - { name: adjustmentId, in: path, required: true, schema: { type: string } }
      responses:
        '204': { description: 消した }
```

上に書いた操作の細かい入力と結果（必須の項目、上に書いていない断る場合）は、各単位の機能設計で足します。足すのは項目の追加だけで、壊す変更は下の「契約の持ち主と変更の決まり」に従います。

## C2 セッションの発行（画面 → 裏側）

画面は、LIFF（スマホの LINE の中）または LINE ログイン（パソコンのブラウザ）で受け取った ID トークンを送ります。裏側は ID トークンを LINE の決まりで確かめ（C4）、署名付きのセッショントークンを返します。画面はそれを持ち、以後の要求のたびに `Authorization: Bearer` で送ります [Q8、Q9]。

```yaml
openapi: 3.0.3
info:
  title: お手伝いカレンダー セッション
  version: v1
servers:
  - url: /v1
paths:
  /sessions:
    post:
      summary: ID トークンを確かめてセッションを発行する（U1。FR1.6、NFR4）
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [idToken]
              properties:
                idToken: { type: string, description: LIFF または LINE ログインの ID トークン }
      responses:
        '201':
          description: 発行した
          content:
            application/json:
              schema:
                type: object
                required: [sessionToken, expiresAt]
                properties:
                  sessionToken: { type: string, description: 裏側の鍵で署名したトークン。利用者の userId を含む }
                  expiresAt: { type: string, format: date-time }
        '401':
          description: ID トークンが正しくない（UNAUTHENTICATED）
```

- 署名の鍵は、環境ごとの安全な保管場所から読み、リポジトリには置かない（NFR5、project.md の Forbidden）
- セッショントークンには利用者の userId と期限だけを入れる。家族と役割は、要求のたびに家族とメンバーの窓口（C6）で確かめる（役割が変わってもすぐ効くように）
- 期限が切れると 401 を返し、画面は ID トークンを取り直して C2 を呼び直す

## C3 LINE の Webhook（LINE → LINE 用の受け口）

形は LINE の Messaging API の Webhook の決まりに従います。ここでは、この受け口が受け取るものと、その扱いを決めます。

```yaml
# shared-schema: LINE 用の受け口が扱う Webhook のイベント
endpoint: POST /line/webhook   # バージョンは付けない（形は LINE が決める）
verification:
  header: x-line-signature     # チャネルシークレットで本文の署名を確かめる。合わなければ 401 で何もしない（NFR4）
response:
  status: 200                  # 確かめたあとは、処理の結果にかかわらず 200 を返す（返事は reply で送る）
deduplication:
  key: webhookEventId          # 記録済みなら処理しない [Q5]
  store: DynamoDB              # 記録の持ち主は LINE 用の受け口。期限付きで残す（期間は機能設計で決める）
events:
  - type: follow               # 友だち登録（U1。FR1.1）
    uses: source.userId
    calls: 家族とメンバー.registerUser
    reply: 友だち登録のあいさつ
  - type: unfollow             # ブロック（U1。記録は消さない。FR1.1 の「登録し直しても重複しない」）
    calls: なし
  - type: join                 # グループへの参加（U3。FR1.5）
    uses: source.groupId
    reply: お知らせ先の登録の案内
  - type: message              # グループでの「登録」（U3）、「家事交代」（U8。FR7.1）
    uses: [source.type, source.groupId, source.userId, message.text]
    calls: [家族とメンバー.registerNotificationGroup, カレンダー.listSwappableDuties]
  - type: postback             # リッチメニューとボタン（U6 の「やった」と担当の選択、U8 の申し出・引き受け・取り下げ）
    uses: [source.userId, source.groupId, postback.data]
    postbackData:
      format: 'action=<操作>&dutyId=<担当>&offerId=<申し出>'   # 受け口だけが読み解く。部品には型付きの値で渡す
      actions: [record.list, record.do, swap.offer, swap.accept, swap.withdraw]
replyRule:
  - 部品の結果（成功、または理由の印）から、共有パッケージの文言の一覧で返事を作る [Q3]
  - reply トークンで返事をする。3 秒以内（NFR7）
  - 1 対 1 のトークの記録の返事は本人にだけ（FR5.2）。グループの申し出の返事はグループに（FR7.2〜FR7.5）
```

## C4 LINE の API を使う決まり（裏側 → LINE）

```yaml
# shared-schema: 裏側から LINE を呼ぶときの決まり
lineLogin:
  verifyIdToken:
    endpoint: POST https://api.line.me/oauth2/v2.1/verify
    usedBy: C2 セッションの発行
    checks: [チャネル ID が自分のものか, 期限が切れていないか]
    onFailure: 401 UNAUTHENTICATED を画面に返す
messagingApi:
  reply:
    endpoint: POST https://api.line.me/v2/bot/message/reply
    usedBy: LINE 用の受け口
    onFailure: 記録して作り手に知らせる（NFR2）。やり直さない（reply トークンは 1 回だけ使える）
  push:
    endpoint: POST https://api.line.me/v2/bot/message/push
    usedBy: お知らせ（U10）
    idempotency:
      header: X-Line-Retry-Key   # お知らせの種類・日付・家族（お知らせ先）から作る UUID（UUIDv5 など）。家族を含めるので、別の家族への同じ日のお知らせが重複として断られない。やり直しても二重に届かない（FR9.5）
    onFailure: 決まった回数やり直し、それでも失敗したら 15 分以内に作り手に知らせる（FR9.5、NFR2）
  profile:
    endpoint: GET https://api.line.me/v2/bot/profile/{userId}
    usedBy: 友だち登録のときの表示名の取得（U1。FR1.1）
secrets:
  - チャネルアクセストークン、チャネルシークレット、ログインのチャネル ID は、環境ごとの安全な保管場所から読む（NFR5）
  - ステージングと本番で別のチャネルを使う（NFR10）
timeouts:
  - LINE への呼び出しには時間切れを決め、返事が 3 秒以内（NFR7）に収まるようにする。値は NFR の設計で決める
```

## C5 決まった時刻の起動（スケジューラ → お知らせ用の入口）

```yaml
# shared-schema: お知らせ用の Lambda が受け取る起動イベント [Q7]
NotificationTrigger:
  type: object
  required: [kind, targetDate]
  properties:
    kind:
      type: string
      enum: [dailyReminder, monthlySummary]   # 毎日 16 時（FR9.1）、月の最後の日の 21 時（FR9.2）
    targetDate:
      type: string
      format: date                             # 日本時間の日付（NFR11）。monthlySummary はその月の最後の日
behaviour:
  - kind と targetDate と家族の組み合わせで、送ったかどうかを確かめる。送っていれば送らない（FR9.5）
  - dailyReminder は、月が確定しているとき、担当がない日、お知らせ先がないときは送らない（FR9.1、AC1.2.4）
  - monthlySummary は、確定していてもいなくても送る（FR6.5）。お知らせ先がないときは送らない
  - 毎日 21 時に起動して「今日が月の最後の日か」を処理側で判断するか、月の最後の日だけ起動するかは、インフラの設計で決める（どちらでも上の形は変わらない）
```

## C6〜C9 部品の窓口（同じコードの中）

形は TypeScript の型として共有パッケージ（または部品の公開の窓口）に置きます。ここでは名前と、成功と断る場合の印だけを決めます。引数と結果の細かい項目は各単位の機能設計で足します。

```yaml
# shared-schema: 部品の窓口。すべて Result<T, Reason> を返す [Q2]
Result:
  ok: { ok: true, value: T }
  rejected: { ok: false, reason: Reason }
  unexpected: エラーを投げる（入口が受け止める）

# 家族の範囲の決まり（FR1.7、NFR4）
familyScope:
  - 入口（画面用 API、LINE 用の受け口、お知らせ用）は、操作の前に C6 の getMembership（管理者の操作では requireAdmin）で利用者の familyId を決める。URL や本文で受け取った家族は使わない
  - 家族を決める前に使う C6 の窓口（registerUser、getMembership、requireAdmin、createFamily、acceptInvitation、findFamilyByGroup）を除き、すべての窓口は最初の引数に ctx を必ず受け取る
  - ctx は { familyId, userId, role } で、入口が決めた値だけを入れる。お知らせ用の入口は、家族ごとに { familyId, role: system } で呼ぶ
  - 部品は、指定された担当（dutyId）・申し出（offerId）・お手伝いの種類（choreTypeId）・加算・減額（adjustmentId）・子供（childUserId）が ctx.familyId の家族のものかを、自分のデータで確かめる。違えば NOT_FOUND で断る（ほかの家族のデータがあることも知らせない）
  - データの読み書きは、いつも familyId を含む条件で行う（ほかの家族のデータに届かない作りにする）

C6_家族とメンバー:          # 持ち主: 家族とメンバー（U1、U2、U3）
  registerUser(lineUserId, displayName): User                          # 何度呼んでも 1 人（FR1.1）
  getMembership(userId): { familyId, role } | NOT_FAMILY_MEMBER        # すべての部品の操作の前に使う（NFR4）
  requireAdmin(userId): { familyId } | NOT_FAMILY_MEMBER | ADMIN_ONLY
  createFamily(userId): Family | ALREADY_IN_FAMILY
  acceptInvitation(userId, token): Member | ALREADY_IN_OTHER_FAMILY | INVITATION_INVALID   # U2。家族は招待から決まる
  findFamilyByGroup(groupId): familyId | GROUP_NOT_REGISTERED          # U3、U8（AC1.2.5）。グループのトークでの操作の前に使う
  listMembers(ctx): Member[]
  isChildOfFamily(ctx, childUserId): boolean                           # 子供の指定がその家族のものかを確かめる
  createInvitation(ctx): Invitation | ADMIN_ONLY                       # U2
  registerNotificationGroup(ctx, groupId): void | ADMIN_ONLY           # U3。置き換え（FR1.5）
  getNotificationGroup(ctx): groupId | NOTIFICATION_GROUP_NOT_REGISTERED   # U3

C7_お手伝いの種類:          # 持ち主: お手伝いの種類（U4）。カレンダーには頼らない
  list(ctx): ChoreType[]
  create(ctx, input): ChoreType | INVALID_UNIT_PRICE
  update(ctx, choreTypeId, input): ChoreType | INVALID_UNIT_PRICE | NOT_FOUND
  getCurrentUnitPrice(ctx, choreTypeId): integer | NOT_FOUND           # 記録のときに書き写す（ADR-003）
  delete(ctx, choreTypeId): void | NOT_FOUND                           # 使われたかは呼ぶ前に入口が C8 で確かめる

C8_カレンダー:              # 持ち主: カレンダー（U5〜U8）。担当・申し出がその家族のものでなければ NOT_FOUND
  saveAssignment(ctx, month, rules, confirmOverwrite): Assignment | ASSIGNMENT_OVERLAP | OVERWRITE_CONFIRMATION_REQUIRED | MONTH_CONFIRMED | CHORE_TYPE_INACTIVE | NOT_FOUND
  isChoreTypeAssigned(ctx, choreTypeId): boolean                       # U5。C1 の種類の削除で使う
  getMonthCalendar(ctx, month): MonthCalendar
  changeDutyChild(ctx, dutyId, childUserId): Duty | DUTY_NOT_TODO | MONTH_CONFIRMED | NOT_FOUND
  listTodayRecordableDuties(ctx, today): Duty[] | NO_RECORDABLE_DUTY | MONTH_CONFIRMED   # U6。ctx.userId の担当
  recordDuty(ctx, dutyId, at): Duty | NOT_OWN_DUTY | FUTURE_DUTY | DUTY_SKIPPED_BY_ADMIN | MONTH_CONFIRMED | NOT_FOUND   # U6。済なら同じ結果
  changeDutyStatus(ctx, dutyId, action, at): Duty | INVALID_TRANSITION | MONTH_CONFIRMED | NOT_FOUND   # U7。FR6.1 の表
  confirmMonth(ctx, month, at): void                                   # U7
  unconfirmMonth(ctx, month): void                                     # U7
  isMonthConfirmed(ctx, month): boolean                                # お小遣い、お知らせ
  listDoneDuties(ctx, month): Duty[]                                   # お小遣い（書き写した単価つき）
  listDutiesOn(ctx, date): Duty[]                                      # お知らせ
  listSwappableDuties(ctx, today): Duty[] | NO_SWAPPABLE_DUTY | MONTH_CONFIRMED   # U8
  offerSwap(ctx, dutyId): Offer | ALREADY_OFFERED | DUTY_NOT_TODO | MONTH_CONFIRMED | NOT_FOUND  # U8
  acceptSwap(ctx, offerId): Duty | OFFER_ALREADY_ACCEPTED | OFFER_GONE | CANNOT_ACCEPT_OWN_OFFER | NOT_FOUND   # U8。最初の 1 人だけ
  withdrawSwap(ctx, offerId): void | OFFER_GONE | NOT_FOUND            # U8

C9_お小遣い:                # 持ち主: お小遣い（U9、U11）。子供・加算減額がその家族のものでなければ NOT_FOUND
  getAllowances(ctx, month): Allowance[]                               # 読むたびに計算（ADR-005）
  addAdjustment(ctx, input): Adjustment | REASON_REQUIRED | INVALID_AMOUNT | MONTH_CONFIRMED | NOT_FOUND   # U11。input.childUserId を C6 isChildOfFamily で確かめる
  deleteAdjustment(ctx, adjustmentId): void | MONTH_CONFIRMED | NOT_FOUND                                 # U11
```

## C10 共有パッケージ（型・理由の印・文言）

```yaml
# shared-schema: 共有パッケージの中身（U1 が置き場所を作り、各単位が足す）
contents:
  types: C1 と C2 の要求と結果の型、C5 の起動イベントの型、C6〜C9 の窓口の型
  reasons:                       # 理由の印。消さない・意味を変えない（足すのは自由）
    - UNAUTHENTICATED
    - NOT_FAMILY_MEMBER
    - ADMIN_ONLY
    - NOT_FOUND
    - INTERNAL
    - ALREADY_IN_FAMILY
    - ALREADY_IN_OTHER_FAMILY
    - INVITATION_INVALID
    - NOTIFICATION_GROUP_NOT_REGISTERED
    - GROUP_NOT_REGISTERED
    - INVALID_UNIT_PRICE
    - CHORE_TYPE_IN_USE
    - CHORE_TYPE_INACTIVE
    - ASSIGNMENT_OVERLAP
    - OVERWRITE_CONFIRMATION_REQUIRED
    - MONTH_CONFIRMED
    - DUTY_NOT_TODO
    - NO_RECORDABLE_DUTY
    - NOT_OWN_DUTY
    - FUTURE_DUTY
    - DUTY_SKIPPED_BY_ADMIN
    - INVALID_TRANSITION
    - NO_SWAPPABLE_DUTY
    - ALREADY_OFFERED
    - OFFER_ALREADY_ACCEPTED
    - OFFER_GONE
    - CANNOT_ACCEPT_OWN_OFFER
    - REASON_REQUIRED
    - INVALID_AMOUNT
  messages:                      # 理由の印 → 文言。画面と LINE のトークの受け口の両方が引く [Q3]
    MONTH_CONFIRMED: この月は確定済みです
    NO_RECORDABLE_DUTY: 今日記録できる担当はありません
    FUTURE_DUTY: まだ来ていない日の担当は記録できません
    DUTY_SKIPPED_BY_ADMIN: お母さんが『やらなかった』にしています
    ALREADY_IN_FAMILY: すでに家族に入っています
    ALREADY_IN_OTHER_FAMILY: すでに別の家族に入っています
    INVITATION_INVALID: この招待は使えません。管理者に新しい招待を頼んでください
    NOT_FAMILY_MEMBER: このアプリは家族のメンバーだけが使えます
    NOTIFICATION_GROUP_NOT_REGISTERED: お知らせ先のグループが登録されていません
    GROUP_NOT_REGISTERED: このグループは家族のお知らせ先として登録されていません
    INVALID_UNIT_PRICE: 単価は 0 円以上の整数で入力してください
    DUTY_NOT_TODO: 記録を取り消してから変更してください
    NO_SWAPPABLE_DUTY: 申し出られる担当はありません
    ALREADY_OFFERED: この担当はもう申し出ています
    OFFER_ALREADY_ACCEPTED: この申し出はもう引き受けられています
    OFFER_GONE: この申し出はもうありません
    CANNOT_ACCEPT_OWN_OFFER: この申し出には応えられません
    REASON_REQUIRED: 理由を入力してください
    INTERNAL: 表示できませんでした。もう一度お試しください
  note: 文言は要件（requirements.md）の書き方をそのまま使う。値を入れる文言（例: 記録した時刻、重なりの一覧）は、入れる値の名前を決めて機能設計で足す
```

## 契約の持ち主と変更の決まり

- **持ち主:** 画面用 API（C1、C2）の各操作は、その操作を足す単位が持つ。入口の共通の決まり（認証、失敗の形）は U1 が持つ。部品の窓口（C6〜C9）は、その部品が持つ。共有パッケージ（C10）の置き場所は U1 が持ち、中身は足す単位がそれぞれ持つ。LINE の形（C3、C4）は LINE が決め、使い方の決まりは U1 が持つ。起動イベント（C5）は U10 が持つ
- **足す変更:** 項目・操作・理由の印・文言を足すのは自由。受け取る側は、知らない項目を無視する
- **壊す変更（画面用 API）:** 項目を消す・意味を変える・必須にするときは、新しいバージョン（`/v2/...`）を足し、古いほうをしばらく残す。LINE の中で開いたままの古い画面が古いバージョンを呼んでも動くようにする [Q4]。古いほうを消す時期は、作り手が決める
- **壊す変更（部品の窓口、起動イベント）:** 同じコードの中なので、呼ぶ側を同じ変更の中で直す。バージョンは付けない
- **理由の印:** 一度足した印は消さず、意味も変えない。使わなくなっても残す
- **変更の確かめ:** 取り込み前の CI で、画面と裏側が同じ共有パッケージの型でビルドできることを確かめる

## Open Questions

| Contract | Question | Blocks |
|----------|----------|--------|
| C2 | セッショントークンの期限の長さと、署名の方式・鍵の置き場所（AWS のどのサービスか） | U1 |
| C2 | セッショントークンを画面のどこに持つか（メモリだけか、ブラウザの保存場所か）。XSS への備え | U1 |
| C3 | 記録済みのイベント ID をどれくらいの期間残すか | U1 |
| C3 | グループでお知らせ先を登録する操作の言葉（例: 「登録」と送る）と、ボタンの形 | U3 |
| C4 | LINE への呼び出しの時間切れの値と、push のやり直しの回数・間隔 | U1、U10 |
| C5 | 月末のまとめを毎日 21 時に起動して判断するか、月の最後の日だけ起動するか | U10 |
| C1 | 招待用のリンクの有効期限と使える回数（要件の Open Questions） | U2 |
| C1 | 画面用 API の各操作の細かい入力と結果の項目 | 各単位（機能設計で足す） |

## Sources

- `inception/units-generation/unit-of-work.md`、`unit-of-work-dependency.md`（単位、配備の形、部品どうしの呼び方、共有パッケージ）
- `inception/domain-design/components.md`、`decisions.md`（部品、データの持ち主、ADR-001〜ADR-005）
- `inception/requirements-analysis/requirements.md`（FR1〜FR9 の文言と決まり、NFR2、NFR4、NFR5、NFR7、NFR10、NFR11）
- `aidlc/spaces/default/memory/project.md`（秘密の情報をリポジトリに入れない）、`team.md`（1 人で作る、同じリポジトリから配備する）
- `contract-design-questions.md` の回答 [Q1]〜[Q9] とまとめの確認
- LINE の Webhook と API の形: [LINE Developers: Messaging API リファレンス](https://developers.line.biz/ja/reference/messaging-api/)、[LINE ログイン: IDトークンを検証する](https://developers.line.biz/ja/reference/line-login/#verify-id-token)

## Assumptions & Open Questions

- [assumption] LINE の Webhook には `webhookEventId` が含まれ、push には `X-Line-Retry-Key` で二重送信を防ぐ仕組みがある（LINE Developers の Messaging API リファレンスに基づく。作るときにもう一度確かめる）
- [assumption] パソコンのブラウザでも、LINE ログインで ID トークンを受け取れる（FR1.6）。LIFF をブラウザで開いたときの動きは、U1 で確かめる
- [assumption] セッショントークンを画面のスクリプトが持つため、画面に XSS の弱さがあるとトークンが読まれうる。期限を短くするなどの備えは、上の Open Questions のとおり NFR の段階で決める
- お手伝いの種類の削除では、入口が先にカレンダーの窓口で使われたかを確かめる（C1 の `DELETE /chore-types/{choreTypeId}`）。お手伝いの種類はカレンダーに頼らないので、部品の頼り方は一方向のまま（ADR-001）
