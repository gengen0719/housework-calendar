# 安全の設計（Security Design）— U8 代わりにやる

U8（`u8-swap`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.74〜NFR4.85、NFR5.14、NFR5.15）を、どう作るかを書きます。U1〜U7 の設計（署名と秘密のヘッダーの確かめ、二度処理しない記録、`runGroupOperation`、条件式の名前の置き換え、ログの伏せ字）はそのまま使います。U8 の新しい入口は LINE のグループだけです。「家事交代」の message と、`swap.offer`・`swap.accept`・`swap.withdraw` の postback（1 対 1 では案内の返事だけ）。画面用 API は足しません。新しい秘密は作りません（NFR5.14）。

## 受け口の確かめの順番（NFR4.74、NFR4.75、NFR4.76、NFR4.85）

```text
1 秘密のヘッダー X-Origin-Verify と x-line-signature（U1。イベントの中身を読む前）
2 accepts: 「家事交代」の text か、swap.* の postback の形か（二度処理しない記録を書く前）
     外れ → LINE_EVENT_IGNORED（type だけ）。返事も書き込みもしない
3 二度処理しない記録 begin（U1）
4 source.type で分ける
     group  → runGroupOperation（NFR4.77）→ 操作（NFR4.78）
     user   → 案内の返事だけ（text のときだけ。swap.* の postback は何もしない）
     room など・groupId なし → 何もしない
5 reply 1 回（NFR4.83）→ markDone
```

- 1. の確かめは U1 のまま、U8 は順番を変えません。確かめの前にグループの ID や利用者を読みません（NFR4.74）
- 2. の `accepts` は、U3・U6 の `accepts` に U8 の 2 つの判定を足す形にします。**家事交代の操作にあたらないグループの会話では、二度処理しない記録も含めて DynamoDB に何も書きません**（NFR4.85）

### 「家事交代」の読み方（NFR4.75）

- `message.type` が `text`、長さが 5000 文字以内、`text.trim()` が `'家事交代'` と**完全に同じ**ときだけ受け付けます。`trim` は JavaScript の標準のもので、全角の空白も除きます
- 大文字小文字・全角半角・濁点・空白の正規化はしません。「代わって」「かわって」「家事 交代」「家事交代して」、前後に零幅の空白（U+200B）や改行を挟んだもの、見た目だけ似た別の文字は、受け付けません
- 受け付けない text は `LINE_EVENT_IGNORED`（`type` だけ）を残して、返事も書き込みもしません
- U3 の登録の読み方（`handlers/line/groupCommand.ts`）は**変えません**。U8 の読み方は別の関数に置きます

### `swap.*` の postback の読み方（NFR4.76）

生の文字列に対する正規表現で、次の 3 つの形と**ちょうど同じ**ときだけ操作として扱います。`URLSearchParams` は使いません（項目の重複・順序・エンコードの違いなど、同じ値に見える違う文字列を通さないため。U6 の NFR4.54 と同じ作り）。

```ts
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SWAP_OFFER = new RegExp(`^action=swap\\.offer&dutyId=(${UUID})$`);
const SWAP_OFFER_ID = (action: 'accept' | 'withdraw') =>
  new RegExp(`^action=swap\\.${action}&dutyId=(${UUID})&offerId=(${UUID})$`);
const MAX_POSTBACK_DATA = 300; // 実際の最長は約 110 文字
```

- 先に長さ（300 文字以内）と `source.type === 'group'` と `replyToken` の有無を見て、そのあと正規表現を当てます。知らない `action`、同じ項目が 2 回、順序違い、余分な項目、大文字の UUID、空の値、URL エンコードで形を変えた値、末尾の `&`、前後の空白は、すべて `LINE_EVENT_IGNORED`（二度処理しない記録も書かない）
- 1 対 1 や `room` から届いた `swap.*` は何もしません（返事もしない。BR9.4）
- data の中身は秘密を持たず、**信じません**。権限は次の節の「読んだ担当と申し出」で決めます。ログに data の文字は出しません（NFR2.65）
- 形の確かめを通った UUID だけを、申し出の項目のキー（`sk = 'SWAP#' + dutyId`）に使います（NFR4.81）

