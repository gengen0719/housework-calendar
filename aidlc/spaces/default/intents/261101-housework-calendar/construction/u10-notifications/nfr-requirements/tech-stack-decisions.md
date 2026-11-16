# 技術の選択 — U10 お知らせ

| 対象 | 選択 | 理由 |
|---|---|---|
| 言語と実行 | 既存のTypeScriptとNode.js、常駐しない通知処理 | 既存の計算と家族の窓口を再利用し、独立した常駐サーバーを追加しない。 |
| 保存 | 既存のDynamoDBを使う方針を維持。通知記録の物理形はインフラ設計で決める | 条件付き取得・更新で論理通知を一意にし、本文と重複防止記録の保持を分ける。 |
| 配信 | 既存契約C4のLINE配信と再試行キー | 家族への通知は契約済みの2種類に限定する。 |
| 定時起動と再試行 | AWSの定時処理と期限つき再試行。具体的なサービスと設定は次の設計で選ぶ | 予定時刻と対象日を固定し、15分を超えた配信を防ぐ。 |
| 障害通知 | メール。受信用アドレスは配備時の環境設定 | Q1=A。家族へのLINE配信と独立させる。 |
| テスト・整形・lint | 既存のBDD、Vitest、Prettier、ESLintを維持 | 既存機能の回帰と80%以上の行カバレッジを維持する。 |

新しい課金サービスや依存ライブラリは、この資料だけでは採用・導入しない。設計時には公式仕様と対象リージョンの料金を確かめ、配備前の検証手順を用意する。実際の受信用アドレスや鍵を設計資料に記入しない。

NFR9（画面の見やすさ）は新規画面がないためU10の新しいUI要件としては非該当。既存画面のアクセシビリティを変更しない。NFR7の3秒は既存の対話処理の回帰条件として維持し、定時通知へそのまま当てはめない。

## Sources

- `functional-design/functional-spec.md`、`functional-design/rules.md`（処理と境界）
- `inception/requirements-analysis/requirements.md`（NFR1〜NFR11）
- `inception/contract-design/contract-summary.md`（C4〜C9）
- `nfr-requirements-questions.md`（Q1=A）、`aidlc/spaces/default/memory/team.md`（テスト、配備、コードスタイル）

## Assumptions & Open Questions

None.
