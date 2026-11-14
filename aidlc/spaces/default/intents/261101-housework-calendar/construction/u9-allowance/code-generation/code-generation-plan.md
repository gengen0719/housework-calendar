# コード生成の計画 — U9 お小遣いの額

## Summary

- Builds: 子供ごと・月ごとのお小遣いの額を、「状態が済」の担当に書き写された単価 × 回数を種類ごとに合計して、内訳つきで見せる**読み取りだけ**の機能（何も保存しない）。家族のメンバー全員が、家族の全員分を同じ画面（S5）で見られる。作るもの: 窓口 `getAllowances(ctx, month)`（`Allowance[]`）と `getAllowanceMonthView`（画面用）を持つ `allowanceService`（純粋な関数 `tallyDuties`・`assembleAllowances`・`deriveRange`）、入口 `GET /v1/months/{month}/allowances`（`YYYY-MM` または `current`。成功の 200 だけ `Cache-Control: no-store`）、`ALLOWANCE_*` のログ（種類ごとに 20 行まで）、画面 S5（`AllowancePage`、`useAllowanceMonth`＝250 ms の静まり・連番・`AbortController`）、金額の表示 `formatYen`。土台として、`mapWithConcurrency` を `lib/promise.ts` へ移す（失敗のあとに新しい項目を始めない旗つき。U8 の動きは変えない）、`RouteResult` の任意の `headers`、`FamilyScope`／`SystemContext`／`ReadContext` の型、`loadFamilyAndMembers` の分け出し（Families を 1 回だけ読む）、`findDisplayName`・`getFamilyCreatedAt`、C8 の `listDoneDuties`・`isMonthConfirmed`。反映の確かめとして `scripts/smoke-check.sh` に 3q を 1 件足す（全 23 件 → 24 件）。最初の手順で、`docs/contract-changes-u9.md` に契約の置き換え（`Allowance`、応答の包み直しの例外の理由）を残す
- Touches: `packages/shared/src/`（`api-types.ts`、`messages.ts`、`yen.ts`〈新設〉、`index.ts`）、`packages/backend/src/`（`entries/api.ts`、`lib/http.ts`、`lib/promise.ts`、`middleware/requireMembership.ts`〈型だけ〉、`services/allowanceService.ts`〈新設〉、`services/familyMemberService.ts`、`services/choreTypeService.ts`〈型だけ〉、`services/calendarService.ts`〈窓口の追加〉、`services/dutyReassignedHook.ts`〈再公開〉、`handlers/allowances/getAllowances.ts`・`params.ts`〈新設〉）、`packages/frontend/src/`（`pages/AllowancePage.tsx`〈新設〉、`hooks/useAllowanceMonth.ts`〈新設〉、`api/client.ts`、`pages/CalendarPage.tsx`、`App.tsx`、`theme.ts`〈色が足りないときだけ〉）、`infrastructure/test/u9-allowance/stacks.test.ts`〈新設〉、`scripts/smoke-check.sh`（3q と見出し）、`README.md`、`docs/contract-changes-u9.md`〈新設〉、`docs/manual-check-u9.md`〈新設〉。`infrastructure/lib/`（`app-stack.ts`・`data-stack.ts`・`app.ts`）、`line` の Lambda、`.github/workflows/` は**変えない**
- Tests: Gherkin の筋書き（バックエンド 6 本・画面 2 本）で機能設計の S1〜S35 のうち自動で確かめられるもの（S33 の 3 秒の測定を除く）、部品ごとの単体テスト 5〜8 件、CDK のスタックの組み立てのテスト約 14 件（前後で同じことを固定。IAM の文の数は `api` 11・`line` 9）。Vitest で行カバレッジ 80% 以上。U1〜U8 のテストは、期待を書き換えずに通ったまま

## 前提

- 設計: `construction/u9-allowance/functional-design/`（`functional-spec.md`〈S1〜S35〉、`rules.md`〈BR10.1〜BR10.19〉、`entities.md`）、`nfr-requirements/`、`nfr-design/`（`security-design.md`、`reliability-design.md`、`observability-design.md`、`performance-design.md`、`scalability-design.md`、`logical-components.md`）、`infrastructure-design/`（`infrastructure-specification.md`、`cicd-pipeline.md`、`monitoring-design.md`）
- U1〜U8 のコードに足す。U1〜U8 の動きは変えない。U1〜U8 のテストの期待は書き換えない（`mapWithConcurrency` の移動は再公開で名前と並行数を保ち、U8 のテストを無修正で通す）
- U9 は**読み取りだけ**で、DynamoDB に書かない。書き込みの命令（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）を 0 回にし、テストで固定する（NFR4.89）。LINE の API は呼ばない（`fetch` が 0 回。NFR5.16）
- 新しい依存は足さない（金額の表示は `Intl.NumberFormat('ja-JP')`、並行数の制限は既存の自前の関数、日付は `shared/jstDate.ts`）
- **インフラは変えない**（NFR1.36、NFR4.89）。`app-stack.ts`・`data-stack.ts`・`app.ts`、IAM、環境変数、テーブル、索引、CloudFront は足さない。CDK のテストの期待に「U9 で差分がない」ことを入れる（Step 41）。変えるのはスモークチェック 1 件と README と文書だけ
- **応答の形の例外**: 契約の `Allowance`（`lines` に `kind: chore | adjustment`）は案で誰も使っておらず、応答を `AllowanceMonthView` に包むのは本来「壊す変更」（`/v2` を足して古いほうを残す）に当たるが、使う人がいないので `/v2` を作らずに置き換える。これは作り手が承認した例外で、理由は `docs/contract-changes-u9.md` に同じ文で残す（Step 1）。この計画の承認の対象ではない
- S5 に確定のボタンは置かない（U7 がカレンダーに置いた。BR10.9）。加算・減額のボタンは U11。LINE のトークで額を返す機能は作らない（Q5）
- 加算・減額の差し込み口（`AdjustmentSource`）の既定は「どの子供にも空」。U9 は常に空で動き、テストの中だけで本物の代わりを取り付けて S27〜S29 を確かめる
- `.gitignore`、`AGENTS.md`、`.github/workflows/` は変えない。コードを実際に書くのは、この計画の承認のあと
- 新しい秘密の情報はない（NFR5.16）。**秘密の値の決まり（この計画とテストで守る）:** 秘密の値の例は、文書では必ず `<作り物の値>` と書く。テストで使う作り物の値（UUID の形の家族 ID・利用者 ID・担当 ID・種類 ID、`YYYY-MM` の月、鍵らしく見える値）と、ログの伏せ字の確かめに使う目印（表示名・種類の名前・金額の目印）は、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置き、**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付けて**、テストからは import して使う（直書きは ESLint の `no-restricted-syntax` が止める）。テストの前提データに本物の ID・表示名・額を入れない（NFR5.17）

## 承認のときに決めてほしい 3 点

この計画の承認の場で、人が次の 3 点を確かめます。どれも設計で決まっている内容で、既定（この計画が前提にしている答え）を書きます。変えたいときだけ、承認のときに指示してください。

### 確認点 1: パスの月に `current` を使えるようにする（`GET /v1/months/current/allowances`）

- 内容: S5 を S1 を経由せずに直接開くとき（ブックマークなど）、先にカレンダーを呼ばずに 1 回の呼び出しで済ませるため、`{month}` に `current`（完全一致）を許す。裏側が日本時間の今日の月として扱い、答えの `month` と `today` に実際の値を入れる。`2027-1` や `Current` は `current` として扱わず 422 `INVALID_MONTH`。スモークチェックの 3q も `current` を使う
- **既定は「使う」**（設計どおり）。外す場合は、S5 を直接開くとき端末の時計に頼るか、カレンダーを先に呼ぶ（2 回の読み）ことになり、BR10.8・BR10.16・NFR4.88・NFR7.53 と S35 を直す必要がある。承認の場で外すと決まったら、Step 27・29・33・39 とこれらの設計の文書を直してから進める

### 確認点 2: 成功の応答に `Cache-Control: no-store` を付ける

- 内容: 額の応答が途中（ブラウザなど）に残らないようにする二重の備え。CloudFront の `/v1/*` は CACHING_DISABLED のまま。`RouteResult` に任意の `headers` を足し、`json()` が追加のヘッダーを受け取る。**付けるのは `GET .../allowances` の成功（200）だけ**で、既存の入口の応答と、エラーの応答（額も名前も入らない）は変えない（ADR-U9-05）
- **既定は「付ける」**（設計どおり）。付けない場合は Step 12 のうち `json()` と `RouteResult` の変更を外せるが、NFR4.92 の確かめと手での確かめ 13 を外すことになる。エラーにも付けたい場合は `json()` の呼び出しを 1 か所足すだけで直せる

### 確認点 3: `role: system` の型の足し方（U10 の月末のまとめのため）

- 内容: `FamilyContext`（`{ familyId, userId, role: Role }`）と `requireMembership` の戻りは**変えない**。`middleware/requireMembership.ts` に、家族だけを決める `FamilyScope`、お知らせ用の裏側の `SystemContext`（`role: 'system'`）、読み取りの窓口が受ける `ReadContext = FamilyContext | SystemContext` を足す。`getAllowances`・`listMembers`・`loadFamilyAndMembers` は `ReadContext`、`findFamilyChild`・`findDisplayName`・`getFamilyCreatedAt`・`choreTypeService.list`・C8 の読み取りは `FamilyScope`、書き込みは `FamilyContext` のまま（`system` を渡すと `tsc` が落ちる）。`SystemContext` を作る関数は U10 が持ち、U9 は型だけ（`handlers/**`・`entries/api.ts` は import しない）
- **既定は「この形」**（設計どおり）。`FamilyContext` に `system` を足す案は、`ctx.userId` を使う多数の窓口の型が全部 `string | undefined` になるため採らない。名前と置き場所は、既存の並びに合わせてコード生成で変えてよい（「書き込みは `FamilyContext` のまま」「`requireMembership` の戻りを変えない」の 2 点は守る）

