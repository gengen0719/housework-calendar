# 使う技術の決定（Tech Stack Decisions）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）で使う技術です。U1 は土台を作るので、あとの単位もこれを使います。

## 決定

| 分野 | 使うもの | 理由 |
|------|---------|------|
| 言語 | TypeScript（画面、裏側、CDK のすべて） | 要件の制約。画面と裏側で型を共有する（作業単位の分割の Q9） |
| 画面 | React | 要件の制約 |
| 画面の部品集 | MUI [Q8] | 見やすさの決まり（NFR9）を部品の設定で守りやすい |
| LINE の画面の仕組み | LIFF（スマホの LINE の中）、LINE ログイン（パソコンのブラウザ） | FR1.6 |
| 裏側 | AWS Lambda 上の Node.js | 要件の制約 |
| 裏側の入口 | Lambda の関数 URL を 2 つ（画面用 API、LINE 用の受け口）。お知らせ用は U10 | 費用 0 円（API Gateway を使わない）[Q4] |
| 配信 | CloudFront の 1 つのドメインの下に、S3（画面、`/`）、画面用 API（`/v1/...`）、LINE の Webhook（`/line/webhook`） | 費用 0 円、画面と API が同じドメイン [Q4] |
| データ | DynamoDB（オンデマンド）。期限のある記録は TTL で消す | 要件の制約、費用 0 円 [Q7] |
| 秘密の情報 | Systems Manager のパラメータストア（SecureString） | 費用 0 円 [Q5] |
| 配備 | AWS CDK（TypeScript） | `team.md` |
| CI | GitHub Actions（取り込み前のテスト・検査、`main` からステージングへの反映） | `team.md` |
| テスト | Vitest。筋書きは Gherkin（`.feature`）で書き、Vitest の上で動かす。カバレッジも Vitest で測る [Q6] | BDD と行カバレッジ 80% を 1 つの道具で回せる |
| 整形と検査 | Prettier、ESLint | `team.md` |
| ログ | CloudWatch Logs（JSON の 1 行 1 件） | `observability-requirements.md` |

## 作り方の要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR8.1 | 機能ごとに、先に受け入れ条件から Gherkin の筋書きを書き、それが通るまで作る（BDD） | 筋書きのファイルが受け入れ条件ごとにあること |
| NFR8.2 | 行カバレッジ 80% 以上。下回ったら取り込まない | Vitest のカバレッジの設定で確かめる |
| NFR8.3 | 取り込み前に GitHub Actions でテスト・ESLint・Prettier・秘密の情報の検査を動かし、失敗したら取り込まない | CI の設定で確かめる |
| NFR9.1 | 画面は MUI のテーマで、文字と背景の色の差を 4.5:1 以上、押す場所を 44×44 ピクセル以上にする。状態を色だけで伝えない | テーマの設定と、画面のテストで確かめる |

## 選ばなかったもの

| 選ばなかったもの | 理由 |
|---------------|------|
| API Gateway | 無料は最初の 12 か月だけ [Q4] |
| Secrets Manager | 毎月費用がかかる [Q5] |
| Cucumber.js を別に使う | 道具が 2 つになる。Vitest にまとめる [Q6] |
| 部品集を使わない、Mantine、Chakra UI | 作り手が MUI を選んだ [Q8] |

## Sources

- `inception/requirements-analysis/requirements.md`（制約、NFR1、NFR3、NFR8、NFR9）
- `aidlc/spaces/default/memory/team.md`（GitHub Actions、AWS CDK、BDD、カバレッジ、Prettier、ESLint）
- `inception/units-generation/unit-of-work.md`（Lambda を入口ごとに分ける、共有パッケージ）
- `nfr-requirements-questions.md` の回答 [Q4]〜[Q8]

## Assumptions & Open Questions

- Vitest の上で Gherkin を動かす道具の名前と版、ライブラリの版は、コード生成の段階で決めて固定します
- 関数 URL を CloudFront からだけ呼べるようにする方法は、CloudFront が付ける秘密のヘッダーを Lambda が確かめる形に決めました（`security-requirements.md` の NFR4.13）。LINE の Webhook でも使えるためです
- GitHub Actions から AWS への反映は OIDC を使います（`security-requirements.md` の NFR5.5）
