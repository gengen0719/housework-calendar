# 速さの要件（Performance）— U2 招待

U2（`u2-invitation`）の速さの要件です。U1 の要件（NFR7.1〜NFR7.6）をそのまま使い、U2 の操作に当てはめます。

## 目標

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.7 | 家族の設定の画面を開く（「家族の設定」を押してから、メンバーの一覧と、管理者ならいまのリンクが出るまで） | 95% が 3 秒以内 | ステージングで 20 回開き、19 回以上が 3 秒以内 |
| NFR7.8 | 招待用のリンクを作る（押してからリンクが出るまで） | 95% が 3 秒以内 | ステージングで 20 回作り、19 回以上が 3 秒以内 |
| NFR7.9 | 招待のリンクを開く（リンクを開いてから「（家族の名前）に参加しますか？」が出るまで。セッションの発行を含む） | 95% が 3 秒以内 | ステージングで 20 回開き、19 回以上が 3 秒以内 |
| NFR7.10 | 参加する（「参加する」を押してからカレンダーの枠が出るまで） | 95% が 3 秒以内 | ステージングで 20 回参加し（参加のあとはテスト用の手順でデータを戻す）、19 回以上が 3 秒以内 |

Lambda の時間切れ（30 秒）と、LINE への呼び出しの時間切れ（5 秒）は U1 の NFR7.4、NFR7.5 のとおりです。U2 の操作は LINE の API を呼びません（セッションの発行を除く）。「LINE で送る」は画面から LINE の機能を開くだけで、裏側の時間には含めません。

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7）
- `construction/u1-skeleton-family/nfr-requirements/performance-requirements.md`（NFR7.1〜NFR7.6）
- `construction/u2-invitation/functional-design/functional-spec.md`（F1〜F6）

## Assumptions & Open Questions

- 参加の確かめでステージングのデータを戻す手順は、テストの段階で用意します。本番のデータは手で書き換えません（NFR6）
