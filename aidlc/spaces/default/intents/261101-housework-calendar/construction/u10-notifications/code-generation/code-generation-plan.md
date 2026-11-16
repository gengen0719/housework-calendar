# コード生成の計画 — U10 お知らせ

## Summary

- Builds: 毎日16時の担当一覧、月末21時のお小遣いまとめ、同じ内容とキーによる期限内再試行、二重送信防止、メール監視、本文の清掃とバックアップ。配備は実行せず、有効化は設定・購読・実機確認の後。
- Touches: packages/backend（通知入口・サービス・保存・既存の家族とカレンダーの読み取り窓口・エラー通知）、packages/shared（通知型）、infrastructure/lib（通知Lambda・2テーブル・SQS・Scheduler・SNS・監視・予算）、テスト、配備設定の受け渡し、運用文書。
- Tests: BDDの筋書きを先に書き、部品ごと5〜8件と主要境界の結合テスト、CDK構成検査を追加。目安150〜220件。既存全体の行カバレッジ80%以上と回帰成功を維持。

## 前提と範囲

- US9.1のAC9.1.1〜AC9.1.10と、共有AC1.2.4を対象とする。BR11.1〜BR11.12、U10の詳細NFR29件を守る。
- 予定時刻から15分未満だけ再試行、対象の子供0人の月末は送らない、障害通知はメール、2025年7月15日より前のAWSアカウント、費用の上限目標はstagingとproductionの合計で月100円。
- 現在の条件付き概算は約56円。無料枠の残り・実際の要求数・為替・税を配備前に確認し、100円を超える構成を自動で反映しない。予算通知は請求を強制停止しない。
- 新しい画面は作らない。既存のapiとlineの返事・認証・記録の意味を変えない。通知入口に公開URLを作らない。
- 設計レビューの残項目を実装で扱う: 更新のversionを定義、共有AC1.2.4のテストと追跡を追加、既知失敗時の所有権解放と早期再配達を明示、バックアップARNの台帳と一覧による照合を用意する。
- `.gitignore`、`AGENTS.md`、インストール済みの`.agents/`・`.codex/`は変更しない。`.codex/`のlint除外という利用者の指定を維持する。
- 実際のメールアドレス・鍵・LINEやAWSの識別値を文書やテストへ置かない。作り物の秘密・識別値は各パッケージのtest/fixtures/fakeSecrets.tsに置き、行ごとのgitleaks:allow規約を守る。

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

## 検証コマンド

単位の最初の実行環境確認だけは、まだテストがないことを明示して次を使う。

`npx vitest run u10-notifications --passWithNoTests`

筋書きを書いた後は、空のテストを成功と扱わない。

`npx vitest run u10-notifications`

単位のカバレッジ:

`npx vitest run u10-notifications --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'`

全体の確認（Step 1と27）:

`npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test`

## 手順

各切れ目は筋書き→必要な層を実装→筋書きを通す→整理と単体テストの順。新しいモデル・保存・業務・入口・運用・配備を含め、層ごとのテスト後回しでBDDを置き換えない。画面の新設は非該当。

- [x] **Step 1: 既存状態の確認** — 全体の確認コマンドを変更前に実行し、既存の差分と失敗を記録する。U9までのテストの期待を根拠なく変更しない。現行のservices/lineApiService.ts・familyMemberService.ts・calendarService.tsとrepositoriesの窓口を確認する。（US9.1、NFR8.101）
- [x] **Step 2: テスト実行環境と構成を確認** — 既存Vitestのbackend/shared/infrastructureのincludeと80%の設定を確認。U10のファイルをtest/u10-notificationsへ置く。既存設定で動けばvitest.config.tsを変更しない。時刻・SQS・SNS・CloudWatch・DynamoDB・LINEの偽の境界を用意し、単位の準備コマンドを実行する。（NFR8.101）
- [x] **Step 3: 固定した依存を追加** — `npm install --workspace @housework/backend --save-exact @aws-sdk/client-sqs@3.1161.0 @aws-sdk/client-sns@3.1161.0 @aws-sdk/client-cloudwatch@3.1161.0`を実行。backend/package.jsonとpackage-lock.jsonだけを必要に応じ更新する。バージョンの公開は計画作成時に確認済み。他の依存を勝手に更新しない。（NFR5.101、NFR8.101）

### 切れ目1: 入力・日本時間・通知の識別

