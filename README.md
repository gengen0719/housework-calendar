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

`scripts/smoke-check.sh` は、セッションなしで `GET /v1/family/notification-group` が 401 になることも確かめます（全 10 件）。LINE の join・登録・leave は署名のある Webhook が必要なので、スクリプトでは確かめません。

### テーブルまで前の版に戻すとき（2 回に分ける）

CDK では Data スタックのテーブルを App スタックに渡すため、Data が書き出し、App が取り込みます。1 回の `git revert` で戻すと、Data が先に反映されて、App がまだ使っている書き出しを消そうとし、CloudFormation に断られます。次の 2 回に分けます。

1. まず、App が `NotificationGroups` を使わない形のコミットを `main` に取り込み、反映します。
2. そのあとで、Data から `NotificationGroups` を外すコミットを取り込みます。

U2 の `Invitations` を戻すときも同じ手順です。

- `NotificationGroups` は本番では `RETAIN` なので、戻してもスタックから外れるだけで消えません。もう一度反映すると、新しい空のテーブルができ、前のお知らせ先は引き継がれません。
- `Families.notificationGroupId` に古い値が残っても、管理者がグループで登録し直すと置き換わります。ステージングは `DESTROY` なので、戻すとテーブルは消えますが、同じく登録し直しで置き換わります。

## 既知の課題

- GitHub Actions のサードパーティのアクション（`actions/checkout`、`actions/setup-node`、`aws-actions/configure-aws-credentials`、`gitleaks/gitleaks-action`）は、いまはバージョンのタグで指定しています。コミット SHA の固定は、ネットワークのある環境で調べて置き換えてください。
- 本番用の OIDC のロールは `environment:production` で絞っています。「`main` のコミットだけ」は、GitHub の環境の Deployment branches と、`deploy-production.yml` の確かめ（ref が `main` にあること）で守っています。
- ステージングと本番で LINE のチャネルを別にすると、公式アカウントごとに無料で送れるメッセージ数の枠があります。費用 0 円の条件との関係は、要件の段階で確かめてください。
