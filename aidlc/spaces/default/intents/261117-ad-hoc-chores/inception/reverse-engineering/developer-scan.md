## Developer Code Scan Results

### Scan Coverage

- **Analyzed deeply**:
  - packages/frontend/src/pages/CalendarPage.tsx
  - packages/frontend/src/pages/DayDetail.tsx
  - packages/frontend/src/hooks/useMonthCalendar.ts
  - packages/backend/src/services/assignmentPlanner.ts
  - packages/backend/src/models.ts
  - packages/backend/src/services/notificationMessages.ts
  - packages/shared/src/jstDate.ts
  - packages/backend/src/services/calendarPort.ts
  - packages/backend/src/handlers/calendar/saveAssignment.ts
- **Skimmed only**: backend calendarService/repository/entries/API、shared api-types、allowanceService、frontend APIClient（関連部分読解）、各領域のtestディレクトリ（一覧）。以前の他領域の文章は保持するが未再検証。
- **Left out**: node_modules、dist、coverage、cdk.out、IDE/tool caches、AI-DLC install/workspace（調査対象コードとして扱わない）。

### Packages Found

- frontend — React/TypeScript — LIFF画面
- backend — TypeScript — Lambda/API・業務・DynamoDB
- shared — TypeScript — 型・文言・日付・金額
- infrastructure — CDK（前回資料を保持、今回は精読対象外）

### Build System

npm workspace（既存資料）。frontend/backendはsharedに依存。今回マニフェスト・CI設定は再精読しない。

### APIs Discovered

既存経路は月カレンダー取得、月ルール保存、担当子供PATCH、本人記録、管理者状態変更、月確定。単発Duty作成のroute/client/request型はない。DayDetailは表示と既存変更のみ。

### Frameworks & Libraries

既存React/MUI、TypeScript、zod、AWS SDK利用。バージョンはtechnology-stack.mdの以前の確認値を保持、今回は更新を検証していない。

### Test Coverage

- **Test Directories**: packages/frontend/test、packages/backend/test、packages/shared/test。u5/u6/u7/u9/u10が関連。
- **Test Frameworks**: 以前の資料のVitest、Testing Library、vitest-cucumberを保持。
- **Coverage Config**: 前回資料では行80%閾値あり。今回実行・再検証なし。

### Code Quality Indicators

所属・管理者チェックと条件付き取引の既存パターンを再利用可能。新規作成では冪等性と重複の意味を明示する必要がある。lint/CI情報は既存資料を保持するが今回未実行。

### Technical Debt Signals

- CalendarPage.tsx のhasAssignment条件で未割り当て月はDayList自体が出ない。Dutyだけ追加しても現在の表示導線では見えない。
- onChangedは既存配列のmap置換のみ。追加はappendまたはrefresh/replaceが必要。
- MonthCalendar.choreTypesは使用済み種類だけ。全active種類の選択には一覧取得が必要。
- assignmentPlanner.tsは日付＋種類で1slot。既存manual/swapの未来todoも上書き確認後に変更・削除し得る。臨時追加の保持識別子はない。

## Handoff Summary

- **Intent-relevant finding**: 日付詳細から単発担当を作成する画面・APIは未実装。CalendarPage.tsx:159付近が未割り当て月を隠し、DayDetail.tsxは新規作成を呼ばない。models.tsとcalendarRepository.tsの保存キーは同日同種類1件。
- **Risks / follow-up**: 登録済み種類を使うか自由入力か、誰が誰へ依頼するか、追加可能日、同日同種類重複、月ルール再保存時の保持、LINE即時通知の要否を要件で決める。通常Dutyなら既存記録で単価が確定しallowanceに集計され、定時通知も当日一覧を読む。テスト・ビルドは実行していない。