## Testing Contract
```json
{
  "version": 1,
  "methodology": "bdd",
  "source": "team",
  "ordering": "機能ごとに、先に利用者目線の Given/When/Then の筋書き（シナリオ）を書き、そのシナリオがすべて通るまで実装します。",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "greenfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: bdd\n- **Methodology evidence**: Q4 で「先に『こう動けばよい』という利用者目線の筋書きを書き、それに沿って作る（BDD）」が選ばれ、まとめの確認でも「Looks correct」と承認されました。\n- **Ordering**: 機能ごとに、先に利用者目線の Given/When/Then の筋書き（シナリオ）を書き、そのシナリオがすべて通るまで実装します。\n- 行カバレッジ 80% 以上を下限とします。（Q5）\n- プルリクエストを `main` に取り込む前に、GitHub Actions の CI でテストを実行し、失敗したら取り込みません。（Q5、Q2）\n- 選んだテストの量（Test Strategy）はそのまま適用し、上の下限はそれに追加するもので、減らすものではありません。\n- Build and Test では、カバレッジの下限と品質の目標を確かめます。通すために下限を下げることはしません。\n- テストの道具（シナリオを動かす道具やテストの実行環境）は、まだ決めていません。設計の段階で決めます。"
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "bdd",
    "runner_step": "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
      "Behavior scenarios - define executable examples for the observable feature slice before implementation.",
      "Feature slice - implement the required data, repository, business, API, and frontend layers.",
      "Behavior scenarios - run the scenarios until they pass.",
      "Feature slice - refactor while the scenarios stay green.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:94fcd7035691658956c71e255df5c82038d33b7ccf3c41fd6057f8f8d34fcec7",
  "contract_sha256": "sha256:3d8bf1680d2ab6a2f969ca114cd0d9226f3e81b28a3029acf4c20ae4b786b58f"
}
```

## テストを動かすコマンド

- **この単位だけ**（リポジトリのルートで。詳細は `unit-test-instructions.md`）。U9 のテストはすべてパスに `u9-allowance` を含むフォルダに置く:

```bash
npx vitest run u9-allowance --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

- **この project の確認コマンド**（各 batch の終わりと最後の Step 47 で実行する）:

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## 手順

筋書き（`.feature`）は、機能の切れ目ごとに実装の前に書き、その筋書きが通るまで、その切れ目の層（リポジトリ、業務の決まり、受け口、画面）をまとめて作ります（BDD）。純粋な関数・型・文字の組み立てなど、筋書きでは細かく確かめにくいものの単体テストは、筋書きが通ったあとに足します。切れ目は次の順です: 共有の型・文言・金額の表示（Batch 2）→ 土台の部品（並行数の関数・応答のヘッダー・文脈の型。Batch 3）→ 家族の読み取りと C8 の窓口（Batch 4）→ お小遣いの計算（Batch 5）→ 入口（Batch 6）→ 画面（Batch 7）。

Testing Contract の 8 つの骨組みとの対応: 1 構成と本番設定の骨組み = Step 2、2 テストの実行環境とコマンドの記録 = Step 3〜5、3 振る舞いの筋書き = Step 6・10・15・21〜22・27・32〜33、4 機能の切れ目の実装 = Step 7・11〜13・16〜17・23〜24・28〜29・34〜36、5 筋書きを通す = Step 8・14・18・25・30・37、6 緑のまま整理 = Step 9・19〜20・26・31・38、7 環境・ビルドの設定 = Step 39〜41、8 文書と traceability = Step 1・42〜47。Step 1 は、BDD の筋書きの前に済ませる契約の確認と `docs/contract-changes-u9.md` の作成です（NFR8.19）。

各手順の末尾に、実装する BR10.x / NFR / AC の ID を付けます。

---

### Batch 1: 契約の確認・土台（Step 1〜5）

*契約の置き換えの記録、テストの置き場所、偽の DynamoDB の確認、権限の確認。BR10.14、NFR1.36、NFR4.89、NFR5.17、NFR8.17、NFR8.19 の準備*

- [x] **Step 1: 契約の確認と `docs/contract-changes-u9.md` の作成**（BR10.7、NFR8.19）
  - 読んで確かめる: `inception/contract-design/contract-summary.md` の C1（`Allowance`、`GET /months/{month}/allowances`）、C6（`listMembers`・`findFamilyChild`）、C7（`list`）、C8（`listDoneDuties`・`isMonthConfirmed`）、C9（`getAllowances`）、C10（文言）。`packages` にまだ `Allowance`・`allowances` の入口・`listDoneDuties`・`isMonthConfirmed`・`findDisplayName`・`getFamilyCreatedAt`・`FamilyScope` がなく、誰も使っていないことを `grep` で確かめる（計画の作成時点では 0 件だった）
  - `docs/contract-changes-u9.md` を新設する（U8 の `contract-changes-u8.md` の形に揃える）。先に書く節:
    - 「置き換え」: `Allowance` を Q6 の形（`childUserId`・`displayName`・`current`・`month`・`lines`〈`choreTypeId`・`choreName`・`unitPrice`・`count`・`amount`〉・`adjustments`〈`adjustmentId`・`amount`・`reason`〉・`total`）に置き換えた
    - 「応答の形の例外」: `GET /months/{month}/allowances` の応答を `Allowance[]` から `AllowanceMonthView`（`month`・`confirmed`・`today`・`firstMonth`・`lastMonth`・`allowances`）に包んだ。本来は壊す変更に当たるが、まだ誰も使っていない入口なので `/v2` を作らずに置き換えた。作り手が承認した例外である（契約に「`Allowance` の中身は U9 の設計で決める」という文言があるわけではない）。窓口 `getAllowances` の戻りは契約どおり `Allowance[]`
    - 残りの節（`current`、`findDisplayName`、`getFamilyCreatedAt`、`loadFamilyAndMembers`、`listMembers` の `role: system` 対応、`Cache-Control: no-store` と `RouteResult.headers`、`mapWithConcurrency` の移動、文言、`formatYen`）は Step 42 で完成させる
  - 承認の確認点 1〜3 の結果をこの文書に記録する枠を置く

- [x] **Step 2: 骨組みと設定の置き場所**（NFR5.17、NFR8.17）
  - U9 のテストのフォルダを作る:
    - `packages/shared/test/u9-allowance/`
    - `packages/backend/test/u9-allowance/`（と `helpers/`）
    - `packages/frontend/test/u9-allowance/`
    - `infrastructure/test/u9-allowance/`
  - 作り物の値の置き場所を確認・追加する（上の「秘密の値の決まり」）:
    - `packages/backend/test/fixtures/fakeSecrets.ts`: 家族 ID（2 種類。ほかの家族の確かめ用）、管理者・子供 3 人・抜けた子供・メンバーでない人の利用者 ID、種類 ID（4 種類以上）、担当 ID、`YYYY-MM` の月、署名つきのセッションに使う作り物のシークレット（U5〜U8 のものがあれば再利用）。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける
    - ログの伏せ字の確かめ用の**目印**（`<作り物の値>` の目印を付けた表示名・種類の名前・単価・金額の数字）も同じ場所に置く
    - `packages/frontend/test/fixtures/` にも、画面のテストで使う作り物の名前・金額を置く（既存の置き方に合わせる）
  - `packages/backend/test/u9-allowance/helpers/` を作る:
    - `seed.ts`: 家族（管理者 1 人、子供 3 人。友だち登録済み）、種類（皿洗い 100 円・風呂掃除 150 円・洗濯物たたみなど。「使う」と「使わない」）、月の担当（未・済・×。`unitPrice` あり・なし〈異常〉・0 円。`childUserId` が今いる子供・抜けた子供・管理者。日付は月の初日・末日・月またぎ）、月の状態（確定／未確定／行なし）、家族の作成時刻、抜けた子供（`Users` の家族の欄が空または別の家族）を `Calendar`・`ChoreTypes`・`Users`・`Families` に直接置く関数
    - `clock.ts`: `setNow(iso)`／`resetNow()`（U8 の `vi.useFakeTimers({ toFake: ['Date'] })` の使い方に合わせる）。日本時間の境（UTC 15 時の前後、月末、年またぎ、うるう年）を作れる
    - `logs.ts`: `console` への出力を集め、目印の文字・数字が全行に含まれないことを確かめる関数（U8 の同種の補助を再利用して足す）
    - `session.ts`: 署名つきのセッションで `entries/api.ts` の `handler` を呼ぶ補助（U5〜U8 のものを再利用）

- [x] **Step 3: テストの実行環境の準備とコマンドの記録**（NFR8.17）
  - U1〜U8 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（`vitest.config.ts` は変えない。`thresholds.lines: 80` は下げない。新しい道具は入れない）。画面のテストは U7 と同じ（`jsdom`、Testing Library、`*.steps.tsx`）
  - 偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`）が U9 の読み方に対応していることを確かめ、足りなければ補助を足す（U1〜U8 のテストの期待は変えない）:
    - 月の `Query`（`begins_with`、強い整合性、続きのページ）、`Users` の `GetItem`（強い整合性）と `familyId-index` の `Query`、`Families` の `GetItem`、`ChoreTypes` の `Query`
    - 読み取りの呼び出しの記録（`hooks.readLog`・`hooks.readTargets`。表・操作ごとの回数の上限の確認に使う）
    - **書き込みの命令の見張り**: `PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem` のどれかが呼ばれたら書かずに失敗にする（U8 の `forbiddenCalls` を広げる）。`Scan`・`BatchGetItem` も同じ
    - 読み取りを 1 つずつ失敗させる差し込み（`hooks.failRead(table, operation)`）と、読み取りの完了を遅らせる差し込み（並行・段の確認用）
  - 最初の空の筋書き 1 つ（`packages/backend/test/u9-allowance/runner-ready.feature` と steps）で、「この単位だけ」のコマンドが動くことを確かめ、コマンドを `unit-test-instructions.md` に記録する（NFR8.17）

- [x] **Step 4: 既存のテストが通ったままかを確かめる**
  - Step 2〜3 の変更のあと、U1〜U8 のバックエンド・共有・画面・インフラのテストがすべて通ることを確かめる:
    ```bash
    npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm u8-swap
    ```
  - 落ちたら補助の変更を直す（U1〜U8 のテストの期待は変えない）
  - `runner-ready.feature` と steps を消す

