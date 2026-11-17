# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-17
- Commit: 5d5a023f64842d195004ddf1e0b0347995a63a50
- 全体探索・部分精読。依頼された全体スキャンの中で、Minimal 深度の精読範囲のみを以下に記録する。

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: family-action-menu
fingerprint: e576ca01337c0201f7d4b490c25d666f7da4161d
analyzed:
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
  components:
    - App
    - CalendarPage
    - FamilySettingsPage
    - useMonthCalendar
    - APIClient
    - Router
    - InfrastructureApp
    - DataStack
shallow:
  paths:
    - packages/backend/
    - packages/shared/
    - packages/frontend/
    - infrastructure/
    - scripts/
    - docs/
```
