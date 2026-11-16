# ビルド手順

## Setup

既存の依存を使用します。Node.js22が要件で、現在の実行環境の版を記録します。クリーン環境では`npm ci`でpackage-lockの固定版を復元しますが、今回の環境では導入済みの依存を再導入しません。AWS/LINEの実秘密は不要です。

## Build and Static Checks

```sh
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

```sh
npm run build --workspace @housework/frontend
```

shared/backendにはbuildスクリプトがないため、型検査をコンパイル確認として使います。LambdaはCDK試験でバンドルします。CDK assertionのテンプレート生成と実AWS配備は別の証拠です。設定や秘密を用意せず実AWSへ接続しません。`npm run typecheck`のルート設定は既存まとめでJSX設定不足とされるため、上記の4パッケージ別の型検査を正本とします。

## Collected Unit Commands

各手順から38行、重複を除いた32コマンドを収集しました。裸の`npm test`は上記連結コマンドの最後の同一実行で満たし、残る31コマンドを1回ずつ実行します。coverage出力先が共有されるため直列に実行します。単位限定のcoverageが全ソースの80%だけで非zeroとなった場合、全選択試験が通り後続停止がなければテスト成功として区別し、全体下限の証拠には使いません。

### CMD-1

```sh
npx vitest run u1-skeleton-family --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-2

```sh
npx vitest run packages/backend/test/u1-skeleton-family/follow.steps.ts
```

### CMD-3

```sh
npx vitest run u10-notifications --passWithNoTests
```

### CMD-4

```sh
npx vitest run u10-notifications
```

### CMD-5

```sh
npx vitest run u10-notifications --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-6

```sh
npx vitest run infrastructure/test/u10-notifications/stacks.test.ts
```

### CMD-7

```sh
npx vitest run u11-adjustments --no-coverage
```

### CMD-8

```sh
npx vitest run u2-invitation --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-9

```sh
npx vitest run packages/backend/test/u2-invitation/accept-invitation.steps.ts
```

### CMD-10

```sh
npx vitest run u3-notification-group --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-11

```sh
npx vitest run packages/backend/test/u3-notification-group/register-group.steps.ts
```

### CMD-12

```sh
npx vitest run u4-chore-types --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-13

```sh
npx vitest run packages/backend/test/u4-chore-types/update-chore-type.steps.ts
```

### CMD-14

```sh
npx vitest run u5-assignment-calendar --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-15

```sh
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts
```

### CMD-16

```sh
npx vitest run packages/backend/test/u5-assignment-calendar/save-assignment.steps.ts
```

### CMD-17

```sh
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

### CMD-18

```sh
npx vitest run u6-recording --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-19

```sh
npx vitest run infrastructure/test/u1-skeleton-family/stacks.test.ts infrastructure/test/u4-chore-types/stacks.test.ts infrastructure/test/u5-assignment-calendar/stacks.test.ts
```

### CMD-20

```sh
npx vitest run packages/backend/test/u6-recording/record-do-line.steps.ts
```

### CMD-21

```sh
npx vitest run u7-review-confirm --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-22

```sh
npx vitest run infrastructure/test/u7-review-confirm/stacks.test.ts
```

### CMD-23

```sh
npx vitest run packages/backend/test/u7-review-confirm/status-change-service.steps.ts
```

### CMD-24

```sh
npx vitest run u8-swap --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-25

```sh
npx vitest run infrastructure/test/u8-swap/stacks.test.ts
```

### CMD-26

```sh
npx vitest run packages/backend/test/u8-swap/swap-accept.steps.ts
```

### CMD-27

```sh
npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm
```

### CMD-28

```sh
npx vitest run u9-allowance --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

### CMD-29

```sh
npx vitest run infrastructure/test/u9-allowance/stacks.test.ts
```

### CMD-30

```sh
npx vitest run packages/backend/test/u9-allowance/allowance-calc.steps.ts
```

### CMD-31

```sh
npx vitest run u1-skeleton-family u2-invitation u3-notification-group u4-chore-types u5-assignment-calendar u6-recording u7-review-confirm u8-swap
```

## Troubleshooting

集合検証の実行チェックを1回修正しました。CMD-2/9/11/13の継承された例はfeatureを直接指定してNo test files foundになったため、本手順では同じfeatureをloadFeatureするsteps.tsへ指定を補正しています。対象シナリオは減らしていません。元の実行結果と補正後の結果はtest-results.mdに両方残します。アプリや生成済み単位の成果物ではなく、この工程の実行チェックの補正です。

No test files foundは成功にしません。古いfeature名の直接指定はrunnerが読むstepsファイルと一致するか確認します。gitleaks未導入は秘密検査未完了です。元の承認済み単位手順やsourceの変更が必要なら、その単位の修正へ戻します。閾値を下げません。

## Sources

全単位のunit-test-instructions.md、code-summary.md、ルートと各workspaceのpackage.json、vitest.config.ts。

## Assumptions & Open Questions

実環境を要する項目は手動確認書に従って別途実施する必要があります。

