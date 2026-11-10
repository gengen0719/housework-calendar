# 信頼性の設計（Reliability Design）— U9 お小遣いの額

U9（`u9-allowance`）の信頼性の要件（`nfr-requirements/reliability-requirements.md` の NFR2.67〜NFR2.73、NFR6.10、NFR11.10、NFR11.11）を、どう作るかを書きます。U9 は**読み取りだけ**で、何も書きません。取引の競合・二重実行・書き込みの途中失敗といった書き込みの論点はなく、論点は次の 5 つです。

1. 読み取りが 1 つでも失敗したら、**一部だけの額を返さず、全体を失敗にする**（NFR2.68）
2. 読んだ時点の「済」から、ずれなく額を計算する（NFR2.69）
3. ありえないデータがあっても画面を止めず、額を壊さない（NFR2.70）
4. 画面 S5 の月の移動で、古い応答が新しい画面を上書きしない（NFR2.72）
5. 日本時間の月の区切りで、どの月に入るかが決まる（NFR11.10、NFR11.11）

## 層の分け方（NFR8.19、ADR-U9-03）

`services/allowanceService.ts` を、**I/O を持たない純粋な関数**と、**読み取りを組み立てる窓口**に分けます。

```text
handlers/allowances/getAllowances.ts   … 薄い入口（requireMembership → 月の形 → 窓口。本文だけを返す。ヘッダー〔Cache-Control: no-store〕は entries/api.ts の振り分け表が付ける）
        │
        ▼
services/allowanceService.ts
  ┌ 窓口（I/O あり）
  │   getAllowances(ctx: ReadContext, month, options?)          → Allowance[]            （U10 が使う）
  │   getAllowanceMonthView(ctx: FamilyContext, month, now)     → AllowanceMonthView     （画面用 API が使う）
  │      └ どちらも内部の loadAllowances(...) を 1 回呼ぶ。読み取りの手順は 1 つだけ
  └ 純粋な関数（I/O なし。時計も DynamoDB も呼ばない）
      tallyDuties(duties, roleOf, choreIndex)  … 担当を 1 回走査 → 子供ごとの集計 + 未知の持ち主の集合 + 異常の記録
      assembleAllowances(tally, owners, members, choreTypes, adjustments, month) … 行・並び・合計 → Allowance[]
      deriveRange(familyCreatedAt, now)        … firstMonth / lastMonth / today（日本時間）
        │
        ▼ 読むだけ
calendarRepository.loadMonth / getMonthState   familyMemberService.loadFamilyAndMembers / findFamilyChild / findDisplayName
choreTypeService.list                          adjustmentSource（U11 の差し込み口。U9 の既定は何も読まない）
```

| 決め | 内容 |
|------|------|
| 窓口は 2 つ、手順は 1 つ | `getAllowances`（`Allowance[]` だけ。契約 C9）と `getAllowanceMonthView`（画面用。`confirmed`・`today`・`firstMonth`・`lastMonth` を添える）は、内部の `loadAllowances` が返した 1 つの結果から作る。画面用だけ別の読み取りを足さない。`getFamilyCreatedAt` と `isMonthConfirmed` も同じ結果から取る |
| `confirmed` | `loadMonth` の結果に含まれる月の状態（`S` の項目）から取る。`isMonthConfirmed(ctx, month)` は同じ `loadMonth` を使う窓口で、`allowanceService` は自分の `loadMonth` の結果を使い、`isMonthConfirmed` を**別に呼ばない**（Query を 2 回にしない）。読み取りの回数は NFR7.55 のとおり |
| 差し込み口 | `AdjustmentSource = (ctx, month) => Promise<ReadonlyMap<childUserId, AllowanceAdjustmentLine[]>>`。窓口の引数 `options.adjustments`（既定は空の Map を返す関数。何も読まない）。段 2 で他の 3 つの読み取りと**同時に**始める。子供ごとではなく家族の月ごとに 1 回で返す形にして、U11 が追加の段を作らず取り付けられるようにする（U11 の nfr-requirements に引き継ぐ。BR10.18） |
| 型 | `AllowanceMonthView`・`Allowance`・`AllowanceChoreLine`・`AllowanceAdjustmentLine` は `packages/shared/src/api-types.ts` に置き、画面と裏側で同じ型を使う（NFR8.19 の (c)） |
| 純粋な関数の入力 | `tallyDuties` は `roleOf: ReadonlyMap<userId, Role>`（メンバーから作る）と `choreIndex: ReadonlyMap<choreTypeId, number>`（種類の並びの位置）を受け取り、時計も DynamoDB も呼ばない。前提データだけで境界の場面（S14 の 0 円、S27〜S28 のマイナス、S30 の異常）を速く確かめられる |
| 失敗 | 窓口は例外を握りつぶさない。`NOT_FOUND` は `Result` で受け取る（`findFamilyChild`・`findDisplayName`）。それ以外はすべて投げる |

