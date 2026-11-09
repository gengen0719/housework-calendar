# コード生成の計画 — U6 記録

## Summary

- Builds: 子供が LINE のリッチメニュー「やった」と画面から今日の担当を記録できる。1 対 1 の入口（`oneToOneGate`）・記録の操作の受け口（`recordCommand`）・記録サービス（`recordingService`）・担当の状態の Update 取引（Calendar ＋ 月の ConditionCheck ＋ 単価の ConditionCheck の 3 項目）・画面用 API（`POST /v1/duties/:dutyId/record`）・`lib/promise.ts` の `settle` ユーティリティ。CDK の `line` の権限 2 文と環境変数 2 つ。スモークチェック 1 件追加で計 20 件
- Touches: `packages/shared/src/`（`jstDate.ts`、`reasons.ts`、`messages.ts`、`api-types.ts`）、`packages/backend/src/`（`lib/promise.ts`、`lib/dynamoClient.ts`、`entries/line.ts`、`entries/api.ts`、`handlers/line/recordCommand.ts`、`handlers/line/recordHandler.ts`、`handlers/line/postbackHandler.ts`、`handlers/calendar/recordDuty.ts`、`services/oneToOneGate.ts`、`services/recordingService.ts`、`services/dutyRecordedHook.ts`、`services/lineApiService.ts`、`repositories/calendarRepository.ts`）、`packages/frontend/src/`（`pages/CalendarPage.tsx`、`pages/DayDetail.tsx`、`components/RecordConfirmDialog.tsx`、`api/client.ts`、`theme.ts`）、`infrastructure/lib/app-stack.ts`、`infrastructure/test/u6-recording/stacks.test.ts`（新規）、`infrastructure/test/u1-skeleton-family/stacks.test.ts`（既存: line の権限の期待を追加）、`scripts/setup-rich-menu.ts`（新規）、`scripts/smoke-check.sh`、`docs/contract-changes-u6.md`（新規）、`README.md`
- Tests: Gherkin の筋書き 8 本（バックエンド 6、画面 2）で約 100 場面、部品ごとの単体テスト 5〜8 件、CDK のスタックの組み立てのテスト約 14 件。Vitest で行カバレッジ 80% 以上。U1〜U5 のテストは通ったまま

## 前提

- 設計: `construction/u6-recording/functional-design/`（`functional-spec.md`、`rules.md`、`entities.md`）、`nfr-requirements/`、`nfr-design/`（`security-design.md`、`reliability-design.md`、`logical-components.md`）、`infrastructure-design/infrastructure-specification.md`
- U1〜U5 のコードに足す。U1〜U5 の動きは変えない。U1〜U5 のテストはすべて通ったままにする。ただし次は設計が予告した直しとして同じ手順の中で直す: (1) `infrastructure/test/u1-skeleton-family/stacks.test.ts`（`line` の権限の期待を U6 分追加。Step 33）
- 新しい依存は足さない（LINE の SDK も含め。日付は `shared/jstDate.ts` の既存の仕組みを使う）
- `.gitignore`、`AGENTS.md`、`.github/workflows/` は変えない
- 新しい秘密の情報はない（NFR5.10）
- **秘密の値の決まり（この計画とテストで守る）:** 秘密の値の例は、文書では必ず `<作り物の値>` と書く。テストで使う作り物の値（UUID の形の ID、HMAC の鍵、LINE のトークンなど）は、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置き、値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付けて、テストからは import して使う（直書きは ESLint の `no-restricted-syntax` が止める）。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く

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

- **この単位だけ**（リポジトリのルートで。詳細は `unit-test-instructions.md`）。テストはすべてパスに `u6-recording` を含むフォルダに置く:

```bash
npx vitest run u6-recording --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

- **この単位が直す既存テストだけ**（Step 33 の 1 か所）:

```bash
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts
```

- **この project の確認コマンド**（各 batch の終わりと最後の Step 35 で実行する）:

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## 手順

筋書き（`.feature`）は、機能の切れ目ごとに実装の前に書き、その筋書きが通るまで、その切れ目の層（データ、リポジトリ、業務の決まり、API、画面）をまとめて作ります（BDD）。純粋な関数・条件式の組み立てなど、筋書きでは細かく確かめにくいものの単体テストは、筋書きが通ったあとに足します。

Testing Contract の 8 つの骨組みとの対応: 1 構成と本番設定の骨組み = Step 1、2 テストの実行環境とコマンドの記録 = Step 2〜3、3 振る舞いの筋書き = Step 4・8・13・18・23・27・29・31、4 機能の切れ目の実装 = Step 5〜7・9〜12・14〜17・19〜22・24〜26・28・30・32、5 筋書きを通す = 各筋書きの「通す」Step、6 緑のまま整理 = 各「整える」Step、7 環境・ビルドの設定 = Step 33〜34、8 文書と traceability = Step 35。

---

### Batch 1: 土台（Step 1〜3）

- [x] **Step 1: 骨組みと設定の置き場所**（BR7.1、NFR8）
  - U6 のテストのフォルダを作る:
    - `packages/shared/test/u6-recording/`
    - `packages/backend/test/u6-recording/`（と `helpers/`）
    - `packages/frontend/test/u6-recording/`（と `helpers/`）
    - `infrastructure/test/u6-recording/`
  - `packages/shared/src/api-types.ts` に `RecordDutyRequest`（`{ version: number }`）、`RecordDutyResponse`（`Duty`。U5 の既存の `Duty` 型を使う）の型を足す
  - `packages/backend/src/lib/promise.ts`（U6 で新設）:
    - `Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }` 型を定義する
    - `settle<T>(p: Promise<T>): Promise<Settled<T>>` 関数を実装する（`p.then(value => ({ ok: true, value })).catch(error => ({ ok: false, error }))`）
    - 既存の `src/lib/` に同名のファイルがないことを grep で確かめてから作る
  - 作り物の値の置き場所を確認・追加する（上の「秘密の値の決まり」）:
    - `packages/backend/test/fixtures/fakeSecrets.ts`: U6 で使う作り物の担当 ID、子供の ID、家族外の LINE userId、HMAC の鍵（64 文字の 16 進数。U5 のものがあれば再利用）を確認し、不足分を足す。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける
    - `packages/frontend/test/fixtures/fakeSecrets.ts`: 画面のテストで使う作り物の担当 ID を確認・追加する

- [x] **Step 2: テストの実行環境の準備とコマンドの記録**（NFR8.9）
  - U1〜U5 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（`vitest.config.ts` は変えない。`thresholds.lines: 80` は下げない。新しい道具は入れない）
  - テスト補助を足す・確認する:
    - `packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`: U6 が使う `ChoreTypes` の ConditionCheck（`#unitPrice = :price`）が、既存の `ConditionCheckItem` の評価で正しく動くかを確認する。動かなければ評価の実装を足す（U6 は `ChoreTypes` の ConditionCheck も取引に入れるため。U5 は `ConditionCheckItem` を `ChoreTypes` の `active = :true` で使っているので互換性を確認する）。U6 の `settle` のユーティリティと、並行して走る `choreTypeService.list` の Promise が「未処理の拒否」にならないことも差し替えで確かめられるようにする
    - `packages/backend/test/u1-skeleton-family/helpers/world.ts`: `CHORE_TYPES_TABLE` の環境変数が `setupWorld` で入ることを確認する（U4 で足されていれば不要。ない場合は `process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE` を足す）。`CALENDAR_TABLE` は U5 で足されていることを確認する
    - `packages/backend/test/u6-recording/helpers/seed.ts`: 家族（管理者 1 人、子供 3 人）、種類（皿洗い 100 円、洗濯物たたみ 80 円）、今日の担当（状態ごと: 未・済・×）、確定した月の状態、単価の項目を `Calendar` と `ChoreTypes` に直接置く関数を作る。「済」の担当には `recordedAt`、`recordedBy`、`unitPrice` を必ず 3 つ同時に置く（entities.md の決まり）
  - 最初の空の筋書き 1 つ（`packages/backend/test/u6-recording/runner-ready.feature` と steps）で、「この単位だけ」のコマンドが動くことを確かめ、コマンドを `unit-test-instructions.md` に記録する

