# テスト実行手順

既存Vitest 5 / jsdom / Testing Libraryを利用する。設定・依存の変更は不要。

準備確認: `npx vitest run packages/frontend/test/u5-assignment-calendar/calendar.steps.tsx`

新規シナリオ: `npx vitest run packages/frontend/test/family-action-menu/CalendarPage.test.tsx`

関連回帰: `npx vitest run packages/frontend/test/u2-invitation/screens.steps.tsx packages/frontend/test/u3-notification-group/screens.steps.tsx packages/frontend/test/u4-chore-types/screens.steps.tsx packages/frontend/test/u5-assignment-calendar/calendar.steps.tsx packages/frontend/test/u5-assignment-calendar/assignment.steps.tsx packages/frontend/test/family-action-menu/CalendarPage.test.tsx`

useMonthCalendarを固定データでモックし、管理者・一般メンバー、未入力・入力済み、確定済み、範囲外月を作る。設定callbackと編集画面への遷移を確認し、権限のない状態で変更入口が出ないことを確認する。キーボードと外側操作も検証する。

カバレッジ80%以上はプロジェクト全体の基準で、Build and Testの全体実行で判定する。部分テストのために閾値を変更しない。BDD順序で先にシナリオを書いてから実装する。
