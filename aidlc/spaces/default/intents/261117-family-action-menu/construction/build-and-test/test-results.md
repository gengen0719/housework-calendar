# テスト結果

## 実行結果

すべて今回のbuild-and-test段階で実行。終了コードはすべて0。

| コマンド | 結果 |
| --- | --- |
| npx vitest run packages/frontend/test/u5-assignment-calendar/calendar.steps.tsx | 46件成功、失敗0 |
| npx vitest run packages/frontend/test/family-action-menu/CalendarPage.test.tsx | 11件成功、失敗0 |
| unit-test-instructions.mdの関連6ファイル指定コマンド | 267件成功、失敗0 |
| npm test | 全体成功。行96.29%（3843/3991）、文94.76%、分岐90.25%、関数95.15%。全体件数は取得出力の省略で未記録 |
| npm run build --workspace @housework/frontend | 成功 |
| npm run lint | 成功 |
| npx tsc --noEmit -p packages/frontend | 成功 |

部分実行は同じテストを含むため件数を合算しない。新規操作検証はjsdomで行い、実ブラウザーの証拠とは扱わない。320pxレイアウトは実装済みだが実ブラウザーで未確認。

## Traceability

sensor-traceabilityの初回はtargetに説明文が混ざり、ファイルパスとして解釈されて失敗。targetを実在する単一ファイルパスへ修正し、再実行はpass:true、uncovered:[]。実装や要件を変更していない。実装済みという対応づけと、実ブラウザーで検証済みという判定は別である。