- [x] **Step 3: 既存のテストが通ったままかを確かめる**
  - Step 1〜2 の変更のあと、U1〜U5 のバックエンドのテストがすべて通ることを確かめる:
    ```bash
    npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar
    ```
  - 落ちたら補助の変更を直す（U1〜U5 のテストの期待は変えない）
  - `runner-ready.feature` と steps を消す

---

### Batch 2: 共有パッケージと純粋な関数（Step 4〜7）

- [x] **Step 4: テストを書く**（BR7.11、NFR11.5、NFR11.6、BR7.1〜BR7.3）— `packages/shared/test/u6-recording/`:
  - `jstTimeOf.test.ts`:
    - `jstTimeOf` が UTC の秒単位の値から日本時間の HH:mm を返すこと（UTC 07:00 → '16:00'）
    - 境目: UTC 14:59（JST 23:59）、UTC 15:00（JST 0:00）
    - 0 時 0 分（`00:00`）、23 時 59 分（`23:59`）が正しく出ること
  - `messages.test.ts`:
    - `DUTY_CHANGED`、`DUTY_ALREADY_DONE`、`NOT_TODAY_DUTY`、`ADMIN_RECORD_GUIDE`、`JOIN_FAMILY_FIRST` の印と文言が正しく出ること（U5 の既存の印が消えていないことも確かめる）
    - 「どのお手伝いを記録しますか」「{お手伝い}を記録しました（{時:分}）」「{月}/{日} {お手伝い}を記録しますか」「うまく記録できませんでした。もう一度お試しください」の文言の関数（値を入れる形）が正しく動くこと
  - `recordCommand.test.ts`（`packages/backend/test/u6-recording/`）:
    - `parseRecordCommand` が次の形だけを通すこと:
      - `action=record.list`（`source.type = user`、`replyToken` あり） → `{ kind: 'list' }`
      - `action=record.do&dutyId=<小文字 UUID>&v=<0 以上 9 桁以内の整数>` → `{ kind: 'do', dutyId, version }`
    - 次の形はすべて `null` になること（NFR4.54。件数を一覧で書く）:
      - `source.type = group` または `room`（NFR4.55）
      - `replyToken` なし
      - 大文字の UUID の `dutyId`
      - `v=01`（先頭 0）、`v=1.5`（小数）、`v=-1`（符号）、`v=1e2`（指数）、`v=1234567890`（10 桁）
      - 項目の重複（`action=record.do&dutyId=...&v=1&dutyId=...`）
      - 余分な項目
      - `%XX` エンコードされた値
      - 300 文字超え
      - `action=record.list&extraKey=val`
      - `data` が `undefined`

- [x] **Step 5: 作る**（BR7.11、NFR4.53〜NFR4.55、C10）— `packages/shared/src/`:
  - `jstDate.ts`: `jstTimeOf(instant: Date | string): string` を足す（`'HH:mm'` 形式。`Intl.DateTimeFormat` のインスタンスはモジュールの先頭で 1 つ）
  - `reasons.ts`: `DUTY_CHANGED`、`DUTY_ALREADY_DONE`、`NOT_TODAY_DUTY`、`ADMIN_RECORD_GUIDE`、`JOIN_FAMILY_FIRST` を足す（すでにあれば確認のみ）
  - `messages.ts`: Step 4 で確認した文言（記録の返事・確認・案内・エラー）を足す
  - `api-types.ts`: `RecordDutyRequest`（`{ version: number }`）、`RecordDutyResponse`（`Duty`）を足す

  `packages/backend/src/handlers/line/recordCommand.ts`（新設）:
  - `parseRecordCommand(event: LineEvent): RecordCommand | null` を実装する（security-design.md の設計どおり）
  - `MAX_RECORD_CHOICES = 12` の定数を置く
  - `POSTBACK_DATA_MAX_LENGTH` を `groupCommand.ts` から import して使う