注: `tallyDuties` と `assembleAllowances` は同じファイルの中で `export` し、テストから直接呼びます（別ファイルに分けるのはコード生成で長くなりすぎたときだけ）。

## 読み取りだけの性質（NFR2.67）

- 書き込みの命令（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）を 1 回も呼ばない。額も回数も保存せず、モジュールの変数やキャッシュにも持たない（`scalability-design.md`）。`Idempotency-Key` は要らない
- その間に記録・状態の変更・代わりにやる・確定が入らなければ、同じ要求は同じ答え（並びも決まった順。NFR2.71 の (f)）
- 確かめ: 単体テストで、同じ要求を 2 回送って同じ答えになること。書き込みの命令が 0 回であること。記録 → 読み → 取り消し → 読み、で 400 円 → 300 円に戻ること（S6、S7）

## 失敗は全体を投げる（NFR2.68、ADR-U9-03）

「一部だけの額」は、親が見ると**本当の額に見える**ので、最も危ない失敗です。読めなかった読み取りは、代わりの値で補わず、全体を失敗にします。

| 読み取り | 失敗したとき | 理由 |
|---------|------------|------|
| 月の Query（続きのページを含む。途中のページの失敗も） | 窓口が投げる → 画面用 API は 500 `INTERNAL` | 1 ページ目だけの額を返さない |
| `loadFamilyAndMembers`（Families、Users 索引、本人の補い） | 同上 | 「読めなかった子供は 0 円」にしない |
| 種類の `list` | 同上 | 「読めなかった種類は名前なし」にしない。種類が一覧に**ない**こと（異常なデータ。NFR2.70）と、一覧が**読めない**こと（失敗）は別 |
| `findFamilyChild`（`NOT_FOUND` 以外の例外） | 同上 | `NOT_FOUND` は結果。それ以外は失敗 |
| `findDisplayName`（`NOT_FOUND` 以外の例外） | 同上 | `NOT_FOUND` は「名前が分からない子供」（BR10.19）。ほかの例外は失敗 |
| 家族の作成時刻（`loadFamilyAndMembers` の `family`） | 同上 | 家族の記録が見つからないときは既存の `listMembers` と同じ投げ方（`familyId` だけを含む文） |
| 差し込み口（U11） | 同上 | 加算・減額が読めないまま合計を返さない |

| 決め | 内容 |
|------|------|
| 並行の組み方 | 段 2 は `Promise.all`。1 つが拒否されたら全体が拒否される。残りの Promise は `Promise.all` が既に購読しているので、「未処理の拒否」は出ない。`settle` は使わない（失敗を保留する必要がないため） |
| 抜けた子供 | 連なりのどれかが投げたら全体が投げる。`mapWithConcurrency` の `worker` は `try/catch` で包まない（U8 のフックと違い、ここは握りつぶさない）。**失敗のあとは、ほかの連なりが新しい項目を取り出さない**（`lib/promise.ts` の失敗の旗。`performance-design.md` の「並行の道具」）ので、応答のあとに余分な `findFamilyChild`／`findDisplayName` が増えない（すでに始まっている呼び出しだけが終わるまで走る） |
| ログ | 失敗した要求では `ALLOWANCE_COMPUTED` と異常の行を**出さない**。失敗は既存の `REQUEST_ERROR`（`describeError`）に残る（`observability-design.md`）。異常の行は計算が最後まで成功したあとにまとめて出す |
| 窓口と画面用 API | 窓口は投げる（U10 が送る前に失敗に気づく。BR10.17）。画面用 API は `entries/api.ts` の既存の `catch` で 500 `INTERNAL`（決まった文）にする。応答に `allowances` は空でも入れない |