- [x] **Step 5: 権限と環境変数が足りていることを `app-stack.ts` で確かめる**（BR10.14、NFR4.89、NFR1.36）
  - `infrastructure/lib/app-stack.ts` を**読むだけ**で、設計の結論（インフラの変更なし）を再確認する:
    - `api` の Lambda: `Users`（表の `GetItem`・`PutItem`・`UpdateItem`、`lineUserId-index`・`familyId-index` の `Query`）、`Families`（`GetItem` ほか）、`ChoreTypes`（`Query` を含む 6 操作）、`Calendar`（`GetItem`・`Query` を含む 6 操作）。環境変数 `USERS_TABLE`・`FAMILIES_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE`
    - `api` に `Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*`、`Resource: "*"` の DynamoDB の文がない。IAM の文の数が `api` 11・`line` 9（U8 の後のまま）
    - CloudFront の `/v1/*` が CACHING_DISABLED、`SpaRewrite` が `/v1/` を触らない（`current` がそのまま届く）
  - 足りていれば何も変えない。**不足があれば、コードを書かずに止めて**、`nfr-design/security-design.md` に戻る必要があると人に報告する（インフラは U9 で変えない前提）。結果は `code-summary.md` に書く

---

### Batch 2: 共有パッケージの型・文言・金額の表示（Step 6〜9）

*BR10.5、BR10.7、BR10.10、BR10.11、NFR4.91、NFR8.18、NFR8.19、NFR9.10 の準備*

- [x] **Step 6: 単体テストと型のテストを書く（共有パッケージ）**（BR10.5、BR10.10、BR10.11、NFR4.91、NFR8.18）— `packages/shared/test/u9-allowance/`:
  - `yen.test.ts`（5〜8 件）: `formatYen(1400)`＝「1,400円」、`0`＝「0円」、`-200`＝「-200円」（**半角のハイフン**。U+2212 でない。`Intl` が別の記号を返す環境を想定して、絶対値を整形して `-` を前に付ける自前の組み立てを確かめる）、大きい数（`Number.MAX_SAFE_INTEGER` の桁区切り）、小数・`NaN`・`Infinity` を渡したときの扱い（整数だけを受ける。型と実行時の両方）、0 円を下回っても 0 円にそろえない
  - `messages.test.ts`（5〜8 件）: 見出し「{年}年{月}月のお小遣い」（0 埋めなし。`2027-01` → 「2027年1月のお小遣い」）、「確定していません」、「今月の記録はまだありません（0 円）」、「この月の記録はまだありません（0 円）」、「お小遣いを表示する子供がまだいません」、「（あなた）」、「名前が分からない子供」、「不明なお手伝い」が機能設計の表のとおりで、既存の文言（`MONTH_CONFIRMED_LABEL`＝「確定済み」、`NOT_FAMILY_MEMBER`、`INVALID_MONTH`、失敗の文言）が消えていないこと
  - `api-types.test.ts`（5 件。型のテスト）: `AllowanceMonthView`・`Allowance`・`AllowanceChoreLine`・`AllowanceAdjustmentLine` の項目名が許可した一覧と**完全に一致**すること（`expectTypeOf`）。`Allowance` に LINE の ID・役割・家族 ID・管理者の情報がないこと。`Role` に `system` が混ざっていないこと（`@ts-expect-error`）

- [x] **Step 7: 作る（共有パッケージ）**（BR10.5、BR10.7、BR10.10、BR10.11、NFR8.18、NFR8.19）— `packages/shared/src/`:
  - `api-types.ts`: `AllowanceChoreLine`（`choreTypeId`・`choreName`・`unitPrice`・`count`・`amount`）、`AllowanceAdjustmentLine`（`adjustmentId`・`amount`・`reason`）、`Allowance`（`childUserId`・`displayName`・`current`・`month`・`lines`・`adjustments`・`total`）、`AllowanceMonthView`（`month`・`confirmed`・`today`・`firstMonth`・`lastMonth`・`allowances`）を足す。`Role` は変えない
  - `yen.ts`（名前は既存の並びに合わせる）: `formatYen(amount: number): string`。`Intl.NumberFormat('ja-JP')` で絶対値を桁区切りにし、負のときだけ半角の `-` を前に付けて「円」を後ろに付ける
  - `messages.ts`: 上の文言を、値を入れる形の関数（見出し）と定数（ほか）として足す。`index.ts` の再公開を確認する

- [x] **Step 8: 通す、整える（共有パッケージ）**
  - Step 6 のテストが通るまで直す
  - U1〜U8 の共有のテストが通ることを確かめる（既存の `messages.test.ts` は、文言を足す以外の期待を変えない）

- [x] **Step 9: 共有の batch の確認**
  - この batch の確認コマンドを実行する（`packages/frontend` の型検査が、`api-types.ts` の追加で壊れないことも含む）

---

### Batch 3: 土台の部品（並行数の関数・応答のヘッダー・文脈の型）（Step 10〜14）

*BR10.7、BR10.16、NFR2.73、NFR3.18、NFR4.90、NFR4.92、NFR7.56、ADR-U9-01、ADR-U9-04、ADR-U9-05 の実装*

- [x] **Step 10: 筋書きと単体テストを書く（土台）**（NFR3.18、NFR4.90、NFR4.92）— `packages/backend/test/u9-allowance/`:
  - `promise.mapWithConcurrency.test.ts`（5〜8 件）: 上限が 1・2・4・10・件数より大きいとき、空の一覧、結果の順序（結果を返す場合）、**失敗のあとに新しい項目を始めない旗**（旗を立てたとき、1 件が投げたら、まだ始めていない項目の `worker` が呼ばれず、投げたエラーが呼び出し側に伝わる。旗を立てないときは従来どおり投げない `worker` で全件が呼ばれる）、同時に動く数が上限を超えない（時間のかかる関数の中のカウンターで数える）
  - `dutyReassignedHook.reexport.test.ts`（5 件）: `dutyReassignedHook.ts` が `mapWithConcurrency`・`clampConcurrency`・`DUTY_HOOK_CONCURRENCY` を同じ名前で再び公開していること、U8 の並行数の筋書き（`swap-hooks.feature`）と `mapWithConcurrency.test.ts` が**無修正**で通ること
  - `http.json.test.ts`（5〜8 件）: `json(status, body)` の戻りが前後で同じ（`content-type` だけ）、`json(status, body, { 'cache-control': 'no-store' })` で追加のヘッダーが付く、追加のヘッダーに `content-type` を渡しても `content-type: application/json` が勝つ（追加を先に、`content-type` を後に書く）、`errorResponse` の戻りが変わらない
  - `contextTypes.test.ts`（5 件。型のテスト）: `requireMembership` の戻りが `FamilyContext`（`role` は `admin`／`child` のみ）、`ReadContext` が `FamilyContext | SystemContext`、書き込みの窓口に `{ familyId, role: 'system' }` を渡すコードが型で落ちる（`// @ts-expect-error`）、`choreTypeService.list` に `FamilyScope` を渡せる、`handlers/**` と `entries/api.ts` が `SystemContext` を import していない（`grep` の代わりに、ソースを読んで確かめるテスト）

- [x] **Step 11: 作る（`mapWithConcurrency` の移動）**（NFR3.18、NFR7.56、ADR-U9-04）— `packages/backend/src/lib/promise.ts`（変更）、`services/dutyReassignedHook.ts`（変更）:
  - `mapWithConcurrency<T>(items, limit, worker, options?)` を `lib/promise.ts` に移す。`options.stopAfterFailure`（既定は偽）を足し、真のときは、`worker` が投げたあと、まだ始めていない項目を取り出さない（投げたエラーは `Promise.all` で呼び出し側へ）
  - `dutyReassignedHook.ts` は `mapWithConcurrency` を `lib/promise.ts` から import し、**同じ名前で再び公開する**（`export { mapWithConcurrency } from '../lib/promise'`）。`clampConcurrency`・定数・`notifyDutyReassigned` の動きと型は変えない（`worker` が投げない U8 のフックの動きは同じ）

- [x] **Step 12: 作る（`json()` の追加ヘッダーと `RouteResult.headers`）**（NFR4.92、ADR-U9-05）— `lib/http.ts`、`entries/api.ts`（変更）:
  - `json(statusCode, body, extraHeaders?)`: `headers: { ...extraHeaders, 'content-type': 'application/json' }`（追加を先に、`content-type` を後に書く）。`errorResponse` は変えない
  - `entries/api.ts`: `RouteResult` に任意の `headers?: Record<string, string>` を足し、`return json(result.status, result.body, result.headers)` にする。`headers` を持たない既存の入口の戻りは前後で同じ。`routes` の既存の行は 1 行も変えない（allowances の行は Step 29）
  - `NO_STORE_HEADERS = { 'cache-control': 'no-store' }` を `handlers/allowances/` の側に置く（Step 29。`lib/http.ts` に置くかは既存の並びに合わせる）

- [x] **Step 13: 作る（文脈の型）**（NFR2.73、NFR4.90、ADR-U9-01）— `middleware/requireMembership.ts`、`services/choreTypeService.ts`（型だけ）:
  - `FamilyScope { familyId: string }`、`SystemContext extends FamilyScope { role: 'system' }`、`ReadContext = FamilyContext | SystemContext` を足す。`FamilyContext` と `requireMembership` は**変えない**
  - `choreTypeService.list` の引数の型を `FamilyScope` に広げる（本体は変えない）。`SystemContext` を作る関数は足さない（U10 が持つ）

- [x] **Step 14: 通す、整える（土台）**
  - Step 10 のテストが通るまで直す
  - U1〜U8 の全テストが**無修正で**通る（特に U8 のフックの並行数、U1〜U7 の入口の応答、U4 の種類の一覧）
  - この batch の確認コマンドを実行する

---

### Batch 4: 家族の読み取りと C8 の窓口（Step 15〜20）

*BR10.6、BR10.8、BR10.16、BR10.19、NFR2.73、NFR4.90、NFR7.55、ADR-U9-02 の実装*