- [x] **Step 6: 通す、整える**
  - Step 4 のテストが通るまで直す
  - U1〜U5 の共有のテストが通ることを確かめる
  - `promise.ts` の単体テスト（`packages/backend/test/u6-recording/settle.test.ts`、5〜6 件）:
    - `settle` が成功した Promise を `{ ok: true, value }` にすること
    - `settle` が失敗した Promise を `{ ok: false, error }` にすること
    - `settle` が「未処理の拒否」を起こさないこと（`.catch` 付きで保持されること）

- [x] **Step 7: この batch の確認コマンドを実行する**

---

### Batch 3: 1 対 1 の入口と `oneToOneGate`（Step 8〜12）

*BR7.1、NFR4.56 の実装*

- [x] **Step 8: 筋書きを書く**（BR7.1、NFR4.56、NFR4.58）— `packages/backend/test/u6-recording/`:
  - `one-to-one-gate.feature` と `one-to-one-gate.steps.ts`（約 12 場面）:
    - `source.userId` の利用者が「友だちで家族に入っている子供」のとき → 記録に進む
    - 管理者のとき → `ADMIN_RECORD_GUIDE` の文だけを reply する。`Calendar`・`ChoreTypes` への読み書きが 0 回
    - 家族に入っていない人のとき → `JOIN_FAMILY_FIRST` の文だけを reply する。同上
    - 利用者の記録がない人のとき → `JOIN_FAMILY_FIRST`
    - `friendStatus = blocked`（ブロック中）のとき → `JOIN_FAMILY_FIRST`
    - `source.userId` がないイベントのとき → `JOIN_FAMILY_FIRST`
    - どの場合も、返事に家族の名前・担当・種類の名前が含まれないこと
    - `ADMIN_RECORD_GUIDE` と `JOIN_FAMILY_FIRST` では、LINE への呼び出しが `POST /v2/bot/message/reply` のみ・1 回であること（push・multicast・broadcast がないこと）（NFR4.58）

- [x] **Step 9: 作る（`oneToOneGate.ts`）**（BR7.1、NFR4.56）— `packages/backend/src/services/oneToOneGate.ts`（新設）:
  - `OneToOneAuthResult = { kind: 'child'; ctx: Ctx } | { kind: 'admin' } | { kind: 'outsider' }` 型を定義する
  - `authorizeChild(lineUserId: string | undefined): Promise<OneToOneAuthResult>` を実装する:
    - `familyMemberService.findUserByLineId(lineUserId)` で利用者を探す
    - 友だちで `familyId` があり `role = child` → `{ kind: 'child', ctx: { familyId, userId, role: 'child' } }`
    - 友だちで `familyId` があり `role = admin` → `{ kind: 'admin' }`
    - それ以外（記録なし・ブロック中・家族なし・`lineUserId` なし）→ `{ kind: 'outsider' }`
    - `groupCommandGate.ts` の `judgeRegister` に頼らず独立した関数として作る

- [x] **Step 10: 作る（`recordHandler.ts` の 1 対 1 の入口部分）**（BR7.1、NFR4.56、NFR4.58）— `packages/backend/src/handlers/line/recordHandler.ts`（新設）:
  - `handleRecord(event: LineEvent, now: Date): Promise<void>` を作る（この Step では利用者の分けと案内の返事だけ実装し、`recordDuty` の呼び出しは Step 20 で足す）
  - `authorizeChild` の結果で分岐する:
    - `admin` → `lineApiService.reply(event.replyToken, [buildTextMessage(ADMIN_RECORD_GUIDE)])` して返す
    - `outsider` → `lineApiService.reply(event.replyToken, [buildTextMessage(JOIN_FAMILY_FIRST)])` して返す
    - `child` → 後続の処理へ（この Step では「処理中」として空のまま）
  - `lineApiService.ts` に `buildTextMessage(text: string)` が既存になければ足す

- [x] **Step 11: 通す**
  - Step 8 の筋書きが通るまで直す
  - 単体テストを足す（各 5〜8 件）:
    - `oneToOneGate.test.ts`: 6 通りの分け方（子供・管理者・家族外・記録なし・ブロック中・userId なし）と、`Calendar`・`ChoreTypes` が 0 回であること
    - `buildTextMessage.test.ts`（または `lineApiService.test.ts`）: 文言が正しく組み立てられること

- [x] **Step 12: 整える**
  - 筋書きを緑のまま整理する
  - この batch の確認コマンドを実行する

---

### Batch 4: 今日の担当の一覧（`record.list`）（Step 13〜17）

*BR7.2、BR7.16、AC5.1.3、AC5.1.5、AC5.1.6、F1 の実装*

- [x] **Step 13: 筋書きを書く**（BR7.2、AC5.1.3、AC5.1.5、AC5.1.6）— `packages/backend/test/u6-recording/`:
  - `record-list.feature` と `record-list.steps.ts`（約 14 場面）:
    - 今日の担当が「未」1 件のとき → 1 つのバブルを持つ carousel と「どのお手伝いを記録しますか」が 1 回の reply で返ること（AC5.1.1、BR7.2、Q1）
    - 今日の担当が「未」12 件のとき → 12 個のバブル、案内文なし（BR7.2）
    - 今日の担当が「未」13 件のとき → 先頭 12 個のバブルと「ほかの担当はアプリから記録してください」（BR7.2）
    - 今日の担当が「未」0 件で「済」1 件のとき → 「今日記録できる担当はありません」と「皿洗い（済 16:42）」が同じ返事に出ること（AC5.1.3）
    - 今日の担当が 0 件のとき → 「今日記録できる担当はありません」だけで選べない並びなし（AC5.1.5）
    - 今日の月が確定しているとき → 「この月は確定済みです」だけ（AC5.1.6）
    - 「未」と「済」が混在するとき → 「未」の carousel と「済」の選べない並びが同じ返事に出ること
    - 「×」の担当があるとき → 選べない並びに「掃除機（×）」が出ること
    - 今日の担当以外（他の日・他の家族・他の子供の担当）が含まれないこと
    - `listTodayRecordableDuties` が読み取りを 1 回（月の Query のみ）で完了すること（担当の数で増えない。NFR1.21）

