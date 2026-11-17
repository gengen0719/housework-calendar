# 監視の構成 — U10 お知らせ

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|---|---|---|---|
| Errors（api、line、notify別） | AWS/Lambda | 1分Sumが1以上、1期間 | 入口の例外・時間切れを検知 |
| NotifyHealth | Housework/環境、毎分の監視確認が0か1を送る | 5分Minimumが1未満、欠測は異常 | 予定のRUN未完了、初回失敗、キュー滞留、監視確認の停止を検知 |
| ApproximateAgeOfOldestMessage | WorkQueue | 120秒以上、1分、1期間 | 期限内の仕事の滞留 |
| ApproximateNumberOfMessagesVisible | DLQ | 1以上、1分、1期間 | 自動復旧しなかった仕事 |
| 成功・省略・重複・失敗・期限切れ・初回遅延 | 通知の定型JSONログ | 記録と実測 | 高カーディナリティのカスタムメトリクスを増やさず調査 |

NotifyHealthは同じnamespace・名前で、家族や日付のdimensionを付けない。新規メトリクスはNotifyHealthだけで、既存のInvitationInvalidCountは維持する。毎分の監視確認は、予定時刻から5分経過したRUNが未完了、またはキューの最古の仕事が120秒以上なら0を出し、SNSへ定型の通知を出す。予定も滞留もない時間帯は1。確認自体が止まるとメトリクスも欠測する。状態を読めなかった場合は1と偽らず、失敗として通知する。

## Alerts

| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| ApiErrors | apiのErrorsが1以上 | 高 | 環境別SNSメール |
| LineErrors | lineのErrorsが1以上 | 高 | 環境別SNSメール |
| NotifyErrors | notifyのErrorsが1以上 | 高 | 環境別SNSメール |
| NotifyHealth | 異常値または欠測 | 高 | 環境別SNSメール |
| DeadLetters | DLQが1件以上 | 高 | 環境別SNSメール |

上記5個を各環境に作る。キュー滞留はNotifyHealthへ集約して独立したアラームを増やさない。疎なエラー・DLQのアラームは欠測を正常として扱い、NotifyHealthだけは欠測を異常として扱う。正常な省略にはメールを出さない。戻り値で処理済みとなる内部エラー・初回の外部配信失敗・清掃失敗はコードからSNSへ直ちに定型通知し、例外にならない失敗をnative Errorsだけに頼らない。

## SLIs / SLOs

| SLI | SLO target | Measurement window |
|---|---|---|
| 初回送信試行の遅延 | 正常時60秒以内を20回中19回 | ステージング20回 |
| 失敗から作り手のメール受信 | 15分以内 | 3入口・送信失敗・起動欠落を各試験 |
| 同じ通知の別キー受理 | 0回 | 重複・中断・再送の全試験 |
| 期限後に開始した外部送信 | 0回 | 境界試験と運用ログ |

検知5分・監視評価と通知5分・メール受信5分を予算とする。CloudWatchの評価は厳密な到着保証ではないため、実際の受信を測定し、15分を超えれば未達として配備前に対処する。SNS購読未確認やメール未着を成功と記録しない。

## Logs & Tracing

| 対象 | 方針 |
|---|---|
| ログ | 環境別、30日。nfr-design/observability-design.mdの許可項目だけ。異常の詳細は分類ごと20件まで |
| メール | 名前・金額・本文・LINE識別子・メールアドレス・秘密を含めない。種類、対象日、運用識別子、理由の分類と手順参照 |
| 追跡 | 新しい有料トレースを常時有効にしない。相関識別子を定型ログへ残す |
| ダッシュボード | 既存の自動表示と保存済みの調査手順を使う。追加の有料ダッシュボードを作らない |
| 費用 | Budgetsの80%・100%通知、月間要求・ログ量・アラーム数を確認。月100円は強制停止ではない |

## Sources

- `nfr-design/observability-design.md`、`performance-design.md`、`security-design.md`、`scalability-design.md`、`reliability-design.md`、`logical-components.md`
- `functional-design/functional-spec.md`、`inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- [CloudWatch料金](https://aws.amazon.com/cloudwatch/pricing/)、[CloudWatch欠測の扱い](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html)（2026-11-15確認）

## Assumptions & Open Questions

None.
