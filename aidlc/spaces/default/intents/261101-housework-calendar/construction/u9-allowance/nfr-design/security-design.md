# 安全の設計（Security Design）— U9 お小遣いの額

U9（`u9-allowance`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.86〜NFR4.93、NFR5.16、NFR5.17）を、どう作るかを書きます。U1〜U8 の設計（セッション、ブロック中、家族のメンバーの確かめ、許可した項目だけを返す、HTML として差し込まない、作り物の値）はそのまま使います。U9 の入口は画面用の `GET /v1/months/{month}/allowances` だけで、読み取り専用です。LINE の入口は足しません。

お小遣いの額は子供ごとのお金の情報なので、**家族の外に見えないこと**を守ります。家族の中では、機能設計の決め（BR10.1、Q5）どおり、母親も子供も家族の全員分を見られます。

このステージで決めること（NFR 要件から預かったもの）は 3 つです。

1. `role: system`（U10 のお知らせ用の裏側）を、**HTTP の入口に混ぜずに**型で足す方法（ADR-U9-01）
2. `current` を足した月の確かめの形と、確かめの順番
3. `RouteResult` に任意の `headers` を足して `Cache-Control: no-store` を返す方法（ADR-U9-05）

## 受け口の確かめの順番（NFR4.86、NFR4.88）

用語: ここでの番号は入口の「確かめの順番」（1〜5）です。DynamoDB を順に待つ「段」（`performance-design.md`）とは別です。

```text
GET /v1/months/:month/allowances
  1. verifyOriginHeader（既存。X-Origin-Verify。違えば 403 FORBIDDEN）
  2. requireAuth       … セッションなし／署名違い／期限切れ／記録なし → 401、ブロック中 → 403 NOT_FRIEND（既存）
  3. requireMembership … 家族または役割がない → 403 NOT_FAMILY_MEMBER（既存。FamilyContext を作る）
  4. 月の形の確かめ    … 'current' か YYYY-MM（年 2000〜2100）。違えば 422 INVALID_MONTH
  5. getAllowanceMonthView(ctx, month, now) … 読み取りだけ
```

- `requireAdmin` は付けない（管理者でなくてよい。NFR4.86）。`requireMembership` が返す `ctx` は `{ familyId, userId, role: 'admin' | 'child' }` で、`role: system` はこの入口からは作れない（下の ADR-U9-01）
- 月の形の確かめは、メンバーの確かめのあとで、DynamoDB の読み取り（認証の 1 回を除く）の前に行う。メンバーでない人が `2027-13` を送っても 403 が先（月の形の違いから家族の事情を探れない）
- 要求に本文はなく、家族や子供を指す入力もない。家族はセッションの利用者の記録（`getUserStatus`）から決まる。クエリ文字列・本文・追加のヘッダーは読まない（`?familyId=…` や `?childUserId=…` を付けても無視する）
- 404 `NOT_FOUND` は起こさない（指す対象の入力がないため）。ハンドラーは薄く、`handlers/allowances/getAllowances.ts` に置き、`AllowanceMonthView` の本文だけを返す（既存の `getCalendar` などと同じ。`RouteResult` を import しないので `entries → handlers → services` の一方向を守る）。次の形にする（`getCalendar.ts` の並びに合わせる）

```ts
export async function getAllowances(auth: AuthContext, monthParam: string, now: Date): Promise<AllowanceMonthView> {
  const ctx = requireMembership(auth);                    // 確かめの順番 3
  const month = resolveMonthParam(monthParam, now);       // 確かめの順番 4（current を今の月に置き換える）
  const view = await allowanceService.getAllowanceMonthView(ctx, month, now);
  return view;                                            // 本文だけを返す。{ status, body, headers } は振り分け表が組み立てる（ADR-U9-05）
}

// entries/api.ts の振り分け表の 1 行（RouteResult は entries/api.ts の中に閉じ、handlers は import しない）
// 'GET /v1/months/:month/allowances': async (req) => ({ status: 200, body: await getAllowances(req.auth, req.params.month, req.now), headers: NO_STORE_HEADERS }),
```

### 月の読み方（NFR4.88）

