# コード生成の計画 — U8 代わりにやる

## Summary

- Builds: 子供どうしがお知らせ先のグループで担当を代わる機能。「家事交代」の完全一致（前後の空白を除く）で、申し出られる担当を carousel のボタン（10 件まで）で返し、担当を選ぶと申し出（`SWAP#<dutyId>`）を作って「引き受ける」「申し出をやめる」を出し、先着 1 人の引き受けで担当の子供を変えて `origin=swap` にする（3 項目の取引）。`swapService`（`listSwappableDuties`・`offerSwap`・`acceptSwap`・`withdrawSwap`・`closeOffer`・`registerSwapHooks`）、`swapRepository`、LINE の受け口（`swapCommand`・`swapHandler`）、`notifyDutyReassigned` の並行化（`DUTY_HOOK_CONCURRENCY=4`、範囲 2〜5）、`api` と `line` の起動の枠でのフック登録、`runGroupOperation` の表示名の受け渡しと `GROUP_COMMAND_REJECTED` の `groupId` 削除。最初の手順で、上流の文書の「代わって」を「家事交代」に直し、LINE の上限を公式資料で確かめる
- Touches: `packages/shared/src/`（`reasons.ts`、`messages.ts`）、`packages/backend/src/`（`entries/line.ts`、`entries/api.ts`、`handlers/line/swapCommand.ts`〈新設〉、`handlers/line/swapHandler.ts`〈新設〉、`handlers/line/postbackHandler.ts`、`handlers/line/messageHandler.ts`、`services/swapService.ts`〈新設〉、`repositories/swapRepository.ts`〈新設〉、`services/dutyReassignedHook.ts`、`services/groupCommandGate.ts`、`services/lineApiService.ts`）、`infrastructure/test/u8-swap/stacks.test.ts`〈新設〉、`docs/contract-changes-u8.md`〈新設〉、`docs/manual-check-u8.md`〈新設〉、`README.md`、上流の文書 5 つ（`stories.md`、`requirements.md`、`mockups.md`、`contract-summary.md`、`functional-spec.md` の読み替え表）、U3 のテスト（`groupId` の期待）。`infrastructure/lib/`（`app-stack.ts`・`data-stack.ts`・`app.ts`）、`scripts/smoke-check.sh`（23 件のまま）、画面（`packages/frontend`）は**変えない**
- Tests: Gherkin の筋書き 10 本（バックエンド）で約 150 場面、部品ごとの単体テスト 5〜8 件、CDK のスタックの組み立てのテスト約 16 件（前後で同じことを固定）。Vitest で行カバレッジ 80% 以上。U1〜U7 のテストは通ったまま（U3 のテストの `groupId` の期待だけを直す）

## 前提

- 設計: `construction/u8-swap/functional-design/`（`functional-spec.md`、`rules.md`〈BR9.1〜BR9.19〉、`entities.md`）、`nfr-requirements/`、`nfr-design/`（`security-design.md`、`reliability-design.md`、`observability-design.md`、`performance-design.md`、`scalability-design.md`、`logical-components.md`）、`infrastructure-design/`（`infrastructure-specification.md`、`cicd-pipeline.md`、`monitoring-design.md`）
- U1〜U7 のコードに足す。U1〜U7 の動きは変えない。U1〜U7 のテストは、U3 の `groupId` の期待（承認の確認点 2）を除いて、期待を書き換えない
- 申し出を始める言葉は「家事交代」だけ（BR9.1。完全一致）。「代わって」「かわって」は受け付けない。要件・ストーリーの「代わって」と送る、は「家事交代」と送る、に読み替える。Step 1 で上流の文書を直す。「代わってくれる人を探しています」（申し出の知らせの文言）は始める言葉ではないので直さない
- 新しい依存は足さない（日付は `shared/jstDate.ts`、並行数の制限は自前の小さな関数 `mapWithConcurrency`、LINE の SDK は入れない）
- **インフラは変えない**（NFR4.82、NFR1.33）。`app-stack.ts`・`data-stack.ts`・`app.ts`、IAM、環境変数、テーブル、索引、TTL は足さない。CDK のテストの期待に「U8 で差分がない」ことを入れる（Step 31）。`scripts/smoke-check.sh` は全 23 件のまま（U8 は新しい HTTP の入口を足さず、LINE の署名つきの確かめはシークレットが要るため。動作の確かめは `docs/manual-check-u8.md` の 14 件）
- `.gitignore`、`AGENTS.md`、`.github/workflows/` は変えない
- 新しい秘密の情報はない（NFR5.14）。U8 は reply だけを使い、push・multicast・broadcast は使わない（NFR1.32）
- **秘密の値の決まり（この計画とテストで守る）:** 秘密の値の例は、文書では必ず `<作り物の値>` と書く。テストで使う作り物の値（UUID の形の担当 ID・申し出 ID・子供の ID・ほかの家族の ID、LINE のユーザー ID・グループ ID・reply トークン、`YYYY-MM` の月、チャネルのシークレット〈署名の計算に使う〉、鍵らしく見える値）は、各パッケージの `test/fixtures/fakeSecrets.ts` にだけ置き、**値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付けて**、テストからは import して使う（直書きは ESLint の `no-restricted-syntax` が止める）。文書やコメントに秘密の値の例を書くときは、必ず `<作り物の値>` と書く

## 承認のときに決めてほしい 2 点

この計画の承認の場で、人が次の 2 点を確かめます。既定（この計画が前提にしている答え）を書きます。

### 確認点 1: 「担当を選ぶ」のあと reply が失敗したときの扱い（`reliability-design.md` の「残る危険」）

- 起きること: 担当を選ぶ書き込みは成功したのに reply が失敗すると、申し出は `open` で残るが、グループに「引き受ける」「申し出をやめる」のボタンが出ない。もう一度選ぶと `ALREADY_OFFERED`（文だけ、ボタンなし）になり、ボタンを出し直す手段がない。害は「その担当で代わってもらえない」だけで、データは壊れない（BR9.8）
- 選べるもの: (1) このまま許容する（現状の設計）。(2) 申し出た本人に `ALREADY_OFFERED` を返すときだけ「引き受ける」「申し出をやめる」のボタンを添える（レビューが勧めた案）
- **この計画の既定は (1)**。理由: (2) は `rules.md` の BR9.7 の 5.（`ALREADY_OFFERED` は文だけ）と `functional-spec.md` の「結果の印と返事の対応」（`ALREADY_OFFERED`＝「この担当はもう申し出ています」だけ）を変える**機能設計の変更**で、設計は (2) を許していない。設計を変えるには、`reliability-design.md` が定めたとおり、決めた内容を `rules.md` と `reliability-design.md` に書き戻し、`docs/contract-changes-u8.md` に残す必要がある。承認の場で (2) が選ばれたら、そのときに計画を直す（下の「(2) が選ばれたときの追加」）。(1) のままなら、`docs/contract-changes-u8.md` に「許容した残る危険」として残す（Step 32）
- **(2) が選ばれたときの追加（既定ではやらない。選ばれたら Batch 6 に Step 28b として足す）:** `rules.md` BR9.7 の 5. と `functional-spec.md` の対応表を直す（`ALREADY_OFFERED` かつ押した人が申し出た本人のときだけ、文に「引き受ける」「申し出をやめる」の 2 ボタンを添える。ボタンの値は有効な申し出の `offerId`）。筋書き（本人が押し直すとボタン付き、ほかの子供・管理者が押すと文だけ）を先に `swap-offer-withdraw.feature` と `swap-line-roles.feature` に足し、`swapHandler` を直す。申し出の項目の追加の読み取りはしない（`ALREADY_OFFERED` の判定で読んだ申し出の `offerId` を使う。BR9.17）

### 確認点 2: `GROUP_COMMAND_REJECTED` から `groupId` を外す（U3 のログの形の変更）

- 内容: `observability-design.md`（NFR2.65）は、U8 の経路（`runGroupOperation`）の `GROUP_COMMAND_REJECTED` から LINE のグループ ID を外す。残すのは `reason` と、分かるときのアプリの `userId` だけ。調べものは `familyId`（分かるときだけ）で足りる。ほかの既存のログ（`GROUP_JOINED`、`NOTIFICATION_GROUP_REJECTED`、`GROUP_SUMMARY_FAILED`）は U8 の経路で出ないので**変えない**
- **この計画の既定は「外す」**（設計どおり）。U3 のテストは `groupId` の値を期待していない（`unregister-and-gate.steps.ts` は `GROUP_COMMAND_REJECTED` と `GROUP_NOT_REGISTERED` が出ることだけを見る）ことを Step 12 で確かめ、`groupId` が出ないことを確かめる期待を足す。U3 のテストの期待が `groupId` を含んでいれば、その期待を直す（Step 12 で一覧にして `docs/contract-changes-u8.md` に残す）
- 外さない選択をする場合は、`observability-design.md` と `NFR2.65` を直してから Step 12 を外す

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

- **この単位だけ**（リポジトリのルートで。詳細は `unit-test-instructions.md`）。U8 のテストはすべてパスに `u8-swap` を含むフォルダに置く:

