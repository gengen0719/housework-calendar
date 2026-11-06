# 安全の設計（Security Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の安全の要件（`nfr-requirements/security-requirements.md`）をどう作るかです。この段階の書類は仕組みの形であり、コードそのものはコード生成で作ります。

## 認証の流れ

### C2 セッションの発行

1. 画面は LIFF の `liff.getIDToken()` または LINE ログインの認証フローで ID トークンを受け取る
2. `POST /sessions` に ID トークンを送る
3. 裏側は `@line/bot-sdk` の `validateIdToken` または LINE の `verifyIdToken` エンドポイント（`POST https://api.line.me/oauth2/v2.1/verify`、契約 C4）を呼んで ID トークンを確かめる。チャネル ID が自分のものであること、期限が切れていないことを確かめる。合わなければ 401 `UNAUTHENTICATED`
4. ID トークンの `sub`（LINE のユーザー ID）でユーザーを検索する
   - 記録がない、またはブロック中なら LINE Messaging API の `getProfile` を呼んで友だちか確かめる（BR1.11）。成功したら友だちに直して進む。友だちでなければ 403 `NOT_FRIEND`
5. `jsonwebtoken` ライブラリで `HS256` の JWT を作る。ペイロードには `userId`（裏側の内部 ID）と `exp`（1 時間後の UNIX 時刻）だけを入れる
6. JWT を `sessionToken` として返す

### セッションの確かめ（画面用 API の要求）

全操作で行う処理として、ミドルウェア関数で実装する。

1. `Authorization: Bearer <token>` ヘッダーから JWT を取り出す
2. `jsonwebtoken.verify(token, secret, { algorithms: ['HS256'] })` で確かめる。`alg: none` を含むすべての HS256 以外は断る
3. 期限切れや署名の合わない JWT は 401 `UNAUTHENTICATED`
4. `userId` でユーザーを取り出し、`friendStatus: blocked` なら 403 `NOT_FRIEND`

### JWT の鍵の管理 [Q2、Q3]

- 鍵は AWS Systems Manager のパラメータストア（SecureString）に置く。`SIGNING_SECRET_ARN` 環境変数でパスを指定する
- Lambda の起動のときに 1 回だけ読む（グローバルのスコープで初期化）[Q5]
- 入れ替えるときは、パラメータストアの値を入れ直し、Lambda を再起動する（`aws lambda update-function-configuration` で環境変数を 1 つ変えるだけで再起動できる）
- 古いセッションは無効になる。利用者は次に画面を開いたときに自動で取り直す（期限 1 時間）

## 認可の仕組み

ミドルウェアを 2 段階で使う。

| 段階 | ミドルウェア | 役割 |
|------|-----------|------|
| 1 | `requireAuth` | JWT を確かめ、`userId` を取り出す |
| 2 | `requireMembership` | `userId` で `getMembership` を呼び、`ctx`（familyId、userId、role）を作る。メンバーでなければ 403 `NOT_FAMILY_MEMBER` |

管理者の操作には、`requireMembership` の次に `requireAdmin` ミドルウェアを重ねる。

```typescript
// 仕組みの形（実装はコード生成で）
const requireAuth = async (event) => {
  const token = event.headers['authorization']?.replace('Bearer ', '');
  if (!token) throw new UnauthorizedError();
  const payload = jwt.verify(token, signingSecret, { algorithms: ['HS256'] });
  return { userId: payload.userId };
};

const requireMembership = async (userId) => {
  const membership = await familyMemberService.getMembership(userId);
  if (!membership) throw new ForbiddenError('NOT_FAMILY_MEMBER');
  return { familyId: membership.familyId, userId, role: membership.role };
};
```

## LINE からの Webhook の確かめ

1. `x-line-signature` ヘッダーを取り出す
2. 受け取った本文のバイト列そのもの（JSON に読み直す前）を HMAC-SHA256 でハッシュし、Base64 にする
3. `crypto.timingSafeEqual` で比べる（時間で差が出ない比べ方）
4. 合わなければ 401 を返し、処理を止める
5. 関数 URL を Base64 エンコードなしで呼ぶ設定（`InvokeMode: BUFFERED`、`isBase64Encoded: false`）にする

```typescript
// 仕組みの形（実装はコード生成で）
const verifyLineSignature = (body: string, signature: string, secret: string): boolean => {
  const expected = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};
```

## CloudFront の秘密のヘッダー（NFR4.13）[Q2]

Lambda の関数 URL を CloudFront からだけ呼べるようにするための仕組みです。

- CloudFront の「オリジンのカスタムヘッダー」として、`X-Origin-Verify` というヘッダーに秘密の値を付けて Lambda に送る
- Lambda はこのヘッダーがない、または値が違う要求を 403 で断る（エラーはログに残す）
- 秘密の値はパラメータストア（SecureString）に置く。CDK の `deploy` のとき（または GitHub Actions のワークフローの中で）にパラメータストアから値を読んで CloudFront の設定に入れ直す。CDK のテンプレートと Git には値が入らない [Q2]
- 秘密の値が漏れたときは、パラメータストアの値を入れ替えて CloudFront を再配備する

