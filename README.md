# housework-calendar

家族のお手伝いを、LINE の中のカレンダーで決めて、記録して、お小遣いまで数えるアプリです。LINE の公式アカウントと、LINE の中で開く画面（LIFF）、AWS の小さな裏側（Lambda、DynamoDB、CloudFront）でできています。費用は 0 円を目標にしています。

## 構成

| 場所                          | 中身                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/shared`             | 画面と裏側で共有する型、理由の印、文言                                                    |
| `packages/backend`            | Lambda の入口（`entries/api.ts` と `entries/line.ts`）、業務の決まり、DynamoDB            |
| `packages/frontend`           | Vite + React + MUI の画面（LIFF）                                                         |
| `infrastructure`              | AWS CDK（TypeScript）。`Housework-Account`、`Housework-<env>-Data`、`Housework-<env>-App` |
| `.github/workflows`           | `ci.yml`、`deploy-staging.yml`、`deploy-production.yml`                                   |
| `scripts/smoke-check.sh`      | 反映後の確かめ（4 つ）                                                                    |
| `docs/contract-changes-u1.md` | U1 で足した契約の一覧                                                                     |

リージョンは東京（`ap-northeast-1`）です。環境はステージング（`staging`）と本番（`production`）の 2 つで、同じ AWS アカウントの中に別のスタックで置きます。

## 最初にやること（作り手が 1 回だけ）

秘密の情報（チャネルシークレット、トークン、鍵）は、リポジトリには絶対に置きません。AWS のパラメータストアにだけ入れます。AWS の操作に使う権限は、手元の AWS CLI のプロファイルを使います。

### 全体の順番と、つまずきやすいところ

CloudFront のドメイン（`xxxx.cloudfront.net`）は、AWS に反映するまで決まりません。一方で、LINE の設定には URL が要り、画面のビルドには LIFF ID が要ります。そのため、次の順番で進めます。

1. LINE のチャネルを作る。Webhook URL は空のまま、LIFF のエンドポイント URL は仮の値（`https://example.com` など）で作り、LIFF ID をもらう（手順 1）
2. パラメータストアに値を入れる。LIFF の URL は LIFF ID だけで決まるので、この時点で入れられる（手順 2）
3. CDK の bootstrap、`Housework-Account` の反映、GitHub の設定（手順 3〜6）
4. ステージングに反映し、CloudFront のドメインを知る（手順 7）
5. LINE の Webhook URL と LIFF のエンドポイント URL を、本物のドメインに入れ直す（手順 8）

手順 8 が終わるまでは、友だち登録しても返事は届きません。CloudFront のドメインは、スタックを消して作り直さない限り変わらないので、手順 8 は最初の 1 回だけです。

### 用意するもの（どれを自分で作り、どこに入れるか）

| もの                                             | 入手のしかた                                            | 入れる場所          | 秘密か                               |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------- | ------------------------------------ |
| Messaging API のチャネルシークレット             | LINE Developers で表示されるものを写す                  | パラメータストア    | 秘密                                 |
| Messaging API のチャネルアクセストークン（長期） | LINE Developers で発行して写す                          | パラメータストア    | 秘密                                 |
| LINE ログインのチャネル ID                       | LINE Developers で表示されるものを写す                  | パラメータストア    | 秘密ではないが、ほかの値と一緒に置く |
| LIFF の URL                                      | `https://liff.line.me/<LIFF ID>` の形で自分で組み立てる | パラメータストア    | 秘密ではない                         |
| セッション用の鍵（JWT の鍵）                     | **自分で作る**（ランダムな文字列）                      | パラメータストア    | 秘密                                 |
| CloudFront の秘密のヘッダーの値                  | **自分で作る**（ランダムな文字列。JWT の鍵とは別の値）  | パラメータストア    | 秘密                                 |
| 反映用のロールの ARN（ステージング用、本番用）   | 手順 4 の反映の出力を写す                               | GitHub の Variables | 秘密ではない                         |
| LIFF ID                                          | 手順 1 で LIFF アプリを作ると表示される                 | GitHub の Variables | 秘密ではない                         |
| 公式アカウントの ID（`@xxxx`）                   | LINE Official Account Manager で表示される（任意）      | GitHub の Variables | 秘密ではない                         |

自分で作る必要があるのは、**セッション用の鍵**と **CloudFront の秘密のヘッダーの値**の 2 つだけです。どちらも環境ごと（ステージングと本番）に別の値を作ります。

**GitHub Actions の Secrets には、何も入れません。** AWS の権限は OIDC で一時的に受け取り、秘密の値はパラメータストアから読むためです。`ci.yml` が使う `GITHUB_TOKEN` は、GitHub が自動で用意します。例外として、リポジトリの持ち主が組織（Organization）の場合は、`gitleaks/gitleaks-action` のライセンスキー（`GITLEAKS_LICENSE`）を Secrets に入れる必要があります。個人のアカウントなら要りません。

### 1. LINE のチャネルを作る

LINE Developers で、プロバイダーの下にチャネルを 3 つ作ります（環境ごとに別のものを用意するのが安全です。ステージングと本番で 2 セット）。

1. **Messaging API チャネル**（公式アカウント）: 友だち登録のあいさつと返事を送るもの。
   - 「チャネルシークレット」と「チャネルアクセストークン（長期）」を控えます。
   - Webhook の使用を有効にし、**Webhook の再送を有効にします**（反映に失敗したときの取りこぼしを防ぎます）。
   - Webhook URL は、この時点では空のままで構いません。手順 8 で `https://<CloudFront のドメイン>/line/webhook` を入れます。
   - 応答メッセージ（自動応答）は無効にします。
