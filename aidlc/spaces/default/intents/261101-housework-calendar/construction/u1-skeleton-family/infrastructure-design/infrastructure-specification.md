# インフラの仕様（Infrastructure Specification）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で作る AWS の構成です。U1 は土台を作り、U2 以降は同じスタックに足していきます。仕組みの考え方は `nfr-design/` にあり、ここではそれを AWS の資源に置き換えます。コード（CDK の中身）はコード生成で作ります。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | AWS Lambda（Node.js 22、arm64）を 2 つ: 画面用 API（`api`）、LINE 用の受け口（`line`）。どちらも関数 URL（認証 `NONE`）で呼ぶ。お知らせ用は U10 | 常に動かすサーバーを持たない（NFR3.1）。API Gateway を使わず費用 0 円（NFR1.2）。arm64 は同じ性能で安く、無料枠も同じ |
| 入口 | CloudFront のディストリビューション 1 つ（環境ごと）。`/` は S3、`/v1/*` は `api` の関数 URL、`/line/webhook` は `line` の関数 URL | 画面と API を同じドメインにする（Q4 の NFR の答え）。独自ドメインは使わず `xxxx.cloudfront.net` [Q3] |
| ネットワーク | VPC は使わない。Lambda は AWS が管理するネットワークで動き、DynamoDB、パラメータストア、LINE の API に HTTPS でつなぐ | NAT ゲートウェイなどの費用を出さない（NFR1.1）。守る仕組みは認証と署名と秘密のヘッダー（NFR4.13） |
| 保存 | DynamoDB（オンデマンド）のテーブル 4 つ（`Users`、`Families`、`ProcessedLineEvents`、`RequestRecords`）。画面のファイルは S3（非公開、CloudFront の OAC からだけ読む） | `nfr-design/scalability-design.md` のテーブルの形 |
| 環境 | 同じ AWS アカウントの中に、ステージングと本番を別のスタックで置く [Q1]。リージョンはすべて東京（`ap-northeast-1`）[Q2]。CloudFront は世界共通 | 作るのが簡単で、Budgets も 1 つで済む |
| スタックの分け方 | 環境ごとに 2 つ: `Housework-<env>-Data`（DynamoDB）と `Housework-<env>-App`（Lambda、CloudFront、S3、権限、ログ）。全部で 4 つ [Q4] | データのスタックは消さない設定にし、アプリだけを作り直せる（NFR6.2） |
| IaC | AWS CDK（TypeScript）。同じリポジトリの `infrastructure/` に置く [Q5] | `team.md` |
| 大きさ | Lambda のメモリ 256 MB、時間切れ 30 秒（NFR7.4）、予約された同時実行数 5（関数ごと。NFR1.6）。ログは 30 日（NFR1.3） | `nfr-design/performance-design.md`、`scalability-design.md` |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| CloudFront | cdn | 振り分け（下の表）、応答ヘッダーのポリシーで CSP ほか（NFR4.11）、HTTPS のみ（HTTP は HTTPS に移す） | 画面の振り分け（SPA）は CloudFront Functions で `/v1/*` と `/line/*` 以外の、拡張子のない道を `/index.html` に書き換える。ディストリビューション全体の「エラー時の応答」は使わない（API の 404 まで画面に書き換わるのを防ぐ） |
| S3 | storage（画面） | 非公開、ブロックパブリックアクセス、CloudFront の OAC からだけ読む。CDK の `BucketDeployment` でビルド済みの画面を入れ、CloudFront のキャッシュを消す | 画面のファイルに秘密の情報は入れない（LIFF ID は公開してよい値） |
| Lambda `api` | compute | 256 MB、30 秒、予約 5、環境変数はパラメータのパスと環境名だけ | 関数 URL。秘密のヘッダー `X-Origin-Verify` がなければ 403（NFR4.13） |
| Lambda `line` | compute | 256 MB、30 秒、予約 5 | 関数 URL。秘密のヘッダーと LINE の署名を確かめる（NFR4.7、NFR4.13） |
| DynamoDB `Users` | database | オンデマンド、PK `userId`、GSI `lineUserId-index`（PK `lineUserId`） | 本番は `RemovalPolicy.RETAIN`。暗号化は AWS 管理のキー（無料） |
| DynamoDB `Families` | database | オンデマンド、PK `familyId` | 同上 |
| DynamoDB `ProcessedLineEvents` | database | オンデマンド、PK `webhookEventId`、TTL `expiresAt`（7 日） | 同上 |
| DynamoDB `RequestRecords` | database | オンデマンド、PK `userId`、SK `idempotencyKey`、TTL `expiresAt`（24 時間） | 同上 |
| Systems Manager パラメータストア | secrets | 標準、SecureString。パスは `/housework-calendar/<env>/...`（`nfr-design/security-design.md` の一覧） | 値は作り手が手で入れる。CDK はパラメータを作らず、名前だけを参照する |
| CloudWatch Logs | logging | Lambda ごとのロググループ、保存 30 日 | 費用の無料枠 5 GB の中 |
| AWS Budgets | cost | 月 1 ドルの予算、見込みが超えたら作り手のメールに知らせる（NFR1.7） | アカウントに 1 つ。CDK のステージングのスタックには入れず、`Housework-Account` という別のスタック 1 つで作る |
| IAM | identity | Lambda ごとのロール（下の表）、GitHub Actions の OIDC のロール（`cicd-pipeline.md`） | 最小の権限 |