## グループの入口と家族の決め方（NFR4.77）

- 申し出の操作はすべて `runGroupOperation`（U3 の入口）を通します（BR9.2）。第 2 引数に押した人の表示名を渡す形に足します（`FamilyContext` は変えません。追加の読み取りはしません）
- 家族は**グループの登録**（`findFamilyByGroup`）から決めます。ボタンの値（`dutyId`・`offerId`）やイベントの中の値からは決めません
- 登録されていないグループには `GROUP_NOT_REGISTERED` の決まった文、送った人が友だちで家族のメンバーでない（利用者の記録がない・ブロック中・ほかの家族・役割がない）ときは `NOT_FAMILY_MEMBER` の決まった文を返し、`Calendar`・`ChoreTypes` の読み書きを呼びません。断りの文は決まった文だけで、家族の名前・メンバー・担当を入れません（グループに見える返事のため）
- LINE のプロフィール取得は呼びません（友だちかどうかは保存してある `friendStatus` で見る）
- 別の家族のグループに貼り付けられた同じ data のボタンは、この入口（その家族の登録がないグループ）で断られるか、家族の範囲の探索で見つからず `NOT_FOUND`・`OFFER_GONE` になります

## 誰が何をできるか（NFR4.78、NFR4.79、NFR4.80）

権限は、ボタンの値ではなく**読んだ担当と申し出**で決めます。

| 操作 | 判定（上から。最初に当たったもので返す） |
|------|------------------------------------|
| 一覧 | 管理者 → 「代わってもらう申し出は子供だけができます」（担当も申し出も読まない。`SWAP_GUIDE_SENT`） |
| 選ぶ `offerSwap` | 担当を家族の範囲で探す（なければ `NOT_FOUND`）→ 担当の子供が押した人か（違えば `OFFER_OWNER_ONLY`。担当の子供が変わっていて元の持ち主が古いボタンを押したときだけ `DUTY_CHANGED`）→ 月の確定 → 「未」で日が今日以降か（`DUTY_NOT_TODO`）→ 有効な申し出があるか（`ALREADY_OFFERED`）→ 取引 |
| 引き受ける `acceptSwap` | 申し出・`offerId`・有効さ（`OFFER_GONE`）→ 押した人が管理者または申し出た本人（`CANNOT_ACCEPT_OWN_OFFER`。引き受けられたあとでも同じ）→ すでに引き受け済み（`OFFER_ALREADY_ACCEPTED`）→ 取引 |
| やめる `withdrawSwap` | 申し出・`offerId`・有効さ（`OFFER_GONE`）→ 申し出の `offererUserId` が押した人か（違えば `OFFER_OWNER_ONLY`）→ 引き受け済み（`OFFER_ALREADY_ACCEPTED`）→ `UpdateItem` |

- ほかの家族の `dutyId`・`offerId` は、`familyId = ctx.familyId` の範囲で探して見つからず、`NOT_FOUND`（選ぶ）か `OFFER_GONE`（引き受ける・やめる）になります。`NOT_FOUND` と `DUTY_NOT_TODO` は同じ文「この担当は先に変更されました」で、ほかの家族の担当や申し出があるかどうかが分かりません
- **引き受けの先着**（NFR4.79）は取引の条件で決めます。担当の条件（`dutyId`・`version`＝申し出の `dutyVersion`・`status`＝todo・`childUserId`＝`offererUserId`）、申し出の条件（`status`＝open かつ `offerId` が同じ）、月が確定していない `ConditionCheck` を**同じ取引**に入れます（`reliability-design.md` の「引き受けの 3 項目の取引」）。引き受けた子供の自分の担当は取引に含めません
- **古いボタン**（NFR4.80）は `offerId` の一致で防ぎます。申し出し直すと項目が新しい `offerId` の `open` に上書きされ、古いボタンは `OFFER_GONE` になります。申し出が有効かの判断（BR9.8）は、読んだ担当（`version`・状態・子供・日付・月の確定）と申し出の状態から行い、フックの有無に頼りません

