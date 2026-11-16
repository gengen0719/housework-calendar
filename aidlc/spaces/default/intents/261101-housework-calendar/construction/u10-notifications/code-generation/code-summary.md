# U10 お知らせ — コード生成のまとめ

## 実装

毎日16時の全担当一覧と月末21時のお小遣い一覧を、既存の家族・担当・お小遣いの窓口から作る通知入口を追加した。通知先未登録、確定済みの日、担当なし、月末の子供0人は送らない。金額0円と負額は表示対象に含める。

通知のメタデータと本文・宛先を別テーブルに保存する。同じ環境・家族・種類・日付の再試行キー、version、条件付き所有権、固定した本文・宛先を用いて並行起動と受理後中断を扱う。既知失敗で所有権を解放し、早期配達と所有中はSQS部分失敗として残す。最大3試行、5秒/20秒とばらつき、Retry-After、15分未満と残り5秒の制限を実装した。終端で本文を削除し、24時間以降の読み取りを拒否する。

api・line・notifyの障害通知、毎分の起動欠落とキュー滞留検査、本文の毎時清掃、35日メタデータ清掃、日次バックアップと7日保持を追加した。バックアップARN台帳とListBackupsによる照合で、応答不明・台帳保存失敗からの回復を扱い、他テーブルのバックアップを削除しない。

CDKに環境別の通知Lambda、2テーブル、Work/DLQ、5つのScheduler、SNS、5個のアラームを追加した。通知URLはない。定時起動とSQS連携は既定で無効。有効化にはメール設定、実機確認、予算確認、合算100円以下の見積もりを必要とする。配備ワークフローへ環境別設定を渡す。実際の配備・配信は行っていない。

## 判断と設計の補足

- AWS SDKのSQS/SNS/CloudWatchクライアントを計画どおり3.1161.0に固定した。
- SQSのGetQueueAttributesは最古メッセージの経過秒を返さないため、CloudWatch GetMetricStatisticsでAWS/SQSのApproximateAgeOfOldestMessageを読む。環境固定のQueueName、直近5分、60秒周期に限定する。GetMetricDataは使用しない。
- GetMetricStatisticsとListBackupsは資源単位のIAM指定に対応しないためResource:*とRequestedRegion条件を使う。cloudwatch:namespace条件はPutMetricDataだけに適用し、読み取り側に存在しない条件を置かない。通知のメトリクス書き込みは環境別namespaceに限定する。
- C9のお小遣い取得へ任意のemitLogs設定を追加し、通知経路ではfalseとした。既存呼び出しの既定動作は維持し、通知ログへ生の家族識別子が出ることを防ぐ。
- 既存IaCテストの資源数と明示的SNS権限を、新しい通知構成の期待に変更した。既存API・LINEの権限制約は維持した。
- BDDの7つの実行可能な筋書きと境界テストを追加した。ただし送信調整のproduction実装は対応するnotification-dispatch.featureより先に作成しており、その切れ目の実装順序は契約から逸脱した。最終的な筋書き・状態保持の偽による検証は成功している。

## 検証

変更前の全体確認は成功し、行カバレッジ97.34%だった。最終の次の連結コマンドはexit0で成功した。

```bash
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

全体219ファイル、3989件成功・既存2件skip。行96.51%（3545/3673）、文95.15%、分岐90.4%、関数95.81%。80%の閾値は変更していない。U10は22ファイル203件、CDK構成検査26件を含む。既存IaC回帰は154件成功・既存2件skip。CDKのTemplate生成を通じて構成合成とLambdaバンドルも確認した。独立したCDK CLI synth/deployは実行していない。

U10指定カバレッジは全単位のソースを分母に含むため、選択テスト成功でも全体閾値によりexit1となる。単体テストの手引きに従い、全体80%の判定は上記の全テストで行う。gitleaks未導入によりnpm run secrets:scanはexit1で実行できなかった。未導入ツールを追加せず、この検査を未完として残す。

## 成果物と追跡

### レビュー修復（2026-11-16）

R-01: API入口でApiErrorのstatusが500以上の場合も既存の定型reportEntryFailureを呼ぶ。元のstatusと応答本文を維持し、4xxでは通知しない。本物の割り当て保存の残り時間不足と競合再試行上限からINTERNALになる経路、500/503のApiError、通常のError、400/401/403/404/409/422の分類をSNSの偽で検証した。

R-02: 送信済み等の終端重複と、記録なし・既存記録あり・送信直前の期限切れで結果ログを1件残す。event・kind・targetDate・HMACのfamilyRefと期限切れの定型reasonだけを許可し、既存の送信ログを重ねない。

修復前に回帰15件を追加して8件の失敗（API通知4件、結果ログ4件）を確認し、修復後はU10の24ファイル218件が全て成功した。R-03の秘密検査と実機確認は引き続き未実施であり、通知の無効既定値は維持した。

修復後の同じ全体連結コマンドもexit0で成功した。全体221ファイル、4004件成功・既存2件skip。行96.54%（3550/3677）、文95.18%（3976/4177）、分岐90.45%（2503/2767）、関数95.82%（940/981）。git diff --checkもexit0。閾値・timeout・検査対象の設定は変更していない。

source-manifest.jsonに依存、既存部品の拡張、IaC、既存テスト、配備設定、文書、新規テストを列挙した。traceability.jsonはsensor-traceabilityで生成し、全AC（共有AC1.2.4を含む）・BR・詳細NFRを実在パスへ対応した。初回60秒とメール15分の実測はDeferredのまま保持する。運用手順、契約変更、実機確認項目はdocs/notification-runbook.md、docs/contract-changes-u10.md、docs/manual-check-u10.mdにある。

## Sources

- U10のfunctional-design、nfr-requirements、nfr-design、infrastructure-designと各review-01.md。
- 承認済みcode-generation-plan.md、unit-test-instructions.md、tool-produced u10-developer-brief.txtのTesting Contract。
- [CloudWatch GetMetricStatistics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricStatistics.html)。
- [CloudWatch IAM権限表](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudwatch.html)。
- [DynamoDB IAM権限表](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html)。

## Assumptions & Open Questions

新たな人の選択事項はない。2環境合計の概算約56円は、旧アカウントの無料枠、要求数、為替200円/USD、税10%の条件付きである。約9万API要求/月を含め、実際の残枠・請求は配備前に再確認する。予算通知0.50USDは強制停止ではない。

実メール購読、15分以内の受信、初回60秒以内、LINEの実受理、再送0回、AWS上の清掃・復旧・費用、GitHub上の実CIは未実施。手動確認が済むまで通知は無効のままとする。gitleaks検査は導入済み環境で実行する必要がある。レビューとライフサイクルの完了処理はこの実装担当では行っていない。