- [x] **Step 14: 作る（`calendarRepository.ts` の読み取り）**（BR7.2、NFR1.20、NFR1.21）— `packages/backend/src/repositories/calendarRepository.ts`（変更）:
  - `listDutiesOn(ctx: Ctx, date: string): Promise<DutyRecord[]>` を足す: `familyId = :f AND begins_with(sk, 'M#<month>#D#<date>#')` の Query（強い整合性。続きを最後まで）
  - `getMonthState(ctx: Ctx, month: string): Promise<MonthStateRecord | null>` を足す（既存があれば確認。Month State は `M#<month>#S` のキー）

- [x] **Step 15: 作る（`recordingService.ts` の `listTodayRecordableDuties`）**（BR7.2、BR7.11、NFR4.57）— `packages/backend/src/services/recordingService.ts`（新設）:
  - `listTodayRecordableDuties(ctx: Ctx, today: string): Promise<TodayRecordableList | 'MONTH_CONFIRMED'>` を実装する:
    - `today` の月の状態を確かめる（`getMonthState`）
    - 月が確定していれば `'MONTH_CONFIRMED'` を返す
    - `listDutiesOn(ctx, today)` で今日の担当を取得する（`ctx.userId` の担当だけを絞る）
    - `selectable`（`status = todo`）と `notSelectable`（`done`・`skipped`。種類の名前と状態の文字を持つ）に分けて返す（`TodayRecordableList`）
    - 種類の名前は `choreTypeService.list(ctx)` で取得する（1 回の Query。`recordingService` は `calendarService` を import しない。ADR-001）

- [x] **Step 16: 作る（`recordHandler.ts` の `record.list` の返事組み立て）**（BR7.2、BR7.9、NFR4.58）— `packages/backend/src/handlers/line/recordHandler.ts`（変更）、`packages/backend/src/services/lineApiService.ts`（変更）:
  - `handleRecord` の `child` 分岐に `record.list` の処理を足す:
    - `choreTypeService.list(ctx)` を `settle` で並行して走らせる（reliability-design.md の「名前の Query の置き方」）
    - `listTodayRecordableDuties` を呼ぶ
    - 結果をもとに返事を組み立てる:
      - `MONTH_CONFIRMED` → 「この月は確定済みです」のテキストメッセージ 1 つ
      - `selectable.length === 0` → 「今日記録できる担当はありません」のテキスト ＋ `notSelectable` の選べない並び（あれば）
      - `selectable.length >= 1` → 「どのお手伝いを記録しますか」のテキスト ＋ Flex Message carousel（1 バブル 1 担当。ボタンの値: `action=record.do&dutyId=<ID>&v=<version>`）＋ `notSelectable` の選べない並び（あれば）
    - `lineApiService.reply(event.replyToken, messages)` で本人にだけ返す
  - `lineApiService.ts` に `buildRecordCarousel(duties, choreNames): FlexMessage` を足す（altText 必須。LINE の SDK なし）

- [x] **Step 17: 通す、整える**
  - Step 13 の筋書きが通るまで直す
  - 単体テストを足す（各 5〜8 件）:
    - `listTodayRecordableDuties.test.ts`: 今日の担当なし・「未」あり・月確定の 3 通り、`ctx.userId` 以外の担当が含まれないこと
    - `buildRecordCarousel.test.ts`: バブルの数（12 件と 13 件の境目）、ボタンの値の形（NFR4.54 が通る形）、altText
  - この batch の確認コマンドを実行する

---

### Batch 5: 記録の書き込み（`record.do` と画面 API）（Step 18〜22）

*BR7.4〜BR7.8、BR7.12、AC5.1.1〜AC5.1.4、AC5.1.7〜AC5.1.13、F2・F3・F4 の実装*

- [x] **Step 18: 筋書きを書く（LINE の記録）**（BR7.4〜BR7.9、BR7.12、BR7.17、NFR2.33〜NFR2.35）— `packages/backend/test/u6-recording/`:
  - `record-do-line.feature` と `record-do-line.steps.ts`（約 18 場面）:
    - 子供が「未」の自分の担当の正しい `v` で押す → 「皿洗いを記録しました（16:42）」が本人の 1 対 1 のトークに reply される。`Calendar` の担当が `status=done`、`recordedAt`、`recordedBy`、`unitPrice`（単価の値）、`version+1` で更新されること（AC5.1.1、BR7.4、BR7.7）
    - 記録後の担当の `unitPrice` が、記録直前に `getCurrentUnitPrice` で読んだ値と一致すること（BR7.7、AC5.1.13）
    - 本人が 2 回目に同じボタンを押す → 「皿洗いを記録しました（最初の時刻）」が返り、担当が変わらず記録が 1 件のまま（AC5.1.4、BR7.8）
    - `v` が担当の現在の `version` と違う → 「この担当は先に変更されました」と今の選択肢（BR7.5）
    - 担当がすでに「済」で `recordedBy` が他の人（管理者） → 「この担当はすでに『済』になっています」と今の選択肢
    - 「×」の担当 → 「この担当は先に変更されました」と今の選択肢
    - 未来の日付の担当（`NOT_TODAY_DUTY`） → 「この担当は先に変更されました」と今の選択肢
    - 月が確定している → 「この月は確定済みです」だけ（出し直しなし）（BR7.5）
    - 出し直しで記録できる担当がなくなった場合 → 「今日記録できる担当はありません」
    - `NOT_FOUND`（ほかの家族の `dutyId`）→ 「この担当は先に変更されました」と今の選択肢（NFR4.57）
    - 取引が 1 回失敗して読み直しで成功する（競合の差し込み a・c 型: 管理者の変更、単価の変更）→ 正しい結果が返ること（BR7.6、BR7.7）
    - 取引が 2 回続けて失敗する → `INTERNAL`「うまく記録できませんでした。もう一度お試しください」が reply される。担当が「未」のままであること（BR7.17）
    - reply の呼び出しが `POST /v2/bot/message/reply` だけ・1 イベントにつき 0 または 1 回であること（NFR4.58）
    - 日本時間の 0 時をまたいで押すと（1 月 7 日 23:59 に出した選択肢を 0:00 を過ぎて押す）`NOT_TODAY_DUTY`（AC5.1.14、BR7.11）

