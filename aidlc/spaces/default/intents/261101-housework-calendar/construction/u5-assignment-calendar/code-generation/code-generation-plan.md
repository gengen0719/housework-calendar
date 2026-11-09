# コード生成の計画 — U5 割り当てとカレンダー

## Summary

- Builds: 管理者が今月・来月の割り当て（種類ごとの子供と曜日）を入力して保存すると日ごとの担当ができ、保存し直しでは明日以降の「未」だけが作り直される流れ。上書きの確かめ（`changesHash`）、日ごとの担当の子供の変更、家族全員が見られる日ごとの縦のカレンダー（前の月・次の月、日の詳細、「先月と同じにする」）、C8 の本物の `isChoreTypeAssigned`（U4 の仮の窓口の置き換え）、`onDutyReassigned` フック。CDK の `Calendar` テーブルと権限、反映後のスモークチェック 3i〜3l、README、`docs/contract-changes-u5.md`
- Touches: `packages/shared/src/`（`jstDate.ts`、型、理由の印、文言）、`packages/backend/src/`（`repositories/calendarRepository.ts`、`services/calendarService.ts`・`assignmentPlanner.ts`・`changesHash.ts`、`handlers/calendar/`、`entries/api.ts`）、`packages/frontend/src/`（カレンダー、日の詳細、割り当て、上書きの確認）、`infrastructure/lib/`、既存テスト 3 か所（インフラ）と画面の既存テストの参照、`scripts/smoke-check.sh`、`README.md`
- Tests: Gherkin の筋書き 8 本（バックエンド 6、画面 2）で約 100 場面、共有の単体テスト、CDK のスタックの組み立てのテスト（約 14 件）、部品ごとの単体テスト 5〜8 件。Vitest で行カバレッジ 80% 以上。U1〜U4 のテストは通ったまま

## 前提

- 設計: `construction/u5-assignment-calendar/functional-design/`（`functional-spec.md`、`rules.md`、`entities.md`）、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`。契約: `inception/contract-design/contract-summary.md`
- U1〜U4 のコードに足す。U1〜U4 の動きは変えない。U1〜U4 のテストはすべて通ったままにする。ただし次の 2 つは、設計が予告した直しとして同じ手順の中で直す: (1) インフラの既存テスト 3 か所（Step 27）、(2) 画面の既存テストが「カレンダーの枠」を探している参照（Step 21）
- 新しい依存は足さない（日付は標準の `Intl.DateTimeFormat`。NFR8.10。ハッシュは `node:crypto`。zod は U4 から使っている）
- `.gitignore`、`AGENTS.md`、`.github/workflows/` は変えない（ワークフローの変更なし。`cicd-pipeline.md`）
- 新しい秘密の情報はない。パラメータストアのパラメータも GitHub の Variables も足さない
- **秘密の値の決まり（この計画とテストで守る）:** 秘密の値の例は、文書では必ず `<作り物の値>` と書く。テストで使う作り物の値（UUID の形の ID、64 文字の 16 進数の印、鍵、トークンなど）は、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置き、値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付けて、テストからは import して使う（直書きは ESLint の `no-restricted-syntax` が止める）。テストの中の期待値にも UUID や 64 文字の 16 進数を直接書かない（`computeChangesHash` の結果を使うか、fakeSecrets から import する）
- 設計にない補足（実装の前に作り手が確かめる点。`Assumptions` として `code-summary.md` に残す）: 画面の最初の 1 回の要求は応答の `today` をまだ持たないので、**最初の月だけ**端末の時計を日本時間にした月（`shared/jstDate` の `jstDateOf`）で要求する。以後の判断（今日の位置、今月・来月の入口の出し分け）は応答の `today` だけを使う。応答の `today` の月が要求した月と食い違っていて、最初の要求だったときは、`today` の月で 1 回だけ読み直す

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

- **この単位だけ**（リポジトリのルートで。詳細は `unit-test-instructions.md`）。テストはすべてパスに `u5-assignment-calendar` を含むフォルダに置く:

```bash
npx vitest run u5-assignment-calendar --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

- **この単位が直す既存テストだけ**（Step 27 の 3 か所。パスで指定する）:

```bash
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts
```

- **この project の確認コマンド**（各 batch の終わりと、最後の Step 31 で実行する）:

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## 手順

筋書き（`.feature`）は、機能の切れ目ごとに実装の前に書き、その筋書きが通るまで、その切れ目の層（データ、リポジトリ、業務の決まり、API、画面）をまとめて作ります（BDD）。純粋な関数や条件式の組み立てなど、筋書きでは細かく確かめにくいものの単体テストは、筋書きが通ったあとに足します（ordering の「筋書きが先」は変えない）。

Testing Contract の 8 つの骨組みとの対応: 1 構成と本番設定の骨組み = Step 1、2 テストの実行環境と正確なコマンドの記録 = Step 2〜3、3 振る舞いの筋書き = Step 4・7・13・19・25、4 機能の切れ目の実装 = Step 5・8〜10・14〜16・20〜23・26、5 筋書きを通す = Step 6・11・17・24、6 筋書きを緑のまま整理 = Step 6・12・18・24、7 環境・ビルドの設定 = Step 26〜28、8 文書と traceability = Step 29〜31。

### Batch 1: 土台（Step 1〜3）

- [x] **Step 1: 骨組みと設定の置き場所**（全体。NFR1.19、NFR3.6）
  - U5 のテストのフォルダを作る: `packages/shared/test/u5-assignment-calendar/`、`packages/backend/test/u5-assignment-calendar/`（と `helpers/`）、`packages/frontend/test/u5-assignment-calendar/`（と `helpers/`）、`infrastructure/test/u5-assignment-calendar/`
  - `packages/backend/src/lib/dynamoClient.ts` の `tables` に `calendar()`（環境変数 `CALENDAR_TABLE`。画面用の Lambda だけが持つ）を足す
  - `packages/backend/src/models.ts` に `DutyStatus`・`DutyOrigin`、`AssignmentRecord`、`DutyRecord`（`dutyId`、`familyId`、`month`、`date`、`choreTypeId`、`childUserId`、`status`、`origin`、`version`、`createdAt`、`updatedAt`。U6〜U8 が足す `recordedAt`、`recordedBy`、`unitPrice` は任意の項目として用意）、`MonthStateRecord`、`DutyRefRecord` の型を足す
  - 作り物の値の置き場所を用意する（上の「秘密の値の決まり」）: `packages/backend/test/fixtures/fakeSecrets.ts`、`packages/frontend/test/fixtures/fakeSecrets.ts` に、担当の ID、子供の ID（3 人）、他の家族の ID、64 文字の 16 進数の作り物の印（形は正しいが合わない印）を足す。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける。種類の ID は U4 の `FAKE_CHORE_TYPE_ID_*` を使う。共有パッケージのテストに UUID が要るときは、同じ決まりで `packages/shared/test/fixtures/fakeSecrets.ts` を作る
