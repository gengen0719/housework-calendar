# コード生成の計画 — U7 確認・修正と確定

## Summary

- Builds: 管理者が子供の記録を画面から確認・修正（取り消す・済にする・やらなかったにする・やらなかったを外す）し、月を確定・確定の取り消しする。状態の変更（`changeDutyStatus`。markDone は 3 項目・ほかは 2 項目の 1 回の取引。競合は 1 回読み直し）・月の確定／取り消し（`confirmMonth`・`unconfirmMonth`。version を条件にしない冪等の書き込み）・画面用 API 3 本（`POST /v1/duties/:dutyId/status`、`PUT`・`DELETE /v1/months/:month/confirmation`）・日の詳細の操作ボタンと確認ダイアログ・カレンダーの確定／取り消しボタン。`onDutyReassigned` の `kind` に `status-changed` を足す（U8 向け）。スモークチェック 3 件（3n〜3p）を含め計 23 件
- Touches: `packages/shared/src/`（`reasons.ts`、`messages.ts`、`api-types.ts`）、`packages/backend/src/`（`services/calendarService.ts`、`repositories/calendarRepository.ts`、`handlers/calendar/changeDutyStatus.ts`〈新設〉、`handlers/calendar/confirmMonth.ts`〈新設〉、`handlers/calendar/params.ts`、`entries/api.ts`、`services/dutyReassignedHook.ts`）、`packages/frontend/src/`（`pages/CalendarPage.tsx`、`pages/DayDetail.tsx`、`components/StatusChangeDialog.tsx`〈新設〉、`components/MonthConfirmDialog.tsx`〈新設〉、`api/client.ts`、`theme.ts`）、`infrastructure/test/u7-review-confirm/stacks.test.ts`〈新設〉、`scripts/smoke-check.sh`、`docs/contract-changes-u7.md`〈新設〉、`README.md`。`infrastructure/lib/app-stack.ts`・`data-stack.ts`・`app.ts` は**変えない**
- Tests: Gherkin の筋書き 6 本（バックエンド 4、画面 2）で約 90 場面、部品ごとの単体テスト 5〜8 件、CDK のスタックの組み立てのテスト約 16 件（前後で同じことを固定）。Vitest で行カバレッジ 80% 以上。U1〜U6 のテストは通ったまま

## 前提

- 設計: `construction/u7-review-confirm/functional-design/`（`functional-spec.md`、`rules.md`、`entities.md`）、`nfr-requirements/`、`nfr-design/`（`security-design.md`、`reliability-design.md`、`observability-design.md`、`performance-design.md`、`logical-components.md`）、`infrastructure-design/infrastructure-specification.md`
- U1〜U6 のコードに足す。U1〜U6 の動きは変えない。U1〜U6 のテストはすべて通ったままにする。U7 は既存テストの期待を**書き換えない**（インフラの IAM・環境変数が U7 で変わらないため。U6 と違い既存の `stacks.test.ts` の更新はない）
- 新しい依存は足さない（日付は `shared/jstDate.ts`、本文の検証は `zod`、画面は MUI・`@testing-library/react`、どれも U1〜U6 に既存）
- `.gitignore`、`AGENTS.md`、`.github/workflows/`、`infrastructure/lib/`（`app-stack.ts`・`data-stack.ts`・`app.ts`）は変えない
- 新しい秘密の情報はない（NFR5.13）。U7 は LINE を呼ばない（reply・push・multicast・broadcast なし。NFR1.30）
- **秘密の値の決まり（この計画とテストで守る）:** 秘密の値の例は、文書では必ず `<作り物の値>` と書く。テストで使う作り物の値（UUID の形の担当 ID・子供の ID・ほかの家族の ID、`YYYY-MM` の月、HMAC の鍵、セッショントークンなど）は、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置き、**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付けて**、テストからは import して使う（直書きは ESLint の `no-restricted-syntax` が止める）。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く

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

- **この単位だけ**（リポジトリのルートで。詳細は `unit-test-instructions.md`）。テストはすべてパスに `u7-review-confirm` を含むフォルダに置く:

