# インフラ仕様 — U10 お知らせ

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| 計算 | 既存api・lineにnotifyを追加し、業務の入口を計3つにする。Node.js 22、arm64、256MB、30秒 | 定時起動・家族の列挙・SQS処理・監視確認・清掃をnotify入口で入力ごとに分岐。常駐サーバーなし |
| ネットワーク | VPC、NAT、通知用の公開URLを追加しない | LINEへHTTPS送信し、通知の起動はIAMで限定 |
| 保存 | 通知メタデータと一時本文を別のDynamoDB Standardテーブルへ保存 | 本文をバックアップせず、重複防止のメタデータを復旧可能にする |
| 環境 | ap-northeast-1、stagingとproductionに同じ構成を作る | LINEチャネル、キュー、テーブル、秘密、メールの設定を分離 |
| IaC | 既存CDKのDataStack・AppStack・AccountStackを拡張 | DataからAppへ参照を渡す。通知用の独立した常駐基盤を作らない |
| 並行数 | SQSの最大並行数2、バッチ1、待ち時間0。notifyの予約並行数は通常未指定 | 少数アカウントの枠へ適合。設定する場合はSQSの2枠と定時処理の余裕がある3以上を検証 |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| Lambda NotifyFunction | compute | 256MB、arm64、30秒。SQS入力と内部の定時入力を別に検証 | api・lineの対話から同期呼出ししない |
| EventBridge Scheduler | scheduler | Asia/Tokyo。毎日16時、毎日21時、毎分の監視確認、毎時の清掃、毎日3時のバックアップ | 柔軟な時間枠OFF。再試行の最大経過900秒、最大2回。21時の入力は月末だけC5へ正規化 |
| SQS WorkQueue | queue | Standard、SQS管理暗号化、TLS必須、可視性180秒、保持1日、DLQへの最大受信回数10 | 重複を前提。メッセージは論理通知キー・種類・対象日だけ。本文や生のLINE識別子なし |
| SQS DeadLetterQueue | queue | 保持7日、自動再投入なし | 定時起動の配信失敗用DLQも同じ隔離先へ送る。形式は区別して調査 |
| DynamoDB NotificationDispatches | database | オンデマンド、PK pk、SK sk、TTL ttl、暗号化、本番RETAIN | F#家族／種類#対象日で通知、RUN#種類#対象日／METAで実行の集計。versionと所有期限で条件付き更新 |
| DynamoDB NotificationPayloads | database | オンデマンド、PK scheduledDate、SK dispatchKey、TTL ttl、暗号化。PITR・バックアップなし | 当日・前日のPKをQueryして23時間以上の本文を毎時削除。取得時も24時間で拒否 |
| DynamoDBのオンデマンドバックアップ | backup | NotificationDispatchesだけを毎日1回、7日保持 | 個人情報の本文・宛先をバックアップへ混ぜない。復旧手順は後述 |
| SNS AlertTopic | alert | 環境ごとのStandardトピックとメール購読 | 登録アドレスは配備時に指定。購読確認と受信試験が完了条件 |
| CloudWatch | monitoring | 環境ごと標準アラーム5個、新規カスタムメトリクス1個、ログ30日 | キュー滞留は監視確認からNotifyHealthへ集約。高解像度・複合アラーム・有料ダッシュボードを追加しない |
| SSM Parameter Store | secrets | 既存の環境別LINE秘密を参照。家族の運用識別子用の鍵を追加 | 実値をコード・CDKコンテキスト・ログへ置かない。必要なARNだけ読む |