| 入力 | 結果 |
|------|------|
| `2027-01`（年 2000〜2100、月 01〜12） | そのまま使う。範囲外の月（`firstMonth` より前、`lastMonth` より先）も形が正しければ 200 で計算して返す（読み取りの安全に関係しない。BR10.8） |
| `current`（ちょうどこの文字列） | `monthOfDate(jstDateOf(now))` に置き換える。`now` は入口で 1 回だけ取った時刻（`new Date()`）。答えの `month` には実際の `YYYY-MM` を入れる |
| `Current`・`CURRENT`・` current`・`current `・`current/`・`2027-1`・`2027-13`・`0050-01`・`2027-01-01`・空 | 422 `INVALID_MONTH` |

- 既存の `requireMonthParam`（`parseMonth` で `YYYY-MM` を確かめる）は**変えない**。U9 は `handlers/allowances/params.ts` に小さな関数を足す: `raw === 'current' ? monthOfDate(jstDateOf(now)) : requireMonthParam(raw)`。`current` の判定は**完全一致**の 1 つだけ（`toLowerCase` や `trim` をしない）
- DynamoDB のキー（`M#<month>#`）は、この関数が返した値だけから作る。未検証の文字列をキーにも条件式にも入れない（`calendarRepository` の `monthPrefix` は既存のまま）
- 確かめの単体テストは、断る例を 1 つずつ送り、どれも 422 で `Calendar` の Query が 0 回であること、メンバーでなければ月が不正でも 403 が先であること、`current` と今日の月の `YYYY-MM` が同じ答えになることを確かめる

## `role: system` の足し方（NFR4.90、NFR2.73、ADR-U9-01）

**決め**: `FamilyContext`（`middleware/requireMembership.ts`）は**変えない**。読み取りだけの窓口が受け取る型を、新しい型で広げる。

```ts
// middleware/requireMembership.ts（既存の FamilyContext の下に足す）
/** 家族を決めるだけの文脈。読み取りの窓口が、画面の入口の ctx と U10 の裏側の ctx の両方を受けられる形 */
export interface FamilyScope { familyId: string }
/** お知らせ用の裏側（U10）が作る文脈。利用者の ID を持たない。HTTP の入口は作らない */
export interface SystemContext extends FamilyScope { role: 'system' }
export type ReadContext = FamilyContext | SystemContext;
```

| 窓口 | 受け取る型 | 理由 |
|------|----------|------|
| `getAllowances`・`getAllowanceMonthView`（`allowanceService`） | `ReadContext` | U10 が `role: system` で呼ぶ。家族は `ctx.familyId` だけ |
| `familyMemberService.listMembers`・`loadFamilyAndMembers` | `ReadContext` | 本人の補い（`ctx.userId` で `Users` を読む）は `ctx.role !== 'system'` のときだけ（`ctx.userId` を読む前に型で絞る） |
| `familyMemberService.findFamilyChild`・`findDisplayName`・`getFamilyCreatedAt`、`choreTypeService.list`、`calendarService` の読み取りの窓口（C8 `listDoneDuties`・`isMonthConfirmed`） | `FamilyScope` | `ctx.familyId` だけを使うので、構造的に両方が入る |
| それ以外のすべて（書き込み、招待、グループ、記録、状態の変更、割り当て、代わりにやる） | `FamilyContext` のまま | `ctx.userId` を使う。`system` を渡すと**型で断る**（`tsc` が落ちる） |

- この形なら、既存の書き込みの窓口の型は 1 行も変わらず、`FamilyContext` に `role: 'system'` が混ざらない。`Role`（`'admin' | 'child'`、`packages/shared`）も変えない（画面や API の型に `system` が漏れない）
- `SystemContext` を作る関数は、`allowanceService.ts` の隣ではなく **U10 のお知らせ用の入口だけ**が import する場所に置く（U10 が作る。U9 では型だけを足し、作る関数は足さない）。`entries/api.ts` と `handlers/**` は `SystemContext` を import しない。HTTP や LINE の入力から `role: system` を作る道は、型の上でも import の上でも存在しない
- 確かめ: (1) `tsc` が通り、既存のテストが無修正で通ること。(2) `requireMembership` の戻りが `FamilyContext`（`role` は `admin`／`child` のみ）であること。(3) `handlers/**` と `entries/api.ts` の import に `SystemContext` がないこと（レビューと、`grep` のテスト）。(4) `role: system` の ctx で `getAllowances` を呼び、Users の本人の補いの `GetItem` が 0 回で、家族の全員分が返ること。(5) 書き込みの窓口に `{ familyId, role: 'system' }` を渡すコードが `tsc` を通らないこと（型のテスト。`// @ts-expect-error`）

