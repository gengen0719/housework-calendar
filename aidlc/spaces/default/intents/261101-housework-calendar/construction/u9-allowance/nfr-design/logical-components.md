# 論理コンポーネント（Logical Components）— U9 お小遣いの額

U9（`u9-allowance`）で足す・変える部品と、NFR の設計の決まりがどの部品に入るかを、部品の見取り図として書きます。Infrastructure Design への橋渡しも兼ねます。U9 は**読み取りだけ**で、新しいテーブル・索引・Lambda・指標・アラーム・権限・環境変数を足しません（NFR1.36）。

## 足す・変える部品

### 裏側（`packages/backend/src`）

| 部品 | 区分 | 中身 | 関係する NFR・決め |
|------|------|------|------------------|
| `handlers/allowances/getAllowances.ts` | 新規 | 薄い入口。`requireMembership` → 月の読み方 → `getAllowanceMonthView` → **本文（`AllowanceMonthView`）だけを返す**。`{ status: 200, body, headers: NO_STORE_HEADERS }` は `entries/api.ts` の振り分け表の 1 行が組み立てる（`RouteResult` は `entries/api.ts` の中に閉じる） | NFR4.86、NFR4.92、ADR-U9-05 |
| `handlers/allowances/params.ts` | 新規 | `resolveMonthParam(raw, now)`: `'current'`（完全一致）なら日本時間の今の月、それ以外は既存の `requireMonthParam` | NFR4.88、NFR11.10 |
| `services/allowanceService.ts` | 新規 | 窓口 `getAllowances`（`Allowance[]`）と `getAllowanceMonthView`、内部の `loadAllowances`、純粋な関数 `tallyDuties`・`assembleAllowances`・`deriveRange`、定数 `OWNER_LOOKUP_CONCURRENCY`・`ANOMALY_LOG_LIMIT`、差し込み口の型 `AdjustmentSource` | NFR2.67〜NFR2.71、NFR7.55、NFR7.56、NFR8.19、ADR-U9-03、ADR-U9-04、ADR-U9-07 |
| `services/familyMemberService.ts` | 変更 | `loadFamilyAndMembers(ctx)`（家族の項目とメンバーを返す）を分け出し、`listMembers` は `members` だけを返す薄い関数にする（戻りは今のまま）。`findDisplayName(ctx, userId)`・`getFamilyCreatedAt(ctx)` を足す。本人の補いは `ctx.role !== 'system'` のときだけ | NFR7.55、NFR2.73、NFR4.90、ADR-U9-01、ADR-U9-02 |
| `middleware/requireMembership.ts` | 変更（型だけ） | `FamilyScope`・`SystemContext`・`ReadContext` を足す。`FamilyContext` と `requireMembership` の戻りは変えない | NFR2.73、NFR4.90、ADR-U9-01 |
| `services/choreTypeService.ts` | 変更（型だけ） | `list` の引数の型を `FamilyScope` に広げる（本体は変えない） | NFR2.73 |
| `services/calendarService.ts` | 変更（窓口の追加） | C8 の `listDoneDuties(ctx, month)`・`isMonthConfirmed(ctx, month)` を足す（`FamilyScope`。`loadMonth` を使う薄い窓口）。`allowanceService` は自分の `loadMonth` の結果を使い、これらを**別に呼ばない**（Query を 2 回にしない） | NFR7.55、契約 C8 |
| `lib/promise.ts` | 変更 | `mapWithConcurrency` を `services/dutyReassignedHook.ts` から移し、失敗のあとは新しい項目を取り出さない旗を足す（`worker` が投げない U8 のフックの動きは変えない）。`dutyReassignedHook.ts` は同じ名前で再び公開する | NFR7.56、NFR3.18、ADR-U9-04 |
| `lib/http.ts` | 変更 | `json(statusCode, body, extraHeaders?)`。追加のヘッダーを先に、`content-type` を後に書く | NFR4.92、ADR-U9-05 |
| `entries/api.ts` | 変更 | `RouteResult` に任意の `headers`、`json(result.status, result.body, result.headers)`、振り分け表に `'GET /v1/months/:month/allowances'` を 1 行 | NFR4.92、NFR8.19、ADR-U9-05 |