- [x] **Step 19: 作る（`calendarRepository.ts` の書き込み）**（BR7.6、NFR2.33、NFR2.34、NFR4.59）— `packages/backend/src/repositories/calendarRepository.ts`（変更）:
  - `buildRecordItems(duty: DutyRecord, unitPrice: number, ctx: Ctx, now: Date): TransactItem[]` を実装する（取引の 3 項目）:
    - 項目 0: 担当の `UpdateItem`（キー `M#<month>#D#<date>#<choreTypeId>`）:
      - `UpdateExpression`: `SET #status = :done, #recordedAt = :now, #recordedBy = :by, #unitPrice = :price, #updatedAt = :now, #version = #version + :one`
      - `ConditionExpression`: `#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by`
      - 条件式・更新式の**すべての属性名** を `ExpressionAttributeNames`（`#status` 等）で置き換える（NFR4.50）
    - 項目 1: 月の状態の `ConditionCheck`（`M#<month>#S`）: `attribute_not_exists(#confirmed) OR #confirmed = :false`（`buildMonthGuard` を使う）
    - 項目 2: 種類の `ConditionCheck`（`ChoreTypes` の `TYPE#<choreTypeId>`）: `#unitPrice = :price`
  - `buildUnitPriceGuard(choreTypeId: string, unitPrice: number): ConditionCheckItem` を実装する（項目 2 の組み立て）

- [x] **Step 20: 作る（`recordingService.ts` の `recordDuty`）**（BR7.4〜BR7.8、BR7.11〜BR7.12、BR7.17、NFR2.33〜NFR2.36）— `packages/backend/src/services/recordingService.ts`（変更）:
  - `recordDuty(ctx: Ctx, dutyId: string, version: number | (() => number), options: { todayOnly: boolean; now: Date; route: 'line' | 'api' }): Promise<RecordResult>` を実装する:
    - `reliability-design.md` の「記録の全体の流れ」の `for attempt in 1..2` の疑似コードに従う
    - `today = jstDateOf(now)`
    - `findDuty(ctx, dutyId)`（GetItem）→ `version` が関数なら呼ぶ → BR7.4 の判定の順番（1〜9）→ `getCurrentUnitPrice` → `buildRecordItems` → `writeTransaction`
    - 断られたら `classifyCancellation` → 競合なら読み直してやり直す（1 回まで）、それ以外は投げ直す
    - 2 回続けて失敗 → `INTERNAL` を返す
    - 成功 → `DUTY_RECORDED` をログに残す → `notifyDutyRecorded` を 1 回呼ぶ（BR7.14）→ `{ duty, alreadyRecorded: false }` を返す
    - BR7.4 の判定の順番（3 を 4〜8 より前に置く。二重押しの扱い。BR7.8）:
      1. `NOT_FOUND`
      2. `NOT_OWN_DUTY`
      3. 「済」で本人 → `alreadyRecorded: true` で返す。「済」で他の人 → `DUTY_ALREADY_DONE`
      4. `MONTH_CONFIRMED`
      5. `DUTY_SKIPPED_BY_ADMIN`
      6. `FUTURE_DUTY`
      7. `todayOnly` かつ今日でない → `NOT_TODAY_DUTY`
      8. `version` が違う → `DUTY_CHANGED`
      9. 通過 → 単価を読んで書く

- [x] **Step 21: 作る（`recordHandler.ts` の `record.do` 部分と `postbackHandler.ts`）**（BR7.4〜BR7.9、BR7.17、NFR4.57〜NFR4.58）— `packages/backend/src/handlers/line/recordHandler.ts`（変更）、`packages/backend/src/handlers/line/postbackHandler.ts`（変更）:
  - `recordHandler.ts`: `record.do` の処理を足す:
    - `settle(choreTypeService.list(ctx))` で並行して名前の Query を走らせる（reliability-design.md の「名前の Query の置き方」。書く前に結果を取り出す）
    - `recordDuty(ctx, cmd.dutyId, cmd.version, { todayOnly: true, now, route: 'line' })` を呼ぶ
    - `buildMessages(result, await names)`: 返事のメッセージを組み立てる（純粋な関数）
      - 成功（`alreadyRecorded` 含む）→「{お手伝い}を記録しました（{時:分}）」
      - `DUTY_CHANGED`・`NOT_OWN_DUTY`・`DUTY_SKIPPED_BY_ADMIN`・`NOT_TODAY_DUTY`・`NOT_FOUND` → 「この担当は先に変更されました」＋ 今の選択肢（`listTodayRecordableDuties` を呼ぶ）
      - `DUTY_ALREADY_DONE` → 「この担当はすでに『済』になっています」＋ 今の選択肢
      - `FUTURE_DUTY` → 「まだ来ていない日の担当は記録できません」＋ 今の選択肢
      - `MONTH_CONFIRMED` → 「この月は確定済みです」だけ
      - `INTERNAL` → 「うまく記録できませんでした。もう一度お試しください」
    - `try { reply(event.replyToken, messages) } catch { LINE_REPLY_FAILED }` で本人にだけ返す（(c) の扱い）
  - `postbackHandler.ts`: `parseRecordCommand` の結果で分岐する:
    - 記録の操作 → `handleRecord`
    - そうでなければ → 既存の `handleGroupEvent`

  `entries/line.ts`（変更）:
  - `postback` の `accepts` を `(event) => isGroupOperation(event) || parseRecordCommand(event) !== null` に変える（security-design.md の順番は変えない）