確かめ: 単体テストで読み取りを 1 つずつ失敗させ、(1) 窓口が例外を投げ、(2) 画面用 API が 500 `INTERNAL` で `allowances` を含まないこと。月の Query を 2 ページに分け、2 ページ目で失敗させたとき、1 ページ目だけの額が返らないこと。`findDisplayName` が `NOT_FOUND` のときは 200 で「名前が分からない子供」、別の例外のときは 500 になること。

## ずれのない額（NFR2.69）

- **強い整合性**: 月の Query（`loadMonth`）は `ConsistentRead: true`（既存。読んで確かめた）。記録・取り消し・やらなかった・済にする・代わりにやるの**直後に読み直せば**、その時点の「済」だけが数に入る（AC5.1.13）
- **1 回の要求の計算は 1 回の月の読み取りの結果だけから行う**。同じ担当を 2 回読まない。ページが複数のときのずれ（ページの間に記録が入る）は許容する（300 件で 1 ページのため通常は起きない）
- **式を守る**（`assembleAllowances` の中の 1 か所）:

```ts
const amount = unitPrice * count;                         // 整数 × 整数
const total = lines.reduce((s, l) => s + l.amount, 0)
            + adjustments.reduce((s, a) => s + a.amount, 0); // マイナスをそのまま返す。Math.max(0, …) を書かない
```

- `count` は 1 以上の整数（0 の行は作らない）。金額はすべて整数。計算の中で 0 円以上に直さない（BR10.5）。`Number.isSafeInteger` の範囲に収まる前提（家族 4 人・300 件）で、桁あふれの確かめは足さない（NFR8.18）
- **結果整合の遅れ**（Users 索引）: 記録のある子供が索引にまだ出ないときは、担当の持ち主として「未知の持ち主」に入り、`findFamilyChild` で強い整合性に確かめて `current: true` の行にする（BR10.6）。許容する差は、家族に入った直後の子供が、記録もないまま数秒だけ行に出ないこと
- 確かめ: 単体テストで、さまざまなデータ（単価 0 円、単価の変更、種類 10 個、子供 10 人、減額で合計がマイナス）で、子供ごとに `total` が行の和と一致し、すべての金額が整数で、マイナスが 0 円にそろわないこと（S27、S28）。索引に出ない子供に記録があるとき、行が出ること

## ありえないデータの扱い（NFR2.70、NFR2.75、ADR-U9-07）

`tallyDuties` が「済」の担当を 1 つずつ見るとき、**次の順**で判断します。1 つの担当が当てはまる異常は多くても 1 種類です。

| 順 | 条件 | 扱い | ログ（warn） |
|----|------|------|-------------|
| 1 | `status !== 'done'` | 読み飛ばす（単価が入っていても数えない） | なし |
| 2 | `unitPrice` が `undefined` か `null` | **数えない** | `ALLOWANCE_DUTY_WITHOUT_PRICE`（`familyId`、`dutyId`） |
| 3 | 持ち主が管理者の ID（`roleOf` が `admin`） | 行を作らない。`findFamilyChild`・`findDisplayName` を呼ばない | `ALLOWANCE_DUTY_OWNER_NOT_CHILD`（`familyId`、`dutyId`） |
| 4 | 種類が一覧にない | **数える**（金額は担当の `unitPrice`）。名前は「不明なお手伝い」で、内訳の最後に並べる | `ALLOWANCE_CHORE_TYPE_MISSING`（`familyId`、`choreTypeId`。同じ種類は 1 要求につき 1 行） |
| － | `unitPrice` が 0 | **有効な値**。「0円 x N回 = 0円」の行を出す | **残さない**（S14） |

- 異常があっても 200 を返し、ほかの子供・ほかの行の額は変わらない。画面に注意書きは出さない（通常の書き込みでは起きない前提。起きたときは額が実際より少なく見えうる）
- `unitPrice` が整数でない・負などの `undefined`／`null` 以外の不正な値は、U4・U6・U7 の入力の確かめで作られない前提で、追加の確かめを足さない（コード生成で U4 の単価の確かめを読み、前提を確かめる）
- 異常の行の出し方（20 行の上限、`anomalyCount`）は `observability-design.md`

