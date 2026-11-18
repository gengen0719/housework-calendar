> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

# コンポーネント一覧

## App
セッション状態と設定・種類・金額画面への切り替えを保持。CalendarPage を利用。

## CalendarPage
家族名、上部操作、月移動、担当一覧、割り当て編集、月確定を表示。今回の変更対象。

## FamilySettingsPage
メンバー、招待、お知らせ先、お手伝いの種類への入口を表示。

## useMonthCalendar
月別取得・再試行・古い要求の取消・保存応答の差し替えを提供。

## APIClient
相対 URL の fetch、認証、エラー変換、共有型による返却契約。

## Router
HTTP method とパスを照合し、完全一致をパラメーター付きパスより優先。

## InfrastructureApp
アカウントおよび staging/production の Data/App スタックを構成。

## DataStack
Users、Families、ProcessedLineEvents、RequestRecords、Invitations、NotificationGroups、ChoreTypes、Calendar、Adjustments、NotificationDispatches、NotificationPayloads を作成。

その他の画面・業務サービス・repository・通知構成は code-structure.md の領域一覧を参照。これらは今回の精読対象外。

## DayDetail
日付の既存担当を表示し、子供変更・状態変更・本人記録を呼ぶ。新規追加入口はない。

## AssignmentPlanner
月ルールから日付＋種類の担当を生成し、未来のtodoを変更・削除する。manual/swapの上書き確認を返す。

## Models
DutyRecord、DutyRefRecord、AssignmentRecord、MonthStateRecordを定義する。担当は登録済み種類と子供への参照。

## NotificationMessages
当日の担当一覧から定時通知本文を作る。月確定時は通知を省く。追加即時通知ではない。

## JstDate
日本時間の今日、月、実在する月の日付一覧、今月・来月の編集判定を提供する。

## CalendarPort
種類が割り当て・担当で使用済みかを確認する窓口。種類の削除判定に関わる。

## SaveAssignmentHandler
管理者、月と本文の形を確認してcalendarServiceへ渡す。臨時作成用ではない。