```bash
npx vitest run u8-swap --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

- **この project の確認コマンド**（各 batch の終わりと最後の Step 37 で実行する）:

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

## 手順

筋書き（`.feature`）は、機能の切れ目ごとに実装の前に書き、その筋書きが通るまで、その切れ目の層（リポジトリ、業務の決まり、受け口）をまとめて作ります（BDD）。純粋な関数・条件式の組み立て・文字数の計算など、筋書きでは細かく確かめにくいものの単体テストは、筋書きが通ったあとに足します。切れ目は次の順です: 共有の文言（Batch 2）→ フックの並行化と入口の表示名（Batch 3）→ リポジトリ（Batch 4）→ サービス（Batch 5）→ LINE の受け口（Batch 6）。

Testing Contract の 8 つの骨組みとの対応: 1 構成と本番設定の骨組み = Step 2、2 テストの実行環境とコマンドの記録 = Step 3〜5、3 振る舞いの筋書き = Step 6・10・12・15・20・24〜25、4 機能の切れ目の実装 = Step 7・11・12・16・21・26〜27、5 筋書きを通す = Step 8・13・17・22・28、6 緑のまま整理 = Step 9・14・18〜19・23・29〜30、7 環境・ビルドの設定 = Step 31・33、8 文書と traceability = Step 32・34〜37。Step 1 は、BDD の筋書きの前に済ませる上流の文書の更新と LINE の上限の確認です（NFR8.15、NFR8.16）。

各手順の末尾に、実装する BR9.x / NFR / AC の ID を付けます。

---

### Batch 1: 上流の文書・LINE の上限の確認・土台（Step 1〜5）

*筋書きを書く前に、言葉と上限を確定する。BR9.1、BR9.6、BR9.7、NFR8.15、NFR8.16、NFR9.9 の準備*

- [x] **Step 1: 上流の文書の「代わって」を「家事交代」に直す、LINE の上限を公式資料で確かめる**（BR9.1、BR9.4、BR9.6、BR9.7、NFR8.15、NFR8.16、NFR9.9）
  - **1a. 上流の文書を直す**（`functional-spec.md` の読み替え表のとおり。「代わってくれる人を探しています」などの申し出の知らせの文言は直さない）。直したあと `grep` で「代わって」が始める言葉として残っていないことを確かめる:
    - `inception/user-stories/stories.md`: AC7.1.1〜AC7.1.3（「代わって」と送る → 「家事交代」と送る）、AC7.1.11 の「代わって」、「あとの段階で決めること」の 2 項目（管理者がグループで・1 対 1 で「代わって」→ 「家事交代」。決まった内容 Q2 を添える）
    - `inception/requirements-analysis/requirements.md`: FR7.1 の Given/When/Then 3 つ、`[assumption]`（FR7 の申し出は…「代わって」と送ると始まる）
    - `inception/refined-mockups/mockups.md`: T2 の会話例（`花子: 代わって` → `花子: 家事交代`）、返事の表の「代わって」で、1 対 1 と管理者の返事の注記
    - `inception/contract-design/contract-summary.md`: C3 の `message`（グループでの「登録」〈U3〉、「家事交代」〈U8。FR7.1〉）
    - `construction/u8-swap/functional-design/functional-spec.md`: 「筋書き用の読み替え表」に「直した日・直したファイル」を 1 行足す（読み替え表そのものは残す）
    - 直した一覧を `docs/contract-changes-u8.md` の冒頭の「上流の文書の更新」の節に書く（この Step で `docs/contract-changes-u8.md` を新設する。残りの節は Step 32 で完成させる）
  - **1b. LINE の上限を公式資料で確かめる**（`remote_web_search`／`web_fetch` で LINE Developers の Messaging API の資料を読む。出典の URL・確かめた日を記録する）。確かめる項目と、機能設計の仮定:
    1. carousel のバブルの数の上限（仮定 12。U8 は 10 を使う）
    2. 1 回の reply で送れるメッセージの通数の上限（仮定 5。U8 は 3 以内）
    3. **ボタンの文字の上限を 3 行に分けて確かめる**: (i) Flex の `button` のアクションの `label`（BR9.6 の担当ボタン。仮定 26 文字）、(ii) buttons テンプレートのボタンの `label`（BR9.7 の「引き受ける」「申し出をやめる」。仮定 20 文字）、(iii) postback の `label` の一般の上限。記憶では 20 文字で、仮定の 26 文字と食い違う可能性があるので、**数字を入れる前に必ず資料で確かめる**
    4. buttons テンプレートの本文の上限（仮定 160 文字。タイトル・画像なしのとき）、`altText` の上限（仮定 400 文字）、postback の `data` の上限（300 文字）
    5. **ボタンの高さ**: Flex の `button` の `height`（`sm`・`md`）が 44 ピクセル以上になるか、テンプレートのボタンの高さ（NFR9.9）
    6. **色の差**: LINE の標準の配色（ボタンの文字と背景）が 4.5:1 以上か。資料に色の値がなければ、独自に指定した色で、色の差を計算する単体テストを Step 30 で足す
  - 結果は `docs/contract-changes-u8.md` の「LINE の上限の確認結果」の表に（項目・仮定・確かめた値・出典・確かめた日）、違いがあれば「どう直したか」も書く。**資料が読めなかった項目は、決めつけずに「未確認」と書き、より厳しい側の値（短い文字数・小さい個数）を使い、承認後に人へ報告する**
  - **文字数の上限は計算で求める定数にする**（Step 7 で `lineApiService.ts` に置く。この Step では値を決めるだけ）: `LINE_LIMITS`（上の 1.〜4. の値を 1 か所に置く）と、そこから**計算する** `SWAP_CHORE_NAME_MAX = FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1`（`DATE_LABEL_MAX_LENGTH` は「M/D」の最大 5 文字、`- 1` は空白 1 文字）。確かめた上限が 26 でなく 20 なら、`SWAP_CHORE_NAME_MAX` は 14 文字になり、名前は末尾を「…」にして（`SWAP_CHORE_NAME_MAX - 1` 文字 + 「…」）上限に収める。同じく、知らせの本文に入れる表示名・お手伝いの名前の長さ（仮定 20 文字）も、本文の上限（160 文字）から計算する `SWAP_NOTICE_NAME_MAX`（固定の文と日付の長さを引いて、2 つの名前で割った値の小さいほう。20 を上限とする）にする。BR9.6 の「20 文字」「26 文字」の数字は、確かめた結果に合わせて `rules.md` の該当行に注記する（数字の入れ替えで済む作りにする）

- [x] **Step 2: 骨組みと設定の置き場所**（BR9.19、NFR8.14）
  - U8 のテストのフォルダを作る:
    - `packages/shared/test/u8-swap/`
    - `packages/backend/test/u8-swap/`（と `helpers/`）
    - `infrastructure/test/u8-swap/`
  - 作り物の値の置き場所を確認・追加する（上の「秘密の値の決まり」）:
    - `packages/backend/test/fixtures/fakeSecrets.ts`: U8 で使う作り物の申し出 ID（2 種類以上。古いボタンの確認に使う）、担当 ID、子供 3 人・管理者の ID、ほかの家族の ID、LINE のユーザー ID・グループ ID・reply トークン、登録されていないグループの ID、`YYYY-MM` の月、署名の計算に使うチャネルのシークレット（U6 のものがあれば再利用）を確認し、不足分を足す。値の行ごとに `// gitleaks:allow テスト用の作り物の値` を付ける
    - 名前を伏せ字で確かめるための**作り物の目印**（`<作り物の値>` の目印を付けた表示名・種類の名前〈タグ・改行・21 文字以上を含む〉）も、同じ場所に置く
  - `packages/backend/test/u8-swap/helpers/` を作る:
    - `seed.ts`: 家族（管理者 1 人、子供 3 人。友だち登録済み）、お知らせ先のグループの登録、種類（皿洗い、洗濯物たたみ、名前が長い種類など）、状態ごとの担当（未・済・×。`origin` が rule／manual／swap。日付は過去・今日・未来）、月の状態（確定／未確定／行なし）、申し出の項目（`SWAP#<dutyId>` の open／accepted／withdrawn／cancelled、`dutyVersion` が今の担当の version と一致／不一致）を `Calendar` と `ChoreTypes` に直接置く関数
    - `lineEvents.ts`: Webhook の本文（message・postback。group／user／room）と署名（作り物のシークレットで計算した本物の HMAC。NFR8.14）を作る関数（U6 の `helpers/events.ts` を再利用して足す）
    - `lineFetch.ts`: LINE の API の `fetch` の差し替え（reply の本文を集める。失敗・時間切れを作れる。外部への通信が reply 以外に出ないことを確かめられる）

- [x] **Step 3: テストの実行環境の準備とコマンドの記録**（NFR8.14）
  - U1〜U7 の Vitest・`@amiceli/vitest-cucumber`・カバレッジの設定をそのまま使う（`vitest.config.ts` は変えない。`thresholds.lines: 80` は下げない。新しい道具は入れない）
  - 偽の DynamoDB（`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`）が U8 の書き方に対応していることを確かめ、足りなければ評価の実装を足す（U1〜U7 のテストの期待は変えない）:
    - **項目が無いキーへの `UpdateItem`**（`sk=SWAP#<dutyId>`）が項目を作ること（申し出の作成。`PutItem` を使わない。BR9.19）
    - 条件式の `attribute_not_exists(#sk) OR #status <> :open OR #dutyVersion <> :v` のような `OR` を含む式（括弧なしの AND／OR の分け方は既存の実装を確認）
    - `SET` と `REMOVE` を同じ式で（`acceptedByUserId`・`acceptedAt` の取り除き）
    - 3 項目の取引（担当の `UpdateItem`、申し出の `UpdateItem`、月の状態の `ConditionCheck`）を全部評価し、断られたとき項目ごとの `CancellationReasons`（`ConditionalCheckFailed`）を作ること
    - 「読んだあとに別の書き込みが先に入った」差し込み（`hooks.beforeTransaction(n, fn)`）と、n 回目の取引を `TransactionConflict`・`ConditionalCheckFailed`・`ThrottlingError` で断る差し込み（`hooks.failTransaction(n, code)`）。**同時の引き受けは本物の並行でなく、この差し込みで再現する**（NFR8.14）
    - 読み取りの呼び出しの記録（`hooks.readLog`。`GetItem`・`Query` の対象と回数。呼び出しの回数の上限の確認に使う）と、`Scan`・`BatchGet`・`BatchWrite`・`PutItem`／`DeleteItem`（申し出の項目に対して）が呼ばれたら失敗にする見張り
  - 最初の空の筋書き 1 つ（`packages/backend/test/u8-swap/runner-ready.feature` と steps）で、「この単位だけ」のコマンドが動くことを確かめ、コマンドを `unit-test-instructions.md` に記録する（NFR8.14）

- [x] **Step 4: 既存のテストが通ったままかを確かめる**
  - Step 2〜3 の変更のあと、U1〜U7 のバックエンド・共有・インフラのテストがすべて通ることを確かめる:
    ```bash
    npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm
    ```
  - 落ちたら補助の変更を直す（U1〜U7 のテストの期待は変えない）
  - `runner-ready.feature` と steps を消す

