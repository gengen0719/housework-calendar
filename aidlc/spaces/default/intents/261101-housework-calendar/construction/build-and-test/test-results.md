# ビルドとテストの実行結果

## Result

ローカルのアプリ試験とbuildは成功、品質目標の未確認があるため工程全体は未合格。全体4165成功・既存2skip、236ファイル、行96.27%、文94.73%、分岐90.21%、関数95.02%。実行環境Node26.13.1。実ブラウザや実AWSではありません。

## Command Results

| ID | Command | Exit | Result | Tests / Coverage |
|---|---|---|---|---|
| CMD-1 | npx vitest run u1-skeleton-family --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  413 passed (413); Lines        : 25.9% ( 1028/3969 ) |
| CMD-2 | npx vitest run packages/backend/test/u1-skeleton-family/follow.feature | 1 | failed | ;  |
| CMD-3 | npx vitest run u10-notifications --passWithNoTests | 0 | passed | Tests  218 passed (218);  |
| CMD-4 | npx vitest run u10-notifications | 0 | passed | Tests  218 passed (218);  |
| CMD-5 | npx vitest run u10-notifications --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  218 passed (218); Lines        : 26.65% ( 1058/3969 ) |
| CMD-6 | npx vitest run infrastructure/test/u10-notifications/stacks.test.ts | 0 | passed | Tests  26 passed (26);  |
| CMD-7 | npx vitest run u11-adjustments --no-coverage | 0 | passed | Tests  161 passed (161);  |
| CMD-8 | npx vitest run u2-invitation --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  408 passed (408); Lines        : 27.73% ( 1101/3969 ) |
| CMD-9 | npx vitest run packages/backend/test/u2-invitation/accept-invitation.feature | 1 | failed | ;  |
| CMD-10 | npx vitest run u3-notification-group --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  336 passed (336); Lines        : 25.85% ( 1026/3969 ) |
| CMD-11 | npx vitest run packages/backend/test/u3-notification-group/register-group.feature | 1 | failed | ;  |
| CMD-12 | npx vitest run u4-chore-types --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  297 passed \| 1 skipped (298); Lines        : 27.03% ( 1073/3969 ) |
| CMD-13 | npx vitest run packages/backend/test/u4-chore-types/update-chore-type.feature | 1 | failed | ;  |
| CMD-14 | npx vitest run u5-assignment-calendar --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  501 passed \| 1 skipped (502); Lines        : 33.61% ( 1334/3969 ) |
| CMD-15 | npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts | 0 | passed | Tests  27 passed \| 1 skipped (28);  |
| CMD-16 | npx vitest run packages/backend/test/u5-assignment-calendar/save-assignment.steps.ts | 0 | passed | Tests  69 passed (69);  |
| CMD-17 | npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test | 0 | passed | Tests  4165 passed \| 2 skipped (4167); Lines        : 96.27% ( 3821/3969 ) |
| CMD-18 | npx vitest run u6-recording --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  342 passed (342); Lines        : 25.04% ( 994/3969 ) |
| CMD-19 | npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts infrastructure/test/u5-assignment-calendar/stacks.test.ts | 0 | passed | Tests  45 passed \| 2 skipped (47);  |
| CMD-20 | npx vitest run packages/backend/test/u6-recording/record-do-line.steps.ts | 0 | passed | Tests  37 passed (37);  |
| CMD-21 | npx vitest run u7-review-confirm --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  382 passed (382); Lines        : 25.52% ( 1013/3969 ) |
| CMD-22 | npx vitest run infrastructure/test/u7-review-confirm/stacks.test.ts | 0 | passed | Tests  15 passed (15);  |
| CMD-23 | npx vitest run packages/backend/test/u7-review-confirm/status-change-service.steps.ts | 0 | passed | Tests  39 passed (39);  |
| CMD-24 | npx vitest run u8-swap --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  569 passed (569); Lines        : 20.86% ( 828/3969 ) |
| CMD-25 | npx vitest run infrastructure/test/u8-swap/stacks.test.ts | 0 | passed | Tests  17 passed (17);  |
| CMD-26 | npx vitest run packages/backend/test/u8-swap/swap-accept.steps.ts | 0 | passed | Tests  33 passed (33);  |
| CMD-27 | npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm | 0 | passed | Tests  2679 passed \| 2 skipped (2681);  |
| CMD-28 | npx vitest run u9-allowance --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**' | 1 | passed-global-floor-only | Tests  538 passed (538); Lines        : 19.92% ( 791/3969 ) |
| CMD-29 | npx vitest run infrastructure/test/u9-allowance/stacks.test.ts | 0 | passed | Tests  14 passed (14);  |
| CMD-30 | npx vitest run packages/backend/test/u9-allowance/allowance-calc.steps.ts | 0 | passed | Tests  81 passed (81);  |
| CMD-31 | npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm u8-swap | 0 | passed | Tests  3248 passed \| 2 skipped (3250);  |

## In-stage Repair 1

継承されたfeature直接指定はNo test files foundでexit1でした。build-instructions.mdの集合実行例を、同じfeatureをloadFeatureするsteps.tsへ補正しました。元のコードやシナリオ、閾値は変更していません。

- `npx vitest run packages/backend/test/u1-skeleton-family/follow.steps.ts`: exit0、成功。
- `npx vitest run packages/backend/test/u2-invitation/accept-invitation.steps.ts`: exit0、成功。
- `npx vitest run packages/backend/test/u3-notification-group/register-group.steps.ts`: exit0、成功。
- `npx vitest run packages/backend/test/u4-chore-types/update-chore-type.steps.ts`: exit0、成功。

## Build / Other Checks

- frontend build: exit0、991 modules、主なindex 413.25kB（gzip122.61kB）。
- 秘密検査: gitleaks8.30.1を導入して再実行、exit1。Git履歴28コミットは検出なし。作業ツリーはU4レビュー文書とその内部記録の同じテンプレートリテラルのテスト例をgeneric-api-keyとして2か所検出。実運用の鍵と判定したものではありません。検査は未合格のまま、除外を増やさず過去レビューを保持しました。
- CLIのNodeは26.13.1。Node22での再実行は未確認。
- 実機3秒、実メール15分、実LINE、AWSの復元、料金は未実施。画面はjsdomの結合証拠であり、実ブラウザ/E2Eの証拠ではない。

## Target Verification Matrix

build-and-test-summary.mdの同名節を正本とします。415件の期待値・Actual・Evidence・Owning Stage・Verdictと共通契約を含み、Pendingは残しません。

## Failure Diagnosis

最終対応検査はpass:false、未対応17件。FR7.1〜FR7.5はステージング速度AC7.1.11の未実施を引き継ぎます。NFR1〜NFR11の未対応には、古い単位の詳細NFRの対応記録不足と実機検証待ちを含みます。コード未実装と断定しません。U10のBDD順序逸脱は既存まとめの開示どおりです。ソース修正のループバックはまだ行っていません。

## Sources

source-inventory.json、command-results.json、cross-unit-raw.json、各単位の既存手順・まとめ。

## Assumptions & Open Questions

実環境の目標を満たしたと報告しない。秘密検査の検出と実環境の残件の判断が必要です。

## Failure Decision

利用者はAccept failureを選択（メッセージ3347a7a6）。上記の未合格・未確認項目を残して、この工程の承認へ進みます。この選択を検査合格や配備の承認とは扱いません。

