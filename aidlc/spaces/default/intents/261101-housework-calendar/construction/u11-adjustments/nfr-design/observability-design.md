# U11 観測の設計

## Structured Events

操作名ADJUSTMENT_CREATE/DELETE/LIST、結果コード、durationMs、安全な要求相関IDだけを既存loggerへ渡します。入力本文、金額、理由、名前、トークン、生の家族IDは含めません。既存C9のAPI側ログにもfamilyIdがあるため、U11で使う既定経路を安全な参照へ変更するかemitLogsを抑止して安全な完了ログへ置き換えます。getAllowanceMonthViewがemitLogs指定を無視する現状も同時に直します。通知経路は既存emitLogs:falseを維持します。

入力・権限・確定・キー競合は通常の拒否として扱います。500と予期せぬ保存/読取失敗は既存API入口のreportEntryFailureを通し、既存メール通知・CloudWatch警報で15分以内の目標を確認します。金額範囲外のAPIエラーは422、通知側の計算不能は送信しない失敗として記録し既存の通知失敗経路へ渡します。

## SLI and Measurement

新規の有料ダッシュボードや独立アラームは設けません。既存のAPI失敗件数と処理時間に加え、手動確認では登録/削除から一覧・合計表示までを各20回測ります。19/20の条件、通信とコールド起動、環境・日時を記録します。ログのdurationMsを画面全体の時間と読み替えません。

## Validation

名前・理由・金額・生IDの識別用入力を使って全ログと通知を捕捉し、流出0件を検証します。ApiError500と予期せぬ例外の双方を通知対象、4xxを対象外として回帰試験します。AWS上の実メール受信や遅延は手動確認まで未実施です。

## Sources

- `construction/u11-adjustments/nfr-requirements/observability-requirements.md` NFR2.202・NFR5.202・NFR7.204
- `construction/u11-adjustments/nfr-requirements/security-requirements.md` NFR5.201
- `packages/backend/src/services/allowanceService.ts` emitとgetAllowanceMonthView

## Assumptions & Open Questions

- 実際のメールアドレス・トークンを設計書やテストデータへ入れない。