- [x] **Step 5: 権限と環境変数が足りていることを `app-stack.ts` で確かめる**（BR9.19、NFR4.81、NFR4.82、NFR1.33）
  - `infrastructure/lib/app-stack.ts` を**読むだけ**で、次を確かめる（機能設計と NFR 設計の引き継ぎの再確認）:
    - `line` の Lambda: 環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` があり、`Calendar` に `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`、`ChoreTypes` に `GetItem`・`Query`・`ConditionCheckItem` が許可されている（U6）
    - `api` の Lambda: `Calendar` に 6 操作（U5）、`ChoreTypes` に 6 操作（U4）、同じ環境変数がある
    - `line` に `Calendar` の `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、`ChoreTypes` への書き込み、`Resource: "*"` がない
  - 足りていれば何も変えない。**不足があれば、コードを書かずに止めて**、`nfr-design/security-design.md` に戻る必要があると人に報告する（インフラは U8 で変えない前提）。結果は `code-summary.md` に書く

---

### Batch 2: 共有パッケージの文言と理由の印（Step 6〜9）

*BR9.3、BR9.4、BR9.6、BR9.7、BR9.10、BR9.14、NFR4.83、NFR4.84 の準備*

- [x] **Step 6: 筋書きと単体テストを書く（共有パッケージの理由の印・文言）**（BR9.14、BR9.6、BR9.7）— `packages/shared/test/u8-swap/`:
  - `messages.test.ts`（5〜8 件）:
    - 理由の印 `OFFER_OWNER_ONLY` の文言が「この操作は申し出た人だけができます」であること、既存の印（`NO_SWAPPABLE_DUTY`・`MONTH_CONFIRMED`・`ALREADY_OFFERED`・`OFFER_ALREADY_ACCEPTED`・`OFFER_GONE`・`CANNOT_ACCEPT_OWN_OFFER`・`DUTY_CHANGED`）の文言が機能設計の表のとおりで、消えていないこと
    - 見出し「代わってほしい担当を選んでください」、あふれたときの案内「近い日の担当だけ出しています。ほかの担当は、その日が近づいたらまた『家事交代』と送ってください」、管理者への文「代わってもらう申し出は子供だけができます」、1 対 1 の案内「代わってほしいときは、家族のグループで『家事交代』と送ってください」、失敗の文 2 つ（申し出・引き受け）
    - 値を入れる文の関数: 申し出の知らせ（`{名前}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています`）、引き受け（`…を引き受けました`）、取り下げ（`…の申し出をやめました`）が、月・日を 0 埋めなしで出し、名前が引けないとき「だれか」「お手伝い」に言い換えること（BR9.14）
    - 管理者に返す文に「家事交代」の言葉を入れず、1 対 1 と案内の文には「『家事交代』」が入ること（Q1 の読み替えの範囲）
    - 「代わって」「かわって」が、始める言葉として文言のどこにも使われていないこと（「代わってくれる人を探しています」の文だけが例外）

- [x] **Step 7: 作る（共有パッケージ）**（BR9.14）— `packages/shared/src/`:
  - `reasons.ts`: `OFFER_OWNER_ONLY` を足す（ほかは既存であることを確認する。不足があれば足す）
  - `messages.ts`: Step 6 で確認した文言を、値を入れる形の関数として足す。`getMessage('OFFER_OWNER_ONLY')` が引けること
  - `index.ts` の再公開を確認する

- [x] **Step 8: 通す、整える（共有パッケージ）**
  - Step 6 のテストが通るまで直す
  - U1〜U7 の共有のテストが通ることを確かめる（既存の `messages.test.ts` は、`OFFER_OWNER_ONLY` を足す以外の期待を変えない）

- [x] **Step 9: LINE の上限の定数と文字数の計算（`lineApiService.ts`）の単体テストと実装**（BR9.6、BR9.7、NFR8.15、NFR9.9）— `packages/backend/test/u8-swap/lineLimits.test.ts`、`packages/backend/src/services/lineApiService.ts`:
  - 先にテストを書く（5〜8 件。Step 1b で確かめた値を使う）:
    - `LINE_LIMITS` の各値が Step 1b の確認結果と同じであること（値と出典を `docs/contract-changes-u8.md` と見比べるための 1 か所の定数）
    - `SWAP_CHORE_NAME_MAX` が `FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1` から**計算される**こと（定数の直書きでなく、上限を変えるとテストの期待も計算で変わること）
    - ボタンの文字（「M/D 名前」）が、名前の長さ（0、上限ちょうど、上限 + 1、サロゲートペアや結合文字を含む名前、タグ・改行を含む名前）のどれでも、`FLEX_BUTTON_LABEL_MAX` を超えないこと。切るときは文字を割らない（`Array.from` のコードポイント単位）。切ったときは末尾が「…」
    - 知らせの本文（表示名とお手伝いの名前を `SWAP_NOTICE_NAME_MAX` で切ったもの）が `TEMPLATE_BODY_MAX` を超えないこと
  - 実装: `lineApiService.ts` に `LINE_LIMITS`、`SWAP_CHORE_NAME_MAX`、`SWAP_NOTICE_NAME_MAX`、名前を切る関数 `truncateForLine(text, max)` を足す。**上限の数字はこのファイルの 1 か所だけ**に置く
  - この batch の確認コマンドを実行する

---

### Batch 3: フックの並行化と入口の表示名（Step 10〜14）

*BR9.2、BR9.11、BR9.18、NFR2.58、NFR2.59、NFR2.64、NFR2.65、NFR3.14、NFR3.15、NFR7.46、NFR8.16 の実装*

- [x] **Step 10: 筋書きを書く（フックの並行化）**（BR9.11、NFR2.58、NFR2.59、NFR2.64、NFR3.15、NFR7.46）— `packages/backend/test/u8-swap/`:
  - `swap-hooks.feature` と `swap-hooks.steps.ts`（約 12 場面）:
    - 300 件のイベント（`kind: 'status-changed'`）を渡すと、同時に動く関数が `DUTY_HOOK_CONCURRENCY`（4）を超えず、すべてのイベントが 1 回ずつ呼ばれること
    - 1 つのイベントに登録された関数は**登録の順に `await`** されること（順序の意味を変えない）
    - 関数が投げても、残りのイベントが続くこと。投げた 1 件ごとに `DUTY_HOOK_FAILED`（`familyId`・`dutyId`・`kind`・エラーの種類だけ）が 1 件出て、名前・単価が含まれないこと
    - 300 件のうち、開いた申し出 10 件（フックが `cancelled` にする）、フックが投げる 2 件のとき: `SWAP_OFFER_CLOSED` が 10 件、`DUTY_HOOKS_DONE` が 1 件（`count`＝300、`failed`＝2、`concurrency`＝4）、`DUTY_HOOK_FAILED` が 2 件、条件で断られた 288 件がログに出ないこと（`observability-design.md` の単体テストの指定）
    - `DUTY_HOOKS_DONE` の `kind` が、1 種類のときは文字列、混ざるときは種類ごとの件数のオブジェクト（合計が `count` と一致）であること。1 件だけのときも出ること
    - 登録された関数がないとき何もしない（`DUTY_HOOKS_DONE` も出さない）、空の一覧のとき何もしないこと
    - 保存の結果（呼び出し元の戻り値）が、関数が投げても変わらないこと
    - `notifyDutyRecorded`（1 件ずつ）の動きは変わらないこと
    - **段階 2 の締め切り**（`performance-design.md`）は、測定の結果が出るまで入れない。`DUTY_HOOKS_TRUNCATED` は定義だけ（型）を置き、段階 1 では出さないことを確かめる場面を 1 つ入れる
  - 型は変えない: `DutyReassignedEvent`・`DutyReassignedHook`・`notifyDutyReassigned(events)`（`@ts-expect-error` の単体テストは Step 14）

- [x] **Step 11: 作る（`dutyReassignedHook.ts` の並行化）**（BR9.11、NFR3.15、NFR8.16）— `packages/backend/src/services/dutyReassignedHook.ts`（変更）:
  - 定数 `DUTY_HOOK_CONCURRENCY = 4`（変えてよい範囲 2〜5。範囲は定数のコメントと、範囲外のとき 2〜5 に丸める `clampConcurrency` で守る）を 1 か所に置く
  - 自前の小さな関数 `mapWithConcurrency<T>(items, limit, worker)`（依存を入れない。`performance-design.md` の形）を同じファイルに置く
  - `notifyDutyReassigned(events)` を、イベントを `DUTY_HOOK_CONCURRENCY` 件ずつ並行に処理する形にする。1 つのイベントの中は登録の順に `await`。`worker` の `catch` で `DUTY_HOOK_FAILED` を残し失敗を数える。完了後に `DUTY_HOOKS_DONE`（`familyId`・`kind`・`count`・`failed`・`concurrency`・`durationMs`）を 1 回だけ出す
  - `notifyDutyRecorded` は変えない。型は変えない

