# 見守りの設計（Monitoring Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の見える化の設計（`nfr-design/observability-design.md`）を、AWS の仕組みに置き換えたものです。作り手へのエラーの知らせ（アラーム）は U10 で入れます（作る順の計画の Q4）。U1〜U9 のあいだは、作り手が CloudWatch Logs を自分で見ます。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|--------|--------|-----------|----------------|
| Lambda の `Errors`（`api`、`line`） | CloudWatch の Lambda の標準の数値 | 0 より大きい | 思いがけない失敗が起きた |
| Lambda の `Throttles` | 同上 | 0 より大きい | 同時実行数の上限（NFR1.6）に当たり、利用者が断られた |
| Lambda の `Duration`（p95） | 同上 | `api` 3 秒、`line` 10 秒 | 速さの目標（NFR7.1〜NFR7.3） |
| CloudFront の `5xxErrorRate` | CloudFront の標準の数値 | 0 より大きい | 入口か裏側の失敗 |
| ログの `durationMs`（`REQUEST_END`） | CloudWatch Logs（JSON のログ） | 画面 3 秒、LINE 10 秒 | 要求ごとの速さを確かめる（NFR7.6） |
| 月の費用の見込み | AWS Budgets | 1 ドル | 費用 0 円（NFR1.7） |

数値はどれも AWS が無料で集めるもので、U1 では集めるための追加の設定はしません。

## Alerts

| Alert | Condition | Severity | Routes to |
|-------|-----------|----------|-----------|
| 費用の見込み | AWS Budgets で月の見込みが 1 ドルを超えた | 高 | 作り手のメール（Budgets から直接） |
| 裏側のエラー、お知らせの失敗 | U10 で入れる（NFR2、15 分以内） | — | U10 で決める |

## SLIs / SLOs

| SLI | SLO target | Measurement window |
|-----|------------|--------------------|
| 画面の表示と操作が 3 秒以内に終わった割合 | 95% | B1 のステージングでの 20 回の計測。以後は必要なときに `REQUEST_END` のログで見る |
| LINE のトークの返事が 10 秒以内に届いた割合 | 95% | 同上 |

稼働率の目標は置きません（NFR2）。

## Logs & Tracing

- ログは Lambda の標準出力に 1 行 1 件の JSON で出し、CloudWatch Logs に入ります（`nfr-design/observability-design.md`）。ロググループは Lambda ごとに CDK で作り、30 日で消します
- 要求ごとの印（`context.awsRequestId`）をすべてのログ行に付けます。CloudFront の要求 ID（`x-amz-cf-id`）もログに入れ、画面からの要求と裏側のログを結び付けます
- 調べるときは CloudWatch Logs Insights で `requestId`、`userId`、`event` で絞り込みます（使った分だけ費用がかかりますが、作り手が時々使う量なら数円未満）
- 分散トレーシング（X-Ray）は使いません。入口が 2 つで、量も少ないためです
- ダッシュボードは作りません。必要になったら足します

## Sources

- `construction/u1-skeleton-family/nfr-design/observability-design.md`
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`、`performance-requirements.md`、`scalability-requirements.md`
- `inception/delivery-planning/delivery-planning-questions.md` の Q4（作り手への知らせは U10）

## Assumptions & Open Questions

- [assumption] CloudWatch の Lambda と CloudFront の標準の数値は追加の費用なしで見られる
