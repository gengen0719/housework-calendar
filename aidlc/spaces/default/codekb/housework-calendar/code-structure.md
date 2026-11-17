# コード構成

| 場所 | 分類・責務 |
| --- | --- |
| packages/shared/src | モデル、API 型、文言、日付・金額のユーティリティ |
| packages/backend/src/entries | API、LINE webhook、通知の入口 |
| packages/backend/src/handlers | family、invitation、calendar、choreType、allowances、line の処理 |
| packages/backend/src/services | 業務処理、外部サービス連携 |
| packages/backend/src/repositories | DynamoDB アクセス |
| packages/backend/src/middleware | 認証、所属、管理者、署名・origin 確認 |
| packages/frontend/src/pages | React 画面 |
| packages/frontend/src/hooks | セッション、月別データ、通知先の取得 |
| packages/frontend/src/components | 記録・確定・上書き等の共通 UI |
| packages/frontend/src/api、liff、calendar、invitation | 通信・LIFF・表示補助 |
| infrastructure/lib、bin | CDK スタックと起動 |
| packages/*/test、infrastructure/test | BDD シナリオと単体テスト |
| scripts、.github/workflows、docs | 運用・CI・利用手順 |

依頼箇所は packages/frontend/src/pages/CalendarPage.tsx。App.tsx が利用する。テストへの影響は code-quality-assessment.md。
