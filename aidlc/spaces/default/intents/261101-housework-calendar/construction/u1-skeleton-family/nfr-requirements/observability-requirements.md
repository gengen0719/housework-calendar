# 見える化の要件（Observability）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で、何が起きたかを後から確かめるための要件です。作り手へのエラーの知らせ（15 分以内。NFR2）は U10 で入れるので、U1〜U9 のあいだは作り手がログを自分で見ます（作る順の計画の Q4）。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.5 | ログは 1 行 1 件の JSON で出す。中身は、時刻（UTC）、環境、入口（画面用 API か LINE 用か）、操作、利用者の userId（分かるとき）、結果（成功、断った理由の印、思いがけない失敗）、かかった時間 | ログの出し方の単体テスト |
| NFR2.6 | 要求ごとに印（リクエスト ID）を付け、同じ要求のログを並べて見られるようにする | ログに印が入ること |
| NFR2.7 | ログは 30 日残す [Q7] | CDK の設定で確かめる |
| NFR2.8 | 秘密の情報、ID トークン、セッショントークン、LINE の Webhook の本文そのものはログに書かない（NFR5.4 と同じ） | 単体テスト |
| NFR7.6 | 速さの目標（NFR7.1〜NFR7.3）を確かめられるように、かかった時間をログに残す | ログから時間を読めること |

## 決めないこと（U1 では入れない）

- 作り手への知らせ（アラーム）と、その受け取り先: U10 で入れる
- ダッシュボード: 量が少ないので作らない。必要になったら足す

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR5、NFR7）
- `inception/delivery-planning/delivery-planning-questions.md` の Q4
- `nfr-requirements-questions.md` の回答 [Q7]

## Assumptions & Open Questions

- [assumption] U1〜U9 のあいだは、作り手がステージングの CloudWatch Logs を自分で見て、失敗に気づく
