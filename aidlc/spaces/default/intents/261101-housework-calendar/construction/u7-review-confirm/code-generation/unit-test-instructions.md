# 単体テストの手引き — U7 確認・修正と確定

## テストの道具

U1〜U6 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。新しい道具は入れません。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす。バックエンドと画面の `include` は `test/**/*.steps.ts`（画面は `*.steps.tsx`）
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`。U5 で `Calendar`、U6 で単価の `ConditionCheck` に対応済み）、画面は `@testing-library/react`
- 本文の検証は `zod`（U1〜U6 に既存。U7 で依存を足さない）
- 日付は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）と `shared/jstDate.ts`。日付のライブラリは足さない

## この単位のテストの動かし方

U7 のテストは、すべてパスに `u7-review-confirm` を含むフォルダに置きます。次のコマンドは U7 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u7-review-confirm --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U7 のインフラのスタックのテスト（前後で同じことを固定）だけを動かすとき:

```bash
npx vitest run infrastructure/test/u7-review-confirm/stacks.test.ts
```

1 つのファイルだけを動かすとき（筋書きは `.steps.ts` を指す）:

```bash
npx vitest run packages/backend/test/u7-review-confirm/status-change-service.steps.ts
```

U1〜U6 の動きを壊していないことと、project 全体の確認は、次のコマンドで確かめます（各 batch の終わりと最後に実行）。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## テストの量（Standard）

部品ごとに 5〜8 件、単体に加えて主要な境界の結合テスト（筋書き）を書きます。

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| `shared` の型・印・文言（状態変更の確認・注意・確定／取り消しの確認。追加分） | 単体 | 5〜6 |
| `StatusChangeAction`・`StatusChangePreview`・`MonthConfirmPreview` の型 | 単体（`@ts-expect-error`） | 5 |
| `dutyReassignedHook` の `kind: 'status-changed'`（必須フィールド・登録あり/なし・投げても結果不変） | 単体 | 5〜8 |
| 状態変更の取引の組み立て（`status-transaction.feature`。markDone 3 項目・ほか 2 項目・条件・属性名の別名） | 筋書き | 約 14 場面 |
| `calendarRepository.statusItems`（3 項目/2 項目、すべて `#` の別名、100 項目以内、担当に Put/Delete なし） | 単体 | 5〜8 |
| `calendarRepository.confirmItems`（`attribute_not_exists` の Put・`UpdateItem`・何もしない、version を条件にしない） | 単体 | 5〜8 |
| `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`（`status-change-service.feature`。判定の順・競合の差し込み a〜d・冪等・フック） | 筋書き（失敗の差し込み） | 約 18 場面 |
| `changeDutyStatus`（判定の順、`judgeTransition` の 5 とおりと表にない組、2 回失敗で `INTERNAL`、呼び出し回数） | 単体 | 5〜8 |
| `confirmMonth`/`unconfirmMonth`（行の有無、冪等、呼び出し 2 回以内、取り消しはフックを呼ばない） | 単体 | 5〜8 |
| ログの出し方（`DUTY_STATUS_CHANGED`・`DUTY_STATUS_REJECTED`・`MONTH_CONFIRMED_SET`・`DUTY_STATUS_RETRY`・名前/単価を出さない） | 単体 | 5〜8 |
| 画面用 API の入口（`status-api.feature`。確かめの順番・本文の 422 が先・`month` の 422・ほかの家族 404） | 筋書き | 約 20 場面 |
| 本文の検証（`statusChangeBodySchema`。`action`・`version` だけ・`strip`・外れを 422） | 単体 | 5〜8 |
| `changeDutyStatus` のハンドラ（確かめの順番、子供が DynamoDB を読まない） | 単体 | 5〜8 |
| ログの伏せ字（全分岐で作り物の目印が 1 行も含まれない） | 単体 | 5 |
| 画面（`review-confirm.feature`。操作ボタンの出し分け・確認・結果・失敗の文言・確定/取り消しボタン） | 筋書き（React。LIFF と API は差し替え） | 約 18 場面 |
| 確認ダイアログ（`review-dialog.feature`。Esc・やめる・フォーカス・`aria-busy`） | 筋書き | 約 6 場面 |
| 画面の部品（`StatusChangeDialog`・`MonthConfirmDialog`・`client` の 3 呼び出し・`theme`） | 単体 | 各 5〜8 |
| CDK のスタック（`u7-review-confirm/stacks.test.ts`。前後で同じことを固定。追加なし） | 組み立ての確かめ | 約 16 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

- **安全のテスト（要件が求めるもの）:** 管理者だけが状態の変更・確定・取り消しをできること（子供は 403 `ADMIN_ONLY` で DynamoDB を 1 回も読まない。NFR4.65）、ほかの家族の `dutyId`・月は 404 または自分の家族の月だけが変わる（NFR4.66）、本文は `action`・`version` だけを `strip` で読み結果の値は裏側が決める（`unitPrice`・`recordedBy`・`status` を本文で偽れない。NFR4.67）、本文の 422 が担当の探索より先（BR8.2）、`month` の形の 422 が DynamoDB を読む前（NFR4.68）、見せたあとに変わった担当・確定された月・変わった単価を上書きしない条件（NFR4.69、NFR4.70）
- **冪等（BR8.14、BR8.16）:** 状態の変更は version と表で（二度押しは `INVALID_TRANSITION` か読み直しで同じ結果）、確定・取り消しは目的の値にそろえる（連打でも最後の操作の結果）。確定・取り消しの呼び出しが 2 回以内（NFR7.35）
- **取引の不変条件（BR8.5、BR8.6、NFR2.44）:** markDone で `recordedAt`・`recordedBy`・`unitPrice` の 3 項目を同時に `SET`、ほかで同時に `REMOVE`。どれか 1 つだけが残る/欠ける担当を作らない。取引は全部か無しか。`childUserId`・`origin`・`date`・`choreTypeId` を変えない
- **速さ（NFR7.33〜NFR7.38）と費用は、ここでは測らない。** 3 秒の目標は、ステージングで 20 回ずつ（コールドスタート 10 回以上。markDone は過ぎた日の「未／×」を 20 件以上そろえる）測り、`build-and-test` に引き継ぐ。この単位のテストでは、DynamoDB の呼び出しの回数の上限（markDone 通常 6・読み直し込み 11 以内、cancel/markSkipped/unmarkSkipped 通常 5・9 以内、確定/取り消し 2 以内）と、外部への通信（`fetch`）が 0 回であること（NFR1.30）を確かめる