### 共有（`packages/shared/src`）

| 部品 | 区分 | 中身 | 関係する NFR |
|------|------|------|-------------|
| `api-types.ts` | 変更 | `AllowanceMonthView`・`Allowance`・`AllowanceChoreLine`・`AllowanceAdjustmentLine` | NFR4.91、NFR8.19 |
| `messages.ts`・`messages.test.ts` | 変更 | 「{年}年{月}月のお小遣い」、「確定していません」、「今月の記録はまだありません（0 円）」、「この月の記録はまだありません（0 円）」、「お小遣いを表示する子供がまだいません」、「（あなた）」、「名前が分からない子供」、「不明なお手伝い」。テストで文言を固定する | NFR8.19、NFR9.10 |
| `yen.ts`（名前は既存の並びに合わせる） | 新規 | 金額の表示の関数 `formatYen(amount)`。`Intl.NumberFormat('ja-JP')` で桁区切りにし、**マイナスは自前で半角のハイフンを付ける**（絶対値を整形して `-` を前に付ける。ICU が別の記号〔U+2212〕を返しても影響されない）。画面（S5）・U10・U11 が使い回す | NFR8.18 |

### 画面（`packages/frontend/src`）

| 部品 | 区分 | 中身 | 関係する NFR・決め |
|------|------|------|------------------|
| `pages/AllowancePage.tsx` | 新規 | S5。`React.lazy` の別の塊。見出し（h1）、確定の文字、子供ごとの行（h2）と内訳（`ul`／`li`）、`role="status"`／`role="alert"` | NFR7.52、NFR9.10、NFR9.11 |
| `hooks/useAllowanceMonth.ts` | 新規 | 月の移動（250 ms の静まり、連番、重ね出しの抑止、範囲の保持）。先読み・自動の読み直しをしない | NFR2.72、NFR1.38、NFR7.53、ADR-U9-06 |
| `api/client.ts` | 変更 | `getAllowances(token, month, signal?)`。URL は `/v1/months/<month>/allowances` で月だけ | NFR4.92 |
| `pages/CalendarPage.tsx` | 変更 | 「お小遣い」の入口（メンバー全員に出す）。`MonthCalendar.today` の月を S5 に渡す | NFR11.11 |
| `App.tsx` | 変更 | S5 を開く道（直接開くときは `current`） | NFR7.53 |

### テストと文書

| 部品 | 中身 |
|------|------|
| `packages/backend/test/u9-allowance/*.feature`・`*.steps.ts` | AC8.1.1〜AC8.1.4、AC5.1.13 の Gherkin（BDD。先に書く）。もとは機能設計の S1〜S35 |
| `packages/backend/test/u9-allowance/*.test.ts` | 純粋な関数、呼び出しの回数（NFR7.55）、並行（NFR7.56）、ログ（NFR2.74〜NFR2.76）、許可した項目（NFR4.91）、日本時間（NFR11.10）、`role: system`（NFR2.73）、型のテスト（`@ts-expect-error`） |
| `packages/frontend/test/u9-allowance/` | 月の移動（S32。飛んでいる要求の答えが静まりの間に届く場面を含む）、呼び出しの数（NFR7.53）、テーマ・コントラスト・44 ピクセル（NFR9.12）、HTML を差し込まない（NFR4.92）、`formatYen`（NFR8.18） |
| `infrastructure/test/u9-allowance/stacks.test.ts` | 「U9 で差分がない」（`api` の権限、`line` の権限・環境変数、SSM、テーブル・索引・Lambda・ログ・指標・アラームの数、`reservedConcurrency`）、`RemovalPolicy.RETAIN` が変わらない |
| `docs/contract-changes-u9.md` | `Allowance` の置き換え、`GET .../allowances` の応答の包み直しと `current`、`findDisplayName`・`getFamilyCreatedAt`・`loadFamilyAndMembers` の追加、`listMembers` の `role: system` 対応、`Cache-Control: no-store` と `RouteResult` の任意の `headers`（既存の応答は変えない） |
| `README.md` | 3 秒の測定の手順（NFR7.57）、Logs Insights の検索の例 |

## 部品の分け方と頼り方