- [x] **Step 12: `runGroupOperation` の表示名の受け渡しと `GROUP_COMMAND_REJECTED` の `groupId` 削除（承認の確認点 2）**（BR9.2、BR9.18、NFR2.65、NFR4.77）— `packages/backend/src/services/groupCommandGate.ts`（変更）、U3 のテスト（確認）:
  - 先に筋書きの期待を足す: `packages/backend/test/u8-swap/swap-gate.feature` と `.steps.ts`（約 8 場面）:
    - 登録されていないグループ → `GROUP_NOT_REGISTERED` の文で断り、操作を呼ばない（AC1.2.5）
    - 登録済みのグループで、友だちでない人・家族でない人・`source.userId` なし → `NOT_FAMILY_MEMBER`、操作を呼ばない
    - 家族のメンバーなら、`ctx = { familyId, userId, role }` と**表示名を第 2 引数**で操作を呼ぶこと（`FamilyContext` は変わらない。追加の読み取りはしない。利用者の記録の読み取りは 1 回のまま）
    - 断ったときの `GROUP_COMMAND_REJECTED` のログに、`groupId` がなく、`reason` と（分かるときの）アプリの `userId` だけがあること。作り物の LINE のグループ ID・ユーザー ID・表示名の目印がログの全行に含まれないこと
  - 実装: `operation: (ctx: FamilyContext, displayName: string) => Promise<T>` にする（既存の呼び出し〈U3 のテスト〉は第 2 引数を無視できるので変わらない）。`reject` から `groupId` を外す（`runRegister` の `NOTIFICATION_GROUP_REJECTED` などほかのログは**変えない**）
  - U3 のテストを確認する: `packages/backend/test/u3-notification-group/unregisterNotificationGroup.test.ts`（`runGroupOperation` の 5 件）と `unregister-and-gate.steps.ts`（`GROUP_COMMAND_REJECTED` が出ることを見る箇所）。`groupId` の値を期待している箇所があれば直し、無ければ「`groupId` が出ない」期待を 1 つ足す。直した（足した）一覧を `docs/contract-changes-u8.md` に残す（Step 32）

- [x] **Step 13: 通す（フックの並行化と入口）**
  - Step 10・Step 12 の筋書きが通るまで直す
  - U1〜U7 の `dutyReassignedHook`・`groupCommandGate` のテスト（U5・U7 の `notifyDutyReassigned` を呼ぶ筋書きを含む）が通ったまま

- [x] **Step 14: 単体テスト（フック・入口）、整える**（BR9.11、NFR3.15、NFR8.16）— `packages/backend/test/u8-swap/`:
  - `mapWithConcurrency.test.ts`（5〜8 件）: 上限が 1・2・4・5・件数より大きいとき、空の一覧、結果の順序、1 件が投げても止めない（呼び出し側で扱う形）、`limit` が 0 や範囲外のとき `clampConcurrency` で 2〜5 になること
  - `dutyReassignedHook.concurrency.test.ts`（5〜8 件）: 同時実行数の最大が 4 を超えないこと（時間のかかる関数で数える）、`DUTY_HOOK_CONCURRENCY` を 2・5 にしても全件 1 回ずつ呼ばれること、`DutyReassignedEvent`・`notifyDutyReassigned` の型が変わっていないこと（`@ts-expect-error`）
  - `groupCommandGate.displayName.test.ts`（5〜8 件）: 表示名の受け渡し、既存の呼び出し（引数 1 つの `operation`）が動くこと、`groupId` を含まないログ
  - この batch の確認コマンドを実行する

---

### Batch 4: リポジトリ（申し出の項目と引き受けの取引）（Step 15〜19）

*BR9.7〜BR9.11、BR9.15、BR9.19、NFR2.54〜NFR2.57、NFR4.81 の実装*

- [x] **Step 15: 筋書きを書く（申し出の項目と取引の組み立て）**（BR9.7、BR9.9、BR9.10、BR9.11、BR9.19、NFR4.81）— `packages/backend/test/u8-swap/`:
  - `swap-transaction.feature` と `swap-transaction.steps.ts`（約 16 場面。リポジトリの組み立てを偽の DynamoDB で評価して確かめる）:
    - 申し出の作成（`createOffer`）: `Calendar` の `sk=SWAP#<dutyId>` への `UpdateItem` 1 つ＋担当の `ConditionCheck`（`status=todo`・`version`・`dutyId`・`childUserId=ctx.userId`）＋月の状態の `ConditionCheck`（`buildMonthGuard`）の 3 項目の取引で、`dutyId`・`offerId`・`offererUserId`・`dutyVersion`・`status=open`・`createdAt`＝`updatedAt` を `SET`、`acceptedByUserId`・`acceptedAt` を `REMOVE` すること。**担当そのものは書き換えない**
    - 条件が「項目がない、または `status` が `open` でない、または `dutyVersion` が今の担当の version と違う」で、項目が無いキーから作れる、`accepted`・`withdrawn`・`cancelled` の項目に新しい `offerId` で上書きできる、`dutyVersion` が古い `open` の項目（フックの失敗で残ったもの）に上書きできる、有効な `open` の項目には断られる
    - 引き受け（`acceptOffer`）: 担当の `UpdateItem`（`SET childUserId=:taker, origin=:swap, version=version+1, updatedAt=:now`。条件 `dutyId`・`version=:dutyVersion`・`status=todo`・`childUserId=:offerer`）＋申し出の `UpdateItem`（`SET status=accepted, acceptedByUserId, acceptedAt, updatedAt`。条件 `status=open` かつ `offerId` が同じ）＋月の状態の `ConditionCheck` の **3 項目**。全部書くか全部書かない。担当の `status`・`recordedAt`・`recordedBy`・`unitPrice`・`date`・`choreTypeId` を変えない。`ChoreTypes` を取引に含めない
    - 取り下げ（`withdrawOffer`）: 申し出の `UpdateItem` 1 回（`SET status=withdrawn, updatedAt`。条件 `status=open` かつ `offerId` が同じ）。担当に触れない
    - 掃除（`closeOffer`）: 申し出の `UpdateItem` 1 回（`SET status=cancelled, updatedAt`。条件 `status=open`）。項目が無いときは**項目を作らない**（`attribute_exists(#sk)` を含める。`SWAP#` の項目が作られるのは申し出られた担当だけ）。条件で断られたら何も起きない（`ConditionalCheckFailed` を握りつぶし、ほかの失敗は投げ直す）
    - **条件式・更新式のすべての属性名が `ExpressionAttributeNames`（`#` の別名）で置き換えられていること**
    - 申し出の項目の読み取り（`getOffer`）が `GetItem`・強い整合性の読み取りで、`Query`／`Scan` を使わないこと。月の Query（`M#<month>#`）・種類の使用の確かめ（`M#`）が `SWAP#` を読まないこと
    - 申し出の項目に `PutItem`・`DeleteItem`・`BatchWrite` を発行しないこと（見張りが 0 回）。取引の項目数が 3 を超えないこと
    - 同時の引き受け（差し込み）: 先に別の申し出が `accepted` になっていると、取引全体が断られ、担当も申し出も書かれない（部分書き込みなし）。`CancellationReasons` の項目ごとの Code から競合（`conflict`）と判定され、`ThrottlingError` などは投げ直す（`classifyCancellation`）

- [x] **Step 16: 作る（`repositories/swapRepository.ts`）**（BR9.7〜BR9.11、BR9.19、NFR4.81）— `packages/backend/src/repositories/swapRepository.ts`（新設）、`packages/backend/src/models.ts`（`SwapOfferRecord`・`SwapStatus` を足す）:
  - 申し出の項目のキー `swapSortKey(dutyId) = SWAP#<dutyId>` をこのファイルに置く（`M#` と重ならない。`calendarRepository` の Query に入らない）
  - `getOffer(familyId, dutyId)`（`GetItem`・強い整合性）、`buildCreateOfferItems`、`buildAcceptItems`、`buildWithdrawUpdate`、`buildCloseUpdate`、`createOffer`／`acceptOffer`（取引の実行。`written | conflict` を返す）、`withdrawOffer`／`closeOffer`（条件つきの `UpdateItem`。断られたら `conflict`／何もしない）
  - 既存の `calendarRepository` の `buildMonthGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`・`findDuty` を**使う**（新設しない）。必要ならそれらの export を足す（U5〜U7 の関数の中身は変えない）
  - すべての属性名を `ExpressionAttributeNames` で置き換える。`PutItem`・`DeleteItem`・`Scan`・`BatchGet`・`BatchWrite` は使わない

- [x] **Step 17: 通す（リポジトリの筋書き）**
  - Step 15 の筋書きが通るまで直す
  - U1〜U7 の `calendarRepository` のテストが通ったまま

- [x] **Step 18: 単体テスト（リポジトリ）、整える**（BR9.7〜BR9.11、BR9.19、NFR4.81）— `packages/backend/test/u8-swap/`:
  - `swapRepository.items.test.ts`（各 5〜8 件）: 作成・引き受け・取り下げ・掃除の式の組み立て（`ExpressionAttributeNames`・`ExpressionAttributeValues` の中身）、条件式の文字列、3 項目・1 項目の数、`PutItem`・`DeleteItem` を発行しない
  - `swapRepository.keys.test.ts`（5 件）: `swapSortKey` の形、`M#` の前置きと重ならないこと、`dutyId` が小文字の UUID の形でないときの扱い（呼び出し側が先に弾く前提で、キーに `#`・空白を含めないこと）、ほかの家族の `familyId` では読めないこと
  - `classifyCancellation` の U8 の使い方（引き受けの 3 項目の `CancellationReasons`）の単体テスト（競合だけ `conflict`、`ThrottlingError` を含むと `undefined`）

- [x] **Step 19: リポジトリの batch の確認**
  - この batch の確認コマンドを実行する（U1〜U7 が通ったままであること）

---

### Batch 5: サービス（一覧・申し出・引き受け・取り下げ・掃除）（Step 20〜23）

*BR9.3、BR9.5〜BR9.15、BR9.17、BR9.18、NFR2.54〜NFR2.62、NFR7.44、NFR7.45、NFR11.8、NFR11.9 の実装*

