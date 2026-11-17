# 依存関係

内部: frontend → shared、backend → shared。infrastructure が frontend のビルド結果を配備し、Lambda を構成する。

画面の依頼箇所: App → CalendarPage → useMonthCalendar → APIClient。CalendarPage は AssignmentPage を遅延ロードし、設定画面は onOpenSettings callback で App が開く。FamilySettingsPage → APIClient、LIFF share。

外部依存のバージョンは technology-stack.md。UI に MUI が既にあるため、メニュー実装に追加ライブラリを要する根拠はない。調査した経路で循環依存は見つからなかった。全ソースの循環解析は未実施。
