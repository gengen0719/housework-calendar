# 見守りの要件（Observability）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の見守りの要件です。U1〜U4 の要件（ログの形、リクエスト ID、30 日、書かないもの）をそのまま使います。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.32 | 割り当てと担当のできごとをログに残す: `ASSIGNMENT_SAVED`（月、初めてか保存し直しか、作った・変えた・消した担当の数、上書きを確かめたか）、`ASSIGNMENT_REJECTED`（理由の印）、`ASSIGNMENT_PARTIAL_FAILURE`（書けたまとまりの数）、`DUTY_CHILD_CHANGED`（担当の ID、前と後の子供の ID）、`DUTY_CHANGE_REJECTED`。中身は家族の ID、利用者の ID。種類の名前と子供の表示名は書かない | ログの出し方の単体テスト |
| NFR7.24 | U5 の操作も、かかった時間をログに残す（U1 の NFR7.6。`path` はパスの型 `/v1/months/:month/calendar` など）。保存は、担当の数も残す（3 秒の目標を担当の数と照らせるように） | ログから時間と数を読めること |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u4-chore-types/nfr-requirements/observability-requirements.md`

## Assumptions & Open Questions

- 保存の途中の失敗を作り手に知らせる仕組みは U10 で入れます