2. **LINE ログイン チャネル**: 画面でログインするためのもの。「チャネル ID」を控えます。
3. **LIFF アプリ**（LINE ログイン チャネルの中に作ります）: サイズは Full、スコープは `openid` と `profile`。LINE ログイン チャネルと公式アカウントを「リンク」して、友だち追加の案内が出るようにします。
   - **エンドポイント URL は、仮の値（`https://example.com` など、`https://` で始まる URL なら何でもよい）で作ります。** 本物の URL は AWS に反映するまで決まりませんが、LIFF ID がないと画面をビルドできないためです。エンドポイント URL は、あとから LINE Developers の画面で変えられます（手順 8）。
   - 作ると「LIFF ID」（`1234567890-abcdefgh` のような形）が表示されます。これを控えます。LIFF の URL は `https://liff.line.me/<LIFF ID>` です。

### 2. パラメータストアに値を入れる

環境ごと（`<env>` は `staging` か `production`）に、SecureString で次の 6 つを入れます。値は手元で入力し、チャットやファイルには書かないでください。

| 名前                                                        | 値                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/housework-calendar/<env>/line/channel-secret`             | Messaging API のチャネルシークレット                                                |
| `/housework-calendar/<env>/line/channel-access-token`       | Messaging API のチャネルアクセストークン                                            |
| `/housework-calendar/<env>/line/login-channel-id`           | LINE ログインのチャネル ID                                                          |
| `/housework-calendar/<env>/line/liff-url`                   | LIFF の URL（`https://liff.line.me/<LIFF ID>`。CloudFront のドメインではない）      |
| `/housework-calendar/<env>/jwt/signing-secret`              | セッション用の鍵（**自分で作る**。長いランダムな文字列）                            |
| `/housework-calendar/<env>/cloudfront/origin-verify-secret` | CloudFront と Lambda の間の秘密のヘッダーの値（**自分で作る**。JWT の鍵とは別の値） |

自分で作る 2 つの値は、手元のその場で作って入れます（履歴に残したくなければ、コマンドの先頭にスペースを入れます）。

```bash
# セッション用の鍵
aws ssm put-parameter --region ap-northeast-1 --type SecureString \
  --name /housework-calendar/staging/jwt/signing-secret \
  --value "$(openssl rand -base64 48)"

# CloudFront の秘密のヘッダーの値（英数字だけにする）
aws ssm put-parameter --region ap-northeast-1 --type SecureString \
  --name /housework-calendar/staging/cloudfront/origin-verify-secret \
  --value "$(openssl rand -hex 32)"
```

CloudFront の秘密のヘッダーの値は、CloudFront のヘッダーに入り、反映のときは `cdk deploy -c originVerifySecret=...` のコマンドの引数でも渡ります。`+`・`/`・`=` を含まないよう、英数字だけ（`openssl rand -hex 32` で 64 文字の 0-9 と a-f）にしてください。

LINE から写す 4 つの値も、同じ `aws ssm put-parameter --type SecureString` で入れます。

値はあとから入れ替えられます。パラメータストアの値を変えてから、反映（手順 7）をもう一度動かしてください。Lambda は起動するときに新しい値を読み、CloudFront も新しい値で作り直されます。本番を用意するときは、`<env>` を `production` にして、すべて別の値で入れます。

### 3. CDK の bootstrap

```bash
npm ci
npx cdk bootstrap aws://<アカウント ID>/ap-northeast-1   # infrastructure/ で実行してもよい
```

### 4. `Housework-Account` を手元から反映する（1 回だけ）

GitHub の OIDC のプロバイダー、反映用のロール 2 つ、AWS Budgets（月 1 ドル）ができます。

```bash
npm run build -w packages/frontend      # VITE_LIFF_ID を付ける（下の「画面のビルド」）
cd infrastructure
npx cdk deploy Housework-Account \
  -c originVerifySecret=unused \
  -c githubOwner=<GitHub のユーザー名または組織> \
  -c githubRepo=<リポジトリ名> \
  -c githubOwnerId=<持ち主の ID（数字）> \
  -c githubRepoId=<リポジトリの ID（数字）> \
  -c budgetEmail=<予算の知らせを受けるメール>
```

**`githubOwnerId` と `githubRepoId` は必ず渡してください。** GitHub は、OIDC のトークンの `sub` を `repo:<持ち主>@<持ち主の ID>/<リポジトリ>@<リポジトリの ID>:ref:refs/heads/main` のように、番号の入った形で出すことがあります。両方を渡すと、ロールは名前だけの形と番号の入った形のどちらにも完全一致で応じます。渡さないと名前だけの形にしか応じず、GitHub Actions の反映が `Not authorized to perform sts:AssumeRoleWithWebIdentity` で止まります。

番号は次のコマンドで調べられます（`gh` を使わないなら、`https://api.github.com/repos/<持ち主>/<リポジトリ>` をブラウザで開き、`owner.id` と `id` を見ます）。

```bash
gh api repos/<持ち主>/<リポジトリ> --jq '{githubOwnerId: .owner.id, githubRepoId: .id}'
```

反映が `AssumeRoleWithWebIdentity` で断られたときは、CloudTrail の「イベント履歴」（東京リージョン）でイベント名 `AssumeRoleWithWebIdentity` を開くと、`userIdentity.userName` に GitHub から届いた `sub` が出ます。ロールの条件（`aws iam get-role --role-name housework-calendar-github-staging-deploy`）と見比べてください。

反映の出力に出る `StagingDeployRoleArn` と `ProductionDeployRoleArn` を控えます（秘密の値ではありません）。

- ステージング用のロールは `repo:<owner>/<repo>:ref:refs/heads/main` の GitHub Actions だけが引き受けられます。
- 本番用のロールは `repo:<owner>/<repo>:environment:production` だけが引き受けられます。本番の環境を `main` に限る設定は、次の手順 6 で GitHub 側にかけます。