- [x] **Step 2: テストの実行環境の準備とコマンドの記録**（NFR8.9）
  - U1〜U4 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（`vitest.config.ts` は変えない。`thresholds.lines: 80` は下げない。新しい道具は入れない）
  - テスト補助を足す:
    - `packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`: `Calendar` の表（`CALENDAR_TABLE = 'Calendar-test'`、キー `familyId` + `sk`）、`installFakeDynamo` の戻り値に `calendar`。`Put`・`Update`・`Delete` の条件式を `Calendar` でも本当に評価する（`ChoreTypes` と同じ）。条件式の部品に `contains(x, :v)`（集合と文字列）、`begins_with(x, :v)`、真偽値・数の比較、`attribute_not_exists(x) OR x = :false` を足す。更新式に `SET #version = #version + :one` の形を足す。`TransactWriteItems` に **`ConditionCheck` を `Calendar` と `ChoreTypes` の両方で評価**し、`CancellationReasons` を項目ごとの Code で返し、**100 項目を超えたら `ValidationException`** で断る。失敗の差し込み（`hooks.failTransaction(n, code)`: n 回目のトランザクションを `TransactionConflict` や `ThrottlingError` などで断る。`hooks.beforeTransaction(n, fn)`: n 回目の評価の直前に別の書き込みを入れる。U1〜U4 の `beforeNextTransaction` はそのまま）。`Query` に `Calendar`（`familyId = :f AND begins_with(sk, :p)`、`FilterExpression` の `contains(choreTypeIds, :c) OR choreTypeId = :c`、`ProjectionExpression`、続き `LastEvaluatedKey`、`queryPageSize`）。`Get`・`Query` が `ConsistentRead` で呼ばれたかを `hooks.readLog`（操作、表、強い整合性か）に残し、読み取りの回数を数えられるようにする（NFR1.21、NFR1.22 の確かめ用）
    - `packages/backend/test/u1-skeleton-family/helpers/world.ts`: `process.env.CALENDAR_TABLE = CALENDAR_TABLE` を足す。今日を日本時間の指定の時刻に固定する `setNow(iso)`（`vi.useFakeTimers({ toFake: ['Date'] })`）と、戻す `resetNow()` を足す
    - `packages/backend/test/u5-assignment-calendar/helpers/seed.ts`: 家族（管理者 1 人、子供 3 人）、種類 4 つ（「使う」と「使わない」）、`Calendar` の割り当て・担当・引き当て `DID#`・月の状態（確定）を直接置く関数（「済」「×」、`origin` が `manual` と `swap`、確定、引き受けた担当は前提データで用意する。functional-spec の範囲）、セッションの作り方（U2・U4 の `helpers/seed.ts` と同じ）
  - 最初の空の筋書き 1 つ（`packages/backend/test/u5-assignment-calendar/runner-ready.feature` と steps。Step 3 で消す）で、この計画の「この単位だけ」のコマンドが動くことを確かめ、そのコマンドを `unit-test-instructions.md` のとおりに固定する
- [x] **Step 3: 既存のテストが通ったままかを確かめる**
  - Step 2 のテスト補助の変更のあと、U1〜U4 のバックエンドのテストがすべて通ることを確かめる（`npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types`）。落ちたら、補助の変更を直す（U1〜U4 のテストの期待は変えない）
  - handler を直接呼ぶ既存テストが `CALENDAR_TABLE` なしで落ちないか確かめる（`packages/backend/test/u1-skeleton-family/apiEntry.test.ts`、`packages/backend/test/u2-invitation/router.test.ts` など。`CALENDAR_TABLE` は `setupWorld` で入る）
  - `runner-ready.feature` と steps を消す（Step 7 以降の本物の筋書きに置き換える）

### Batch 2: 共有パッケージ（日本時間の日付、型、文言。Step 4〜6）

- [x] **Step 4: テストを書く**（NFR11.4、NFR8.10、NFR4.46。AC3.1.1、AC3.1.4、AC4.1.1 の下ごしらえ）— `packages/shared/test/u5-assignment-calendar/`:
  - `jstDate.test.ts`: UTC の 15:00 の前後 1 ミリ秒で今日が変わる、2028 年の 2 月が 29 日・2027 年の 2 月が 28 日・30 日の月と 31 日の月、12 月の次が翌年 1 月・1 月の前が前年 12 月、`parseMonth` が `2027-13`・`2027-1`・`0050-01`・`2101-01`・`1999-12`・`abc` を断り `2000-01`・`2100-12` を通す、`datesOfMonth` が 1 日から月末まで、`weekdayOf` が日曜 0〜土曜 6、今月と来月の判定（`isEditableMonth(month, today)`）
  - `messages.test.ts`: 新しい理由の印（`INVALID_MONTH`、`INVALID_ASSIGNMENT`、`MONTH_NOT_EDITABLE`、`PAYLOAD_TOO_LARGE`）と文言、`ASSIGNMENT_OVERLAP`・`OVERWRITE_CONFIRMATION_REQUIRED` の文言の関数（値を入れる）、「この月の割り当てはまだありません」「担当なし」「確定済み」「次の担当が上書きされます」「先月と同じにする」の結果の文言 2 つ、保存の 500 の文言、U1〜U4 の印と文言が消えていない
- [x] **Step 5: 作る**（BR6.2、BR6.4、BR6.7、BR6.14、BR6.17、NFR11.4）— `packages/shared/src/`: `jstDate.ts`（`jstDateOf`、`parseMonth`、`shiftMonth`、`datesOfMonth`、`weekdayOf`、`isEditableMonth`。整形のインスタンスはモジュールの先頭で 1 つ）、`reasons.ts`（足りない印だけ）、`messages.ts`、`api-types.ts`（`Duty` に `origin`・`version`・`recordedByName`・`choreName`、`MonthCalendar`（`month`、`confirmed`、`hasAssignment`、`today`、`duties`、`children`、`choreTypes`）、`AssignmentRule`、`AssignmentView`（`month`、`rules`、`exists`）、`SaveAssignmentRequest`（`rules`、`confirmedChangesHash?`）、`ChangeDutyChildRequest`、`OverwriteChange`、`OverlapItem`）、`index.ts`（`jstDate` を出す）
- [x] **Step 6: 通す、整える** — Step 4 のテストが通るまで直し、通ったまま整える。U1〜U4 の共有のテストが通ることを確かめる

### Batch 3: 割り当ての保存（AC3.1.1、AC3.1.4〜AC3.1.8。Step 7〜12）

