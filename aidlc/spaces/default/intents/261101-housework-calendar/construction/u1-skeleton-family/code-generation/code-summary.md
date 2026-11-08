# コードのまとめ（Code Summary）— U1 最初の形と家族を作る

承認された計画（`code-generation-plan.md`、20 ステップ）をすべて作りました。U1 は walking skeleton（端から端まで通る最小限の形）です。友だち登録と返事、LINE ログインで画面を開く、家族を作る、の流れが本物の機能でつながります。認証と家族の範囲の確かめの仕組み、AWS CDK と GitHub Actions の土台も、ここで作りました。

## 作ったファイル

| 場所 | 中身 |
|------|------|
| ルート | npm workspaces の `package.json` と `package-lock.json`（版はすべて固定）、`tsconfig.base.json`、`tsconfig.json`、Prettier（`.prettierrc.json`、`.prettierignore`）、ESLint（`eslint.config.js`。`react/no-danger` は error）、`vitest.config.ts`（行カバレッジ 80% の下限）、`.nvmrc`（22） |
| `.gitignore` | `node_modules/`、`dist/`、`cdk.out/`、`coverage/`、`.env*` の行を足しただけ。今ある行は変えていない |
| `packages/shared/src/` | 理由の印（`reasons.ts`）、文言の一覧（`messages.ts`）、`Result`（`result.ts`）、画面と裏側の型（`api-types.ts`） |
| `packages/backend/src/` | 入口 2 つ（`entries/api.ts`、`entries/line.ts`）、確かめ（`middleware/`: 秘密のヘッダー、LINE の署名、認証、メンバー、管理者、同じ家族）、業務の決まり（`services/`: 家族とメンバー、JWT、LINE の API）、データの読み書き（`repositories/`: Users、Families、ProcessedLineEvents、RequestRecords）、操作（`handlers/`）、設定・ログ・DynamoDB のクライアント（`lib/`） |
| `packages/frontend/` | Vite + React + MUI の画面: 友だち登録の案内、「家族を作る」「招待を待つ」、家族の名前の入力、招待を待つ案内、カレンダーの枠、読み込み直し。LIFF と LINE ログイン（`liff/liffClient.ts`）、メモリだけのセッション（`hooks/useSession.ts`）、API の呼び出し（`api/client.ts`）、テーマ（`theme.ts`） |
| `infrastructure/` | CDK: `Housework-Account`（GitHub の OIDC、反映用のロール 2 つ、Budgets 月 1 ドル）、`Housework-<env>-Data`（DynamoDB 4 つ）、`Housework-<env>-App`（Lambda 2 つと関数 URL、S3、CloudFront、CSP などの応答ヘッダー、ログ 30 日、最小の権限） |
| `.github/workflows/` | `ci.yml`（検査とテスト。AWS の権限なし）、`deploy-staging.yml`（`main` への取り込みでステージングへ）、`deploy-production.yml`（手動実行、環境 `production` の承認、`main` のコミットだけ） |
| `scripts/smoke-check.sh` | 反映後の 4 つの確かめ |
| `README.md`、`docs/contract-changes-u1.md` | 作り手が最初にすることの手順、U1 で足した契約の一覧 |

## 主な決めごと

- **LINE の Webhook:** 秘密のヘッダーがなければ 403、署名が合わなければ 401、署名は正しいが本文が JSON でなければ 400 です。友だち登録とブロック以外のイベントは 200 で無視します。思いがけない失敗のときは「処理中」の記録を消して 500 を返し、LINE に送り直してもらいます。返事の送信に失敗しても 500 にはしません（返事の印は一度しか使えないため）。ログに残し、イベントは処理済みにします
- **LINE の ID トークンの確かめ:** LINE の verify が 4xx のとき、または 200 でも中身が合わないときは 401 です。LINE の 5xx・時間切れ・通信の失敗は 503 にし、障害のたびにログインし直しにならないようにしました
- **家族を作る:** 送り直しを見分ける記録も、家族の作成と利用者の更新と同じ取引（`TransactWriteItems`）で書きます。途中で止まっても、家族だけできて記録がない状態にはならず、同時に送られても 1 つしか通りません。201 の本文は `GET /v1/me` の `family` と同じ形です
- **画面:** セッショントークンは `useRef` だけに持ちます。401 のときは ID トークンを取り直し、1 回だけ送り直します。`Idempotency-Key` は通信の失敗で送り直すときは同じ値を使い、422・409 の返事や名前を変えたときは作り直します
- **CSP:** MUI がスタイルを画面に書き込んで動くため、`style-src 'self' 'unsafe-inline'` を許しました。スクリプトは自分のドメインだけです（`script-src 'self'`）
- **予約された同時実行数:** CDK のコンテキスト `reservedConcurrency` で設定します。何も渡さなければ予約しないので、枠が 10 の新しいアカウントでも反映できます