```text
entries/api.ts ──▶ handlers/allowances/getAllowances.ts ──▶ services/allowanceService.ts
   (振り分け表,           (薄い入口,                            ├─▶ calendarRepository.loadMonth          … Calendar（読むだけ）
    now を 1 回,           requireMembership,                    ├─▶ familyMemberService                    … Families / Users（読むだけ）
    RouteResult.headers)   月の読み方)                           │      loadFamilyAndMembers / findFamilyChild / findDisplayName
                                                                 ├─▶ choreTypeService.list                  … ChoreTypes（読むだけ）
                                                                 ├─▶ adjustmentSource（U11 が取り付ける。既定は空）
                                                                 └─▶ lib/promise.mapWithConcurrency / lib/logger
```

- 向きは一方向で、輪を作らない: `entries → handlers → services → repositories`。`allowanceService` は `calendarService` を import せず、`calendarRepository` を直接使う（`calendarService.listDoneDuties` などの C8 の窓口は U10・U11 向けの薄い窓口で、`allowanceService` の読み取りには使わない）
- `allowanceService` は `lineApiService`・`swapService`・書き込みの窓口を import しない（読み取り専用の境界。NFR4.89、NFR5.16）。import の向きは `grep` のテストで確かめる
- `mapWithConcurrency` を `lib/promise.ts` に置くことで、`allowanceService` が「フックの module」に頼らない
- 純粋な関数（`tallyDuties`・`assembleAllowances`・`deriveRange`）は時計も DynamoDB も `logger` も呼ばない。ログは窓口が出す

## 障害の波及範囲と失敗の範囲（failure domains / blast radius）

| 失敗するもの | 波及する範囲 | 波及しない範囲 | 備え |
|------------|------------|--------------|------|
| `GET /v1/months/:month/allowances`（`allowanceService`・ハンドラー）のバグ | S5 のお小遣いの画面だけ。同じ `api` の Lambda の他の入口は、別の関数として呼ばれるので動く（実行環境は共有するが、入口ごとに処理は独立） | カレンダー（S1）、記録、割り当て、代わりにやる、LINE の入口（`line` の Lambda は別） | 読み取りだけなので、データは壊れない。前の版に戻すだけで直る（データの移行は要らない） |
| 月の Query・Families・Users 索引・ChoreTypes のどれかの失敗 | その 1 回の要求だけが 500。**一部の額は返さない**（全体の失敗） | 他の要求、保存されたデータ | 「読み込み直す」で再読み込み。何も書いていないので二重に何かが起きない |
| 異常なデータ（単価なし・種類なし・管理者の担当） | その担当の分の額が少なく見える（ほかの子供・ほかの行は変わらない） | 画面、ほかの担当、ほかの月 | ログ（`ALLOWANCE_*`）で見つけ、アプリの操作で直す。U10 が 15 分以内の知らせを入れる |
| `mapWithConcurrency` の移動（`lib/promise.ts`） | U8 のフック（月の確定のときの掃除）。再公開で名前と並行数を保つ | U9 以外の画面・入口 | U8 のフックの既存のテスト（並行数が 4 を超えない）が無修正で通ること。加えて `lib/promise.ts` の新しいテスト（失敗のあとに新しい項目が始まらない／投げないときは従来どおり） |
| `RouteResult.headers` と `json()` の変更 | 全入口の応答の組み立て | 入口ごとの処理 | `headers` を持たない入口の戻りが前後で同じであること（既存の入口のテストが無修正で通る） |
| `loadFamilyAndMembers` への分け出し | `listMembers` を使うすべて（U2 のメンバー一覧、U5 のカレンダーなど） | 書き込み | 戻りを変えない。U1・U2 の既存のテスト（並び順・本人の補い・LINE の ID を返さない）が無修正で通る |
| `FamilyScope`／`ReadContext` の型の追加 | 型の上だけ | 実行時の動き | `tsc` と既存のテストが無修正で通る。書き込みの窓口に `system` を渡すと型で落ちる |
| 画面 S5 の不具合 | S5 だけ（別の塊）。S1 の初期表示は `lazy` で守る | S1 以外の画面 | S1 の表示（NFR7.20）を U9 の反映後に 1 回測り直す |