- [x] **Step 15: 筋書きを書く（家族の読み取りと C8 の窓口）**（BR10.6、BR10.8、BR10.19、NFR2.73、NFR7.55）— `packages/backend/test/u9-allowance/`:
  - `family-reads.feature` と `family-reads.steps.ts`（約 14 場面）:
    - `loadFamilyAndMembers(ctx)` が、Families を **1 回だけ**読み（`GetItem` の回数 1）、家族の項目（作成時刻）とメンバー（管理者が最初、続けて子供を家族に入った順、同じ時刻は表示名、userId の順）を返す
    - `listMembers(ctx)` の戻り（並び・本人の補い・LINE のユーザー ID を返さない）が**前後で同じ**（U1・U2 の既存のテストが無修正で通る）
    - 結果整合の索引に本人が出ないとき、`ctx.role !== 'system'` なら `Users` を強い整合性で読んで補う。`role: system` の ctx では本人の補いの `GetItem` が **0 回**（`ctx.userId` を読む前に型で絞る）
    - `findDisplayName(ctx, userId)` が、`Users` の強い整合性の `GetItem` から**表示名の文字列だけ**を返す。見つからなければ `NOT_FOUND`。戻りの型に LINE のユーザー ID・役割・家族 ID・友だち状態が含まれない
    - `getFamilyCreatedAt(ctx)` が `ctx.familyId` の作成時刻（UTC）だけを返す。家族の記録がなければ投げる
    - C8 の `listDoneDuties(ctx, month)` が、月の `Query` の結果から「済」で `unitPrice` を持つ担当だけを返す（「未」「×」と、単価のない「済」は返さない）。`isMonthConfirmed(ctx, month)` が月の状態の `confirmed`（行がなければ偽）を返す
    - 抜けた子供の確かめ: `findFamilyChild` は利用者がいない・ほかの家族・管理者のどれも同じ `NOT_FOUND`（既存の動き）
    - 書き込みの命令が 0 回（見張り）

- [x] **Step 16: 作る（`familyMemberService` の分け出し）**（BR10.16、NFR2.73、NFR7.55、ADR-U9-02）— `services/familyMemberService.ts`（変更）:
  - `loadFamilyAndMembers(ctx: ReadContext)`: Families を 1 回読み、`familyRepository.findById` の結果から家族の項目とメンバー（既存の並び替えを使う）を返す。本人の補いは `ctx.role !== 'system'` のときだけ
  - `listMembers(ctx: ReadContext)`: `loadFamilyAndMembers` の `members` だけを返す薄い関数にする（**戻りは今のまま**）。家族の記録がないときの投げ方も今のまま
  - `findDisplayName(ctx: FamilyScope, userId)`: `userRepository.findById(userId, { consistent: true })` の表示名だけを `Result<string, 'NOT_FOUND'>` で返す。呼び出しは `allowanceService` の 1 か所だけ（コメントに理由を書く）
  - `getFamilyCreatedAt(ctx: FamilyScope)`: `familyRepository.findById(ctx.familyId)` の作成時刻（UTC）だけを返す。`allowanceService` の本線では `loadFamilyAndMembers` の結果を使い、この関数を別に呼ばない（Families を 2 回にしない）
  - `findFamilyChild` の型を `FamilyScope` に広げる（本体は変えない）

- [x] **Step 17: 作る（C8 の窓口）**（BR10.2、BR10.14、NFR7.55）— `services/calendarService.ts`（窓口の追加）、`repositories/calendarRepository.ts`（足りなければ純粋な補助だけ）:
  - `listDoneDuties(ctx: FamilyScope, month)`: `loadMonth` を使う薄い窓口。「済」で `unitPrice` を持つ担当を返す。`isMonthConfirmed(ctx: FamilyScope, month)`: 月の状態の `confirmed`（行なしは偽）。U10・U11 向けの窓口で、`allowanceService` は自分の `loadMonth` の結果を使い、これらを**別に呼ばない**（Query を 2 回にしない）
  - リポジトリは既存の `loadMonth`・`getMonthState`（強い整合性）で足りるか確かめる。足りなければ、純粋な絞り込みの関数だけを `calendarRepository` に足す（書き込みの関数は足さない）。`userRepository`・`familyRepository` は既存の関数で足りる（新しい読み取りの関数を足す場合も `GetItem`／`Query` だけ）

- [x] **Step 18: 通す（家族の読み取りと C8 の窓口）**
  - Step 15 の筋書きが通るまで直す
  - U1〜U8 の `listMembers`・`calendarService` のテストが無修正で通ったまま

- [x] **Step 19: 単体テスト（家族の読み取り・C8 の窓口）**（BR10.6、BR10.19、NFR7.55）— `packages/backend/test/u9-allowance/`:
  - `loadFamilyAndMembers.test.ts`（5〜8 件）: Families の `GetItem` が 1 回、`Users` の `Query` が 1 回、本人の補いの有無で `GetItem` の回数が変わる（通常 +0〜1、`role: system` は 0）、並び順の最終決め、家族の記録がないときの投げ方
  - `findDisplayName.test.ts`（5 件）: 表示名だけを返す、`NOT_FOUND`、戻りに余分な項目がない（`Object.keys`）
  - `listDoneDuties.test.ts`（5〜8 件）: 「済」だけ、単価なしの「済」は返さない、0 円は返す、月は担当の `date` の月（12 月 31 日の担当を 1 月に記録しても 12 月）、続きのページを最後まで読む、月の状態の行がない月は `isMonthConfirmed` が偽

- [x] **Step 20: 家族の読み取りの batch の確認**
  - この batch の確認コマンドを実行する（U1〜U8 が通ったままであること）

---

### Batch 5: お小遣いの計算（`allowanceService`）（Step 21〜26）

*AC8.1.1〜AC8.1.4、AC5.1.13、BR10.2〜BR10.7、BR10.12、BR10.13、BR10.15、BR10.16、BR10.19、NFR2.67〜NFR2.71、NFR2.74〜NFR2.76、NFR7.55、NFR7.56、NFR11.10 の実装*

- [ ] **Step 21: 筋書きを書く（計算）**（AC8.1.1、AC8.1.3、AC8.1.4、AC5.1.13、BR10.2〜BR10.5）— `packages/backend/test/u9-allowance/`:
  - `allowance-calc.feature` と `allowance-calc.steps.ts`（約 30 場面。機能設計の S1、S3〜S16、S24 の計算の部分、S34）:
    - S1: 皿洗い 100 円 8 回と風呂掃除 150 円 4 回 → 800 円・600 円、合計 1,400 円（AC8.1.1）。整数だけ（S3。AC8.1.3）
    - S4・S5: 100 円 3 回のあと単価を 120 円に変えて 1 回 → 2 行と合計 420 円。さらに 200 円に変えても 2 行と合計は同じ（今の単価を使わない。AC8.1.4、AC2.1.4）
    - S6・S7: 記録で 3 回 → 4 回（400 円）、取り消しで 3 回に戻る（保存した合計に頼らない。AC5.1.13、BR10.12）。強い整合性で読む（読み取りの引数を確かめる）
    - S8: 「未」「×」「済」が 1 件ずつ → 「済」だけが数に入る
    - S9・S10: 管理者が「済にする」した担当は担当の子供の額。花子の担当を次郎が引き受けて記録 → 次郎の額で花子の額に入らない（記録した人は見ない。BR10.3）
    - S11・S12: 種類の名前を変えても行は分かれない。「使わない」にした種類の過去の月の行が名前つきで残る（AC2.1.5）
    - S13: 行の順は種類の並び（「使う」を登録した順、続けて「使わない」）→ 同じ種類では単価の低い順
    - S14: 単価 0 円の「済」2 回 → 「0円 x 2回 = 0円」の行が出る。異常のログは出ない
    - S15・S16: 12 月 31 日の担当を 1 月 2 日に記録 → 12 月の額。1 月 31 日 23:59 と 2 月 1 日 0:00（日本時間）の担当 → それぞれ 1 月と 2 月
    - 同じ読み取りを 2 回繰り返しても、間に記録がなければ同じ答え（BR10.14）
  - `allowance-children.feature` と steps（約 14 場面。S2、S17〜S19、S34）:
    - S17: 管理者・太郎・花子・次郎 → 行は太郎・花子・次郎（家族に入った順）。管理者の行はない
    - S2: 次郎の「済」がない → 行はあり、`lines` が空、合計 0（AC8.1.2）
    - S18・S19: 抜けた子供の「済」がある月は名前つきで今いる子供の後ろに（`current: false`）。「済」がない月は行が出ない。名前が読めない抜けた子供は「名前が分からない子供」
    - 抜けた子供の並びは表示名、userId の順。子供がひとりもいない家族 → `allowances` は空
    - S34: `{ familyId, role: 'system' }` の ctx で `getAllowances` を呼ぶと、家族の全員分が返る（管理者でなくてよい。`Users` の本人の補いの `GetItem` が 0 回）
  - `allowance-adjust-slot.feature` と steps（約 6 場面。S27〜S29）:
    - S27: 差し込み口に太郎へ -200 円を返すテスト用の取り付け → `adjustments` に 1 行、合計 1,200 円（800 + 600 - 200）
    - S28: 次郎は 100 円 x 1 回と -300 円 → 合計 -200 円（0 円にそろえない）
    - S29: 差し込み口が空 → `adjustments` は空、合計は内訳の和。差し込み口が投げたら全体が失敗（一部だけ返さない）

