# 単体テストの手引き — U1 最初の形と家族を作る

## テストの道具

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock`、画面は `@testing-library/react`

## この単位のテストの動かし方

U1 のテストは、すべてパスに `u1-skeleton-family` を含むフォルダに置きます。次のコマンドは U1 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u1-skeleton-family --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

最初の筋書きを書く前（Step 2 のあと）に、このコマンドが動くこと（テストが 0 件でも道具が動くこと）を確かめます。

1 つのファイルだけを動かすとき:

```bash
npx vitest run packages/backend/test/u1-skeleton-family/follow.feature
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| 共有パッケージ（文言、理由の印） | 単体 | 5 |
| 友だち登録とブロック（`follow.feature`） | 筋書き（LINE の受け口から DynamoDB の差し替えまで） | 7 場面 |
| `userRepository`、`lineEventRepository`、`verifyLineSignature`、`familyMemberService` | 単体 | 各 5〜8 |
| セッションと `GET /v1/me`（`session.feature`） | 筋書き（画面用 API の入口から） | 8 場面 |
| `tokenService`、`requireAuth`、`requireMembership`、`requireAdmin`、`requireSameFamily` | 単体 | 各 5〜8 |
| 家族を作る（`create-family.feature`） | 筋書き | 6 場面 |
| `familyRepository`、`requestRecordRepository` | 単体 | 各 5〜8 |
| 画面（`screens.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 7 場面 |
| テーマ | 単体（色の差） | 3 |
| CDK のスタック（`stacks.test.ts`） | 組み立ての確かめ | 10 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

## 期待するカバレッジ

- U1 で作るコード（`packages/*/src/**`、`infrastructure/lib/**`）の行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定は変えない

## 差し替え（モック）の方針

- DynamoDB とパラメータストア: `aws-sdk-client-mock` で差し替える。条件付きの書き込みの失敗（`ConditionalCheckFailedException`）や、`TransactWriteItems` の失敗も差し替えで作る
- LINE の API（ID トークンの verify、プロフィール、返事）: `lineApiService` を差し替える。時間切れと 5xx も作る
- 時刻: `vi.useFakeTimers()` で決める（期限 1 時間、処理中の 2 分）
- LIFF: `@line/liff` を差し替え、ID トークンを決まった値で返す
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）
- LINE のユーザー ID、Webhook のイベント ID、`Idempotency-Key` はテストの中で作る決まった値
- チャネルシークレットと JWT の鍵はテスト用の決まった値（本物の値は使わない。リポジトリに秘密の情報を入れない）
- Webhook の署名は、テスト用のチャネルシークレットでテストの中で計算する

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
