# 見守りの要件（Observability）— U2 招待

U2（`u2-invitation`）の見守りの要件です。U1 の要件（NFR2.5〜NFR2.8、NFR7.6）をそのまま使います。ログの形（1 行 1 件の JSON、リクエスト ID、30 日）は U1 のとおりです。作り手への知らせは U10 で入れます。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.9 | 招待のできごとをログに残す: 招待を作った、参加した、断った（理由の印 `INVITATION_INVALID`・`ALREADY_IN_OTHER_FAMILY`・`ALREADY_IN_FAMILY`・`ADMIN_ONLY`）。中身は、できごとの種類、家族の ID（分かるとき）、利用者の ID、理由の印、招待の印の先頭 4 文字 [Q5] | ログの出し方の単体テスト |
| NFR2.14 | 招待の印の全体、セッショントークン、ID トークンはログに書かない（NFR5.7、U1 の NFR2.8） | 単体テストで、ログに印の全体が出ないこと |
| NFR2.15 | 使えない印の要求（`INVITATION_INVALID`）の数を、CloudWatch Logs のメトリクスフィルタで数える（無料枠の中）。しきい値は 1 時間に 20 回とし、超えたら作り手に知らせる。知らせの仕組み（アラームと送り先）は U10 で入れ、それまでは作り手が週に 1 回 CloudWatch のメトリクスを見る手順を README に書く | CDK の設定でメトリクスフィルタがあること |
| NFR7.11 | U2 の操作（`GET /v1/family/members`、`GET /v1/family/invitation`、`POST /v1/family/invitations`、`GET /v1/invitations/{token}`、`POST /v1/invitations/{token}/accept`）も、かかった時間をログに残す（U1 の NFR7.6） | ログから時間を読めること |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`
- `nfr-requirements-questions.md` の回答 [Q2]、[Q5]

## Assumptions & Open Questions

- 使えない印が続いたときに作り手に知らせるかは、U10 で知らせの仕組みを入れるときに決めます
