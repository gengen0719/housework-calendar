# 論理コンポーネント（Logical Components）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）のコードの部品の切り方と、NFR の設計の決まりがどこに入るかです。

## コードの構成

```
src/
  shared/                     # 画面と裏側で共有（U1 で作る）
    types/                    # TypeScript の型
    errors.ts                 # エラーの種類と理由の印
    messages.ts               # 利用者に見せる文言の一覧
  
  backend/
    entries/
      api.ts                  # 画面用 API の Lambda の入口
      line.ts                 # LINE 用の受け口の Lambda の入口
    middleware/
      requireAuth.ts          # JWT を確かめる（NFR4.1〜NFR4.2）
      requireMembership.ts    # 家族のメンバーか確かめる（NFR4.5）
      requireAdmin.ts         # 管理者か確かめる（NFR4.6）
      verifyLineSignature.ts  # LINE の Webhook の署名（NFR4.7）
      verifyOriginHeader.ts   # CloudFront の秘密のヘッダー（NFR4.13）
    services/
      familyMemberService.ts  # 家族とメンバーの部品の窓口（C6）
      tokenService.ts         # JWT の発行と確かめ（NFR4.2）
      lineApiService.ts       # LINE の API の呼び出し（C4）
    repositories/
      userRepository.ts       # Users テーブルへの読み書き
      familyRepository.ts     # Families テーブルへの読み書き
      lineEventRepository.ts  # ProcessedLineEvents テーブルへの読み書き
      requestRecordRepository.ts # RequestRecords テーブルへの読み書き
    handlers/
      session/
        createSession.ts      # POST /sessions（F3）
      family/
        getMe.ts              # GET /me（F4）
        createFamily.ts       # POST /families（F5）
      line/
        followHandler.ts      # follow イベント（F1）
        unfollowHandler.ts    # unfollow イベント（F2）
    lib/
      logger.ts               # 構造化ログ（NFR2.5〜NFR2.8）
      dynamoClient.ts         # DynamoDB のクライアント（グローバルで初期化）[Q5]
      config.ts               # パラメータストアから読む設定 [Q5]
  
  frontend/
    App.tsx                   # 画面のルート
    pages/
      SetupPage.tsx           # 「家族を作る」「招待を待つ」（BR1.6）
      RegisterPage.tsx        # 友だち登録の案内（BR1.5）
    hooks/
      useSession.ts           # セッションの発行と保持（NFR4.3）
    api/
      sessionApi.ts           # POST /sessions
      familyApi.ts            # GET /me、POST /families
  
  infrastructure/
    lib/
      u1SkeletonFamilyStack.ts # U1 の CDK スタック
    lambda/
      api/                    # 画面用 API の Lambda の設定
      line/                   # LINE 用の受け口の Lambda の設定
    s3/                       # 画面の配信（S3 + CloudFront）
    dynamodb/                 # DynamoDB のテーブルの定義
```

## 障害の波及範囲

| 部分 | 障害の影響 | 備え |
|------|---------|------|
| 画面用 API の Lambda | 画面が使えない | Lambda は自動で再起動する。CloudFront は前の応答をキャッシュしていることもある |
| LINE 用の Lambda | LINE の操作が使えない | Lambda は自動で再起動する。LINE の Webhook は再送される |
| DynamoDB | すべての操作が失敗 | DynamoDB は AWS が管理する高可用性サービス。自分でできる備えはない |
| LINE の API | セッションの発行（友だちの確かめ）と LINE の返事が失敗 | 時間切れ 5 秒で思いがけない失敗として扱い、ログに残す |
| パラメータストア | Lambda の起動が失敗 | 起動のときだけ読む。起動後は失敗しない |

## NFR の設計の決まりがどこに入るか

| NFR の決まり | 入る場所 |
|-------------|---------|
| JWT の発行と確かめ（NFR4.1、NFR4.2） | `tokenService.ts` |
| メモリでのセッション保持（NFR4.3） | `useSession.ts`（React のフック） |
| 認証ミドルウェア（NFR4.4、NFR4.5、NFR4.6） | `middleware/requireAuth.ts`、`requireMembership.ts`、`requireAdmin.ts` |
| Webhook の署名確かめ（NFR4.7） | `middleware/verifyLineSignature.ts` |
| 同じイベントを二度処理しない（NFR4.8） | `lineEventRepository.ts`（条件付きの書き込み） |
| 入力の確かめ（NFR4.9）、印の形（NFR4.10） | 各ハンドラーの Zod スキーマ |
| 悪いスクリプトを入れさせない（NFR4.11、NFR4.12） | CDK の CloudFront の設定、ESLint のルール |
| CloudFront の秘密のヘッダー（NFR4.13） | `middleware/verifyOriginHeader.ts`、CDK の設定 |
| 秘密の情報の読み込み（NFR5.1〜NFR5.3） | `config.ts`（起動のときに 1 回だけ読む）、CDK の IAM の設定 |
| 秘密の情報をログに書かない（NFR5.4、NFR2.8） | `logger.ts`（ログに入れないリストを決める）|
| CI からの配備の権限（NFR5.5、NFR5.6） | GitHub Actions のワークフローの OIDC の設定 |
| コールドスタートの対策（NFR7.4） | `dynamoClient.ts`、`config.ts`（グローバルで初期化） |
| DynamoDB の整合性（NFR2.3） | `familyRepository.ts`（TransactWriteItems） |
| 構造化ログ（NFR2.5〜NFR2.8） | `logger.ts` |

## Sources

- `nfr-requirements/` の各ファイル、`functional-design/functional-spec.md`
- `inception/domain-design/components.md`（部品の分け方）
- `nfr-design-questions.md` の回答 [Q1]〜[Q5]

## Assumptions & Open Questions

- `src/shared/`、`src/backend/`、`src/frontend/`、`src/infrastructure/` の 4 つを 1 つのリポジトリに入れるモノレポの形にする。pnpm ワークスペース（または npm ワークスペース）でパッケージを分ける。詳細はコード生成で決める
