# 単体テストの手引き — U5 割り当てとカレンダー

## テストの道具

U1〜U4 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。新しい道具は入れません。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす。バックエンドと画面の `include` は `test/**/*.steps.ts`（画面は `*.steps.tsx`）
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`）、画面は `@testing-library/react`
- 日付は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）。日付のライブラリは足さない

## この単位のテストの動かし方

U5 のテストは、すべてパスに `u5-assignment-calendar` を含むフォルダに置きます。次のコマンドは U5 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u5-assignment-calendar --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U5 が直す U1・U4 のインフラの既存テスト（`infrastructure/test/u1-skeleton-family/stacks.test.ts`、`infrastructure/test/u4-chore-types/stacks.test.ts`）だけを動かすとき:

```bash
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts
```

1 つのファイルだけを動かすとき（筋書きは `.steps.ts` を指す）:

```bash
npx vitest run packages/backend/test/u5-assignment-calendar/save-assignment.steps.ts
```

U1〜U4 の動きを壊していないことと、project 全体の確認は、次のコマンドで確かめます（各 batch の終わりと最後に実行）。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| 日本時間の日付（`shared/jstDate`） | 単体 | 10 |
| 理由の印・文言（`shared/messages`） | 単体 | 6 |
| 保存（`save-assignment.feature`） | 筋書き（画面用 API の入口から） | 約 18 場面 |
| 上書きの確かめ（`overwrite-confirmation.feature`） | 筋書き | 約 9 場面 |
| 競合と失敗（`save-resilience.feature`） | 筋書き（失敗の差し込み） | 約 14 場面 |
| カレンダーを開く（`view-calendar.feature`） | 筋書き | 約 14 場面 |
| 担当の子供の変更（`change-duty.feature`） | 筋書き | 約 14 場面 |
| 種類が使われたか（`chore-type-in-use.feature`） | 筋書き（U4 の「消す」から本物の C8 まで） | 約 7 場面 |
| `assignmentPlanner`（範囲、比べ、チャンクの分け方） | 単体 | 8 |
| `changesHash` | 単体 | 5 |
| `calendarRepository`（キー、条件式、属性名の置き換え、`CancellationReasons`） | 単体 | 8 |
| 保存のトランザクション（項目数が 100 を超えない） | 単体 | 5 |
| `getMonthCalendar`、`changeDutyChild`、`isChoreTypeAssigned` | 単体 | 各 5〜8 |
| composition root（`entries/api` で本物が取り付く）、`dutyReassignedHook` | 単体 | 各 5 |
| ログの伏せ字と型 | 単体 | 5 |
| カレンダーと日の詳細（`calendar.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 約 14 場面 |
| 割り当てと上書きの確認（`assignment.feature`） | 筋書き | 約 14 場面 |
| `useMonthCalendar`、`client`、`DayDetail`、`OverwriteConfirmDialog` | 単体 | 各 5〜8 |
| テーマ（コントラスト、押す場所。全画面） | 単体 | 5〜8 |
| CDK のスタック（`stacks.test.ts`） | 組み立ての確かめ | 約 14 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

- **安全のテスト（要件が求めるもの）:** 子供の 403、ほかの家族の担当・子供・種類の 404、本文 64 KB と行・種類の数の上限、確かめの印、書き込みの条件（「済」・確定・種類の「使わない」・消えて作り直された担当）。すべて筋書きの中に入れる
- **速さ（NFR7.20〜NFR7.23）と費用の最初の請求は、ここでは測らない。** 3 秒の目標は、ステージングで 20 回ずつ（コールドスタートを含む）測り、`build-and-test` に引き継ぐ。この単位のテストでは、チャンクの数（124 件で 4 回、310 件で 9 回）と、読み取りの回数が担当の数で増えないことを確かめる

## 期待するカバレッジ

- U5 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定（`thresholds.lines: 80`）は変えない
- 単位だけのコマンドでは、U5 のテストが通る範囲のカバレッジが出る。全体の下限の判定は `npm test` で行う

## 差し替え（モック）の方針

- 時刻: `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）で「今日」を日本時間の指定の時刻に固定する。UTC の 15 時の前後、月末、うるう年、12 月の来月は固定した時刻で作る。使ったあとは `resetNow()` で戻す
- DynamoDB: U1 の偽の DynamoDB（`fakeDynamo.ts`）に `Calendar` の表を足し、条件式（`attribute_not_exists`、`#status = :todo AND #version = :v AND #dutyId = :id`、`attribute_not_exists(confirmed) OR confirmed = :false`、`contains`、`begins_with`）を本当に評価する。`TransactWriteItems` の `ConditionCheck` を `Calendar` と `ChoreTypes` の両方で評価し、取り消し（`TransactionCanceledException` と `CancellationReasons`）を項目ごとの Code で作る。100 項目を超える要求は `ValidationException` で断る
- 競合と失敗: 「読んだあとに別の書き込みが先に入った」状態を `hooks.beforeTransaction(n, fn)` で作る（記録、確定、種類を「使わない」にする、担当を消して作り直す、U8 の引き受けで `version` を増やす）。n 回目のトランザクションを `hooks.failTransaction(n, code)` で `TransactionConflict`・`ThrottlingError` などで断る。本物の並行は使わない
- 続きのある読み取り: Query の応答を `LastEvaluatedKey` つきで複数回に分けて返す（`queryPageSize`）
- 読み取りの回数と整合性: `hooks.readLog` に読み取りの操作と `ConsistentRead` の有無を残し、「`Scan` を使わない」「すべて強い整合性」「担当の数で読み取りの回数が増えない」を確かめる
- C8 `isChoreTypeAssigned`: 筋書きでは本物（`entries/api` が取り付ける）を使う。U4 のテストは `setCalendarPort` で差し替え、`resetCalendarPort` で仮に戻す
- 前提データ（functional-spec の範囲）: 「済」「×」、記録した時刻・記録した人、確定した月、`origin` が `manual` と `swap` の担当は、`helpers/seed.ts` で `Calendar` に直接置く。U6〜U8 の操作は呼ばない
- 画面: LIFF と API の呼び出しは差し替える（`fetch` の差し替え）。端末の時計ではなく、応答の `today` で今日の位置を決めることを確かめる。画面の既存テストが使うカレンダー API の既定の差し替えは `packages/frontend/test/u5-assignment-calendar/helpers/calendarStub.ts`
- ログ: `console` への出力を集め、種類の名前と子供の表示名が含まれないことを確かめる。型のテストは `@ts-expect-error` で `name`・`displayName` を渡すとエラーになることを確かめる
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「洗濯物たたみ」「ゴミ出し」「お風呂洗い」など。月は 2027 年 1 月（月曜 1 月 4 日）などに固定して書く
- **作り物の値の決まり:** 担当の ID、子供の ID、ほかの家族の ID、`Idempotency-Key`、64 文字の 16 進数の印（形は正しいが合わない印）など、UUID や鍵らしく見える値は、テストの中に直接書かず、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置いて import する。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。ESLint が直書きを止める（README の「テストの作り物の秘密の値」）。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く
- `changesHash` を期待値に使うときは、直書きせず `computeChangesHash` の結果を使う
- JWT の鍵はテスト用の決まった値（`fakeSecrets.ts` から。本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