- [x] **Step 20: 筋書きを書く（サービス）**（AC7.1.1〜AC7.1.10、BR9.5〜BR9.15）— `packages/backend/test/u8-swap/`:
  - `swap-list.feature` と steps（約 12 場面。AC7.1.1〜AC7.1.3、BR9.5、BR9.6）:
    - 自分の・今日以降の・「未」の・確定していない月の担当だけが、日付の近い順（同じ日は C7 の種類の順、それも同じなら `dutyId` の昇順）で返ること。過ぎた日・「済」「×」・ほかの子供の担当・確定している月の担当は出ない
    - 今日（日本時間）を含む。UTC 15 時の前後（JST 23:59／0:00）、月末、年またぎ、うるう年（2/29）で今月と来月を正しく読むこと（NFR11.8）
    - 今月と来月を並行して読み、読み取りが担当の数で増えないこと（月の Query 2 回＋種類の Query 1 回。`hooks.readLog`。NFR7.44）
    - 候補が 0 件で今日の月が確定 → `MONTH_CONFIRMED`、それ以外 → `NO_SWAPPABLE_DUTY`。来月だけ確定していて今月に候補がない → `NO_SWAPPABLE_DUTY`
    - 引き受けた担当（`origin=swap`）も、自分の「未」の担当なら候補に入る（Q4、BR9.12）。申し出が出ている担当も候補から外さない
    - 管理者の担当は存在しない前提（子供の担当だけ）。11 件以上でも窓口は全件を返す（10 件への絞りは受け口。Step 26）
  - `swap-offer-withdraw.feature` と steps（約 20 場面。AC7.1.4、AC7.1.8、AC7.1.9、BR9.7、BR9.8、BR9.10、BR9.15）:
    - 子供が自分の「未」の担当を選ぶと `{ offerId }` が返り、申し出が `open` で書かれる（`dutyVersion`＝読んだ担当の version）
    - 判定の順: `NOT_FOUND`（ほかの家族の `dutyId`）→ `OFFER_OWNER_ONLY`（ほかの子供の担当・管理者）→ `MONTH_CONFIRMED` → `DUTY_NOT_TODO`（「済」「×」・過ぎた日）→ `ALREADY_OFFERED`（有効な申し出がある。AC7.1.9）。古い選択ボタン（担当が引き受けなどで変わり、元の持ち主が押した）は `DUTY_CHANGED`、管理者・ほかの子供は `OFFER_OWNER_ONLY` のまま（申し出の項目の `offererUserId` を探索と並行して読んで決める。追加の読み取りなし）
    - 取り下げたあと・引き受けられたあと・自動でなくなったあとは、同じ担当を新しい `offerId` で申し出し直せる。古い `offerId` のボタンは `OFFER_GONE`
    - 取り下げ: 本人は取り下げられる。本人以外（管理者を含む）は `OFFER_OWNER_ONLY`（何も変わらない）。引き受け済みは `OFFER_ALREADY_ACCEPTED`。ない・`offerId` が違う・`withdrawn`・`cancelled`・有効でない `open` は `OFFER_GONE`。取り下げたあと「引き受ける」は `OFFER_GONE`（AC7.1.8）
    - 競合の差し込み: 申し出の書き込み直前に (a) 担当が変わる、(b) 月が確定される、(c) 同じ担当に別の申し出が入る → 読み直して印が決まる。2 回続けて断られると `INTERNAL`（書き込みの呼び出しが 2 回で止まる。BR9.15）。思いがけない Code（`ThrottlingError`）は読み直さず投げ直す
  - `swap-accept.feature` と steps（約 18 場面。AC7.1.5〜AC7.1.7、BR9.9、BR9.12、BR9.13）:
    - 別の子供が「引き受ける」を押すと、担当の `childUserId` がその子供になり `origin=swap`・`version` が 1 増え、`status`・記録の項目・単価は変わらない。押した子供の自分の担当は動かない。申し出が `accepted`（`acceptedByUserId`・`acceptedAt`）になる。**`notifyDutyReassigned`・`notifyDutyRecorded` は呼ばれない**（登録した関数が 0 回）
    - 判定の順: `OFFER_GONE`（申し出なし・`offerId` が違う・`withdrawn`・`cancelled`・担当が変わった・日が過ぎた・確定された）→ `CANNOT_ACCEPT_OWN_OFFER`（管理者・申し出た本人。引き受けられたあとでも）→ `OFFER_ALREADY_ACCEPTED` → 取引
    - 同時に押した 2 人: 差し込みで先の 1 人が成立し、もう 1 人は読み直して `OFFER_ALREADY_ACCEPTED`（AC7.1.6）。取り下げと引き受けが競合したときは、引き受けが勝てば取り下げが `OFFER_ALREADY_ACCEPTED`、取り下げが勝てば引き受けが `OFFER_GONE`。引き受けと担当の子供の変更（管理者）が競合したときは `OFFER_GONE`
    - 引き受けた担当を、引き受けた子供がさらに申し出て、別の子供が引き受けられる。何回引き継いでも `origin=swap`（Q4）。花子の古いボタンは `offerId` が違うので `OFFER_GONE`
    - 引き受けの読み取りが、担当の探索＋申し出の `GetItem`＋種類の Query で、上限を超えないこと（NFR7.45）。LINE のプロフィール取得（`fetch`）が 0 回
    - 担当を作らない・消さない。ほかの担当・ほかの家族のデータに触れない
  - `swap-cleanup.feature` と steps（約 14 場面。AC7.1.10、BR9.8、BR9.11、BR9.18）:
    - `registerSwapHooks` が二重に呼ばれても登録は 1 回だけ（`registered` フラグ）。`api` 用（`reassigned: true, recorded: true`）と `line` 用（`reassigned: false, recorded: true`）
    - `child-changed`・`deleted`・`status-changed` の `onDutyReassigned` と `onDutyRecorded` で、その担当の `open` の申し出が `cancelled` になり `SWAP_OFFER_CLOSED`（`via`）が 1 件出る。申し出がない担当・すでに `open` でない担当は、何も書かれず、ログも出ない（条件で断られた件はログに出さない）
    - フックが失敗・遅延・未登録でも、読んだときの判定（BR9.8 の (a)〜(e)）が「なくなった」と扱う: 担当の `version` が違う、「未」でない、担当の子供が変わった、日が過ぎた、月が確定した。それぞれで `acceptSwap` が `OFFER_GONE`、`offerSwap` が古い `open` の項目を上書きできる
    - 月の確定（U7 の `confirmMonth`）の 300 件の筋書き（`reliability-design.md`）: (a) 10 件目のフックが投げる、(b) 確定後の一覧の読み取りが失敗する、(c) すべてのフックが投げる、の各差し替えで、確定が成功のまま返ること、残りのフックが続くこと、残った `open` の申し出が `acceptSwap` で `OFFER_GONE` になること
    - 確定の取り消し（U7 の `unconfirmMonth`）のあと: フックが成功していれば `cancelled` のまま戻らず、失敗して `open` のまま残っていれば有効に戻る（BR9.11 が許容した差。戻す処理は作らない）
    - 画面からの記録（U6 の `onDutyRecorded`）で申し出が `cancelled` になる

- [x] **Step 21: 作る（`services/swapService.ts`）**（BR9.5〜BR9.15、BR9.17、BR9.18、NFR2.54〜NFR2.57、NFR11.8）— `packages/backend/src/services/swapService.ts`（新設）:
  - `listSwappableDuties(ctx, today): Promise<SwappableDuty[] | 'NO_SWAPPABLE_DUTY' | 'MONTH_CONFIRMED'>`: 今月と来月を `loadMonth` で**並行**に読み、種類の一覧（C7 `choreTypeService.list`）を並行に読む。並び順は BR9.6（`date` 昇順→種類の順→`dutyId` 昇順）。全件を返す
  - `offerSwap(ctx, dutyId, { now })`: 担当の探索（`findDuty`）と申し出の `getOffer` と種類の一覧を並行に読み、BR9.7 の判定の順（1〜5）→ `createOffer`（断られたら読み直し 1 回、2 回続けて `INTERNAL`。`MAX_ATTEMPTS = 2`）。結果は `{ offerId, dutyDate, choreTypeId, choreName, offererName }` 相当（返事に必要な値を添える）または理由の印
  - `acceptSwap(ctx, dutyId, offerId, { now })`: 申し出と担当を並行に読み、BR9.9 の判定の順（1〜4）→ `acceptOffer`（読み直し 1 回、2 回続けて `INTERNAL`）。`NOT_FOUND` は `OFFER_GONE` に含める。**フックを呼ばない**
  - `withdrawSwap(ctx, dutyId, offerId, { now })`: BR9.10 の判定の順（1〜4）→ `withdrawOffer`（断られたら読み直し 1 回）
  - **申し出の有効さの判定 `isOfferValid(offer, duty, monthState, today)`**: BR9.8 の (a)〜(e) を**読んだ値から判定する純粋な関数**にする（項目を書き換えない。フックの結果に頼らない）
  - `closeOffer(familyId, dutyId, via, now)`（`swapRepository.closeOffer` を呼び、実際に `cancelled` にしたときだけ `SWAP_OFFER_CLOSED` を出す）と `registerSwapHooks({ reassigned, recorded })`（実行環境ごとに 1 回。`onDutyReassigned` の 3 種類 `child-changed`・`deleted`・`status-changed`、`onDutyRecorded` に `closeOffer` を登録）を**同じファイル**に置く（別ファイル `swapHooks.ts` は作らない。BR9.11）。テスト用に登録の状態を戻す `resetSwapHooksForTest()` を export する
  - ログ（`observability-design.md`）: `SWAP_LISTED`（`familyId`・`count`・`shown`・`durationMs`。候補なし・確定済みは `SWAP_REJECTED`〈`op: list`〉にして結果のイベントを 1 件にする）、`SWAP_OFFERED`、`SWAP_ACCEPTED`、`SWAP_WITHDRAWN`、`SWAP_REJECTED`（`familyId`・`dutyId`・`op`・`reason`）、`SWAP_RETRY`（`dutyId`・`op`）。`GROUP_NOT_REGISTERED`・`NOT_FAMILY_MEMBER` は入口の `GROUP_COMMAND_REJECTED` が出すので重ねて出さない。表示名・お手伝いの名前・LINE の ID・単価・金額を出さない
  - 日付は入口で 1 回取った `now` から `shared/jstDate.ts` で求める（端末の時計・`new Date()` の直接呼びを使わない）
  - 名前が引けないとき「だれか」「お手伝い」に言い換え、書いたあとに投げない作りにする（BR9.14）

- [x] **Step 22: 通す（サービスの筋書き）**
  - Step 20 の 4 本の筋書きが通るまで直す
  - U1〜U7 の `calendarService`・`recordingService` のテストが通ったまま

