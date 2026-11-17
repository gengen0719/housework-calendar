# API 概要

画面側の全呼び出しは packages/frontend/src/api/client.ts。Bearer token を送り、失敗は ApiFailure(status, reason, details)、サーバー側は { error: { reason, details? } }。操作識別子を家族作成・招待・種類作成・調整作成に付与する。ルート表は backend/src/entries/api.ts。

| 領域 | HTTP パス |
| --- | --- |
| セッション | POST /v1/sessions、GET /v1/me |
| 家族 | POST /v1/families、GET /v1/family/members、GET /v1/family/notification-group |
| 招待 | GET /v1/family/invitation、POST /v1/family/invitations、GET /v1/invitations/:token、POST /v1/invitations/:token/accept |
| 種類 | GET/POST /v1/chore-types、PUT/PATCH/DELETE /v1/chore-types/:choreTypeId |
| 月 | GET /v1/months/:month/calendar、GET/PUT /v1/months/:month/assignment、PUT/DELETE /v1/months/:month/confirmation |
| 担当 | PATCH /v1/duties/:dutyId、POST /v1/duties/:dutyId/record、POST /v1/duties/:dutyId/status |
| 金額 | GET /v1/months/:month/allowances、GET/POST /v1/months/:month/adjustments、DELETE /v1/adjustments/:adjustmentId |

割り当て編集・月確定は管理者限定。担当記録は本人の担当。API 入口は origin ヘッダーを検証する。詳細な業務エラー条件と LINE/通知契約は今回は精読対象外。

今回の画面配置変更は既存 onOpenSettings と editing state を再利用可能。API 追加は不要という分析結果。
