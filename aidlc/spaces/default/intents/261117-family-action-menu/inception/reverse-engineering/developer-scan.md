## Developer Code Scan Results

### Scan Coverage

- **Analyzed deeply**: CalendarPage.tsx、App.tsx、FamilySettingsPage.tsx、useMonthCalendar.ts、api/client.ts（packages/frontend/src/ 以下）、packages/backend/src/lib/router.ts、infrastructure/lib/app.ts、infrastructure/lib/data-stack.ts、package.json、vitest.config.ts、.github/workflows/ci.yml。
- **Skimmed only**: その他の packages/backend/、packages/shared/、packages/frontend/、infrastructure/、scripts/、docs/。全体を探索したが、Minimal 深度で全実装の精読は行っていない。
- **Left out**: node_modules/、coverage/、dist/、cdk.out/、Git 内部、AI-DLC のインストールと作業記録、秘密値を含み得る環境ファイル。

### Packages Found

npm workspaces: shared（型・文言）、backend（Lambda）、frontend（LIFF 画面）、infrastructure（CDK）。

### Build System

npm、TypeScript。frontend は Vite、インフラは CDK。backend と frontend が shared に依存する。

### APIs Discovered

画面用 API は packages/backend/src/entries/api.ts のルート表、呼び出し側は frontend/src/api/client.ts。詳細は api-documentation.md。

### Frameworks & Libraries

React 19.3.1、MUI 9.5.0、LIFF 2.31.2、Vite 8.3.5、CDK 2.275.0。technology-stack.md を参照。

### Test Coverage

Vitest 5.0.5、React Testing Library、vitest-cucumber。packages/*/test と infrastructure/test。V8 coverage は行 80% の閾値。実測は未実施。

### Code Quality Indicators

ESLint、Prettier、TypeScript。GitHub Actions CI は整形・lint・型・coverage・秘密検査・ビルド・CDK synth を実行する。

### Technical Debt Signals

CalendarPage がカレンダー、割り当て編集、月確定、日付詳細を持つ。既存テストは上部のボタンを直接クリックするためメニュー導入時の更新が必要。

## Handoff Summary

- **Intent-relevant finding**: CalendarPage.tsx:198 に家族名、:201 に家族設定ボタン。:152 の割り当てボタンは canEdit 条件下で、登録済みなら「割り当てを変える」、未登録なら「割り当てを入力する」。App は onOpenSettings によって設定画面へ切り替える。
- **Risks / follow-up**: 管理者、未確定、編集可能な月という条件を保つ。未登録時の「入力する」も移すかは要件で明確にする。既存の U2/U3/U4/U5 テストの導線を合わせる。今回の探索は部分精読であり全リポジトリの深い検証ではない。
