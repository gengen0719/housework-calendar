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
