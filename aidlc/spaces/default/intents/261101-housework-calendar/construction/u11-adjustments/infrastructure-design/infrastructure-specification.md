# U11 インフラ仕様

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| Compute | 既存画面API Lambdaへ登録・削除・一覧を追加。通知LambdaのC9読取を結合 | 新しい常駐サーバーやLambdaは不要 |
| Networking | 既存の公開API/HTTPSとCloudFront。VPC・NATは追加しない | 既存認証と費用構造を維持 |
| Storage | DynamoDB調整テーブルを各環境に1個追加 | familyId+sk、月QueryとID索引、全ページ、GSI/Scan不要 |
| Environments | ap-northeast-1、staging/production別テーブル・ロール | 同じ構成を環境別に生成 |
| IaC | 既存CDK TypeScriptのDataStack→AppStackの参照へ追加 | スタックの逆参照を作らない |
| Sizing | 既存API/通知のメモリ・時間上限を維持、DynamoDB PAY_PER_REQUEST | 実測3秒・1000件で不足を評価。閾値を下げない |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| DataStack Adjustments | database | PK familyId、SK sk、AWS_MANAGED暗号化、TTL/GSIなし、固定物理名なし | 実体M#年月#J#UUID、索引JID#UUID。production RETAIN、staging DESTROYを既存方針から継承 |
| RequestRecords | database | 既存userId+idempotencyKey、24h TTL | addAdjustmentと家族込みtargetを追加。原子的取引で調整と同時保存 |
| Calendar/Users | database | 既存の月未確定条件・子供所属条件 | 所有者の公開条件窓口を通す。新しい索引や月状態の形式変更なし |
| 通知Lambdaの既存backup起動 | backup | 毎日03:00 JST、調整表のオンデマンドバックアップ、7日保存 | 新しいSchedulerは不要。実体と索引を一緒に復元 |
| CloudWatch/SNS | monitoring | 既存ログ・API失敗・通知失敗・メール | U11の新規有料警報・ダッシュボードなし |
| S3/CloudFront | cdn | 既存配信 | S6と独立した編集一覧のアセット更新のみ |

## IAM and Configuration

| Principal | Resource | Actions / Config | Restrictions |
|---|---|---|---|
| API Lambda | 調整表ARN | GetItem・Query・PutItem・DeleteItem | Scan・UpdateItem・ワイルドカード表を足さない。取引内のアクションもこの権限で判定 |
| API Lambda | 既存Users/Calendar/RequestRecords ARN | 既存の読取/書込に加え、必要なConditionCheckItemを確認 | 月と子供の条件を同じ取引へ含める |
| 通知Lambda | 調整表ARN | GetItem・Query、CreateBackup | データ行のPut/Update/Deleteは許可しない。通常のC9読取はQueryだけ |
| 通知Lambda | 調整表ARN/backup/* | DescribeBackup・DeleteBackup | 通知用表の既存権限と別の許可リソースとして追加 |
| 通知Lambda | ListBackups | 既存Resource*例外を継承 | requestedRegionを東京へ制限。コードでも固定tableName・tableArn・prefixを照合 |
| API/通知Lambda | 環境変数 | ADJUSTMENTS_TABLE。通知だけADJUSTMENTS_ARN | 秘密ではない参照名。LINE Lambdaには不要 |

取引の権限は各項目のアクションとARNで管理し、架空のIAMアクションを足しません。[AWSの取引IAM仕様](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)

## Backup and Restore

| 項目 | 方式 | 確認 |
|---|---|---|
| 作成と一覧 | 既存backup起動内で表ごとに処理。調整用prefixはhousework-環境-adjustments- | ListBackupsは表で絞り、戻りのTableArn・BackupArn・名前を再確認 |
| 台帳 | 既存通知メタデータ表へバックアップARN・作成時刻・対象種別だけ保存 | 理由・金額はメタデータへ複写しない。台帳喪失/応答不明はListBackupsで照合 |
| 保存期限 | 7日経過してAVAILABLEの自分のバックアップだけ削除 | 通知表用prefixと調整表用prefixを混同しない。自己表以外は無操作 |
| 障害分離 | 対象表ごとに失敗を捕捉し、別表の処理も試みてから失敗通知する | 追加処理を含めた残り時間を検証。無期限の再試行なし |
| 復元 | 別テーブルへ復元し、件数・実体/索引対応・家族分離を確認後、通常CDK設定で参照切替 | 元表の手修正なし。requestRecords復元とは別に管理し、古いキーの自動再送をしない |

日次バックアップのデータ損失許容は最大24時間相当ですが、停止や失敗で延びるため稼働実績を監視します。復元時間の保証は設けず、実測して記録します。バックアップは別表への復元です。[AWSバックアップ仕様](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html)

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|---|---|---|---|
| Users / RequestRecords | U1 | U11 | 所属条件・再送結果。APIのみ変更 |
| Calendar | U5/U7 | U11 | 未確定条件。調整から月状態を変更しない |
| C9 / API / CloudFront | U9/U1 | U11 | 同じ読取形と追加の編集API |
| backup起動 / 警報 / メタデータ台帳 | U10 | U11 | 表とprefixの許可リスト、理由本文なし |

## Cost Estimate

| 前提 | 二環境合計の計画値 |
|---|---|
| 各環境1家族4人、月1000件作成・最大1000件削除 | 余裕を持ち40,000 WRU・100,000 RRU/月を増分枠として計算 |
| 登録1件 | 実体2KB以内・索引1KB以内・結果2KB以内、取引の倍量を含める。実際のシリアライズサイズを試験 |
| 約1年の蓄積 | 二環境の表データ合計0.05GB、7日分のバックアップ0.35GB |
| 計画用単価の上側仮定 | write 1USD/百万、read 0.30USD/百万、保存0.30USD/GB月、backup0.20USD/GB月 |
| 増分試算 | 0.04+0.03+0.015+0.07=0.155USD/月 |
| U10時点の既存条件付き試算 | 0.25503USD/月。無料枠残量などの同じ前提を要確認 |
| 二環境合算 | 0.41003USD×仮定200円/USD×税等10%余裕=約91円/月 |

上記単価と為替は**計画用の保守的な仮定**で、AWSの請求見積や現在の為替の引用ではありません。料金体系の確認元は[AWS DynamoDB料金](https://aws.amazon.com/dynamodb/pricing/)。取引の倍量・保存期間とサイズを反映し、配備前に東京の実単価、無料枠の他用途消費、実サイズ、Lambda/CloudWatch増分、為替を公式見積と請求情報で再計算します。既存の0.25503USDの成立条件が崩れれば91円にもなりません。月100円目標を超える場合は有効化前に利用者へ見積を提示します。既存0.50USD予算通知は維持しますが、100円の強制上限ではありません。復元時の一時費用は定常額と別に見積もります。

## Sources

- `construction/u11-adjustments/nfr-design/performance-design.md`、`security-design.md`、`scalability-design.md`、`reliability-design.md`、`observability-design.md`、`logical-components.md`
- `inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- `construction/u11-adjustments/functional-design/functional-spec.md`
- 既存ソース: `infrastructure/lib/data-stack.ts`、`notification-construct.ts`、`packages/backend/src/services/notificationMaintenanceService.ts`

## Assumptions & Open Questions

- 本工程では配備・実請求・実メール・復元を実行していない。費用は上記条件付きで、達成済みではない。
