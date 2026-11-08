# 見守りの要件（Observability）— U3 お知らせ先

U3（`u3-notification-group`）の見守りの要件です。U1 の要件（NFR2.5〜NFR2.8、NFR7.6）と U2 の要件（NFR2.9、NFR2.14、NFR2.15、NFR7.11）をそのまま使います。作り手への知らせは U10 で入れます。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.21 | お知らせ先のできごとをログに残す: `GROUP_JOINED`（参加）、`NOTIFICATION_GROUP_REGISTERED`（登録。置き換えなら前のグループ ID も）、`NOTIFICATION_GROUP_REJECTED`（断った。理由の印 `ADMIN_ONLY`・`GROUP_USED_BY_OTHER_FAMILY`）、`NOTIFICATION_GROUP_UNREGISTERED`（外された）、`GROUP_COMMAND_REJECTED`（登録されていない・メンバーでない）。中身は、できごとの種類、グループ ID の全体 [Q1]、家族の ID（分かるとき）、利用者の ID（分かるとき） | ログの出し方の単体テスト |
| NFR2.22 | グループの名前、メッセージの本文、表示名はログに書かない（NFR5.8） | 単体テスト |
| NFR2.23 | グループの名前を受け取れなかったとき、reply を送れなかったときは、warn でログに残す（NFR2.19、NFR2.20） | 単体テスト |
| NFR7.16 | U3 の LINE のイベントの処理と `GET /v1/family/notification-group` も、かかった時間をログに残す（U1 の NFR7.6） | ログから時間を読めること |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`、`construction/u2-invitation/nfr-requirements/observability-requirements.md`
- `nfr-requirements-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- お知らせ先が外されたことを作り手に知らせるかは、U10 で決めます
