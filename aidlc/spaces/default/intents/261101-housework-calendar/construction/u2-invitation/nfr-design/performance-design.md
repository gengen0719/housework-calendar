# 速さの設計（Performance Design）— U2 招待

U2（`u2-invitation`）の速さの要件（NFR7.7〜NFR7.10）を、どう作るかを書きます。U1 の設計（DynamoDB のクライアントをグローバルで初期化、設定を起動時に読む、画面は CloudFront から配信）はそのまま使います。

## 時間の配分（95% が 3 秒以内）

| 操作 | 裏側の読み書き | 裏側の目安 | 画面の目安 |
|------|---------------|-----------|-----------|
| 家族の設定を開く（NFR7.7） | メンバーの一覧と、いまの招待を同時に呼ぶ（`Promise.all`） | 各 300 ミリ秒以内 | 合わせて 1 秒以内 |
| 招待を作る（NFR7.8） | 読み取り 1 回 + トランザクション 1 回 | 500 ミリ秒以内 | 1 秒以内 |
| 招待を開く（NFR7.9） | セッションの発行（U1）+ 読み取り 3 回 | 600 ミリ秒以内（セッションを除く） | 2 秒以内（LIFF の初期化を含む） |
| 参加する（NFR7.10） | 読み取り 3 回 + トランザクション 1 回 | 600 ミリ秒以内 | 1 秒以内 |

Lambda の起動が遅いとき（コールドスタート）でも 3 秒に収まるよう、U2 では新しい重いライブラリを足しません（印は Node.js の標準の `crypto`）。

## 工夫

- メンバーの一覧は GSI `familyId-index` の Query 1 回で、射影した項目だけで返す（Users を 1 人ずつ読まない）[Q2]
- 家族の設定の画面は、管理者のときだけ `GET /v1/family/invitation` を呼ぶ（子供は呼ばない）
- 招待を作ったあとは、応答のリンクと期限をそのまま出し、一覧を読み直さない
- 参加したあとは `GET /v1/me` を 1 回呼び直して役割を受け取り、カレンダーの枠を出す

## Sources

- `construction/u2-invitation/nfr-requirements/performance-requirements.md`
- `construction/u1-skeleton-family/nfr-design/performance-design.md`
- `nfr-design-questions.md` の回答 [Q2]

## Assumptions & Open Questions

- 時間の配分は目安で、確かめ方は NFR 要件のとおり、ステージングで 20 回ずつ測ります
