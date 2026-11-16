# 加算・減額の運用

管理者がお小遣い画面から「加算・減額」を開き、対象の子供と種類、正の円整数、必須の理由を入力する。理由は100文字まで。訂正は確認して削除し、入れ直す。確定月は先に既存の確定取消を行う。

合計が表示できない場合も「加算・減額の一覧」を開ける。ここでは集計を呼ばず、上限額が複数ある月の行を1件ずつ削除できる。過去の子供や不明名の行もIDで削除する。合計やDynamoDB行を手作業で修正しない。

保存結果不明では同じ入力とキーで確認する。画面は入力を固定し、24時間を超えた操作を送信しない。一覧を再取得して結果を確認し、過去のキーで自動再登録しない。保存成功と表示取得失敗は別なので、成功した操作を別キーで繰り返さない。

## バックアップのみの有効化

1. staging/productionそれぞれの実メール購読確認とバックアップ手動試験を行う。
2. 東京の実単価・無料枠残量・二環境利用量・為替・税込み費用を再評価し100円以内を確認する。
3. 通知はfalseのまま、環境別STAGING_BACKUPS_ENABLED/PRODUCTION_BACKUPS_ENABLEDをtrueにする。既存のNOTIFICATION_EMAIL、NOTIFICATION_CHECKS_PASSED、NOTIFICATION_BUDGET_VERIFIED、NOTIFICATION_TOTAL_ESTIMATED_JPYも必要。backup未指定は従来通知値を継承するため、意図を明示する。
4. CDKのBackupだけENABLED、SQSと日次/月末送信はDISABLED、notifyのBACKUPS_ENABLED=true/NOTIFICATIONS_ENABLED=falseを確認する。SNS購読と実行障害/DLQ警報のアクションも確認する。

既存03:00 JST起動が通知メタデータと調整表を個別処理し、日次バックアップを7日保存する。表名・表ARN・環境別prefixを固定し、ListBackupsと台帳を照合する。調整はhousework-環境-adjustments-。他の表/prefixやAVAILABLE以外を削除しない。片方の失敗でも他方を試み、失敗を定型通知する。新しいLambda・予定・有料警報は増やさない。

停止はbackupを明示falseにする。メール未購読のまま保護された運用と扱わない。0.50USDの予算通知は強制停止ではない。

## 復元と戻し方

別テーブルへ復元し、実体とJID索引の件数・参照・家族分離を確認してから通常CDK設定で参照を切り替える。requestRecordsの24時間結果と永続調整は別物。復元後も古いキーを自動送信しない。元表を置換・手修正しない。

U11前の集計版へ戻すと保存済み調整が金額から抜ける。読取互換を維持した版へ戻すか、読取とLINE通知を止めた保守状態へ移行する。新表とproduction RETAINを維持する。復元とロールバックは未実施。

## 費用

計画仮定では増分0.155USD、既存条件付き0.25503USDとの合算0.41003USDに200円/USDと税等10%余裕を掛け約91円/月。二環境合計で月1000件作成・最大1000件削除、40,000WRU/100,000RRU、表0.05GB/バックアップ0.35GBを仮定する。現在の単価や請求の引用ではない。無料枠、実サイズ、Lambda/CloudWatch増分、為替、復元時費用を公式見積と実請求で再確認する。

## Sources

U11 infrastructure-design/infrastructure-specification.md、nfr-design/reliability-design.md。

## Assumptions & Open Questions

実機性能、復元、メール、配備、CI、費用はmanual-check-u11.mdで確認する。