```bash
npx vitest run u7-review-confirm --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

- **この project の確認コマンド**（各 batch の終わりと最後の Step 29 で実行する）:

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## 手順

筋書き（`.feature`）は、機能の切れ目ごとに実装の前に書き、その筋書きが通るまで、その切れ目の層（データ、リポジトリ、業務の決まり、API、画面）をまとめて作ります（BDD）。純粋な関数・条件式の組み立てなど、筋書きでは細かく確かめにくいものの単体テストは、筋書きが通ったあとに足します。

Testing Contract の 8 つの骨組みとの対応: 1 構成と本番設定の骨組み = Step 1、2 テストの実行環境とコマンドの記録 = Step 2〜3、3 振る舞いの筋書き = Step 4・9・14・19・23、4 機能の切れ目の実装 = Step 5〜8・10〜13・15〜18・20〜22・24、5 筋書きを通す = 各筋書きの「通す」Step、6 緑のまま整理 = 各「整える」Step、7 環境・ビルドの設定 = Step 25〜26、8 文書と traceability = Step 27〜29。

各手順の末尾に、実装する BR8.x / NFR / AC6.1.x の ID を付けます。

---

### Batch 1: 土台と共有パッケージ（Step 1〜8）

- [x] **Step 1: 骨組みと設定の置き場所**（BR8.8、NFR8）
  - U7 のテストのフォルダを作る:
    - `packages/shared/test/u7-review-confirm/`
    - `packages/backend/test/u7-review-confirm/`（と `helpers/`）
    - `packages/frontend/test/u7-review-confirm/`（と `helpers/`）
    - `infrastructure/test/u7-review-confirm/`
  - 作り物の値の置き場所を確認・追加する（上の「秘密の値の決まり」）:
    - `packages/backend/test/fixtures/fakeSecrets.ts`: U7 で使う作り物の担当 ID、子供の ID、管理者の ID、ほかの家族の ID、`YYYY-MM` の月、HMAC の鍵・セッショントークン（U5・U6 のものがあれば再利用）を確認し、不足分を足す。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける
    - `packages/frontend/test/fixtures/fakeSecrets.ts`: 画面のテストで使う作り物の担当 ID・月を確認・追加する

- [x] **Step 2: テストの実行環境の準備とコマンドの記録**（NFR8.13）
  - U1〜U6 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（`vitest.config.ts` は変えない。`thresholds.lines: 80` は下げない。新しい道具は入れない）
  - テスト補助を足す・確認する:
    - `packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`: U7 が使う取引の形を確認する。markDone の 3 項目（担当の `UpdateItem` ＋ 月の状態の `ConditionCheck` ＋ `ChoreTypes` の単価の `ConditionCheck`）と、ほかの 3 操作の 2 項目（担当の `UpdateItem` ＋ 月の状態の `ConditionCheck`）の条件式を本当に評価できること、確定の `attribute_not_exists(#sk)` 条件の `PutItem` と `UpdateItem` の切り替えを評価できること、取り消しの `attribute_exists(#sk)` 条件を評価できること、`REMOVE` の反映を確かめられることを確認する。足りなければ評価の実装を足す（U6 で単価の `ConditionCheck`、U5 で `attribute_not_exists` の Put は対応済みのはず。互換性を確認する）
    - `packages/backend/test/u7-review-confirm/helpers/seed.ts`: 家族（管理者 1 人、子供 3 人）、種類（皿洗い 120 円、洗濯物たたみ 80 円など）、状態ごとの担当（未・済・×。「済」には `recordedAt`・`recordedBy`・`unitPrice` を 3 つ同時に置く。entities.md の不変条件）、確定した月／していない月の月の状態（`M#<month>#S`。`confirmed`・`confirmedAt`・`confirmedByUserId`・`version`）、記録のない月（行なし）を `Calendar` と `ChoreTypes` に直接置く関数を作る
    - `packages/frontend/test/u7-review-confirm/helpers/`: LIFF と API を差し替える既存の仕組み（U5・U6）を再利用する
  - 最初の空の筋書き 1 つ（`packages/backend/test/u7-review-confirm/runner-ready.feature` と steps）で、「この単位だけ」のコマンドが動くことを確かめ、コマンドを `unit-test-instructions.md` に記録する（NFR8.13）

- [x] **Step 3: 既存のテストが通ったままかを確かめる**
  - Step 1〜2 の変更のあと、U1〜U6 のバックエンドのテストがすべて通ることを確かめる:
    ```bash
    npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording
    ```
  - 落ちたら補助の変更を直す（U1〜U6 のテストの期待は変えない）
  - `runner-ready.feature` と steps を消す

- [x] **Step 4: テストを書く（共有パッケージの型・印・文言）**（C10、BR8.3、BR8.10、BR8.12、BR8.17）— `packages/shared/test/u7-review-confirm/`:
  - `messages.test.ts`:
    - 状態の変更の確認の 1 行（「{月}/{日} {お手伝い} {子供}: {前} → {後}」の 5 とおり）が正しく組み立つこと（StatusChangePreview の文言）
    - 注意（「お小遣いの回数から外れます」「{単価} 円で数えます」）が正しく出ること
    - 「済にする」の確認（「{月}/{日} {お手伝い} {子供} を『済』にします」）
    - 確定の確認（「{月}を確定しますか？ 確定すると変更できなくなります」）、未の件数の注意（「未の担当が {N} 件あります。確定すると、これらは記録もやらなかったにもできなくなります」）、確定の取り消しの確認（「{月}の確定を取り消しますか？ 取り消すと、また変更できるようになります」）
    - 既存の印・文言（`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`ADMIN_ONLY`・`NOT_FOUND`・`NOT_FAMILY_MEMBER`・`INVALID_MONTH`・`INTERNAL`・`DUTY_CHANGED`・`MONTH_CONFIRMED_LABEL`）が消えていないこと、U7 が流用すること
  - `api-types.test.ts`（または `messages.test.ts` と同じファイル）:
    - `StatusChangeAction` が `cancel`・`markDone`・`markSkipped`・`unmarkSkipped` の 4 つだけであること（`@ts-expect-error` でほかの文字列を弾くこと）

- [x] **Step 5: 作る（共有パッケージ）**（C10、BR8.3、BR8.10、BR8.12）— `packages/shared/src/`:
  - `reasons.ts`: U7 で使う印はすべて既存（`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`ADMIN_ONLY`・`NOT_FOUND`・`NOT_FAMILY_MEMBER`・`INVALID_MONTH`・`INTERNAL`・`DUTY_CHANGED`）であることを確認する。不足があれば足す（なければ確認のみ）
  - `messages.ts`: Step 4 で確認した文言（状態の変更の確認・注意・確定／取り消しの確認・未の件数の注意）を、値を入れる形の関数として足す
  - `api-types.ts`:
    - `StatusChangeAction = 'cancel' | 'markDone' | 'markSkipped' | 'unmarkSkipped'` を足す
    - `StatusChangeRequest = { action: StatusChangeAction; version: number }`、`StatusChangeResponse`（`Duty`。U5 の既存の `Duty` 型。`recordedByName` を含む）を足す
    - `StatusChangePreview`・`MonthConfirmPreview`（entities.md の values の形。画面の確認に使う値。保存しない）を足す

- [x] **Step 6: 通す、整える（共有パッケージ）**
  - Step 4 のテストが通るまで直す
  - U1〜U6 の共有のテストが通ることを確かめる

- [x] **Step 7: 作る（`onDutyReassigned` の `kind` に `status-changed` を足す）**（BR8.15、NFR2.50、reliability R-01・R-02）— `packages/backend/src/services/dutyReassignedHook.ts`（変更）:
  - 既存の `DutyReassignedEvent` の `kind` に `'status-changed'` を足す（`'child-changed' | 'deleted' | 'status-changed'`）。`fromChildUserId` は**必須のまま**（1 つの担当の形を崩さない。`month` を渡す新しい形は作らない）。`toChildUserId`・`newOrigin` は `'child-changed'` のときだけの任意のまま
  - `onDutyReassigned`（登録の口）と `notifyDutyReassigned(events)`（成功後に 1 回呼ぶ実行側）の既存の分け方を崩さない。U7 は登録しない（U8 が composition root で登録する）
  - 投げたときの警告のログに `kind` を含められるよう、既存の `DUTY_HOOK_FAILED`（または U7 の文脈の `DUTY_REASSIGN_HOOK_FAILED`）が `dutyId`・`kind` だけを残す形を確認する（名前は書かない。observability-design.md）

- [x] **Step 8: 単体テスト（`dutyReassignedHook` の `status-changed`）、整える**（BR8.15、NFR2.50）— `packages/backend/test/u7-review-confirm/`:
  - `dutyReassignedHook.statusChanged.test.ts`（5〜8 件）:
    - `kind: 'status-changed'` のイベントが `fromChildUserId` を必須で持つこと（`@ts-expect-error` で欠けるとエラー）
    - 登録あり／なしの両方、投げても呼び出し元の結果を変えないこと、`DUTY_REASSIGN_HOOK_FAILED`（`dutyId`・`kind` だけ）が残り名前・単価が含まれないこと
  - U5・U6 の `dutyReassignedHook` のテストが通ったままであること
  - この batch の確認コマンドを実行する

---

### Batch 2: リポジトリの取引の組み立て（Step 9〜13）

*BR8.4〜BR8.6、BR8.11、BR8.12、NFR4.69、NFR2.44 の実装*

- [x] **Step 9: 筋書きを書く（取引の組み立てと条件）**（BR8.4〜BR8.6、BR8.11、BR8.12、NFR4.69）— `packages/backend/test/u7-review-confirm/`:
  - `status-transaction.feature` と `status-transaction.steps.ts`（約 14 場面。リポジトリの取引項目を偽の DynamoDB で評価して確かめる）:
    - markDone（未→済）: 担当の `UpdateItem`（`SET #status=:done, #recordedAt=:now, #recordedBy=:by, #unitPrice=:price, #updatedAt=:now, #version=#version+:one`）＋ 月の状態の `ConditionCheck`（`buildMonthGuard`）＋ `ChoreTypes` の単価の `ConditionCheck`（`buildUnitPriceGuard`）の 3 項目で書かれること
    - markDone（×→済）: 条件 `#status=:from` の `:from` が `skipped` になること。`#childUserId` の条件を**付けないこと**（記録者は管理者で担当の子供ではない）
    - cancel（済→未）・markSkipped（済→×、未→×）・unmarkSkipped（×→未）: 担当の `UpdateItem`（`SET #status=:to, #updatedAt=:now, #version=#version+:one REMOVE #recordedAt, #recordedBy, #unitPrice`）＋ 月の状態の `ConditionCheck` の 2 項目。単価の `ConditionCheck` を付けないこと。3 項目を同時に `REMOVE` すること（どれか 1 つだけ残らない。BR8.5）
    - **条件式・更新式のすべての属性名が `ExpressionAttributeNames`（`#` の別名）で置き換えられていること**（NFR4.69）
    - 担当の条件が `#status=:from AND #version=:v AND #dutyId=:id` であること（`attribute_not_exists` ではないので項目が無ければ作られない）
    - 月の確かめが**担当の `month`**（今日の月ではない）で引かれること（NFR2.48）
    - 確定: 行が無い月は `attribute_not_exists(#sk)` 条件の `PutItem`（`version=1`、`confirmed=true`・`confirmedAt`・`confirmedByUserId`）、行がある月は `UpdateItem`（`confirmed=true`・`confirmedAt`・`confirmedByUserId`・`version+1`、version を条件にしない）で組み立つこと
    - 取り消し: 行がある月は `UpdateItem`（`confirmed=false`、`confirmedAt`・`confirmedByUserId` を `REMOVE`、`version+1`、version を条件にしない）、行が無い月は何もしないこと
    - 取引の項目数が 100 を超えないこと

- [x] **Step 10: 作る（`calendarRepository.ts` の状態変更の取引）**（BR8.4〜BR8.6、NFR4.69、NFR4.70）— `packages/backend/src/repositories/calendarRepository.ts`（変更）:
  - `buildMarkDoneItems(duty, unitPrice, ctx, now): TransactItem[]`（3 項目。担当の `UpdateItem` ＋ 月の `buildMonthGuard` ＋ `buildUnitPriceGuard`）を足す。更新式は U6 の `buildRecordItems` と同じ形で、条件に `#childUserId` を付けず、`:from` は `todo` または `skipped`
  - `buildResetStatusItems(duty, toStatus, ctx, now): TransactItem[]`（2 項目。担当の `UpdateItem` の `SET … REMOVE #recordedAt, #recordedBy, #unitPrice` ＋ 月の `buildMonthGuard`）を足す。`:to` は `todo` または `skipped`
  - 既存の `buildMonthGuard`・`buildUnitPriceGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction` をそのまま使う（新設しない）
  - すべての属性名を `ExpressionAttributeNames` で置き換える（NFR4.69）

- [x] **Step 11: 作る（`calendarRepository.ts` の月の状態の確定・取り消し）**（BR8.11、BR8.12、BR8.14、NFR2.46）— `packages/backend/src/repositories/calendarRepository.ts`（変更）:
  - `putConfirmedMonthIfAbsent(ctx, month, now): Promise<'written' | 'exists'>`（行が無い月への `attribute_not_exists(#sk)` 条件の `PutItem`。`version=1`。競合=`exists` を返す）
  - `updateMonthConfirmation(ctx, month, confirmed, now): Promise<void>`（`UpdateItem`。`confirmed=true` なら `confirmedAt`・`confirmedByUserId` を `SET`、`false` なら `REMOVE`。version は条件にしない。`version+1`）
  - 取り消しで行が無い月に `UpdateItem` を当てない作り（`attribute_exists(#sk)` 条件つき、または `getMonthState` で行を見てから）にする。2 回以内に収める（performance NFR7.35）
  - `getMonthState(ctx, month)` は U6 の既存を使う（なければ確認）

- [x] **Step 12: 通す（取引の筋書き）**
  - Step 9 の筋書きが通るまで直す
  - U1〜U6 の `calendarRepository` のテストが通ったまま

- [x] **Step 13: 単体テスト（取引の組み立て）、整える**（BR8.4〜BR8.6、BR8.11、NFR4.69）— `packages/backend/test/u7-review-confirm/`:
  - `calendarRepository.statusItems.test.ts`（各 5〜8 件）: markDone の 3 項目・ほかの 2 項目の組み立て、**すべての属性名が `#` の別名であること**（NFR4.69）、100 項目を超えないこと、`PutItem`・`DeleteItem` を担当に発行しないこと（担当を作らない・消さない）
  - `calendarRepository.confirmItems.test.ts`（5〜8 件）: 確定の `attribute_not_exists` の Put、取り消しの `UpdateItem`／何もしない、version を条件にしないこと
  - この batch の確認コマンドを実行する

---

### Batch 3: サービス層（状態の変更・確定・取り消し）（Step 14〜18）

*BR8.1〜BR8.7、BR8.11〜BR8.16、BR8.18、NFR2.44〜NFR2.50 の実装*

- [x] **Step 14: 筋書きを書く（`changeDutyStatus`・`confirmMonth`・`unconfirmMonth`）**（BR8.2、BR8.4〜BR8.7、BR8.11〜BR8.16、BR8.18、NFR2.44〜NFR2.49）— `packages/backend/test/u7-review-confirm/`:
  - `status-change-service.feature` と `.steps.ts`（約 18 場面）:
    - 5 とおりの遷移（未→済、×→済、済→未、済→×、未→×、×→未）が成功し、更新後の `Duty` が返ること（状態・記録の 3 項目のそろい方。AC6.1.1〜AC6.1.5）
    - markDone で `recordedBy`=管理者・`recordedAt`=`now`・`unitPrice`=読んだ単価、`childUserId` は変わらないこと（AC6.1.2、AC6.1.3）
    - 判定の順番（本文の 422 は入口。ここでは探す→月の確定→表の順）: `NOT_FOUND`（ほかの家族）→ `MONTH_CONFIRMED`（確定した月）→ `INVALID_TRANSITION`（表にない組）
    - 月の確かめが**担当の `month`**で行われること（過去の確定していない月の担当は変えられる。AC6.1.8、NFR2.48）
    - 競合の差し込み: (a) 先に担当が変わる→読み直して `INVALID_TRANSITION`、(b) 先に確定→`MONTH_CONFIRMED`、(c) markDone で単価が変わる→新しい単価で書き直す（`unitPrice` が新しい値。BR8.7）、(d) 先に別状態→`INVALID_TRANSITION`／`NOT_FOUND`
    - 2 回続けて断られると `INTERNAL`。書き込みの呼び出しが 2 回で止まること（BR8.18）
    - 思いがけない Code（`ThrottlingError`）は読み直さずに投げ直すこと
    - 成功後、担当が「未」でなくなった（markDone・markSkipped）ときだけ `notifyDutyReassigned(events)` を 1 回呼ぶこと（cancel・unmarkSkipped では呼ばない。一覧が空なら呼ばない。BR8.15）
    - `confirmMonth`: 行が無い月は `version=1` の確定行を作る、行がある月は `UpdateItem`、すでに確定済みでも同じ結果（冪等）。成功後、その月で「未」でなくなった担当を一覧にして `notifyDutyReassigned(events)` を 1 回呼ぶこと
    - `unconfirmMonth`: 行がある月は `confirmed=false`、行が無い月は何もしない、確定していなくても同じ結果。`notifyDutyReassigned` は**呼ばない**
    - 確定・取り消しの連打・二度押しで最後の操作の結果にそろうこと（BR8.14、BR8.16）
    - `fetch`（外部通信）が 1 回も呼ばれないこと（NFR1.30、performance NFR7.35）

- [x] **Step 15: 作る（`changeDutyStatus`）**（BR8.2、BR8.4〜BR8.7、BR8.15、BR8.18、NFR2.44〜NFR2.50）— `packages/backend/src/services/calendarService.ts`（変更）:
  - `changeDutyStatus(ctx, dutyId, action, options: { now: Date; version: number | (() => number) }): Promise<ChangeStatusResult>` を実装する（reliability-design.md の `for attempt in 1..2` の疑似コードに従う。`MAX_ATTEMPTS = 2`）:
    - `findDuty`（GetItem 3 回）→ version が関数なら呼ぶ → 判定の順（1 `NOT_FOUND`、2 `MONTH_CONFIRMED`、3 `INVALID_TRANSITION`）
    - markDone のみ書く直前に `getCurrentUnitPrice`（C7。種類が無ければ 500 `INTERNAL`）
    - `buildMarkDoneItems` または `buildResetStatusItems` で取引を 1 回 → 断られたら `classifyCancellation` で競合だけ読み直してやり直す（1 回まで）、ほかの Code は投げ直す → 2 回失敗で `INTERNAL`
    - 成功 → `DUTY_STATUS_CHANGED` を残す → 「未」でなくなったら `notifyDutyReassigned([event])` を 1 回 → 更新後の `Duty`（`recordedByName` は家族全員から `recordedBy` で引く。U5 の BR6.13）を返す
    - FR6.1 の表の判定（`judgeTransition(status, action)`）を純粋な関数として置く

- [x] **Step 16: 作る（`confirmMonth`・`unconfirmMonth`）**（BR8.11、BR8.12、BR8.14〜BR8.16、NFR2.46）— `packages/backend/src/services/calendarService.ts`（変更）:
  - `confirmMonth(ctx, month, options: { now: Date }): Promise<void>` を実装する:
    - `putConfirmedMonthIfAbsent` を試し、`exists` なら `updateMonthConfirmation(…, true)` でそろえる（version を条件にしない）
    - `MONTH_CONFIRMED_SET`（`confirmed: true`）を残す → その月で「未」でなくなった担当を一覧にして `notifyDutyReassigned(events)` を 1 回（BR8.15、R-01）
  - `unconfirmMonth(ctx, month): Promise<void>` を実装する:
    - 行があれば `updateMonthConfirmation(…, false)`、無ければ何もしない
    - `MONTH_CONFIRMED_SET`（`confirmed: false`）を残す。`notifyDutyReassigned` は呼ばない
  - U5 の `changeDutyChild` の形（読み直し・`notifyDutyReassigned` の呼び方）にそろえる

- [x] **Step 17: 通す（サービスの筋書き）**
  - Step 14 の筋書きが通るまで直す
  - U1〜U6 の `calendarService` のテストが通ったまま

- [x] **Step 18: 単体テスト（サービス層）、整える**（BR8.2、BR8.4〜BR8.7、BR8.11、BR8.18）— `packages/backend/test/u7-review-confirm/`:
  - `changeDutyStatus.test.ts`（各 5〜8 件）: 判定の順番、`judgeTransition` の 5 とおりと表にない組、2 回失敗で `INTERNAL`、`DUTY_STATUS_CHANGED`／`DUTY_STATUS_REJECTED` のログ、呼び出しの回数の上限（markDone 6／11、ほか 5／9。performance NFR7.35）
  - `confirmMonth.test.ts`（5〜8 件）: 行の有無の分岐、冪等（二度押し）、`MONTH_CONFIRMED_SET`、呼び出し 2 回以内、取り消しは `notifyDutyReassigned` を呼ばないこと
  - `observability` のログの単体テスト: 成功・各断り・`INTERNAL`・読み直しで `DUTY_STATUS_RETRY`（info）が出て、名前・単価が含まれないこと（NFR2.51、NFR2.52）
  - この batch の確認コマンドを実行する

---

### Batch 4: 画面用 API の入口（Step 19〜22）

*BR8.1〜BR8.4、BR8.11、BR8.12、NFR4.65〜NFR4.73 の実装*

- [x] **Step 19: 筋書きを書く（画面用 API 3 本）**（BR8.1〜BR8.4、NFR4.65〜NFR4.68、AC6.1.1〜AC6.1.9）— `packages/backend/test/u7-review-confirm/`:
  - `status-api.feature` と `status-api.steps.ts`（約 20 場面）:
    - `POST /v1/duties/:dutyId/status`:
      - 管理者が未→済（markDone）→ 200 `Duty`（AC6.1.2、AC6.1.3）、済→未（cancel）→ 200（AC6.1.1）、済→×／未→×（markSkipped）→ 200（AC6.1.4）、×→未（unmarkSkipped）→ 200（AC6.1.5）
      - 確かめの順番（NFR4.65〜NFR4.67）: 認証なし→401、家族外→403 `NOT_FAMILY_MEMBER`、子供→403 `ADMIN_ONLY`（DynamoDB を読まない）、本文の形が外れる（`action` が 4 つ以外・`version` 欠落/文字列/負/小数）→422 `INVALID_REQUEST`（**担当を探す前**）、`dutyId` の形が違う→404（DynamoDB を読まない）、ほかの家族の `dutyId`→404
      - 確定した月の担当→409 `MONTH_CONFIRMED`（AC6.1.6）、表にない組→409 `INVALID_TRANSITION`
      - 余分な項目（`unitPrice: 99999`・`recordedBy`・`status`）付きで送っても、書かれた値が裏側のもの（NFR4.67）
      - 取引直前に単価が変わる（差し込み c）→新しい単価で記録（BR8.7）
      - 2 回失敗→500 `INTERNAL`
    - `PUT /v1/months/:month/confirmation`:
      - 管理者→200（確定した）、記録のない月（行なし）でも 200 で `version=1` の確定行、すでに確定済みでも 200（冪等）
      - 子供→403 `ADMIN_ONLY`、家族外→403 `NOT_FAMILY_MEMBER`、認証なし→401、`month` の形が外れる（`2027-13`・`2027`・`abc`）→422 `INVALID_MONTH`（DynamoDB を読まない。本文は読まない）
      - ほかの家族の月に触れないこと（自分の `familyId` の月だけ変わる。NFR4.66）
    - `DELETE /v1/months/:month/confirmation`:
      - 管理者→200（取り消した。AC6.1.7）、確定していない月でも 200（冪等）、記録のない月は行を作らず 200
      - 子供→403 `ADMIN_ONLY`、`month` の形が外れる→422 `INVALID_MONTH`

- [x] **Step 20: 作る（`handlers/calendar/changeDutyStatus.ts`）**（BR8.1、BR8.2、NFR4.65〜NFR4.67、NFR4.70）— `packages/backend/src/handlers/calendar/changeDutyStatus.ts`（新設）、`packages/backend/src/handlers/calendar/params.ts`（変更）:
  - `requireAuth` → `requireMembership` → `requireAdmin`（子供は 403 `ADMIN_ONLY`。DynamoDB を読まない）→ **本文の形を先に zod で読む**（`statusChangeBodySchema = z.object({ action: z.enum([...]), version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })`。外れたら 422 `INVALID_REQUEST`）→ `dutyId` の形（小文字 16 進数 UUID でなければ 404。`requireDutyIdParam` 相当を `params.ts` から使う）→ `changeDutyStatus(ctx, dutyId, action, { now, version: body.version })`
  - security-design.md のとおり、U5・U6 と違い**本文の 422 を担当の探索より先に**出す（`action` が結果を分ける値。NFR4.67、BR8.2）
  - エラーの応答コードは functional-spec.md の「状態の変更の印と返事の対応」のとおり（200／404／409／422／403／500）
  - `strip` で `action`・`version` 以外の項目を捨てる（NFR4.67）

- [x] **Step 21: 作る（`handlers/calendar/confirmMonth.ts` と `entries/api.ts`）**（BR8.1、BR8.11、BR8.12、NFR4.65、NFR4.68、NFR4.71、NFR4.72）— `packages/backend/src/handlers/calendar/confirmMonth.ts`（新設）、`packages/backend/src/entries/api.ts`（変更）:
  - `confirmMonth.ts`: `PUT` と `DELETE` のハンドラ。`requireAuth` → `requireMembership` → `requireAdmin` → `month` の形（`YYYY-MM`。外れたら 422 `INVALID_MONTH`。DynamoDB を読まない）→ `confirmMonth(ctx, month, { now })`（PUT）／`unconfirmMonth(ctx, month)`（DELETE）→ 200。本文は読まない（NFR4.68）
  - `entries/api.ts`: ルート表に `POST /v1/duties/:dutyId/status`、`PUT /v1/months/:month/confirmation`、`DELETE /v1/months/:month/confirmation` を足す。既存の順番・`verifyOriginHeader`・`REQUEST_*` は変えない
  - **`infrastructure/lib/app-stack.ts` は変えない**（`api` の権限・環境変数は U4・U5 で足り済み。NFR4.71、NFR4.72）

- [x] **Step 22: 通す、整える、単体テスト（入口）**（NFR4.65〜NFR4.68、NFR4.73）— `packages/backend/test/u7-review-confirm/`:
  - Step 19 の筋書きが通るまで直す（U1〜U6 のテストも通ったまま）
  - 単体テスト（各 5〜8 件）:
    - `statusChangeBody.test.ts`: zod が `action`・`version` だけを通し、余分な項目を `strip`、外れを 422 にすること
    - `changeDutyStatus.handler.test.ts`: 確かめの順番（認証→家族→管理者→本文の形→`dutyId` の形→404）、子供が DynamoDB を 1 回も読まないこと（NFR4.65）
    - ログの伏せ字（成功・各断り・例外の全分岐で、作り物の目印が 1 行も含まれないこと。NFR4.73、NFR2.52）
  - この batch の確認コマンドを実行する

---

### Batch 5: 画面の実装（Step 23〜24）

*BR8.3、BR8.8〜BR8.13、NFR4.73、NFR9.8 の実装*

- [x] **Step 23: 筋書きを書く（画面）**（BR8.3、BR8.8〜BR8.13、AC6.1.9〜AC6.1.11、NFR9.8）— `packages/frontend/test/u7-review-confirm/`:
  - `review-confirm.feature` と `review-confirm.steps.tsx`（約 18 場面）:
    - 管理者が日の詳細を開くと、担当ごとに今の状態からできる操作だけがボタンで出ること（未→「済にする」「やらなかったにする」、済→「取り消す」「やらなかったにする」、×→「やらなかったを外す」「済にする」。BR8.9、AC6.1.11）
    - 子供にはボタンが出ないこと（見るだけ。BR8.1、AC6.1.10）
    - 「取り消す」を押すと「1/5 皿洗い 太郎: 済 → 未 に戻します」「お小遣いの回数から外れます」の確認、「はい」で `POST …/status`（`{ action: 'cancel', version }`）→ 200 → カレンダー（または日の詳細）読み直し（AC6.1.1、BR8.3）
    - 「済にする」を押すと「… を『済』にします」「{単価} 円で数えます」の確認（単価は確認時点の `getCurrentUnitPrice` を読む。BR8.3）→ 200 →「済 … お母さんが記録」（AC6.1.2、AC6.1.3）
    - 「やらなかったにする」（済→×、未→×）、「やらなかったを外す」（×→未）の確認と結果（AC6.1.4、AC6.1.5）
    - 「はい」を押したあと結果が返るまでボタンが押せないこと（`aria-busy`。NFR9.8）
    - 失敗の文言と読み直し: 404 `NOT_FOUND`／409 `INVALID_TRANSITION`→「この担当は先に変更されました」＋読み直し、409 `MONTH_CONFIRMED`→「この月は確定済みです」＋読み直し、422 `INVALID_REQUEST`→「操作の内容が正しくありません。もう一度お試しください」、500 `INTERNAL`→「表示できませんでした。もう一度お試しください」＋「読み込み直す」（functional-spec.md の表）
    - カレンダーの月の見出しの近くに、管理者にだけ、確定していない月は「この月を確定する」、確定済みの月は「確定を取り消す」が出ること（BR8.13）
    - 「この月を確定する」→「未」が N 件（N≥1）なら件数の注意を添えた確認、N=0 なら件数なしの確認（件数は画面が `getMonthCalendar` の担当から数える。BR8.10、AC6.1.9）→「はい」で `PUT …/confirmation` → 200 →「確定済み」表示
    - 「確定を取り消す」→確認 →「はい」で `DELETE …/confirmation` → 200 →「確定済み」が消える（AC6.1.7）
    - 種類の名前・子供の表示名の中のタグが文字として出ること（`dangerouslySetInnerHTML` を使わない。NFR9.8）
  - `review-dialog.feature` と `review-dialog.steps.tsx`（約 6 場面）:
    - StatusChangeDialog / MonthConfirmDialog が Esc・「やめる」で閉じ、開いたときフォーカスが肯定ボタンに移ること（アクセシビリティ）

- [x] **Step 24: 作る（画面）、通す、整える、単体テスト**（BR8.3、BR8.8〜BR8.13、NFR9.8）— `packages/frontend/src/`:
  - `components/StatusChangeDialog.tsx`（新設）: StatusChangePreview の 1 行と注意（「お小遣いの回数から外れます」「{単価} 円で数えます」）、「はい」「やめる」。開いたとき肯定ボタンにフォーカス、Esc で閉じる、送信中は `aria-busy` で押せない、名前は文字として出す
  - `components/MonthConfirmDialog.tsx`（新設）: MonthConfirmPreview（確定／取り消しの確認、確定のときは未の件数の注意）、「はい」「やめる」。同じアクセシビリティ
  - `api/client.ts`（変更）: `changeDutyStatus(dutyId, body: StatusChangeRequest, signal?)`、`confirmMonth(month, signal?)`、`unconfirmMonth(month, signal?)` を足す
  - `pages/DayDetail.tsx`（変更）: 管理者に、担当ごとに今の状態からできる操作ボタンを出し、押すと `StatusChangeDialog` を開く。「はい」で API を呼び、成功したらカレンダー（または日の詳細）を読み直す。失敗の種類ごとの文言を出す。見せた時点の `version` を持たせる。子供にはボタンを出さない（BR8.9、BR8.1）
  - `pages/CalendarPage.tsx`（変更）: 月の見出しの近くに、管理者にだけ、確定していない月は「この月を確定する」、確定済みの月は「確定を取り消す」を出す。`MonthConfirmDialog` を開き、未の件数は `getMonthCalendar` の担当から数える。前後の月のボタンで移った先の月にもボタンを出す（BR8.13、BR8.10）
  - `theme.ts`（変更）: U7 で追加する色（各操作ボタン・確認ダイアログ・各状態の表示）の WCAG コントラスト比 4.5:1 以上、ボタンの最小の大きさ 44 ピクセル以上（NFR9.8）
  - 単体テスト（各 5〜8 件）: `StatusChangeDialog.test.tsx`・`MonthConfirmDialog.test.tsx`（Esc・やめる・`aria-busy`・フォーカス・注意の出し分け）、`client.statusChange.test.ts`（リクエストの形・`signal`）、`theme.test.ts`（コントラスト・ボタンの大きさ）
  - Step 23 の筋書きが通るまで直す。この batch の確認コマンドを実行する

---

### Batch 6: インフラのテストとスモークチェック（Step 25〜26）

*NFR4.71、NFR4.72、NFR1.31、NFR6.8 の実装（前後で同じことを固定）*

- [x] **Step 25: スタックのテストを書く（前後で同じことを固定）**（NFR4.71、NFR4.72、NFR1.31）— `infrastructure/test/u7-review-confirm/stacks.test.ts`（新設、U6 の同ファイルと同じ作り、約 16 件）:
  - `api` の `Calendar` への許可が U7 の前後で変わらないこと（`GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem` の 6 つ。U5 の範囲。U7 で追加なし。NFR4.71）
  - `api` の `ChoreTypes` への許可が U7 の前後で変わらないこと（6 操作。U4 の範囲。追加なし）
  - `api` の環境変数（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` ほか）が U7 の前後で変わらないこと（追加なし）
  - `line` の許可・環境変数が U7 の前後で**一切変わらない**こと（U7 は LINE の経路なし。NFR4.72）
  - U7 で新しい IAM の文・環境変数が足されていないこと（`addToRolePolicy` の文の数が U6 と同じ）
  - テーブル・Lambda・ロググループ・指標・アラームの数が U7 の前後で同じこと（NFR1.31）
  - `api` のメモリ・タイムアウト・アーキテクチャが U1 のまま（256 MB・30 秒・ARM64）
  - `Calendar` が本番で `RETAIN`（U5 の設定が変わっていない）
  - ステージングの `api` が本番の `Calendar`・`ChoreTypes` の ARN を含まないこと
  - `data-stack.ts`・`app.ts` に差分がないこと（索引・テーブルを足さない）

- [x] **Step 26: スタックのテストを通す、スモークチェックを足す**（NFR1.31、NFR6.8）:
  - `infrastructure/lib/app-stack.ts` は**変えない**。Step 25 のテストが、既存の `app-stack.ts` のまま通ることを確かめる（通らなければテストの期待を直す。インフラ定義は変えない）:
    ```bash
    npx vitest run infrastructure/test/u7-review-confirm/stacks.test.ts
    ```
  - `scripts/smoke-check.sh`（変更）: U6 の `3m` のあとに U7 の 3 件を足す（計 23 件）。`duty_id`・`month` は作り物の値（取り違えないようコメント）:
    - `3n`: `POST /v1/duties/${duty_id}/status`（`-X POST -H "$json" --data '{"action":"cancel","version":0}'`）がセッションなしで 401
    - `3o`: `PUT /v1/months/2000-01/confirmation`（`-X PUT -H "$json" --data '{}'`）がセッションなしで 401
    - `3p`: `DELETE /v1/months/2000-01/confirmation`（`-X DELETE`）がセッションなしで 401（`PUT`・`DELETE` が CloudFront を通って `api` に届くことも分かる）
  - 先頭コメントを「全 23 件: … 3m が U6 の 1 件、3n〜3p が U7 の 3 件」に直す

---

### Batch 7: 書類と全体の確認（Step 27〜29）

- [x] **Step 27: 書類（契約の変更と README）**（NFR10.6、NFR10.7、BR8.8）:
  - `docs/contract-changes-u7.md`（新設）: functional-spec.md の「契約への追加」の表の内容を U6 の `contract-changes-u6.md` の形式に揃えて書く（`POST …/status`、`PUT`・`DELETE …/confirmation`、`changeDutyStatus`・`confirmMonth`・`unconfirmMonth`、`onDutyReassigned` の `kind: 'status-changed'`、月の状態への `confirmedAt`・`confirmedByUserId`・`version`、C10 の文言。壊す変更はない）
  - `README.md`（変更）:
    - U7 の節を足す: 状態の変更・月の確定／取り消しの画面の使い方、3 秒の測り方（NFR7.33・NFR7.34。markDone の 20 件の用意、冷たい起動 10 回以上）、スモークチェックが 23 件になったこと
    - スモークチェックの節の「全 20 件」を「全 23 件」に直す
    - 「テストの動かし方」に `npx vitest run u7-review-confirm` を足す

- [x] **Step 28: traceability.json と source-manifest.json**（BR8.1〜BR8.18、AC6.1.1〜AC6.1.11、NFR）:
  - `traceability.json`（`code-generation-plan.md` の隣に新設）: 受け入れ条件（AC6.1.1〜AC6.1.11）、BR8.1〜BR8.18、割り当てられた NFR（NFR2.44〜NFR2.53、NFR4.65〜NFR4.73、NFR5.13、NFR7.33〜NFR7.38、NFR9.8、NFR1.31、NFR11.7）の ID を、実装・テストのファイルと対応させる（各 `OK` の target は実在するファイル）
  - `source-manifest.json`（`code-generation-plan.md` の隣に新設）: U7 が作る・変えるすべてのアプリケーションソースのパスを列挙する（`packages/*/src/**`、`infrastructure/test/u7-review-confirm/stacks.test.ts`、`scripts/smoke-check.sh`、`docs/contract-changes-u7.md`、`README.md`）。`infrastructure/lib/` は含めない（変えないため）

- [x] **Step 29: 全体の確認コマンドを実行する**（U1〜U7 のすべてのテストが通ること、型チェックが通ること）:
  ```bash
  npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
  ```
