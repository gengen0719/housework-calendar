# 速さの要件（Performance）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の速さの要件です。U1 の要件（NFR7.1〜NFR7.6）をそのまま使い、U5 の操作に当てはめます。

## 目標

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.20 | アプリを開いてから今月のカレンダーが出るまで（セッションの発行を含む）（AC4.1.6） | 95% が 3 秒以内 | ステージングで家族 4 人分（子供 3 人、種類 4 つ、1 か月分の担当約 124 件）のデータを用意し、20 回開いて 19 回以上が 3 秒以内 |
| NFR7.21 | 前の月・次の月、日の詳細を開く | 95% が 3 秒以内 | ステージングで 20 回ずつ |
| NFR7.22 | 割り当ての保存（約 124 件の担当を作る・作り直す） | 95% が 3 秒以内 | ステージングで、担当がない月の保存と、作り直しのある保存を 20 回ずつ |
| NFR7.23 | 日ごとの担当の変更 | 95% が 3 秒以内 | ステージングで 20 回 |

20 回の測定には、Lambda の起動の遅れ（コールドスタート）を含めます（最初の 1 回や、しばらく使わなかったあとの 1 回も数える。家族が実際に開くときと同じ条件にするため。レビュー）。

## 量の前提

1 か月の担当は、種類 4 つ × 31 日でおよそ 124 件です。種類の数に上限はない（U4）ので、種類が増えると担当も増えます。種類 10 個（約 310 件）でも上の目標に収まることを確かめます。

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7）
- `inception/user-stories/stories.md`（AC4.1.6）
- `construction/u1-skeleton-family/nfr-requirements/performance-requirements.md`
- `construction/u5-assignment-calendar/functional-design/rules.md`（BR6.5、BR6.6、BR6.8）

## Assumptions & Open Questions

- 種類が 10 個を大きく超えて保存が 3 秒を超えるときの扱いは、必要になったら後の版で決めます
