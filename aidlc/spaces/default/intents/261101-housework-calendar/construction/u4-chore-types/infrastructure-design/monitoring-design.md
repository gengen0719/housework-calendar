# 見守りの設計（Monitoring Design）— U4 お手伝いの種類

U4（`u4-chore-types`）で、U1〜U3 の見守りに足すものです。新しいメトリクスやアラームは足しません（知らせの仕組みは U10）。

## Metrics & KPIs

| Metric | Source | Threshold | Meaning |
|--------|--------|-----------|---------|
| Lambda `api` の `Errors`、`Throttles` | Lambda（U1） | U1 のとおり | U4 の操作の思いがけない失敗も含まれる |
| ログの `CHORE_TYPE_UPDATED` の `unitPriceBefore`・`unitPriceAfter` | CloudWatch Logs Insights（作り手が必要なときに問い合わせる） | なし | いつ単価が変わったか（お小遣いの金額を聞かれたとき） |

## Alerts

| Alert | Condition | Channel | Severity |
|-------|-----------|---------|----------|
| 費用 | U1 の Budgets（月 1 ドル） | メール（U1） | 高 |

## SLIs / SLOs

| SLI | SLO | 測り方 |
|-----|-----|-------|
| 種類の画面を開く・操作の時間 | 95% が 3 秒以内（NFR7.17、NFR7.18） | `REQUEST_END` の `durationMs`（`path` は `/v1/chore-types`、`/v1/chore-types/:choreTypeId`） |

## Logs & Tracing

| 項目 | 内容 |
|------|------|
| ログの形 | U1 のとおり 1 行 1 件の JSON、リクエスト ID、30 日 |
| 種類のできごと | `nfr-design/observability-design.md` のとおり |
| 書かないもの | 種類の名前と説明（型と実行時の伏せ字の両方） |

単価の変わり方を見る問い合わせの例（作り手が手で使う）:

```
fields @timestamp, choreTypeId, unitPriceBefore, unitPriceAfter, userId
| filter event = "CHORE_TYPE_UPDATED" and ispresent(unitPriceAfter)
| sort @timestamp desc
| limit 50
```

## Sources

- `construction/u4-chore-types/nfr-design/observability-design.md`
- `construction/u4-chore-types/nfr-requirements/performance-requirements.md`
- `construction/u3-notification-group/infrastructure-design/monitoring-design.md`

## Assumptions & Open Questions

- なし