### 5. Lambda の同時実行数の枠を確かめる

作ったばかりの AWS アカウントは、Lambda の同時実行数の枠が 10 のことがあります。関数ごとに同時実行数を予約するには、予約していない数を 100 以上残す必要があるため、枠が 1000 でないと設定できません。

```bash
aws service-quotas get-service-quota --region ap-northeast-1 \
  --service-code lambda --quota-code L-B99A9384 --query Quota.Value
```

- 1000 以上: `-c reservedConcurrency=5` を付けて反映します（GitHub の変数 `RESERVED_CONCURRENCY` に `5` を入れると自動の反映にも付きます）。
- 10 のとき: 予約は付けずに反映できます（既定）。AWS サポートで枠の引き上げを申し込んでください（無料）。引き上げまでは、Budgets の知らせだけで備えます。

### 6. GitHub の設定

1. 環境 `production` を作ります（Settings → Environments）。
   - Required reviewers に作り手自身を入れます。
   - Deployment branches は「Selected branches」で `main` だけにします。
2. `main` のブランチ保護で、`ci.yml` の成功を必須にします。
3. Variables（Settings → Secrets and variables → Actions → **Variables** タブ）に次を入れます。秘密の値ではありません。Secrets のタブには何も入れません（上の「用意するもの」を参照）。ステージングを試すだけなら、`STAGING_DEPLOY_ROLE_ARN` と `STAGING_VITE_LIFF_ID` の 2 つで足ります。

| 変数                                                     | 値                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `STAGING_DEPLOY_ROLE_ARN`                                | 手順 4 の `StagingDeployRoleArn`                                  |
| `PRODUCTION_DEPLOY_ROLE_ARN`                             | 手順 4 の `ProductionDeployRoleArn`                               |
| `STAGING_VITE_LIFF_ID` / `PRODUCTION_VITE_LIFF_ID`       | 環境ごとの LIFF ID                                                |
| `STAGING_VITE_LINE_OA_ID` / `PRODUCTION_VITE_LINE_OA_ID` | 環境ごとの公式アカウントの ID（任意。友だち追加の案内に使います） |
| `RESERVED_CONCURRENCY`                                   | 手順 5 で 1000 以上のときだけ `5`                                 |

### 7. ステージングに反映する

手順 2 のパラメータ（特に `cloudfront/origin-verify-secret`）を入れたうえで、`main` に取り込むと `deploy-staging.yml` が反映します。手元から行うなら、次のようにします。

```bash
export VITE_LIFF_ID=<LIFF ID>
npm run build -w packages/frontend
cd infrastructure
npx cdk deploy Housework-staging-Data Housework-staging-App \
  -c originVerifySecret="$(aws ssm get-parameter --name /housework-calendar/staging/cloudfront/origin-verify-secret --with-decryption --query Parameter.Value --output text)"
```

出力の `DistributionDomain`（`xxxx.cloudfront.net`）が CloudFront のドメインです。GitHub Actions で反映したときは、ワークフローのログの「反映」の出力に出ます。

### 8. LINE の URL を本物に入れ直す

手順 1 で空のまま・仮の値にした 2 つを、CloudFront のドメインで入れ直します。

1. LIFF アプリのエンドポイント URL: `https://xxxx.cloudfront.net/`
2. Messaging API の Webhook URL: `https://xxxx.cloudfront.net/line/webhook`。「Webhook の利用」をオンにし、「検証」ボタンで成功が返ることを確かめます

LIFF ID と LIFF の URL は変わらないので、パラメータストアと GitHub の Variables はそのままで構いません。

## 画面のビルド

`VITE_LIFF_ID`（必須）と `VITE_LINE_OA_ID`（任意）は、公開してよい値です。CI では GitHub の変数から入れます。

```bash
VITE_LIFF_ID=<LIFF ID> VITE_LINE_OA_ID=<@公式アカウント ID> npm run build -w packages/frontend
```

## テストの動かし方

```bash
npm ci
npx vitest run u1-skeleton-family --coverage \
  --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'   # U1 のテストとカバレッジ
npx vitest run u2-invitation   # U2 のテスト
npx vitest run u5-assignment-calendar   # U5 のテスト
npx vitest run u6-recording    # U6 のテスト
npx vitest run --coverage      # すべて（行 80% 以上が下限。下げません）
npx prettier --check .
npx eslint .
npx tsc --noEmit -p infrastructure
```

CDK の組み立ては、AWS の権限なしで確かめられます（先に画面をビルドしておく）。

```bash
cd infrastructure
npx cdk synth --quiet -c originVerifySecret=dummy -c githubOwner=o -c githubRepo=r -c budgetEmail=a@example.com
```

## テストの作り物の秘密の値と、push 前の秘密の情報の検査

CI の gitleaks は、値の「ランダムっぽさ」（エントロピー）で鍵を見つけます。そのため、テスト用の作り物の値でも、どれが検出されるかを事前には読めません。検出されると CI が止まるので、次の決まりで防ぎます。

- 秘密の値に見えるもの（鍵、トークン、印、パスワードなど。名前に `secret` / `token` / `key` などを含むものも）は、テストの中に直接書きません。
- 置く場所は、各パッケージの `test/fixtures/fakeSecrets.ts` だけです（`infrastructure`、`packages/backend`、`packages/frontend`）。`FAKE_*` の名前で export し、テストから import します。
- `fakeSecrets.ts` の各行の終わりには `// gitleaks:allow テスト用の作り物の値` を付けます。本物の値は絶対に置きません。
- ESLint（`eslint.config.js` の最後のブロック）が、`test/` 以下（`fakeSecrets.ts` を除く）での直書きを error にします。`npm run lint` と CI で止まります。
- `.gitleaksignore` には足しません。

