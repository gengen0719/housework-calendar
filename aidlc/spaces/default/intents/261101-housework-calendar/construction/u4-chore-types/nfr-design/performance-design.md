# 速さの設計（Performance Design）— U4 お手伝いの種類

U4（`u4-chore-types`）の速さの要件（NFR7.17、NFR7.18）を、どう作るかを書きます。

## 時間の配分

| 操作 | 裏側の処理 | 目安 |
|------|-----------|------|
| 一覧（NFR7.17） | Query 1 回 | 300 ミリ秒以内 |
| 登録・変更（NFR7.18） | 読み取り 1〜2 回 + トランザクション 1 回 | 500 ミリ秒以内 |
| 使わない・使う | Update 1 回 | 300 ミリ秒以内 |
| 消す | Update 1 回 + 確かめ + トランザクション 1 回 | 600 ミリ秒以内 |

## 工夫

- 操作のあとは、応答の種類をそのまま画面の一覧に反映し、一覧を読み直さない（消すの 404・409 のときだけ読み直す）
- 確かめの関数は画面でも先に動かし、明らかな入力の誤りでは裏側を呼ばない（AC2.1.2 の文言をすぐ出す）

## Sources

- `construction/u4-chore-types/nfr-requirements/performance-requirements.md`
- `construction/u4-chore-types/nfr-design/scalability-design.md`

## Assumptions & Open Questions

- 時間の配分は目安で、確かめ方は NFR 要件のとおりステージングで 20 回ずつ測ります