- [x] **Step 7: 筋書きを書く**（BR6.1〜BR6.8、BR6.18、NFR2.28〜NFR2.31、NFR4.42〜NFR4.52、NFR11.4）— `packages/backend/test/u5-assignment-calendar/` に 3 本（画面用 API の入口 `handler` から。今日は `setNow`）:
  - `save-assignment.feature` と `save-assignment.steps.ts`（約 18 場面）:
    - 今月の初めての保存で、月曜と木曜に担当ができる。今日から月末までで、過ぎた日には作られない（AC3.1.1、BR6.5）
    - 来月の保存は 1 日から月末まで。12 月に保存する来月は翌年 1 月（BR6.5、NFR11.4）
    - 保存し直しで、今日と過ぎた日と「済」「×」は変わらず、明日以降の「未」だけが作り直される。子供が同じ担当は `version` も `origin` も変わらない。担当がなくなる日は消える。行が 0 行の割り当ても保存でき、明日以降の「未」がなくなる（AC3.1.4、BR6.6）
    - 日本時間の 0 時の前後（UTC の 15 時）で、作る範囲が変わる（NFR11.4）
    - 同じ日の同じお手伝いに 2 人入る割り当ては 422 `ASSIGNMENT_OVERLAP` で、重なりがすべて並ぶ。過ぎた日の重なりも出る。何も保存されない（AC3.1.6、BR6.4）
    - 確定した月は 409 `MONTH_CONFIRMED`、今月でも来月でもない月は 422 `MONTH_NOT_EDITABLE`。確定した過去の月は 409 が先（AC3.1.7、BR6.2）
    - 子供が保存しようとすると 403 `ADMIN_ONLY` で何も読まず、何も変わらない（AC3.1.8、BR6.1）
    - 月の形が違う（`2027-13` など）と 422 `INVALID_MONTH`。行が 201 行、曜日が 8 個または `7`、種類が 91 個、形の違う ID、大文字の UUID、`confirmedChangesHash` が 64 文字の 16 進数でない本文は 422 `INVALID_ASSIGNMENT`。本文が 64 KB を超えると 413 `PAYLOAD_TOO_LARGE`。知らない項目は捨てられる（NFR4.46、NFR4.47）
    - 行の確かめの順番: 「使わない」の種類の行とほかの家族の種類の行があれば 404、「使わない」の種類の行とほかの家族の子供の行があれば 422 `CHORE_TYPE_INACTIVE`。行を入れ替えても同じ応答（NFR4.52、BR6.3）
    - ほかの家族の子供と管理者の ID は 404。参加した直後の子供（C6 の索引に出ていない）は割り当てられる（NFR4.45）
    - 同じ種類と子供の行は 1 行にまとまり、曜日の重なりは 1 つになる（BR6.3）
    - 同じ内容を 2 回続けて保存すると、2 回目は何も書かず同じ結果（BR6.18）
    - ログに `ASSIGNMENT_SAVED`（`dutyCount` など）が出て、種類の名前と子供の表示名が出ない（NFR2.32）
  - `overwrite-confirmation.feature` と `.steps.ts`（約 9 場面）: `origin` が `manual` か `swap` の「未」の担当を上書きするとき、409 `OVERWRITE_CONFIRMATION_REQUIRED` と変化の一覧と `changesHash`（何も書かない）。`changesHash` を `confirmedChangesHash` に付けて送り直すと保存される（AC3.1.5、BR6.7）。確かめのあとに担当が変わっていれば印が合わず新しい一覧がもう一度返る。形の誤りの印は 422、形が正しくて合わない印は 409。一覧が空のとき印は要らず付いていても無視。作った印は入力の順番に左右されない（NFR4.51）
  - `save-resilience.feature` と `.steps.ts`（約 14 場面）: 124 件の初めての保存がチャンク 47・47・30 件と割り当て 1 回の計 4 回になる（項目数 99・99・65・6）。310 件（種類 10 個）は 8 チャンクと割り当て 1 回。チャンクの途中で失敗させて 500 になり、もう一度保存すると担当と割り当てが正しい状態になる（初めてでも保存し直しでも）。書き込みの直前に「済」を入れるとその担当は変わらず 1 回だけやり直して収まる。直前に月の確定を入れると 409 `MONTH_CONFIRMED`。直前に種類を「使わない」にすると 422 `CHORE_TYPE_INACTIVE`。2 つの保存が同じ日の同じ種類を同時に作ろうとしても二重にならない。読んだあとに担当が消されて作り直されても、作り直された別の担当は変わらない（`dutyId` の条件）。内部のやり直しで、前の試行が上書きした担当が一覧から消えても部分集合として続行し、別の人が行を変えたときは 409。思いがけない Code（`ThrottlingError`）は 500。`ASSIGNMENT_PARTIAL_FAILURE` のログ。残り時間が 5 秒を切ったらチャンクを書かず 500（NFR2.28〜NFR2.31、NFR4.50）
- [x] **Step 8: 作る（純粋な部分）**（BR6.3〜BR6.7、NFR2.28、NFR2.29、NFR4.51）— `packages/backend/src/services/`:
  - `assignmentPlanner.ts`: 行を整える（まとめる、曜日の重なり）、重なりを探す（月のすべての日）、作る範囲（来月・初めて・保存し直し）、作るべき担当、いまの担当との比べ（作る・子供を変える・消す・何もしない・「済」「×」はそのまま）、確かめの一覧、チャンクの分け方（作る・消すは 2 項目、変えるは 1 項目、各チャンクの確かめは 1 + 作る・変えるに出る種類の数、上限 100。消すだけのチャンクには種類の確かめを付けない）。DynamoDB にも時計にも触れない（今日は引数）
  - `changesHash.ts`: `computeChangesHash(familyId, month, changes)`（`security-design.md` のとおり。日付・種類の順に並べ、`[familyId, month, rows]` の JSON の SHA-256、16 進数 64 文字）
