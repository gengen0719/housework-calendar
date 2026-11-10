# 単体テストの手引き — U8 代わりにやる

## テストの道具

U1〜U7 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。新しい道具は入れません。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node。`frontend` は jsdom だが、U8 は画面を足さないので使わない）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす。バックエンドの `include` は `test/**/*.steps.ts`
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`）。U8 で、項目が無いキーへの `UpdateItem`、`OR` を含む条件式、`SET` と `REMOVE` の同時の式、3 項目の取引の `CancellationReasons`、読み取りの記録（`hooks.readLog`）に対応しているかを Step 3 で確かめ、足りなければ評価の実装を足す（U1〜U7 のテストの期待は変えない）
- LINE の API は `fetch` の差し替え（`packages/backend/test/u8-swap/helpers/lineFetch.ts`）。Webhook の署名は、作り物のシークレットで計算した本物の HMAC で通す
- 並行数の制限は自前の小さな関数 `mapWithConcurrency`（依存を足さない）。LINE の SDK は入れない
- 日付は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）と `shared/jstDate.ts`。日付のライブラリは足さない

## 実行環境の確認の記録（Step 3、2026-11-10）
- 「この単位だけ」のコマンドが動くことを、空の筋書き 1 つ（偽の DynamoDB の `UpdateItem`〈項目が無いキー〉、`OR` 条件、`SET`＋`REMOVE`、3 項目の取引の評価）で確かめた（その筋書きは Step 4 で消した）
- 偽の DynamoDB に足したもの（`fakeDynamo.ts`。既存の期待は変えていない）: `hooks.readTargets`（`Get <表> <sk>`／`Query <表> <前置き>` の記録）、`hooks.forbiddenCalls`（申し出の項目 `SWAP#` への `PutItem`・`DeleteItem`、`BatchGetItem`、`BatchWriteItem` の見張り。呼ばれたら書かずに失敗）。`hooks.readLog`・`beforeTransaction`・`failTransaction` は U5 のものをそのまま使う
- U8 の補助: `packages/backend/test/u8-swap/helpers/`（`seed.ts`、`lineEvents.ts`、`lineFetch.ts`）

## この単位のテストの動かし方

U8 のテストは、すべてパスに `u8-swap` を含むフォルダに置きます（`packages/shared/test/u8-swap/`、`packages/backend/test/u8-swap/`、`infrastructure/test/u8-swap/`）。次のコマンドは U8 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u8-swap --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U8 のインフラのスタックのテスト（前後で同じことを固定）だけを動かすとき:

```bash
npx vitest run infrastructure/test/u8-swap/stacks.test.ts
```

1 つのファイルだけを動かすとき（筋書きは `.steps.ts` を指す）:

```bash
npx vitest run packages/backend/test/u8-swap/swap-accept.steps.ts
```

U1〜U7 の動きを壊していないこと（特に、U8 が直す U3 の `groupId` の期待〈`runGroupOperation` のログ〉と、U5・U7 の `notifyDutyReassigned` を呼ぶ筋書き）は、次のコマンドで確かめます（Batch 1 の Step 4 と、Batch 3 の Step 13）。

```bash
npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm
```

project 全体の確認は、次のコマンドで行います（各 batch の終わりと最後の Step 37 で実行）。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## テストの量（Standard）