## 窓口の使われ方の絞り込み（NFR4.90）

- `getAllowances(ctx, month, options?)` は家族を引数で受け取らない。`ctx.familyId` だけを使う。型の上でも、別の家族の ID を渡す引数がない
- `findDisplayName(ctx: FamilyScope, userId): Promise<Result<string, 'NOT_FOUND'>>` は、`Users` の `GetItem`（強い整合性）の結果から**表示名の文字列だけ**を取り出して返す。LINE のユーザー ID・役割・家族 ID・友だち状態・最後に見た時刻は、関数の戻りの型に含めない（内部で `User` の項目を読んでも、外に出す項目は表示名だけ）。見つからなければ `NOT_FOUND`
- `findDisplayName` を呼ぶのは `allowanceService` の**1 か所だけ**（抜けた子供の連なりの中）。HTTP・LINE から受け取った ID を渡さず、**同じ家族の担当に出てきた持ち主の ID だけ**を渡す。抜けた子供は `Users` の家族の欄が空か別の家族に変わっていることがあり、窓口の中では家族の一致を確かめられないため、呼び出し元を 1 か所に限ることで備える（NFR4.90 の理由）
- `getFamilyCreatedAt(ctx)` は、`ctx.familyId` の `Families` の `createdAt`（UTC）だけを返す
- C8 の `listDoneDuties`・`isMonthConfirmed` は `ctx.familyId` をキーにして `loadMonth` を呼ぶ。ほかの家族の月は読めない

## 応答に入れる項目を許可したものだけに絞る（NFR4.91）

応答は、担当や利用者の項目を**コピーせず**、1 項目ずつ書いて組み立てる。

```ts
// 形の目安（コード生成で allowanceService の中に置く）
const toLine = (c: Counted): AllowanceChoreLine =>
  ({ choreTypeId: c.choreTypeId, choreName: c.choreName, unitPrice: c.unitPrice, count: c.count, amount: c.unitPrice * c.count });
```

| 階層 | 許可する項目（これだけ） |
|------|----------------------|
| `AllowanceMonthView` | `month`、`confirmed`、`today`、`firstMonth`、`lastMonth`、`allowances` |
| `Allowance` | `childUserId`（アプリの `userId`）、`displayName`、`current`、`month`、`lines`、`adjustments`、`total` |
| `lines` の 1 行 | `choreTypeId`、`choreName`、`unitPrice`、`count`、`amount` |
| `adjustments` | U9 は常に空の配列。行の項目の許可は U11 が確定する（U11 の nfr-requirements に引き継ぐ） |

- 担当の `recordedBy`・`recordedAt`・`version`・`origin`・`unitPrice` 以外の内部の項目、LINE のユーザー ID、グループ ID を出さない。**管理者の `userId`・表示名**は、担当の持ち主として出てきても行にも応答にも入れない（BR10.6、BR10.13 の 3）
- 単価 0 円の行も、同じ許可した項目だけで組み立てる
- 型は `packages/shared/src/api-types.ts` に置く（画面と裏側で同じ型）。応答の組み立てが許可の一覧から外れないように、単体テストで JSON の項目名（再帰）を許可の一覧と**完全一致**で比べる。作り物の値（`<作り物の値>` の目印）を担当・利用者・種類に入れ、`recordedBy` などの目印が応答のどこにも出ないことを確かめる

## 失敗の返事と情報の漏れ（NFR4.93）