## 申し出の項目の書き方と権限（NFR4.81、NFR4.82）

### 書き方の決まり（ADR-U8-02）

| 決まり | 内容 |
|--------|------|
| 使う書き込み | `UpdateItem`（条件つき）と `TransactWriteItems` の項目ごとの `Update`・`ConditionCheck` だけ |
| 使わない | `PutItem`・`DeleteItem`・`Scan`・`BatchGetItem`・`BatchWriteItem`（`line` と `api` の U8 のコードでは発行しない） |
| キー | `familyId`＝呼び出した家族（`ctx.familyId`、フックでは `event.familyId`）、`sk`＝`SWAP#` ＋ 形の確かめを通った小文字の UUID。ボタンの値から作った文字列をそのままキーにしない |
| フックの掃除 | **必ず `#status = :open` の条件を付ける。** `UpdateItem` は項目がなければ作ってしまうので、条件なしの更新は存在しない担当の申し出の項目を勝手に作る。断られた `ConditionalCheckFailedException` だけを握りつぶし、ほかの例外は握りつぶさない |
| 属性名 | すべて `ExpressionAttributeNames`（`#status`・`#offerId`・`#dutyVersion`・`#offererUserId`・`#acceptedByUserId`・`#acceptedAt`・`#createdAt`・`#updatedAt`・`#sk`）で置き換える（U5〜U7 の決まり） |

### 権限と環境変数は足さない

`infrastructure/lib/app-stack.ts` を読んで確かめた U8 の前の状態（NFR4.82）。

| 必要なもの | 既にあるか |
|-----------|-----------|
| `line` から `Calendar` への `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` | ある（U6 で足し済み） |
| `line` から `ChoreTypes` への `GetItem`・`Query`・`ConditionCheckItem` | ある |
| `api` から `Calendar` への `UpdateItem` など | ある（U5） |
| 環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE`（`line`・`api`） | ある |

- U8 の読み書き（申し出の `GetItem`・条件つき `UpdateItem`、担当の `Update`、月の状態の `ConditionCheck`、種類の `Query`、フックの `UpdateItem`）は、項目ごとの許可（`UpdateItem`・`ConditionCheckItem`）で足ります。`TransactWriteItems` 自体の許可はなく、項目ごとの操作で確かめられます。**追加はありません**
- 足さないもの: `Calendar` への `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、`ChoreTypes` への書き込み、別のサービスへの許可、`*` の資源。`api` にも足しません
- **残る危険（承知のうえ）**: `UpdateItem` の許可は項目を作れる（`PutItem` と同じ効果）ので、`line` が乗っ取られると `SWAP#` の形の項目を作られ得ます。許可では守れず、**コードの条件とキーの固定で守る**設計です。害は申し出の項目に限られ、担当そのものは取引の条件（`version`・`status`）がなければ書き換えられません。`line` に `PutItem` を足さない代わりの手段（申し出の作成を `api` にだけ置く）は、LINE から申し出る流れに合わないので採りません
- コード生成で不足が見つかったときは、足す許可をこの文書に戻って書き、理由を残します（現時点では見つかっていません）
- CDK のテストで、`line` と `api` の IAM ポリシーと環境変数が U8 の前後で変わらないこと、`line` に上の「足さないもの」が 1 つも含まれないこと、ステージングの `line` が本番のテーブルの ARN を含まないことを確かめます

## 返事と個人の情報（NFR4.83、NFR4.84）