- [x] **Step 23: 単体テスト（サービス）、整える**（BR9.5〜BR9.15、BR9.18、NFR7.44、NFR7.45）— `packages/backend/test/u8-swap/`:
  - `isOfferValid.test.ts`（5〜8 件）: (a)〜(e) の各条件を 1 つずつ崩したときだけ無効になること（`status` が `open` でない、`version` が違う、「未」でない、`childUserId` が `offererUserId` でない、日が昨日、月が確定）、今日の担当は有効、担当が見つからない（消えた）と無効
  - `listSwappableDuties.test.ts`（5〜8 件）: 並び順（同日の種類の順、`dutyId` の昇順の最終決め）、今日・明日の境（JST 0:00 の前後）、月またぎ、来月だけ確定、10 件を超える入力でも全件を返す
  - `offerSwap.test.ts`／`acceptSwap.test.ts`／`withdrawSwap.test.ts`（各 5〜8 件）: 判定の順番、2 回失敗で `INTERNAL`、読み取りの回数の上限（一覧: 月の Query 2＋種類 1。選ぶ・引き受ける: 担当の探索の `GetItem` 3＋申し出の `GetItem` 1＋種類の Query 1。書き込みは取引 1 回〈読み直しを含めても 2 回〉）、`fetch` が 0 回
  - `registerSwapHooks.test.ts`（5〜8 件）: 二重登録しない、`reassigned: false` のとき `onDutyReassigned` を登録しない、`closeOffer` が投げても保存の結果が変わらない、フックの `via` の値
  - `swapLogs.test.ts`（5〜8 件）: 一覧（候補あり・なし・確定済み）、申し出、引き受け、取り下げ、各理由の断り、読み直し、思いがけない失敗のそれぞれに、決まったイベントが **1 件ずつ**出て必要な項目が入っていること。作り物の目印（表示名・種類の名前・LINE の ID・単価）が全行に含まれないこと
  - この batch の確認コマンドを実行する

---

### Batch 6: LINE の受け口・返事・起動の枠（Step 24〜30）

*BR9.1〜BR9.4、BR9.6、BR9.7、BR9.14、BR9.16、BR9.17、NFR2.60〜NFR2.62、NFR4.74〜NFR4.80、NFR4.83〜NFR4.85、NFR7.39〜NFR7.42、NFR9.9 の実装*

- [x] **Step 24: 筋書きを書く（受け口の読み取りと送り元）**（AC7.1.1、AC1.2.5、BR9.1〜BR9.4、BR9.16、NFR4.74〜NFR4.77、NFR4.85）— `packages/backend/test/u8-swap/`:
  - `swap-line.feature` と `swap-line.steps.ts`（約 22 場面。署名つきの Webhook を `entries/line.ts` の `handler` に渡し、LINE の API は `fetch` の差し替え）:
    - 署名なし・書き換えた本文・秘密のヘッダーなしの「家事交代」と `swap.accept` が 401／403 で断られ、DynamoDB の読み書きも reply もないこと（NFR4.74）
    - **「家事交代」の完全一致**: 前後の半角・全角の空白、前後の改行を除いて一致したものだけが受け付けられる。「代わって」「かわって」「家事 交代」「家事交代して」「明日家事交代できる？」、前後に零幅の空白（U+200B）をはさんだもの、見た目だけ似た別の文字、`message.type` が text でないもの、5000 文字を超えるものは、返事も書き込みもなく、二度処理しない記録も書かれない（`LINE_EVENT_IGNORED` に `type` だけ。NFR4.75、AC7.1.1）
    - **postback の厳密な読み取り**: `swap.offer`／`swap.accept`／`swap.withdraw` の 3 つの形にちょうど一致するものだけを受け付ける。項目の重複・順序違い・エンコード違い・大文字の UUID・余分な項目・前後の空白・300 文字超・`replyToken` なし・1 対 1 から届いたものは、何もしない（NFR4.76）
    - 送り元: グループ → 処理、1 対 1 の「家事交代」→ 案内だけ（誰が送っても同じ文。利用者・家族・担当を読まない。`runGroupOperation` も通さない）、1 対 1 の `swap.*` → 何もしない、ルーム（`source.type=room`）→ 何もしない（BR9.4、BR9.16）
    - **AC1.2.5**: 登録されていないグループの「家事交代」と `swap.*` は、「このグループは家族のお知らせ先として登録されていません」と返事し、`Calendar` を読み書きしない。家族でない人・友だちでない人は決まった文（家族の情報を入れない）
    - 家族は、グループの登録から決める。ボタンの値（`dutyId`・`offerId`）やイベントから家族を決めない。ほかの家族の `dutyId`・`offerId` のボタンの貼り付けは、`NOT_FOUND` か `OFFER_GONE` で、ほかの家族のデータがあることを知らせない
    - 同じ `webhookEventId` の再送は二度処理されない（U1 の仕組みのまま）。`accepts` は二度処理しない記録を書く前に打ち切る
  - 型・ルートの仕組みは U1〜U6 のまま（`handlers` の表に `message`・`postback` の `accepts` を足す）

- [x] **Step 25: 筋書きを書く（返事・役割・失敗）**（AC7.1.1〜AC7.1.10、BR9.2〜BR9.4、BR9.6、BR9.7、BR9.14、BR9.17、NFR2.60〜NFR2.62、NFR4.78〜NFR4.80、NFR4.83、NFR4.84）— `packages/backend/test/u8-swap/`:
  - `swap-line-roles.feature` と steps（約 20 場面）:
    - 子供が「家事交代」→ 見出し＋ carousel（日付の近い順、10 件まで）＋（11 件以上のとき）案内の 3 通以内の 1 回の reply。ボタンの文字は「1/8 皿洗い」（名前が長いと `SWAP_CHORE_NAME_MAX` で切る）、ボタンの値は `swap.offer` の形。`altText` あり。金額・UUID が本文に出ない（AC7.1.1）。0 件は「この月は確定済みです」（AC7.1.2）または「申し出られる担当はありません」（AC7.1.3）で、ボタンなし
    - 担当を選ぶ → 「花子が 1月8日 の皿洗いを代わってくれる人を探しています」と「引き受ける」「申し出をやめる」の 2 ボタン（値は `swap.accept&dutyId&offerId`・`swap.withdraw&dutyId&offerId`。AC7.1.4）。表示名とお手伝いの名前は上限で切る。タグや改行を含む名前が文字として出る
    - 引き受ける → 「太郎が 1月8日 の皿洗いを引き受けました」（AC7.1.5）。先着でない人は「この申し出はもう引き受けられています」（AC7.1.6）。申し出た本人・管理者は「この申し出には応えられません」（AC7.1.7）。取り下げ後は「この申し出はもうありません」（AC7.1.8）。取り下げ → 「花子が 1月8日 の皿洗いの申し出をやめました」。二重の申し出は「この担当はもう申し出ています」（AC7.1.9）
    - 管理者の扱い（BR9.3）: 管理者が「家事交代」→「代わってもらう申し出は子供だけができます」（担当も申し出も読まない。`SWAP_GUIDE_SENT` の `reason=ADMIN`）、管理者が担当を選ぶ・申し出をやめる → `OFFER_OWNER_ONLY` の文、引き受ける → `CANNOT_ACCEPT_OWN_OFFER` の文。子供がほかの子供の担当を選ぶ・申し出をやめる → `OFFER_OWNER_ONLY`（何も変わらない）
    - 1 対 1 の案内は誰に対しても同じ文（`SWAP_GUIDE_SENT` の `reason=ONE_TO_ONE`）
    - 申し出がなくなる場面（AC7.1.10）: 管理者が担当の子供を変える／担当が「済」になる／月が確定される／日が過ぎる → その後の「引き受ける」が「この申し出はもうありません」になる（フックが動いた場合と、動かなかった場合の両方）
    - 返事は reply だけで、`/v2/bot/message/push`・`multicast`・`broadcast` と、プロフィール取得への通信が 0 回（NFR1.32）
  - `swap-line-resilience.feature` と steps（約 14 場面）:
    - 書き込みが成功したあとの reply の失敗（時間切れ・5xx）→ 書いた結果は残り、`LINE_REPLY_FAILED`（警告）を残して 200、イベントは処理済み（500 にしない。再送で二重に書かれない）
    - 取引が 2 回続けて断られる → `INTERNAL` →「うまく申し出られませんでした。もう一度お試しください」（引き受けは「うまく引き受けられませんでした。もう一度お試しください」）と reply して 200、処理済み。`SWAP_REJECTED`（`reason: INTERNAL`）が 1 件
    - 思いがけない例外（DynamoDB に接続できない、`ThrottlingError`）→ 処理中の記録を消して 500、reply トークンは使わない。LINE の再送で書き込みが二重にならない（`REQUEST_ERROR`）
    - 書き込みのあとに投げる処理を置かない: 名前の読み取りが失敗しても、返事は言い換え（「だれか」「お手伝い」）で出る
    - 「担当を選ぶ」の書き込みが成功したのに reply が失敗した場合（確認点 1 の既定 (1)）: 申し出は `open` で残り、同じ担当をもう一度選ぶと `ALREADY_OFFERED`（文だけ）になることを、**許容した残る危険の再現**として場面にする（(2) が選ばれたら、この場面の期待を「本人にだけボタン付き」に直す）
    - 1 回の Webhook に複数のイベント（「家事交代」と引き受け）が入っていても、各イベントが独立に処理される
    - 速さ（AC7.1.11、BR9.17）: 読み取りの呼び出しの回数が上限内で、時間のかかる読み取りを並行に走らせても待ち時間が足し算にならないこと（差し替えの遅延で確かめる）。**3 秒の計測そのものはここでは行わず、`docs/manual-check-u8.md` の確かめ 12・13 に引き継ぐ**

