# U11 加算・減額の実装計画

## Summary

- Builds: 管理者による加算・減額の登録・削除、100文字の理由、お小遣いと月末まとめへの反映、合計を表示できない月の訂正。
- Touches: shared/backend/frontendの既存コードとU11追加ファイル、CDK、バックアップ起動設定、配備設定、U11用の説明書。
- Tests: 100件以上を目安にBDD・単体・API/画面/通知/保存の結合・CDKを検証し、既存回帰と行カバレッジ80%以上を維持。

## Scope and Decisions

US8.2（AC8.2.1〜AC8.2.7）、共通AC1.1.12、BR12.1〜BR12.8、詳細NFR20件を実装します。金額の業務上限は追加せず、入力は正のsafe integer、理由はNFC正規化・前後空白除去後1〜100コードポイントです。確定月の変更を取引内で防ぎます。訂正は削除と入れ直しです。

機能設計の抽象的な失敗名はNFR設計で具体化済みです。INVALID_INPUTは使わず既存INVALID_REQUEST・INVALID_MONTH、キー再利用は既存422 IDEMPOTENCY_KEY_REUSEDを使います。追加理由はINVALID_REASON・ALLOWANCE_OUT_OF_RANGEです。通常の内訳の戻り形は維持し、合計と独立した管理者用GET一覧を追加します。

インフラ設計R-01をこの計画で解消します。バックアップを外向き通知の有効設定から分離し、通知false・バックアップtrueでも起動と処理が通るようにします。`backupsEnabled`/`BACKUPS_ENABLED`を追加し、未指定は従来のnotificationsEnabledを継承します。新規導入時の既定は通知もバックアップも無効。U11を運用する前にバックアップだけを明示的に有効にし、メール購読・動作確認・二環境合算予算確認を必須にします。バックアップのためにLINE送信を有効化しません。この前提を手動確認書と配備設定に書き、未確認の本番運用を完了扱いにしません。

## Implementation Steps