- 返事はすべて、そのイベントの reply トークンで、届いたグループ（または 1 対 1）にだけ送ります。`push`・`multicast`・`broadcast` と、`to` の宛先を指定する呼び出しは使いません。reply トークンは 1 回だけ使い、ログにも DynamoDB にも postback の data にも残しません
- グループに出る内容は、申し出た人の名前・日付・お手伝いの名前だけです。**金額・単価・記録の時刻・ほかの子供の担当の一覧・`dutyId`・`offerId` の UUID は返事の本文に入れません**（ボタンの `data` の中にだけ入る）
- 子供の表示名は、`runGroupOperation` が読んだ利用者の記録から取り（追加の読み取りと LINE のプロフィール取得はしない）、**返事の本文にだけ**使います。申し出の項目・担当の項目・ログには保存しません。長い名前は 20 文字までに切ります
- 名前・お手伝いの名前は文字として入れ、HTML や LINE の特殊な書式として解釈させる経路を作りません。名前が引けなければ「だれか」、お手伝いの名前は「お手伝い」と言い換え、返事を止めません（BR9.14）

## ログに出さないもの（NFR4.84、NFR2.65）

- 表示名、お手伝いの名前、LINE のユーザー ID と **LINE のグループ ID**、reply トークン、postback の data の全文、受け取った text、返事の本文、Webhook の本文、チャネルのトークンとシークレット、署名、秘密のヘッダーの値、単価と金額
- 形の外れた入力を無視するときは `LINE_EVENT_IGNORED` に `type` だけを書きます
- 範囲: 「LINE のグループ ID を残さない」は U8 の経路だけの決めです。直すのは `GROUP_COMMAND_REJECTED` だけで、ほかの既存のログ（`GROUP_JOINED` など）は LINE のグループ ID を書いたままで、U8 の対象外です（`observability-design.md`）
- 既存の `GROUP_COMMAND_REJECTED`（`services/groupCommandGate.ts`。いまは `groupId` を書いている）は、U8 の経路でも出るので、**`groupId` を書かない形に直します**（`reason` と、分かるときのアプリの `userId` だけ）。この変更を `docs/contract-changes-u8.md` に残し、U3 のテストの期待も直します
- 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・LINE のユーザー ID・グループ ID・reply トークン・data・text）を入れたイベントを、成功・すべての断り・`INTERNAL`・思いがけない例外・返事の失敗・形の外れた入力の全部の分かれ道で処理し、出たログの全行に目印が 1 つもないことを単体テストで確かめます（詳細は `observability-design.md`）

## 秘密の情報（NFR5.14、NFR5.15）

- U8 で新しい秘密は作りません。LINE の返事に使うチャネルアクセストークンとチャネルシークレットは、U1 の SSM（`line/*`）の値を、これまでどおり Lambda の起動時に読みます。`api` の署名の鍵（`jwt/*`）は U8 では使いません
- スクリプト・README・設定ファイル・テストの前提データに、本物の LINE のユーザー ID・グループ ID・reply トークン・チャネルの秘密・表示名を書きません。例は `<作り物の値>` と書きます。署名のテストには、作り物の秘密で計算した本物の HMAC を使います（U6 の NFR5.11 と同じ）
- リポジトリの秘密の情報の検査（gitleaks）が通ることを CI で確かめます

## 脅威と備えの対応

