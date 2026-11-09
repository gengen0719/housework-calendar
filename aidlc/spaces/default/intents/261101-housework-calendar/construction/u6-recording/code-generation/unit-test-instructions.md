# 単体テストの手引き — U6 記録

## テストの道具

U1〜U5 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。新しい道具は入れません。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす。バックエンドと画面の `include` は `test/**/*.steps.ts`（画面は `*.steps.tsx`）
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`。U5 で `Calendar` の表を追加済み）、画面は `@testing-library/react`
- 日付は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）と `shared/jstDate.ts`。日付のライブラリは足さない

## この単位のテストの動かし方

U6 のテストは、すべてパスに `u6-recording` を含むフォルダに置きます。次のコマンドは U6 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u6-recording --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U6 が直す U1・U4 のインフラの既存テスト（`infrastructure/test/u1-skeleton-family/stacks.test.ts`、`infrastructure/test/u4-chore-types/stacks.test.ts`、`infrastructure/test/u5-assignment-calendar/stacks.test.ts`）だけを動かすとき:

```bash
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts infrastructure/test/u5-assignment-calendar/stacks.test.ts
```

1 つのファイルだけを動かすとき（筋書きは `.steps.ts` を指す）:

```bash
npx vitest run packages/backend/test/u6-recording/record-do-line.steps.ts
```

U1〜U5 の動きを壊していないことと、project 全体の確認は、次のコマンドで確かめます（各 batch の終わりと最後に実行）。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| `shared` の型・理由の印・文言（記録の追加分） | 単体 | 5〜6 |
| `lib/promise.ts`（`settle`） | 単体 | 5 |
| LINE の記録（「やった」→選択肢。`record-list.feature`） | 筋書き | 約 10 場面 |
| LINE の記録（選択肢→記録。`record-do-line.feature`） | 筋書き | 約 12 場面 |
| 選択肢の選び直し・二重押し・古いボタン（`record-resilience.feature`） | 筋書き（失敗の差し込み） | 約 16 場面 |
| 画面用 API からの記録（`record-api.feature`） | 筋書き | 約 15 場面 |
| 画面の記録（確認ダイアログ→記録。`calendar-record.feature`、`record-confirm-dialog.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 約 19 場面 |
| 単価の書き写しと競合・失敗（`record-resilience.feature`） | 筋書き（失敗の差し込み） | 約 12 場面 |
| `oneToOneGate`（1 対 1 の入口、本人・管理者・家族外の区別） | 単体 | 5〜8 |
| `recordCommand`（data の厳密な形の確かめ、`source.type=user`、`replyToken`） | 単体 | 5〜8 |
| `recordingService`（取引の形・断られたときの読み直し・二重押しの順番・1 回だけのやり直し） | 単体 | 8 |
| `calendarRepository`（記録の Update の条件・単価の確認・属性名の置き換え・`CancellationReasons`） | 単体 | 8 |
| 記録のトランザクション（3 項目、同じ項目を 2 回触らない） | 単体 | 5 |
| `dutyRecordedHook`（書けた 1 回だけ呼ぶ、投げても結果を変えない） | 単体 | 5 |
| 画面用 API の入口（`POST /v1/duties/:dutyId/record` の検証の順番） | 単体 | 5〜8 |
| ログの伏せ字と型（LINE のユーザー ID・名前・トークン・data・単価を出さない） | 単体 | 5 |
| 画面の部品（`RecordConfirmDialog`、`client` の記録呼び出し、`DayDetail` の「やった」） | 単体 | 各 5〜8 |
| テーマ（コントラスト、押す場所。追加分） | 単体 | 5 |
| CDK のスタック（`u6-recording/stacks.test.ts`。`line` の権限 2 文・環境変数 2 つ、足さないもの、変えない項目） | 組み立ての確かめ | 約 14 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

