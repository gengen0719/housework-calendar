> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

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

## 臨時担当: 重点調査の結果

単発Duty作成用のHTTP route・client関数・共有要求型は存在しない。既存PATCHは担当の子供変更で、新規作成ではない。DutyOriginはrule/manual/swapだがmanualは手動の子供変更にも使われ、臨時作成を識別できない。

保存キーはfamilyId + M#month#D#date#choreTypeId。日付＋種類は1件で、別担当の重複も不可。buildCreateDutyItemsは担当とDID参照をattribute_not_existsで同時にPutする。月未確定/種類activeのConditionCheckも再利用できる。新規作成時の認証・所属・管理者、実在日、子供所属、種類active、確定/月範囲、重複、送り直しを定義する必要がある。

月再保存はmanual/swapの未来のtodoに上書き確認を求め、確認後は変更・削除し得る。単発追加を保持するかを要件・設計で明示する。金額はdoneになった時点の単価snapshotを集計するので、通常のDutyとして保存すれば既存の記録・お小遣いへ接続できる。定時通知は当日のDuty一覧を読むが、単発追加直後に通知する処理はない。
