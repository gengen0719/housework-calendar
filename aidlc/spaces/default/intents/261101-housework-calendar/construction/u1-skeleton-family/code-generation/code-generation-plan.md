# コード生成の計画 — U1 最初の形と家族を作る

## Summary

- Builds: walking skeleton（友だち登録と返事、LINE ログインで画面を開く、家族を作る、認証と家族の範囲の確かめ）と、AWS CDK・GitHub Actions の土台
- Touches: `package.json`、`packages/shared/`、`packages/backend/`、`packages/frontend/`、`infrastructure/`、`.github/workflows/`、`README.md`、`.gitignore`（足すだけ）
- Tests: Gherkin の筋書き 4 つ（約 30 場面）と、部品ごとの単体テスト 5〜8 件、CDK の組み立てのテスト。Vitest で行カバレッジ 80% 以上

## 前提

- 設計: `construction/u1-skeleton-family/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- 契約: `inception/contract-design/contract-summary.md`（C1、C2、C3、C4、C6、C10）と、機能設計の「契約への追加」
- 作るのは U1 が受け持つ AC1.1.1〜AC1.1.5、AC1.1.10〜AC1.1.12 の仕組み。招待（AC1.1.6〜AC1.1.9、AC1.1.13）は U2
- インフラの設計のレビューで残った指摘を、この計画で直す: Lambda のロールに CloudFront の秘密のヘッダーの値（`/housework-calendar/<env>/cloudfront/*`）の読み取りを足す。本番の環境 `production` の反映できるブランチを `main` に限る。関数 URL を公開で呼べる許可（認証 `NONE` の呼び出し許可）を CDK で付ける
- `.gitignore` は作り手のファイル。この計画では、`node_modules/`、`dist/`、`cdk.out/`、`coverage/` などの行を足すだけで、今ある行は変えない

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

- [ ] **Step 1: リポジトリの骨組み**（全ストーリーの土台）
  - ルートの `package.json`（npm workspaces: `packages/shared`、`packages/backend`、`packages/frontend`、`infrastructure`）と `package-lock.json`。依存の版はすべて固定する（`^` を使わない）
  - `tsconfig.base.json`（strict）、各パッケージの `tsconfig.json`
  - Prettier と ESLint の設定（TypeScript、React、`react/no-danger` を error。NFR4.12）
  - `.gitignore` に `node_modules/`、`dist/`、`cdk.out/`、`coverage/`、`.env*` を足す（今ある行は変えない）
  - Node.js の版を `.nvmrc`（22）に書く
- [ ] **Step 2: テストの道具を動かせるようにする**
  - Vitest、`@amiceli/vitest-cucumber`（Gherkin を Vitest で動かす）、`@vitest/coverage-v8`、`aws-sdk-client-mock`、`@testing-library/react`、`jsdom` を入れる
  - ルートの `vitest.config.ts`（ワークスペースのプロジェクト: backend と shared は node、frontend は jsdom、infrastructure は node）。カバレッジは v8、行 80% を下限（`thresholds.lines: 80`。下げない）
  - U1 のテストは、すべて `u1-skeleton-family` という名前のフォルダに置く（`unit-test-instructions.md` の範囲を絞ったコマンドで動かすため）
  - 最初の空の筋書きで、`unit-test-instructions.md` のコマンドが動くことを確かめる

### 機能のまとまり A: 共有パッケージ（C10、作業単位の分割の Q9）

- [ ] **Step 3: 筋書きとテストを書く**（US1.1）— `packages/shared/test/u1-skeleton-family/messages.test.ts`: すべての理由の印に文言がある、要件のとおりの文言（「すでに家族に入っています」など）、`NOT_FRIEND`・`INVALID_FAMILY_NAME`・`IDEMPOTENCY_KEY_REQUIRED` がある
- [ ] **Step 4: 作る** — `packages/shared/src/`: `reasons.ts`（理由の印。C10 と機能設計の追加）、`messages.ts`（文言の一覧）、`result.ts`（`Result<T, Reason>`）、`api-types.ts`（C1・C2 の要求と結果の型: `Me`、`CreateFamilyRequest` など）
- [ ] **Step 5: 通す、整える** — Step 3 のテストが通るまで直し、通ったまま整える

### 機能のまとまり B: 友だち登録とブロック（AC1.1.1、AC1.1.2、F1、F2）

- [ ] **Step 6: 筋書きを書く** — `packages/backend/test/u1-skeleton-family/follow.feature` と、その手順の実装（ステップ定義）`follow.steps.ts`。場面:
  - 初めて友だち登録すると、利用者が記録され、あいさつ・アプリを開くボタン・説明の返事が届く（BR1.1、BR1.2）
  - ブロックして登録し直しても、記録は 1 人のまま、表示名は最初のまま、家族と役割も同じ（BR1.1、BR1.3、BR1.4）
  - ブロックすると「ブロック中」になり、返事はしない（BR1.3）
  - 署名が合わないと 401 で、何も記録しない（BR2.6。Base64 で届いた本文でも正しく確かめる）
  - CloudFront の秘密のヘッダーがないと 403（NFR4.13）
  - 同じイベント ID が 2 回届いても 1 回だけ処理する。「処理中」のまま 2 分を過ぎたものは処理し直す（BR2.7）
  - 処理中に思いがけない失敗が起きると、「処理中」の記録を消して 500 を返す（NFR4.8）
- [ ] **Step 7: 作る** — `packages/backend/src/`:
  - `lib/config.ts`（パラメータストアから起動のときに 1 回だけ読む）、`lib/dynamoClient.ts`（グローバルで 1 つ）、`lib/logger.ts`（JSON の 1 行ログ、秘密の情報を入れない）
  - `middleware/verifyOriginHeader.ts`、`middleware/verifyLineSignature.ts`（本文のバイト列で HMAC-SHA256、`timingSafeEqual`）
  - `repositories/userRepository.ts`（`Users`、GSI `lineUserId-index`）、`repositories/lineEventRepository.ts`（条件付きの書き込みで処理中・処理済み）
  - `services/lineApiService.ts`（プロフィールの取得、返事。時間切れ 5 秒）、`services/familyMemberService.ts`（`registerUser`、`markBlocked`、`findUserByLineId`、`getUserStatus`）
  - `handlers/line/followHandler.ts`、`handlers/line/unfollowHandler.ts`、`entries/line.ts`（Lambda の入口。思いがけない失敗は 500）
- [ ] **Step 8: 通す、整える** — Step 6 の筋書きがすべて通るまで直し、通ったまま整える。部品ごとの単体テスト（`userRepository`、`lineEventRepository`、`verifyLineSignature`、`familyMemberService`。各 5〜8 件）を同じフォルダに足す

### 機能のまとまり C: セッションと最初の画面の情報（AC1.1.3、AC1.1.10、AC1.1.11、AC1.1.12、F3、F4、F7）

- [ ] **Step 9: 筋書きを書く** — `packages/backend/test/u1-skeleton-family/session.feature` と `session.steps.ts`。場面:
  - 正しい ID トークンでセッションが出る（LINE の verify を呼ぶ。BR2.1）。期限は 1 時間（NFR4.2）
  - 偽の・別のチャネルの・期限切れの ID トークンは 401（BR2.1）
  - 記録がない人は LINE に友だちか問い合わせ、友だちなら記録してセッションを出す。友だちでなければ 403 `NOT_FRIEND`（BR1.5、BR1.11）
  - ブロック中の人も同じ（BR1.11）
  - LINE に問い合わせられないときは 503 `SERVICE_TEMPORARILY_UNAVAILABLE`（NFR2.4）
  - `GET /v1/me`: セッションなし・期限切れ・`alg` を変えたトークンは 401（BR2.2、NFR4.2）。家族に入っていない友だちは `family: null`、入っている人は家族と役割（BR1.6、BR1.10）。セッションのあとでブロックした人は 403 `NOT_FRIEND`
  - 家族のデータを求めたのにメンバーでなければ 403 `NOT_FAMILY_MEMBER`、管理者の操作を子供が行うと 403 `ADMIN_ONLY`、ほかの家族の ID の指定は 404（BR2.3〜BR2.5。仕組みのテスト）
- [ ] **Step 10: 作る** — `services/tokenService.ts`（HS256 の JWT、`alg` 決め打ち）、`middleware/requireAuth.ts`、`middleware/requireMembership.ts`（`ctx` を作る）、`middleware/requireAdmin.ts`、`middleware/requireSameFamily.ts`（ID の家族を確かめる仕組み。BR2.5）、`handlers/session/createSession.ts`、`handlers/family/getMe.ts`、`entries/api.ts`（`/v1/...` の振り分け、入力の確かめは Zod、共通のエラーの形）
- [ ] **Step 11: 通す、整える** — Step 9 の筋書きが通るまで直し、通ったまま整える。単体テスト（`tokenService`、`requireAuth`、`requireMembership`、`requireAdmin`、`requireSameFamily`）を足す

### 機能のまとまり D: 家族を作る（AC1.1.4、AC1.1.5、F5）

- [ ] **Step 12: 筋書きを書く** — `packages/backend/test/u1-skeleton-family/create-family.feature` と `create-family.steps.ts`。場面:
  - 名前を入れて作ると、家族ができ、作った人が管理者になる（BR1.7）
  - すでに家族に入っている人は 409 `ALREADY_IN_FAMILY`（BR1.8）
  - 名前が空・空白だけ・21 文字は 422 `INVALID_FAMILY_NAME`（BR1.9）
  - 同じ `Idempotency-Key` で送り直すと、前と同じ 201 と家族が返り、家族は 1 つのまま（BR2.8）
  - `Idempotency-Key` がない・UUID でないと 400（NFR4.10）
  - 家族の作成と利用者の更新の途中で失敗すると、どちらも残らない（NFR2.3）
- [ ] **Step 13: 作る** — `repositories/familyRepository.ts`（`TransactWriteItems` で家族と利用者をまとめて書く）、`repositories/requestRecordRepository.ts`（TTL 24 時間）、`familyMemberService.createFamily(userId, name)`、`handlers/family/createFamily.ts`
- [ ] **Step 14: 通す、整える** — Step 12 の筋書きが通るまで直し、通ったまま整える。単体テスト（`familyRepository`、`requestRecordRepository`）を足す

### 機能のまとまり E: 画面（AC1.1.3、AC1.1.4、AC1.1.5、AC1.1.10、AC1.1.11、NFR9）

- [ ] **Step 15: 筋書きを書く** — `packages/frontend/test/u1-skeleton-family/screens.feature` と `screens.steps.tsx`（LIFF と API は差し替えて動かす）。場面:
  - 友だちでない（`NOT_FRIEND`）と、友だち登録の案内だけが出る（BR1.5）
  - 家族に入っていないと「家族を作る」「招待を待つ」が出る（BR1.6）
  - 「家族を作る」で名前を入れて保存すると、今月のカレンダーの枠が出る（BR1.10）。名前が正しくないと入力を残したまま文言が出る（BR1.9）。すでに家族に入っていると「すでに家族に入っています」（BR1.8）
  - 「招待を待つ」で「お母さんから届いた招待のリンクを開いてください」（BR1.10）
  - メンバーでないと「このアプリは家族のメンバーだけが使えます」（BR2.3）
  - 503 や通信の失敗では「表示できませんでした。もう一度お試しください」と「読み込み直す」が出る（NFR2.4）
  - セッショントークンはメモリにだけ持ち、ブラウザの保存場所に書かない（NFR4.3）。401 でトークンを取り直す
- [ ] **Step 16: 作る** — `packages/frontend/`: Vite + React + MUI、`@line/liff`（npm。スマホの LINE の中では LIFF、パソコンのブラウザでは LINE ログインに切り替える）、`src/hooks/useSession.ts`、`src/api/client.ts`（`Authorization: Bearer`、`Idempotency-Key` を作る）、`src/pages/RegisterPage.tsx`、`SetupPage.tsx`、`CalendarFramePage.tsx`、`ErrorRetry.tsx`、`src/theme.ts`（文字の差 4.5:1 以上、押す場所 44×44 以上。NFR9.1）。操作できる要素に `data-testid` を付ける
- [ ] **Step 17: 通す、整える** — Step 15 の筋書きが通るまで直し、通ったまま整える。テーマの色の差を確かめる単体テストを足す

### 環境と組み立ての設定

- [ ] **Step 18: AWS CDK の構成**（`infrastructure/`）
  - `bin/app.ts`（環境 `staging`、`production`。東京リージョン）
  - `lib/account-stack.ts`（`Housework-Account`: GitHub の OIDC のプロバイダー、ステージング用と本番用のロール、AWS Budgets 月 1 ドル）
  - `lib/data-stack.ts`（`Housework-<env>-Data`: `Users`（GSI `lineUserId-index`）、`Families`、`ProcessedLineEvents`（TTL）、`RequestRecords`（TTL）。オンデマンド、本番は `RETAIN`）
  - `lib/app-stack.ts`（`Housework-<env>-App`: Lambda `api` と `line`（Node.js 22、arm64、256 MB、30 秒、予約された同時実行数はコンテキストで切り替え可能、esbuild で束ねる）、関数 URL（`NONE`）と公開で呼べる許可、S3（非公開、OAC）、CloudFront（振り分け、CloudFront Functions で画面の道の書き換え、応答ヘッダーのポリシーで CSP ほか、元への秘密のヘッダーはコンテキストから）、`BucketDeployment`、ロググループ 30 日、Lambda ごとの最小のロール（自分の環境のテーブルとパラメータだけ。`cloudfront/*` の読み取りを含む））
  - `test/u1-skeleton-family/stacks.test.ts`（CDK のテスト: 関数 URL、時間切れ 30 秒、メモリ 256 MB、ログ 30 日、TTL、本番の `RETAIN`、API Gateway と Secrets Manager がない、ロールがほかの環境に届かない、CSP のヘッダー、秘密のヘッダーの値がテンプレートに入るのはコンテキストからだけ）
- [ ] **Step 19: GitHub Actions**（`.github/workflows/`）
  - `ci.yml`（プルリクエストと `main`: Prettier、ESLint、tsc、Vitest とカバレッジ、gitleaks、`cdk synth`。AWS の権限なし）
  - `deploy-staging.yml`（`main` への push: 検査のあと OIDC で反映、秘密のヘッダーの値を伏せて渡す、反映後の確かめ）
  - `deploy-production.yml`（`workflow_dispatch`、環境 `production` の承認、反映できるブランチは `main` だけ）
  - 反映後の確かめのスクリプト `scripts/smoke-check.sh`（`cicd-pipeline.md` の 4 つの確かめ）

### 書類と対応表

- [ ] **Step 20: 書類**
  - `README.md`（作り手が最初にすること: LINE のチャネル 3 つと LIFF アプリの作成、Webhook の再送を有効にする、パラメータストアに入れる値の一覧、CDK の bootstrap、`Housework-Account` の反映、Lambda の同時実行数の枠の確かめ、GitHub の環境と変数の設定、ステージングで B1 を確かめる手順）
  - `docs/contract-changes-u1.md`（U1 で足した契約: C1 の `POST /families` の本文とヘッダーと応答、C2 の 403・503、C3 の「思いがけない失敗は 500」、C6 の新しい窓口、C10 の新しい印。`contract-summary.md` への反映を待つ一覧）

## ストーリーとの対応

| 手順 | ストーリー | 受け入れ条件 |
|------|----------|------------|
| Step 1〜2 | 全体 | — |
| Step 3〜5 | US1.1 | AC1.1.3〜AC1.1.5、AC1.1.11 の文言 |
| Step 6〜8 | US1.1 | AC1.1.1、AC1.1.2、AC1.1.12（Webhook の確かめ） |
| Step 9〜11 | US1.1 | AC1.1.3、AC1.1.10、AC1.1.11、AC1.1.12 |
| Step 12〜14 | US1.1 | AC1.1.4、AC1.1.5 |
| Step 15〜17 | US1.1 | AC1.1.3〜AC1.1.5、AC1.1.10、AC1.1.11 |
| Step 18〜19 | US1.1（walking skeleton の配備） | NFR1、NFR3〜NFR5、NFR10 |
| Step 20 | — | — |
