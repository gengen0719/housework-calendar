> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

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

## 臨時担当の関連箇所

新機能の入口候補はpages/DayDetail.tsx、親のCalendarPage.tsx。API契約はshared/src/api-types.ts、通信はfrontend/src/api/client.ts、経路はbackend/src/entries/api.ts。calendarServiceとcalendarRepositoryが担当永続化を扱う。assignmentPlannerは月再保存時の臨時担当保持に影響する。現状の詳細はapi-documentation.md。