### ESLint は補助です。最終の防御は `npm run secrets:scan`

ESLint が止めるのは、TypeScript のテスト（`**/test/**`）にある次のものだけです。

- 名前が `secret` / `token` / `password` / `passwd` / `credential` / `api_key` / `authorization` を含む、または `key` で始まる・終わる・`_key` を含む変数やプロパティ（`'Idempotency-Key'` のような文字列のキーも）に、直接書いた文字列（8 文字以上）、式のないテンプレートリテラル、文字列の連結を入れたもの。
- UUID の形の文字列（名前によらない）。
- 20 文字以上で、英数字と `_ - + / = .` だけでできていて、英字と数字の両方を含み、先頭が `/` でない文字列（名前によらない）。`import` / `require` / `vi.mock` / `loadFeature` の引数は除きます。

最後の「20 文字以上」の絞り込みは、意図して狭めています。英数字と記号だけの 20 文字以上を全部止めると、CDK のスタック名（`Housework-staging-App`）、エラーの理由（`SERVICE_TEMPORARILY_UNAVAILABLE`）、API のパス、`describe` の名前など、無害な文字列が 200 件以上も止まり、使えなくなるためです。英字だけの値や、名前も形も秘密らしくない値は、ESLint では止まりません。

次のものは ESLint の対象外です。**`.feature`（例の表）、シェルスクリプト、YAML（`.github/workflows/*.yml` の `originVerifySecret=ci-dummy-…` など）、JSON、README は gitleaks に任せます。** ESLint が通ったことは、gitleaks が通ることを意味しません。

push の前に、手元で次を実行して確かめます。

```bash
brew install gitleaks   # 1 回だけ（8.19 以上が必要。古ければ brew upgrade gitleaks）
npm run secrets:scan
```

`secrets:scan` は次の 2 つを調べます（検出された値は伏せて表示されます）。

1. Git の履歴（コミット済みの内容）: `gitleaks git --redact --no-banner -v`。CI の gitleaks と同じ範囲です。
2. 作業ツリー全体（まだ `git add` していない新しいファイルも含む）: `gitleaks dir . --redact --no-banner -v`。

どちらも、リポジトリ直下の `.gitleaks.toml` を読みます。この設定は既定のルールをそのまま使い（`[extend] useDefault = true`）、`node_modules`・`dist`・`cdk.out`・`coverage` のフォルダだけを読み飛ばします（`[allowlist] paths`）。これらはどれも `.gitignore` の対象で Git に入らないため（`git ls-files` で 1 件もないことを確かめ済み）、CI の gitleaks（履歴の検査。`gitleaks-action` もこのファイルを自動で読みます）の結果は、この 4 つのフォルダを読み飛ばす以外は変わりません。

## 反映の流れ

- `ci.yml`: プルリクエストと `main` への push。Prettier、ESLint、tsc、Vitest とカバレッジ、gitleaks、`cdk synth`。AWS の権限は付けません。
- `deploy-staging.yml`: `main` への push のあと、同じ検査が通ったらステージングに自動で反映し、`scripts/smoke-check.sh` で確かめます。
- `deploy-production.yml`: 作り手が手動で実行します（`ref` に反映するコミットを入れる）。`main` にあるコミットだけが対象で、環境 `production` の承認を待ちます。
- 前の版に戻すとき: 問題のコミットを `git revert` して `main` に取り込み、ステージングで確かめてから本番を手動で実行します。DynamoDB のデータは戻しません（項目やテーブルを足すだけにして、消したり名前を変えたりしません）。

## ステージングで B1 を確かめる（4 つの手順）

1. スマホの LINE で、ステージングの公式アカウントを友だち追加します。あいさつ、「アプリを開く」ボタン、使い方の説明が届きます。
2. ボタンから画面を開きます。LINE のログインが通り、家族に入っていない人向けの「家族を作る」「招待を待つ」が出ます。
3. 「家族を作る」で名前（1〜20 文字）を入れて保存します。今月のカレンダーの枠が出ます。作った人は管理者になります。
4. 画面を閉じて開き直します。同じ家族の枠が出ます。ブロックして友だち登録し直しても、家族と役割は変わりません。

うまくいかないときは、`scripts/smoke-check.sh <CloudFront の URL> <api の関数 URL>` を手で動かして、配信と振り分けを先に確かめます。

## U2（招待）の反映と運用

### shareTargetPicker を有効にする（環境ごとに 1 回）

「LINE で送る」は LIFF の shareTargetPicker を使います。反映の前に、ステージングと本番の LIFF アプリそれぞれで有効にします（本番の `deploy-production.yml` を動かす前に本番の分も）。

