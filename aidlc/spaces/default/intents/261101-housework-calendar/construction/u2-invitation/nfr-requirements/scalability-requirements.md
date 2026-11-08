# 量と費用の要件（Scalability）— U2 招待

U2（`u2-invitation`）の量と費用の要件です。U1 の要件（NFR1.1〜NFR1.7、NFR3.1、NFR3.2）をそのまま使います。

## 量の見込み

家族は 1 つ、メンバーは 4 人です。招待を作るのは、子供が入るときの数回だけです。招待の記録は家族ごとに数件で、DynamoDB の無料枠（25 GB、読み書きのオンデマンドの量）に比べてとても小さい量です。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.8 | 招待の記録は、期限（expiresAt）から 7 日たったら DynamoDB の TTL で自動で消す [Q3]。U1 の処理済みのイベントの記録と同じやり方にする | テーブルに TTL が設定されていること |
| NFR1.9 | U2 で新しく費用のかかる AWS のサービスを足さない。招待の記録は DynamoDB（オンデマンド）、処理は U1 の画面用の Lambda に足す | CDK の構成で確かめる |
| NFR1.10 | 「LINE で送る」は LIFF の shareTargetPicker を使い、公式アカウントからのメッセージ（月 200 通の無料枠）を使わない。送るのは管理者本人の LINE から [Q4] | 裏側に push の呼び出しがないこと |
| NFR3.3 | 招待の処理は U1 の画面用の Lambda（常に動かすサーバーではない）に足し、Lambda の同時実行数の上限（NFR1.6）の中で動く | CDK の構成で確かめる |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3）
- `construction/u1-skeleton-family/nfr-requirements/scalability-requirements.md`（NFR1.1〜NFR1.7、NFR3.1、NFR3.2）
- `nfr-requirements-questions.md` の回答 [Q3]、[Q4]

## Assumptions & Open Questions

- [assumption] LIFF の shareTargetPicker で送るメッセージは利用者本人の LINE から送られるもので、公式アカウントのメッセージ数の無料枠には数えられません。B2 でステージングで確かめます
