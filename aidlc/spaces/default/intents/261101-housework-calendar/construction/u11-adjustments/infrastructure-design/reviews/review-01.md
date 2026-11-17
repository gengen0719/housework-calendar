## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-16T00:16:25Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u11-adjustments/infrastructure-design/infrastructure-specification.md > Infrastructure Services・Backup and Restore | 通知を既定無効のまま維持しつつ既存backup起動へ調整表を足す設計だが、現在の既存機構では両立しない。`notification-construct.ts`はBackupを含む全SchedulerとアラームアクションをnotificationsEnabledで無効化し、`entries/notify.ts`もNOTIFICATIONS_ENABLEDがtrueでなければbackup分岐より前に拒否する。対象表を許可リストへ追加するだけでは、U11を使い始めても日次バックアップが動かず、今回の保護要件を満たせない。 | 外向きLINE通知・SQS配信の有効化から、backup等の維持管理と必要な障害通知を分離する。通知無効でも調整のバックアップは予定どおり実行でき、失敗を通知できる構成・入口条件を明記する。通知は0回のままバックアップだけ成功する構成・入口テストを追加する。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Node.jsによる上流詳細NFR・JSON参照の検査 | PASS。詳細NFR20件に対応行があり、全OK対象のファイルとセクションが解決した。 | 構造的な対応漏れは見つからなかった。アプリで実現する条件をN/Aとする理由も明記されている。 |
| 指定された既存の起動制御のスポット確認 | notification-construct.tsでenabledがnotificationsEnabled由来であり、Backupを含む全SchedulerのstateとアラームのactionsEnabledに共用されることを確認。notify.tsはNOTIFICATIONS_ENABLEDの検査を全operationの分岐より前に行う。 | 日次バックアップを既存経路へ単に追加するだけでは動かないことを確認した。上記の指摘はコード上の実際の接続に基づく。 |
| AWS公式の取引IAM仕様の閲覧 | Put/Delete/Get等は対応する項目操作の権限、ConditionCheckはConditionCheckItemで管理することを確認。 | [AWS公式仕様](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)と、APIへ必要な条件確認権限を限定追加する方式は整合する。通知の通常読取とバックアップ権限も区別されている。 |
| 保存・所有・環境・復旧の照合 | 環境別の新規表、家族付きキー、GSI/Scanなし、DataStack→AppStackの参照、production RETAIN、バックアップの表とprefix検証、別表復元を確認。 | 同じテーブルへ実体とID索引を置き、復元時に対応を検査する設計は一貫している。AWSの[バックアップと復元](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html)の方式とも整合する。 |
| 費用の算術と前提の検査 | 0.04＋0.03＋0.015＋0.07＝0.155USD。既存0.25503USDを加え、仮定200円/USDと10%余裕で90.2066円。 | 約91円は計画用仮定に基づく余裕側の値で、実請求や現在の為替を表すものではない。無料枠の残り、実サイズ、Lambda/CloudWatch増分、復元費用を配備前に再評価する条件がある。 |
| データ互換性とロールバックの照合 | 調整がある環境をU11前の計算へ戻すと額が誤ることを明記し、読取互換な版または読取・通知も停止する保守状態へ移る方針を確認。 | 単純な旧版復帰を安全と主張していない。既存表を置換せず、新表と参照を保持して復旧する条件もある。 |

### Summary

IAM、環境分離、追加テーブル、費用前提とデータ互換性は整理されている。通知無効のまま日次バックアップを動かす有効化条件は、既存機構との接続が不足している。Criticalなし・Major1件としてREADYだが、その条件を具体化するまでは日次バックアップの保護要件を達成したとは扱わない。