## 空・0 円・端の場面（NFR2.71）

| 場面 | 結果 | 作り |
|------|------|------|
| 記録のない今いる子供 | 行は出る。`lines`・`adjustments` が空で `total` が 0 | 今いる子供は、集計に出てこなくても必ず `Allowance` を作る |
| 子供がひとりもいなくて、その月の記録もない | `allowances` は空（200） | 空の配列を返す |
| 家族の作成より前の月、未来の月、`firstMonth`〜`lastMonth` の外の月 | 200（計算して返す） | 範囲は見せ方の決まり。裏側は断らない |
| 月の状態の行がない月 | `confirmed` は false | `loadMonth` の結果に `S` がなければ false |
| 抜けた子供でその月の「済」がない | 行を出さない | 担当の持ち主から行を作るため、担当がなければ出ない |
| 並び | 今いる子供は家族に入った順（`loadFamilyAndMembers` の順の子供だけ）、続いて索引に遅れて出ていない今いる子供、続いて抜けた子供（表示名、`userId` の順）。内訳は種類の並び、同じ種類では単価の低い順 | `compareText`（UTF-16 の順。ロケールに左右されない。`familyMemberService` の既存の関数）で比べる |

- 「索引に遅れて出ていない今いる子供」（`findFamilyChild` が成功した持ち主）の位置は、今いる子供の後ろ・抜けた子供の前とし、表示名・`userId` の順に並べる（機能設計に位置の指定がなく、設計で決めた）
- 名前が読めない抜けた子供（「名前が分からない子供」）は、その固定の文言を表示名として並べる

## `role: system` から呼ばれても動く（NFR2.73、ADR-U9-01）

- `getAllowances(ctx: ReadContext, month)` は `{ familyId, role: 'system' }` でも、家族の全員分の `Allowance[]` を返す。管理者である必要はない
- `loadFamilyAndMembers` の本人の補い（`Users` を強い整合性で読んで足す）は、`ctx.role !== 'system'` のときだけ呼ぶ。`ctx.userId` を型で絞ってから読むので、`undefined` の ID で読むことはない
- U10 は送る前に失敗に気づける（窓口は投げる）。U9 は可用性の数値目標を置かない（NFR2：稼働率の数値目標はない）
- 型の変更は `security-design.md` の ADR-U9-01 のとおり。確かめ: `role: system` の ctx で (1) 家族の全員分が返る、(2) 本人の補いの `GetItem` が 0 回、(3) 読み取りを失敗させると例外を投げる（S34）。`tsc` と既存のテストが無修正で通る

## 画面 S5 の月の移動（NFR2.72、NFR1.38、ADR-U9-06）

画面は、**1 つの作り**に決めます。`hooks/useAllowanceMonth.ts` を新しく作ります（U5 の `useMonthCalendar` と同じく `AbortController` で古い要求を取り消し、さらに連番で古い答えを捨てる。決定は ADR-U9-06 と下の「決定: 新しい要求を出すとき、古い要求を取り消す」）。

### 状態と決まり