| 脅威 | 設計での備え |
|------|-------------|
| 偽の Webhook で名前を使って申し出る・引き受ける | 署名と秘密のヘッダーを先に確かめる（NFR4.74） |
| data を書き換えてほかの子供の担当を申し出る・ほかの人の申し出を取り下げる | data を信じず、読んだ担当・申し出で本人かを決める（NFR4.76、NFR4.78） |
| ほかの家族の ID でほかの家族の担当を引き受ける | 家族はグループの登録から決め、家族の範囲で探す（NFR4.77、NFR4.78） |
| 管理者が申し出る・引き受ける | 子供だけ。管理者には決まった文（NFR4.78） |
| 転送・貼り付けでグループ外へ持ち出したボタンを押す | 1 対 1・`room` は何もしない。グループの登録と家族のメンバーを確かめる（NFR4.76、NFR4.77） |
| 古い申し出のボタンで別の申し出・担当を動かす | `offerId` と `version` の一致（NFR4.80） |
| 2 人の同時の引き受けで二重に動く | 同じ取引で先着の 1 人だけ（NFR4.79） |
| フックが存在しない担当の申し出の項目を作る | `status = open` の条件（NFR4.81） |
| 似た文字列・雑談に反応する | 完全一致。正規化しない（NFR4.75） |
| 返事が家族以外に届く・金額が見える | reply だけ、金額を入れない、断りは決まった文（NFR4.83、NFR4.77） |
| ログから名前・LINE の ID が漏れる | NFR4.84、NFR2.65 |
| `line` が乗っ取られて項目を大量に作る | `DeleteItem`・`PutItem` の許可なし。`UpdateItem` は作れるのでコードの条件とキーの固定で守る。完全な防御ではないと承知（NFR4.82） |
| 偽の Webhook を大量に送って費用を増やす | 署名を先に確かめ、同時実行の上限（U1 の NFR1.6）で受ける。家事交代にあたらないイベントは書き込みもしない（NFR4.85） |
| LINE のアカウントを貸し借りした子供のなりすまし | 範囲外。LINE の本人確認は LINE が行い、家族内の信頼を前提にする（備えない） |

## Sources

- `construction/u8-swap/nfr-requirements/security-requirements.md`（NFR4.74〜NFR4.85、NFR5.14、NFR5.15）、`reliability-requirements.md`（NFR2.54、NFR2.57、NFR2.58）、`observability-requirements.md`（NFR2.65）、`tech-stack-decisions.md`（NFR8.15）
- `construction/u8-swap/functional-design/rules.md`（BR9.1〜BR9.4、BR9.7〜BR9.10、BR9.12〜BR9.14、BR9.16、BR9.18、BR9.19）、`functional-spec.md`（F1〜F6）、`entities.md`
- `inception/contract-design/contract-summary.md`（C3、C6、C8、C10）
- `construction/u7-review-confirm/nfr-design/security-design.md`（形の手本）、`construction/u6-recording/nfr-design/`（LINE の経路の設計）
- 既存コード（読むだけ）: `entries/line.ts`、`handlers/line/groupCommand.ts`、`services/groupCommandGate.ts`、`services/oneToOneGate.ts`、`infrastructure/lib/app-stack.ts`

## Assumptions & Open Questions

- [assumption] `line` の権限が足りているという確認は、`app-stack.ts` の既存の文を読んだ結果です。取引が実際に通ることは、コード生成の統合に近いテストと、ステージングの動作確認（NFR7.48）で確かめます。U6 の記録で通った形（担当の `Update` ＋ 月の `ConditionCheck`）と同じなので、不足の見込みは低いと見ます
- [assumption] `UpdateItem` が項目を作れることで残る危険は、NFR 要件が許容したものを引き継ぎます。コードの条件とキーの固定で守り、完全な防御とは言いません
- [assumption] `GROUP_COMMAND_REJECTED` から `groupId` を外す変更は、U3 の既存のログの形を変えます。BR9.18 に合わせた変更で、承認の場で確かめてください（`observability-design.md` にも同じ記載）
- [assumption] `runGroupOperation` の第 2 引数に表示名を渡す変更は、既存の呼び出しに影響しない追加の形です。コード生成で既存のテストが通ることを確かめます
- [assumption] LINE の各上限（ラベルの文字数など）は公式の資料で未確認です。コード生成の最初の手順で確かめます（NFR8.15）
- このステージで人に聞くことはありません