### CloudFront の振り分け

| 道 | 行き先 | キャッシュ | 元に渡すもの |
|----|--------|----------|-------------|
| `/v1/*` | `api` の関数 URL | しない（CachingDisabled） | Host 以外のヘッダー、クエリ、本文（AllViewerExceptHostHeader）。`Authorization` を含む。秘密のヘッダー `X-Origin-Verify` を足す |
| `/line/webhook` | `line` の関数 URL | しない | 同上。`x-line-signature` を含む |
| それ以外（`/`） | S3（OAC） | する（CachingOptimized）。`index.html` は短く | CloudFront Functions で画面の道を `/index.html` に書き換える |

関数 URL へは Host ヘッダーを渡しません（渡すと関数 URL が要求を受け付けないため）。

### Lambda のロールの権限

| ロール | 許すこと |
|--------|---------|
| `api` | 自分の環境の `Users`、`Families`、`RequestRecords` の読み書き（`Users` の GSI を含む）。`/housework-calendar/<env>/jwt/*` と `/housework-calendar/<env>/line/*` の読み取り（復号を含む）。自分のロググループへの書き込み |
| `line` | 自分の環境の `Users`（GSI を含む）、`ProcessedLineEvents` の読み書き。`/housework-calendar/<env>/line/*` の読み取り。自分のロググループへの書き込み |

ほかの環境のテーブルとパラメータには届きません（NFR5.3、NFR10.1）。

## Shared Infrastructure

U1 が作る資源を、U2〜U11 が使います。

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| CloudFront のディストリビューションと振り分け | U1 | U2〜U11（`/v1/*` に操作を足す）。U10 は振り分けを使わない | 振り分けの道を増やすのは U1 の持ち物の変更として行う |
| Lambda `api` と `line` | U1 | U2〜U9、U11（`api` に処理を足す）、U3、U6、U8（`line` に処理を足す） | 1 つの関数に処理を足す。新しい関数は作らない（作業単位の分割の Q5） |
| `Housework-<env>-Data` スタック | U1 | U2〜U11（テーブルを足す） | テーブルを足すだけにし、既存のテーブルのキーは変えない（Q7） |
| `Users`、`Families` テーブル | U1（家族とメンバーの部品） | ほかの部品は窓口（C6）を通して使う | ほかの単位の Lambda のロールにこれらのテーブルを直接書く権限を足さない（同じ `api` 関数の中では、家族とメンバーの部品のコードだけが使う） |
| パラメータストアのパス `/housework-calendar/<env>/` | U1 | U10（お知らせの送信に同じ LINE のトークン） | 環境ごとに分ける |
| OIDC のロールと GitHub Actions のワークフロー | U1 | すべての単位 | `cicd-pipeline.md` |
| AWS Budgets | U1 | アカウント全体 | `Housework-Account` スタック |

## 費用の見込み

| サービス | 家族 4 人の 1 か月の量 | 無料枠 | 見込み |
|---------|-------------------|-------|-------|
| Lambda | 数千回、合計数百 GB 秒 | 月 100 万回、40 万 GB 秒 | 0 円 |
| CloudFront | 数 MB〜数十 MB | 月 1 TB、1,000 万要求 | 0 円 |
| S3 | 数 MB | 新規アカウントの無料枠は 12 か月。それ以降も数 MB なら月 1 円未満 | 0 円〜1 円未満 |
| DynamoDB | 数千回の読み書き、数 MB | 25 GB、25 の読み書きの単位（プロビジョンドの場合）。オンデマンドでも数千回なら 1 円未満 | 0 円〜1 円未満 |
| パラメータストア（標準） | 数個 | 無料 | 0 円 |
| CloudWatch Logs | 数十 MB | 5 GB | 0 円 |
| AWS Budgets | 1 つ | 2 つまで無料 | 0 円 |

S3 と DynamoDB のオンデマンドは、無料枠を外れたときに 1 円未満の費用が出る可能性があります。Budgets の 1 ドルの知らせで気づけます。

## Sources

- `construction/u1-skeleton-family/nfr-design/`（各設計）
- `construction/u1-skeleton-family/nfr-requirements/`（NFR1、NFR3〜NFR7、NFR10）
- `construction/u1-skeleton-family/functional-design/functional-spec.md`
- `inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- `aidlc/spaces/default/memory/team.md`（AWS CDK、GitHub Actions、配備）
- `infrastructure-design-questions.md` の回答 [Q1]〜[Q7]

## Assumptions & Open Questions

- [assumption] 作ったばかりの AWS アカウントは、Lambda の同時実行数の枠が 10 のことがあります。予約された同時実行数（NFR1.6）は、予約していない数を 100 以上残す必要があるため、枠が 1000 でないと設定できません。B1 の配備の前に作り手が枠を確かめ、10 なら引き上げを申し込みます（無料）。引き上げまでは予約を外し、Budgets の知らせだけで備えます
- [assumption] S3 と DynamoDB の費用は、上の量なら 1 か月 1 円未満です。作り始めるときに AWS の料金の案内で確かめます
