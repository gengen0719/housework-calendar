# 見守りの要件（Observability）— U4 お手伝いの種類

U4（`u4-chore-types`）の見守りの要件です。U1〜U3 の要件（ログの形、リクエスト ID、30 日、書かないもの）をそのまま使います。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.27 | 種類のできごとをログに残す: `CHORE_TYPE_CREATED`、`CHORE_TYPE_UPDATED`（単価を変えたら前と後の単価も）、`CHORE_TYPE_ACTIVE_CHANGED`、`CHORE_TYPE_DELETED`、`CHORE_TYPE_REJECTED`（理由の印）。中身は、できごとの種類、家族の ID、利用者の ID、種類の ID。名前と説明は書かない（家族が付けた文字のため） | ログの出し方の単体テスト |
| NFR7.19 | U4 の操作も、かかった時間をログに残す（U1 の NFR7.6。`path` はパスの型 `/v1/chore-types/:choreTypeId`） | ログから時間を読めること |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u2-invitation/nfr-requirements/observability-requirements.md`、`construction/u3-notification-group/nfr-requirements/observability-requirements.md`

## Assumptions & Open Questions

- 単価の変更をログに残すのは、お小遣いの金額について家族から聞かれたときに、いつ単価が変わったかを作り手が確かめられるようにするためです
