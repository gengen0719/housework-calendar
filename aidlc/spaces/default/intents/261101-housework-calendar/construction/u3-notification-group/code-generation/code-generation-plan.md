# コード生成の計画 — U3 お知らせ先

## Summary

- Builds: 公式アカウントがグループに参加したときのボタンつきの案内、管理者がボタンか「登録」でグループをお知らせ先にする流れ（置き換え、子供や家族以外の人を断る、1 グループ 1 家族）、公式アカウントが外されたときの解除、グループの操作の入口（U8 が使う）、画面のお知らせ先の表示。CDK の `NotificationGroups` テーブルと権限、反映後の確かめ、README
- Tests: Gherkin の筋書き 5 つ（約 35 場面。受け入れ条件 AC1.2.1〜AC1.2.5 と、NFR 設計の競合と失敗）と、部品ごとの単体テスト 5〜8 件、CDK の組み立てのテスト。Vitest で行カバレッジ 80% 以上

## 前提

- 設計: `construction/u3-notification-group/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- U1・U2 のコードに足す。U1・U2 の動きは変えない（振り分け表の形を変えるときも、follow・unfollow の動きはそのまま）。U1・U2 のテストはすべて通ったままにする
- 新しい依存は足さない（LINE の API は U1 の `lineApiService` の `fetch`）
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

筋書き（`.feature`）は先に書き、その筋書きが通るまで、その機能の層（データ、リポジトリ、業務の決まり、LINE の受け口と API、画面）をまとめて作ります（BDD）。

### 土台

- [x] **Step 1: 骨組みと設定の置き場所**（全ストーリーの土台）
  - U3 のテストのフォルダ `packages/shared/test/u3-notification-group/`、`packages/backend/test/u3-notification-group/`、`packages/frontend/test/u3-notification-group/`、`infrastructure/test/u3-notification-group/` を作る
  - `lib/dynamoClient.ts` の `tables` に `notificationGroups()`（環境変数 `NOTIFICATION_GROUPS_TABLE`）を足す。`line` の Lambda が `FAMILIES_TABLE` を読めることを確かめる
  - テスト用の偽の DynamoDB（`test/u1-skeleton-family/helpers/fakeDynamo.ts`）に `NotificationGroups`、Delete、条件の `OR` を足す（U1・U2 のテストは通ったまま）
- [x] **Step 2: テストの道具を動かせるようにする**
  - U1・U2 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（新しい道具は入れない）
  - 最初の空の筋書き 1 つで、`unit-test-instructions.md` の U3 のコマンドが動くことを確かめる

### 機能のまとまり A: 共有パッケージ（C10、契約への追加）

- [x] **Step 3: テストを書く**（US1.2）— `packages/shared/test/u3-notification-group/messages.test.ts`: `GROUP_USED_BY_OTHER_FAMILY` が理由の印にあり文言がある、`NOTIFICATION_GROUP_ADMIN_ONLY`（「お知らせ先を登録できるのは管理者だけです」）、`GROUP_NOT_REGISTERED`（「このグループは家族のお知らせ先として登録されていません」）、`NOTIFICATION_GROUP_NOT_REGISTERED`（「お知らせ先のグループが登録されていません」）、`NOTIFICATION_GROUP_REGISTERED` に家族の名前が入る、`GROUP_JOIN_GUIDE`・`GROUP_REGISTER_BUTTON`・`NOTIFICATION_GROUP_HOWTO`・`GROUP_REGISTER_IN_GROUP_ONLY` がある、U1・U2 の印が消えていない
- [x] **Step 4: 作る** — `packages/shared/src/`: `reasons.ts`、`messages.ts`、`api-types.ts`（`NotificationGroupView { groupName: string | null, registeredAt: string }`）
- [x] **Step 5: 通す、整える** — Step 3 のテストが通るまで直し、通ったまま整える

### 機能のまとまり B: LINE のイベントの振り分けと打ち切り（NFR4.27、NFR4.28、NFR3.4）

- [x] **Step 6: 筋書きを書く** — `packages/backend/test/u3-notification-group/line-routing.feature` と `line-routing.steps.ts`。場面:
  - グループでのただの会話は、二度処理しない記録も書かず、返事もしない（`LINE_EVENT_IGNORED`）
  - 「登録」と送ると登録の操作として扱われる。「登録して」「とうろく」は扱わない
  - 知らない postback の data、300 文字を超える data は何もしない
  - 5000 文字を超える文字が届いても、本文全体は 400 にならず、そのイベントだけ何もしない
  - 署名のない join・leave・postback は 401 で処理されない
  - follow・unfollow は U1 と同じに動く
- [x] **Step 7: 作る** — `handlers/line/types.ts`（`source.groupId`、`source.roomId`、`message`、`postback`、`timestamp` を任意の項目に）、`handlers/line/groupCommand.ts`（`parseGroupCommand`、1 対 1 の「登録」の判定）、`entries/line.ts`（振り分け表を `{ accepts, handle }` にし、`accepts` が false なら二度処理しない記録の前に終える）
- [x] **Step 8: 通す、整える** — Step 6 の筋書きと U1・U2 のテストがすべて通るまで直す。単体テスト（`parseGroupCommand`。5〜8 件）を足す

### 機能のまとまり C: 参加の案内と登録（AC1.2.1〜AC1.2.3、BR4.1〜BR4.8、BR4.13）

- [x] **Step 9: 筋書きを書く** — `packages/backend/test/u3-notification-group/register-group.feature` と `register-group.steps.ts`。場面:
  - 公式アカウントがグループに参加すると、案内と「このグループをお知らせ先にする」ボタンが reply で届く。room では何も届かない（BR4.1）
  - 管理者がボタンを押すと、そのグループがお知らせ先になり、「このグループを（家族の名前）のお知らせ先にしました。…」が届く（AC1.2.1、BR4.7）
  - 管理者が「登録」と送っても登録できる
  - すでにお知らせ先がある家族の管理者が別のグループで登録すると、新しいグループに置き換わり、前のグループには何も送られない（AC1.2.2）
  - 同じグループで登録し直しても、同じ返事で、記録は 1 つ
  - 子供が登録しようとすると、登録されず「お知らせ先を登録できるのは管理者だけです」（AC1.2.3）
  - 家族に入っていない人・記録がない人・ブロック中の管理者・source.userId がないイベントも同じ文言で断られる（BR4.4）
  - 別の家族のお知らせ先になっているグループは、「このグループはほかの家族のお知らせ先になっています」で断られ、元の家族のお知らせ先は変わらない（BR4.5）
  - 1 対 1 のトークで「登録」と送ると、「お知らせ先の登録は、家族のグループ LINE の中で行ってください」（BR4.13）
  - グループの名前を受け取れなくても（2 秒の時間切れ・LINE の失敗）登録でき、名前は空（BR4.8）
  - 2 つの家族の管理者が同じグループで同時に登録すると、先の 1 つだけが登録される
  - 同じ家族の管理者が 2 つのグループで同時に登録すると、家族のお知らせ先は 1 つだけで、どの家族のものでもない記録は残らない
  - 前の版に戻したあとのように、家族のお知らせ先の記録がテーブルにないときも、登録し直せる
  - reply が失敗しても登録は残る
  - ログにグループの名前・会話の本文・表示名が出ない
- [x] **Step 10: 作る** — `repositories/notificationGroupRepository.ts`（新規）、`repositories/familyRepository.ts`（登録し直しのトランザクションの組み立てと `CancellationReasons` の読み分け。U2 と同じく競合だけ 1 回やり直し、ほかの Code は投げ直し）、`services/lineApiService.ts`（`callLine` に `timeoutMs` 引数、`getGroupSummary`、ボタンつきの reply）、`services/familyMemberService.ts`（`registerNotificationGroup`）、`services/groupCommandGate.ts`（登録の操作の確かめ）、`handlers/line/{joinHandler,messageHandler,postbackHandler}.ts`、`lib/logger.ts`（`groupName`、`text`、`displayName` を型と実行時の伏せ字で禁止）
- [x] **Step 11: 通す、整える** — Step 9 の筋書きが通るまで直す。単体テスト（`notificationGroupRepository`、登録し直しのトランザクションの組み立てと読み分け、`getGroupSummary` の時間切れ、`groupCommandGate` の登録の確かめ。各 5〜8 件）を足す

### 機能のまとまり D: 解除と、登録されていないグループの操作（AC1.2.5、BR4.9、BR4.10）

- [x] **Step 12: 筋書きを書く** — `packages/backend/test/u3-notification-group/unregister-and-gate.feature` と `unregister-and-gate.steps.ts`。場面:
  - お知らせ先のグループから公式アカウントが外されると、お知らせ先がなくなり、返事はない（BR4.9）
  - お知らせ先でないグループから外されても、何も変わらない
  - 登録し直しのあとに古い leave（登録より前の時刻）が届いても、新しいお知らせ先は消えない
  - 解除のトランザクションが思いがけない Code で断られると 500
  - 登録されていないグループで、テスト用のグループの操作を送ると、「このグループは家族のお知らせ先として登録されていません」と返り、操作は呼ばれない（AC1.2.5）
  - 登録済みのグループでも、別の家族の人・家族に入っていない人・ブロック中の人のテスト用の操作は「このアプリは家族のメンバーだけが使えます」で、家族の情報は返らない（BR4.10）
  - そのグループの家族のメンバーなら、テスト用の操作が ctx（グループの家族、利用者、役割）で呼ばれる
- [x] **Step 13: 作る** — `handlers/line/leaveHandler.ts`、`services/familyMemberService.ts`（`unregisterNotificationGroupByGroup`、`findFamilyByGroup`、`getNotificationGroup`）、`repositories/familyRepository.ts`（解除のトランザクション）、`services/groupCommandGate.ts`（登録以外の操作の確かめ。U8 が操作を差し込む形）
- [x] **Step 14: 通す、整える** — Step 12 の筋書きが通るまで直す。単体テスト（解除のトランザクションの組み立て、古い leave の判定、`groupCommandGate` の家族の確かめ。各 5〜8 件）を足す

### 機能のまとまり E: 画面（AC1.2.4、BR4.11、BR4.12、NFR9.3）

- [x] **Step 15: 筋書きを書く** — 裏側は `packages/backend/test/u3-notification-group/notification-group-api.feature`、画面は `packages/frontend/test/u3-notification-group/screens.feature`（LIFF と API は差し替え）。場面:
  - `GET /v1/family/notification-group` は、お知らせ先があればグループの名前と登録した時刻を返し、グループ ID は返さない。なければ `null`。メンバーでない人は 403
  - 管理者がカレンダーの枠の画面を開くと、お知らせ先がないとき「お知らせ先のグループが登録されていません」と手順が出る。あれば出ない
  - 子供の画面には、お知らせ先がなくても表示が出ない（API も呼ばない）
  - 家族の設定の画面に「お知らせ先: （グループの名前）」が出る。名前が空なら「お知らせ先: 登録済み」、なければ「お知らせ先: 登録されていません」
  - グループの名前の中のタグは文字として出る
- [x] **Step 16: 作る** — 裏側: `handlers/family/getNotificationGroup.ts`、`services/familyMemberService.ts`（`getNotificationGroupView`）、`entries/api.ts`（振り分け）。画面: `api/client.ts`、`pages/CalendarFramePage.tsx`、`pages/FamilySettingsPage.tsx`（U1 の MUI のテーマ）
- [x] **Step 17: 通す、整える** — Step 15 の筋書きと U1・U2 の画面のテストが通るまで直し、通ったまま整える

### 環境と組み立ての設定

- [x] **Step 18: AWS CDK の構成**（`infrastructure/`）
  - `data-stack.ts`: `NotificationGroups` テーブル（PK `groupId`、TTL なし、`AWS_MANAGED`、本番 `RETAIN`、`tableName` は指定しない）
  - `app-stack.ts`: `AppStackProps` に `notificationGroups`。`line` と `api` の環境変数 `NOTIFICATION_GROUPS_TABLE`、`line` に `FAMILIES_TABLE`。`infrastructure-specification.md` の表の許可だけを足す（`ConditionCheckItem` は足さない）
  - `app.ts`: Data スタックから `notificationGroups` を渡す
  - `infrastructure/test/u3-notification-group/stacks.test.ts`: テーブル、`RETAIN`/`DESTROY`、環境変数、`line` と `api` の許可が表のとおりで、それ以外がないこと（10 件ほど）
- [x] **Step 19: 反映後の確かめ** — `scripts/smoke-check.sh` の U2 の確かめ（3b）のあとに、セッションなしで `GET /v1/family/notification-group` が 401 になる確かめを足し、先頭コメントの数を直す。ワークフローは変えない

### 書類と対応表

- [x] **Step 20: 書類**
  - `README.md`: 公式アカウントがグループに参加できるようにする設定（LINE Official Account Manager、環境ごと）、お知らせ先の登録の手順、困ったとき（案内が届かない、管理者がブロック中、別の家族が先に登録した）、ステージングでの手の確かめの手順、テーブルまで戻すときは 2 回に分けること（U2 の `Invitations` も同じ）
  - `docs/contract-changes-u3.md`（U3 で足した契約: C1 の `GET /v1/family/notification-group`、C3 の join・leave・postback・message の扱い、C4 のグループの概要、C6 の窓口の追加と `registerNotificationGroup` の形の変更、C10 の印と文言。要件への反映を待つもの: FR1.5 に「公式アカウントが外されたら登録を外す」）

## ストーリーとの対応

| 手順 | ストーリー | 受け入れ条件 |
|------|----------|------------|
| Step 1〜2 | 全体 | — |
| Step 3〜5 | US1.2 | AC1.2.3〜AC1.2.5 の文言 |
| Step 6〜8 | US1.2 | （NFR4.27、NFR4.28、NFR3.4） |
| Step 9〜11 | US1.2 | AC1.2.1、AC1.2.2、AC1.2.3 |
| Step 12〜14 | US1.2 | AC1.2.5 |
| Step 15〜17 | US1.2 | AC1.2.4 |
| Step 18〜19 | US1.2（配備） | NFR1、NFR6、NFR10 |
| Step 20 | — | — |