- [x] **Step 22: 作る（画面用 API の記録）**（BR7.4、BR7.10、NFR4.60〜NFR4.62）— `packages/backend/src/handlers/calendar/recordDuty.ts`（新設）、`packages/backend/src/entries/api.ts`（変更）:
  - `handlers/calendar/recordDuty.ts`:
    - `requireAuth` → `requireMembership` → `dutyId` の形の確認（小文字 16 進数 UUID でなければ 404。DynamoDB を読まずに）→ 担当の 404 → **本文を遅延して読む**（`recordDuty` に `version` を関数で渡す。U5 の `changeDutyChild` と同じ） → `recordDuty(ctx, dutyId, () => body.version, { todayOnly: false, now, route: 'api' })`
    - `recordBodySchema = z.object({ version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strip()`
    - 成功 → 200 `{ duty }`（更新後の `Duty`）
    - `alreadyRecorded` の場合も 200（同じ結果）
    - エラーの応答コードは functional-spec.md の表のとおり（NFR4.60 の確かめの順番）
  - `entries/api.ts`: `POST /v1/duties/:dutyId/record` を足す

- [x] **Step 23: 筋書きを書く（画面 API の記録）**（BR7.4、BR7.10、AC5.1.7〜AC5.1.12、NFR4.60〜NFR4.62）— `packages/backend/test/u6-recording/`:
  - `record-api.feature` と `record-api.steps.ts`（約 16 場面）:
    - 子供が自分の「未」の担当を記録する → 200 で `Duty`（`status=done`、`recordedAt`、`recordedBy=ctx.userId`、`unitPrice`）が返ること（AC5.1.7）
    - 前の月の担当も記録できること（月をまたいでよい。`todayOnly: false`）（AC5.1.8）
    - 確定した月の担当は 409 `MONTH_CONFIRMED`（AC5.1.9）
    - 明日以降の日付の担当は 422 `FUTURE_DUTY`（AC5.1.10）
    - 「×」の担当は 409 `DUTY_SKIPPED_BY_ADMIN`（AC5.1.11）
    - 他の子供の担当は 403 `NOT_OWN_DUTY`（AC5.1.12）
    - 管理者のセッションは 403 `NOT_OWN_DUTY`
    - 本人の 2 回目は 200（同じ `Duty`）（AC5.1.4）
    - 他の家族の `dutyId`（本文正常）→ 404
    - 他の家族の `dutyId`（本文誤り）→ 404（本文より先に 404）（NFR4.60）
    - 認証なし → 401、家族外 → 403 `NOT_FRIEND`
    - 形の違う `dutyId`（大文字 UUID 等）→ 404（DynamoDB を読まない）
    - 本文なし・文字列の `version`・負の数 → 422 `INVALID_REQUEST`
    - 余分な項目（`unitPrice: 99999`）付きで送っても、書かれた値が裏側のもの（NFR4.61）
    - 取引の直前に担当が「×」にされる（差し込み a 型）→ 読み直して 409 `DUTY_SKIPPED_BY_ADMIN`（BR7.6）

- [x] **Step 24: 通す**
  - Step 18・23 の筋書きが通るまで直す（U1〜U5 のテストも通ったまま）
  - 単体テストを足す（各 5〜8 件）:
    - `recordingService.test.ts`: `recordDuty` の BR7.4 の判定の順番（二重押しは 3. で止まる）、2 回失敗で `INTERNAL`、`DUTY_RECORDED` のログ
    - `calendarRepository.recordItems.test.ts`: 取引の 3 項目の組み立て、**条件式・更新式のすべての属性名が `ExpressionAttributeNames` で置き換えられていること**（NFR4.50 の確かめ）、100 項目を超えないこと
    - `buildMessages.test.ts`: 各印ごとの返事の形（純粋な関数のテスト）

- [x] **Step 25: 整える**
  - 筋書きを緑のまま整理する
  - この batch の確認コマンドを実行する

---

### Batch 6: 信頼性の競合テストと `dutyRecordedHook`（Step 26〜28）

*BR7.6、BR7.8、BR7.14、NFR2.33〜NFR2.39、競合の差し込み全種類の確かめ*

