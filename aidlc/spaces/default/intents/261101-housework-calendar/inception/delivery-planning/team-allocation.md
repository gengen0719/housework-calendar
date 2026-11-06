# 担当の割り当て（Team Allocation）

どの Bolt を誰が作るかです。Bolt（ボルト）は、作業単位をひととおり作り、動くものができるところまで進める 1 回分の作業のことです（一覧は `bolt-plan.md`）。

## 割り当て

この進め方（mvp）では、チームの編成の段階を行いません。人のチームはなく、作り手 1 人と AI で進めます（要件の制約「作るのも手入れするのも 1 人」）。

| Bolt | 作業単位 | 作る担当 | 確かめて承認する人 |
|------|---------|---------|------------------|
| B1 | U1 最初の形と家族を作る | aidlc-developer-agent（AI） | 作り手 |
| B2 | U2 招待 | aidlc-developer-agent（AI） | 作り手 |
| B3 | U3 お知らせ先 | aidlc-developer-agent（AI） | 作り手 |
| B4 | U4 お手伝いの種類 | aidlc-developer-agent（AI） | 作り手 |
| B5 | U5 割り当てとカレンダー | aidlc-developer-agent（AI） | 作り手 |
| B6 | U6 記録 | aidlc-developer-agent（AI） | 作り手 |
| B7 | U7 確認・修正と確定 | aidlc-developer-agent（AI） | 作り手 |
| B8 | U8 代わりにやる | aidlc-developer-agent（AI） | 作り手 |
| B9 | U9 お小遣いの額 | aidlc-developer-agent（AI） | 作り手 |
| B10 | U10 お知らせ | aidlc-developer-agent（AI） | 作り手 |
| B11 | U11 加算・減額 | aidlc-developer-agent（AI） | 作り手 |

## 作り手がすること

- Bolt を作り始める前の外の準備（LINE のチャネル、AWS、GitHub。`external-dependency-map.md`）
- 各 Bolt の計画と、できあがりの確かめと承認。B1 はステージングで実際に動かして承認する
- 本番への反映（ステージングで確かめてから手で行う）

チームが 1 つだけなので、複数のチームの作業を並べる表（Program Board）は使いません。

## Sources

- `bolt-plan.md`
- `inception/requirements-analysis/requirements.md`（制約: 作るのも手入れするのも 1 人）
- `aidlc/spaces/default/memory/team.md`（配備）
- `delivery-planning-questions.md` の回答 [Q1]、[Q2]

## Assumptions & Open Questions

- None.