- [ ] **Step 22: 筋書きを書く（異常・読み取りの回数・失敗・ログ）**（BR10.13、BR10.15、BR10.16、NFR2.68、NFR2.70、NFR2.74〜NFR2.76、NFR7.55、NFR7.56）— `packages/backend/test/u9-allowance/`:
  - `allowance-anomaly.feature` と steps（約 12 場面。S14、S30、S30b）:
    - S30: 「済」なのに `unitPrice` が空（`undefined` または `null`）→ 数えない。`ALLOWANCE_DUTY_WITHOUT_PRICE`（`familyId`・`dutyId`）が残る。画面（答え）は返る
    - 種類が一覧にない「済」→ 名前「不明なお手伝い」で一覧の最後に並べ、`ALLOWANCE_CHORE_TYPE_MISSING`（`familyId`・`choreTypeId`）が種類ごとに 1 行
    - S30b: 担当の子供が管理者の ID → 行を作らず、`ALLOWANCE_DUTY_OWNER_NOT_CHILD`。`findFamilyChild`・`findDisplayName` を呼ばない。管理者でも今いる子供でもない ID（抜けた子供）は S18 のとおり行が出る
    - 異常のログは種類ごとに **20 行まで**（`ANOMALY_LOG_LIMIT`）。300 件の担当がすべて異常でも各種類 20 行、合計 60 行以下。省いた分も `anomalyCount` に全数が入る。先頭は `sk` の順（日付、種類の ID の順）で毎回同じ
  - `allowance-reads.feature` と steps（約 14 場面。S31）:
    - 読み取りの段: 最初に月の `Query`・`loadFamilyAndMembers`・種類の `list` の 3 つを**同時に**始める（遅延の差し込みで、待ち時間が足し算にならないことを確かめる）。段は最大 4 段（3 つ → 抜けた子供の確かめ → 加算・減額 → 組み立て）。呼び出しの回数: 通常 5〜6 回、抜けた子供 k 人で +2k 回、書き込みは 0 回
    - 抜けた子供の確かめ（`findFamilyChild` → `findDisplayName`）は子供ごとの連なりで、`OWNER_LOOKUP_CONCURRENCY`（10）並行まで。1 人が投げたら新しい確かめを始めない（`stopAfterFailure`）
    - 失敗は全体を投げる: 月の `Query`／`Families`／`Users`／種類の `list`／差し込み口のどれを失敗させても `getAllowances` が投げる（一部だけ返さない）。`findFamilyChild` の `NOT_FOUND` だけは結果として扱い、「名前が分からない子供」で行を出す。ほかの失敗は投げる
    - 異常のログは計算が成功したあとにまとめて出す（途中で失敗した要求では、異常の行も `ALLOWANCE_COMPUTED` も出ない）
    - 担当が 300 件、家族の子供 10 人、種類 10 個でも、読み取りの回数が担当の数で増えない
    - ログ: `ALLOWANCE_COMPUTED`（`familyId`・`month`・`childCount`・`lineCount`・`dutyCount`・`doneCount`・`departedChildCount`・`anomalyCount`・`durationMs` ほか、`observability-design.md` の 10 項目）が 1 要求 1 件。表示名・種類の名前・LINE の ID・単価・小計・合計・加算・減額の値が全行に含まれない（目印の文字・数字）。`setRequestMetrics` の `dutyCount` が入る

- [ ] **Step 23: 作る（`services/allowanceService.ts`）**（BR10.2〜BR10.7、BR10.12、BR10.13、BR10.15、BR10.16、BR10.19、NFR2.67〜NFR2.71、NFR7.56、NFR8.19、ADR-U9-03、ADR-U9-04、ADR-U9-07）— `packages/backend/src/services/allowanceService.ts`（新設）:
  - 純粋な関数（時計・DynamoDB・`logger` を呼ばない）:
    - `tallyDuties(duties, ...)`: 「済」だけを取り出し（単価が `undefined`／`null` は数えず異常に記録、0 円は有効）、`childUserId` ごとに `(choreTypeId, unitPrice)` でまとめて `count`・`amount = unitPrice × count` を作り、異常の一覧（単価なし・持ち主が管理者・種類なし）を返す
    - `assembleAllowances(...)`: 対象の子供（今いる子供の全員 + 「済」のある抜けた子供）を並べ（今いる子供は家族に入った順、抜けた子供は表示名、userId の順）、行を種類の並び → 単価の低い順に並べ、`adjustments` を付け、`total = lines の和 + adjustments の和` を計算する。0 円を下回ってもそのまま。許可した項目だけを 1 つずつ書いて組み立てる（NFR4.91）
    - `deriveRange(createdAtUtc, todayJst)`: `firstMonth`（作成時刻を日本時間の月にしたもの）と `lastMonth`（今日の月の翌月）
  - 定数 `OWNER_LOOKUP_CONCURRENCY = 10`、`ANOMALY_LOG_LIMIT = 20`。差し込み口の型 `AdjustmentSource = (ctx: FamilyScope, month: string, childUserIds: readonly string[]) => Promise<ReadonlyMap<string, readonly AllowanceAdjustmentLine[]>>`（既定は空の `Map`。形は U11 が取り付けやすいようにコード生成で確定し、`contract-changes-u9.md` に残す）
  - `loadAllowances(ctx, month, options)`（内部）: 最初の段で `calendarRepository.loadMonth`・`loadFamilyAndMembers`・`choreTypeService.list` を同時に始める（`Promise.all`）。次の段で、一覧にいない持ち主を、まず管理者の一覧と突き合わせ、残りを `mapWithConcurrency`（`OWNER_LOOKUP_CONCURRENCY`、`stopAfterFailure`）で `findFamilyChild`（`NOT_FOUND` なら `findDisplayName`、それも `NOT_FOUND` なら「名前が分からない子供」）。続いて差し込み口。`calendarService` の C8 の窓口は呼ばず、`loadMonth` の結果を使う
  - 窓口: `getAllowances(ctx: ReadContext, month, options?)`＝`Allowance[]`。`getAllowanceMonthView(ctx, month, { today, ... })`＝`confirmed`（月の状態、行なしは偽）・`today`・`firstMonth`・`lastMonth` を添えた `AllowanceMonthView`。失敗は投げる。成功したあとに、異常の行（`warn`）→ `ALLOWANCE_COMPUTED`（`info`）を 1 件出す。`logger` の `LogData` に名前・金額を渡さない
  - `allowanceService` は `lineApiService`・`swapService`・書き込みの窓口・`calendarService` を import しない（読み取り専用の境界。NFR4.89）

- [ ] **Step 24: 通す（計算の筋書き）**
  - Step 21・22 の筋書きが通るまで直す
  - U1〜U8 の `calendarService`・`recordingService`・`familyMemberService` のテストが通ったまま

- [ ] **Step 25: 単体テスト（`allowanceService` の部品）**（NFR8.19、NFR4.89、NFR4.91、NFR2.76）— `packages/backend/test/u9-allowance/`:
  - `tallyDuties.test.ts`（5〜8 件）: 空、単価 0 円、単価なし（`undefined`・`null`）、同じ種類で単価が 2 つ、持ち主が管理者、種類が一覧にない、`count` が整数
  - `assembleAllowances.test.ts`（5〜8 件）: 並び順（今いる子供・抜けた子供・種類・単価）、`total` の式（`adjustments` が負でも）、0 円を下回っても 0 円にそろえない、許可した項目名だけ（`Object.keys` が一覧と完全一致。管理者の情報・LINE の ID が入らない）、空の `allowances`
  - `deriveRange.test.ts`（5〜8 件）: 作成が UTC 15:00 の前後（日本時間では翌日・翌月になる）、月末、年またぎ、うるう年、今日が 12 月のとき `lastMonth` が翌年 1 月
  - `allowanceService.imports.test.ts`（5 件）: `allowanceService.ts` の import に `lineApiService`・`swapService`・`calendarService`・書き込みのリポジトリの関数がない（ソースを読んで確かめる）。書き込みの命令が 0 回（見張り）。`fetch` が 0 回
  - `allowanceLogs.test.ts`（5〜8 件）: 成功・異常 3 種・失敗（ログが出ない）・上限 20 行、項目名が許可した一覧と完全一致、目印の文字・数字が全行にない

- [ ] **Step 26: 計算の batch の確認**
  - この batch の確認コマンドを実行する

---

### Batch 6: 入口（ハンドラー・月の読み方・振り分け表）（Step 27〜31）

*AC8.1.1〜AC8.1.3、BR10.1、BR10.8、BR10.9、BR10.13、NFR4.86〜NFR4.88、NFR4.91〜NFR4.93、NFR8.19、NFR11.10、ADR-U9-05 の実装*

- [ ] **Step 27: 筋書きを書く（入口）**（BR10.1、BR10.8、BR10.9、BR10.13、NFR4.86〜NFR4.88、NFR4.91〜NFR4.93、NFR11.10）— `packages/backend/test/u9-allowance/`:
  - `allowance-api.feature` と `allowance-api.steps.ts`（約 24 場面。署名つきのセッションで `entries/api.ts` の `handler` を呼ぶ。S20〜S26、S31、S35）:
    - 確かめの順番: セッションなし → 401、ブロック中 → 403 `NOT_FRIEND`、家族のメンバーでない → 403 `NOT_FAMILY_MEMBER`（額も内訳も返らず、DynamoDB の月の読み取りも 0 回）、月の形が違う（`2027-13`、`abc`、`2027-1`、`Current`、`current ` の空白つき）→ 422 `INVALID_MONTH`（DynamoDB を読まない）。確かめの順番を入れ替えると落ちる（月が不正でもセッションなしは 401）
    - 母親も子供も 200 で、家族の全員分が返る（S20・S21。自分の行だけに絞らない。AC4.1.3）。ほかの家族の子供・種類・担当が応答に出ない（家族はセッションから決まる。クエリ・本文を読まない）
    - `month=current`: 日本時間の今日の月として扱い、答えの `month` と `today` に実際の値が入る（UTC 15 時の前後〈JST 23:59／0:00〉、月末、年またぎで確かめる）。`current` でも先にカレンダーを呼ばない（呼び出しの回数）。端末の時計・要求のヘッダーの日付を使わない
    - 答えの `confirmed`: 確定している月は真、していない月・月の状態の行がない月は偽（S24・S25）。額は確定の有無で変わらない
    - 範囲: `firstMonth` は家族の作成時刻を日本時間の月にしたもの、`lastMonth` は今日の月の翌月（S26）。範囲外の月（`lastMonth` より先、`firstMonth` より前）を指定しても 200 で計算して返す（記録がなければ今いる子供が 0 円）
    - 応答の JSON の項目名が許可した一覧と完全一致（管理者の情報・LINE の ID・家族 ID が入らない）
    - ヘッダー: 成功の 200 に `cache-control: no-store` と `content-type: application/json`。401・403・422・500 には `cache-control` が付かない。既存の入口（`GET /v1/months/:month/calendar` など）の応答のヘッダーが前後で同じ
    - 失敗: 読み取りが失敗 → 500 `INTERNAL`（本文は決まった文で、名前・金額を含まない）、`REQUEST_ERROR` が 1 件、異常のログと `ALLOWANCE_COMPUTED` は出ない（S31）。思いがけない例外の文に名前・金額が入らない
    - 振り分け表に `'GET /v1/months/:month/allowances'` の 1 行だけが足され、`PUT`・`PATCH`・`POST`・`DELETE` の allowances は 404（書き込みの入口がない）
    - 同じ要求を 2 回送っても、間に記録がなければ同じ答え（`Idempotency-Key` は要らない）