- 500 `INTERNAL` の本文は決まった文（`{ "error": { "reason": "INTERNAL" } }`。既存の `entries/api.ts` の形）。例外の文・スタック・テーブル名・`familyId`・`dutyId`・金額・名前を本文に入れない
- 例外の文に名前や金額を入れない作りにする: `allowanceService` が自分で投げるエラー（例: 家族の記録が見つからない）は、`familyId` だけを含める文にする（既存の `listMembers` の形と同じ）。DynamoDB の SDK のエラーを、名前や金額を足して包み直さない
- 403・422 の本文も決まった文だけ（既存の `errorResponse`）。ほかの家族の存在や子供の人数が分かる情報は返さない
- **異常なデータ**（「済」なのに単価がない、種類がない、管理者の担当）は、応答にも画面にも出さず、ログ（`ALLOWANCE_*`）にだけ残す。ログの項目は `familyId`・`dutyId`・`choreTypeId` だけ（`observability-design.md`）
- 同じ要求を何度送っても読み取りだけなので副作用がない（NFR2.67）

## `Cache-Control: no-store` と `RouteResult` の任意の `headers`（NFR4.92、ADR-U9-05）

今の `RouteResult` は `{ status, body }` だけで、`json(statusCode, body)` が `content-type` だけを付けています（`entries/api.ts`、`lib/http.ts` を読んで確かめた）。Cache-Control を付けている既存のコードはありません。

```ts
// entries/api.ts
interface RouteResult { status: number; body: unknown; headers?: Record<string, string> }
// ...handler の中: return json(result.status, result.body, result.headers);

// lib/http.ts
export function json(statusCode: number, body: unknown, extraHeaders?: Record<string, string>) {
  return { statusCode, headers: { ...extraHeaders, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
```

| 決め | 内容 |
|------|------|
| 追加の形 | `RouteResult.headers` は**任意**。省略した入口の応答（ステータス・本文・ヘッダー）は一字も変わらない |
| 順番 | `...extraHeaders` を先に書き、`content-type` を後に書く。追加のヘッダーが `content-type` を上書きできない |
| 付ける入口 | U9 の `GET /v1/months/:month/allowances` の**成功の応答（200）だけ**。値は `Cache-Control: no-store` |
| 付けないもの | 401・403・422・500（`errorResponse`/`json` の既存の形）。エラー本文には額も名前も入らないので、端末に残っても害がない。ほかの入口にも付けるかは、この単位では決めない |
| 定数 | `NO_STORE_HEADERS = { 'cache-control': 'no-store' }` を 1 か所に置く（ヘッダー名は小文字） |
| 背景 | `/v1/*` は CloudFront の背後にあり、cachePolicy は CACHING_DISABLED のため、途中の保存は元から起きない。残るのは端末のブラウザの保存で、このヘッダーは念のための備え |

- 確かめ: 既存の入口の単体テストが無修正で通ること。U9 の 200 の応答のヘッダーに `cache-control: no-store` があり、`content-type` が `application/json` のままであること。401・403・422 の応答にはないこと。`headers` を持たない入口の `json()` の戻りが、変更の前後で完全に同じであること
- URL に額・名前・子供の ID を入れない（パスは月だけ）。画面の `fetch` は URL に月だけを入れる

## 画面での表示（NFR4.92）

- 子供の表示名・種類の名前・固定の代わりの文言（「名前が分からない子供」「不明なお手伝い」）・U11 で入る理由は、**JSX の子として文字で出す**。`dangerouslySetInnerHTML` を使わない。ESLint の `react/no-danger` が `error` で入っている（`eslint.config.js` を読んで確かめた）ので、CI で落ちる
- 名前を `aria-label` や `title` に入れるときも、文字列として渡す（HTML に組み立てない）
- `<script>`・`<b>` を含む作り物の名前の画面のテストで、タグとして解釈されず文字として出ることを確かめる
- 画面は、エラーの応答の本文を表示しない（`ApiFailure` の `reason` から決まった文言を選ぶ。`client.ts` の既存の形）

## 権限と秘密の情報（NFR4.89、NFR5.16、NFR5.17）

### 権限と環境変数は足さない見込み（確かめた）

`infrastructure/lib/app-stack.ts` を読んで、`api` の Lambda の権限が U9 の読み取りに足りるかを確かめました。

| U9 の読み取り | 必要な操作 | `api` の既存の権限 |
|--------------|-----------|------------------|
| 認証（`getUserStatus`）、`findFamilyChild`、`findDisplayName`、本人の補い | `Users` の `GetItem` | あり（`dynamodb:GetItem`・`PutItem`・`UpdateItem`） |
| 家族の今いるメンバー | `Users` の索引 `familyId-index` の `Query` | あり（`dynamodb:Query`） |
| 家族の項目（`loadFamilyAndMembers`） | `Families` の `GetItem` | あり |
| 月の担当と状態 | `Calendar` の `Query` | あり（U5。`GetItem`・`Query` ほか） |
| 種類の一覧 | `ChoreTypes` の `Query` | あり（U4） |