- **最大の共通の失敗の点**は `api` の Lambda と、読み取りの 4 つの表です。ただし U9 は読み取りだけなので、失敗しても**データは壊れず**、画面が失敗の表示を出すだけ
- 家族ごとの分離: すべての読み取りが `ctx.familyId` をキーにするので、ある家族の異常なデータが、ほかの家族の応答に影響しない
- 月ごとの分離: 月の Query は `M#<month>#` で絞られるので、ある月の異常（量・データ）が他の月の読み取りに影響しない

## NFR の設計の決まりがどこに入るか

| 設計の決まり | 入る部品 | 確かめる場所 |
|------------|---------|------------|
| 確かめの順番（セッション → ブロック中 → メンバー → 月の形）、`current` の完全一致 | `entries/api.ts`、`handlers/allowances/*` | 単体テスト（NFR4.86、NFR4.88） |
| `role: system` の型（`ReadContext`／`FamilyScope`）、本人の補いの条件 | `requireMembership.ts`、`familyMemberService.ts`、`allowanceService.ts` | `tsc`、型のテスト、単体テスト（NFR2.73、NFR4.90） |
| 許可した項目だけの組み立て | `allowanceService.ts`（`assembleAllowances`） | JSON の項目名の完全一致のテスト（NFR4.91） |
| `Cache-Control: no-store` | `handlers/allowances/getAllowances.ts`、`lib/http.ts`、`entries/api.ts` | ヘッダーのテスト、既存の入口が無修正で通ること（NFR4.92） |
| 読み取りの段（最大 4 段）、Families 1 回、10 並行 | `allowanceService.ts`、`familyMemberService.ts`、`lib/promise.ts` | 回数と並行のテスト（NFR7.55、NFR7.56、NFR3.18） |
| 全体を投げる、`NOT_FOUND` だけを結果にする | `allowanceService.ts` | 読み取りを 1 つずつ失敗させるテスト（NFR2.68） |
| 式（`amount`、`total`）、マイナスをそのまま | `assembleAllowances` | 純粋な関数のテスト（NFR2.69、BR10.5） |
| 異常の検出と 20 行の上限 | `tallyDuties`（記録）、`allowanceService.ts`（ログ） | ログのテスト（NFR2.70、NFR2.75） |
| 名前・金額を残さない | `allowanceService.ts` のログ、`logger` の型 | 目印の文字・数字が全行にないテスト（NFR2.76） |
| 日本時間（`now` を 1 回、`current`、`firstMonth`、`lastMonth`） | `entries/api.ts`、`handlers/allowances/params.ts`、`deriveRange` | 時計を差し替えたテスト（NFR11.10） |
| 月の移動（250 ms、連番、重ね出しの抑止） | `hooks/useAllowanceMonth.ts` | 差し替えた時計の画面のテスト（NFR2.72、NFR7.53） |
| 金額の表示を 1 か所に | `shared/yen.ts` | 単体テスト（NFR8.18） |
| 画面の構造・読み上げ・コントラスト | `AllowancePage.tsx`、`theme.ts` | Testing Library、コントラストの計算、手の確認（NFR9.10〜NFR9.12） |
| 構成が変わらない | `infrastructure` | CDK のテスト（NFR1.36） |

## 他の単位との約束

| 相手 | 約束 |
|------|------|
| U10（お知らせ） | 月末のまとめは `getAllowances(ctx: { familyId, role: 'system' }, month)` を呼ぶ。`SystemContext` を作る関数は U10 の入口が持つ。`getAllowances` は失敗したら投げる。U10 は `takeRequestMetrics` を要求の終わりに呼び、`ALLOWANCE_*` と `REQUEST_ERROR` を 15 分以内の知らせの対象に入れる（`observability-design.md`）。`formatYen` を使い回す |
| U11（加算・減額） | `getAllowances` の `options.adjustments`（`AdjustmentSource`）に、家族の月ごとに 1 回で `Map<childUserId, 行[]>` を返す本物を取り付ける。読み取りは段 2 に加わる（4 本目）。`adjustments` の行の項目の許可は U11 が確定する。確定している月の加算・減額の拒否は `isMonthConfirmed` を使う。マイナスは `lines` ではなく `adjustments` の行として描く |
| U8（代わりにやる） | `mapWithConcurrency` を移すが、名前・並行数・フックの動きは変えない |
| U1〜U7 | `listMembers` の戻り、`RouteResult` の既存の応答、`FamilyContext` と書き込みの窓口の型は変えない |