- [x] **Step 9: 作る（リポジトリ）**（BR6.6、BR6.8、NFR1.20、NFR2.31、NFR4.44、NFR4.50）— `packages/backend/src/repositories/calendarRepository.ts`:
  - 月の Query（`familyId = :f AND begins_with(sk, 'M#<month>#')`、強い整合性、続きを最後まで）、割り当て・月の状態の GetItem、担当と引き当て `DID#<dutyId>` の GetItem（強い整合性）。いつもキーに `ctx.familyId` を入れる
  - トランザクションの組み立て: 作る（担当の Put と引き当ての Put。条件 `attribute_not_exists(sk)`）、子供を変える（担当の Update。条件 `#status = :todo AND #version = :v AND #dutyId = :id`）、消す（担当の Delete と引き当ての Delete。条件 `attribute_exists(sk)`）、月の状態の ConditionCheck（`attribute_not_exists(confirmed) OR confirmed = :false`）、種類の ConditionCheck（`ChoreTypes` の `TYPE#<choreTypeId>`、`active = :true`）。**条件式・更新式の属性名はすべて `ExpressionAttributeNames` で置き換える**（NFR4.50）。割り当ての Put（`rules`、`choreTypeIds`（行が 0 行のときは属性を置かない）、`updatedAt`、`updatedByUserId`）
  - `CancellationReasons` の読み分け: `ConditionalCheckFailed` と `TransactionConflict` だけを競合、ほかの Code は投げ直す（NFR2.31）
  - 種類の使用の Query（`isChoreTypeAssigned` 用。`familyId = :f AND begins_with(sk, 'M#')`、`contains(choreTypeIds, :c) OR choreTypeId = :c`、`ProjectionExpression: sk`、1 件当たったら続きを読まない）
- [x] **Step 10: 作る（業務・API）**（BR6.1〜BR6.8、BR6.18、NFR2.28〜NFR2.32、NFR4.42〜NFR4.52、NFR7.24）
  - `packages/backend/src/services/calendarService.ts` の `saveAssignment(ctx, month, rules, confirmedChangesHash, today)`: 読む（`Calendar`、C7 の `choreTypeService.list`、C6 のメンバー一覧、子供ごとの強い整合性の読み取りを同時に）→ 確かめの順番 → 計画 → 確かめの印 → チャンクを順に書く（1 回まで読み直してやり直す。理由は読み直しで決める。部分集合の規則）→ 最後に割り当てを書く → 読み直して `MonthCalendar` を返す。子供の確かめは C6 の窓口に `familyMemberService.findFamilyChild(ctx, userId)`（`userRepository.findById(userId, { consistent: true })` で `familyId` と `role = child` を確かめる）を足して使う（`userRepository` を直接読まない。ADR-001）。`getAssignment(ctx, month)`
  - `packages/backend/src/services/dutyReassignedHook.ts`: `onDutyReassigned(hook)` の登録と、担当ごとに順に `await` して呼ぶ関数（投げても保存の結果を変えず、`DUTY_HOOK_FAILED` を残す。U8 まで何も登録されない）
  - `packages/backend/src/handlers/calendar/{getAssignment,saveAssignment}.ts` と `params.ts`（`month` の形、`dutyId` の形）。zod のスキーマ（`assignmentBodySchema`。行 200 まで、種類 90 まで、小文字の UUID、曜日 0〜6 を 1〜7 個、`strip`）
  - `packages/backend/src/lib/requestBody.ts`: 本文を **64 KB（65536 バイト）まで**で読む（Base64 は戻してから数える。JSON に読む前に大きさを確かめ、超えれば 413 `PAYLOAD_TOO_LARGE`）。ハンドラーの中で必要になった時点で読む形（遅延）にして、PATCH ではほかの家族の `dutyId` に誤った本文でも 404 を返す
  - `packages/backend/src/lib/logger.ts`: `setRequestMetrics({ dutyCount })`、`coldStart`（実行環境の最初の要求だけ true）を `REQUEST_END` に足す。伏せ字と `LogData` の型は U4 のまま（種類の名前と子供の表示名を書けない）。ログ `ASSIGNMENT_SAVED`・`ASSIGNMENT_REJECTED`・`ASSIGNMENT_PARTIAL_FAILURE`
  - `packages/backend/src/entries/api.ts`: `GET`・`PUT /v1/months/:month/assignment` を足す（管理者の確かめは月や担当の確かめより先）
- [x] **Step 11: 通す** — Step 7 の 3 本の筋書きと U1〜U4 のテストが通るまで直す。単体テストを足す（各 5〜8 件）: `assignmentPlanner.test.ts`（範囲、比べ、チャンクの分け方、310 件の 8 チャンク）、`changesHash.test.ts`（入力の順番に左右されない、`version` が変わると変わる）、`calendarRepository.test.ts`（キーに家族、条件式、属性名の置き換えが全部の式で行われていること、`CancellationReasons` の読み分け）、`saveAssignmentTransaction.test.ts`（項目数が 100 を超えない）、`logRedaction.test.ts`（名前が出ない、型）
- [x] **Step 12: 整える** — Step 7 の筋書きを緑のまま、重複と長い関数を整理する（`calendarService.ts` が大きくなったら保存の部分を分ける。ただし `calendarService` の公開の形は変えない）。この batch の確認コマンドを実行する

### Batch 4: カレンダーを開く、担当の変更、C8（AC3.1.2、AC3.1.3、AC4.1.1〜AC4.1.5。Step 13〜18）

- [x] **Step 13: 筋書きを書く**（BR6.9〜BR6.11、BR6.13〜BR6.16、NFR1.20〜NFR1.22、NFR2.30、NFR4.43〜NFR4.45、NFR4.48、NFR4.52）— `packages/backend/test/u5-assignment-calendar/` に 3 本:
  - `view-calendar.feature` と `.steps.ts`（約 14 場面）: 保存した月のカレンダーを家族のメンバー全員（子供も）が見られ、担当が日ごとに並ぶ（AC4.1.1、AC4.1.3）。割り当てがない月は `hasAssignment: false`、行が 0 行の割り当てが保存された月は `hasAssignment: true` で担当なし（AC4.1.4、BR6.14）。確定した月は `confirmed: true`。「済」「×」と記録した時刻・記録した人の表示名が出る（前提データ。AC4.1.2）。応答に `today`・`children`（担当にいる子供は必ず含まれる。C6 の索引が古くても `Users` の読み取りで補う）・`choreTypes`（「使わない」の種類も）。ほかの家族の担当が含まれない。メンバーでない人は 403。月の形が違えば 422 `INVALID_MONTH`。続きのある Query でも全件がそろう。読み取りの回数が担当の数で増えない（NFR1.21）。読み取りがすべて強い整合性で `Scan` がない（NFR1.20）。保存の直後に開いたカレンダーが新しい。`GET /assignment` が `{ month, rules, exists }`
  - `change-duty.feature` と `.steps.ts`（約 14 場面）: 「未」の担当の子供を変えると `origin` が `manual`、`version` が 1 増える（AC3.1.2、BR6.9）。「済」「×」の担当は 409 `DUTY_NOT_TODO`（AC3.1.3）。確定した月は 409 `MONTH_CONFIRMED`（同じ子供を指定しても。AC3.1.7）。同じ子供なら書かず `version` も変わらない。過ぎた日の「未」も確定していなければ変えられる。子供のセッションは 403（AC3.1.8）。ほかの家族の担当の ID は、本文が正しくても誤っていても 404。形の違う ID は DynamoDB を読まず 404。ほかの家族の子供と管理者の ID は 404。本文なし・数・`childUserId` のない本文は 422 `INVALID_REQUEST`。書き込みの直前に記録が入ると 409 `DUTY_NOT_TODO`、確定が入ると 409 `MONTH_CONFIRMED`、U8 の引き受け（`version` が増え `origin = swap`）が入ると読み直して 1 回だけやり直して書ける（`fromChildUserId` は読み直した子供）。直前に担当が消されて作り直されると 404。`onDutyReassigned` が書けたあとに呼ばれる。ログ `DUTY_CHILD_CHANGED`・`DUTY_CHANGE_REJECTED`
  - `chore-type-in-use.feature` と `.steps.ts`（約 7 場面）: U4 の「消す」が本物の C8 を呼ぶ。割り当てに使っている種類は 409 `CHORE_TYPE_IN_USE` で消えず「使わない」のまま（AC2.1.6 の本物のつなぎ）。割り当てから外してあっても、過去の月の担当に残っていれば消せない。保存の途中で失敗して担当だけができた状態（割り当てなし）でも消せない。使われていない種類は消せる（AC2.1.7）。他の家族の使用は見ない。直前に保存した割り当てを見落とさない（強い整合性）