- [ ] **Step 28: 作る（月の読み方とハンドラー）**（BR10.1、BR10.8、NFR4.86〜NFR4.88、NFR8.19）— `packages/backend/src/handlers/allowances/params.ts`・`getAllowances.ts`（新設）:
  - `params.ts`: `resolveMonthParam(raw, now)`: `'current'`（完全一致）なら `monthOfDate(jstDateOf(now))`、それ以外は既存の `requireMonthParam(raw)`（形が違えば 422 `INVALID_MONTH`）。検証後の値だけからキーを作る
  - `getAllowances.ts`: 薄い入口。`requireMembership(auth)`（`requireAdmin` は通さない）→ `resolveMonthParam` → `allowanceService.getAllowanceMonthView(ctx, month, { today: jstDateOf(now), ... })` → **本文（`AllowanceMonthView`）だけを返す**。`now` は入口で 1 回取ったものを受け取る（端末の時計・`new Date()` の直接呼びを使わない）。`handlers/**` から `SystemContext` を import しない

- [ ] **Step 29: 作る（振り分け表）**（NFR4.92、NFR8.19、ADR-U9-05）— `entries/api.ts`（変更）:
  - `'GET /v1/months/:month/allowances'` を **1 行**足す（先頭で `requireAuth`、`{ status: 200, body: await getAllowances(auth, params.month ?? '', now), headers: NO_STORE_HEADERS }`）。コメントは既存の並びに合わせる。ほかの行は変えない

- [ ] **Step 30: 通す（入口の筋書き）**
  - Step 27 の筋書きが通るまで直す
  - U1〜U8 の入口の筋書き（`getCalendar`・`confirmMonth`・LINE の入口を含む）が無修正で通ったまま。`registerSwapHooks` の登録（`entries/api.ts`）が壊れていない

- [ ] **Step 31: 単体テスト（入口）、整える**（NFR4.86、NFR4.88、NFR4.92）— `packages/backend/test/u9-allowance/`:
  - `resolveMonthParam.test.ts`（5〜8 件）: `current` の完全一致、`Current`・`current `・`CURRENT`・空文字・`2000-00`・`2101-01` は 422、日本時間の境（UTC 14:59:59／15:00:00 の前後、12/31 → 1/1、2/29）
  - `getAllowances.handler.test.ts`（5〜8 件）: `requireMembership` の失敗がそのまま伝わる、`now` を 1 回だけ使う、`requireAdmin` を通らない
  - `routes.allowances.test.ts`（5 件）: 振り分け表のキーに allowances の `GET` だけがある、`RouteResult.headers` を持たない既存の入口の戻りが前後で同じ
  - この batch の確認コマンドを実行する

---

### Batch 7: 画面 S5（Step 32〜38）

*AC8.1.1〜AC8.1.3、AC4.1.3、AC4.1.5、AC4.1.7、BR10.8〜BR10.13、NFR1.38、NFR2.72、NFR4.92、NFR7.52、NFR7.53、NFR8.18、NFR9.10〜NFR9.12、NFR11.11、ADR-U9-06 の実装*

- [ ] **Step 32: 筋書きと単体テストを書く（画面の月の移動）**（BR10.8、BR10.12、NFR1.38、NFR2.72、NFR7.53、ADR-U9-06）— `packages/frontend/test/u9-allowance/`:
  - `allowance-month-move.feature` と `allowance-month-move.steps.tsx`（約 12 場面。S32、S35。差し替えた時計 `vi.useFakeTimers` と差し替えた `fetch`）:
    - 直接開く → `month=current` の 1 回だけ（`calendar` を呼ばない）。S1 から開く → `MonthCalendar.today` の月で 1 回
    - [<] [>] を続けて押す → 最後の押しから **250 ms** 待ってから、最新の目標の月だけを要求する（途中の月は要求しない）。押すたびに目標の月だけを更新する
    - 要求には連番を付け、**最新の連番の答えだけ**を描く。古い連番の答えが遅れて届いても捨てる。飛んでいる要求の答えが静まりの間に届く場面を含む
    - 重ね出しの抑止: 飛んでいる要求（連番が最も新しい要求）の月が目標の月と同じときだけ重ねて出さない。2 月の要求中に 3 月を出してから 2 月に戻ると、新しい連番で 2 月の要求を出して描く（古い連番の 2 月の答えは捨てる）
    - 月を移している間は、直前の月の内容を薄く残さず、読み込み中を出す。古い要求は `AbortController` で取り消す
    - 範囲: 答えの `firstMonth` で [<]、`lastMonth` で [>] が無効（`disabled`）。無効のボタンを押しても何も起きない。読み込み中も押せる（端の月を除く）
    - 先読みも自動の読み直し（ポーリング・月の変わり目の自動の切り替え）もしない。「読み込み直す」を押したときだけ同じ月でもう一度読む。端末の時計を別の月にしても、答えの `today` の月で文言が決まる（NFR11.11）
  - `useAllowanceMonth.test.tsx`（5〜8 件）: 連番、静まり、`AbortController`、`reload`、範囲の保持、アンマウント時の後始末

- [ ] **Step 33: 筋書きと単体テストを書く（画面の表示）**（AC8.1.1〜AC8.1.3、AC4.1.3、AC4.1.5、AC4.1.7、BR10.9〜BR10.11、BR10.13、NFR9.10〜NFR9.12）— `packages/frontend/test/u9-allowance/`:
  - `allowance-page.feature` と `allowance-page.steps.tsx`（約 20 場面。Testing Library の役割での検索）:
    - S1: 見出し（h1）「2027年1月のお小遣い」、子供ごとの見出し（h2）「太郎 1,400円」、内訳（`ul`／`li`）「皿洗い 100円 x 8回 = 800円」「風呂掃除 150円 x 4回 = 600円」。見える文字を `aria-label` で別の文に置き換えない
    - 単価が変わった月は「皿洗い 100円 x 3回」「皿洗い 120円 x 1回」の 2 行（AC8.1.4）
    - 確定の文字: 見出しのすぐ下に、偽なら「確定していません」、真なら「確定済み」。色だけで示さない。「暫定」などの別の言葉・色を足さない
    - 記録のない子供: 合計「0円」と「今月の記録はまだありません（0 円）」。今日の月でない月は「この月の記録はまだありません（0 円）」（答えの `today` の月で決める）。`lines` が 0 円の行だけのときは文を出さず行を出す。`allowances` が空 → 「お小遣いを表示する子供がまだいません」
    - 子供で見る → 自分の行を太字と緑の枠で目立たせ、見出しに「（あなた）」。兄弟の行も見える。管理者で見る → 目立たせる行はなく、管理者自身の行もない。S5 に確定・加算・減額のボタンがない
    - マイナスの合計（`adjustments` を含む答えを差し替えで作る）→ 「-200円」（半角のハイフン）で、0 円にそろえず、色だけで示さない。`total` をそのまま出し、画面で足し算しない
    - 読み込み中は `role="status"`、失敗は `role="alert"` で「表示できませんでした。もう一度お試しください」と「読み込み直す」。押すと同じ月でもう一度読む。403 は「このアプリは家族のメンバーだけが使えます」、401 は共通の扱い
    - [<] [>] は `aria-label`「前の月」「次の月」。「戻る」でカレンダーに戻る。S1 の「お小遣い」の入口がメンバー全員（母親も子供も）に出る
    - 名前・種類の名前を HTML として差し込まない（`<script>`・タグを含む名前が文字として出る。`react/no-danger`）
  - `client.allowances.test.ts`（5 件）: `getAllowances(token, month, signal?)` の URL が `/v1/months/<月>/allowances` で月だけ（`encodeURIComponent`）、`signal` の受け渡し、クエリ・本文を送らない
  - `theme.allowance.test.ts`（5〜8 件）: S5 の色の組み合わせ（自分の行の緑の枠を含む）の文字と背景の差が 4.5:1 以上、緑の枠と背景が 3:1 以上、ボタンの押す場所が 44×44 ピクセル以上（U1・U7 のテーマのテストを S5 の色に広げる）
  - `formatYen` が画面の全部の金額に使われている（画面のテストで桁区切り・マイナスを確かめる。表示が U10・U11 と食い違わない）

- [ ] **Step 34: 作る（API クライアントと月の移動の部品）**（NFR4.92、NFR7.53、ADR-U9-06）— `packages/frontend/src/`:
  - `api/client.ts`: `getAllowances(token, month, signal?)`（`AllowanceMonthView`）。URL は `/v1/months/<month>/allowances` で月だけ。既存の `monthPath` を使う
  - `hooks/useAllowanceMonth.ts`（新設）: 最初の月（S1 から → `MonthCalendar.today` の月、直接 → `current`）、目標の月、250 ms の静まり、連番（最新の連番の答えだけを描く）、最新の連番の要求の月が目標の月と同じときだけ重ねて出さない、`AbortController` による古い要求の取り消し、`reload`、答えの `firstMonth`・`lastMonth` の保持、状態（`loading`／`ready`／`error`）。先読みも自動の読み直しもしない。端末の時計は使わない

- [ ] **Step 35: 作る（S5 の画面）**（BR10.9〜BR10.11、NFR7.52、NFR9.10、NFR9.11）— `pages/AllowancePage.tsx`（新設）:
  - `React.lazy` の別の塊として読み込まれる形にする（S1 の初期表示を重くしない）。h1（見出し）、[<]・[>]（`aria-label`、端で `disabled`）、確定の文字、子供ごとの h2（名前・合計・「（あなた）」）、内訳の `ul`／`li`、`role="status"`／`role="alert"`、「読み込み直す」、「戻る」
  - 金額は `formatYen`、文言は `MESSAGES`／共有の関数から。`dangerouslySetInnerHTML` を使わない。色・大きさは `theme.ts` から（足りなければ S5 の色だけを足し、コントラストのテストを通す）。加算・減額・確定のボタンは置かない