- したがって、U9 で足す権限・環境変数・テーブル・索引・Lambda・指標・アラームは**ない**見込み。`line` の Lambda も変えない。`scheduled` は U10 が足す（U9 の時点で存在しない）
- CDK のテスト（`infrastructure/test/u9-allowance/stacks.test.ts`）に「U9 で差分がない」ことを入れる: `api` の権限の文、`line` の権限と環境変数、SSM のパラメータ、テーブル・索引・Lambda・ログのグループ・指標・アラームの数が、U9 の前後で変わらない。足りない権限が見つかったら、その差分だけを足し、テストの期待に入れる
- U9 のコードは書き込みの命令（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）を 1 回も送らない。単体テストで、DynamoDB のクライアントの差し替えが書き込みの命令を 1 回も受けないこと、`Scan`・`BatchGetItem` が 0 回であること（NFR4.89）。`api` の権限には書き込みが既にあるが、U9 は使わない

### 秘密の情報

- U9 で新しい秘密の情報は作らない。セッションの署名の秘密（SSM の `jwt/*`）は、これまでの形で `getConfig()` が読む。リポジトリ・テスト・ログ・応答に書かない
- LINE のチャネルのトークンとシークレットは、U9 では**読みも使いもしない**。`allowanceService`・`handlers/allowances/` は `lineApiService` を import しない。単体テストで `fetch` が 0 回であること（NFR5.16）
- テストの前提データ（筋書き、README の例）に、本物の LINE のユーザー ID・グループ ID・チャネルの秘密・トークン・表示名・実際の額を入れない。例の名前（太郎・花子・次郎）と金額は作り物の値で、`<作り物の値>` の目印を付けられる形にする。`U` と 32 文字の 16 進数の形の文字列を使わない（`.gitleaks.toml` の検査を CI で通す。NFR5.17）

## 脅威と備えの対応

| 脅威 | 備え | 関連 |
|------|------|------|
| 家族の外の人（ほかの家族、ログインしていない人、ブロック中の人）が額を見る | セッション → ブロック中 → 家族のメンバー → 月の形の順。読み取りはいつも `ctx.familyId` をキーにする。家族や子供を指す入力がない | NFR4.86、NFR4.87 |
| 月の指定を細工して、キーの組み立てや別の家族の月を読ませる | `current` か `YYYY-MM` の完全一致で検証してからキーを作る。家族はセッションから決める | NFR4.88 |
| HTTP から `role: system` を名乗って管理者向けでない窓口に入る | `requireMembership` は `admin`／`child` だけを作る。`SystemContext` は U10 の入口だけが作り、`handlers/**`・`entries/api.ts` は import しない。書き込みの窓口は `FamilyContext` のままで、`system` を型で断る | NFR4.90、NFR2.73 |
| 窓口に別の家族の ID や LINE の入力を渡して名前・時刻を読ませる | 窓口は `ctx.familyId` だけを使う。`findDisplayName` は表示名の文字列だけを返し、呼び出しは 1 か所で、同じ家族の担当に出てきた ID に限る | NFR4.90 |
| 応答に余分な内部の項目や管理者の情報が混ざる | 許可した項目だけを 1 つずつ書いて組み立てる。JSON の項目名を許可の一覧と完全一致で比べるテスト | NFR4.91 |
| 名前に仕込んだタグで画面が壊れる・実行される | 文字として出す。`react/no-danger` が CI で落とす | NFR4.92 |
| 額が端末のブラウザに残る | 200 の応答に `Cache-Control: no-store`（CloudFront は CACHING_DISABLED で無効化済み）。URL に額・名前を入れない | NFR4.92 |
| 失敗の返事から内部が分かる | 500 は決まった文。例外の文に名前・金額を入れない。異常なデータはログにだけ残す | NFR4.93 |
| ログから名前・額・LINE の ID が漏れる | ログの項目は ID と件数だけ。`LogData` の型が `displayName`・`name` を断る | NFR2.76 |
| 大量の呼び出しで費用や処理が膨らむ | 1 回の読み取りは約 5 回で、担当の数で増えない。`api` の同時実行の上限（U1 の NFR1.6）が効く。先読み・自動の読み直しをしない | NFR7.55、NFR1.38 |
| 書き込みの道が混ざって額が書き換わる | U9 は書き込みの命令を 1 回も使わない。額も回数も保存しない | NFR4.89 |
| 異常なデータの原因を探るために、本番のデータを手で書き換える | 手で書き換えない。調べるのはログ、直すのはアプリの操作かコード・手順 | NFR6.10 |