- [x] **Step 14: 作る（カレンダーの読み取り）**（BR6.11、BR6.14、BR6.15、NFR1.20、NFR1.21、NFR4.43）— `calendarService.getMonthCalendar(ctx, month, today)`（`Calendar` の Query 1 回、C6 のメンバー一覧、C7 の種類の一覧を同時に。種類と子供は一覧を 1 回ずつ読みメモリで突き合わせる。担当にいる子供は `Users` の強い整合性の読み取りで補う）、`handlers/calendar/getCalendar.ts`、`entries/api.ts` に `GET /v1/months/:month/calendar`
- [x] **Step 15: 作る（担当の子供の変更）**（BR6.9、NFR2.30、NFR4.42、NFR4.48、NFR4.52）— `calendarService.changeDutyChild(ctx, dutyId, childUserId)`（引き当て `DID#` → 担当 → 月の状態の GetItem、子供の確かめ、トランザクション 2 項目、断られたら読み直して理由を決め、`version` だけの競合は 1 回だけやり直す、書けたら `onDutyReassigned` と `DUTY_CHILD_CHANGED`）、`handlers/calendar/changeDutyChild.ts`（`dutyChangeBodySchema`。担当の 404 のあとに本文を読む）、`entries/api.ts` に `PATCH /v1/duties/:dutyId`
- [x] **Step 16: 作る（C8 の本物の窓口と取り付け）**（BR6.10、NFR1.22）
  - `calendarService.isChoreTypeAssigned(ctx, choreTypeId)`（Step 9 の使用の Query）
  - **取り付け場所（循環 import を避ける composition root）:** `packages/backend/src/entries/api.ts` の先頭で `setCalendarPort({ isChoreTypeAssigned: calendarService.isChoreTypeAssigned })` を呼ぶ。`choreTypeService` は `calendarPort` の形だけに頼り、`calendarService` を import しない。`calendarService` は `choreTypeService.list` に頼る。この向き（`entries/api` → `calendarService` → `choreTypeService` → `calendarPort`）で輪を作らない。`services/calendarPort.ts` は仮の窓口を残し（U4 のテストが使う）、コメントを「本物は entries/api.ts で取り付ける」に直す
  - `line.ts` の入口は取り付けない（U5 は `line` に触れない）
- [x] **Step 17: 通す** — Step 13 の 3 本の筋書きと U1〜U4（特に U4 の `update-chore-type`）が通るまで直す。単体テストを足す（各 5〜8 件）: `getMonthCalendar.test.ts`、`changeDutyChild.test.ts`（式の属性名の置き換え、`version` のやり直し）、`isChoreTypeAssigned.test.ts`（1 件当たったら続きを読まない）、`composition.test.ts`（`entries/api` を読み込むと本物が取り付けられ、`choreTypeService.remove` が本物を呼ぶ。`resetCalendarPort` で仮に戻せる）、`dutyReassignedHook.test.ts`
- [x] **Step 18: 整える** — 筋書きを緑のまま整理する。`handlers/calendar/params.ts` の共通化、`MonthCalendar` を作る関数の重複を除く。この batch の確認コマンドを実行する

### Batch 5: 画面（AC4.1.1〜AC4.1.5、AC4.1.7、AC3.1.1〜AC3.1.8。Step 19〜24）

- [x] **Step 19: 筋書きを書く**（BR6.11〜BR6.17、NFR4.49、NFR7.20、NFR7.21、NFR9.5）— `packages/frontend/test/u5-assignment-calendar/`（LIFF と API は差し替え。`data-testid` を使う）:
  - `calendar.feature` と `calendar.steps.tsx`（約 14 場面）: アプリを開くと今月の日ごとの縦の一覧が出て、「皿洗い=太郎(済)」のように担当が全部出る。状態は「済」「未」「×」の文字（AC4.1.1、AC4.1.7）。担当のない日は「担当なし」。今月は今日の位置を見せる（応答の `today`。端末の時計を使わない）。確定した月は「確定済み」。前の月・次の月で読み直し、古い月の応答が遅れて届いても画面に出ない（`AbortController`）。日付を押すと日の詳細に種類・子供・状態・時刻（日本時間の時:分）・記録した人が出る（AC4.1.2）。管理者には「未」の担当に「担当を変える」が出て、子供を選ぶと `PATCH` が送られ画面が差し替わる。409 `DUTY_NOT_TODO`・`MONTH_CONFIRMED` の文言。割り当てがない月は「この月の割り当てはまだありません」と、管理者で今月か来月のときだけ「割り当てを入力する」（AC4.1.4）。割り当てがある月の管理者に「割り当てを変える」。子供にはボタンが出ない。読み込みに失敗すると「表示できませんでした。もう一度お試しください」と「読み込み直す」（AC4.1.5）。名前の中のタグは文字として出る。家族の設定への入口とお知らせ先の案内が残る（U2・U3）
  - `assignment.feature` と `assignment.steps.tsx`（約 14 場面）: 「割り当てを入力する」で「使う」の種類ごとの入力欄が出る（今の割り当てに「使わない」の種類があれば印つきで出し、外すよう案内）。子供と曜日を選び、1 つの種類に子供ごとの行を足せる。「先月と同じにする」で先月の割り当てが入る（「使わない」・消えた種類の行は入れず「使わないお手伝いは入れませんでした」、先月がなければ「先月の割り当てはありません」。保存はしない。BR6.17）。「保存」で `PUT` が `{ rules }` で送られ、200 でカレンダーに戻り担当が出る。422 `ASSIGNMENT_OVERLAP` は「1月4日(月) の皿洗いに担当が 2 人います」の一覧をすべて並べ入力欄が残る（AC3.1.6）。409 `OVERWRITE_CONFIRMATION_REQUIRED` は「次の担当が上書きされます」と「1月22日 皿洗い: 太郎 → 花子」の一覧、「この内容で保存する」で `changesHash` を `confirmedChangesHash` に入れて送り直す。「やめる」で入力欄に戻る。送り直す前に担当が変わると新しい一覧がもう一度出る（AC3.1.5）。409 `MONTH_CONFIRMED`・422 `MONTH_NOT_EDITABLE` の文言。500 では「保存できませんでした。もう一度保存してください」と一部が書き換わっていることがある旨。子供には入口が出ない（AC3.1.8）
  - `packages/frontend/test/u1-skeleton-family/theme.test.ts` に、全画面の文字と背景の色の組み合わせ（「済」「未」「×」の色、確定済み、無効のボタン、リンク、入力欄の枠を含む）の WCAG のコントラスト比 4.5:1 以上と、ボタン・リストの行・アイコンボタン・チェックボックス・メニューの項目の最小の大きさが 44 ピクセル以上であることの確かめを足す（先に書き、Step 23 で通す。NFR9.5）
  - `packages/frontend/test/u5-assignment-calendar/helpers/calendarStub.ts`: 画面の既存テスト（U1・U3・U4）が使う、カレンダー API の既定の差し替え
