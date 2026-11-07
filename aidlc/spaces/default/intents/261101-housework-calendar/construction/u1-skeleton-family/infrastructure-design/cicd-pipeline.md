# 反映の流れ（CI/CD Pipeline）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で作る、テストから反映までの流れです。リポジトリは GitHub の公開リポジトリで、流れは GitHub Actions で動かします（`team.md`）。U1 で作った流れを、U2〜U11 もそのまま使います。

## ワークフローの一覧

| ワークフロー | 動くとき | AWS の権限 | すること |
|-------------|---------|-----------|---------|
| `ci.yml` | プルリクエスト（フォークを含む）、`main` への push | なし | 検査とテスト（下の「検査とテスト」） |
| `deploy-staging.yml` | `main` への push で、`ci.yml` と同じ検査が通ったあと | OIDC でステージング用のロール | ステージングに反映し、反映後の確かめをする |
| `deploy-production.yml` | 作り手の手動実行（`workflow_dispatch`）。反映するコミットを選べる | OIDC で本番用のロール。保護した環境 `production` の承認のあとだけ | 本番に反映し、反映後の確かめをする [Q6] |

## 検査とテスト（`ci.yml`）

順に動かし、どれかが失敗したら取り込めません（GitHub のブランチ保護で `ci.yml` の成功を必須にします）。

1. 依存の取り込み（ロックファイルのとおり。`npm ci` などの決まった版での取り込み）
2. 整形の確かめ（Prettier）
3. 検査（ESLint。`react/no-danger` を含む。NFR4.12）
4. 型の確かめ（TypeScript）
5. テスト（Vitest。Gherkin の筋書きを含む）と行カバレッジ 80% 以上の確かめ（NFR8.1、NFR8.2）
6. 秘密の情報の検査（gitleaks。NFR5.2）
7. CDK の組み立て（`cdk synth`）と CDK のテスト（資源の設定の確かめ。例: 関数 URL があること、ログが 30 日、データのテーブルが消えない設定）

このワークフローには `id-token: write` の権限を付けず、秘密の情報も渡しません。フォークからのプルリクエストでも安全に動きます（NFR5.6）。

## ステージングへの反映（`deploy-staging.yml`）

1. `ci.yml` と同じ検査とテストを動かす
2. OIDC でステージング用のロールを受け取る（NFR5.5）
3. パラメータストアから CloudFront の秘密のヘッダーの値を読み、ログに出ないよう伏せる（`::add-mask::`）
4. 画面を組み立てる（LIFF ID などの公開してよい設定は、GitHub の変数から入れる）
5. `cdk deploy Housework-staging-Data Housework-staging-App` を実行する。秘密のヘッダーの値は CDK のコンテキストとして渡し、リポジトリにも CDK のコードにも書かない（NFR 設計の Q2）
6. 反映後の確かめ（下の表）。失敗したらワークフローを失敗にする

同じ時に 2 つの反映が動かないよう、`concurrency` で 1 つずつにします。

## 本番への反映（`deploy-production.yml`）

1. 作り手が GitHub の画面から手動で実行し、反映するコミット（ステージングで確かめたもの）を選ぶ
2. 保護した環境 `production` の承認（承認者は作り手）を待つ
3. 以降はステージングと同じ手順で、`Housework-production-Data` と `Housework-production-App` に反映する
4. 反映後の確かめ

## 反映後の確かめ

| 確かめ | 期待する結果 | 分かること |
|-------|-----------|----------|
| `GET https://<CloudFront のドメイン>/` | 200 で画面の HTML | 画面の配信と振り分け |
| `GET https://<CloudFront>/v1/me`（セッションなし） | 401 `UNAUTHENTICATED` | `/v1/*` が `api` に届き、秘密のヘッダーが正しく付いている |
| `POST https://<CloudFront>/line/webhook`（署名なし） | 401 | `/line/webhook` が `line` に届き、署名を確かめている |
| `api` の関数 URL を直接呼ぶ | 403 | CloudFront を通さない要求を断っている（NFR4.13） |

U1 の walking skeleton としての確かめ（友だち登録して返事が届く、家族を作る、など）は、作り手がステージングで手で行います（`inception/delivery-planning/bolt-plan.md` の B1）。

## OIDC のロール（AWS 側）

| ロール | 信頼する相手（GitHub の OIDC の `sub`） | 許すこと |
|--------|----------------------------------|---------|
| ステージング用 | `repo:<owner>/<repo>:ref:refs/heads/main` | CDK の反映に必要なこと（CDK の bootstrap のロールを引き受ける）。`/housework-calendar/staging/cloudfront/*` の読み取り |
| 本番用 | `repo:<owner>/<repo>:environment:production` | 同じことを本番に対して。`/housework-calendar/production/cloudfront/*` の読み取り |

OIDC のプロバイダーとこの 2 つのロールは、作り手が最初に 1 回だけ、手元から `Housework-Account` スタックで作ります（このスタックにはほかに Budgets が入ります）。GitHub にはロールの ARN だけを変数として置きます（秘密の値ではありません）。長く使える AWS の鍵はどこにも置きません。

## 前の版に戻す [Q7]

1. 問題のあるコミットを `git revert` し、プルリクエストで `main` に取り込む
2. `deploy-staging.yml` がステージングに反映する
3. ステージングで確かめたら、`deploy-production.yml` を手動で実行して同じコミットを本番に反映する
4. DynamoDB のデータは戻しません。データの形は、項目やテーブルを足すだけにし、消したり名前を変えたりしません。そのため、前の版のコードでも新しい版のデータを読めます

## 秘密の情報の扱い

| 秘密の情報 | 置き場所 | CI での扱い |
|-----------|---------|-----------|
| LINE のチャネルシークレット、チャネルアクセストークン、ログインのチャネル ID、JWT の鍵 | パラメータストア（作り手が手で入れる） | CI は読まない。Lambda が起動のときに読む |
| CloudFront の秘密のヘッダーの値 | パラメータストア | 反映のときだけ読み、伏せて CDK に渡す |
| AWS の権限 | なし（OIDC の一時的な権限） | 反映のワークフローだけが受け取る |

CloudFront の秘密のヘッダーの値は、CDK が作る CloudFormation のテンプレート（AWS のアカウントの中）には入ります。Git とリポジトリには入りません。値が漏れたときは、パラメータストアの値を変えて、両方の反映をもう一度動かします（Lambda も新しい値を起動のときに読みます）。

## Sources

- `aidlc/spaces/default/memory/team.md`（GitHub、GitHub Actions、squash-merge、ステージングへの自動の反映、本番は手で）
- `aidlc/spaces/default/memory/project.md`（秘密の情報をリポジトリに入れない、本番のデータを手で書き換えない）
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.12、NFR5.2、NFR5.5、NFR5.6）、`tech-stack-decisions.md`（NFR8.1〜NFR8.3）
- `construction/u1-skeleton-family/nfr-design/security-design.md`（CloudFront の秘密のヘッダー、OIDC）
- `infrastructure-specification.md`
- `infrastructure-design-questions.md` の回答 [Q1]、[Q5]、[Q6]、[Q7]

## Assumptions & Open Questions

- [assumption] CDK の bootstrap は、作り手が最初に 1 回、手元から東京リージョンに行う
- U1 の Construction で決める確かめのコマンド（各作業単位を確かめるコマンド）は、`ci.yml` と同じ検査とテストを手元で動かすものにする見込みです。B1 を作り終えて最初に確かめるときに決めます
