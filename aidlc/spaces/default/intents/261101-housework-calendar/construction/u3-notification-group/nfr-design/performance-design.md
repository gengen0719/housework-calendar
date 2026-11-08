# 速さの設計（Performance Design）— U3 お知らせ先

U3（`u3-notification-group`）の速さの要件（NFR7.12〜NFR7.15）を、どう作るかを書きます。

## 時間の配分

| 操作 | 裏側の処理 | 目安 |
|------|-----------|------|
| 参加の案内（NFR7.12） | 二度処理しない記録 + reply | 1 秒以内 |
| 登録（NFR7.13） | 読み取り 2〜3 回 + グループの概要（最大 2 秒）+ トランザクション + reply | 4 秒以内（LINE の配信を含めて 10 秒以内） |
| 画面で見る（NFR7.15） | GetItem 2 回 | 300 ミリ秒以内 |

## 工夫

- グループの名前の受け取りは 2 秒で打ち切る（NFR7.14）。いまの `lineApiService.callLine` は `signal` を 5 秒の値で上書きするため、`callLine(path, init, timeoutMs = LINE_API_TIMEOUT_MS)` の形に引数を足し、`getGroupSummary` だけ 2000 を渡す（レビュー R-03）
- グループの名前を受け取る前に、別の家族のグループかどうかを確かめる（断るときは LINE を呼ばない）
- 管理者のカレンダーの枠の画面は、`GET /v1/family/notification-group` を `GET /v1/me` のあとに呼ぶ。子供は呼ばない

## Sources

- `construction/u3-notification-group/nfr-requirements/performance-requirements.md`
- `construction/u1-skeleton-family/nfr-design/performance-design.md`

## Assumptions & Open Questions

- 時間の配分は目安で、確かめ方は NFR 要件のとおりステージングで 20 回ずつ測ります