- [x] **Step 20: 作る（API の呼び出しと読み込み）**（NFR7.20、NFR7.21）— `packages/frontend/src/api/client.ts` に 4 つの操作（`getMonthCalendar`、`getAssignment`、`saveAssignment`、`changeDutyChild`。`AbortSignal` を受け取る）、`packages/frontend/src/hooks/useMonthCalendar.ts`（月の読み込み、前後の月、最初の 1 回だけ端末の時計の日本時間の月で要求し、食い違えば応答の `today` の月で 1 回だけ読み直す、古い月の応答を捨てる、画面の中のキャッシュは持たない）
- [x] **Step 21: 作る（カレンダーと日の詳細）**（BR6.11〜BR6.16、NFR4.49、AC4.1.1〜AC4.1.5）— `packages/frontend/src/pages/CalendarPage.tsx`（日ごとの縦の一覧、月の見出しと前後のボタン、今日の位置は最初の描画のあとに 1 回だけ `scrollIntoView`、割り当てがない月の表示、読み込み直し、家族の名前・「家族の設定」の入口・お知らせ先の案内を U1・U3 から引き継ぐ）、`packages/frontend/src/pages/DayDetail.tsx`、`App.tsx`（`CalendarFramePage` を `CalendarPage` に置き換える。割り当ての画面は `React.lazy`）。`pages/CalendarFramePage.tsx` を消す。**既存の画面のテストの参照を直す**（期待は変えず、探す `data-testid` を `calendar-frame-page` から `calendar-page` に、カレンダー API の差し替えを足す）: `packages/frontend/test/u1-skeleton-family/screens.steps.tsx`、`pages.test.tsx`（`CalendarFramePage` の 2 つのテストは、同じ意図（月の日数、今日の印）を `CalendarPage` に対して書き直す）、`packages/frontend/test/u3-notification-group/screens.steps.tsx`、`packages/frontend/test/u4-chore-types/screens.steps.tsx`
- [x] **Step 22: 作る（割り当ての画面と上書きの確認）**（BR6.1〜BR6.4、BR6.7、BR6.17、AC3.1.1〜AC3.1.8）— `packages/frontend/src/pages/AssignmentPage.tsx`（`React.lazy`。種類ごとの子供と曜日の入力、「先月と同じにする」、重なりの一覧、保存の失敗の文言）、`packages/frontend/src/components/OverwriteConfirmDialog.tsx`（`React.lazy`。変化の一覧と「この内容で保存する」「やめる」）。種類の名前・子供の表示名は React の文字として出す（`dangerouslySetInnerHTML` を使わない）。ボタンとリストの行は 44 ピクセル以上
- [x] **Step 23: 作る（テーマ）**（NFR9.5、AC4.1.7）— `packages/frontend/src/theme.ts` を、Step 19 の全画面のコントラスト・押す場所の確かめが通るように直す（色や大きさの基準そのものは下げない）
- [x] **Step 24: 通す、整える** — Step 19 の筋書きと U1〜U4 の画面のテストが通るまで直し、通ったまま整える。画面の単体テストを足す（各 5〜8 件）: `useMonthCalendar.test.tsx`、`client.test.ts`、`DayDetail.test.tsx`、`OverwriteConfirmDialog.test.tsx`。この batch の確認コマンドを実行する

### Batch 6: インフラとスモークチェック（Step 25〜28）

- [x] **Step 25: スタックのテストを先に書く**（NFR1.19、NFR3.6、NFR6.6、NFR4.50）— `infrastructure/test/u5-assignment-calendar/stacks.test.ts`（U4 の `stacks.test.ts` と同じ作り。`Calendar` は**論理 ID が `Calendar` で始まる**テーブルとして探す。キーの形では探さない。約 14 件）: `Calendar` のキー（`familyId` の HASH、`sk` の RANGE、ともに文字列）、`PAY_PER_REQUEST`、暗号化、TTL なし、**`GlobalSecondaryIndexes` と `LocalSecondaryIndexes` がない**、`tableName` を指定していない、`PointInTimeRecoverySpecification` がない、本番は `Retain`・ステージングは `Delete`、テーブルの合計が 8 つ、`api` に `CALENDAR_TABLE` があり `line` にない、`api` の `Calendar` の許可が `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem` のちょうど 6 つ（`Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*` がなく、資源はテーブルの ARN だけで `/index/` を含まず、`Calendar` を含む文は 1 つ）、`api` の `ChoreTypes` の許可が `ConditionCheckItem` を足した 6 つ（`Scan` がなく文は 1 つのまま）、`api` の `Users` の許可は変わらず `GetItem` がある、`line` に `Calendar` も `ChoreTypes` も含む文がない、`api` のロールに `Resource: "*"` の DynamoDB の文がない、変えないもの（`MemorySize = 256`、`Timeout = 30`、ロググループの保管 30 日、`AllowedMethods` が `ALLOW_ALL`、`AWS::Logs::MetricFilter` が 1 つのまま）
- [x] **Step 26: 作る（CDK の構成）**（NFR1.19、NFR3.6、NFR6.6）— `infrastructure/lib/data-stack.ts`（`Calendar` テーブル。`common` を展開、PK `familyId`、SK `sk`、索引なし、TTL なし、`tableName` を指定しない、公開プロパティ `calendar`）、`app-stack.ts`（`AppStackProps` に `calendar: dynamodb.ITable`、`api` の環境変数 `CALENDAR_TABLE`、`api` の許可に `Calendar` の 6 つの操作の新しい文 1 つ、`ChoreTypes` の既存の文に `dynamodb:ConditionCheckItem` を足す。`grantReadWriteData` は使わない。`line` には足さない。コメントの「ConditionCheckItem は U5 で足す」を直す）、`app.ts`（`calendar: data.calendar` を渡す）。新しいスタック・Lambda・秘密の情報は足さない
- [x] **Step 27: 既存のインフラのテストを直す**（`cicd-pipeline.md` の 3 か所。直さないと CI が落ちる）
  - `infrastructure/test/u1-skeleton-family/stacks.test.ts` の「DynamoDB は 7 つ」と、本番のテーブルが 7 つで `Retain` の期待を 8 に直し、題名の「（U2 で … U4 で ChoreTypes を追加）」に「U5 で Calendar を追加」を足す
  - `infrastructure/test/u4-chore-types/stacks.test.ts` の `findChoreTypes` と「`ChoreTypes` に tableName を指定していない」を、キーの形ではなく**論理 ID が `ChoreTypes` で始まる**テーブルを探す形に直す（`Calendar` が同じキーの形のため 2 つ見つかり `toHaveLength(1)` が落ちる）
  - 同じファイルの「`ChoreTypes` の許可がちょうど 5 つ」と「`Scan` と `ConditionCheckItem` がない」を、6 つ（`ConditionCheckItem` を含む）に直し、`Scan` がないことは残す。コメントに「U5 で足した」と書く
  - 上の 3 か所以外の `infrastructure/test/` の既存テストは変えない。`tsc -p infrastructure` で `buildApp` の呼び出しの型（`calendar`）を確かめる
