# 速さの要件（Performance）— U4 お手伝いの種類

U4（`u4-chore-types`）の速さの要件です。U1 の要件（NFR7.1〜NFR7.6）をそのまま使い、U4 の操作に当てはめます。

## 目標

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.17 | お手伝いの種類の画面を開く（押してから一覧が出るまで） | 95% が 3 秒以内 | ステージングで 20 回開き、19 回以上が 3 秒以内 |
| NFR7.18 | 登録・変更・使わない・使う・消す（押してから一覧に反映されるまで） | 95% が 3 秒以内 | ステージングで操作ごとに 20 回、19 回以上が 3 秒以内 |

種類の数に上限はありませんが（機能設計の [Q6]）、家族で使う数十件ほどの一覧は 1 回で返し、3 秒に収まる量です。

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7）
- `construction/u1-skeleton-family/nfr-requirements/performance-requirements.md`
- `construction/u4-chore-types/functional-design/functional-spec.md`

## Assumptions & Open Questions

- 種類が数百件を超えて一覧が遅くなったときの分け方は、必要になったら後の版で決めます