- [ ] **Step 36: 作る（S1 の入口と画面の切り替え）**（NFR7.53、NFR11.11）— `pages/CalendarPage.tsx`、`App.tsx`（変更）:
  - `CalendarPage`: 「お小遣い」の入口（`onOpenAllowance`）をメンバー全員に出す。押したときの月は `MonthCalendar.today` の月を渡す。ほかの動き・`data-testid` は変えない
  - `App.tsx`: 既存のページの切り替え（`showSettings` などの状態）の形に合わせて S5 を開く道を足す。S5 を直接開くとき（`today` を持たない）は `current`。URL のパスを新しく作るか画面の状態で切り替えるかは、既存の形を読んで選び、`code-summary.md` に書く。S5 の読み込みは `React.lazy` + `Suspense`
  - 画面のテストの前提（U1〜U7 の `CalendarPage`・`App` のテスト）が、入口を足しても無修正で通る

- [ ] **Step 37: 通す（画面の筋書き）**
  - Step 32・33 の筋書きが通るまで直す
  - U1〜U8 の画面のテストが無修正で通ったまま。`npm run build`（画面のビルド）が通り、S5 が別の塊になっていることを確かめる

- [ ] **Step 38: 整える（アクセシビリティ・先読みなし）**（NFR9.10〜NFR9.12、NFR1.38）
  - 色の差・押す場所・読み上げの名前を、テストと目で確かめる。ステージングでの目と読み上げの確認は `docs/manual-check-u9.md` の確かめ 16
  - 先読み・ポーリング・月の自動の切り替えがないことを、通信の回数のテストで確かめ済みであることを確認する
  - この batch の確認コマンドを実行する

---

### Batch 8: 反映の確かめ・インフラのテスト・書類（Step 39〜43）

*NFR1.36、NFR4.89、NFR6.10、NFR7.50〜NFR7.58、NFR10.11、NFR10.12 の実装（前後で同じことを固定）*

- [ ] **Step 39: スモークチェックに 3q を足す**（NFR4.86、NFR10.11）— `scripts/smoke-check.sh`（変更）:
  - 3p のあとに足す（`cicd-pipeline.md` のとおり）:
    ```bash
    # 3q. U9 のお小遣いの読み取りがセッションなしで 401（書き込みはしない）。
    # month は current（本物の月ではない。パスの current が CloudFront を通って api に届くことも分かる）
    check "GET /v1/months/:month/allowances (セッションなし)" 401 "${base}/v1/months/current/allowances"
    ```
  - 見出し（2 行目）を「全 24 件: …、3n〜3p が U7 の 3 件、3q が U9 の 1 件」に直す。署名もシークレットも要らない（スクリプトに秘密を持たせない）。確認点 1 で `current` を外す場合は、月を `2000-01` にする
  - 期待が 401 になるのは、認証が月の形より先に走る順番（Step 27 の筋書きで確かめ済み）による

- [ ] **Step 40: README の件数と U9 の節**（NFR7.57、NFR10.12）— `README.md`（変更）:
  - **件数の直し方は 1 つ**: 各単位の節（U4・U5・U6・U7・U8 の「全 23 件」〈385・428・499・542・564 行目付近〉）は「その単位の時点の件数」として**そのまま残す**。直すのは、ファイル一覧の `scripts/smoke-check.sh` の行（14 行目付近。「反映後の確かめ（4 つ）」→「（全 24 件）」）と、新しく書く U9 の節（「U9 のあとは全 24 件」）だけ
  - U9 の節を足す: お小遣いの画面（S5）の使い方（カレンダーの「お小遣い」から。月の移動）、`GET /v1/months/{month}/allowances`（`current` も可。`Cache-Control: no-store`）、手での確かめ `docs/manual-check-u9.md` への案内（**まだ実行していない**と書く）、3 秒の測り方（NFR7.57。入口ごとに 20 回、冷たい起動 10 回以上、`Init Duration` の読み方、画面録画〈1 秒 30 コマ以上〉から読み取る、除外しない、家族 2 つの用意の仕方、環境変数や設定を手で書き換えてコールドスタートを作らない）、U9 の反映後の S1 の測り直し（NFR7.20）、Logs Insights の検索の例（`monitoring-design.md` の問い合わせ 1〜6。`filter` を `stats` より前に置く）と問い合わせ 7（生の行）、DynamoDB の呼び出しの回数の取り方（`AWS/DynamoDB` の `SuccessfulRequestLatency` の `SampleCount`）、元に戻し方（U10 が `getAllowances` を使い始めたあとは U10 を先に戻す）
  - 「テストの動かし方」に `npx vitest run u9-allowance` を足す

- [ ] **Step 41: スタックのテストを書いて通す（前後で同じことを固定）**（NFR1.36、NFR4.89、NFR6.10）— `infrastructure/test/u9-allowance/stacks.test.ts`（新設、U8 の同ファイルと同じ作り、約 14 件）:
  - `infrastructure/lib/app-stack.ts`・`data-stack.ts`・`app.ts` は**変えない**。既存のままテストが通ることを確かめる（通らなければテストの期待を直す。インフラ定義は変えない）
  - `api` の `Users`（表: `GetItem`・`PutItem`・`UpdateItem`、索引 `lineUserId-index`・`familyId-index`: `Query`）、`Families`（`GetItem`・`PutItem`・`UpdateItem`・`ConditionCheckItem`）、`ChoreTypes`・`Calendar`（それぞれ 6 操作）が U8 のまま。`api` に `Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*`、`Resource: "*"` の DynamoDB の文がない
  - `api` の環境変数が U8 のまま（`USERS_TABLE`・`FAMILIES_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE` を含む）で、新しい環境変数がない。`line` の権限と環境変数が U8 のまま
  - **IAM の文の数が U8 の後と同じ（`api` 11、`line` 9）**。害のない文が 1 つ増える変更や、同じ操作を別の表に足す変更もここで拾う
  - SSM の読み取りの許可が `api`: `jwt/*`・`line/*`・`cloudfront/*`、`line`: `line/*`・`cloudfront/*` のまま
  - CloudFront の `/v1/*` の `CachePolicy` が CACHING_DISABLED のまま、振り分けの数（`/v1/*`・`/line/webhook`）と `AllowedMethods` が変わらない。U8 までのテストにない確かめは、このテストで新しく足す
  - ステージングの `api` が本番のテーブルの ARN を含まない。`api`・`line` とも MemorySize 256・Timeout 30・ARM64 のまま、`reservedConcurrency` をコンテキストで与えないとき予約が付かない
  - ロググループの保管 30 日、テーブル 8・Lambda・ロググループ・`AWS::Logs::MetricFilter` 1 つ・アラーム 0 件が U8 の後と同じ。本番の `Calendar` が `DeletionPolicy = Retain` のまま
  - `npx vitest run infrastructure/test/u9-allowance/stacks.test.ts` が通ること。既存の CDK のテスト（`u4-chore-types`・`u5-assignment-calendar` の `it.skip` を含む）は触らない

- [ ] **Step 42: 書類（契約の変更・手での確かめ）**（NFR7.50〜NFR7.58、NFR10.11、NFR10.12）:
  - `docs/contract-changes-u9.md`（Step 1 で新設した冒頭の節に足して完成させる。U8 の形式に揃える）: 「置き換え」「応答の形の例外」（Step 1）、`functional-spec.md` の「契約への追加」の表（C1 の入口と `current`、C6 の `findDisplayName`・`getFamilyCreatedAt`・`loadFamilyAndMembers`、`listMembers` の `role: system` 対応、C8 の `listDoneDuties`・`isMonthConfirmed`、C9 `getAllowances`、C10 の文言、`formatYen`）、`FamilyScope`／`SystemContext`／`ReadContext`（書き込みの窓口は変えない）、`RouteResult` の任意の `headers` と `Cache-Control: no-store`（既存の応答は変えない）、`mapWithConcurrency` の `lib/promise.ts` への移動（再公開。U8 の動きは同じ）、`AdjustmentSource` の形（U11 が取り付ける）、承認の確認点 1〜3 の結果。壊す変更がないこと
  - `docs/manual-check-u9.md`（新設）: `cicd-pipeline.md` の「ステージングでの手での確かめ」の **16 件**を、手順書の形にする（準備: ステージング用の公式アカウントと作り手だけの家族、管理者と子供の役割のテスト用の利用者 2 人以上、測定用に家族をもう 1 つ〈家族 2 つ。NFR7.57〉。データはアプリの画面と LINE の操作で作り、直接書き換えない〈NFR6.10〉／確かめ 1〜16 の「操作」「期待」「見るログ」〈`monitoring-design.md` の問い合わせの番号〉「結果を書く欄」／3 秒の測り方〈確かめ 14。端末は LIFF と外部ブラウザの両方、入口 (a) S1 から (b) 直接 (c) 月の移動 20 回〈[<] 10・[>] 10、うち 5 回は「読み込み直す」も〉 (d) 大きい月、各 20 回中 10 回以上は 30 分以上あけた冷たい起動、`Init Duration` で数える、画面録画 1 秒 30 コマ以上、失敗した回も除外しない、合格は画面録画だけ〉／S1 の測り直し〈確かめ 15〉／届かないときの順番〈(1) 読み取りの並行の確認、(2) 配信物の大きさ、(3) 起動時の読み込みの整理、(4) Lambda のメモリ 256→512 MB〉）。本物の ID・トークンを書かない（例は `<作り物の値>`）。結果の置き場所は `build-and-test` の成果物
  - 手での確かめが **16 件**であること（`cicd-pipeline.md` の表の 1〜16）を、文書の冒頭に書く

- [ ] **Step 43: 費用と秘密の確かめ**（NFR1.36、NFR5.16、NFR5.17）
  - U9 のコードに LINE の API（reply・push・multicast・broadcast・プロフィール取得）への通信が 0 回であること、書き込みの命令が 0 回であることを、テスト（Step 3 の見張りと `fetch` の見張り）で確かめ済みであることを `code-summary.md` に書く
  - 秘密の確かめ: U9 で足したファイル・文書・テストに本物の鍵・トークン・ID・表示名・額がなく、作り物の値は `fakeSecrets.ts` だけにあり、文書は `<作り物の値>` と書いていること。gitleaks（`.gitleaks.toml`）の設定を変えない
  - DynamoDB の追加費用の見積もり（月に 1 円に満たない）の根拠は `scalability-design.md` のまま。料金の単価を公式の料金表で確かめて数を `docs/contract-changes-u9.md` に残す（確かめられなければ「未確認」と書く）
  - この batch の確認コマンドを実行する