## 期待するカバレッジ

- U7 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定（`thresholds.lines: 80`）は変えない
- 単位だけのコマンドでは、U7 のテストが通る範囲のカバレッジが出る。全体の下限の判定は `npm test` で行う

## 差し替え（モック）の方針

- 時刻: `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）で「今」を日本時間の指定の時刻に固定する。UTC の 15 時の前後（JST 23:59／0:00）、月末、年またぎ、うるう年（2/29）で作る。markDone の `recordedAt`・確定の `confirmedAt`・`updatedAt` が入口の `now` であること、表示が日本時間になることを確かめる。使ったあとは `resetNow()`（筋書きは `AfterEachScenario`）
- DynamoDB: U1 の偽の DynamoDB（`fakeDynamo.ts`）を使う。状態変更の取引の条件式（markDone の 3 項目＝担当の `#status=:from AND #version=:v AND #dutyId=:id` の Update ＋ 月の `buildMonthGuard` の ConditionCheck ＋ `ChoreTypes` の `#unitPrice=:price` の ConditionCheck、ほかの 3 操作の 2 項目）を本当に評価し、取り消し（`TransactionCanceledException` と `CancellationReasons`）を項目ごとの Code で作る。確定の `attribute_not_exists(#sk)` の Put と `UpdateItem`、取り消しの `attribute_exists(#sk)` も評価する。`Scan` は使わない
- 競合と失敗: 「読んだあとに別の書き込みが先に入った」状態を `hooks.beforeTransaction(n, fn)` で作る（(a) 管理者が別端末で担当を変える、(b) 月が確定される、(c) markDone のとき単価が変わる、(d) 先に別状態に変える）。n 回目のトランザクションを `hooks.failTransaction(n, code)` で `TransactionConflict`・`ConditionalCheckFailed`・`ThrottlingError` で断る。本物の並行は使わない
- 単価の読み取り: markDone のとき `getCurrentUnitPrice`（C7）を差し替え、読んだ値が取引の `ConditionCheck` と担当の `unitPrice` に入ること、単価が変わったら（差し込み c）新しい値で書き直すことを確かめる
- フック: `onDutyReassigned` に関数を登録して、成功後に `notifyDutyReassigned(events)` が 1 回だけ呼ばれること、「未」でなくなった（markDone・markSkipped・確定）ときだけ呼ぶこと、各件が 1 つの担当の形（`dutyId`・`date`・`choreTypeId`・`fromChildUserId`）・`kind: 'status-changed'` であること、投げても状態変更・確定の結果が変わらず `DUTY_REASSIGN_HOOK_FAILED` が残ることを確かめる。登録がなければ何もしない
- 入口（API）: `requireAuth`・`requireMembership`・`requireAdmin` の仕組みを差し替えず通す。子供のセッションで 403 `ADMIN_ONLY` のとき担当・月・単価を 1 回も読まないことを `hooks.readLog` で確かめる。`verifyOriginHeader`・秘密のヘッダーは U1 のまま通す
- 画面: LIFF と API の呼び出しは差し替える。「はい」のあと応答の `Duty` で先に新しい状態を出し、続けてカレンダーを読み直すことを確かめる。確定の未の件数は `getMonthCalendar` の結果から数える（API を足して読まない）
- ログ: `console` への出力を集め、子供・管理者の表示名・種類の名前・LINE のユーザー ID・単価の値・確認の文言が含まれないことを確かめる。型のテストは `@ts-expect-error` で `LogData` が `name`・`displayName` を受け付けないことを確かめる
- 前提データ（functional-spec の範囲）: 担当（未・済・×、`origin`、「済」には記録の 3 項目）、月の状態（確定／未確定／行なし）、種類（単価）は、`helpers/seed.ts` で `Calendar` と `ChoreTypes` に直接置く
- 本物の AWS や LINE にはつながない（U7 は LINE を呼ばない。`fetch` が 0 回であることも確かめる）

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「洗濯物たたみ」「ゴミ出し」「お風呂洗い」など。単価は皿洗い 120 円など
- **作り物の値の決まり:** 担当の ID、子供の ID、管理者の ID、ほかの家族の ID、`YYYY-MM` の月、セッショントークン、HMAC の鍵、鍵らしく見える値は、テストの中に直接書かず、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置いて import する。**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。** ESLint が直書きを止める。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く
- セッションの署名の鍵は、テスト用の決まった値（`fakeSecrets.ts` から。本物の値は使わない）。U7 は LINE を呼ばないのでチャネルの秘密は使わない

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