Schedulerの予定時刻から日本時間のtargetDateを作るアダプターを入口に置く。C5の種類・対象日の契約は変更しない。内部の監視・清掃・バックアップ入力をC5の通知種類へ混ぜない。SQSの可視性180秒は関数30秒の6倍とし、通信5秒・処理30秒・所有期限45秒と別の設定として扱う。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|---|---|---|---|
| Families、Users、NotificationGroups | 家族部品（U1〜U3） | U10 | C6の内部窓口から家族列挙と送信先・名前の参照。notifyのみFamiliesの限定Scanを許可。ページ100件、投影は必要項目だけ |
| Calendar、ChoreTypes | カレンダー・種類部品 | U10 | C8・C7の読み取りだけ。通知から担当・単価を書き換えない |
| お小遣いの計算 | U9・U11 | U10 | C9のgetAllowancesをsystem文脈で呼ぶ。U11の保存形式へ依存しない |
| APIとLINEのエラー | 各入口 | U10の監視 | 定型の失敗通知をSNSへ渡す。LINEの本文や要求全体を運用通知に含めない |
| 予算通知 | AccountStack | 全単位 | 月100円の目標に合わせる。通知で請求は停止しない |

## 状態とキューの受け渡し

| 状況 | 更新と応答 |
|---|---|
| 作成 | 論理キーの不存在を条件にメタデータを作り、本文・宛先・キーを固定。外部送信前に永続化を完了 |
| 既知の一時失敗 | 所有者・版の条件付き更新でpreparedへ戻し、leaseOwnerとleaseUntilを除去、nextAttemptAtを保存。次の配達までの可視性を5秒または20秒とばらつきに合わせて変え、失敗項目として返す |
| 処理中の重複・時刻前の配達 | 成功として削除しない。残る所有期限またはnextAttemptAtまで可視性を延ばして失敗項目を返す。外部試行回数は増やさない |
| プロセス中断 | 既定の可視性180秒後に再配達。所有期限と版を検証して再開。同じ本文・宛先・キーを使う |
| 受理済み | 受理結果を条件付きでsentへ記録。本文と宛先の一時データを除去。キュー項目は成功応答 |
| 回数上限・期限切れ・恒久失敗 | 終端状態を記録し定型の運用通知を出す。家族へ再送せずキュー項目を成功応答 |
| 未知の不正キュー入力 | LINEへの送信は0回。失敗として隔離し作り手へ知らせる |

これにより、NFR設計レビューで残った「45秒の所有期限と5秒後の再試行の間で仕事を失わない」条件を具体化する。外部配信は最大3試行、キューの受信回数10とは別に数える。LambdaのSQS連携はReportBatchItemFailuresを有効にする。

RUN記録は列挙が完了したこと、対象家族数と終端処理数を条件付きで集計する。対象0件も完了とする。毎分の監視確認は、5分前までに予定された日次・月末のRUNが未完了なら異常を通知する。監視確認自体の停止はCloudWatchの欠測で検知する。

## IAMと設定

| 実行主体 | 許可 |
|---|---|
| Scheduler実行ロール | 自環境notifyのInvokeFunctionと隔離先へのSendMessageだけ |
| notify | 自環境WorkQueueのReceiveMessage・DeleteMessage・GetQueueAttributes・SendMessage・ChangeMessageVisibility、通知2テーブルのGetItem・PutItem・UpdateItem・DeleteItem・Query、DispatchesのCreateBackup、バックアップARNのDescribeBackup・DeleteBackup |
| notifyの読取 | FamiliesのGetItem・Scan、UsersのGetItemとfamilyId-indexのQuery、NotificationGroupsのGetItem、CalendarとChoreTypesのGetItem・Query。すべて自環境の具体的なARN |
| notifyの運用 | 自環境AlertTopicのPublish、既存の許可したSSM・復号、指定namespaceだけのPutMetricData。資源指定不可の操作は条件を付け例外を説明 |
| api・line | 自環境AlertTopicへの定型失敗通知のPublishだけを追加。既存の読み書き権限は広げない |

通知のテーブル名、キューURL、SNS ARN、環境名を環境変数へ渡す。メール購読先は環境別の配備設定から渡し、欠落時は通知を有効にする配備を止める。秘密の値は既存SSMの経路から読む。

## 復旧と保持

| 対象 | 方針 |
|---|---|
| 本文と宛先 | 専用Payloadsにだけ保存。メタデータとバックアップから除外。終端で直ちに削除、毎時清掃、24時間以後は取得拒否 |
| メタデータ | 非個人情報の状態・キー・対象日・版を35日。TTLと明示清掃を併用 |
| バックアップ | メタデータだけ毎日、7日保持。本文を復元しない |
| 復旧 | 起動とキュー処理を無効にし、復旧前に進行中だった15分の窓が過ぎてから再開。古い通知・失った本文を作り直して再送しない。次の通常予定から処理 |