部品ごとに 5〜8 件、単体に加えて主要な境界の結合テスト（筋書き）を書きます。筋書きは実装の前に書き、通るまで実装します（BDD。`team.md` の Testing Posture）。

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| `shared` の理由の印・文言（`OFFER_OWNER_ONLY`、見出し、案内、管理者・1 対 1 の文、知らせ・結果の文の関数） | 単体（`messages.test.ts`） | 5〜8 |
| LINE の上限の定数と文字数の計算（`LINE_LIMITS`、`SWAP_CHORE_NAME_MAX`、`SWAP_NOTICE_NAME_MAX`、`truncateForLine`） | 単体（`lineLimits.test.ts`） | 5〜8 |
| フックの並行化（`swap-hooks.feature`。上限 4・登録順・失敗しても続く・300 件・`DUTY_HOOKS_DONE`） | 筋書き | 約 12 場面 |
| `mapWithConcurrency`・`notifyDutyReassigned` の並行数（2〜5、型が変わらない） | 単体 | 各 5〜8 |
| 入口の表示名と `groupId` を出さないログ（`swap-gate.feature`。AC1.2.5。U3 のテストも確認） | 筋書き＋単体 | 約 8 場面＋5〜8 |
| 申し出の項目と取引の組み立て（`swap-transaction.feature`。作成・引き受け 3 項目・取り下げ・掃除・属性名の別名・`PutItem`／`DeleteItem` なし・競合） | 筋書き | 約 16 場面 |
| `swapRepository`（式の組み立て、キーの形、`classifyCancellation` の使い方） | 単体 | 各 5〜8 |
| 申し出られる担当の一覧（`swap-list.feature`。AC7.1.1〜AC7.1.3。並び順・今日を含む・JST の境・月またぎ・確定月） | 筋書き | 約 12 場面 |
| 申し出と取り下げ（`swap-offer-withdraw.feature`。AC7.1.4、AC7.1.8、AC7.1.9。判定の順・競合の差し込み・読み直し） | 筋書き（失敗の差し込み） | 約 20 場面 |
| 引き受け（`swap-accept.feature`。AC7.1.5〜AC7.1.7。先着・`origin=swap`・引き継ぎ・フックを呼ばない） | 筋書き（失敗の差し込み） | 約 18 場面 |
| 掃除とフックの登録（`swap-cleanup.feature`。AC7.1.10。読んだときの判定・300 件の確定・取り消しのあと） | 筋書き | 約 14 場面 |
| `isOfferValid`・`listSwappableDuties`・`offerSwap`／`acceptSwap`／`withdrawSwap`・`registerSwapHooks` | 単体 | 各 5〜8 |
| ログの出し方（`SWAP_*` 各 1 件・`SWAP_OFFER_CLOSED` は実際に閉じた分だけ・名前や ID を出さない） | 単体 | 5〜8 |
| 受け口の読み取りと送り元（`swap-line.feature`。完全一致・厳密な正規表現・署名・1 対 1／room・AC1.2.5・再送） | 筋書き | 約 22 場面 |
| 返事・役割（`swap-line-roles.feature`。AC7.1.1〜AC7.1.9。管理者・1 対 1・push なし） | 筋書き | 約 20 場面 |
| 失敗の扱い（`swap-line-resilience.feature`。書いたあとの reply 失敗・`INTERNAL`・500・並行の読み取り） | 筋書き | 約 14 場面 |
| `parseSwapMessage`／`parseSwapPostback`（`swapCommand.test.ts`） | 単体 | 各 5〜8 |
| 返事の組み立て（`buildSwapMessages.test.ts`。10 件・案内・文字数・`altText`・`data` の上限） | 単体 | 各 5〜8 |
| `swapHandler`（役割の分岐・reply 失敗の握りつぶし） | 単体 | 5〜8 |
| ボタンの色の差（`swapColors.test.ts`。独自に色を指定したときだけ） | 単体 | 5 |
| CDK のスタック（`u8-swap/stacks.test.ts`。前後で同じことを固定。追加なし） | 組み立ての確かめ | 約 16 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

