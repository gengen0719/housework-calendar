## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-15T23:14:43Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | packages/backend/src/entries/api.ts > handlerのcatch内のApiError分岐 | 実際の経路が存在する。`PUT /v1/months/:month/assignment`で`calendarService.saveAssignment`の書込が残り時間不足（out-of-time）または競合再試行上限へ達するとINTERNALを返し、`handlers/calendar/saveAssignment.ts`は`new ApiError(500, 'INTERNAL')`を投げる。API入口はこれを`reportEntryFailure`より前に返す。正常なLambda応答でREQUEST_REJECTEDのinfoになるため、Lambda Errorsアラームも補えない。したがってこの経路ではNFR2.109の障害通知は未達である。担当状態変更のハンドラーにもINTERNAL→ApiError500の経路がある。 | `ApiError`でもstatusが500以上なら、応答形式を維持したまま定型の障害通知を呼ぶ。残り時間不足・競合上限のINTERNALを再現し、500のApiErrorと通常のErrorでSNS通知が出ること、4xxでは出ないことをAPI入口の回帰テストで確認する。 | Resolved (reviewer) |
| R-02 | Minor | packages/backend/src/services/notificationService.ts > dispatchFamilyのduplicate・expiredのreturn分岐 | 送信済み重複や期限切れでは、結果を返すだけで対応するログが残らない。`entries/notify.ts`もRUNの完了を更新するだけで結果を記録しない。特に記録なしの期限切れは通知記録も作られず、NFR2.107の重複抑止・期限切れの区別や監視設計の件数調査を再現できない。 | 許可した項目のみで重複抑止と期限切れの結果を記録し、記録なしの期限切れを含むテストを追加する。本文・金額・生の家族IDは出さない。 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u10-notifications/code-generation/code-summary.md > 検証・未実施事項 | 秘密検査はgitleaks未導入で未完了。実メール購読、15分以内の受信、初回60秒、AWS上の清掃・復旧・費用、GitHub上の実CIも未実施として開示されている。自動テストの成功だけではこれらの配備前条件を満たしたとは判定できない。 | 導入済み環境で秘密検査を実行し、配備前に実機確認と合算月100円の見積もりを完了する。未実施の間は通知を無効のままにし、確認結果を記録する。 | Unresolved |

> R-01 Reviewer note: API入口のApiError分岐でstatusが500以上の場合にも定型通知を呼ぶようになった。新しい回帰テストは実際の割り当て保存を通し、残り時間不足と競合上限からの500でSNS通知1件を検証する。500/503、通常のError、4xxの通知抑止と元の応答維持も確認し、独立実行で通過した。

> R-02 Reviewer note: 終端重複をNOTIFY_DUPLICATE、記録なし・既存記録あり・送信直前の期限切れをNOTIFY_EXPIREDとして記録する。回帰テストはHMACのfamilyRef等の許可項目だけが存在すること、既存の送信ログを重ねないことを確認し、独立実行で通過した。

> R-03 Reviewer note: `npm run secrets:scan`を独立実行したが、gitleaks未導入で検査開始前にexit 1。実メール購読・15分以内の受信・初回60秒・実配信・AWS上の清掃と復旧と費用・実CIは引き続き未実施として明記されている。通知は既定で無効のまま。導入済み環境で秘密検査を実行し、実機と合算100円の確認を配備前に完了させる必要がある。

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npx vitest run u10-notifications --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'` | 24ファイル・218件すべて通過。行28.17%という全体閾値の判定だけでexit 1。 | 単位のテスト失敗はない。他単位も分母に含める全体80%の下限は次の全体確認で判定した。 |
| `npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test` | exit 0。整形・lint・4パッケージの型検査と全体テストを完走。行96.54%（3550/3677）、文95.18%、分岐90.45%、関数95.82%。 | 修復後の指定確認をそのまま通過した。品質の下限やタイムアウトの緩和は確認されていない。 |
| `npm run secrets:scan` | exit 1。「gitleaks が見つかりません」と表示され、検査を開始できなかった。 | 秘密検査の合格証拠はない。R-03として未完了を維持する。 |
| 修正箇所・回帰テスト・成果物の照合 | apiFailureAlert.test.tsとnotificationResultLog.test.tsの15件、APIと通知処理の修正、source-manifestへの回帰ファイル追加、要約の修復記録を確認。 | 修復は指摘の原因と実際の経路に対応している。実装順序の過去のBDD逸脱を、修復テストの成功によって遡って正当化してはいない。 |

### Summary

型付き500の通知漏れと重複・期限切れログの不足は修正された。今回の再確認で新しい機能欠陥は見つからず、指定の全体確認も成功した。秘密検査と実機確認の未完了を配備前条件として残したうえでREADYとする。