## 費用見積もり

Q1=A、Q2=B「月100円」に従う。以下は**アプリのステージングと本番の合計**で、各環境1家族4人・31日月・アカウントの無料枠に余裕がある場合の計画用概算。換算は現在の為替の主張ではなく、余裕を持たせた仮定として1USD=200円を使う。既存のアカウント全体の利用量はまだ取得していない。

| サービス | 合算の月間前提 | 見積USD |
|---|---|---|
| Lambda | 10万要求以下、256MB・平均5秒以下で12.5万GB秒以下。既存の利用分も加算して無料枠と照合 | 無料枠内なら0 |
| Scheduler | 毎分監視・毎時清掃・日次起動とバックアップで約9.1万回 | 1400万回の無料枠内なら0 |
| SQS | 最大並行数の指定で低負荷時の縮小最適化が使えないため、5ポーラー×20秒の計画仮定で2環境合計約134万要求。送受信等を含め135万要求、無料100万との差35万×0.40USD/100万 | 0.14 |
| SNS | 100万要求以内、メール1000通以内 | 無料枠内なら0 |
| CloudWatchメトリクス・ログ | 新規2と既存の招待2で計4メトリクス、ログ合計5GB以内 | 無料枠内なら0 |
| CloudWatchアラーム | 標準5個×2環境=10個。アカウントの既存アラームが枠を消費していない前提 | 無料枠内なら0 |
| DynamoDB読書 | 既存分を含め30万RRU、2万WRU以下。東京の単価0.1425USD/100万RRU、0.715USD/100万WRU | 0.05705 |
| メタデータのバックアップ | 合計0.07GB月以下、0.114USD/GB月 | 0.00798 |
| S3・保存・転送などの余裕 | 既存の小さい画面と保存、少量のログ検索を含む計画枠。実測で超える場合は再見積もり | 0.05 |
| 合計 | 0.25503USD×計画換算200円。税などの余裕としてさらに10%を仮置き | 約56円 |

約56円は実際の為替・税率・請求額ではなく計画用の値。100円まで約44円の余裕を置く。配備前に請求通貨・税・実測の要求数と為替で税込みの合算見積もりを行い、100円を超える場合は構成または利用量を再評価する。空のSQSポーリング、既存サービスの無料枠消費、ログの増加、復旧も含め、100円を超える構成を自動で配備しない。SQSの実要求数はステージングで測り、未測定を無料と断言しない。

AWS Budgetsは合算の目標として0.50USD、80%と100%の通知に更新する。為替が計画仮定を超える場合は閾値と見積もりを見直す。LINEは環境ごと別の無料アカウントで各128通以内を確認する。

## Sources

- `nfr-design/performance-design.md`、`security-design.md`、`scalability-design.md`、`reliability-design.md`、`observability-design.md`、`logical-components.md`
- `functional-design/functional-spec.md`、`inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- `infrastructure-design-questions.md`（Q1=A、Q2=B 月100円）
- [東京DynamoDB公式価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-northeast-1/index.json)（公開日2026-11-11、2026-11-15確認）
- [東京CloudWatch公式価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-northeast-1/index.json)（公開日2026-11-04、2026-11-15確認）
- [東京SQS公式価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/ap-northeast-1/index.json)（公開日2026-11-11、2026-11-15確認）、[SQS連携のスケーリング](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)
- [Scheduler料金](https://aws.amazon.com/eventbridge/pricing/)、[SNS料金FAQ](https://aws.amazon.com/sns/faqs/)、[SQS料金](https://aws.amazon.com/sqs/pricing/)、[Lambda料金](https://aws.amazon.com/lambda/pricing/)（2026-11-15確認）
- [LambdaとSQSの設定](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)

## Assumptions & Open Questions

- [assumption] 合計1家族ずつ、無料枠の残り、平均実行時間、月間要求数、200円/USDは計画用の前提。配備前に実測・請求画面で検証する。