- [x] **Step 28: 反映後の確かめ**（`cicd-pipeline.md`）— `scripts/smoke-check.sh` の U4 の確かめ（3d〜3h）のあとに 3i〜3l を足す: `GET /v1/months/2000-01/calendar`、`GET /v1/months/2000-01/assignment`、`PUT /v1/months/2000-01/assignment`（`-X PUT -H "$json" --data '{}'`）、`PATCH /v1/duties/${duty_id}`（`-X PATCH -H "$json" --data '{}'`）の 4 つが、セッションなしで 401。`duty_id` は新しい変数で、U4 の `chore_type_id` と同じ形の作り物の ID を置き、取り違えないようにする。先頭コメントを「全 19 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件、3i〜3l が U5 の 4 件」に直す。書き込みはしない。ワークフローは変えない

### Batch 7: 書類と全体の確認（Step 29〜31）

- [x] **Step 29: README**（`cicd-pipeline.md` の「README に足すこと」）— `README.md` に U5 の節を足す: カレンダーと割り当ての画面の使い方（今月と来月だけ保存できる、保存し直しで変わるもの・変わらないもの、日ごとの「担当を変える」、上書きの確かめ、「先月と同じにする」）、ステージングでの手の確かめの 12 の手順の表、コールドスタートの測り方（コードが変わる反映か、数十分以上待つ。環境変数は触らない。本番ではやらない）、**U5 を反映したあとは `Calendar` と U5 のコードを戻さず前に進んで直すこと**、本番のデータは手で書き換えないこと、費用の確認の手順（最初の請求）と結果の書き場所、保存の途中で失敗したときの直し方（もう一度保存）。**書き換え 2 か所:** (1) U4 の節の「（全 15 件）」を「（全 19 件）」に直し、U5 の `GET`・`PUT /v1/months/{month}/assignment`、`GET /v1/months/{month}/calendar`、`PATCH /v1/duties/{dutyId}` が 401 になることを同じ形で書き足す、(2) U4 のステージングの手の確かめ 6 番の注「（U5 ができるまでは、割り当てがないので常に消せます）」を「（U5 以降は、割り当てに使っている種類は消せません）」に直す。「テストの動かし方」に `npx vitest run u5-assignment-calendar` を足す
- [x] **Step 30: 契約の追加の一覧** — `docs/contract-changes-u5.md`（U4 の形に合わせる）: C1 `Duty`（`origin`、`version`、`recordedByName`）・`MonthCalendar`（`children`、`choreTypes`、`today`、`hasAssignment` の意味）・`GET`・`PUT /months/{month}/assignment`（`confirmOverwrite` を `confirmedChangesHash` に置き換え、409 の `details.changesHash`、422 の `details.overlaps`）・`PATCH /duties/{dutyId}`、C8（`saveAssignment` の形、`getAssignment`、`changeDutyChild` の `NOT_FOUND`、`isChoreTypeAssigned` が本物、`onDutyReassigned`）、C10（印と文言）。U6〜U8 への引き継ぎ（担当を書き換えるときの `version` と `dutyId` の条件、月の状態の ConditionCheck、`origin` の持ち主、担当の作成・削除は U5 だけ、`DID#` の引き当て、`line` に `Calendar` の許可を足すのは読み書きする単位）。U9・U10 への引き継ぎ（お小遣いの根拠として読む、`ASSIGNMENT_PARTIAL_FAILURE` の知らせ）
- [x] **Step 31: 全体の確認と、段階 5 の準備**（NFR8.9、AC4.1.6 の準備）
  - この計画の「この project の確認コマンド」を最後まで実行し、すべて通ることと、行カバレッジが 80% 以上であることを確かめる（下限の設定は変えない。足りなければテストを足す）
  - 新しい依存が増えていないこと、`<作り物の値>` 以外の秘密らしい値がテスト・文書・スクリプトに直書きされていないこと（ESLint と `npm run secrets:scan`）を確かめる
  - 通常の `cdk synth`（README の手順）が通ることを確かめる
  - 速さ（NFR7.20〜NFR7.23）と費用の最初の請求は、ステージングと本番での確かめで、この stage では測らない（`build-and-test` と Step 29 の README に引き継ぐ）。`code-summary.md` に「実行しなかったテスト」として理由つきで残す
  - 注: `code-summary.md`、`source-manifest.json`、`traceability.json` は、この stage が生成の後に書くもので、developer の手順には入れない

## ストーリー・決まり・NFR との対応

