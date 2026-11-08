# 速さの要件（Performance）— U3 お知らせ先

U3（`u3-notification-group`）の速さの要件です。U1 の要件（NFR7.1〜NFR7.6）をそのまま使い、U3 の操作に当てはめます。

## 目標

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.12 | 公式アカウントがグループに参加してから、ボタンつきの案内が届くまで | 95% が 10 秒以内（U1 の NFR7.3 と同じ LINE のトークの返事） | ステージングで 20 回参加させ、19 回以上が 10 秒以内 |
| NFR7.13 | ボタンを押す・「登録」と送ってから、登録できた・断ったの返事が届くまで | 95% が 10 秒以内 | ステージングで 20 回操作し、19 回以上が 10 秒以内 |
| NFR7.14 | グループの名前の受け取りの時間切れ | 2 秒（超えたら名前なしで登録する。BR4.8） | 単体テストで時間切れのときに登録が続くこと |
| NFR7.15 | 管理者がカレンダーの枠の画面を開いてから、お知らせ先がないときの表示が出るまで | 95% が 3 秒以内（U1 の NFR7.1 と同じ） | ステージングで 20 回開き、19 回以上が 3 秒以内 |

LINE の reply トークンは届いてから短い時間で使えなくなるため、登録の処理（読み取り、グループの名前、トランザクション、reply）は Lambda の中で続けて行います。

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7）
- `construction/u1-skeleton-family/nfr-requirements/performance-requirements.md`
- `construction/u3-notification-group/functional-design/rules.md`（BR4.8）

## Assumptions & Open Questions

- [assumption] LINE の reply トークンは、Webhook を受け取ってから 1 分ほど使えます（LINE Developers の Messaging API リファレンスの記述。B3 でもう一度確かめる）。U3 の処理は Lambda の時間切れ（30 秒。U1 の NFR7.4）の中で終わり、10 秒の目標もその時間の中に収まります（レビュー R-06）
