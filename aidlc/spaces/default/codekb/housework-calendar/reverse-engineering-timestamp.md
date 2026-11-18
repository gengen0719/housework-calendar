# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-17
- Commit: baf8e933ca3d07dea87094db67ad0dd5356a41ce
- 重点調査。既存資料の対象外の文章は保持し、以前の精読は再検証できない範囲としてshallowへ移した。

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: ad-hoc-chores
fingerprint: 4fadd49db26847a125e01c58afa75b38d9481f80
analyzed:
  paths:
    - packages/frontend/src/pages/CalendarPage.tsx
    - packages/frontend/src/pages/DayDetail.tsx
    - packages/frontend/src/hooks/useMonthCalendar.ts
    - packages/backend/src/services/assignmentPlanner.ts
    - packages/backend/src/models.ts
    - packages/backend/src/services/notificationMessages.ts
    - packages/shared/src/jstDate.ts
    - packages/backend/src/services/calendarPort.ts
    - packages/backend/src/handlers/calendar/saveAssignment.ts
  components:
    - CalendarPage
    - DayDetail
    - useMonthCalendar
    - AssignmentPlanner
    - Models
    - NotificationMessages
    - JstDate
    - CalendarPort
    - SaveAssignmentHandler
shallow:
  paths:
    - packages/frontend/src/App.tsx
    - packages/frontend/src/pages/CalendarPage.tsx
    - packages/frontend/src/pages/FamilySettingsPage.tsx
    - packages/frontend/src/hooks/useMonthCalendar.ts
    - packages/frontend/src/api/client.ts
    - packages/backend/src/lib/router.ts
    - infrastructure/lib/app.ts
    - infrastructure/lib/data-stack.ts
    - package.json
    - vitest.config.ts
    - .github/workflows/ci.yml
    - packages/backend/
    - packages/shared/
    - packages/frontend/
    - infrastructure/
    - scripts/
    - docs/
    - packages/frontend/test/
    - packages/backend/test/
    - packages/shared/test/
```