- **安全のテスト（要件が求めるもの）:** 本人の担当だけ記録できること、管理者・家族外には本人にだけ案内を返すこと、ほかの家族・ほかの子供の担当は 404 または決まった文、グループには送らないこと、署名と秘密のヘッダー、data の厳密な形、`source.type=user` だけ、転送・貼り付けで同じ data のボタンを押された場合、古いボタンの再利用の防止（`version` の条件）。すべて筋書きの中に入れる
- **二重押し（BR7.8）:** 同じイベントの再送・2 回押し・同時の要求のどれでも記録は 1 件のままで、`recordedAt` と `unitPrice` は最初の値を保つことを確かめる。「本人が記録済み」の判定が `version` の比べより先であることを確かめる
- **速さ（NFR7.25〜NFR7.32）と費用の最初の請求は、ここでは測らない。** 3 秒の目標は、ステージングで 20 回ずつ（コールドスタートを含む。日や家族を分けて用意する）測り、`build-and-test` に引き継ぐ。この単位のテストでは、DynamoDB の読み書きの回数の上限（`record.do` が通常 10 回・読み直し込み 15 回以内、`record.list` が 8 回以内）と、外部への通信が reply 1 回だけであることを確かめる

## 期待するカバレッジ

- U6 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定（`thresholds.lines: 80`）は変えない
- 単位だけのコマンドでは、U6 のテストが通る範囲のカバレッジが出る。全体の下限の判定は `npm test` で行う

## 差し替え（モック）の方針

- 時刻: `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）で「今日」を日本時間の指定の時刻に固定する。UTC の 15 時の前後、月末、月の最初の日で作る。使ったあとは `resetNow()` で戻す（筋書きは手順ごとに別テストなので、シナリオの終わり `AfterEachScenario` で戻す）
- DynamoDB: U1 の偽の DynamoDB（`fakeDynamo.ts`。U5 で `Calendar` 対応済み）を使う。記録の取引（担当の `#status=:todo AND #version=:v AND #dutyId=:id AND #childUserId=:by` の Update ＋ 月の状態の ConditionCheck ＋ `ChoreTypes` の `#unitPrice=:price` の ConditionCheck の 3 項目）の条件式を本当に評価し、取り消し（`TransactionCanceledException` と `CancellationReasons`）を項目ごとの Code で作る。`Scan` は使わない
- 競合と失敗: 「読んだあとに別の書き込みが先に入った」状態を `hooks.beforeTransaction(n, fn)` で作る（別の子供が先に記録、管理者が「済」にした、U5 の保存で担当を消して作り直した、単価が変わった）。n 回目のトランザクションを `hooks.failTransaction(n, code)` で `TransactionConflict`・`ConditionalCheckFailed` で断る。本物の並行は使わない
- 二重のイベント: 同じ `webhookEventId` の再送、2 回の `record.do`、同時の 2 要求で、記録が 1 件のままになることを確かめる
- LINE の受け口: 署名の確かめと秘密のヘッダーは U1・U3 の仕組みを差し替えず通す。`source.type` を `user`／`group` で切り替え、`action=record.list`／`record.do&dutyId=…&v=…` の data と、形の違う data を渡す。reply は `lineApiService` を差し替えて本文と宛先（本人だけ）を確かめ、push が呼ばれないことを確かめる
- C8 の名前の読み取り: `choreTypeService.list`（Query 1 回）を使うことを `hooks.readLog` で確かめる
- 前提データ（functional-spec の範囲）: 担当（「未」「済」「×」、`origin`）、確定した月、種類（単価・「使わない」）は、`helpers/seed.ts` で `Calendar` と `ChoreTypes` に直接置く
- 画面: LIFF と API の呼び出しは差し替える。記録のあとに応答の `Duty` で先に「済」を出し、続けてカレンダーを読み直すことを確かめる
- ログ: `console` への出力を集め、LINE のユーザー ID・表示名・種類の名前・reply トークン・postback の data・単価が含まれないことを確かめる。型のテストは `@ts-expect-error` で禁止された項目を渡すとエラーになることを確かめる
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「洗濯物たたみ」「ゴミ出し」「お風呂洗い」など
- **作り物の値の決まり:** 担当の ID、子供の ID、ほかの家族の ID、LINE のユーザー ID・トークン、`webhookEventId`、鍵らしく見える値は、テストの中に直接書かず、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置いて import する。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。ESLint が直書きを止める。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く
- JWT の鍵と LINE のチャネルの秘密は、テスト用の決まった値（`fakeSecrets.ts` から。本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
