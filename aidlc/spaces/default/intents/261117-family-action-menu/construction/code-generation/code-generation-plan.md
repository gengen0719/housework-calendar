# 実装計画

## Summary

- Builds: 家族名右端の3点メニューに設定と入力済み割り当て変更をまとめる。
- Touches: CalendarPage.tsx とフロントエンドの新規メニューテスト、U2/U3/U4/U5の既存テスト。
- Tests: 6要件を確認する約10件の操作テストと既存シナリオ。

## Steps

- [x] Step 1: 既存Vitest設定と全体テストの基準値を確認する。設定変更は不要。関連テストの実行準備を確認する（NFR2）。
- [x] Step 2: test/family-action-menu/CalendarPage.test.tsx にGiven/When/Thenの実行可能シナリオを先に書く。開閉、設定、割り当て変更、未入力、権限、キーボードを検証する（FR1–FR4、NFR1–NFR2）。
- [x] Step 3: CalendarPage.tsx で既存MUIのIconButton/Menu/MenuItemを使い、家族名の右に3点ボタンを置く。既存callback/stateと編集条件を再利用し、未入力ボタンを維持する。長い家族名は折り返す（FR1–FR4、NFR1）。
- [x] Step 4: U2/U3/U4のscreens.steps.tsx、U5のcalendar.steps.tsx/assignment.steps.tsxをメニュー操作に更新し、関連テストを成功させる。不要な整理はしない（FR2–FR4、NFR2）。
- [x] Step 5: 全体テスト・80%行カバレッジ、lint、型検査、フロントエンドビルドを確認し、code-summary.mdとtraceability.jsonに結果を記録する（NFR2）。

## Impact and Diff Preview

CalendarPageの家族名と独立設定ボタンを横並び見出し＋メニューに置換する。入力済み割り当て変更だけをメニューへ移し、未入力の入力ボタンを残す。API・データ・新規依存は変更しない。影響は画面と操作シナリオに限る。

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