## テスト

| 確かめ | 結果 |
|-------|------|
| U1 のテスト（`npx vitest run u1-skeleton-family --coverage ...`） | 23 ファイル、377 件すべて通過 |
| 筋書き（Gherkin） | `follow.feature` 10 場面、`session.feature` 18 場面、`create-family.feature` 6 場面、`screens.feature` 10 場面 |
| 行カバレッジ（U1 で作ったコード） | 98.96%（分岐 95.52%、関数 98.5%）。下限 80% は変えていない |
| 型の確かめ（4 つのパッケージそれぞれの `tsc --noEmit`）、`prettier --check .`、`eslint .` | すべて通過（開発担当の報告） |
| `cdk synth`（AWS の認証なし、ダミーの値） | 5 つのスタックを組み立てられた（開発担当の報告） |
| `vite build` | 成功。JS が約 571 kB で、500 kB を超える警告が 1 つ |

テストでは、AWS は `aws-sdk-client-mock` と DynamoDB の差し替え、LINE は `fetch` の差し替え、LIFF も差し替えて動かしています。本物の AWS・LINE・ブラウザにはつないでいません。

## 書いたが、この段階では動かしていない確かめ

| 確かめ | 理由 |
|-------|------|
| `scripts/smoke-check.sh`（反映後の 4 つの確かめ） | まだステージングに反映していないため。構文と引数の確かめまで |
| GitHub Actions の 3 つのワークフロー | まだ GitHub に置いていないため。CI の実行は取り込みのときに初めて動く |
| 実機での LIFF・LINE ログイン・Webhook の動き、速さ（画面 3 秒、LINE 10 秒） | ステージングの LINE のチャネルと AWS がまだないため。B1 の確かめで作り手がステージングで行う |

## 計画からずれたところ

- **筋書きの場面の数:** 計画の箇条書きより多くしました。1 つの箇条書きに複数の結果があるものを分けたためです（例: Base64 の本文、処理中の 2 分の前と後、作成の成功・422・409）
- **権限の確かめの順番:** `requireMembership` はデータを読み直さず、`requireAuth` が読んだ利用者の記録から `ctx` を作ります（同じ記録を 2 回読まないため）
- **本文の形が正しくないときの応答:** `400 INTERNAL`（`details` に項目名）を返します。入力の誤り用の理由の印がないためです。U2 以降で専用の印を足すのがよいと考えています
- **LIFF の URL:** パラメータストアの `<prefix>/line/liff-url` から読みます（設計の一覧にはなかったパラメータ）
- **LINE の API の呼び方:** `@line/bot-sdk` を使わず、`fetch` に 5 秒の時間切れを付けて呼んでいます
- **アクションの固定:** GitHub Actions のサードパーティのアクションは、版のタグで指定しています。コミットの SHA での固定は、ネットワークがなく調べられなかったためできていません（README の「既知の課題」に記載）
- **依存の版:** この環境の npm は、公開から 7 日未満の版を入れない設定のため、少し前の版を選んでいます（例: vitest 5.0.5、TypeScript 6.0.3、ESLint 9.39.5）
- **ファイルの書き方:** 開発担当が、ファイルの編集で `sed -i` を 2 回、python のヒアドキュメントを 1 回使いました（決まりではファイルの道具だけを使う）。どれも結果は型の確かめとテストで確かめてあります
- **文言:** 契約に文言がなかった理由の印（`UNAUTHENTICATED`、`ADMIN_ONLY`、`NOT_FOUND`、`NOT_FRIEND`、`IDEMPOTENCY_KEY_REQUIRED` など）の文言は、開発担当が補いました。見直してください

## 残っていること

- **同時の友だち登録:** 同じ人の友だち登録のイベントが、別のイベント ID で同時に 2 つ届くと、利用者の記録が 2 つできるおそれがあります（GSI は重複を防がないため）。めったに起きませんが、`userId` を LINE のユーザー ID から決まった値にすれば防げます
- **`npm audit`:** moderate が 10 件あります（例: minimatch）。対応していません
- **ルートの型の確かめ:** ルートの `tsc -p tsconfig.json`（`typecheck` スクリプト）は、画面の JSX の設定がないため失敗します。CI ではパッケージごとに確かめています
- **ローカルの Node.js:** ローカルの Node.js は 26 で、`.nvmrc` の 22 と違います
- **契約の書類:** `contract-summary.md` への契約の変更の反映は、`docs/contract-changes-u1.md` にまとめました
