# 見守りの設計（Monitoring Design）— U3 お知らせ先

U3（`u3-notification-group`）で、U1・U2 の見守りに足すものです。新しいメトリクスやアラームは足しません（知らせの仕組みは U10）。

## Metrics & KPIs

| Metric | Source | Threshold | Meaning |
|--------|--------|-----------|---------|
| Lambda `line` の `Errors`、`Throttles` | Lambda（U1） | U1 のとおり | U3 の join・leave・登録の思いがけない失敗も含まれる |
| ログの `NOTIFICATION_GROUP_REGISTERED`、`NOTIFICATION_GROUP_UNREGISTERED` | CloudWatch Logs Insights（作り手が必要なときに問い合わせる） | なし | お知らせ先が登録・解除されたか |
| ログの `GROUP_SUMMARY_FAILED` | CloudWatch Logs Insights | なし | グループの名前を受け取れなかった |

## Alerts

| Alert | Condition | Channel | Severity |
|-------|-----------|---------|----------|
| 費用 | U1 の Budgets（月 1 ドル） | メール（U1） | 高 |
| お知らせ先が外された | U10 で決める | U10 | — |

## SLIs / SLOs

| SLI | SLO | 測り方 |
|-----|-----|-------|
| 参加の案内と登録の返事の時間 | 95% が 10 秒以内（NFR7.12、NFR7.13） | ステージングで 20 回ずつ測る。裏側の時間は `LINE_EVENT_DONE` の `durationMs` |
| 画面でお知らせ先を見る時間 | 95% が 3 秒以内（NFR7.15） | `REQUEST_END` の `durationMs`（`path` は `/v1/family/notification-group`） |

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID、30 日 |
| お知らせ先のできごと | `nfr-design/observability-design.md` のとおり。グループ ID は全体を書く |
| 書かないもの | グループの名前、メッセージの本文、表示名（型と実行時の伏せ字の両方） |
| ただの会話 | 二度処理しない記録の前に打ち切り、`LINE_EVENT_IGNORED` だけを残す |

Logs Insights でお知らせ先を見る問い合わせの例（作り手が手で使う）:

```
fields @timestamp, event, reason, groupId, familyId, userId
| filter event like /GROUP/
| sort @timestamp desc
| limit 50
```

## Sources

- `construction/u3-notification-group/nfr-design/observability-design.md`
- `construction/u3-notification-group/nfr-requirements/performance-requirements.md`
- `construction/u2-invitation/infrastructure-design/monitoring-design.md`

## Assumptions & Open Questions

- `LINE_EVENT_IGNORED` はただの会話のたびに 1 行出ます。家族のグループの会話の量では、CloudWatch Logs の無料枠（5 GB）に収まります
