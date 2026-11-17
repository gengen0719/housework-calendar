# U11 契約変更

管理者用のPOST `/v1/months/{month}/adjustments`（201）、GET同パス（200）、DELETE `/v1/adjustments/{adjustmentId}`（204）を追加した。家族と作成者は認証から決め、本文では受け取らない。GETは合計計算に依存しない全件一覧で、過去の子供・不明名の行も削除可能。子供は既存のお小遣い内訳を読む。

入力はchildUserId・kind（add/subtract）・正のsafe integerのamount・reason。理由はNFC正規化とtrim後1〜100コードポイント、改行以外の制御文字は不可。登録金額は正、既存AllowanceAdjustmentLineのamountは符号付き。家族ID・作成者・操作キーを応答へ追加しない。

既存INVALID_REQUEST、INVALID_MONTH、INVALID_AMOUNT、REASON_REQUIREDを使用し、INVALID_REASONとALLOWANCE_OUT_OF_RANGEを共有理由・文言へ追加した。機能設計の抽象名INVALID_INPUT/IDEMPOTENCY_CONFLICTは実装せず、キー再利用は既存422 IDEMPOTENCY_KEY_REUSED、不正キーは400 IDEMPOTENCY_KEY_REQUIREDとする。

C6は子供所属の取引条件、C8は月未確定の取引条件を限定公開する。作成の実体・索引・24時間操作結果・月条件・子供条件を同一取引に含める。削除も実体・索引・月条件を同一取引で扱う。家族込みの入力ハッシュを操作結果と照合し、削除後・確定後の再送は元の結果だけ返す。失効境界では新規扱いになるため24時間超の結果不明要求を自動再送しない。

C9はAPIと通知の両方で調整Queryを既定接続する。調整だけが残る過去の子供も含め、BigIntで中間計算する。返す担当小計と最終合計のみsafe integerへ変換し、範囲外は422。0や負額を丸めず、独立一覧から削除して復帰できる。U10の保存済み本文は固定したまま再試行する。

既存U9の読取回数は調整の強整合Queryの分だけ4→5（過去の子供3人では10→11）へ増える。既存試験のこの期待とAPIのemitLogs:falseの期待を更新し、他の読取と無書込制約は維持した。getAllowanceMonthViewもemitLogsを尊重する。

`backupsEnabled`/`BACKUPS_ENABLED`を追加した。省略時は従来notificationsEnabledを継承し、新規導入の既定は両方false。backup-onlyでもメール購読・実機確認・合算予算確認を必須とする。Backup予定と実行障害/DLQアラームアクションだけ有効にでき、日次/月末/watchdog/cleanupとSQSは通知フラグに従う。通知無効時は外向き通知の欠測アラームを動かさない。

## Sources

U11 functional-design、nfr-design、infrastructure-designと承認済みcode-generation-plan.md。

## Assumptions & Open Questions

実装は実配備・実送信・実料金確認の証拠ではない。
