# 配備と確認の設計 — U10 お知らせ

## 検査と反映

| 順序 | 内容 | 通過条件 |
|---|---|---|
| 1 | 既存の固定バージョンで依存を復元 | 秘密や実際のLINE・AWS接続をテストに使わない |
| 2 | 整形、lint、4パッケージの型、BDDと全体テスト | 全成功、行カバレッジ80%以上。利用者の指定により.codexはlint対象外を維持 |
| 3 | CDK構成のテストとsynth | 通知入口だけ追加、公開URLなし、キュー・権限・暗号化・保持・アラーム10個の検査が成功 |
| 4 | 秘密検査、費用と差分の確認 | 月100円以内の合算見積もり、無料枠の残り、実際の設定を確認。秘密検査が未実行なら未達と明示 |
| 5 | mainへの取り込み後にstagingへ反映 | 既存のGitHub ActionsとOIDCを使う。まず定時起動とキュー処理を無効にした構成で反映 |
| 6 | staging設定・購読確認・手動試験 | 実際のLINE送信とメール受信、二重起動、時間切れ、起動欠落、宛先変更、清掃、費用の実測 |
| 7 | 作り手の確認後にproductionへ反映 | 同じコードを手動承認の既存経路で反映。秘密と配信先は本番専用 |
| 8 | 有効化とスモーク | 設定・購読・動作確認が揃った環境だけ、キュー処理と定時起動を有効化 |

コード生成ではCDK、テスト、運用手順と既存ワークフローの必要な設定の受け渡しを準備する。この段階でAWSへ反映したり、SNS購読メール・LINE通知を実際に送ったりしない。MVPでOperationが省略されていても、未実施の実配備確認を実行済みとは扱わない。

## 互換性とロールバック

1. 新しい通知テーブルとキューを先に作り、既存のデータ・入口を削除しない。既存のインフラテストは、通知追加によって意図して変わる資源数だけ根拠を示して更新する。
2. 戻すときは定時起動とSQS連携を無効化し、処理中の15分窓が過ぎるまで待つ。キューと記録を消して再配信を誘発しない。
3. 前の実装へ戻してapi・lineの既存動作を確認する。新テーブルのバックアップから古い本文を復元しない。
4. 本番の通知記録を手で書き換えない。復旧は期限と再試行キーを保つ手順で行い、次の通常予定から再開する。

## 設定と手動確認

- 環境ごとのアラートメール、LINEの秘密とチャネル、運用識別子の鍵は作り手が登録する。秘密をGitHubの公開変数・コミット・synthのログへ出さない。
- 購読が未確認の場合は通知機能の有効化を止める。stagingとproductionはそれぞれの購読・受信を確かめる。
- 初回障害から15分以内のメール受信、予定時刻から15分後以降の送信0回、受理後に記録失敗した場合の重複0回を手順書で測る。
- 対象の子供0人・全員0円・月末・年越し・確定済み・登録先なしを確認する。共有AC1.2.4を独立した確認項目にする。
- 費用はstagingとproductionを合算する。空のキューポーリングと既存の無料枠消費を含め、100円以内の見込みを確認してから本番を有効化する。

## Sources

- `nfr-design/performance-design.md`、`security-design.md`、`scalability-design.md`、`reliability-design.md`、`observability-design.md`、`logical-components.md`
- `functional-design/functional-spec.md`、`inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- `infrastructure-specification.md`、`monitoring-design.md`、`infrastructure-design-questions.md`（Q1=A、Q2=B 月100円）
- `aidlc/spaces/default/memory/team.md`（GitHub Actions、OIDCを使う既存の反映経路、staging自動・本番手動）

## Assumptions & Open Questions

None.