## Infrastructure Design へ渡すこと

- **足すもの: なし。** 新しいテーブル・索引・Lambda・ログのグループ・指標・アラーム・SSM のパラメータ・環境変数・権限を足さない（NFR1.36）
- 権限の確認（`infrastructure/lib/app-stack.ts` を読んで確かめた）: `api` は `Users` の `GetItem`・索引 `familyId-index` の `Query`、`Families` の `GetItem`、`Calendar` の `GetItem`・`Query`、`ChoreTypes` の `Query` を既に持つ。U9 は書き込みの命令を使わない。環境変数（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`・`USERS_TABLE`・`FAMILIES_TABLE`）は U1〜U8 で足し済みと読んだ。Infrastructure Design では、コード生成が「U9 で差分がない」ことを CDK のテストで固定できる形になっているかを確かめる
- `line` の Lambda には何も足さない。`scheduled` の Lambda は U10 が足す（必要な読み取りの権限も U10 で足す）
- 配信（CloudFront）: `/v1/*` は CACHING_DISABLED のまま（変えない）。S5 の画面の塊は既存の S3 と CloudFront の配信に載る
- 画面の配信物: S5 を `React.lazy` の別の塊にする。ビルドの設定は変えない
- 元に戻す手順: 前の版のコードを通常の流れで再び反映する。データの移行も削除も要らない。U10 が `getAllowances` を使い始めたあとは、U10 を先に戻す

## Sources

- `construction/u9-allowance/nfr-requirements/`（performance・security・scalability・reliability・observability の各要件と tech-stack-decisions）、`traceability.json`
- `construction/u9-allowance/nfr-design/`（performance-design・security-design・scalability-design・reliability-design・observability-design）
- `construction/u9-allowance/functional-design/functional-spec.md`（契約への追加、次の単位への引き継ぎ、配備）、`rules.md`、`entities.md`
- `inception/contract-design/contract-summary.md`（C1、C6〜C10）
- `construction/u8-swap/nfr-design/logical-components.md`（形の手本）
- 既存コード（読んで確かめた）: `entries/api.ts`、`lib/http.ts`、`lib/promise.ts`、`lib/logger.ts`、`middleware/requireMembership.ts`、`services/familyMemberService.ts`、`services/choreTypeService.ts`、`services/calendarService.ts`、`services/dutyReassignedHook.ts`、`repositories/calendarRepository.ts`、`hooks/useMonthCalendar.ts`、`pages/CalendarPage.tsx`、`api/client.ts`、`infrastructure/lib/app-stack.ts`、`eslint.config.js`

## Assumptions & Open Questions

- [assumption] `calendarService` に C8 の `listDoneDuties`・`isMonthConfirmed` を足す判断は、機能設計の契約への追加（「作るもの」）に従います。`allowanceService` がこれらを使わず `loadMonth` を直接使うのは、Query を 2 回にしないためです。窓口の置き場所は、U5 の `calendarService` の並びに合わせてコード生成で確かめ、契約 C8 の置き場所が別なら合わせます
- [assumption] 環境変数（`CALENDAR_TABLE` など）の名前は、`app-stack.ts` の `USERS_TABLE` と `lineFunction` の U6 のコメント（「Calendar・ChoreTypes を読み書きするための環境変数」）から、`api` にも U5 までに足し済みと読んだものです。名前の全部は読み切っていないので、CDK のテストで確かめます
- [assumption] 画面のファイルの置き場所（`pages/AllowancePage.tsx`、`hooks/useAllowanceMonth.ts`）と `shared/yen.ts` の名前は、既存の並びに合わせた提案です。コード生成で既存の命名に合わせて変えてよい
- [assumption] S5 を開く道（`App.tsx` の振り分け）の形は、既存の `App.tsx` のページの切り替えに合わせます。URL のパスを新しく作るか、画面の状態で切り替えるかは、コード生成で既存の形を読んで選びます
- 人に聞くことは、このファイルにはありません
