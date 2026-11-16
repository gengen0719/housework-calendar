# U10 お知らせの契約変更

対象はUS9.1のAC9.1.1〜AC9.1.10、共有AC1.2.4。家族へ自発的に送るのは毎日16時の全担当一覧と、月末21時のお小遣いまとめの2種類だけです。本文は1通、LINEの受理までを確認します。端末への到達や既読を保証しません。

| 境界   | 追加・変更                                                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C5     | `NotificationTrigger={kind,targetDate}` は維持。Schedulerの `scheduledTime` はnotify入口のアダプターだけが日本時間の日付へ変換。watchdog/cleanup/backupは別の内部入力                                    |
| C6     | `listNotificationFamilies()` を内部専用のページ列挙として追加。FamiliesのScanは100件・familyIdの投影。`getNotificationGroup` は読取専用のFamilyScopeでも利用可能。未登録は正常省略、共有AC1.2.4は送信0回 |
| C8     | `listDutiesOn(FamilyScope,date)` を追加。未・済・×をすべて返す。月確定は初回送信直前にも再確認                                                                                                           |
| C9     | 月末は既存の `getAllowances` を使い、計算結果の0円・負額と並びを維持。子供0人だけ省略。通知部品から金額を再計算しない                                                                                    |
| C4     | `notificationPushService` は既存 `callLine` の認証と5秒timeoutを再利用。再試行キーは家族・環境・種類・対象日から決まるUUID。200または409＋受理済み識別子だけを受理として扱う                             |
| 保存   | 本文/宛先はPayloads、状態はDispatchesへ分離。準備の取引が成功するまで送信しない。初回version0、更新ごと+1、所有者・状態・版の条件付き更新。所有期限45秒。終端と本文削除は同じ取引                        |
| 再配達 | 最大3回、既知失敗はleaseを外し5秒/20秒＋0〜1秒のばらつき。Retry-Afterが長ければ優先。所有中・早期配達は可視性延長し部分失敗としてキューに残す。受理後保存失敗も同じキーと内容で照合                      |
| 時刻   | 予定前と15分後以降は新規送信なし。送信開始まで残り5秒未満も開始しない。記録が消えた古い起動も再送しない                                                                                                  |
| 宛先   | 準備後の変更は未試行なら省略、試行後の不明状態なら失敗。新しいグループに複製しない                                                                                                                       |

## 運用と権限

api・lineの返事や認証の意味は変えず、思いがけない500のとき定型のSNS通知を追加します。メールに任意の例外、本文、名前、金額、LINE識別子を入れません。運用の家族識別は別のSSM鍵によるHMACです。

Payloadsは終端で削除、毎時23時間以上を清掃し、窓口は24時間以後の読取を拒否します。Dispatchesは35日TTLと日別ポインタの明示削除を使います。バックアップはメタデータ表だけを毎日作り、作成ARNを台帳へ置きます。作成応答不明や台帳欠落はListBackupsで補い、表ARN・バックアップ名・バックアップARNの一致を検査します。7日超はDescribeでも所有を確かめて削除し、他の表は削除しません。

`ListBackups` は資源指定に対応せずResource `*` が必要です。コードが必ず自テーブル名を指定し、返るARNと名前も確認します。`PutMetricData` はResource `*` と `cloudwatch:namespace=Housework/<環境>` 条件を使います。

C9には任意の `emitLogs` オプションを追加しました。既定は従来どおりで、U10だけ `false` を渡し、U9の計算ログに生の家族IDが出ることを防ぎます。通知の運用ログは別鍵のHMAC参照に限ります。計算の結果や既存画面のログは変えません。

**設計からの補正:** SQS GetQueueAttributesには最古メッセージ年齢がないため、watchdogは `GetMetricStatistics` で `AWS/SQS` の `ApproximateAgeOfOldestMessage`、固定された自キューのQueueName、直近5分、60秒粒度のMaximumだけを読みます。GetMetricDataは使いません。GetMetricStatisticsも資源指定に非対応なのでResource `*` に `aws:RequestedRegion` を付けます。PutMetricDataのnamespace条件をこの読取へ流用しません。2環境で毎分の読取は月約9万件で、ほかのAPI利用を含め無料枠の残りを配備前に確認します。

根拠: [GetMetricStatistics API](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricStatistics.html)、[CloudWatch IAM権限表](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudwatch.html)、[DynamoDB IAM権限表](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html)（2026-11-15確認）。

## 意図した既存構成テストの更新

U10追加後は各環境でテーブル8→10、Lambda4→5（業務入口api/line/notifyと既存補助2）、ログ2→3、標準アラーム0→5、apiのIAM文11→12、line9→10です。既存2入口にはSNS Publishの許可とALERT_TOPIC_ARNだけを追加し、既存テーブルの許可・認証・暗号化・URL数2を維持します。予算を1→0.50USDへ更新します。U1/U5/U6/U7/U8/U9の構成テストはこの差分だけを更新しています。

実際の設定値・メール・鍵は記載しません。文書中で値を示す必要がある場合は `<作り物の値>` とし、本物の設定は環境ごとのSSM/GitHub設定で管理します。