---

### Batch 9: 追跡・まとめ・全体の確認（Step 44〜47）

- [ ] **Step 44: traceability.json**（AC8.1.1〜AC8.1.4、AC5.1.13、BR10.1〜BR10.19、NFR）
  - `traceability.json`（`code-generation-plan.md` の隣に新設）: 受け入れ条件（AC8.1.1〜AC8.1.4、AC5.1.13。あわせて確かめる AC4.1.3・AC4.1.5・AC4.1.7・AC1.1.11・AC2.1.4・AC2.1.5）、BR10.1〜BR10.19、割り当てられた NFR（NFR1.36〜NFR1.38、NFR2.67〜NFR2.77、NFR3.17〜NFR3.19、NFR4.86〜NFR4.93、NFR5.16〜NFR5.17、NFR6.10、NFR7.50〜NFR7.58、NFR8.17〜NFR8.19、NFR9.10〜NFR9.12、NFR10.11〜NFR10.12、NFR11.10〜NFR11.11）と ADR-U9-01〜07 を、実装・テストのファイルと対応させる。各 `OK` の target は実在するファイル 1 つ。3 秒の目標（S33、NFR7.50〜NFR7.52）は「設計まで。計測はステージング」として `docs/manual-check-u9.md` を target にし、その旨を注記する

- [ ] **Step 45: source-manifest.json**
  - `source-manifest.json`（`code-generation-plan.md` の隣に新設）: U9 が作る・変えるすべてのアプリケーションソースのパスを列挙する（`packages/shared/src/api-types.ts`・`messages.ts`・`yen.ts`・`index.ts`、`packages/backend/src/**` の上の一覧、`packages/frontend/src/**` の上の一覧、`packages/*/test/u9-allowance/`・`infrastructure/test/u9-allowance/`・`packages/backend/test/fixtures/fakeSecrets.ts`・`fakeDynamo.ts`〈変えたとき〉・`scripts/smoke-check.sh`・`docs/contract-changes-u9.md`・`docs/manual-check-u9.md`・`README.md`）。**`aidlc/` 以下のパスは入れない**。`infrastructure/lib/`、`.github/workflows/`、`line` の入口は含めない（変えないため）

- [ ] **Step 46: code-summary.md**
  - `code-summary.md`（`code-generation-plan.md` の隣に新設）: 作った・変えたファイル、主な実装の決め（確認点 1〜3 の承認の結果、`AdjustmentSource` の形、`FamilyScope` の置き場所、S5 を開く道の形〈URL か画面の状態か〉、`calendarService` の C8 の窓口を `allowanceService` が使わない理由）、テストの件数とカバレッジ、**書いたが実行しなかったテストとその理由**（ステージングの手での確かめ 16 件と 3 秒の測定は `docs/manual-check-u9.md` に引き継ぎ。実行していない）、計画からのずれ。Step 5 の権限の確認結果を書く

- [ ] **Step 47: 全体の確認コマンドを実行する**（U1〜U9 のすべてのテストが通ること、型チェックが通ること、カバレッジ 80% 以上）:
  ```bash
  npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
  ```
  - U9 だけのコマンド（上）でも、`packages/*/src/**` と `infrastructure/lib/**` のカバレッジが出ること。下限（`thresholds.lines: 80`）は変えない
  - 完了の条件: スモークチェックの見出しが全 24 件になっていること、README の 14 行目と U9 の節が全 24 件になっていること（Step 39・40）

## Sources

- `construction/u9-allowance/functional-design/functional-spec.md`（F1〜F5、S1〜S35、契約への追加、次の単位への引き継ぎ）、`rules.md`（BR10.1〜BR10.19）、`entities.md`、`functional-design-questions.md`（Q1〜Q6）
- `construction/u9-allowance/nfr-requirements/`（`security-requirements.md`〈NFR4.86〜NFR4.93、NFR5.16〜NFR5.17〉、`reliability-requirements.md`〈NFR2.67〜NFR2.73、NFR6.10〉、`observability-requirements.md`〈NFR2.74〜NFR2.77〉、`performance-requirements.md`〈NFR7.50〜NFR7.58〉、`scalability-requirements.md`〈NFR1.36〜NFR1.38、NFR3.17〜NFR3.19〉、`tech-stack-decisions.md`〈NFR8.17〜NFR8.19、NFR9.10〜NFR9.12、NFR10.11〜NFR10.12、NFR11.10〜NFR11.11〉）
- `construction/u9-allowance/nfr-design/`（`logical-components.md`〈ファイルの分け方、障害の波及範囲〉、`security-design.md`〈`ReadContext`、`Cache-Control`、許可した項目〉、`reliability-design.md`〈全体を投げる、月の移動、異常の扱い〉、`observability-design.md`〈`ALLOWANCE_*` のログ〉、`performance-design.md`〈読み取りの段、並行、測り方〉、`scalability-design.md`）
- `construction/u9-allowance/infrastructure-design/`（`infrastructure-specification.md`〈追加なし〉、`cicd-pipeline.md`〈CDK のテスト、スモークチェック 3q、手での確かめ 16 件〉、`monitoring-design.md`）
- `inception/contract-design/contract-summary.md`（C1、C6〜C10）、`inception/user-stories/stories.md`（US8.1、AC8.1.1〜AC8.1.4、AC5.1.13、AC4.1.3、AC4.1.5、AC4.1.7）、`inception/refined-mockups/mockups.md`（S5）、`inception/requirements-analysis/requirements.md`（FR8.1、FR8.3、FR5.8、NFR）
- `construction/u8-swap/code-generation/code-generation-plan.md`、`unit-test-instructions.md`（形式の手本）、`docs/contract-changes-u8.md`
- `aidlc/spaces/default/memory/team.md`（Testing Posture、Deployment、Code Style）、`aidlc engine testing-posture render` の出力（Testing Contract。U8 と同じ `contract_sha256` を確かめた）
- 既存コード（読んだもの）: `packages/backend/src/entries/api.ts`〈`RouteResult`・振り分け表・`registerSwapHooks`〉、`lib/http.ts`、`lib/promise.ts`、`middleware/requireMembership.ts`、`services/familyMemberService.ts`〈`listMembers`・`findFamilyChild`〉、`services/choreTypeService.ts`〈`list`〉、`services/calendarService.ts`〈C8 の窓口の有無〉、`services/dutyReassignedHook.ts`〈`mapWithConcurrency`〉、`repositories/calendarRepository.ts`〈`loadMonth`・`getMonthState`〉、`handlers/calendar/getCalendar.ts`・`params.ts`、`packages/frontend/src/App.tsx`・`pages/CalendarPage.tsx`・`hooks/useMonthCalendar.ts`・`api/client.ts`、`scripts/smoke-check.sh`、`README.md`（件数の記述）、`packages/backend/test/u8-swap/`・`packages/frontend/test/u7-review-confirm/`（テストの置き方）

## Assumptions & Open Questions

- [assumption] 承認の確認点 1〜3 は、すべて設計で決まった内容を既定にしました（`current` を使う、成功の 200 だけ `no-store`、`ReadContext`／`FamilyScope`／`SystemContext` を足して `FamilyContext` は変えない）。変える指示がなければ、この計画のまま進めます
- [assumption] 応答を `AllowanceMonthView` に包む変更は、作り手が承認した例外として、承認の対象にせず `docs/contract-changes-u9.md` に理由を残します（Step 1）
- [assumption] C8 の `listDoneDuties`・`isMonthConfirmed` は、機能設計の「契約への追加」に従い `calendarService` の窓口として足します（`loadMonth` を使う薄い窓口）。`allowanceService` は自分の `loadMonth` の結果を使い、これらを呼びません（Query を 2 回にしないため）。契約 C8 の置き場所が別なら、コード生成で合わせます
- [assumption] リポジトリは `loadMonth`・`getMonthState`・`userRepository.findById`・`familyRepository.findById` など既存の読み取りで足りると見ています。足りない場合も、足すのは `GetItem`／`Query` だけの関数（Step 17）です。書き込みの関数は足しません
- [assumption] 加算・減額の差し込み口 `AdjustmentSource` の引数と戻りの形は、U11 が「家族の月ごとに 1 回で `Map<childUserId, 行[]>` を返す」だけで取り付けられる形としてコード生成で確定し、`docs/contract-changes-u9.md` に残します
- [assumption] S5 を開く道（URL のパスを作るか、画面の状態で切り替えるか）は、`App.tsx` の既存の切り替え（`showSettings` など）に合わせて Step 36 で選びます。画面のファイル名（`AllowancePage.tsx`、`useAllowanceMonth.ts`）と `shared/yen.ts` の名前も、既存の命名に合わせて変えてよい
- [assumption] 環境変数の名前（`CALENDAR_TABLE` など）は、インフラ設計が `app-stack.ts` を読んで確かめた結果に従います。Step 5 と Step 41 で再度確かめ、不足があればコードを書かずに止めて人に報告します
- [assumption] 3 秒以内（20 回中 19 回、画面録画）の測定と、手での確かめ 16 件は、コード生成のテストでは行いません（設計まで）。呼び出しの回数の上限、並行の読み取り、先読みなしを自動のテストで確かめ、計測はステージングの `docs/manual-check-u9.md` に引き継ぎます（まだ実行していません）
- [assumption] 費用は、DynamoDB の読み取りの増分が月に 1 円に満たない見込みです（`scalability-design.md`。未確認の見積もり）。Step 43 で料金の単価を確かめます
- [assumption] テストの量は Standard（部品ごとに 5〜8 件＋主要な境界の結合テスト〈筋書き〉）に、スコープ `mvp` の 80% の行カバレッジを足したものです。`unit-test-instructions.md` に表で書きます
- 未決の問い: なし（承認の確認点 1〜3 は、既定の答えを置いたうえで承認の場で人が決めます）
