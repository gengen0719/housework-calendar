# 臨時のお手伝い実装計画

## Summary

- Builds: 臨時用マスタ管理と日付詳細からの依頼、通常割り当て変更時の保持。
- Touches: shared型・文言、backendの種類/担当処理と保存/API、frontendの設定/日付詳細/API、および関連テスト。
- Tests: 8要件に対応するBDDシナリオと既存回帰、全体行80%以上。

## Steps

- [x] Step 1: 現在のブランチと変更を保全し、main起点の短い作業ブランチを用意。既存テスト全体を実行し、Vitest設定と部分コマンドの準備を確認する（NFR2）。
- [x] Step 2: packages/backend/test/ad-hoc-chores/ と packages/frontend/test/ad-hoc-chores/ に実行可能BDDシナリオを先に追加する。臨時用マスタ管理、追加、重複/権限/月/確定競合、通常分から独立した保持、記録/金額/通知を検証する（FR1–FR6、NFR1–NFR2）。
- [x] Step 3: shared/src/api-types.ts・reasons.ts・messages.ts・exports、backend/src/models.ts と choreTypeのhandler/service/repository、frontend/src/pages/ChoreTypesPage.tsx・FamilySettingsPage.tsx・App.tsx・api/client.tsを必要最小限変更し、通常/臨時の用途を区別して臨時マスタを管理する。既存データは通常用として扱い、既存種類管理を再利用する（FR2、NFR1）。
- [x] Step 4: backend/src/handlers/calendar/に単発追加handlerを追加し、entries/api.tsのrouteとcalendarService/calendarRepository/calendarPortを拡張する。サーバー側で家族/管理者/子供/日付/月確定/種類用途・activeを検証し、条件付き取引で同日同種類の重複・再送を防ぐ。assignmentPlannerと通常割り当ての種類検証を修正し臨時分を保持する。永続的な臨時識別を担当変更後も失わない（FR1、FR3–FR5、NFR1）。
- [x] Step 5: frontend/src/pages/DayDetail.tsx・CalendarPage.tsx と新規臨時依頼フォームを実装し、登録済み臨時種類と子供を選ぶ。未割り当て月でも日付を開け、保存後に月を再取得。空/失敗/保存中/取消を扱う。既存通知・実施記録・金額集計の互換性を検証し、必要箇所のみ修正する（FR1、FR3–FR6、NFR2）。
- [x] Step 6: 新規シナリオを成功させ、通常種類/割り当て/実施/状態変更/金額/通知の既存テストを回帰確認する。テストは必要なら既存test領域も更新。全体テスト、80%行カバレッジ、lint、4パッケージ別型検査、frontendビルドを実行する。code-summary.mdとtraceability.jsonに実在するファイルパスと証拠を記録する（全要件）。

## Impact and Diff Preview

通常種類の保存方式を互換拡張して臨時用途を追加する。既存記録は通常用のまま扱う。日付詳細に追加フォームとAPIを接続し、担当の臨時識別によって月再生成から除外する。新規依存・AWSインフラ・直接デプロイは不要。共有型の変更は通常割り当て、記録、集計、通知へ波及するため既存回帰を必須とする。スキーマ拡張は既存項目を読めるようにし、物理移行を行わない。

## Testing Contract

```json
{
  "version": 1,
  "methodology": "bdd",
  "source": "team",
  "ordering": "機能ごとに、先に利用者目線の Given/When/Then の筋書き（シナリオ）を書き、そのシナリオがすべて通るまで実装します。",
  "scope": "express",
  "test_strategy": "minimal",
  "project_type": "brownfield",
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
    "strategy": "minimal",
    "strategy_volume": [
      "One verifiable test per requirement at the narrowest effective level.",
      "At least one happy-path unit test per component.",
      "Unit tests are the default; a bugfix/security scope floor may require an integration or E2E regression when that is the narrowest level that reproduces the defect."
    ],
    "scope_floor": [
      "Keep the existing test suite green.",
      "This scope adds no extra new-test floor beyond the selected test strategy."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "bdd",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
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
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Behavior scenarios - define executable examples for the observable feature slice before implementation.",
      "Feature slice - implement the required data, repository, business, API, and frontend layers.",
      "Behavior scenarios - run the scenarios until they pass.",
      "Feature slice - refactor while the scenarios stay green.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:7d42285496914227b29fa6b5dfd30e7967fd7305751121d076265a9e2720e653",
  "contract_sha256": "sha256:0ded2eeb799fed0791f012aa2d1062af4164affad6c3c19dd0196c9fc91c1a33"
}
```