## Sources

- `construction/u9-allowance/nfr-requirements/security-requirements.md`（NFR4.86〜NFR4.93、NFR5.16、NFR5.17）、`reliability-requirements.md`（NFR2.73）、`observability-requirements.md`（NFR2.75、NFR2.76）、`tech-stack-decisions.md`（NFR8.19 の (d)）
- `construction/u9-allowance/functional-design/rules.md`（BR10.1、BR10.6〜BR10.8、BR10.13、BR10.19）、`functional-spec.md`（誰が何を見るか、契約への追加）、`entities.md`
- `inception/contract-design/contract-summary.md`（C1、C6〜C9、familyScope）
- `construction/u8-swap/nfr-design/security-design.md`（形の手本：権限を足さない書き方、許可した項目、脅威と備え）
- 既存コード（読んで確かめた）: `middleware/requireMembership.ts`（`FamilyContext` は `{ familyId, userId, role: Role }`、`Role` は `admin`／`child`。`requireMembership` が `NOT_FAMILY_MEMBER` を投げる）、`handlers/calendar/getCalendar.ts`・`params.ts`（`requireMembership` → `requireMonthParam` の順、`parseMonth` による形の確かめ）、`entries/api.ts`（振り分け表、`RouteResult` は `status` と `body` だけ、`REQUEST_ERROR` と 500 の決まった本文）、`lib/http.ts`（`json` は `content-type` だけ）、`lib/logger.ts`（`LogData` が `displayName`・`name` を型で断る）、`services/familyMemberService.ts`（`findFamilyChild`、`listMembers` の本人の補い）、`infrastructure/lib/app-stack.ts`（`api` の権限）、`eslint.config.js`（`react/no-danger: error`）。`Cache-Control` を付けているコードは見つからなかった

## Assumptions & Open Questions

- [assumption] **`ReadContext`／`FamilyScope`／`SystemContext` を `middleware/requireMembership.ts` に置く。** 置き場所と名前はコード生成で既存の並びに合わせて選べます。「書き込みの窓口は `FamilyContext` のまま」「`requireMembership` の戻りは変えない」の 2 点は守ってください。`FamilyContext` に `system` を足す案は、`ctx.userId` を使う多数の窓口の型が全部 `string | undefined` になるため採りません
- [assumption] `SystemContext` を作る関数は U10 の入口が持つので、U9 の時点では型だけが存在し、U9 のコードから `role: system` を作る箇所はテストの中だけです。U10 の nfr-requirements に、「`SystemContext` を `handlers/**`・`entries/api.ts` から import しない」ことを引き継ぎます
- [assumption] 成功（200）の応答だけに `Cache-Control: no-store` を付けます。エラーの応答（額も名前も入らない）には付けません。エラーにも付けたほうがよい場合は、`json()` の呼び出しを 1 か所足すだけで直せます
- [assumption] `json()` の戻りのヘッダー名を小文字の `cache-control` にします。Lambda の関数 URL はヘッダー名の大文字小文字を区別せず返す前提で、単体テストでは小文字で確かめます
- [assumption] `api` の権限が足りるというのは、`app-stack.ts` の文を読んだ結果です。デプロイした環境で実際に動くかは、ステージングの測定（NFR7.57）と画面の操作で確かめます
- [assumption] アクセス制御の確かめは、自動のテストで確かめられる範囲です。実際の攻撃への強さを保証するものではありません
- 子供が兄弟の額を見られることが望ましくない場合は、機能設計（BR10.1、Q5）の変更になり、このステージでは触れません。承認の場で人が確かめてください
