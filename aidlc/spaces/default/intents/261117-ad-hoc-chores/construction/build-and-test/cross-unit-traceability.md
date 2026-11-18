# 要件の対応確認

`aidlc engine sensor-traceability --stage build-and-test`: pass:true、uncovered:[]。Zero-UnitのためUnit間依存なし。

| ID | 対応先 | 判定 |
| --- | --- | --- |
| FR1 | packages/backend/src/services/adhocDutyService.ts | PASS |
| FR2 | packages/frontend/src/pages/ChoreTypesPage.tsx | PASS |
| FR3 | packages/backend/test/ad-hoc-chores/adhoc.test.ts | PASS |
| FR4 | packages/backend/src/services/assignmentPlanner.ts | PASS |
| FR5 | packages/backend/test/ad-hoc-chores/adhoc.test.ts | PASS |
| FR6 | packages/backend/test/ad-hoc-chores/adhoc.test.ts | PASS |
| NFR1 | packages/backend/src/services/adhocDutyService.ts | PASS |
| NFR2 | packages/frontend/test/ad-hoc-chores/DayDetail.test.tsx | PASS |

未実装IDなし。Node/fakeとjsdomによる対応確認であり、実ブラウザーE2E・実LINE送信・AWSでの確認は未実施。