- [x] **Step 26: 筋書きを書く（競合と失敗）**（BR7.6、BR7.7、BR7.14、BR7.17、NFR2.33〜NFR2.39）— `packages/backend/test/u6-recording/`:
  - `record-resilience.feature` と `record-resilience.steps.ts`（約 16 場面）:
    - **(a) 管理者が取引直前に担当の子供を変える**（`version` が増える）→ 読み直して `DUTY_CHANGED` または `NOT_OWN_DUTY`。担当が「未」のまま（BR7.6）
    - **(b) 取引直前に月が確定する** → 読み直して `MONTH_CONFIRMED`。担当が「未」のまま
    - **(c) 取引直前に単価が変わる** → 読み直して新しい単価で再び書く。書かれた `unitPrice` が新しい値であること（BR7.7）
    - **(d) 同じ本人の同時の 2 つの要求** → 片方だけ成功し、もう片方は読み直して `alreadyRecorded`。担当が 1 件のまま（BR7.8、NFR2.35）
    - **(d') 管理者が先に「済にする」** → 読み直して `DUTY_ALREADY_DONE`
    - **2 回続けて断られる** → `INTERNAL`。書き込みの呼び出しが 2 回で止まること（BR7.17）
    - **思いがけない Code（`ThrottlingError`）** → 読み直さずに投げ直す（500）（reliability-design.md）
    - `markDone` の失敗 → 500（記録は 1 件のまま。再送で `alreadyRecorded`）
    - 書けたあとに例外が出ない（書けたら投げない）作りになっていること（名前の Query は書く前。フックは `try/catch` 済み）
    - `onDutyRecorded` フックが書けたあとに 1 回だけ呼ばれること。フックが投げても記録が成功のまま返ること（BR7.14）
    - フックが登録されていなければ何もしない
    - 同じ記録で 2 回呼ばない（`alreadyRecorded` の場合は呼ばない）

- [x] **Step 27: 作る（`dutyRecordedHook.ts`）**（BR7.14、NFR2.39）— `packages/backend/src/services/dutyRecordedHook.ts`（新設）:
  - `DutyRecordedEvent`、`DutyRecordedHook` 型（reliability-design.md のとおり）を定義する
  - `onDutyRecorded(hook: DutyRecordedHook): void`（登録）と `notifyDutyRecorded(event: DutyRecordedEvent): Promise<void>`（呼び出し）を実装する
  - 登録がなければ何もしない。投げたら `DUTY_RECORDED_HOOK_FAILED`（warn）を残す
  - `entries/api.ts` と `entries/line.ts` の起動の枠（composition root）で登録の口を用意する（U8 向け。今は何も登録しない）

- [x] **Step 28: 通す、整える**
  - Step 26 の筋書きが通るまで直す
  - 単体テストを足す（5〜8 件）:
    - `dutyRecordedHook.test.ts`: 登録あり/なし、投げても結果が変わらない、2 回呼ばれないこと
  - この batch の確認コマンドを実行する

---

### Batch 7: 画面の実装（Step 29〜32）

*BR7.10、AC5.1.7〜AC5.1.12、NFR4.62、NFR9.7 の実装*

- [x] **Step 29: 筋書きを書く（画面の記録）**（BR7.10、AC5.1.7〜AC5.1.12、NFR4.62）— `packages/frontend/test/u6-recording/`:
  - `calendar-record.feature` と `calendar-record.steps.tsx`（約 16 場面）:
    - 子供がカレンダーを開くと、自分の「未」の今日以前の担当に「やった」ボタンが出ること（BR7.10）
    - 「やった」を押すと「1/5 皿洗いを記録しますか」と「記録する」「やめる」の確認が出ること（BR7.10、Q4）
    - 「記録する」を押すと `POST /v1/duties/:dutyId/record`（`{ version }`）が送られ、200 でカレンダーが読み直されて「済 16:42 太郎が記録」の表示になること（AC5.1.7）
    - 「記録する」を押したあと、結果が返るまでボタンが押せなくなること（`aria-busy`）
    - 明日以降の担当には「まだ来ていない日の担当は記録できません」の文字だけ（ボタンなし）（AC5.1.10）
    - 「×」の担当には「お母さんが『やらなかった』にしています」の文字（AC5.1.11）
    - 確定した月の担当には「この月は確定済みです」の文字（AC5.1.9）
    - 他の子供の担当にはボタンも文字も出ないこと（AC5.1.12）
    - 管理者にはボタンが出ないこと（修正は U7）
    - 409 `DUTY_CHANGED`（担当が変わった）→「この担当は先に変更されました」の文言と読み直し（BR7.5）
    - 409 `DUTY_SKIPPED_BY_ADMIN` → 「お母さんが『やらなかった』にしています」と読み直し
    - 409 `MONTH_CONFIRMED` → 「この月は確定済みです」と読み直し
    - 500 `INTERNAL` → 「うまく記録できませんでした。もう一度お試しください」と「読み込み直す」
    - 前の月の担当にも「やった」ボタンが出ること（確定していない月。AC5.1.8）
    - 種類の名前の中のタグは文字として出ること（NFR4.62）

  - `record-confirm-dialog.feature` と `record-confirm-dialog.steps.tsx`（約 6 場面）:
    - Esc キーで確認ダイアログが閉じること
    - 「やめる」で確認ダイアログが閉じること
    - フォーカスが「記録する」ボタンに移動すること（アクセシビリティ）

- [x] **Step 30: 作る（画面の実装）**（BR7.10、NFR4.62、NFR9.7）— `packages/frontend/src/`:
  - `components/RecordConfirmDialog.tsx`（新設）:
    - 「{月}/{日} {お手伝い}を記録しますか」と「記録する」「やめる」のダイアログ
    - 開いたときフォーカスが「記録する」に移動する
    - Esc キーで閉じる（`onKeyDown`）
    - 「記録する」押下中は `aria-busy=true` で押せなくする
    - 種類の名前は `React` の文字として出す（`dangerouslySetInnerHTML` を使わない）
  - `api/client.ts`（変更）:
    - `recordDuty(dutyId: string, body: RecordDutyRequest, signal?: AbortSignal): Promise<RecordDutyResponse>` を足す
  - `pages/CalendarPage.tsx`（変更）:
    - `DutyRow`（または相当するコンポーネント）に U6 の「やった」ボタン・理由の文字・「済」の表示を足す（条件判定は BR7.10 の表に従う）
    - 「やった」ボタンを押すと `RecordConfirmDialog` を開く
    - 「記録する」で `recordDuty` を呼び、200 でカレンダーを読み直す
    - 失敗の種類ごとの文言を出す（functional-spec.md の「記録の結果の印と返事の対応」の画面の列）
    - `today`（応答の値）と担当の日付を比べてボタンの出し分けを行う（端末の時計は使わない）
  - `pages/DayDetail.tsx`（変更）:
    - 日の詳細でも同じロジックで「やった」ボタン・理由・「済」の表示を出す
  - `theme.ts`（変更）:
    - U6 で追加する色（「やった」ボタン・確認ダイアログ・「済」の表示）の WCAG コントラスト比 4.5:1 以上を守る（NFR9.7）

- [x] **Step 31: 作る（テーマの確かめ）**（NFR9.7）:
  - `packages/frontend/test/u6-recording/theme.test.ts`:
    - 「やった」ボタン・確認ダイアログ・各理由の文字の色と背景の色の組み合わせのコントラスト比が 4.5:1 以上
    - 「やった」ボタンの最小の大きさが 44 ピクセル以上

- [x] **Step 32: 通す、整える**
  - Step 29 の筋書きが通るまで直す
  - 単体テストを足す（各 5〜8 件）:
    - `RecordConfirmDialog.test.tsx`: Esc、「やめる」、`aria-busy`、フォーカス移動
    - `client.recordDuty.test.ts`: リクエストの形、`signal` の渡し方
  - この batch の確認コマンドを実行する

---

### Batch 8: インフラとスモークチェック（Step 33〜34）

*NFR4.63、NFR4.64、NFR1.25 の実装*

- [x] **Step 33: スタックのテストを先に書く**（NFR4.63、NFR4.64、NFR1.25）— `infrastructure/test/u6-recording/stacks.test.ts`（新設、U5 の同ファイルと同じ作り、約 14 件）:
  - `line` の `Calendar` への許可が `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` のちょうど 4 つ（`Scan`・`PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*` がなく、リソースはテーブルの ARN だけで `/index/` を含まず、文が 1 つ）（NFR4.63）
  - `line` の `ChoreTypes` への許可が `GetItem`・`Query`・`ConditionCheckItem` のちょうど 3 つ（`Scan`・`PutItem`・`DeleteItem` がなく、リソースはテーブルの ARN だけ、文が 1 つ）（NFR4.63）
  - `line` の既存の許可（`Users`・`Families`・`ProcessedLineEvents`・`NotificationGroups`・SSM の `line/*`・`cloudfront/*`）が U6 の前後で変わらないこと（NFR4.64）
  - `api` の許可が U6 で変わらないこと（NFR4.64）
  - ステージングの `line` が本番の `Calendar` と `ChoreTypes` の ARN を含まないこと
  - `line` の環境変数のキーに `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` が含まれること（NFR4.63）
  - テーブル・Lambda・ロググループ・指標・アラームの数が U6 の前後で同じ（NFR1.25）
  - `line` のメモリ・タイムアウト・アーキテクチャが U1 のまま（256 MB・30 秒・ARM64）
  - `Calendar` が本番で `RETAIN`（U5 の設定が変わっていない）

  `infrastructure/test/u1-skeleton-family/stacks.test.ts`（既存、変更）:
  - `line` の許可に関するテスト（現時点では「`line` に `Calendar` も `ChoreTypes` も含む文がない」）を、U6 で追加したあとの期待（`Calendar` と `ChoreTypes` の許可が U6 の表と一致）に更新する

- [x] **Step 34: 作る（CDK の構成）**（NFR4.63、NFR4.64、NFR1.25）— `infrastructure/lib/app-stack.ts`（変更）:
  - `line` の Lambda の `environment` に `CALENDAR_TABLE: props.calendar.tableName`、`CHORE_TYPES_TABLE: props.choreTypes.tableName` を追加する（`api` の環境変数は変えない）
  - `line` のロールに `Calendar` への許可の新しい文を 1 つ追加する:
    ```ts
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem'],
        resources: [props.calendar.tableArn],
      }),
    );
    ```
  - `line` のロールに `ChoreTypes` への許可の新しい文を 1 つ追加する:
    ```ts
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:ConditionCheckItem'],
        resources: [props.choreTypes.tableArn],
      }),
    );
    ```
  - `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`・`dynamodb:*` は**足さない**（NFR4.64）
  - `data-stack.ts` と `app.ts` は変えない
  - `packages/backend/src/lib/dynamoClient.ts` の `tables.calendar()` と `tables.choreTypes()` のコメント（「画面用の Lambda だけが持つ」）を「`line` も持つ（U6）」に直す

  `scripts/smoke-check.sh`（変更）:
  - U5 の確かめ（3i〜3l）のあとに `3m` を 1 件足す: `POST /v1/duties/${duty_id}/record`（`-X POST -H "$json" --data '{"version":0}'`）が 401 になること
  - 先頭コメントを「全 20 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件、3i〜3l が U5 の 4 件、3m が U6 の 1 件」に直す
  - `duty_id` の変数は U5 のものを使うか、U6 用に同じ形の作り物の ID を置く（`fakeSecrets.ts` から。取り違えないようにコメントを付ける）

  Step 33 のテストを通す:
  ```bash
  npx vitest run infrastructure/test/u6-recording/stacks.test.ts infrastructure/test/u1-skeleton-family/stacks.test.ts
  ```

---

### Batch 9: 書類と全体の確認（Step 35）

- [x] **Step 35: 書類、スクリプト、全体の確認**（NFR10.6、NFR10.7、BR7.15）:
  - `scripts/setup-rich-menu.ts`（新設）:
    - `--env staging|production` の指定を必須にする（既定で本番を選ばない。NFR10.6）
    - トークンは環境ごとの SSM（`line/channel-access-token`）から実行時に読む。値はスクリプトにも README にも書かない（例は `<作り物の値>`）
    - `set`（メニューの作成・設定）・`get`（現在の設定の確認）・`delete`（取り消し）の 3 つのサブコマンド
    - メニューの定義: 「やった」のボタン 1 つ、postback `action=record.list`、全員に同じメニュー
    - LINE の公式の API を、SDK なし・`fetch` で直接呼ぶ（新しい依存を足さない）
    - 実行方法: `npx tsx scripts/setup-rich-menu.ts --env staging set`（README に書く）
  - `docs/contract-changes-u6.md`（新設）:
    - functional-spec.md の「契約への追加」の表の内容を U5 の `contract-changes-u5.md` の形式に揃えて書く
  - `README.md`（変更）:
    - U6 の節を足す: リッチメニューの設定・確認・取り消しの手順（`scripts/setup-rich-menu.ts`。トークンの例は `<作り物の値>`）、3 秒の測り方（NFR7.30）、スモークチェックが 20 件になったこと
    - スモークチェックの節の「全 19 件」を「全 20 件」に直す
    - 「テストの動かし方」に `npx vitest run u6-recording` を足す
  - `traceability.json`（`code-generation-plan.md` の隣に新設）: 受け入れ条件（AC5.1.1〜AC5.1.15）、BR7.x、NFR の ID を実装ファイルと対応させる
  - `source-manifest.json`（`code-generation-plan.md` の隣に新設）: U6 が作る・変えるすべてのアプリケーションソースのパスを列挙する
  - **全体の確認コマンドを実行する**（U1〜U6 のすべてのテストが通ること、型チェックが通ること）:
    ```bash
    npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
    ```