| 項目 | 決め |
|------|------|
| 状態 | `loading`／`ready`（答えを持つ）／`error` の 3 つ（機能設計の S5 の状態図） |
| 目標の月 `target` | 画面が「見たい月」。最初は S1 から開くとき `monthOfDate(MonthCalendar.today)`、直接開くとき文字列 `'current'`。**答えの `month` で置き換えるのは、`target` がまだ `'current'` のとき（最初の答えだけ）**。それ以外では答えが `target` を書き換えない（押しで決めた目標は、遅れて届いた答えで失われない） |
| 範囲 `range` | 直近の答えの `firstMonth`・`lastMonth`。読み込み中も保持する。最初の答えの前は範囲が未知なので、[<] [>] は**無効**にする |
| ボタン | 範囲が分かったあとは、**読み込み中も押せる**。無効にするのは、`target` が `firstMonth`（[<]）／`lastMonth`（[>]）に達したときだけ。無効は `disabled`（押せないだけでなく読み上げにも伝わる。NFR9.11） |
| 最初の読み込み・読み直し | 待ち時間なしで**すぐ**要求する（debounce は月の移動の押しだけ） |
| 月の移動 | 押すたびに `target` を範囲内で 1 か月ずつ動かし、状態を `loading` にする。最後の押しから **250 ms** 静まったら `target` の月で 1 回だけ要求する。途中の月は要求しない |
| 連番 `seq` | **要求を出すとき（`issue`）と、[<] [>] を押すとき（`go`）の両方で進める**。答え（成功も失敗も）は、その要求の番号が `seq` の現在の値と等しいときだけ描く。押した時点より前に出した要求の答えは、デバウンスの待ち時間の間に届いても**捨てる**（画面は `loading` のまま、`target` も変えない） |
| 「飛んでいる要求」 | 番号が最も新しい要求のこと。ただし `go` が `seq` を進めたあとは、それ以前の要求は答えを捨てられる要求なので、飛んでいる要求とは数えない。**取り消された（abort された）要求も、飛んでいる要求とは数えない**（NFR1.38(d)、NFR7.53(c)、BR10.12）。`issue` は、最新の番号の要求が `seq` と等しく（押しがその後にない）、かつ**その月が `target` と同じときだけ**、重ねて出さずその答えを待つ。それ以外は新しい番号の要求を出す。この重ね出しの抑止が効くのは、最初の読み込みの二重の呼び出し（開発時の再実行など）と「読み込み直す」の連打で、月の移動の押しのあとは必ず新しい要求になる（1 回の静まりにつき要求は 1 回） |
| 月を移している間 | 直前の月の内容を残さず `loading`（`role="status"`）を出す |
| 読み直し | 失敗のときの「読み込み直す」。`target` の月ですぐ要求する（同じ月でもう一度）。何も書いていないので二重に何かが起きない |
| 自動の読み直し | しない（タイマー・`visibilitychange` を使わない。NFR1.38） |
| 後片付け | 画面を離れたとき、タイマーを消し、連番を進めて、飛んでいる答えを捨てる |

```ts
// hooks/useAllowanceMonth.ts（形の目安。リクエスト関数は authorized(token => getAllowances(token, month, signal)) を使う）
const issue = (month: string) => {
  const latest = inFlight.current;
  if (latest && latest.seq === seq.current && latest.month === month) return;  // 押しのあとでなく、最新の要求の月と同じなら重ねない
  latest?.controller.abort();                           // 古い要求を取り消す（通信は常に 1 本）
  const mine = ++seq.current;
  const controller = new AbortController();
  inFlight.current = { seq: mine, month, controller };
  run(month, controller.signal).then(
    (value) => {
      if (mine !== seq.current) return;                 // 古い番号（押しのあとの答えも含む）は捨てる
      inFlight.current = null;
      range.current = rangeOf(value);
      if (target.current === 'current') target.current = value.month;  // 最初の答えだけ。以後は答えで target を書き換えない
      setState({ kind: 'ready', value });
    },
    () => { if (mine === seq.current) { inFlight.current = null; setState({ kind: 'error' }); } },
  );
};
const go = (delta: number) => {                       // [<] [>]
  target.current = clampMonth(shiftMonth(target.current, delta), range.current);
  ++seq.current;                                      // 押した時点より前の要求の答えを捨てる
  setState({ kind: 'loading' });
  clearTimeout(timer.current);
  timer.current = setTimeout(() => issue(target.current), 250);
};
```

### 場面ごとの動き

