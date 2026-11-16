## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-15T11:06:33Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u10-notifications/infrastructure-design/infrastructure-specification.md > IAMと設定・復旧と保持 | 毎日のオンデマンドバックアップを7日で削除するが、対象バックアップARNを見つける経路が定義されていない。notifyにはCreateBackup・DescribeBackup・DeleteBackupを許可する一方、ListBackupsはなく、作成結果のARNを保存する台帳も未定義。DescribeBackupとDeleteBackupを使うには対象ARNが必要となる。 | バックアップ一覧を自環境・対象テーブルへ絞って取得する権限と手順を追加するか、CreateBackupの結果ARNと作成時刻をメタデータに保存し、その台帳から7日超の削除対象を取得する方式を定める。権限とテストもその方式へ揃える。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Node.jsによるtraceability解析・上流との照合 | PASS。上流の詳細NFR29件にcoverage行があり、全OK対象ファイルが存在。 | 宣言された対応の構造的な欠落は見つからなかった。 |
| AWS公式SQS連携仕様との照合 | 可視性180秒は関数30秒の6倍。最大並行数2は許可範囲内。最大並行数を指定した場合に低負荷時2並行までの縮小最適化が使えないことも確認。 | [SQS連携設定](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)と[スケーリング仕様](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)に整合する。空ポーリング費用を無料扱いしていない。 |
| キュー・所有権・期限・復旧の照合 | 既知失敗では条件付きで所有権を解放。処理中の重複は削除せず可視性を調整し、失敗項目として返す。中断後は180秒で再配達、外部試行最大3回と受信最大10回を分離。 | NFR設計で残った45秒の所有期限と5秒後の再試行の接続条件が具体化された。期限後・終端状態・復旧後の再送抑止も維持されている。 |
| 監視と保持の照合 | 各環境5アラーム、計10個。毎分の監視確認とNotifyHealthの欠測検知、対象0件のRUN完了、初回失敗時のSNS通知、本文専用テーブルのバックアップ除外と24時間の取得拒否を確認。 | 起動しない処理自身のログに欠落検知を依存させていない。本文の自動削除遅延だけに24時間条件を委ねていない。メール受信15分は実測する条件として扱われている。 |
| 東京DynamoDB公式価格JSONの独立取得 | 読取0.1425USD/100万RRU、書込0.715USD/100万WRU、オンデマンドバックアップ0.114USD/GB月を確認。公開日は2026-11-11。 | [東京DynamoDB価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-northeast-1/index.json)の値は見積もりと一致した。CloudWatchとSQSの公式価格JSONも取得したが、この検査では単価の独立抽出は行えていない。 |
| 費用の算術と前提の照合 | 0.14＋0.05705＋0.00798＋0.05＝0.25503USD。計画換算200円/USDと仮の10%余裕で56.1066円。 | 月100円という回答と整合する計画値。無料枠の残量、実際のポーリング、税・為替は仮定と保証を分け、配備前に再見積もりする条件がある。Budgetsが請求を停止しないことも明記されている。 |
| 配備と共有資源の照合 | DataStackからAppStackへの参照、notifyの読取境界、api・lineへのSNS追加のみ、環境分離、無効状態での初回反映、購読確認後の有効化を確認。 | 現段階で配備や実送信を行わず、コード生成で準備する範囲が明確。IAMの残項目は上記バックアップ探索経路に限定して指摘する。 |

### Summary

通知・キュー・記録・独立監視を実装可能なAWS構成へ対応させており、少額課金を許容した回答と費用前提の扱いも整合する。バックアップの削除対象を特定する経路を補う軽微な残項目はあるが、主要な構成に実装を妨げる矛盾は見つからなかった。
