# インフラ設計 — U1 最初の形と家族を作る — 質問

U1（`u1-skeleton-family`）で作る AWS の構成を決めます。使うサービスは NFR の段階で決めてあります（Lambda の関数 URL、CloudFront、S3、DynamoDB、パラメータストア、CloudWatch Logs、AWS CDK、GitHub Actions）。ここでは、構成の分け方と、環境のつくり方を決めます。

すでに決まっていること（もう一度は聞きません）:

- 常に動かすサーバーは持たない。API Gateway と Secrets Manager は使わない（費用 0 円）
- 画面（S3）と、画面用・LINE 用の Lambda の関数 URL は、CloudFront の 1 つのドメインの下にまとめる
- ステージングと本番は、別の AWS スタックと、別の LINE 公式アカウントとチャネルにする（NFR10.1）
- GitHub Actions から AWS へは OIDC で反映し、`main` への取り込みでステージングだけに反映する。本番は作り手が手で反映する（NFR5.5、NFR10.2）
- DynamoDB はテーブルを種類ごとに分け、オンデマンドにする
- お知らせ用の Lambda と決まった時刻の仕組みは U10 で作る（U1 では作らない）

## Q1. [インフラ] ステージングと本番の AWS アカウント

NFR のレビューで、同じアカウントに置くか別のアカウントに置くかが決まっていないと指摘されました。Lambda の同時実行数の上限（NFR1.6）の予約や、費用の確認のしやすさに関わります。

A. 同じ AWS アカウントの中で、スタックを分ける（`housework-staging`、`housework-production`）。作るのは簡単で、Budgets も 1 つで済む
B. ステージングと本番で AWS アカウントを分ける（AWS Organizations は使わず、作り手が 2 つ持つ）。環境どうしが完全に分かれる
X. Other (please specify)

[Answer]: A

## Q2. [インフラ] AWS のリージョン

東京リージョン（`ap-northeast-1`）は、国内の利用者への速さはよいですが、一部のサービスの無料枠が米国のリージョンと違うことがあります。CloudFront は世界共通です。

A. 東京リージョン（`ap-northeast-1`）にすべて置く
B. 米国東部（バージニア北部、`us-east-1`）にすべて置く
X. Other (please specify)

[Answer]: A

## Q3. [インフラ] 独自のドメイン名

CloudFront は、何もしなくても `xxxx.cloudfront.net` のドメインで使えます。LINE の LIFF や Webhook の URL は、このドメインを登録します。

A. 独自のドメインは使わず、CloudFront のドメイン（`xxxx.cloudfront.net`）をそのまま使う（無料）
B. 独自のドメインを取って使う（ドメイン代が毎年かかる。費用 0 円の条件と合わない）
X. Other (please specify)

[Answer]: A

## Q4. [インフラ] CDK のスタックの分け方

U1 は土台を作り、U2 以降が同じ構成に足していきます。スタックをどう分けますか。

A. 1 つのスタックに全部入れる（データ、API、画面の配信、権限）。単位が増えるたびに、同じスタックに足す
B. データ（DynamoDB）と、アプリ（Lambda、CloudFront、S3）の 2 つのスタックに分ける。データだけ消えないようにしやすい
X. Other (please specify)

[Answer]: B

## Q5. [インフラ] CDK のコードを置く場所

A. 同じリポジトリの `infrastructure/` に置く（画面と裏側と同じリポジトリ。`team.md` のとおり 1 つの公開リポジトリ）
B. 別のリポジトリに分ける
X. Other (please specify)

[Answer]: A

## Q6. [インフラ] 本番に反映する方法

`team.md` では、本番は作り手がステージングで確認してから手で反映することになっています。手で反映する方法を決めます。

A. GitHub Actions の手動実行（`workflow_dispatch`）。保護した環境 `production` に、作り手の承認を必要とする設定を付ける。OIDC の権限は、この環境だけに渡す
B. 作り手のパソコンから `cdk deploy` を直接実行する（AWS の鍵をパソコンに置く必要がある）
X. Other (please specify)

[Answer]: A

## Q7. [インフラ] 前の版に戻す手順

`team.md` で、元に戻す手順は後の段階で決めると書かれていました。U1 では、この手順を決めておきます。

A. 前の `main` のコミットを GitHub Actions で再び反映する（`git revert` して `main` に取り込む → ステージング。本番は手動実行で同じコミットを反映）。DynamoDB のデータは戻さない（データの形は壊さず足すだけにする）
B. CloudFormation のスタックを前の版に戻す機能を使う
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

回答のまとめ:

- ステージングと本番は同じ AWS アカウントの中で、スタックを分ける（Q1）
- すべて東京リージョン（`ap-northeast-1`）に置く（Q2）
- 独自のドメインは使わず、CloudFront のドメイン（`xxxx.cloudfront.net`）をそのまま使う（Q3）
- CDK のスタックは、データ（DynamoDB）とアプリ（Lambda、CloudFront、S3）の 2 つに分ける。環境ごとに作るので、全部で 4 つのスタックになる（Q4）
- CDK のコードは同じリポジトリの `infrastructure/` に置く（Q5）
- 本番への反映は GitHub Actions の手動実行（`workflow_dispatch`）にし、保護した環境 `production` に作り手の承認を必要とする設定を付ける。OIDC の権限はこの環境だけに渡す（Q6）
- 前の版に戻すときは、`git revert` して `main` に取り込み、ステージングに反映する。本番は手動実行で同じコミットを反映する。DynamoDB のデータは戻さず、データの形は壊さずに足すだけにする（Q7）

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