| 場面 | 動き |
|------|------|
| 2 月の要求（番号 1）が飛んでいる間に [>] を押して 3 月（B）にし、**タイマー（250 ms）の前に**2 月の答えが届く | 押したときに `seq` が 2 に進んでいるので、番号 1 の答えは**捨てる**。`target` は 3 月のまま、画面は `loading` のまま。タイマーが鳴ると番号 3 の 3 月の要求を出し、その答えを描く。2 月を描かず、2 月を再び要求しない（S32） |
| 2 月の要求（番号 1）が飛んでいる間に 3 月へ移し、タイマーが鳴ったあとに 2 月の答えが遅れて届く | 番号 3 の 3 月の要求が飛んでいる。番号 1 は古いので**捨てる**。3 月の答えが先に届けば描く。3 月のまま（S32） |
| 2 月の要求（番号 1）が飛んでいる間に [>] [<] で 2 月に戻る（タイマーの前に 2 月の答えが届く場合を含む） | 押すたびに `seq` が進む（1 → 2 → 3）ので、番号 1 の答えは捨てる。静まったあと、`issue` は最新の要求（番号 1）が `seq` と等しくないので、**新しい番号 4 の 2 月の要求を 1 回**出して描く。静まりの 1 回につき要求は 1 回で、押した回数に比例して増えない |
| 2 月の要求が飛んでいる間に 3 月の要求も出し、2 月へ戻る | 番号 3 の 3 月の要求のあと [<] を押すと `seq` が 4 に進む。番号 1・3 の答えは捨てる。静まったあとに番号 5 の 2 月の要求を出し、その答えだけが描かれる |
| 「読み込み直す」を押す、または最初の読み込みが二重に呼ばれる | 押しがないので、最新の要求の月が `target` と同じなら重ねず、その答えを待つ（失敗後は `inFlight` が空なので、同じ月でもう一度要求する） |
| 月を 5 回続けて押す（250 ms 未満の間隔） | 最後の押しの 250 ms 後に、最新の目標の月で 1 回だけ要求 |
| 失敗 | `error`。「表示できませんでした。もう一度お試しください」（`role="alert"`）と「読み込み直す」。額は描かない。401 は画面の共通の扱い（ログインし直し）、403 `NOT_FAMILY_MEMBER` は「このアプリは家族のメンバーだけが使えます」、422 は「月の指定が正しくありません」 |
| 端末の時計 | 使わない。最初の月は S1 の `today` か `current`、以後の「今日の月かどうか」（「今月の記録は…」の切り替え。BR10.10）は答えの `today` の月と答えの `month` を比べて決める |

### 決定: 新しい要求を出すとき、古い要求を取り消す（ADR-U9-06、選択肢 (b)）

- `issue` が新しい要求を出すとき、まだ残っている古い要求を `AbortController` で取り消す。通信（wire）に載る要求は常に 1 本になる。画面を離れるときも、飛んでいる要求を取り消す
- 取り消された要求は拒否（`AbortError`）で終わる。その番号は `seq` より古いので、拒否は無視され、エラー表示にしない
- **取り消された（破棄された）要求は「飛んでいる要求」に数えない**。NFR1.38(d)・NFR7.53(c)・BR10.12 の「同じ月の要求が飛んでいる間は重ねて出さない」は、取り消されていない最新の要求だけを指す。要求の数え方は「出した要求の数」で、取り消した要求も 1 回に数える（月を移す 1 回の静まりにつき、出す要求は 1 回）
- 理由: 通信と DynamoDB の読み取りを無駄にしない（NFR1.37、NFR1.38）。U5 の `useMonthCalendar` と作りがそろう。連番による捨て方は残す（取り消しが間に合わず答えが届く場合の備え）
- 却下: 取り消さず連番だけで捨てる（遅い古い要求が通信に残り、同時に複数本が走る）
- 確かめ: 画面のテストで、差し替えた時計（`vi.useFakeTimers`）と手で解決できる Promise を使い、上の表の場面を 1 つずつ作る（S32）。**特に「要求 A が飛んでいる間に [>] を押し、タイマーが鳴る前に A の答えを解決する」場面で、(1) A が描かれない、(2) `target` が B のまま、(3) タイマーのあと B の要求だけが 1 回出る（A の再要求がない）、(4) [>] [<] で A に戻した場合は静まりのあとに A の要求が 1 回だけ出る、(5) 新しい要求を出した時点で A の `signal` が取り消されており（`aborted` が真）、取り消された A はエラー表示にならず、呼び出しの数には「出した要求」として 1 回数えられる、(6) 通信中の要求が同時に 1 本を超えない、ことを確かめる。**各エラーで額が描かれないこと。時間が経っても要求が増えないこと（タイマーを 10 分進める）。端末の時計を 1 年ずらしても、開く月・無効になるボタン・文言の切り替えが答えの値だけで決まること（NFR11.11）

## 日本時間（NFR11.10、NFR11.11）

