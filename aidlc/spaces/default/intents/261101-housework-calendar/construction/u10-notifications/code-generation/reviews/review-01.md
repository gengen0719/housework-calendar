## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-15T19:41:30Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | packages/backend/src/entries/api.ts > handlerのcatch内のApiError分岐 | 実際の経路が存在する。`PUT /v1/months/:month/assignment`で`calendarService.saveAssignment`の書込が残り時間不足（out-of-time）または競合再試行上限へ達するとINTERNALを返し、`handlers/calendar/saveAssignment.ts`は`new ApiError(500, 'INTERNAL')`を投げる。API入口はこれを`reportEntryFailure`より前に返す。正常なLambda応答でREQUEST_REJECTEDのinfoになるため、Lambda Errorsアラームも補えない。したがってこの経路ではNFR2.109の障害通知は未達である。担当状態変更のハンドラーにもINTERNAL→ApiError500の経路がある。 | `ApiError`でもstatusが500以上なら、応答形式を維持したまま定型の障害通知を呼ぶ。残り時間不足・競合上限のINTERNALを再現し、500のApiErrorと通常のErrorでSNS通知が出ること、4xxでは出ないことをAPI入口の回帰テストで確認する。 | New |
| R-02 | Minor | packages/backend/src/services/notificationService.ts > dispatchFamilyのduplicate・expiredのreturn分岐 | 送信済み重複や期限切れでは、結果を返すだけで対応するログが残らない。`entries/notify.ts`もRUNの完了を更新するだけで結果を記録しない。特に記録なしの期限切れは通知記録も作られず、NFR2.107の重複抑止・期限切れの区別や監視設計の件数調査を再現できない。 | 許可した項目のみで重複抑止と期限切れの結果を記録し、記録なしの期限切れを含むテストを追加する。本文・金額・生の家族IDは出さない。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u10-notifications/code-generation/code-summary.md > 検証・未実施事項 | 秘密検査はgitleaks未導入で未完了。実メール購読、15分以内の受信、初回60秒、AWS上の清掃・復旧・費用、GitHub上の実CIも未実施として開示されている。自動テストの成功だけではこれらの配備前条件を満たしたとは判定できない。 | 導入済み環境で秘密検査を実行し、配備前に実機確認と合算月100円の見積もりを完了する。未実施の間は通知を無効のままにし、確認結果を記録する。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npx vitest run u10-notifications --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'` | 22ファイル・203件すべて通過。全体ソースを分母とする行18.48%の閾値だけでexit 1。 | 単位のテスト失敗ではない。全体80%の下限は次の連結確認で判定した。 |
| `npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test` | 初回は既存画面5件のタイムアウトと2ワーカーの起動失敗でexit 1。各失敗ステップが約963秒という異常な経過を示したため、同じコマンドを1回再実行し、再実行はexit 0。行96.51%（3545/3673）、文95.15%、分岐90.4%、関数95.81%。 | 整形・lint・4パッケージの型検査・全体テストを再実行で完走。初回の実行環境上の中断や負荷の可能性は推測であり、タイムアウトだけをソース欠陥とは扱わない。 |
| 送信・永続化・再試行の実装照合 | メタデータと本文の同時作成、終端更新と本文削除の同時実行、版・状態・所有者の条件、固定した宛先・本文・キー、所有中と早期配達をSQS部分失敗で残す処理を確認。 | 最大3試行・15分未満・残り5秒の制御、受理後の保存失敗から同じキーでの復旧は実装されている。宛先変更と実送信の完全な原子性を主張していない。 |
| 監視・清掃・バックアップ・IAMの実装照合 | RUNの集計、毎分の監視とNotifyHealthの欠測アラーム、本文の読取期限と清掃カーソル、バックアップARN台帳と自テーブル名でのListBackups照合、ListBackups/GetMetricStatisticsのRequestedRegion条件、環境別の5アラームを確認。 | 以前の設計上のバックアップ探索経路と所有期限中の再配達条件は実装へ具体化された。APIの型付き500の通知漏れと結果ログの不足は上記のとおり残る。 |
| 有効化・CI・品質手順の照合 | SchedulerとSQS連携は既定で無効。メール・実機確認・予算確認・100円以下の見積もりを有効化条件とし、既存の本番承認とOIDC経路を維持。 | 実AWSへの配備やLINE通知を今回のレビューで実行していない。送信調整の本体が対応するBDDファイルより先に作られたという開示は、実装順序の逸脱の証拠として扱い、最終テストの通過で歴史的な順序が正しかったことにはしない。 |

### Summary

通知の中核となる固定キー・本文の保護・条件付き状態更新・期限内再試行は実装され、独立した単位テストと全体確認を通過した。型付き500の障害通知漏れは実在する経路であり、NFR2.109を満たしたとは扱わない。CriticalはなくMajor1件という判定でREADYを維持するが、この判定は全品質要件の達成や本番配備の完了を表さない。結果ログの不足と配備前検証の残項目も人が判断できるよう明示する必要がある。