| 手順 | ストーリー | 受け入れ条件 | 決まり・NFR |
|------|----------|------------|------------|
| Step 1〜3 | 全体 | — | NFR1.19、NFR3.6、NFR8.9 |
| Step 4〜6 | US3.1、US4.1 | AC3.1.1、AC3.1.4 の下ごしらえ、AC4.1.1 | BR6.2、BR6.4、BR6.7、BR6.14、BR6.17、NFR4.46、NFR8.10、NFR11.4 |
| Step 7〜12 | US3.1 | AC3.1.1、AC3.1.4、AC3.1.5、AC3.1.6、AC3.1.7、AC3.1.8 | BR6.1〜BR6.8、BR6.18、NFR1.20、NFR2.28〜NFR2.32、NFR4.42〜NFR4.52、NFR7.24、NFR11.4 |
| Step 13〜18 | US3.1、US4.1、US2.1（C8 のつなぎ） | AC3.1.2、AC3.1.3、AC3.1.7、AC3.1.8、AC4.1.1〜AC4.1.5、AC2.1.6・AC2.1.7（本物のつなぎ） | BR6.9〜BR6.11、BR6.13〜BR6.16、NFR1.20〜NFR1.22、NFR2.30、NFR2.32、NFR4.43〜NFR4.45、NFR4.48、NFR4.52 |
| Step 19〜24 | US3.1、US4.1 | AC3.1.1〜AC3.1.8、AC4.1.1〜AC4.1.5、AC4.1.7（U5 の画面と、それまでの画面） | BR6.1〜BR6.4、BR6.7、BR6.9、BR6.11〜BR6.17、NFR4.49、NFR7.20、NFR7.21、NFR9.5 |
| Step 25〜28 | US3.1、US4.1（配備） | AC4.1.6 の下ごしらえ（配備） | NFR1.19、NFR3.6、NFR4.50、NFR6.6 |
| Step 29〜31 | — | AC4.1.6（ステージングの測定の手順） | NFR6.6、NFR7.20〜NFR7.23、NFR8.9 |

## 作る・変えるファイルの一覧

- shared: `packages/shared/src/jstDate.ts`（新）、`reasons.ts`、`messages.ts`、`api-types.ts`、`index.ts`
- バックエンド（新）: `repositories/calendarRepository.ts`、`services/calendarService.ts`、`services/assignmentPlanner.ts`、`services/changesHash.ts`、`services/dutyReassignedHook.ts`、`handlers/calendar/{getCalendar,getAssignment,saveAssignment,changeDutyChild,params}.ts`、`lib/requestBody.ts`
- バックエンド（変える）: `entries/api.ts`（4 つの操作、composition root、`coldStart`・`dutyCount`）、`services/calendarPort.ts`（コメントのみ）、`services/familyMemberService.ts`（`findFamilyChild`）、`lib/dynamoClient.ts`、`lib/logger.ts`、`models.ts`
- 画面（新）: `pages/CalendarPage.tsx`、`pages/DayDetail.tsx`、`pages/AssignmentPage.tsx`、`components/OverwriteConfirmDialog.tsx`、`hooks/useMonthCalendar.ts`。（変える）: `App.tsx`、`api/client.ts`、`theme.ts`。（消す）: `pages/CalendarFramePage.tsx`
- インフラ: `infrastructure/lib/data-stack.ts`、`app-stack.ts`、`app.ts`、`infrastructure/test/u5-assignment-calendar/stacks.test.ts`（新）、`infrastructure/test/u1-skeleton-family/stacks.test.ts`・`infrastructure/test/u4-chore-types/stacks.test.ts`（直す）
- テスト補助: `packages/backend/test/u1-skeleton-family/helpers/world.ts`、`helpers/fakeDynamo.ts`、`packages/backend/test/u5-assignment-calendar/helpers/seed.ts`、各パッケージの `test/fixtures/fakeSecrets.ts`、`packages/frontend/test/u5-assignment-calendar/helpers/calendarStub.ts`
- テスト（新）: `packages/shared/test/u5-assignment-calendar/{jstDate,messages}.test.ts`、`packages/backend/test/u5-assignment-calendar/{save-assignment,overwrite-confirmation,save-resilience,view-calendar,change-duty,chore-type-in-use}.{feature,steps.ts}` と単体テスト、`packages/frontend/test/u5-assignment-calendar/{calendar,assignment}.{feature,steps.tsx}` と単体テスト。（直す）画面の既存テストの参照（Step 21）、`packages/frontend/test/u1-skeleton-family/theme.test.ts`（Step 19）
- スクリプトと書類: `scripts/smoke-check.sh`（3i〜3l、先頭コメント）、`README.md`、`docs/contract-changes-u5.md`（新）

## Sources

- `construction/u5-assignment-calendar/functional-design/`（`functional-spec.md`、`rules.md`、`entities.md`）
- `construction/u5-assignment-calendar/nfr-requirements/`、`nfr-design/`（`logical-components.md`、`reliability-design.md`、`security-design.md`、`scalability-design.md`、`performance-design.md`、`observability-design.md`）
- `construction/u5-assignment-calendar/infrastructure-design/`（`infrastructure-specification.md`、`cicd-pipeline.md`、`monitoring-design.md`）
- `inception/contract-design/contract-summary.md`、`inception/units-generation/unit-of-work.md`、`inception/requirements-analysis/requirements.md`
- `construction/u4-chore-types/code-generation/code-generation-plan.md`・`unit-test-instructions.md`（形の手本）
- 既存コード: `packages/backend/src/entries/api.ts`、`services/calendarPort.ts`、`services/choreTypeService.ts`、`packages/backend/test/u1-skeleton-family/helpers/`、`infrastructure/lib/`、`infrastructure/test/`、`scripts/smoke-check.sh`、`README.md`、`docs/contract-changes-u4.md`、`eslint.config.js`、`vitest.config.ts`
- `aidlc/spaces/default/memory/{org,team,project}.md`、`phases/construction.md`

## Assumptions & Open Questions

- [assumption] 画面の最初の 1 回の月は、端末の時計を日本時間にした月で要求し、以後は応答の `today` を使う（上の「前提」）。設計の `today` の決まり（画面は端末の時計を使わない）の例外はこの 1 回だけで、食い違えば読み直す
- [assumption] `familyMemberService.findFamilyChild` は、C6 の窓口として足す（`logical-components.md` の「なければコード生成で足す」）。`userRepository.findById` はすでに `consistent: true` を受け取るので、リポジトリの変更は要らない
- [assumption] `fakeDynamo.ts` の拡張は、U1〜U4 の既存の振る舞いを変えない形で足す。変えると U1〜U4 のテストが落ちるので、Step 3 で確かめる
- [assumption] 速さ（NFR7.20〜NFR7.23、20 回中 19 回が 3 秒以内）と費用の最初の請求は、ステージングと本番でしか確かめられない。この stage の自動テストでは、チャンクの数（124 件で 4 回、310 件で 9 回）と読み取り回数が担当の数で増えないことを確かめる
- [assumption] 画面の既存テストの参照の直し（Step 21）は、期待する振る舞いを変えず、探す印（`data-testid`）とカレンダー API の差し替えだけを直す
- 追加の質問はありません
