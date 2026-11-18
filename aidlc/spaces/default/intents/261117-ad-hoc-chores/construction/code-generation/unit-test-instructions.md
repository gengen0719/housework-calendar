# テスト実行手順

既存Vitest・Testing Library・vitest-cucumberを使用し新規依存は導入しない。設定変更は不要。

準備確認: `npx vitest run packages/backend/test/u5-assignment-calendar`

新規BDDシナリオ: `npx vitest run packages/backend/test/ad-hoc-chores packages/frontend/test/ad-hoc-chores`

関連回帰: `npx vitest run packages/backend/test/u4-chore-types packages/backend/test/u5-assignment-calendar packages/frontend/test/u4-chore-types packages/frontend/test/u5-assignment-calendar`

家族・管理者/子供・使用停止種類・確定月・未来/過去日を固定データで作成。条件付き保存競合と再送を検証し、通常月割り当ての再保存から臨時分を保護する。APIの認証/家族境界とフォームから保存までをモック/既存fakeで検証する。実施記録・お小遣い・通知の回帰は既存各領域と全体テストで確認する。

BDDのため実行可能シナリオを実装前に書く。全体行80%以上はBuild and Testでプロジェクト全体のcoverageを測定して判定し、部分実行のため閾値を下げない。
