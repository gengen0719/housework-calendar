# 速さの要件（Performance）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の速さの目標です。目安は作る順の計画（`inception/delivery-planning/delivery-planning-questions.md` の Q7）で決めた値で、要件の NFR7（どちらも 3 秒以内）より新しい決定です。

## 要件

| ID | 要件 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.1 | 画面の表示（画面を開いてから最初の画面が出るまで。セッションの発行と `GET /me` を含む） | 95% が 3 秒以内 | ステージングで画面を 20 回開き、19 回以上が 3 秒以内 |
| NFR7.2 | 画面の操作（「家族を作る」を押してから結果が出るまで） | 95% が 3 秒以内 | ステージングで 20 回操作し、19 回以上が 3 秒以内 |
| NFR7.3 | LINE のトークの返事（友だち登録してから返事が届くまで） | 95% が 10 秒以内 | ステージングで 20 回友だち登録（ブロックと登録し直し）し、19 回以上が 10 秒以内 |
| NFR7.4 | Lambda の 1 回の処理の時間切れ | 30 秒（それを超えたら止める） | CDK の設定で確かめる |
| NFR7.5 | LINE への呼び出し（ID トークンの確かめ、プロフィールの取得、返事）の時間切れ | 1 回 5 秒 | 設定で確かめる。超えたら思いがけない失敗として扱う |

## 考え方

- Lambda が久しぶりに起動するときは、起動の時間（コールドスタート）がかかります。家族 4 人の使い方では、ほとんどの要求がこの起動を含むと考えて、目標を確かめます
- 画面はセッショントークンをメモリにだけ持つので（`security-requirements.md` の NFR4.3）、画面を開くたびにセッションの発行が入ります。NFR7.1 はそれを含めた時間です
- Lambda のメモリの大きさなどの調整は、NFR の設計の段階で決めます

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7）
- `inception/delivery-planning/delivery-planning-questions.md` の Q7（画面 3 秒、LINE 10 秒）
- `construction/u1-skeleton-family/functional-design/functional-spec.md`（F1、F3、F4、F5）
- `nfr-requirements-questions.md` の回答 [Q2]、[Q3]、[Q7]

## Assumptions & Open Questions

- [assumption] 家族 4 人の量なら、Lambda の起動の時間を含めても画面 3 秒、LINE 10 秒に収まる。B1 でステージングで測って確かめる