1. [LINE Developers](https://developers.line.biz/console/) で、その環境のプロバイダー、LINE ログインのチャネルを開きます。
2. 「LIFF」のタブで、画面を開くのに使っている LIFF アプリを開きます。
3. 「shareTargetPicker」を有効にして保存します。

有効でないときや使えない端末では、画面が LINE のシェアの URL を開く形に切り替わります。

### 使えない招待の数を週に 1 回見る（U10 でアラームを足すまで）

使えない招待のリンクを開こうとした回数は、CloudWatch のメトリクス `InvitationInvalidCount`（名前空間 `Housework/staging`、`Housework/production`）に出ます。週に 1 回、AWS コンソールの CloudWatch の「メトリクス」で、期間を 1 週間にして合計を見ます。ふだんは 0 に近い数です。1 時間に 20 回を超える日があれば、リンクの当てずっぽうを疑って、次の手順で止めることを考えます。データのない時間は 0 として数えます。

### 濫用されたときに止める（画面用の Lambda だけ）

CDK を通さず、作り手が AWS CLI で画面用の Lambda（`api`）の予約された同時実行数を 0 にします。関数名は、CloudFormation のスタック `Housework-<env>-App` のリソースの `ApiFunction...` の物理 ID です。

```bash
aws lambda put-function-concurrency \
  --function-name <api の関数名> --reserved-concurrent-executions 0
```

- LINE 用の受け口（`line`）は止めません。友だち登録とブロックは届き続けます。
- 戻すとき: 次の反映（`deploy-staging.yml` か `deploy-production.yml`）で CDK の値に戻ります。急ぐときは `aws lambda delete-function-concurrency --function-name <api の関数名>` で予約を外します。
- アカウントの同時実行数の枠が小さい（10 など）環境では、`aws lambda get-account-settings` で枠を確かめてください。

### ログインしての確かめ（ステージング、作り手が手で行う）

1. 管理者の LINE アカウントで画面を開き、「家族の設定」に進みます。メンバーの一覧に自分が「管理者」で出ます。
2. 「招待用のリンクを作る」を押し、「LINE で送る」で別の LINE アカウント（友だち登録済み、家族に入っていない）に送ります。
3. 別のアカウントでリンクを開きます。「（家族の名前）に参加しますか？」が出ます。「参加する」を押すと、カレンダーの枠に進みます。
4. 管理者の画面で「家族の設定」を開き直します。メンバーの一覧に、新しい人が「子供」で出ます。
5. 「招待用のリンクを作り直す」を押したあと、前のリンクを開くと「この招待は使えません…」になることも確かめます。

`scripts/smoke-check.sh` は、セッションなしで U2 の 5 つの操作が 401 になることも確かめます。

## U3（お知らせ先）の反映と運用

### 公式アカウントがグループに参加できるようにする（環境ごとに 1 回）

反映の前に、ステージングと本番の公式アカウントそれぞれで設定します（本番の `deploy-production.yml` を動かす前に本番の分も）。

1. [LINE Official Account Manager](https://manager.line.biz/) で、その環境の公式アカウントを開きます。
2. 「設定」→「応答設定」（または「アカウント設定」）を開きます。
3. 「グループ・複数人チャットへの参加を許可する」を有効にして保存します。

画面の場所は LINE 側の変更で変わることがあります。反映の前に実際の画面で確かめ、見つからなければこの手順を直してください。

### お知らせ先の登録の手順

1. 公式アカウントを、家族のグループ LINE に招待します。
2. 公式アカウントが案内とボタン「このグループをお知らせ先にする」を送ります。管理者がボタンを押します。
3. ボタンが見えないときは、管理者がグループで「登録」と送ります（前後の空白以外は付けません）。
4. 「このグループを（家族の名前）のお知らせ先にしました」と返ってきたら完了です。画面の「家族の設定」に「お知らせ先: （グループの名前）」が出ます。
5. 別のグループで登録し直すと、新しいグループに置き換わります。公式アカウントをお知らせ先のグループから外すと、登録が外れます。

### 困ったとき

- **グループに招待しても案内が届かない:** まず上の「グループ・複数人チャットへの参加を許可する」の設定を確かめます。設定がないと公式アカウントがグループに参加せず、イベントが来ないのでログにも何も出ません。
- **「お知らせ先を登録できるのは管理者だけです」と返ってきた:** 子供のアカウント、家族に入っていない人、記録のない人のときの返事です。管理者でも、公式アカウントをブロックしていると同じ返事になります。ブロックを解除してから、もう一度登録します。
- **「このグループはほかの家族のお知らせ先になっています」と返ってきた:** 同じグループにいる別の家族の管理者が先に登録しています。先の家族が別のグループを登録するか、公式アカウントをグループから外して招待し直してから、登録します。
- **「お知らせ先の登録は、家族のグループ LINE の中で行ってください」と返ってきた:** 1 対 1 のトークで「登録」と送ったときの返事です。家族のグループで送ります。

### ステージングでの手の確かめ（作り手が手で行う）

1. 作り手だけのグループに、ステージングの公式アカウントを招待します。案内とボタンが届きます。
2. 管理者がボタンを押します。登録の返事が届きます。
3. 画面の「家族の設定」に、グループの名前が出ます。
4. 子供のアカウントでグループに「登録」と送ると、「お知らせ先を登録できるのは管理者だけです」と返ります。
5. 公式アカウントをグループから外します。画面を開き直すと、「お知らせ先: 登録されていません」と出ます（管理者のカレンダーの枠の画面には「お知らせ先のグループが登録されていません」が出ます）。

`scripts/smoke-check.sh` は、セッションなしで `GET /v1/family/notification-group` が 401 になることも確かめます（U4 のあとは全 15 件のうちの 1 件）。LINE の join・登録・leave は署名のある Webhook が必要なので、スクリプトでは確かめません。

### テーブルまで前の版に戻すとき（2 回に分ける）

CDK では Data スタックのテーブルを App スタックに渡すため、Data が書き出し、App が取り込みます。1 回の `git revert` で戻すと、Data が先に反映されて、App がまだ使っている書き出しを消そうとし、CloudFormation に断られます。次の 2 回に分けます。

1. まず、App が `NotificationGroups` を使わない形のコミットを `main` に取り込み、反映します。
2. そのあとで、Data から `NotificationGroups` を外すコミットを取り込みます。

U2 の `Invitations` を戻すときも同じ手順です。

- `NotificationGroups` は本番では `RETAIN` なので、戻してもスタックから外れるだけで消えません。もう一度反映すると、新しい空のテーブルができ、前のお知らせ先は引き継がれません。
- `Families.notificationGroupId` に古い値が残っても、管理者がグループで登録し直すと置き換わります。ステージングは `DESTROY` なので、戻すとテーブルは消えますが、同じく登録し直しで置き換わります。

## U4（お手伝いの種類）の反映と運用

### お手伝いの種類の画面の使い方

「家族の設定」の「お手伝いの種類」を押すと、種類の一覧が出ます。管理者は次のことができます。子供は一覧を見るだけで、ボタンは出ません。

- **追加:** 名前（1〜20 文字）、単価（0 円以上の整数）、説明（なくてもかまいません。100 文字まで）を入れて保存します。
- **変更:** 名前・単価・説明を直します。単価を変えても、すでに付いた記録の金額は変わらず、このあとに付く記録から新しい単価になります。
- **使わない／使う:** 「使わない」にすると、新しい割り当てで選べなくなります。過去の記録とお小遣いはそのまま残ります。「使う」で戻せます。
- **消す:** 割り当てに一度も使われていない種類だけ消せます。使われたことがある種類は消せず、自動で「使わない」になります。

名前は、同じ家族の中で重ねられません。1 日に 2 回以上あるお手伝いは、「皿洗い」と「皿洗い（追加分）」のように、別の名前の種類に分けて登録します。同じ名前の「使わない」種類があるときは、新しく登録せず「使う」に戻すか、別の名前にします。

### ステージングでの手の確かめ（作り手が手で行う）

1. 管理者のアカウントで「家族の設定」→「お手伝いの種類」を開き、「皿洗い 100 円」を説明つきで追加します。一覧に「皿洗い　100 円」が出ます。
2. 同じ名前でもう一度追加すると、「皿洗い（追加分）」のように別の名前で登録するよう案内が出て、入力が残ります。
3. 単価に `-1` や `1.5` を入れて保存すると、「単価は 0 円以上の整数で入力してください」と出ます。
4. 「皿洗い」の単価を 120 円に変えます。一覧が 120 円になります。
5. 「使わない」を押して確かめに答えると、一覧の下の「使わない」に移ります。「使う」で戻ります。
6. 「消す」を押して確かめに答えると、一覧からなくなります（U5 以降は、割り当てに使っている種類は消せません）。
7. 子供のアカウントで同じ画面を開くと、一覧だけが見え、ボタンは出ません。
8. PUT・PATCH・DELETE が CloudFront を通って届くことは、上の 4〜6 の操作で確かめられます（`scripts/smoke-check.sh` はセッションなしの 401 だけを確かめます）。

`scripts/smoke-check.sh` は、セッションなしで `GET`・`POST /v1/chore-types` と、`PUT`・`PATCH`・`DELETE /v1/chore-types/{id}` が 401 になることも確かめます（全 20 件。U5・U6 の分は次の節）。

### U5 を反映したあとの戻し方（前に進んで直す）

U5 を反映したあとは、`ChoreTypes` のテーブルも U4 のコードも前の版に戻しません。U5 の割り当てが、`ChoreTypes` の種類を使います。戻すと、割り当てが指している種類が消え、お小遣いの内訳が壊れます。`ChoreTypes` は本番では `RETAIN` ですが、スタックから外すと、もう一度反映したときに新しい空のテーブルができ、前の種類は引き継がれません。

問題が起きたときは、U4 を含む新しい修正のコミットを `main` に取り込み、前に進んで直します（U2 の `Invitations`、U3 の `NotificationGroups` のテーブルを戻すときの 2 回に分ける手順も、U5 を反映する前の話です）。

## U5（割り当てとカレンダー）の反映と運用

### カレンダーと割り当ての画面の使い方

家族のメンバーは全員、月のカレンダーを見られます。日を押すと、その日の担当（お手伝いの名前、子供、未・済・×）が出ます。割り当ての入力と、日ごとの担当の変更ができるのは管理者だけです。子供の画面には「割り当てを入力する」と「担当を変える」は出ません。

- **割り当てを入力する:** お手伝いの種類ごとに、子供と曜日を選んで保存します。割り当てを入力できるのは**今月と来月だけ**です（それ以外の月は「割り当てを入力できるのは今月と来月だけです」）。
- **保存したときの担当:** 今月は今日から月末まで、来月は 1 日から月末までの担当ができます。過ぎた日の担当は作られません。
- **保存し直したとき:** 変わるのは、明日以降で「未」の担当だけです。今日の担当、過ぎた日の担当、「済」「×」になった担当は変わりません。割り当てから消した行の「未」の担当は消えます。
- **同じ日の同じ種類に担当が 2 人いるとき:** 「1月4日(月) の皿洗いに担当が 2 人います」のような一覧が出て、保存されません。入力を直してから保存します。
- **日ごとの「担当を変える」:** 日の詳細で、「未」の担当の子供を 1 人選び直せます。「済」「×」の担当と、確定済みの月は変えられません。
- **上書きの確かめ:** 日ごとに変えた担当（や、ほかの人が引き受けた担当）があるまま割り当てを保存し直すと、「次の担当が上書きされます」の一覧（例: 「1月22日 皿洗い: 太郎 → 花子」）が出ます。「この内容で保存する」を押すと保存されます。一覧が出てから内容が変わったときは、もう一度一覧が出ます。
- **先月と同じにする:** 先月の割り当てを入力欄に写します（保存はしません）。「使わない」になった種類は入れず、「使わないお手伝いは入れませんでした」と出ます。先月の割り当てがなければ「先月の割り当てはありません」と出ます。写したあとに内容を見て、保存します。

### 保存の途中で失敗したとき

担当が多いと、保存は何回かに分けて書きます。途中で失敗すると、「保存できませんでした。もう一度保存してください」と出て、一部の担当だけが書き換わっていることがあります。**もう一度保存してください。** 何度保存しても今の割り当てに対して同じ結果にそろいます。手でデータを直す必要はありません。

### ステージングでの手の確かめ（作り手が手で行う）

| #   | 操作                                                                                         | 期待                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | 管理者でアプリを開く（割り当てのない今月）                                                   | 「この月の割り当てはまだありません」と「割り当てを入力する」が出る                              |
| 2   | 種類ごとに子供と曜日を入れて保存（今月）                                                     | 今日から月末まで担当ができる。過ぎた日は作られない                                              |
| 3   | 来月に切り替えて保存                                                                         | 1 日から月末まで担当ができる                                                                    |
| 4   | 同じ曜日に同じ種類の担当を 2 人入れて保存                                                    | 「担当が 2 人います」の一覧が出て、保存されない                                                 |
| 5   | 保存し直す（子供を変える）                                                                   | 明日以降の「未」だけが変わる。今日と過ぎた日は変わらない                                        |
| 6   | 日の詳細で「担当を変える」から子供を変え、そのあと割り当てを保存し直す                       | 上書きの確かめの一覧が出て、「この内容で保存する」で保存できる                                  |
| 7   | 子供のアカウントで開く                                                                       | カレンダーは見られる。「割り当てを入力する」と「担当を変える」は出ない                          |
| 8   | 管理者で、割り当てに使っている種類を消そうとする（U4 の「消す」）                            | 409 の案内が出て消えない                                                                        |
| 9   | 割り当てに使っていない種類を消す                                                             | 消える                                                                                          |
| 10  | `api` のログを見る                                                                           | `ASSIGNMENT_SAVED` に `dutyCount` などが出る。`REQUEST_END` に `coldStart` が出る。名前は出ない |
| 11  | 速さを測る（コールドスタートを含めて 20 回ずつ）                                             | 95% が 3 秒以内。結果は `build-and-test` の記録に残す                                           |
| 12  | CloudWatch で `Calendar` の `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits` を見る | 確かめの量に見合う。見込みから大きく外れていない                                                |

`scripts/smoke-check.sh` は、セッションなしで `GET`・`PUT /v1/months/{month}/assignment`、`GET /v1/months/{month}/calendar`、`PATCH /v1/duties/{dutyId}` が 401 になることも確かめます（U5 の 4 件。全 20 件）。書き込みはしません。

### コールドスタートの測り方（手 11 の補足）

コールドスタートを含めるには、新しい実行環境を作ります。次のどちらかにします。

- **コードが変わる反映**（ステージングへの配備）をする。
- **数十分以上、要求を送らずに待つ**。

**Lambda の環境変数は書き換えません。** `update-function-configuration --environment` は変数の一覧を丸ごと置き換えるので、`CALENDAR_TABLE` などの既存の変数が消えて壊れます。測りは本番ではやりません（本番にテストデータを入れないため）。`REQUEST_END` の `coldStart` が `true` の要求が、コールドスタートです。

### 費用の確認（最初の請求）

DynamoDB のオンデマンドの読み書きは無料枠の対象外なので、U5 は毎月わずかな金額（見込み約 0.002 ドル）がかかります。「請求額 0 円」が成り立つのは、これが端数の丸めで 0.00 ドルになる前提のときです。次の手順で確かめます。

1. **基準を控える:** U5 を本番に反映する前に、直近の月次の請求の DynamoDB の行（`ap-northeast-1`）の金額を控えます。
2. **量で確かめる:** 本番に反映して 1〜2 週間後と、反映した月の終わりに、CloudWatch で `Calendar`（本番）の `ConsumedWriteCapacityUnits`・`ConsumedReadCapacityUnits` の期間の合計を見ます。書き込み約 1100、読み取り約 7000 ユニット / 月の見込みと比べます。
3. **請求で確かめる:** 反映した最初の月が終わり、請求が確定したあと（翌月の初め）に、Billing の請求書で DynamoDB の行を開き、Cost Explorer で使用タイプ別・日別に見て、手順 1 の控えと比べます。表ごとの内訳は出ないので、増分で見ます。DynamoDB 以外に新しい行がないことも見ます。

結果は、`build-and-test` の記録に残し、次の表に書き足します。判断の目安は、0.00 ドルか増えていなければ前提どおり、増分が 0.01 ドル程度で量が見込みどおりなら丸めの結果（言い方を「ほぼ 0 円」に直すかは作り手が決める）、量が見込みの 10 倍以上か増分が 0.10 ドルを超えるなら原因を調べます。月 1 ドルの Budgets は、別の最後の見張りとして残ります。

| 確かめた日 | 段階（量・請求） | 結果 | 判断 |
| ---------- | ---------------- | ---- | ---- |
| （未実施） |                  |      |      |

### U5 を反映したあとの戻し方（前に進んで直す）

U5 を反映したあとは、`Calendar` のテーブルも U5 のコードも前の版に戻しません。戻すと次のことが起きます。

- U5 以前のコードに戻ると、割り当てに使っている種類を消せてしまい、カレンダーが種類の名前を引けなくなります。
- テーブルを外して作り直すと、`RETAIN` のテーブルは残りますが、新しい空のテーブルが使われ、それまでの担当と割り当てが見えなくなります。U6 以降の記録も同じ状態になります。

問題が起きたときは、修正のコミットを `main` に取り込み、前に進んで直します。**本番の `Calendar` のデータは、手で書き換えません。** 割り当てが壊れたと思ったときは、まず管理者が割り当てを保存し直します。収まらないときは、直す手順をコードとして用意し、プルリクエスト、CI、ステージングでの確認を通してから本番に反映します。

例外として、U5 を本番に反映する前、または本番の `Calendar` に項目が 1 件もないと読み取りだけで確かめられたとき（`aws dynamodb scan --select COUNT --consistent-read` で 0 件）は、U3・U4 と同じく 2 回に分けて戻せます。1 回目に App が `Calendar` を使わない形（`CALENDAR_TABLE`、権限、`AppStackProps` の `calendar`）を反映し、2 回目に Data から `Calendar` を外します。0 件と確かめられないときは「前に進んで直す」にします。ステージングは `DESTROY` なので、テーブルごと作り直せます。

## U6（記録）の反映と運用

U6 は、子供が LINE のリッチメニュー「やった」と画面から、今日（画面は過去の日も）の担当を記録できるようにします。記録すると担当が「済」になり、お手伝いの名前と記録した時刻、そのときの単価を担当に書き写します。配備で足すのは `line` の Lambda の環境変数 2 つ（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`）と権限 2 文だけで、テーブル・Lambda・索引・指標・アラームは足しません。

### リッチメニューを設定する（環境ごとに 1 回）

LINE のリッチメニュー（画面の下の「やった」ボタン）は、CDK ではなく `scripts/setup-rich-menu.ts` で設定します。チャネルアクセストークンは、スクリプトが実行時にパラメータストア（`/housework-calendar/<env>/line/channel-access-token`）から読みます。**トークンの値は、コマンドにもファイルにも書きません**（値は `<作り物の値>`）。手元の AWS CLI のプロファイルにそのパラメータを読む権限が要ります。

```bash
npx tsx scripts/setup-rich-menu.ts --env staging set      # メニューを作って全員に適用する
npx tsx scripts/setup-rich-menu.ts --env staging get      # 今の設定を確認する
npx tsx scripts/setup-rich-menu.ts --env staging delete   # 設定を取り消す
```

- **`--env staging|production` は必須です。** 指定がないとスクリプトは止まります（既定で本番を選ばないため）。本番に設定するときは `--env production` にします。
- `set` はメニューを作って全員に適用します。メニューの画像はまだ付かないので、作成後に表示される案内に従い、LINE Developers のコンソールか `POST /v2/bot/richmenu/{id}/content` で画像を登録します。
- ボタンを押すと postback `action=record.list` が LINE から届き、`line` の Lambda が今日の記録できる担当の選択肢を本人にだけ返します。
- スクリプトは Calendar にも ChoreTypes にも触れません（記録のデータは読み書きしません）。

### 返事の速さを測る（NFR7.30。3 秒の目標）

「記録する／やった」を押してから返事が届くまでを、**ステージングで 20 回**測り、95%（20 回中 19 回）が 3 秒以内であることを確かめます。測りは本番ではやりません（本番にテストデータを入れないため）。

1. ステージングのスマホの LINE で、子供のアカウントでリッチメニュー「やった」を押し、選択肢から 1 件を押します。画面録画をしておき、押した瞬間から返事の表示までの時間を読み取ります。
2. コールドスタートを含めるため、数十分以上あけるか、コードが変わる反映をはさんで、新しい実行環境でも測ります。`line` のログの `DUTY_RECORDED` に `durationMs` と `route = line` が出ます（LINE のユーザー ID・表示名は出ません）。
3. 結果は `build-and-test` の記録に残します。3 秒を超える回が多いときだけ、`line` の Lambda のメモリを 256 MB から 512 MB に上げることを検討します（無料枠に収まるかを先に確かめます）。

### ステージングでの手の確かめ（作り手が手で行う）

1. 子供のアカウントでリッチメニュー「やった」を押すと、今日の「未」の担当の選択肢が本人にだけ届きます（グループには何も届きません）。
2. 選択肢から 1 件を押すと「{お手伝い}を記録しました（{時:分}）」が返り、もう一度同じボタンを押しても記録は 1 件のまま、同じ時刻が返ります（二重押しの確かめ）。
3. 管理者のアカウントで「やった」を押すと、「お手伝いの記録は子供のメニューです。記録の修正は画面からできます」だけが返ります。家族に入っていない人には「先に家族に参加してください」だけが返ります。
4. 画面（LIFF）で、子供が自分の今日の「未」の担当の「やった」を押し、「{月}/{日} {お手伝い}を記録しますか」の確認で「記録する」を押すと、「済」に変わります。明日以降・「×」・確定済みの月の担当にはボタンが出ず、理由の文字が出ます。
5. `line` のログに `DUTY_RECORDED` が出ること、LINE への呼び出しが reply だけであることを確かめます。

`scripts/smoke-check.sh` は、セッションなしで `POST /v1/duties/{dutyId}/record` が 401 になることも確かめます（U6 の 1 件。全 20 件）。リッチメニューの押下は署名のある Webhook が要るので、スクリプトでは確かめません。

### U6 を反映したあとの戻し方

U6 を反映したあとは、記録済みの担当（`recordedAt`・`recordedBy`・`unitPrice`）が `Calendar` に残ります。前の版に戻すと `line` の環境変数と権限が消えますが、担当の項目の形は U5 のままなので、記録済みデータは壊れません。U5 と同じく、問題が起きたら修正のコミットを `main` に取り込み、前に進んで直します。**本番の `Calendar` のデータは、手で書き換えません。**

## 既知の課題

- GitHub Actions のサードパーティのアクション（`actions/checkout`、`actions/setup-node`、`aws-actions/configure-aws-credentials`、`gitleaks/gitleaks-action`）は、いまはバージョンのタグで指定しています。コミット SHA の固定は、ネットワークのある環境で調べて置き換えてください。
- 本番用の OIDC のロールは `environment:production` で絞っています。「`main` のコミットだけ」は、GitHub の環境の Deployment branches と、`deploy-production.yml` の確かめ（ref が `main` にあること）で守っています。
- ステージングと本番で LINE のチャネルを別にすると、公式アカウントごとに無料で送れるメッセージ数の枠があります。費用 0 円の条件との関係は、要件の段階で確かめてください。