## 入力の確かめ

Express または Lambda の入口に Zod でスキーマを定義し、受け取ったデータを確かめる。

```typescript
// 仕組みの形（実装はコード生成で）
const CreateFamilySchema = z.object({
  name: z.string().trim().min(1).max(20),
  idempotencyKey: z.string().uuid(), // UUID の形だけ受け付ける（NFR4.10）
});
```

失敗したら 422 `INVALID_*` を返す。

## 悪いスクリプトを入れさせない（XSS）（NFR4.11、NFR4.12）

CloudFront のレスポンスヘッダーポリシーで付ける（Lambda の中で付けない）。

| ヘッダー | 値（React の npm パッケージを使うため、LIFF の CDN の script-src は不要） |
|---------|------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; connect-src 'self' https://api.line.me https://access.line.me; img-src 'self' data: https://profile.line-scdn.net; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |

CSP の根拠:
- `script-src 'self'`: React のビルド済みファイルは S3 から CloudFront 経由で配信。LIFF SDK は npm パッケージ（`@line/liff`）としてバンドルするため CDN の URL は不要
- `connect-src ... https://api.line.me`: ID トークンの確かめ（C4）、プロフィールの取得。`https://access.line.me` は LINE ログインの認証フロー
- `img-src ... https://profile.line-scdn.net`: LINE の利用者のアイコン（表示する場合）
- LIFF が内部で追加の配信元を必要とする場合（例: LINE アプリ内の WebView が追加するヘッダー）は、コード生成で LIFF の動作を確かめて必要なら足す

React では `dangerouslySetInnerHTML` を使わない。ESLint に `eslint-plugin-react` の `no-danger` ルールを有効にする（NFR4.12）。

## CI から AWS への反映（NFR5.5、NFR5.6）

```yaml
# GitHub Actions ワークフローの形（実装はコード生成で）
# ステージングへの反映（main への push で動く）
on:
  push:
    branches: [main]
permissions:
  id-token: write  # OIDC に必要
  contents: read
jobs:
  deploy:
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/GithubActionsDeploy  # main と staging 環境に限る
          aws-region: ap-northeast-1
```

フォークからのプルリクエストには `id-token: write` を付けない。テストと ESLint だけを動かすワークフローを別に用意する（NFR5.6）。

## 秘密の情報の管理（NFR5.1〜NFR5.4）

| 秘密の情報 | パラメータストアのパス（例） | 読む場所 |
|-----------|--------------------------|---------|
| LINE Messaging API のチャネルシークレット | `/housework-calendar/staging/line/channel-secret` | Lambda の起動のとき |
| LINE Messaging API のチャネルアクセストークン | `/housework-calendar/staging/line/channel-access-token` | Lambda の起動のとき |
| LINE ログインのチャネル ID | `/housework-calendar/staging/line/login-channel-id` | Lambda の起動のとき |
| JWT の署名の鍵 | `/housework-calendar/staging/jwt/signing-secret` | Lambda の起動のとき |
| CloudFront の秘密のヘッダーの値 | `/housework-calendar/staging/cloudfront/origin-verify-secret` | CDK の反映のとき [Q2] |

Lambda のロールには、自分の環境のパスだけを読む権限を付ける（`resource: arn:aws:ssm:*:*:parameter/housework-calendar/staging/*`）。本番は `/housework-calendar/production/*`。

CI の秘密の情報の検査は `gitleaks` または `git-secrets` を使う（具体的な道具はコード生成で決める）。

## Sources

- `nfr-requirements/security-requirements.md`（NFR4.1〜NFR4.13、NFR5.1〜NFR5.6）
- `construction/u1-skeleton-family/functional-design/functional-spec.md`（F3、F7、BR2.6）
- `inception/contract-design/contract-summary.md`（C2、C3、C4）
- `aidlc/spaces/default/memory/team.md`（GitHub Actions）
- `nfr-design-questions.md` の回答 [Q2]〜[Q5]

## Assumptions & Open Questions

- CSP の許す配信元の細かい一覧は、LIFF の npm パッケージを使うため `static.line-scdn.net` の `script-src` は不要で、上の表に確定値を記載しました。LIFF が LINE アプリ内の WebView で追加の配信元を必要とする場合は、コード生成で `Content-Security-Policy-Report-Only` を使って確かめて足します
- CloudFront の秘密のヘッダーの値を CDK の反映のときに入れる仕組みの詳細（CDK の Custom Resource か、GitHub Actions のステップで `aws cloudfront` を呼ぶか）はコード生成で決めます