- [x] Step 1 — テスト準備: 既存Vitest構成・BDD読込・4プロジェクトを確認し、`unit-test-instructions.md`のU11専用コマンドを実行可能にする。新しいライブラリは導入しない。既存設定・80%閾値を変更しない。最初のシナリオ実行が構文や設定で止まらないことを確認する。（NFR8.201）
- [x] Step 2 — 登録のBDDを先行: `packages/backend/test/u11-adjustments/adjustments.feature`と対応stepsに、正常な加算/減額・理由/金額境界・子供/他家族拒否・確定・応答喪失・同一キー並行・キー再利用を記述し実行する。実装前の結果を残す。（AC8.2.1〜AC8.2.5、BR12.1〜BR12.4・BR12.7）
- [x] Step 3 — 登録スライス: sharedの型・理由・文言・検証、backendのmodels・adjustmentRepository・adjustmentService・登録handler・既存APIルートを実装する。実体/索引/結果/月条件/子供条件を同じ取引で保存し、C6/C8の限定公開条件窓口を既存サービスへ追加する。既存requestRecordRepositoryの24hとtarget照合を再利用する。（US8.2、NFR4.201・NFR6.202・NFR6.203）
- [x] Step 4 — 登録画面: `packages/frontend/src/pages/AdjustmentPage.tsx`、API client・型・既存App/S5の経路を追加する。子供・kind・正金額・必須理由、欄別エラー、入力保持、操作キー保持、二重押下と結果不明の扱いを実装する。data-testidと読み上げを付ける。（AC8.2.1〜AC8.2.4、BR12.8、NFR9.201）
- [x] Step 5 — 登録のGreenと整理: sharedの検証、repository取引、service、handler、登録画面に各5〜8件以上の意味ある単体/結合試験を足し、Step 2のシナリオを通す。成功後の表示失敗で再登録を促さないことを確認し、Greenのまま整理する。（US8.2）
- [x] Step 6 — 削除と独立一覧のBDDを先行: 同feature/stepsとfrontendのU11シナリオに、確認取消・削除・確定競合・二重削除・合計範囲外でも一覧から訂正できる筋書きを先に書き実行する。（AC8.2.5、NFR6.201、BR12.6）
- [x] Step 7 — 削除/一覧スライス: repositoryの全ページQueryとID索引読取・取引削除、管理者用`GET /months/{month}/adjustments`と`DELETE /adjustments/{id}`を追加する。過去の子供・不明名でも行を残す。S5エラー時にも独立一覧への入口を残し、確認小窓・再取得・フォーカス復帰を実装する。（US8.2、NFR6.201・NFR4.201）
- [x] Step 8 — 削除/一覧のGreenと整理: API・repository・service・一覧/確認UIで5〜8件以上ずつ検証し、全ページ取得、他家族ID、集計を呼ばないこと、再送による非復活、古い画面の確定拒否を含めてStep 6を通す。（BR12.4・BR12.6〜BR12.8）
- [x] Step 9 — 集計と通知のBDDを先行: 800+600-200=1200、100-300=-200、調整だけの子供、過去の子供、正負相殺の順序違い、安全範囲外の小計/合計と訂正復帰、通知の同額と再送本文固定を先に定義する。（AC8.2.6・AC8.2.7、NFR6.201）
- [x] Step 10 — C9結合: 既存allowanceServiceを変更し、調整だけを持つ過去の子供を含む集合を作る。BigIntで中間計算し、返す小計と最終合計だけsafe integerを確認する。API/通知の両方で本番の調整差込口を既定接続する。月範囲・確定表示・既存符号付き内訳を維持する。（BR12.5、NFR11.201）
- [x] Step 11 — 集計のGreenと整理: C9純粋計算・API・画面・通知組立の回帰をU11の試験へ追加し、Step 9を通す。上限額2件でも独立一覧・削除が動くこと、範囲内の正負相殺は失敗しないことを検証する。1000件と複数ページも含める。（US8.2、NFR7.202・NFR7.203）
- [x] Step 12 — 運用スライスのBDDを先行: 通知false/backup trueの起動、通知/SQSの拒否、バックアップの表とprefix照合、保存期限、作成結果不明、失敗メール呼出し、秘密を含まないログの筋書きを実装前に定義する。（インフラR-01、NFR2.201・NFR2.202・NFR5.201・NFR5.202）
- [x] Step 13 — 維持管理の独立化と安全ログ: notify入口とnotification-constructのbackupだけを外向き通知とは別に有効化できるようにする。既存maintenance serviceを限定された表設定で拡張し、調整バックアップを毎日/7日保存へ追加、台帳とListBackupsで照合する。旧通知用処理を壊さず、対象表ごとの失敗を分離する。C9の生familyIdログをU11経路で抑止/安全化し、getAllowanceMonthViewのemitLogs尊重も修正する。（NFR6.204、NFR5.201）
- [x] Step 14 — 運用のGreenと整理: Step 12のシナリオ、秘密のログ流出0件、ApiError500/予期せぬ失敗の通知、4xx非通知、バックアップ対象外ARNを触らないことを検証する。通知を有効化せずにbackupが動き、scheduled/SQSは送らないことを結合確認する。（NFR2.201・NFR5.202）
- [x] Step 15 — CDKと配備設定: `infrastructure/lib/{data-stack,app-stack,notification-construct,app,env}.ts`の必要箇所に調整表・参照・ADJUSTMENTS_TABLE/ARN・BACKUPS_ENABLED・最小IAMを追加する。既存`.github/workflows/`の配備設定に非秘密のbackup設定と確認値を通す。通知無効の既定とproduction RETAINを維持。新規Lambda/定時起動/有料警報を増やさない。（NFR1.201・NFR3.201・NFR10.201）
- [x] Step 16 — 構成と全体の確認: `infrastructure/test/u11-adjustments/`のCDK試験で二環境、IAM、取引の条件権限、バックアップ独立起動、有効化の確認条件を検証する。U11専用試験と、承認済みConstruction全体コマンドを実行し、行80%以上・既存回帰を確認する。秘密検査の未導入、実機3秒、メール、CI、配備、実料金、復元が未実施なら明記する。（NFR8.201、NFR7.201・NFR7.204）
- [x] Step 17 — 説明書: `docs/contract-changes-u11.md`、`docs/manual-check-u11.md`、`docs/adjustment-runbook.md`を追加し、必要な既存`docs/notification-runbook.md`へbackup独立設定の差分を反映する。合計範囲外の訂正、24h超の結果不明、バックアップのみの有効化、100円合算再評価、旧版へ戻すと額が抜ける注意と読取互換を残す戻し方を記載する。（NFR6.201・NFR6.204・NFR1.201）
- [x] Step 18 — 完了記録: code-summary・全変更ファイルのsource-manifest・AC/BR/詳細NFRのtraceabilityを生成する。BDD先行の実行結果、実際のテスト数/coverage、未実施項目を記録する。レビュー前に必要ファイルの存在と差分を確認する。（全要件）

## Files and Boundaries

アプリ変更はworkspace rootの既存パッケージに行い、U11用テストは各`test/u11-adjustments/`へ置きます。既存ファイルの必要な変更は上記に限ります。`.gitignore`・`AGENTS.md`・インストール済み`.codex`/`.agents`は変更しません。テスト閾値・タイムアウトを通す目的で緩めません。パッケージ追加・依存更新・コミット・AWS配備・LINE/SNS実送信はこの計画に含めません。

## Sources

- `construction/u11-adjustments/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- `inception/user-stories/stories.md` US8.2、共通AC1.1.12
- `inception/contract-design/contract-summary.md`、`inception/units-generation/unit-of-work.md`
- `inception/requirements-analysis/requirements.md`、`aidlc/spaces/default/memory/team.md`

## Assumptions & Open Questions

- 実機・配備・復元・実メール・実料金の確認は残る。バックアップのみ有効化する設定も運用開始前の確認対象であり、このコード作成で実環境を動かさない。

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
