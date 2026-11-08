# 見守りの設計（Monitoring Design）— U2 招待

U2（`u2-invitation`）で U1 の見守り（`construction/u1-skeleton-family/infrastructure-design/monitoring-design.md`）に足すものです。

## Metrics & KPIs

| Metric | Source | Threshold | Meaning |
|--------|--------|-----------|---------|
| `Housework/<env>/InvitationInvalidCount` | CloudWatch Logs のメトリクスフィルタ（Lambda `api` のロググループ） | 1 時間に 20 回を超える | 使えない印での招待を開く・参加するが続いている（総当たりのおそれ）（NFR2.15） |
| Lambda `api` の `Errors`、`Throttles` | Lambda（U1） | U1 のとおり | U2 の操作の思いがけない失敗と、同時実行数の上限も含まれる |
| ログの `INVITATION_CREATED`、`INVITATION_ACCEPTED` の数 | CloudWatch Logs Insights（必要なときに作り手が問い合わせる） | なし | 招待と参加が使われているか |

## Alerts

| Alert | Condition | Channel | Severity |
|-------|-----------|---------|----------|
| 使えない印が多い | `InvitationInvalidCount` の 1 時間の合計 > 20 | U10 で足す（それまでは作り手が週に 1 回メトリクスを見る。README） | 中 |
| 費用 | U1 の Budgets（月 1 ドル） | メール（U1） | 高 |

## SLIs / SLOs

| SLI | SLO | 測り方 |
|-----|-----|-------|
| 家族の設定を開く・招待を作る・招待を開く・参加するの時間 | 95% が 3 秒以内（NFR7.7〜NFR7.10） | ログの `REQUEST_END` の `durationMs`（`path` はパスの型）を Logs Insights で集計する |

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID、30 日 |
| 招待のできごと | `INVITATION_CREATED`、`INVITATION_ACCEPTED`、`INVITATION_REJECTED`（`nfr-design/observability-design.md`） |
| 印を伏せる | `path` はパスの型、印は先頭 4 文字（`tokenPrefix`）だけ。CloudFront と関数 URL のアクセスログは有効にしない |
| 追跡 | U1 と同じく、分散トレースは使わない（Lambda 1 つの中で終わるため） |

Logs Insights で招待を見る問い合わせの例（作り手が手で使う）:

```
fields @timestamp, event, reason, familyId, userId, tokenPrefix
| filter event like /^INVITATION_/
| sort @timestamp desc
| limit 50
```

## Sources

- `construction/u2-invitation/nfr-design/observability-design.md`
- `construction/u2-invitation/nfr-requirements/observability-requirements.md`、`performance-requirements.md`
- `construction/u1-skeleton-family/infrastructure-design/monitoring-design.md`

## Assumptions & Open Questions

- アラームと知らせの送り先は U10 で足します。それまで、使えない印が多いことには作り手がメトリクスを見て気づきます