- [x] **Step 4: 筋書きを先に書く** — backend/test/u10-notifications/notification-time.featureと.steps.tsに、16時・月末21時・非月末・時刻前・15分後ちょうど・年越し・うるう日・不正入力を記述する。（BR11.1、AC9.1.1、AC9.1.5、NFR11.101）
- [x] **Step 5: 入力と型を実装** — shared/src/notification-types.tsとindex.ts、backendのmodels.ts、services/notificationTime.ts・notificationIdentity.tsを追加。C5は変更せず、Schedulerのscheduled-timeから対象日を作るアダプターを入口内に置く。通知と内部のwatchdog/cleanup/backupを分離する。同じ環境・家族・種類・対象日から同じUUIDの再試行キーを作る。運用識別子のHMACとは別にする。
- [x] **Step 6: 通して整理する** — 筋書きとnotificationTime.test.ts・notificationIdentity.test.ts・sharedの通知型テストを各5〜8件。異なる家族・環境のキーが混ざらないことも検証する。

### 切れ目2: 記録・所有権・本文保持

- [x] **Step 7: 保存の筋書きを先に書く** — notification-state.featureに一意作成、並行取得、版違い、受理後保存失敗、所有期限、本文の期限、古い起動と記録なしを記述する。（BR11.6〜BR11.8、NFR2.102〜NFR2.106、NFR5.102）
- [x] **Step 8: 保存を実装** — repositories/notificationRepository.ts・notificationPayloadRepository.tsと必要な型を追加。メタデータと本文/宛先を分離し、外部送信前の固定を原子的に保存する。versionは作成0・更新ごと増加、所有者・版・状態を条件に更新。既知失敗は所有権を解放してnextAttemptAtを保存。本文は終端で削除、24時間以後は読取拒否。メタデータ35日、本文の清掃対象を日別Queryで取得する。
- [x] **Step 9: 通して整理する** — 保存部品ごと5〜8件と筋書き。条件競合・ページ継続・保存失敗で外部送信が0回であることを検証する。

### 切れ目3: 家族と担当の読み取り

- [x] **Step 10: 境界の筋書きを先に書く** — notification-family.featureに複数家族、登録先なし、確定、担当なし、ページ継続、名前の不明、読込失敗を記述する。（AC1.2.4、AC9.1.2、AC9.1.4、NFR4.102）
- [x] **Step 11: 持ち主の窓口を拡張** — familyRepository.ts・familyMemberService.tsに内部のlistNotificationFamiliesを追加（Familiesの限定Scan、ページ100件、必要な投影）。calendarService.tsにC8のlistDutiesOnをFamilyScopeで追加。必要な既存repositoryだけを拡張し、書込のFamilyContextとsystemの分離を維持。通知から他部品のテーブルを直接読まない。
- [x] **Step 12: 通して整理する** — 各窓口5〜8件。既存の家族・カレンダーテストも通ることを確認。別家族の混入、権限の昇格、全件取得の打ち切りを防ぐ。

### 切れ目4: 本文とLINE受理

- [x] **Step 13: 配信の筋書きを先に書く** — notification-content.featureとnotification-push.featureに全担当の状態、0円、負額、対象の子供0人、U9の計算、本文上限、同じキーの再受理、一般の409、429・5xx・認証失敗・時間切れを記述する。（AC9.1.1、AC9.1.5、AC9.1.6、AC9.1.7、AC9.1.9、BR11.3〜BR11.5）
- [x] **Step 14: 本文と配信窓口を実装** — services/notificationMessages.tsとnotificationPushService.tsを追加し、既存lineApiServiceの型と認証情報を再利用。必要な追加だけ同ファイルへ行う。C9 getAllowancesから額を読み、未だけに絞らない担当一覧を作る。名前の改行・制御文字を整え、上限超過で黙って行を省かない。5秒timeout、同じretry-key、409と受理済みIDの検証、HTTP/接続失敗の分類を実装する。
- [x] **Step 15: 通して整理する** — 本文と配信部品ごと5〜8件。通常のreplyの動きを維持し、成功・異常のログに名前/額/本文/秘密が出ないことを検証。

### 切れ目5: 全体の送信とキュー再配達

- [x] **Step 16: オーケストレーションの筋書きを先に書く** — notification-dispatch.featureにS1〜S17、重複起動、家族ごとの失敗、受理直後中断、宛先変更、5秒/20秒後の再試行と所有期限45秒、期限切れを記述する。（AC9.1.1〜AC9.1.10、BR11.1〜BR11.12）
- [x] **Step 17: 調整と入口を実装** — services/notificationService.ts・notificationQueueService.ts、entries/notify.tsを追加。RUNの列挙完了と家族の終端を重複なく集計。SQSはバッチ1・部分失敗応答。所有中/早期配達を成功として消さず可視性を延長。既知失敗は所有権を解放。最大3配信試行、5秒/20秒とばらつき、待機指示、期限前5秒の残り確認。C6の内部列挙からsystem文脈を作る。
- [x] **Step 18: 通して整理する** — 調整・キュー・入口ごと5〜8件。送信先をまたぐ再配信0回、期限後の送信0回、同じ通知の受理1回を、実際に状態を保持する偽の保存先で確認する。

### 切れ目6: メール監視・清掃・バックアップ

