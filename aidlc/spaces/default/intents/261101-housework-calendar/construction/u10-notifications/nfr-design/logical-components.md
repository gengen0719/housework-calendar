# 論理構成 — U10 お知らせ

| 部品 | 責務 | 障害の範囲と分離 |
|---|---|---|
| 定時起動 | 日本時間16時と月末21時の論理入力を作る | 起動欠落を独立監視で検出 |
| 家族の列挙 | C6の内部窓口からページ単位で範囲を決める | 列挙失敗を通知。外部指定の家族は使わない |
| 永続キュー | 家族ごとの仕事と再試行を保持 | 重複配信を前提にし、通知記録で抑止 |
| 配信調整 | 種類・期限・送信先・対象条件を検証 | 家族ごと最大2並行。対話処理を待たせない |
| 本文作成 | C6〜C9の窓口から一覧と合計を作る | 部分失敗でその家族の送信を中止 |
| 通知記録 | 一意性、版、所有期限、本文とキーの固定 | 条件付き更新。保存不可なら配信しない |
| 外部配信 | 同じキー・本文で受理を確認 | 5秒上限、最大3試行、期限内だけ |
| 監視とメール | 3入口と起動欠落を作り手へ知らせる | 家族へのLINE配信とは独立 |
| 清掃 | 一時本文と古い記録を削除する | 読み取り期限を別に検証し清掃失敗を監視 |

新たな常駐処理は置かない。通知の入口は既存の3入口という単位構成を維持し、定時起動とキューを同じ通知用入口で種類別に取り扱う。定時起動用の論理入力C5と内部キューの入力を別に検証する。物理的なサービス、テーブル、索引、権限と監視の設定はインフラ設計で決める。

設計の対応: `performance-design.md`は遅延と並行数、`security-design.md`は境界・保持・版、`scalability-design.md`は容量と費用、`reliability-design.md`は状態と再試行、`observability-design.md`は検知と受信を受け持つ。

## Sources

- `nfr-requirements/performance-requirements.md`、`security-requirements.md`、`scalability-requirements.md`、`reliability-requirements.md`、`observability-requirements.md`、`tech-stack-decisions.md`
- `functional-design/functional-spec.md`、`inception/contract-design/contract-summary.md`（C4〜C9）

## Assumptions & Open Questions

None.
