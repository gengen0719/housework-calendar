# 信頼性の要件（Reliability）— U3 お知らせ先

U3（`u3-notification-group`）の信頼性の要件です。U1 の要件（NFR2.1〜NFR2.4、NFR6.1、NFR6.2、NFR10.1、NFR10.2、NFR11.1）と U2 の要件（NFR2.10〜NFR2.13、NFR6.3）をそのまま使います。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.16 | 登録し直しは、前のグループの記録を消す・新しいグループの記録を作る・家族のお知らせ先を変えるを、条件つきの 1 回のトランザクションで行う。どれかができなければ、どれも残さない（BR4.6） | 途中で失敗させて、前のお知らせ先がそのまま残ること |
| NFR2.17 | 公式アカウントが外されたときの解除は、グループの記録を消す・家族のお知らせ先を空にするを、条件つきの 1 回のトランザクションで行う（BR4.9） | 登録し直しと重ねて、どちらか一方の結果だけが残ること |
| NFR2.18 | トランザクションが競合で断られたら、読み直して 1 回だけやり直す。それでも断られたら、登録の操作には「表示できませんでした。もう一度お試しください」と返事し、leave は思いがけない失敗として 500 を返して LINE に送り直してもらう（U1 の NFR2.2） | 競合を作って、その返事と 500 になること |
| NFR2.19 | グループの名前を受け取れなかったとき（時間切れ、LINE の失敗）も、登録は続ける。名前は空のまま残し、画面は「お知らせ先: 登録済み」と出す（BR4.8、BR4.12） | LINE の失敗を作って、登録できること |
| NFR2.20 | reply を送れなかったとき（reply トークンの期限切れなど）は、登録の結果を取り消さず、ログに残す（U1 と同じ扱い。返事の印は一度しか使えないため 500 にはしない） | reply の失敗を作って、登録が残ること |
| NFR11.2 | お知らせ先の登録の時刻（registeredAt）は UTC で残し、画面には日本時間で出す（U1 の NFR11.1 を当てはめる） | 単体テスト |
| NFR6.4 | お知らせ先のデータは、アプリの操作（登録、公式アカウントを外す）でだけ変わる。本番のデータを手で書き換えない | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR6）
- `construction/u3-notification-group/functional-design/rules.md`（BR4.6〜BR4.9、BR4.12）
- `construction/u1-skeleton-family/nfr-requirements/reliability-requirements.md`、`construction/u2-invitation/nfr-requirements/reliability-requirements.md`

## Assumptions & Open Questions

- [assumption] leave で 500 を返すと、LINE は Webhook を送り直します（U1 で送り直しを有効にしてあります）