- [x] **Step 19: 運用の筋書きを先に書く** — notification-operations.featureに3入口の失敗、初回配信失敗、起動欠落、0家族、清掃・バックアップ失敗、購読未確認を記述する。（NFR2.101、NFR2.107〜NFR2.109、NFR4.104〜NFR4.105、NFR6.102）
- [x] **Step 20: 運用部品を実装** — services/operationalAlertService.ts・notificationMaintenanceService.tsを追加。api.ts・line.tsに定型の500等の通知を足し返事を変えない。毎分のRUNとキュー滞留検査からNotifyHealthを送る。本文を毎時清掃。CreateBackupで返るARNをメタデータ台帳へ記録し、7日超を削除する。作成応答不明・台帳保存失敗も扱うため、ListBackupsへ自テーブル名を必ず指定し、返るテーブルARNとバックアップ名を検証して照合する。Delete/Describeの権限は自テーブルのバックアップARNだけ。資源指定をサポートしないListBackupsだけResource:*の根拠を文書とテストに残す。
- [x] **Step 21: 通して整理する** — 運用部品ごと5〜8件。SNS/CloudWatchはモック、メール本文の許可項目、清掃の時間境界、バックアップ台帳の喪失、他テーブルのバックアップを削除しないこと、watchdog自身の失敗を検証。ネットワークで実際に送らない。

### 切れ目7: 配備構成

- [x] **Step 22: CDK検査を先に書く** — infrastructure/test/u10-notifications/stacks.test.tsと必要なfixtureを用意。通知URLなし、各環境2テーブル・Work/DLQ・Scheduler・SNS・標準アラーム5個、IAM、暗号化、保持、可視性180秒、並行2、30秒timeout、環境分離、無効状態からの有効化を約25〜35件で検証する。（NFR1.102、NFR3.101、NFR4.101、NFR10.101）
- [x] **Step 23: CDKを実装** — infrastructure/lib/data-stack.ts・app-stack.ts・app.ts・account-stack.tsを拡張し、必要ならnotification-construct.tsへ分離。notify追加、必要なARNだけの権限、ListBackupsとPutMetricDataの説明付き例外、秘密の環境別SSM、標準アラーム合計10個、予算0.50USD通知を作る。通常は通知の定時起動/SQS連携を無効にし、有効化にはメール設定等を必須にする。バックアップ台帳も通知メタデータの表へ置く。
- [x] **Step 24: 構成を通して整理する** — U10の構成テストと既存の構成テストを実行。新しい資源数・明示的な権限追加で意図して変わる期待値だけ理由付きで更新し、暗号化/既存API/LINEの制約を弱めない。実AWSへdeployしない。

### 完成と引き継ぎ

- [x] **Step 25: 配備設定と検査をつなぐ** — .github/workflows/ci.ymlの既存全体検査がU10を含むことを確認。deploy-staging.yml・deploy-production.ymlに非秘密の通知有効フラグとメール設定の受け渡しだけ必要に応じ追加。OIDCと本番承認を維持。秘密の値を表示しない。packageのテスト・ビルド設定を必要な範囲だけ更新し、既存のsecrets:scanを実行する。未導入ツールを勝手にインストールせず未実施として記録する。
- [x] **Step 26: 運用文書と費用を完成** — docs/contract-changes-u10.md、docs/manual-check-u10.md、docs/notification-runbook.mdとREADMEの運用節を追加/更新。共有AC1.2.4、15分以内の実メール、再送0回、清掃と復旧、有効化/停止、台帳、月100円の税込み合算見積もりと実測方法を記載。scripts/smoke-check.shへ秘密なしの構成確認を必要な場合だけ足す。実機確認を実行済みとしない。
- [x] **Step 27: 最終確認と証跡** — 全体の確認コマンド、U10指定のカバレッジ、git diff --checkを実行。code-summary.mdへ結果・未実行・逸脱を記録。sensor-traceabilityでtraceability.jsonを作り全AC/BR/詳細NFRを実装またはテストの実在パスへ対応。source-manifest.jsonへこの単位の全ての変更パス（依存・構成・既存テスト・文書も）を記録し、レビューへ渡す。すべて成功するまで完了のチェックを付けない。

## Sources

- この単位のfunctional-design、nfr-requirements、nfr-design、infrastructure-designの全成果物と回答。
- inception/units-generation/unit-of-work.md、unit-of-work-story-map.md、user-stories/stories.md（US9.1）、domain-design/components.md、contract-design/contract-summary.md、requirements-analysis/requirements.md。
- [DynamoDBの権限表](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html)（ListBackupsの資源指定なし、2026-11-15確認）。
- 各設計のreview-01.mdの軽微な指摘を上記の明示した手順へ引き継ぐ。

## Assumptions & Open Questions

- 新たに人が決める質問なし。費用・実メール・実配信の実測は配備前の確認事項として残す。実際の設定値をこの計画から推測しない。