- **安全のテスト（要件が求めるもの）:** 署名のない・書き換えた・秘密のヘッダーのない「家事交代」と `swap.accept` が DynamoDB も reply も使わず断られること（NFR4.74）、「家事交代」の完全一致と受け付けない例（「代わって」「かわって」「家事 交代」「家事交代して」、前後の零幅の空白、見た目だけ似た別の文字。NFR4.75）、`swap.*` の postback の厳密な正規表現（項目の重複・順序・エンコード・大文字・余分・300 文字超・1 対 1・`replyToken` なし。NFR4.76）、家族はグループから決めボタンの値で決めないこと・ほかの家族の `dutyId`／`offerId` の貼り付けが `NOT_FOUND`／`OFFER_GONE` で何も漏らさないこと（NFR4.77）、誰が何をできるか（管理者は申し出も引き受けもできない、本人以外は取り下げられない、引き受けた担当を子供がさらに申し出られる。NFR4.78〜NFR4.80）、申し出の項目が `UpdateItem`／取引だけで書かれ `PutItem`／`DeleteItem`／`Scan` が 0 回であること（NFR4.81）、返事に金額・UUID・LINE の ID を出さないこと（NFR4.83）
- **先着と競合（BR9.9、NFR2.54〜NFR2.57）:** 同時に押した 2 人のうち 1 人だけが成立し、もう 1 人は `OFFER_ALREADY_ACCEPTED`。取り下げ・担当の子供の変更・確定との競合は `OFFER_GONE`／`OFFER_ALREADY_ACCEPTED`。取引は全部か無しか（担当だけ・申し出だけが書かれた状態を作らない）。**同時は本物の並行で再現せず、`hooks.beforeTransaction` の差し込みで再現する**
- **読んだときの判定（BR9.8）:** 申し出が `open` のままでも、担当の version・状態・担当の子供・日付・月の確定のどれかが変わっていれば「なくなった」と扱うこと。フックが失敗・遅延・未登録でも結果が同じこと
- **フック（BR9.11、NFR3.15）:** 登録は `api`（`reassigned: true, recorded: true`）と `line`（`reassigned: false, recorded: true`）で 1 回ずつ。`notifyDutyReassigned` が 4 並行を超えず、300 件が 1 回ずつ呼ばれ、失敗しても残りが続く。引き受けはどのフックも呼ばない
- **返事は reply だけ（BR9.14、NFR1.32）:** `push`・`multicast`・`broadcast`・プロフィール取得への通信が 0 回
- **速さ（NFR7.39〜NFR7.49）と費用は、ここでは測らない。** 3 秒の目標（一覧は 20 回中 19 回以上、ほかは 95%）と、月の確定とフックの測定（確定の応答 3 秒、`DUTY_HOOKS_DONE` 1,000 ms、`WriteThrottleEvents` 0）は、ステージングで `docs/manual-check-u8.md` の確かめ 12・13 として行い、`build-and-test` に引き継ぐ。この単位のテストでは、DynamoDB の呼び出しの回数の上限（一覧: 月の Query 2＋種類 1。選ぶ・引き受ける: 担当の探索の `GetItem` 3＋申し出の `GetItem` 1＋種類の Query 1。書き込みは取引 1 回、読み直しを含めて 2 回まで）と、読み取りを並行に走らせること、外部への通信が reply 以外にないことを確かめる

## 期待するカバレッジ

- U8 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定（`thresholds.lines: 80`）は変えない
- 単位だけのコマンドでは、U8 のテストが通る範囲のカバレッジが出る。全体の下限の判定は `npm test` で行う

## 差し替え（モック）の方針

