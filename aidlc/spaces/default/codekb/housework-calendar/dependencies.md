> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

# 依存関係

内部: frontend → shared、backend → shared。infrastructure が frontend のビルド結果を配備し、Lambda を構成する。

画面の依頼箇所: App → CalendarPage → useMonthCalendar → APIClient。CalendarPage は AssignmentPage を遅延ロードし、設定画面は onOpenSettings callback で App が開く。FamilySettingsPage → APIClient、LIFF share。

外部依存のバージョンは technology-stack.md。UI に MUI が既にあるため、メニュー実装に追加ライブラリを要する根拠はない。調査した経路で循環依存は見つからなかった。全ソースの循環解析は未実施。

## 臨時担当の影響経路

CalendarPage → DayDetail → APIClient → API entry → calendarService → calendarRepository。sharedがDuty/MonthCalendarを定義する。登録済み種類と家族の子供一覧が必要。月再生成はassignmentPlanner、実施時の単価確定はrecording/status処理、お小遣いはallowanceService、定時通知はNotificationMessagesが読む。新規APIの追加に際してこれらの境界を維持する。