- **「今」は要求の入口で 1 回だけ**取る（`entries/api.ts` の `now: new Date()`。画面や端末の時計、LINE のイベントの時刻は使わない）
- `month=current` は `monthOfDate(jstDateOf(now))` に置き換える（`handlers/allowances/params.ts`）。答えの `month` には実際の `YYYY-MM` を入れる。`today` は `jstDateOf(now)`、`lastMonth` は `shiftMonth(monthOfDate(today), 1)`（12 月の翌月は翌年 1 月）、`firstMonth` は `monthOfDate(jstDateOf(new Date(family.createdAt)))`（UTC の作成時刻を日本時間の月にしたもの）。日付の計算は `packages/shared/src/jstDate.ts` の既存の関数（`jstDateOf`・`monthOfDate`・`shiftMonth`）を使う（新しい日付の計算を書かない。NFR8.10）
- **額に入る月は担当の日付 `date` の月**で決める。担当は月ごとの項目（`M#<month>#D#…`）に入っているので、`loadMonth(familyId, month)` は `date` の月と一致する。記録した時刻 `recordedAt`（UTC）の月ではない（BR10.2）
- 確かめ（時計を差し替えたテスト）: (1) `2027-01-31T14:59:59.999Z` に `current` が `2027-01`、`2027-01-31T15:00:00.000Z` に `2027-02`。(2) 12 月の `lastMonth` が翌年 1 月、うるう年の 2 月 29 日の `today`、2 月の `lastMonth` が 3 月。(3) 家族の作成時刻 `2026-10-31T15:00:00.000Z` の `firstMonth` が `2026-11`、`2026-10-31T14:59:59.999Z` が `2026-10`。(4) 12 月 31 日の担当を 1 月 2 日に記録すると 12 月の額に入り、1 月に入らない（S15）。(5) 1 月 31 日 23:59 と 2 月 1 日 0:00（日本時間）の担当が、1 月と 2 月に 1 件ずつ入る（S16）
- 画面を開いたまま月をまたいでも、自動では切り替えない。要求も出ない

## データ（NFR6.10）

- 担当の状態と `unitPrice` は、アプリの操作でだけ変わる。**U9 は直す手段を持たない**。U9 のコードに、データを直す処理（書き込み、移行、掃除）を書かない
- 異常なデータ（NFR2.70）を見つけたときは、ログ（`ALLOWANCE_*`）で原因を調べ、直すのはアプリの操作（取り消し、状態の変更、確定の取り消しなど）か、手順やコードとして用意して通常の流れで反映する。本番のデータを手で書き換えない
- U9 のテスト・測定（NFR7.57）のデータも、アプリの操作（画面の割り当て・記録・「済にする」・LINE の操作）で作る。測定の記録に、データの作り方を「画面と LINE の操作」と書く
- 本番のテーブルの `RemovalPolicy.RETAIN`（既存）は変えない。CDK のテストで、U9 の前後にテーブルの設定が変わらないこと

## 反映と元に戻し方（NFR10.11、NFR10.12）

- U9 は新しい環境ごとの設定（公式アカウント・チャネル・SSM パラメータ・リッチメニュー）を足さない。LINE に何も送らないので、**LINE の無料のメッセージ数の枠や、環境ごとの公式アカウントの用意とは関係がない**。ステージングと本番の違いは U1 の `api` の環境変数（テーブル名・SSM の接頭辞・`ENV`）で吸収される
- 反映は通常の流れ: `main` に取り込むとステージングに自動で反映し、本番は作り手がステージングで確認してから反映する。確認の中身は、NFR7.50〜NFR7.52 の測定と、AC8.1.1〜AC8.1.4・AC5.1.13 の動き（記録した直後に額が増える、取り消すと戻る）を画面から行うこと
- 元に戻すときは、前の版のコードを通常の流れで再び反映する。**データの移行も削除も要らない**（U9 は何も書かず、新しい保存先もない）。前の版に戻すと、S1 の「お小遣い」の入口と S5 の画面、`GET /months/{month}/allowances` が消えるだけ
- 応答の形の置き換え（`Allowance[]` から `AllowanceMonthView`）は、まだ誰も使っていない入口なので、元に戻しても使う人への影響がない。**順序の注意**: U10 が `getAllowances` を使い始めたあとに U9 だけを戻すと U10 が壊れるため、U10 を先に戻す
- `RouteResult` の任意の `headers` と `lib/promise.ts` への `mapWithConcurrency` の移動は、既存の入口・U8 のフックの動きを変えない（既存のテストが無修正で通ることで確かめる）。戻すときも同じ流れで元に戻る

