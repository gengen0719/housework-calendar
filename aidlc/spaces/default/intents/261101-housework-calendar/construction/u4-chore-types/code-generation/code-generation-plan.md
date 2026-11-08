# コード生成の計画 — U4 お手伝いの種類

## Summary

- Builds: 管理者がお手伝いの種類（名前・単価・説明）を登録・変更し、「使わない」「使う」を切り替え、割り当てに使われていない種類を消す流れ。子供は一覧を見るだけ。名前の重なりの防止（「皿洗い（追加分）」の案内）、C7 の窓口（今の単価を含む）、C8 の仮の窓口、画面「お手伝いの種類」。CDK の `ChoreTypes` テーブルと権限、反映後の確かめ、README
- Tests: Gherkin の筋書き 4 つ（約 35 場面。受け入れ条件 AC2.1.1〜AC2.1.7 と、NFR 設計の競合と失敗）と、部品ごとの単体テスト 5〜8 件、CDK の組み立てのテスト。Vitest で行カバレッジ 80% 以上

## 前提

- 設計: `construction/u4-chore-types/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- U1〜U3 のコードに足す。U1〜U3 の動きは変えない。U1〜U3 のテストはすべて通ったままにする
- 新しい依存は足さない
- `.gitignore`、`AGENTS.md` は作り手のファイルで、この計画では変えない
- 新しい秘密の情報はない。パラメータストアのパラメータも GitHub の Variables も足さない

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

## 手順

筋書き（`.feature`）は先に書き、その筋書きが通るまで、その機能の層（データ、リポジトリ、業務の決まり、API、画面）をまとめて作ります（BDD）。

### 土台

- [x] **Step 1: 骨組みと設定の置き場所**（全ストーリーの土台）
  - U4 のテストのフォルダ `packages/shared/test/u4-chore-types/`、`packages/backend/test/u4-chore-types/`、`packages/frontend/test/u4-chore-types/`、`infrastructure/test/u4-chore-types/` を作る
  - `lib/dynamoClient.ts` の `tables` に `choreTypes()`（環境変数 `CHORE_TYPES_TABLE`）を足す
  - テスト用の偽の DynamoDB（`test/u1-skeleton-family/helpers/fakeDynamo.ts`）に `ChoreTypes`（PK `familyId`、SK `sk`）、`begins_with` の Query、続き（LastEvaluatedKey）を返す差し替えを足す（U1〜U3 のテストは通ったまま）
- [x] **Step 2: テストの道具を動かせるようにする**
  - U1〜U3 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（新しい道具は入れない）
  - 最初の空の筋書き 1 つで、`unit-test-instructions.md` の U4 のコマンドが動くことを確かめる

### 機能のまとまり A: 共有パッケージ（C10、入力の確かめ）

- [x] **Step 3: テストを書く**（US2.1）— `packages/shared/test/u4-chore-types/`:
  - `messages.test.ts`: 新しい理由の印（`INVALID_CHORE_TYPE_NAME`、`CHORE_TYPE_NAME_TAKEN`、`INVALID_DESCRIPTION`、`INVALID_REQUEST`、`CHORE_TYPE_STATE_CHANGED`）と文言、`CHORE_TYPE_IN_USE` の文言、重なりの 2 通りの文言、名前の欄の案内（「皿洗い（追加分）」）、U1〜U3 の印が消えていない
  - `choreTypeValidation.test.ts`: 名前（NFC、前後の空白と全角の空白、1〜20 コードポイント、絵文字、制御文字）、単価（0、整数、-1、1.5、`"100"`、空、2^53）、説明（100 コードポイント、改行は許す、ほかの制御文字は断る、空）
- [x] **Step 4: 作る** — `packages/shared/src/`: `reasons.ts`、`messages.ts`、`api-types.ts`（`ChoreType`、`ChoreTypeInput`）、`choreTypeValidation.ts`（`normalizeChoreName`、`validateUnitPrice`、`normalizeDescription`）
- [x] **Step 5: 通す、整える** — Step 3 のテストが通るまで直し、通ったまま整える

### 機能のまとまり B: 一覧と登録（AC2.1.1〜AC2.1.3、BR5.1〜BR5.6、BR5.10〜BR5.12）

- [x] **Step 6: 筋書きを書く** — `packages/backend/test/u4-chore-types/create-chore-type.feature` と `create-chore-type.steps.ts`。場面:
  - 管理者が「皿洗い 100 円」を説明つきで登録すると、一覧に「皿洗い 100 円」が出る（AC2.1.1）
  - 単価に -1、1.5、空、`"100"` を入れると 422 `INVALID_UNIT_PRICE` で、何も登録されない（AC2.1.2）
  - 名前が空・21 文字・改行入り、説明が 101 文字なら 422
  - 同じ名前（「使う」の種類）があると 409 で、「皿洗い（追加分）」を勧める文言の手がかり（`details.conflictActive: true`）が返る
  - 同じ名前の「使わない」の種類があると 409 で、`details.conflictActive: false`（「使う」に戻す案内）
  - 同じ名前で 2 つ同時に登録すると、1 つだけが登録される
  - 子供が登録しようとすると 403 `ADMIN_ONLY` で、何も変わらない（AC2.1.3）
  - 同じ `Idempotency-Key` で 2 回送ると種類は 1 つ。同じ印で本文が違うと 422 `IDEMPOTENCY_KEY_REUSED`
  - 一覧は「使う」を登録した順、そのあとに「使わない」。子供も見られる。メンバーでない人は 403。ほかの家族の種類は出ない
  - 一覧は続きのある読み取りでも全件がそろう
  - ログに種類の名前と説明が出ない
- [x] **Step 7: 作る** — `repositories/choreTypeRepository.ts`（種類と名前の印、一覧の Query と続き、強い整合性の読み取り）、`services/choreTypeService.ts`（`list`、`create`）、`handlers/choreType/list.ts`、`handlers/choreType/create.ts`、`entries/api.ts`（2 つの操作）、`models.ts`（`RequestOperation` に `createChoreType`）、`lib/logger.ts`（`name`・`description` を型と実行時の伏せ字で禁止。U1〜U3 のログに `name` がないことを確かめる）
- [x] **Step 8: 通す、整える** — Step 6 の筋書きと U1〜U3 のテストが通るまで直す。単体テスト（`choreTypeRepository`、登録のトランザクションと取り消しの読み分け、伏せ字と型のテスト。各 5〜8 件）を足す

### 機能のまとまり C: 変更・使わない・使う・消す（AC2.1.4〜AC2.1.7、BR5.7〜BR5.10）

- [x] **Step 9: 筋書きを書く** — `packages/backend/test/u4-chore-types/update-chore-type.feature` と `update-chore-type.steps.ts`。場面:
  - 単価を 100 円から 120 円に変えると、C7 `getCurrentUnitPrice` が 120 を返す（AC2.1.4 の U4 の部分）
  - 名前を変えると、古い名前で別の種類を登録できる。新しい名前がほかの種類と重なると 409
  - 2 つの種類を同時に同じ名前に変えると、1 つだけが変わる
  - 名前を変えない変更の途中で別の要求が名前を変えても、名前を書き戻さない（やり直す）
  - 「使わない」にすると一覧の下に移り、C7 `list` に `active: false` で残る。`getCurrentUnitPrice` は単価を返す。「使う」に戻せる（AC2.1.5 の U4 の部分）
  - PATCH の本文が `"false"`・`0`・なしなら 422 で、何も変わらない
  - 割り当てに使われていない種類を消すと、一覧からなくなり、同じ名前でまた登録できる（AC2.1.7）
  - 仮の C8 を「使われている」に差し替えると、消せずに 409 `CHORE_TYPE_IN_USE` で、種類は「使わない」のまま（AC2.1.6）
  - 消す途中で別の画面が「使う」に戻すと、消さずに 409 `CHORE_TYPE_STATE_CHANGED`
  - もう消えた種類を消すと 404
  - ほかの家族の種類の ID には、本文が正しくても誤っていても 404。形の違う ID も 404
  - 子供が変更・PATCH・消すをしようとすると 403
  - トランザクションが思いがけない Code で断られると 500
- [x] **Step 10: 作る** — `services/choreTypeService.ts`（`update`、`setActive`、`getCurrentUnitPrice`、`delete`）、`services/calendarPort.ts`（C8 `isChoreTypeAssigned` の仮の窓口。差し替えられる形）、`repositories/choreTypeRepository.ts`（改名と消すのトランザクション、条件 `name = :oldName`、`active = false`）、`handlers/choreType/{update,setActive,remove}.ts`、`entries/api.ts`（3 つの操作）
- [x] **Step 11: 通す、整える** — Step 9 の筋書きが通るまで直す。単体テスト（改名・消すのトランザクションと読み分け、`getCurrentUnitPrice`、`calendarPort` の差し替え。各 5〜8 件）を足す

### 機能のまとまり D: 画面（AC2.1.1〜AC2.1.3、AC2.1.6、AC2.1.7、BR5.4、BR5.11、NFR9.4）

- [x] **Step 12: 筋書きを書く** — `packages/frontend/test/u4-chore-types/screens.feature` と `screens.steps.tsx`（LIFF と API は差し替え）。場面:
  - 「家族の設定」から「お手伝いの種類」に進むと一覧が出る。「使わない」は下にまとまり、文字で「使わない」と出る
  - 管理者が「追加」を押すと、名前の欄の下に「1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように分けて登録します」が出る
  - 単価に -1 を入れて保存すると、「単価は 0 円以上の整数で入力してください」と出て、入力した内容が残る（AC2.1.2）
  - 同じ名前で保存すると、相手が「使う」なら「皿洗い（追加分）」を勧める文言、「使わない」なら「使う」に戻す文言が出る
  - 単価を変える画面に「単価を変えると、このあとに付く記録から新しい単価になります」が出る
  - 「使わない」を押すと確かめが出て、押すと下に移る。「使う」で戻る
  - 「消す」を押すと確かめが出て、消えると一覧からなくなる。409 なら「『使わない』にしました」の文言、404 なら「すでに消えています」が出て、一覧が読み直される
  - 子供には「追加」などのボタンが出ない（AC2.1.3）
  - 名前と説明の中のタグは文字として出る。説明の改行がそのまま出る
- [x] **Step 13: 作る** — `packages/frontend/src/`: `pages/ChoreTypesPage.tsx`、`pages/FamilySettingsPage.tsx`（「お手伝いの種類」へ進むボタン）、`App.tsx`（画面の切り替え）、`api/client.ts`（5 つの操作）。MUI のテーマ（U1）と共有の確かめの関数を使う
- [x] **Step 14: 通す、整える** — Step 12 の筋書きと U1〜U3 の画面のテストが通るまで直し、通ったまま整える

### 環境と組み立ての設定

- [x] **Step 15: AWS CDK の構成**（`infrastructure/`）
  - `data-stack.ts`: `ChoreTypes` テーブル（PK `familyId`、SK `sk`、TTL なし、`AWS_MANAGED`、本番 `RETAIN`、`tableName` は指定しない）
  - `app-stack.ts`: `AppStackProps` に `choreTypes`。`api` の環境変数 `CHORE_TYPES_TABLE`。`api` の許可に `ChoreTypes` の GetItem・Query・PutItem・UpdateItem・DeleteItem だけを足す（`ConditionCheckItem`・`Scan` は足さない。`line` には足さない）
  - `app.ts`: Data スタックから `choreTypes` を渡す
  - `infrastructure/test/u4-chore-types/stacks.test.ts`: テーブル、キー、`RETAIN`/`DESTROY`、環境変数、`api` の許可がちょうど 5 つ、`line` に `ChoreTypes` の許可がないこと（10 件ほど）。U1 のテストのテーブル数の期待も直す
- [x] **Step 16: 反映後の確かめ** — `scripts/smoke-check.sh` の U3 の確かめのあとに、`cicd-pipeline.md` の 3d〜3h（セッションなしの GET・POST・PUT・PATCH・DELETE が 401）を足す。先頭コメントを「全 15 件」にし、`3b` の番号の重なりを直す。ワークフローは変えない

### 書類と対応表

- [x] **Step 17: 書類**
  - `README.md`: お手伝いの種類の画面の使い方（1 日に何回もあるお手伝いは「皿洗い（追加分）」のように分けて登録する）、ステージングでの手の確かめの手順、U5 を反映したあとは `ChoreTypes` も U4 のコードも戻さず前に進んで直すこと
  - `docs/contract-changes-u4.md`（U4 で足した契約: C1 の 5 つの操作の本文と応答と `PATCH` の追加、C7 の結果の決まりと `setActive`、C8 の仮の窓口と U5 への引き継ぎ（ConditionCheck、強い整合性の確かめ）、C10 の印と文言。U9 への引き継ぎ: 合計が安全な整数を超えるときの扱い）

## ストーリーとの対応

| 手順 | ストーリー | 受け入れ条件 |
|------|----------|------------|
| Step 1〜2 | 全体 | — |
| Step 3〜5 | US2.1 | AC2.1.2 の文言、AC2.1.6 の文言 |
| Step 6〜8 | US2.1 | AC2.1.1、AC2.1.2、AC2.1.3 |
| Step 9〜11 | US2.1 | AC2.1.4（U4 の部分）、AC2.1.5（U4 の部分）、AC2.1.6、AC2.1.7 |
| Step 12〜14 | US2.1 | AC2.1.1〜AC2.1.3、AC2.1.6、AC2.1.7 |
| Step 15〜16 | US2.1（配備） | NFR1、NFR3、NFR4、NFR6 |
| Step 17 | — | — |