- [x] **Step 26: 作る（LINE の受け口と返事）**（BR9.1〜BR9.4、BR9.6、BR9.7、BR9.14、BR9.16、BR9.17、NFR4.74〜NFR4.80、NFR4.83、NFR4.84）— `packages/backend/src/`:
  - `handlers/line/swapCommand.ts`（新設・純粋な関数）: `parseSwapMessage(event)`（`message.type=text`、5000 文字以内、`trim` したあと「家事交代」と完全一致。`source.type` が group か user のときだけ）と `parseSwapPostback(event)`（`source.type=group`、`replyToken` あり、300 文字以内、生の文字列に対する正規表現 3 つ。`URLSearchParams` は使わない）。U3 の `groupCommand.ts` は変えない
  - `services/lineApiService.ts`（変更）: `buildSwapCarousel(choices)`（Flex の carousel。1 バブル 1 担当。ボタンの `label` は `SWAP_CHORE_NAME_MAX` で切った「M/D 名前」、`altText` あり、`height` は Step 1b で確かめた 44 ピクセル以上の値）、`buildSwapOfferMessage({ altText, text })`（buttons テンプレート。「引き受ける」「申し出をやめる」の 2 ボタン。または Step 1b の結果で Flex が扱いやすければ Flex。どちらでもボタンの値と文は同じ）、`swapOfferData`・`swapAcceptData`・`swapWithdrawData`（ボタンの値を作る関数。`parseSwapPostback` と対になる）。上限の数字は Step 9 の `LINE_LIMITS` から引く
  - `handlers/line/swapHandler.ts`（新設）: `handleSwap(event, now)`。1 対 1 の「家事交代」→ 案内だけ。グループ → `runGroupOperation(groupId, source.userId, (ctx, displayName) => …)` を通し、管理者／子供で分け、`listSwappableDuties`・`offerSwap`・`acceptSwap`・`withdrawSwap` を呼ぶ。結果の印を `functional-spec.md` の「結果の印と返事の対応」の表どおりに返事へ対応させる。返事の組み立ては純粋な関数（`buildListMessages`・`buildOfferMessages`・`buildAcceptMessages`・`buildWithdrawMessages`）。reply だけ `try/catch` して `LINE_REPLY_FAILED`。書き込みのあとに投げる処理を置かない。10 件への絞りと案内の追加はここ（BR9.6）。`SWAP_GUIDE_SENT` を出す
  - `handlers/line/messageHandler.ts`・`postbackHandler.ts`（変更）: `parseSwapMessage`／`parseSwapPostback` に当たるものを `handleSwap` に渡す（U6 の `parseRecordCommand` と U3 の `groupEvent` の判定と重ならない順に並べる）
  - `entries/line.ts`（変更）: `message` の `accepts` に `parseSwapMessage(event) !== null` を、`postback` の `accepts` に `parseSwapPostback(event) !== null` を足す（二度処理しない記録の前）。それ以外の動き・順番・`REQUEST_*` のログは変えない

- [x] **Step 27: 作る（起動の枠でのフックの登録）**（BR9.11、NFR2.58、NFR3.14、NFR8.16）— `packages/backend/src/entries/api.ts`、`entries/line.ts`（変更）:
  - `entries/api.ts`: 起動の枠（モジュールの初期化の位置は既存の形に合わせる）で `registerSwapHooks({ reassigned: true, recorded: true })` を 1 回呼ぶ
  - `entries/line.ts`: 起動の枠で `registerSwapHooks({ reassigned: false, recorded: true })` を 1 回呼ぶ（`line` に担当の子供を変える書き込みはなく、U8 の引き受けもフックを呼ばない）
  - 登録が既存のテスト（U1〜U7 が `entries/api.ts`・`entries/line.ts` を import するもの）の「フックが空」の前提を壊さないかを確かめる。壊す場合は、既存テストの期待でなく、登録を呼ぶ位置（`handler` の最初の 1 回など）か `resetSwapHooksForTest()` の呼び出しで合わせる
  - 登録が 1 回だけであること（`api` と `line` で別々）の筋書きを `swap-line.feature`・`swap-cleanup.feature` に含める

- [x] **Step 28: 通す（LINE の受け口の筋書き）**
  - Step 24・25 の筋書きが通るまで直す
  - U1〜U7 の LINE の受け口の筋書き（`line-routing`・`one-to-one-gate`・`record-*`）が通ったまま。U3 の「登録」の読み取りと U6 の `record.*` の読み取りに「家事交代」と `swap.*` が干渉しないこと

- [x] **Step 29: 単体テスト（受け口・返事の組み立て）**（BR9.1、BR9.6、BR9.7、BR9.14、BR9.16、NFR4.75、NFR4.76）— `packages/backend/test/u8-swap/`:
  - `swapCommand.test.ts`（各 5〜8 件）: `parseSwapMessage` の受け付ける・受け付けない例（BR9.1 の表）、`parseSwapPostback` の 3 つの形と外れる例（重複・順序・エンコード・大文字・余分・300 文字超・1 対 1・`replyToken` なし）、`swap.*` の最長の `data` が 300 文字以内
  - `buildSwapMessages.test.ts`（各 5〜8 件）: carousel のバブルの数が 10 件以下、11 件のとき案内が添えられ通数が 3 以内、ボタンの `label` が `FLEX_BUTTON_LABEL_MAX` 以下、`altText` が上限以下、知らせの本文が上限以下、`data` が 300 文字以内、結果の印ごとの返事の文が機能設計の表のとおり
  - `swapHandler.test.ts`（5〜8 件）: 管理者・子供・1 対 1 の分岐、`runGroupOperation` を通ること、reply 失敗の握りつぶし、push 系の API を呼ばないこと

- [x] **Step 30: 整える（アクセシビリティとコントラスト）**（NFR9.9）
  - Step 1b で LINE の標準の配色が 4.5:1 に届かない、または資料で確かめられなかった場合のみ、ボタンの色を独自に指定し（`color`／`backgroundColor`）、色の差を計算する単体テスト（`swapColors.test.ts`、5 件）で 4.5:1 以上を確かめる。ボタンの高さは Step 1b で確かめた 44 ピクセル以上の値にする。満たす場合は、確かめた結果（値と出典）を `docs/contract-changes-u8.md` に書くだけにする
  - ステージングでは目で見て確かめる（`docs/manual-check-u8.md` の確かめ 1・2）
  - この batch の確認コマンドを実行する

---

### Batch 7: インフラのテストと書類（Step 31〜33）

*BR9.19、NFR1.33、NFR3.16、NFR4.81、NFR4.82、NFR6.9、NFR10.9、NFR10.10 の実装（前後で同じことを固定）*

- [x] **Step 31: スタックのテストを書いて通す（前後で同じことを固定）**（NFR4.81、NFR4.82、NFR1.33、NFR3.16、NFR6.9）— `infrastructure/test/u8-swap/stacks.test.ts`（新設、U7 の同ファイルと同じ作り、約 16 件）:
  - `infrastructure/lib/app-stack.ts`・`data-stack.ts`・`app.ts` は**変えない**。既存のままテストが通ることを確かめる（通らなければテストの期待を直す。インフラ定義は変えない）
  - `line` の `Calendar` への許可が `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem` の 4 つのまま（U6 の範囲。U8 で追加なし）、`ChoreTypes` への許可が `GetItem`・`Query`・`ConditionCheckItem` のまま
  - `api` の `Calendar` への許可が 6 操作、`ChoreTypes` が 6 操作のまま
  - `line` に足さないものが 1 つもない（`Calendar` の `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、`ChoreTypes` への書き込み、`Resource: "*"` の DynamoDB の文）
  - `line` と `api` の環境変数が U8 の前後で変わらない（追加なし。秘密を入れない）
  - 新しい IAM の文が足されていない（`addToRolePolicy` の文の数が U7 と同じ）
  - テーブル・索引・Lambda・ロググループ・メトリクスフィルター・アラームの数が U8 の前後で同じ（NFR1.33）。`Calendar` に TTL と新しい索引がない
  - `line` の同時実行の上限が U1 のまま（NFR3.16）、`api` と `line` のメモリ・タイムアウト・アーキテクチャが U1 のまま（256 MB・30 秒・ARM64）
  - `Calendar` が本番で `RETAIN`（NFR6.9）、ステージングの `line` が本番のテーブルの ARN を含まない（NFR10.9）
  - `npx vitest run infrastructure/test/u8-swap/stacks.test.ts` が通ること。既存の CDK のテスト（`u4-chore-types`・`u5-assignment-calendar` の `it.skip` を含む）は触らない

- [x] **Step 32: 書類（契約の変更・手での確かめ・README）**（NFR8.15、NFR10.9、NFR10.10、NFR7.39〜NFR7.48）:
  - `docs/contract-changes-u8.md`（Step 1 で新設した冒頭の節に足して完成させる。U7 の `contract-changes-u7.md` の形式に揃える）: 「上流の文書の更新」（Step 1a）、「LINE の上限の確認結果」（Step 1b。コントラストと高さを含む）、`functional-spec.md` の「契約への追加」の表（C3 の postback と message、C8 の 4 つの窓口の形、C6 `runGroupOperation` の第 2 引数、C10 の `OFFER_OWNER_ONLY` と文言、`reasons.ts`・`messages.ts`・`messages.test.ts` の更新、データ〈`SWAP#<dutyId>`、`Calendar`〉）、`notifyDutyReassigned` の並行数（`DUTY_HOOK_CONCURRENCY=4`、範囲 2〜5。型は変えない）、`GROUP_COMMAND_REJECTED` から `groupId` を外した変更と直した U3 のテスト（確認点 2）、「許容した残る危険」（確認点 1 の既定 (1)。(2) が選ばれたらその変更）。壊す変更がないこと
  - `docs/manual-check-u8.md`（新設）: `cicd-pipeline.md` の「ステージングでの手での確かめ」の **14 件**を、手順書の形（準備: ステージング用の公式アカウントと作り手だけのグループ、子供の役割のテスト用の利用者 2 人以上、管理者。データはアプリの操作で作り直接書き換えない／確かめ 1〜14 の「操作」「期待」「見るログ」〈`monitoring-design.md` の問い合わせの番号〉「結果を書く欄」／速さの測り方〈NFR7.39〜NFR7.42。コールドスタートを含めて 20 回ずつ、冷たい起動 10 回以上、`REPORT` の `Init Duration` の読み方、画面録画から読み取る、除外しない、理由つきの返事は各 3 回〉／確定とフックの測り方〈NFR7.46。作り直し有り／無しを分けて記録、`WriteThrottleEvents`・`ThrottledRequests` が 0〉）にする。本物の ID・トークンを書かない（例は `<作り物の値>`）
  - `README.md`（変更）: U8 の節を足す（「家事交代」の使い方、1 対 1 と管理者の案内、手での確かめ `docs/manual-check-u8.md` への案内）。スモークチェックの記述は**全 23 件のまま**で、「U8 の動作はスモークチェックでは確かめず、手での確かめで行う」を書く。「テストの動かし方」に `npx vitest run u8-swap` を足す。フックの並行数の変え方と測り直し（NFR7.46）を書く

