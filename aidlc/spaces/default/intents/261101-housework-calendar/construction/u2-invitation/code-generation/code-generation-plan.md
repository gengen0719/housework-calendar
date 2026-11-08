# コード生成の計画 — U2 招待

## Summary

- Builds: 管理者が招待用のリンクを作って LINE で送り、子供がそのリンクを開いて確かめてから家族に子供として参加する流れ。「家族の設定」の画面とメンバーの一覧。ログでの印の伏せ方、CDK の Invitations テーブル・`familyId-index`・権限・メトリクスフィルタ、反映後の確かめ
- Tests: Gherkin の筋書き 5 つ（約 35 場面。受け入れ条件 AC1.1.6〜AC1.1.9、AC1.1.13 と、NFR 設計の競合の 7 つ）と、部品ごとの単体テスト 5〜8 件、CDK の組み立てのテスト。Vitest で行カバレッジ 80% 以上

## 前提

- 設計: `construction/u2-invitation/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- U1 のコード（`packages/`、`infrastructure/`、`scripts/`、`.github/workflows/`）に足す。U1 の動き（友だち登録、セッション、家族を作る）は変えない。U1 のテストはすべて通ったままにする
- 新しい依存は足さない（印は Node.js の `crypto`、LINE で送るのは U1 で入れた `@line/liff`）
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
  - U2 のテストのフォルダ `packages/shared/test/u2-invitation/`、`packages/backend/test/u2-invitation/`、`packages/frontend/test/u2-invitation/`、`infrastructure/test/u2-invitation/` を作る
  - `lib/config.ts` の画面用の Lambda の設定に、環境変数 `INVITATIONS_TABLE` を足す（パラメータストアのキーは足さない）
  - ESLint に `no-restricted-properties`（`Math.random` の禁止。NFR4.14）を足す
- [x] **Step 2: テストの道具を動かせるようにする**
  - U1 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（新しい道具は入れない）
  - 最初の空の筋書き 1 つで、`unit-test-instructions.md` の U2 のコマンドが動くことを確かめる

### 機能のまとまり A: 共有パッケージ（C10、契約への追加）

- [x] **Step 3: テストを書く**（US1.1）— `packages/shared/test/u2-invitation/messages.test.ts`: `IDEMPOTENCY_KEY_REUSED` が理由の印にあり文言がある、`INVITATION_NOT_FRIEND_HINT`（「友だち登録したら、もう一度このリンクを開いてください」）、`INVITATION_SHARE_TEXT` に家族の名前・期限・リンクが入る、`ALREADY_IN_FAMILY`・`ALREADY_IN_OTHER_FAMILY`・`INVITATION_INVALID` の文言が要件のとおり、U1 の印が消えていない
- [x] **Step 4: 作る** — `packages/shared/src/`: `reasons.ts`（`IDEMPOTENCY_KEY_REUSED`）、`messages.ts`（上の文言）、`api-types.ts`（`Member`、`InvitationView { url, expiresAt }`、`InvitationPreview { familyName, expiresAt }`）
- [x] **Step 5: 通す、整える** — Step 3 のテストが通るまで直し、通ったまま整える

### 機能のまとまり B: 振り分けとログで印を伏せる（NFR4.26、NFR2.14、NFR5.7）

- [x] **Step 6: 筋書きを書く** — `packages/backend/test/u2-invitation/routing-logs.feature` と `routing-logs.steps.ts`。場面:
  - `/v1/invitations/<印>` への要求は、パスの型 `/v1/invitations/:token` に振り分けられる
  - 要求のログ（`REQUEST_START`、`REQUEST_REJECTED`、`REQUEST_END`）の `path` はパスの型で、印の全体が出ない
  - 型に合わないパス（印を含む）は 404 で、ログの `path` は `unmatched`
  - 処理中に思いがけない失敗が起きても、`REQUEST_ERROR` のログに印の全体が出ない
  - U1 の操作（`POST /v1/sessions`、`GET /v1/me`、`POST /v1/families`）は前と同じに振り分けられる
- [x] **Step 7: 作る** — `packages/backend/src/lib/router.ts`（`:name` のパスの型の照合。完全一致を先に、型を後に）、`entries/api.ts`（順番を「型を決める → `REQUEST_START` → 秘密のヘッダー → 処理」に入れ替え、`rawPath` をログに書かない）、`lib/logger.ts`（`token` という名前の項目を型で受け付けない）
- [x] **Step 8: 通す、整える** — Step 6 の筋書きと U1 のテストがすべて通るまで直す。単体テスト（`router`。5〜8 件）を足す

### 機能のまとまり C: メンバーの一覧（BR3.11、F1）

- [x] **Step 9: 筋書きを書く** — `packages/backend/test/u2-invitation/members.feature` と `members.steps.ts`。場面:
  - 管理者が一覧を開くと、管理者が最初、子供が入った順に並ぶ（同じ時刻は表示名、それも同じなら userId の順）
  - 子供も一覧を開ける
  - 応答には userId・表示名・役割だけがあり、LINE のユーザー ID はない
  - 家族のメンバーでない人は 403 `NOT_FAMILY_MEMBER`
  - 索引にまだ本人が出ていなくても、本人が一覧に入る（結果整合への備え）
  - `familyJoinedAt` がない管理者（U2 より前に家族を作った人）も、管理者として最初に並ぶ
- [x] **Step 10: 作る** — `repositories/userRepository.ts`（`familyId-index` の Query、`familyJoinedAt`）、`services/familyMemberService.ts`（`listMembers(ctx)`）、`handlers/family/listMembers.ts`（`GET /v1/family/members`）。U1 の `createFamily` で `familyJoinedAt` を入れる
- [x] **Step 11: 通す、整える** — Step 9 の筋書きが通るまで直す。単体テスト（`listMembers` の並び順。5〜8 件）を足す

### 機能のまとまり D: 招待用のリンクを作る・見る（AC1.1.6、AC1.1.13、BR3.1〜BR3.5、BR3.12、F2、F4）

- [x] **Step 12: 筋書きを書く** — `packages/backend/test/u2-invitation/create-invitation.feature` と `create-invitation.steps.ts`。場面:
  - 管理者が招待を作ると、22 文字の印を含むリンクと、24 時間後の期限が返る（AC1.1.6、BR3.2）
  - 管理者がいまの招待を見ると、同じリンクと期限が返る。招待がなければ `null`（BR3.12）
  - 作り直すと、前の招待は使えなくなり、いまの招待は新しいものになる（BR3.4）
  - 子供が作ろうとすると 403 `ADMIN_ONLY` で、招待はできない。いまの招待を見ようとしても 403（AC1.1.13）
  - 同じ `Idempotency-Key` で 2 回送ると、招待は 1 つで、同じリンクが返る（BR3.5）
  - 2 つの端末から同時に作り直すと、使える招待は 1 つだけになる（NFR2.10）
  - 前の招待が TTL で消えたあとでも、作り直せる（NFR 設計のレビュー R-02）
  - 招待を作ったログ（`INVITATION_CREATED`）に、印の先頭 4 文字だけが出る（NFR2.9、NFR5.7）
- [x] **Step 13: 作る** — `services/invitationTokenService.ts`（`crypto.randomBytes(16).toString('base64url')`、形の確かめ）、`repositories/invitationRepository.ts`（`Invitations`）、`repositories/familyRepository.ts`（`currentInvitationToken`、`currentInvitationId`、作り直しのトランザクションの組み立て）、`repositories/requestRecordRepository.ts`（`operation`、`target` を持つ。U1 の `createFamily` は `operation: createFamily`）、`services/familyMemberService.ts`（`createInvitation(ctx)`、`getCurrentInvitation(ctx)`。取り消しの理由の読み分けと 1 回のやり直し）、`handlers/invitation/create.ts`、`handlers/invitation/getCurrent.ts`
- [x] **Step 14: 通す、整える** — Step 12 の筋書きが通るまで直す。単体テスト（`invitationTokenService`、`invitationRepository`、作り直しのトランザクションの組み立て。各 5〜8 件）を足す

### 機能のまとまり E: 招待を開く・参加する（AC1.1.7〜AC1.1.9、BR3.6〜BR3.8、F5、F6）

- [x] **Step 15: 筋書きを書く** — `packages/backend/test/u2-invitation/accept-invitation.feature` と `accept-invitation.steps.ts`。場面:
  - 家族に入っていない友だちが招待を開くと、家族の名前と期限が返る（BR3.9）
  - 「参加する」を送ると、その家族の子供になり、`GET /v1/me` で役割が子供になる（AC1.1.7、BR3.8）
  - 同じリンクで子供 3 人が参加できる（BR3.3）
  - ほかの家族に入っている人は、開くときも参加するときも 409 `ALREADY_IN_OTHER_FAMILY` で、家族と役割は変わらない（AC1.1.8）
  - 同じ家族の人（管理者を含む）が開くと 409 `ALREADY_IN_FAMILY` で、役割は変わらない（BR3.7）
  - ない印・作り直された印・期限が過ぎた印・期限ちょうどの印・形の違う印は、どれも同じ 409 `INVITATION_INVALID`（AC1.1.9、BR3.6）
  - 招待を開いたあと、管理者が作り直してから「参加する」を送ると、参加できない（NFR2.11）
  - 招待を開いたあと、期限が過ぎてから「参加する」を送ると、参加できない
  - 2 つの招待で同時に参加しようとすると、1 つの家族にだけ入る
  - 参加したあと同じ `Idempotency-Key` で送り直すと、前と同じ 200 が返る。同じ印で別の招待に参加しようとすると 422 `IDEMPOTENCY_KEY_REUSED`（BR3.5）
  - 本文に別の家族の ID を入れても、招待の家族に入る（NFR4.20）
  - ブロック中の人は 403 `NOT_FRIEND`
  - 断ったログ（`INVITATION_REJECTED`）と参加のログ（`INVITATION_ACCEPTED`）に、印の全体が出ない
- [x] **Step 16: 作る** — `services/familyMemberService.ts`（`resolveUsableInvitation`、`previewInvitation(userId, token)`、`acceptInvitation(userId, token)`。参加のトランザクションと取り消しの理由の読み分け）、`repositories/userRepository.ts`（参加の Update の組み立て）、`handlers/invitation/preview.ts`、`handlers/invitation/accept.ts`
- [x] **Step 17: 通す、整える** — Step 15 の筋書きが通るまで直す。単体テスト（`resolveUsableInvitation`、参加のトランザクションの組み立て、取り消しの理由の読み分け。各 5〜8 件）を足す

### 機能のまとまり F: 画面（AC1.1.6〜AC1.1.9、AC1.1.13、BR3.9〜BR3.12、NFR9.2）

- [x] **Step 18: 筋書きを書く** — `packages/frontend/test/u2-invitation/screens.feature` と `screens.steps.tsx`（LIFF と API は差し替えて動かす）。場面:
  - カレンダーの枠の画面から「家族の設定」に進むと、メンバーの一覧が「管理者」「子供」の文字つきで出る
  - 管理者には、招待がなければ「招待用のリンクを作る」、あればリンク・「（日時）まで使えます」（日本時間）・「LINE で送る」・「リンクをコピー」・「招待用のリンクを作り直す」が出る
  - 作り直すときは「前のリンクは使えなくなります。作り直しますか？」と確かめる
  - 「LINE で送る」は shareTargetPicker が使えるならそれを、使えないならシェアの URL を開く
  - 子供には招待のボタンが出ない（AC1.1.13）
  - 招待のリンクを開くと「（家族の名前）に参加しますか？」と「参加する」が出て、押すとカレンダーの枠に進む。開いただけでは参加しない
  - 印を読んだあと、URL から印が消えている（`history.replaceState`）
  - 友だちでない人がリンクを開くと、友だち登録の案内と「友だち登録したら、もう一度このリンクを開いてください」が出る
  - 使えない招待、別の家族の人、同じ家族の人には、それぞれの文言が出る（同じ家族の人には「カレンダーへ」も出る）
  - 通信に失敗したら「表示できませんでした。もう一度お試しください」と、もう一度のボタン（同じ `Idempotency-Key` で送り直す）が出る
- [x] **Step 19: 作る** — `packages/frontend/src/`: `pages/FamilySettingsPage.tsx`、`pages/InvitationPage.tsx`、`pages/RegisterPage.tsx`（招待の印があるときの一言）、`pages/CalendarFramePage.tsx`（「家族の設定」へ進むボタン）、`App.tsx`（招待の印があるときの最初の画面の決め方）、`invitation/readInvitationParam.ts`、`liff/share.ts`、`api/client.ts`（U2 の 5 つの操作）。MUI のテーマ（U1）を使う
- [x] **Step 20: 通す、整える** — Step 18 の筋書きと U1 の画面のテストが通るまで直し、通ったまま整える

### 環境と組み立ての設定

- [x] **Step 21: AWS CDK の構成**（`infrastructure/`）
  - `data-stack.ts`: `Invitations` テーブル（PK `token`、TTL `ttl`、`AWS_MANAGED`、本番は `RETAIN`、`tableName` は指定しない）、`Users` の GSI `familyId-index`（射影 `INCLUDE`: `displayName`、`role`、`familyJoinedAt`）
  - `app-stack.ts`: `AppStackProps` に `invitations` を足し、`api` の環境変数 `INVITATIONS_TABLE`。`api` のロールに `infrastructure-specification.md` の表の許可を足す（`line` には足さない）。`createFunction` がロググループも返すようにし、`api` のロググループにメトリクスフィルタ `InvitationInvalidCount`（`defaultValue` 0）を付ける
  - `app.ts`: Data スタックから `invitations` を渡す
  - `infrastructure/test/u2-invitation/stacks.test.ts`: テーブル・GSI・TTL・`RETAIN`・`api` の許可・`line` に `Invitations` の許可がないこと・メトリクスフィルタ（10 件ほど）
- [x] **Step 22: 反映後の確かめ** — `scripts/smoke-check.sh` に、セッションなしで U2 の 5 つの操作が 401 になる確かめを足す（`cicd-pipeline.md`）。ワークフローは変えない

### 書類と対応表

- [x] **Step 23: 書類**
  - `README.md`: shareTargetPicker を環境ごとの LIFF アプリで有効にする手順、`InvitationInvalidCount` を週に 1 回見る手順、濫用されたときに `aws lambda put-function-concurrency` で画面用の Lambda を止める手順と戻し方、ログインしての確かめの手順（招待を作る → 別の LINE アカウントで開く → 参加する → メンバーの一覧に出る）
  - `docs/contract-changes-u2.md`（U2 で足した契約: C1 の 5 つの操作の本文と応答、C6 の新しい窓口と結果、C10 の印と文言。`contract-summary.md` への反映を待つ一覧）

## ストーリーとの対応

| 手順 | ストーリー | 受け入れ条件 |
|------|----------|------------|
| Step 1〜2 | 全体 | — |
| Step 3〜5 | US1.1 | AC1.1.7〜AC1.1.9 の文言 |
| Step 6〜8 | US1.1 | （NFR4.26、NFR2.14） |
| Step 9〜11 | US1.1 | AC1.1.7（参加した子供が一覧に出る） |
| Step 12〜14 | US1.1 | AC1.1.6、AC1.1.13 |
| Step 15〜17 | US1.1 | AC1.1.7、AC1.1.8、AC1.1.9 |
| Step 18〜20 | US1.1 | AC1.1.6〜AC1.1.9、AC1.1.13 |
| Step 21〜22 | US1.1（配備） | NFR1、NFR2、NFR3、NFR6、NFR10 |
| Step 23 | — | — |
