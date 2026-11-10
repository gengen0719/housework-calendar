# 単体テストの手引き — U9 お小遣いの額

## テストの道具

U1〜U8 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。新しい道具は入れません。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node。`frontend` は jsdom。U9 は画面（S5）を足すので、`frontend` のプロジェクトも使う）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす。バックエンドの `include` は `test/**/*.steps.ts`、画面は `test/**/*.steps.tsx`
- 画面のテストは Testing Library（役割での検索）と、差し替えた時計（`vi.useFakeTimers`）・差し替えた `fetch`。U7 の `packages/frontend/test/u7-review-confirm/` の書き方に合わせる
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`）。U9 で、月の `Query`（`begins_with`・強い整合性・続きのページ）、`Users` の強い整合性の `GetItem` と `familyId-index` の `Query`、`Families` の `GetItem`、`ChoreTypes` の `Query`、読み取りの呼び出しの記録（`hooks.readLog`・`hooks.readTargets`）、**書き込みの命令の見張り**、読み取りを 1 つずつ失敗させる差し込み・遅らせる差し込みに対応しているかを Step 3 で確かめ、足りなければ補助を足す（U1〜U8 のテストの期待は変えない）
- LINE の API は呼ばない。`fetch` を差し替え、**呼ばれたら失敗**にして、U9 のコードが通信を 0 回しか出さないことを確かめる
- 並行数の制限は既存の自前の関数 `mapWithConcurrency`（Step 11 で `lib/promise.ts` へ移す）。金額の表示は標準の `Intl.NumberFormat('ja-JP')`。日付は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）と `shared/jstDate.ts`。日付のライブラリは足さない

## 実行環境の確認の記録（Step 3）

Step 3 で「この単位だけ」のコマンドが動くことを確かめたあと、確かめた日と、偽の DynamoDB に足した補助（読み取りの記録、書き込みの命令の見張り、読み取りの失敗・遅延の差し込み）の一覧をここに書く。**コード生成の前なので、まだ確かめていない。**

- U9 の補助: `packages/backend/test/u9-allowance/helpers/`（`seed.ts`、`clock.ts`、`logs.ts`、`session.ts`）

## この単位のテストの動かし方

U9 のテストは、すべてパスに `u9-allowance` を含むフォルダに置きます（`packages/shared/test/u9-allowance/`、`packages/backend/test/u9-allowance/`、`packages/frontend/test/u9-allowance/`、`infrastructure/test/u9-allowance/`）。次のコマンドは U9 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u9-allowance --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U9 のインフラのスタックのテスト（前後で同じことを固定）だけを動かすとき:

```bash
npx vitest run infrastructure/test/u9-allowance/stacks.test.ts
```

1 つのファイルだけを動かすとき（筋書きは `.steps.ts`／`.steps.tsx` を指す）:

```bash
npx vitest run packages/backend/test/u9-allowance/allowance-calc.steps.ts
```

U1〜U8 の動きを壊していないこと（特に、U9 が移す `mapWithConcurrency` を使う U8 のフックの並行数、`listMembers` の戻り、`entries/api.ts` の既存の入口の応答）は、次のコマンドで確かめます（Batch 1 の Step 4、Batch 3 の Step 14、Batch 4 の Step 18）。

```bash
npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm u8-swap
```

project 全体の確認は、次のコマンドで行います（各 batch の終わりと最後の Step 47 で実行）。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## テストの量（Standard）

部品ごとに 5〜8 件、単体に加えて主要な境界の結合テスト（筋書き）を書きます。筋書きは実装の前に書き、通るまで実装します（BDD。`team.md` の Testing Posture）。

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| `shared` の金額の表示（`formatYen`。桁区切り・半角のハイフンのマイナス・整数だけ） | 単体（`yen.test.ts`） | 5〜8 |
| `shared` の文言（見出し、確定していません、記録がありません 2 種、子供がいません、あなた、名前が分からない、不明なお手伝い） | 単体（`messages.test.ts`） | 5〜8 |
| `shared` の型（`Allowance`・`AllowanceMonthView` の項目名の完全一致、`Role` に `system` がない） | 型のテスト（`api-types.test.ts`） | 5 |
| `mapWithConcurrency` の移動（失敗のあとに新しい項目を始めない旗・上限・U8 の再公開） | 単体 | 5〜8 ＋ 5 |
| `json()` の追加ヘッダー（`content-type` が勝つ）と `RouteResult.headers`（既存の入口は同じ） | 単体 | 5〜8 |
| 文脈の型（`FamilyScope`・`SystemContext`・`ReadContext`。書き込みに `system` を渡すと型で落ちる） | 型のテスト（`@ts-expect-error`） | 5 |
| 家族の読み取りと C8 の窓口（`family-reads.feature`。Families 1 回・`role: system` で本人の補いなし・`listMembers` の戻りが同じ・`findDisplayName` は表示名だけ） | 筋書き | 約 14 場面 |
| `loadFamilyAndMembers`・`findDisplayName`・`listDoneDuties`・`isMonthConfirmed` | 単体 | 各 5〜8 |
| 額の計算（`allowance-calc.feature`。S1、S3〜S16。AC8.1.1・AC8.1.3・AC8.1.4・AC5.1.13。済だけ・担当の子供・単価ごとの行・並び・日本時間の月の境） | 筋書き | 約 30 場面 |
| 子供の範囲と並び（`allowance-children.feature`。S2、S17〜S19、S34。AC8.1.2。管理者なし・抜けた子供・`role: system`） | 筋書き | 約 14 場面 |
| 加算・減額の差し込み口（`allowance-adjust-slot.feature`。S27〜S29。マイナスをそのまま・空の既定・投げたら全体が失敗） | 筋書き | 約 6 場面 |
| 異常なデータ（`allowance-anomaly.feature`。S14、S30、S30b。単価なし・種類なし・管理者の担当・ログは種類ごとに 20 行・`anomalyCount` は全数） | 筋書き | 約 12 場面 |
| 読み取りの段・回数・失敗（`allowance-reads.feature`。S31。最初の 3 つを同時に・最大 4 段・書き込み 0 回・全体を投げる・ログ 1 要求 1 件） | 筋書き（失敗・遅延の差し込み） | 約 14 場面 |
| `tallyDuties`・`assembleAllowances`・`deriveRange`（純粋な関数） | 単体 | 各 5〜8 |
| `allowanceService` の import の向きと書き込み 0 回・`fetch` 0 回 | 単体 | 5 |
| ログの出し方（`ALLOWANCE_COMPUTED`・異常 3 種・項目名の完全一致・名前や金額を出さない） | 単体 | 5〜8 |
| 入口（`allowance-api.feature`。S20〜S26、S31、S35。確かめの順番・メンバー全員・`current`・`confirmed`・範囲・許可した項目・`no-store`・500） | 筋書き | 約 24 場面 |
| `resolveMonthParam`・ハンドラー・振り分け表 | 単体 | 各 5〜8 |
| 画面の月の移動（`allowance-month-move.feature`。S32、S35。250 ms・連番・飛んでいる要求・範囲・先読みなし） | 筋書き（差し替えた時計） | 約 12 場面 |
| 画面の表示（`allowance-page.feature`。AC8.1.1〜AC8.1.3・AC4.1.3・AC4.1.5・AC4.1.7。h1・h2・リスト・確定の文字・0 円・あなた・マイナス・`role` の `status`／`alert`） | 筋書き（Testing Library） | 約 20 場面 |
| `useAllowanceMonth`・`getAllowances` のクライアント・S5 のテーマ（コントラスト・44 ピクセル） | 単体 | 各 5〜8 |
| CDK のスタック（`u9-allowance/stacks.test.ts`。前後で同じことを固定。IAM の文の数は `api` 11・`line` 9） | 組み立ての確かめ | 約 14 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

- **安全のテスト（要件が求めるもの）:** セッションなし・ブロック中・家族のメンバーでない人が、額も内訳も受け取らず、月の読み取りも 0 回であること（NFR4.86、AC1.1.11）、確かめの順番（セッション → ブロック中 → メンバー → 月の形）、`current` の完全一致（`Current`・`current `・`2027-1` は 422。NFR4.88）、家族はセッションから決まりクエリ・本文を読まないこと（NFR4.87）、応答の項目名が許可した一覧と完全一致で管理者の情報・LINE の ID・家族 ID が入らないこと（NFR4.91）、成功の 200 だけに `cache-control: no-store` が付きエラーと既存の入口には付かないこと（NFR4.92）、500 の本文が決まった文で名前・金額を含まないこと（NFR4.93）、書き込みの命令が 0 回で `fetch` が 0 回であること（NFR4.89、NFR5.16）、書き込みの窓口に `role: system` を渡すと型で落ちること・`handlers/**`／`entries/api.ts` が `SystemContext` を import しないこと（NFR2.73、NFR4.90）、画面が名前を HTML として差し込まないこと
- **額の正しさ（BR10.2〜BR10.7）:** 「済」だけを数え、担当の子供の額に入れ（記録した人を見ない）、`(種類の ID, 単価)` ごとの行で、種類の今の単価を使わない。`total` は内訳と加算・減額の和で、0 円を下回っても 0 円にそろえない。単価 0 円は有効、`undefined`／`null` は異常。担当の `date` の月で数える。読み直すと最新の「済」だけが数に入る（保存した合計に頼らない）
- **失敗は全体を投げる（BR10.13、NFR2.68）:** 月の `Query`・`Families`・`Users`・種類の `list`・差し込み口のどれを失敗させても、一部だけ返さずに投げる。`findFamilyChild` の `NOT_FOUND` だけは結果として扱う。異常のログと `ALLOWANCE_COMPUTED` は、計算が成功したあとにまとめて出す
- **読み取りの段と回数（NFR7.55、NFR7.56、NFR3.18）:** 最初の 3 つを同時に始める（待ち時間が足し算にならない）。呼び出しの回数は通常 5〜6 回、抜けた子供 k 人で +2k 回、担当の数で増えない。抜けた子供の確かめは 10 並行まで。Families の `GetItem` は 1 回
- **画面の月の移動（BR10.12、NFR2.72、NFR7.53）:** 250 ms の静まり、連番、最新の連番の答えだけを描く、最新の連番の要求の月と目標の月が同じときだけ重ねて出さない、先読み・自動の読み直しがない、端の月で `disabled`
- **日本時間（NFR11.10、NFR11.11）:** `now` は入口で 1 回。`current`・`today`・`firstMonth`・`lastMonth` を UTC 15 時の前後・月末・年またぎ・うるう年で確かめる。端末の時計を使わない
- **速さ（NFR7.50〜NFR7.58）と費用は、ここでは測らない。** 3 秒の目標（20 回中 19 回以上）と、冷たい起動・大きい月・月の移動・S1 の測り直しは、ステージングで `docs/manual-check-u9.md` の確かめ 14・15 として行い、`build-and-test` に引き継ぐ。この単位のテストでは、DynamoDB の呼び出しの回数の上限と、読み取りを並行に走らせること、外部への通信が 0 回であること、先読みがないことを確かめる

## 期待するカバレッジ

- U9 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定（`thresholds.lines: 80`）は変えない
- 単位だけのコマンドでは、U9 のテストが通る範囲のカバレッジが出る。全体の下限の判定は `npm test` で行う

## 差し替え（モック）の方針

- 時刻: `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）で「今」を日本時間の指定の時刻に固定する。UTC の 15 時の前後（JST 23:59／0:00）、月末（1 月 31 日 23:59 と 2 月 1 日 0:00）、年またぎ、うるう年（2/29）で作る。`current` が日本時間の今日の月になること、`firstMonth`（家族の作成時刻を日本時間の月にしたもの）、`lastMonth`（今日の月の翌月）を確かめる。使ったあとは `resetNow()`（筋書きは `AfterEachScenario`）。画面のテストは `vi.useFakeTimers` で 250 ms の静まりを進める
- DynamoDB: U1 の偽の DynamoDB（`fakeDynamo.ts`）を使う。月の `Query` は `M#<月>#` の `begins_with` を本当に評価し、続きのページ（`LastEvaluatedKey`）を最後まで読むことを確かめる。**書き込みの命令（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）と `Scan`・`BatchGetItem` が呼ばれたら失敗にする見張り**を置き、U9 のどの分かれ道でも 0 回であることを確かめる
- 失敗と遅延: 読み取りを 1 つずつ失敗させる差し込み（`hooks.failRead(table, operation)`）で、全体が投げることを確かめる。読み取りの完了を遅らせる差し込みで、最初の 3 つが同時に始まること（待ち時間が足し算にならないこと）と、抜けた子供の確かめの並行数が 10 を超えないことを、同時に動く数のカウンターで数える
- 名前: 子供の表示名は `loadFamilyAndMembers`（`Users` の `familyId-index` の `Query`）から、抜けた子供の表示名は `findDisplayName`（`Users` の `GetItem`）から取る。LINE のプロフィール取得は差し替えず、**呼ばれたら失敗**にする。お手伝いの名前は `choreTypeService.list` の結果。抜けた子供の名前が読めないときの「名前が分からない子供」も確かめる
- 加算・減額の差し込み口: テストの中だけで、子供ごとの行を返す取り付けを作る（S27〜S29）。既定は空。投げる取り付けで、全体が失敗することを確かめる
- 入口（`entries/api.ts`）: `getConfig` は作り物の設定で差し替える。署名つきのセッションは作り物のシークレットで作る（`helpers/session.ts`）。`verifyOriginHeader` と `requireAuth` は U1 のまま通す。ブロック中・メンバーでない人・家族に入っていない人の状態は `seed.ts` で作る
- ログ: `console` への出力を集め、子供・管理者の表示名・種類の名前・LINE のユーザー ID・単価・小計・合計・加算・減額の値が含まれないこと（目印の文字・目印の数字）を、成功・異常 3 種・失敗・上限を超えた異常の全部の分かれ道で確かめる。`ALLOWANCE_COMPUTED` と異常の行の項目名が、`observability-design.md` の許可した一覧と完全に一致すること。`anomalyCount` が省いた行も含む全数であること
- 画面: Testing Library の役割での検索（h1・h2・`ul`／`li`・ボタンの名前・`role="status"`／`role="alert"`）。API は `fetch` の差し替え（連番の確認のため、応答の到着の順を入れ替えられる）。`AbortSignal` が渡されて取り消されることを確かめる。色は `theme.ts` の値から、文字と背景の差を計算するテストで 4.5:1 以上（緑の枠は 3:1 以上）、押す場所は 44×44 ピクセル以上
- 前提データ（functional-spec の範囲）: 担当（未・済・×。単価あり・なし・0 円。日付は月の初日・末日・月またぎ）、種類（「使う」と「使わない」。名前の変更前後）、月の状態（確定／未確定／行なし）、子供（今いる・抜けた・名前が読めない）、管理者の担当（異常）は、`helpers/seed.ts` で `Calendar`・`ChoreTypes`・`Users`・`Families` に直接置く
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」（100 円）、「風呂掃除」（150 円）、「洗濯物たたみ」など。金額は `stories.md` の例（800 円・600 円・合計 1,400 円、単価の変更で 420 円、減額の -200 円・-300 円）を使う
- 名前が長い・タグや改行を含む表示名と種類の名前を作り、画面が文字として出すこと（HTML として差し込まないこと）を確かめる
- **作り物の値の決まり:** 家族の ID、利用者の ID、種類の ID、担当の ID、`YYYY-MM` の月、署名の計算に使うシークレット、鍵らしく見える値は、テストの中に直接書かず、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置いて import する。**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。** ESLint が直書きを止める。ログの伏せ字の確かめに使う作り物の目印（`<作り物の値>` の目印を付けた表示名・種類の名前・金額の数字）も同じ場所に置く。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く。テストの前提データに本物の ID・表示名・額を入れない
- 本物のチャネルのシークレット・トークンは使わない

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要。ステージングでの手での確かめ（16 件）と 3 秒の測定は、この手引きの範囲外で、`docs/manual-check-u9.md` で行う