- [x] **Step 33: 費用と秘密の確かめ**（NFR1.32、NFR1.34、NFR5.14、NFR5.15）
  - U8 のコードに `push`・`multicast`・`broadcast`・プロフィール取得（`/v2/bot/profile`）の呼び出しがないことを、テスト（Step 25 の `fetch` の見張り）で確かめ済みであることを `code-summary.md` に書く
  - 秘密の確かめ: U8 で足したファイル・文書・テストに本物の鍵・トークン・ID がなく、作り物の値は `fakeSecrets.ts` だけにあり、文書は `<作り物の値>` と書いていること。gitleaks（`.gitleaks.toml`）の設定を変えない
  - DynamoDB の追加費用の見積もり（月に 1 円に満たない）の根拠は `scalability-design.md` の見積もりのまま。料金の単価を公式の料金表で確かめて数を `docs/contract-changes-u8.md` に残す（確かめられなければ「未確認」と書く）

---

### Batch 8: 追跡・まとめ・全体の確認（Step 34〜37）

- [x] **Step 34: traceability.json**（AC7.1.1〜AC7.1.11、AC1.2.5、BR9.1〜BR9.19、NFR）
  - `traceability.json`（`code-generation-plan.md` の隣に新設）: 受け入れ条件（AC7.1.1〜AC7.1.11、AC1.2.5）、BR9.1〜BR9.19、割り当てられた NFR（NFR1.32〜NFR1.34、NFR2.54〜NFR2.66、NFR3.14〜NFR3.16、NFR4.74〜NFR4.85、NFR5.14〜NFR5.15、NFR6.9、NFR7.39〜NFR7.49、NFR8.14〜NFR8.16、NFR9.9、NFR10.9〜NFR10.10、NFR11.8〜NFR11.9。ID は各 `nfr-requirements` の表のとおり）を、実装・テストのファイルと対応させる。各 `OK` の target は実在するファイル 1 つ。AC7.1.11 は「設計まで。計測はステージング」として `docs/manual-check-u8.md` を target にし、その旨を注記する

- [x] **Step 35: source-manifest.json**
  - `source-manifest.json`（`code-generation-plan.md` の隣に新設）: U8 が作る・変えるすべてのアプリケーションソースのパスを列挙する（`packages/shared/src/reasons.ts`・`messages.ts`、`packages/backend/src/**` の上の一覧、`packages/backend/test/u8-swap/`・`packages/shared/test/u8-swap/`・`infrastructure/test/u8-swap/`・`packages/backend/test/fixtures/fakeSecrets.ts`・`fakeDynamo.ts`〈変えたとき〉・U3 のテスト〈変えたとき〉、`docs/contract-changes-u8.md`、`docs/manual-check-u8.md`、`README.md`、Step 1a の上流の文書 5 つ）。`infrastructure/lib/`、`scripts/smoke-check.sh`、`packages/frontend/` は含めない（変えないため）

- [x] **Step 36: code-summary.md**
  - `code-summary.md`（`code-generation-plan.md` の隣に新設）: 作った・変えたファイル、主な実装の決め（確認点 1・2 の承認の結果、Step 1b で確かめた LINE の上限と `SWAP_CHORE_NAME_MAX` の計算結果、知らせの形〈Flex か buttons テンプレート〉、`registerSwapHooks` を呼ぶ位置）、テストの件数とカバレッジ、**書いたが実行しなかったテストとその理由**（ステージングの手での確かめ 14 件と速さの計測は `docs/manual-check-u8.md` に引き継ぎ。実行していない）、計画からのずれ。Step 5 の権限の確認結果を書く

- [x] **Step 37: 全体の確認コマンドを実行する**（U1〜U8 のすべてのテストが通ること、型チェックが通ること、カバレッジ 80% 以上）:
  ```bash
  npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
  ```
  - U8 だけのコマンド（上）でも、`packages/*/src/**` と `infrastructure/lib/**` のカバレッジが出ること。下限（`thresholds.lines: 80`）は変えない

## Sources

- `construction/u8-swap/functional-design/functional-spec.md`、`rules.md`（BR9.1〜BR9.19）、`entities.md`、`functional-design-questions.md`（Q1〜Q5）
- `construction/u8-swap/nfr-requirements/`（`security-requirements.md`〈NFR4.74〜NFR4.85〉、`reliability-requirements.md`〈NFR2.54〜NFR2.62〉、`performance-requirements.md`〈NFR7.39〜NFR7.49〉、`observability-requirements.md`〈NFR2.63〜NFR2.66〉、`scalability-requirements.md`〈NFR3.14〜NFR3.16〉、`tech-stack-decisions.md`〈NFR8.14〜NFR8.16、NFR9.9、NFR10.9〜NFR10.10〉）
- `construction/u8-swap/nfr-design/`（`logical-components.md`〈ファイルの分け方〉、`observability-design.md`〈SWAP_* のログ、`GROUP_COMMAND_REJECTED` の変更〉、`reliability-design.md`〈判定の順、読み直し、残る危険〉、`performance-design.md`〈並行数、`mapWithConcurrency`〉、`security-design.md`、`scalability-design.md`）
- `construction/u8-swap/infrastructure-design/`（`infrastructure-specification.md`〈追加なし〉、`cicd-pipeline.md`〈CDK のテスト、14 件の手での確かめ、スモークチェックは 23 件のまま〉、`monitoring-design.md`）
- `inception/contract-design/contract-summary.md`（C3、C6、C8、C10）、`inception/requirements-analysis/requirements.md`（FR7.1〜FR7.5、NFR）、`inception/user-stories/stories.md`（US7.1、AC7.1.1〜AC7.1.11、AC1.2.5）、`inception/refined-mockups/mockups.md`（T2）、`inception/domain-design/components.md`
- `construction/u7-review-confirm/code-generation/code-generation-plan.md`、`unit-test-instructions.md`（形式の手本）、`docs/contract-changes-u5.md`〜`u7.md`
- `.kiro/aidlc-common/stages/construction/code-generation.md`（計画に必要な節）
- `aidlc/spaces/default/memory/team.md`（Testing Posture、Deployment、Code Style）、`aidlc engine testing-posture render` の出力（Testing Contract）
- 既存コード（読んだもの）: `entries/line.ts`、`services/groupCommandGate.ts`、`services/dutyReassignedHook.ts`、`services/dutyRecordedHook.ts`、`services/lineApiService.ts`、`handlers/line/{messageHandler,postbackHandler,groupEventHandler,recordHandler}.ts`、`repositories/calendarRepository.ts`（関数の一覧）、`scripts/smoke-check.sh`、`packages/backend/test/{u3-notification-group,u6-recording,u7-review-confirm}/`、`packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts`（対応している条件式の一覧）

## Assumptions & Open Questions

- [assumption] 承認の確認点 1 は既定を (1)（許容）にしました。`rules.md` の BR9.7 の 5. と `functional-spec.md` の表が `ALREADY_OFFERED` を「文だけ」と定めていて、(2)（ボタンを添える）は機能設計の変更になるためです。(2) が選ばれたら、`rules.md`・`reliability-design.md`・`functional-spec.md` に書き戻したうえで、上の「(2) が選ばれたときの追加」を Batch 6 に足します
- [assumption] 承認の確認点 2 は既定を「外す」にしました（設計どおり）。U3 のテストが `groupId` の値を期待していないことは `grep` で確かめたのみで、Step 12 で全文を読んで確定します
- [assumption] LINE の上限（ボタンの文字・高さ・コントラストを含む）は、この計画を書いた時点では公式資料で**確かめていません**。Step 1b で確かめます。記憶ではボタンの文字は 20 文字で、機能設計の 26 文字と食い違う可能性があります。そのため文字数は定数を計算で出す形にし（Step 1b、Step 9）、資料が読めなければより厳しい側の値を使って人へ報告します
- [assumption] 知らせの形（Flex か buttons テンプレートか）は、Step 1b の結果を見て Step 26 で選びます。どちらでもボタンの値と文は変わりません
- [assumption] `registerSwapHooks` を呼ぶ位置は、`entries/api.ts`・`entries/line.ts` の既存の形に合わせて Step 27 で決めます。U1〜U7 のテストが「フックが空」を前提にしている場合は、位置か `resetSwapHooksForTest()` で合わせ、既存の期待は変えません
- [assumption] フックの段階 2（締め切り 1,200 ミリ秒、`DUTY_HOOKS_TRUNCATED`）と段階 3（月単位のイベント）は入れません。測定（`docs/manual-check-u8.md` の確かめ 13）の結果で人が判断します（`performance-design.md`）
- [assumption] AC7.1.11（20 回中 19 回、3 秒以内）と NFR7.46 の測定は、コード生成のテストでは行いません（設計まで）。呼び出しの回数の上限と並行の読み取りを単体テストで確かめ、計測はステージングの手での確かめに引き継ぎます
- [assumption] 費用は、DynamoDB の追加が月に 1 円に満たない見込みです（`scalability-design.md`。未確認の見積もり）。Step 33 で料金の単価を確かめます
- [assumption] テストの量は Standard（部品ごとに 5〜8 件＋主要な境界の結合テスト〈筋書き〉）に、スコープ `mvp` の 80% の行カバレッジを足したものです。`unit-test-instructions.md` に表で書きます
- 未決の問い: なし（承認の確認点 1・2 は、既定の答えを置いたうえで承認の場で人が決めます）