## 残る危険（承認の場で人が決めること）

| 危険 | 内容 | 備え |
|------|------|------|
| 異常なデータで額が実際より少なく見える | 画面に注意書きを出さない（BR10.13）。ログでしか分からない | `ALLOWANCE_*` を検索できる形で残す。作り手への 15 分以内の知らせは U10 が入れる。それまでは作り手が CloudWatch Logs で検索して気づく |
| ページが複数に分かれた月でのずれ | 300 件で 1 ページのため通常は起きない | 許容する（NFR2.69） |
| 索引の遅れ | 家族に入った直後の子供が、記録もないまま数秒行に出ない | 許容する（BR10.6）。記録があれば強い整合性で補う |

## Sources

- `construction/u9-allowance/nfr-requirements/reliability-requirements.md`（NFR2.67〜NFR2.73、NFR6.10、NFR11.10、NFR11.11）、`tech-stack-decisions.md`（NFR8.19、NFR10.11、NFR10.12）、`observability-requirements.md`（NFR2.75）、`scalability-requirements.md`（NFR1.38）、`performance-requirements.md`（NFR7.55、NFR7.56）
- `construction/u9-allowance/functional-design/functional-spec.md`（F1〜F5、S5 の状態図、シナリオ S2〜S35）、`rules.md`（BR10.2〜BR10.8、BR10.10、BR10.12〜BR10.14、BR10.17〜BR10.19）、`entities.md`
- `inception/contract-design/contract-summary.md`（C8、C9、C6）
- `construction/u8-swap/nfr-design/reliability-design.md`（形の手本）
- 既存コード（読んで確かめた）: `repositories/calendarRepository.ts`（`loadMonth` は強い整合性で続きのページを読む）、`services/familyMemberService.ts`（`listMembers` の並び順、`compareText`、`joinedAtOf`、本人の補い、`findFamilyChild`）、`lib/promise.ts`（`settle`）、`services/dutyReassignedHook.ts`（`mapWithConcurrency`）、`entries/api.ts`（`now` を入口で 1 回、`catch` で 500）、`hooks/useMonthCalendar.ts`（`AbortController` による既存の月の移動）、`packages/shared/src/jstDate.ts`（`jstDateOf`・`monthOfDate`・`shiftMonth`）

## Assumptions & Open Questions

- `confirmed` を `loadMonth` の結果から取る形は、`repositories/calendarRepository.ts` の `MonthItems`（`assignment?`・`state?`・`duties`）と `loadMonth` が `sk` の末尾 `S` を `state` に入れる実装を読んで確かめました。`state.confirmed` の項目名はコード生成で `MonthStateRecord` を読んで合わせます（名前が違っても回数の上限は変わりません）
- [assumption] 「索引に遅れて出ていない今いる子供」の並びの位置（今いる子供の後ろ・抜けた子供の前）は、機能設計に指定がなく、設計で決めました。BR10.6 の並びの趣旨（今いる子供が先）に沿います
- [assumption] 範囲が未知の間（最初の答えの前）に [<] [>] を無効にする判断は、機能設計の「読み込み中も押せる」と食い違わないと読みました（範囲の端が分からないため、押しても動かせない）。最初の答えの前から押せるべきなら、承認の場で指示してください
- [assumption] 画面で古い応答を捨てる方法は連番に決めました（NFR2.72）。`AbortController` で、新しい要求を出すときに古い要求を取り消す（選択肢 (b)。通信を 1 本にする）ことも決めました
- [assumption] `unitPrice` が整数でない・負などの不正な値は追加で確かめない前提を引き継ぎます。確かめられなければ、数えない異常として扱うかを承認の場で決めてください
- [assumption] 稼働率の数値目標は置かない（NFR2）ので、U9 は可用性の SLO を決めません。失敗は 500 のログに残り、作り手への 15 分以内の知らせは U10 が入れます
