# 量と費用の要件（Scalability）— U3 お知らせ先

U3（`u3-notification-group`）の量と費用の要件です。U1 の要件（NFR1.1〜NFR1.7、NFR3.1、NFR3.2）と U2 の要件（NFR1.8〜NFR1.11、NFR3.3）をそのまま使います。

## 量の見込み

家族は 1 つ、お知らせ先のグループは 1 つです。登録の操作は数回だけです。グループの会話は Webhook として届きますが、アプリの操作でなければ何もせず、DynamoDB にも書きません（同じイベントを二度処理しない記録だけは U1 のとおり残ります）。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.12 | 返事はすべて reply で送り、push は使わない（公式アカウントのメッセージ数の無料枠 月 200 通を U3 では使わない）。登録し直したときも、前のグループには送らない（BR4.6） | 裏側に push の呼び出しがないこと |
| NFR1.13 | グループの名前の受け取り（LINE の Messaging API）は、登録のときだけ呼ぶ（呼び出しは無料）[Q2] | 画面を開いても LINE を呼ばないこと |
| NFR1.14 | U3 で新しく費用のかかる AWS のサービスを足さない。お知らせ先の記録は DynamoDB（オンデマンド）、処理は U1 の Lambda（`line`、`api`）に足す | CDK の構成で確かめる |
| NFR3.4 | 家族のグループの会話（アプリの操作でないもの）でも Lambda は動くが、DynamoDB への書き込みは U1 の同じイベントを二度処理しない記録（イベント ID と状態だけ。本文・グループの名前は入れない。7 日で TTL により消える）だけにし、返事もしない。会話の量が増えても、費用は Lambda の無料枠（月 100 万回）の中に収まる | 単体テストで、ただの会話でイベントの記録以外の書き込みがなく、返事もないこと |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3）
- `construction/u1-skeleton-family/nfr-requirements/scalability-requirements.md`、`construction/u2-invitation/nfr-requirements/scalability-requirements.md`
- `nfr-requirements-questions.md` の回答 [Q2]

## Assumptions & Open Questions

- [assumption] 家族のグループの会話は 1 日に数十件ほどで、Lambda と DynamoDB の量は小さいままです