- 時刻: `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）で「今」を日本時間の指定の時刻に固定する。UTC の 15 時の前後（JST 23:59／0:00）、月末、年またぎ、うるう年（2/29）で作る。「今日以降」の境（今日の担当は申し出られる、昨日は申し出られない）、申し出の `createdAt`・`updatedAt`・`acceptedAt` が入口の `now` であること、日付の表示が日本時間になることを確かめる。使ったあとは `resetNow()`（筋書きは `AfterEachScenario`）
- DynamoDB: U1 の偽の DynamoDB（`fakeDynamo.ts`）を使う。申し出の `UpdateItem`（項目が無いキーから作る・`OR` を含む条件）、引き受けの 3 項目の取引の条件式（担当の `dutyId`・`version`・`status=todo`・`childUserId`、申し出の `status=open` かつ `offerId`、月の `buildMonthGuard`）を本当に評価し、取り消し（`TransactionCanceledException` と `CancellationReasons`）を項目ごとの Code で作る。`Scan`・`BatchGet`・`BatchWrite`、申し出の項目への `PutItem`／`DeleteItem` が呼ばれたら失敗にする見張りを置く
- 競合と失敗: 「読んだあとに別の書き込みが先に入った」状態を `hooks.beforeTransaction(n, fn)` で作る（申し出の作成の前に (a) 担当が変わる、(b) 月が確定される、(c) 別の申し出が入る。引き受けの前に (d) 別の子供が先に引き受ける、(e) 申し出が取り下げられる、(f) 管理者が担当の子供を変える）。n 回目の取引を `hooks.failTransaction(n, code)` で `TransactionConflict`・`ConditionalCheckFailed`・`ThrottlingError` で断る。本物の並行は使わない
- 名前: 子供の表示名は入口（`runGroupOperation`）が読んだ利用者の記録から取るので、LINE のプロフィール取得は差し替えず、**呼ばれたら失敗**にする。お手伝いの名前は C7（`choreTypeService.list`）を差し替え、失敗したときの言い換え（「だれか」「お手伝い」）も確かめる
- フック: `onDutyReassigned`／`onDutyRecorded` に関数を登録して確かめる。各テストの前に `resetDutyReassignedHooks()`・`resetDutyRecordedHooks()`・`resetSwapHooksForTest()` で空にする。300 件の筋書きは、開いた申し出 10 件・フックが投げる 2 件の組で、`SWAP_OFFER_CLOSED` 10 件、`DUTY_HOOKS_DONE` 1 件（`count`＝300、`failed`＝2、`concurrency`＝4）、`DUTY_HOOK_FAILED` 2 件を確かめる。同時に動く関数の数は、時間のかかる関数の中の同時実行カウンターで数える
- LINE: `fetch` の差し替えで reply の本文（メッセージの種類・`altText`・ボタンの `label`・`data`・本文の長さ）を集める。reply の失敗・時間切れを作る。reply 以外の宛先（`push`・`multicast`・`broadcast`・`/v2/bot/profile`）への呼び出しが 0 回であることを見張る。Webhook の署名は作り物のシークレットで計算した HMAC
- 入口（`entries/line.ts`）: `getConfig` は作り物の設定で差し替える。`verifyOriginHeader`・`verifyLineSignature`・二度処理しない記録（`lineEventRepository`）は U1 のまま通す。`accepts` が false のとき二度処理しない記録が書かれない（`begin` が 0 回）ことを確かめる
- ログ: `console` への出力を集め、子供・管理者の表示名・種類の名前・LINE のユーザー ID・グループ ID・reply トークン・postback の `data`・message の text・単価の値が含まれないこと、`GROUP_COMMAND_REJECTED` に `groupId` がないことを、成功・すべての断り・`INTERNAL`・思いがけない例外・返事の失敗・形の外れた入力の全部の分かれ道で確かめる。型のテストは `@ts-expect-error` で `DutyReassignedEvent`・`notifyDutyReassigned` の型が変わっていないことを確かめる
- 前提データ（functional-spec の範囲）: 担当（未・済・×、`origin` が rule／manual／swap、過去・今日・未来）、月の状態（確定／未確定／行なし）、種類（名前が長いものを含む）、お知らせ先のグループの登録、申し出の項目（`open`／`accepted`／`withdrawn`／`cancelled`、`dutyVersion` の一致・不一致）は、`helpers/seed.ts` で `Calendar` と `ChoreTypes` に直接置く
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「洗濯物たたみ」「ゴミ出し」「お風呂洗い」など。日付は「1/8 皿洗い」など（`stories.md` の例）
- 名前が長い・タグや改行を含む種類の名前と表示名を、文字数の上限の境目（上限ちょうど、上限 + 1、サロゲートペア）で作る。上限の数字は `LINE_LIMITS`（Step 1b で公式資料で確かめた値）から**計算**し、テストにも数字を直書きしない
- **作り物の値の決まり:** 担当の ID、申し出の ID（古いボタン用に 2 種類以上）、子供の ID、管理者の ID、ほかの家族の ID、LINE のユーザー ID・グループ ID・reply トークン、登録されていないグループの ID、`YYYY-MM` の月、署名の計算に使うチャネルのシークレット、鍵らしく見える値は、テストの中に直接書かず、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置いて import する。**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。** ESLint が直書きを止める。ログの伏せ字の確かめに使う作り物の目印（`<作り物の値>` の目印を付けた表示名・種類の名前）も同じ場所に置く。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く
- 署名つきの Webhook は、作り物のシークレットで計算した HMAC を `x-line-signature` に付ける（`helpers/lineEvents.ts`）。本物のチャネルのシークレット・トークンは使わない

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要。ステージングでの手での確かめ（14 件）と速さの計測は、この手引きの範囲外で、`docs/manual-check-u8.md` で行う
