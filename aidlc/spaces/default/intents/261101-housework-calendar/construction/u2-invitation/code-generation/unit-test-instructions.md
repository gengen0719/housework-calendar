# 単体テストの手引き — U2 招待

## テストの道具

U1 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock`、画面は `@testing-library/react`

## この単位のテストの動かし方

U2 のテストは、すべてパスに `u2-invitation` を含むフォルダに置きます。次のコマンドは U2 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u2-invitation --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U1 の動きを壊していないことは、すべてのテストで確かめます。

```bash
npm test
```

1 つのファイルだけを動かすとき:

```bash
npx vitest run packages/backend/test/u2-invitation/accept-invitation.feature
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| 共有パッケージ（印、文言） | 単体 | 5 |
| 振り分けとログ（`routing-logs.feature`） | 筋書き（画面用 API の入口から） | 5 場面 |
| `router` | 単体 | 5〜8 |
| メンバーの一覧（`members.feature`） | 筋書き | 6 場面 |
| `listMembers` の並び順 | 単体 | 5〜8 |
| 招待を作る・見る（`create-invitation.feature`） | 筋書き | 8 場面 |
| `invitationTokenService`、`invitationRepository`、作り直しのトランザクションの組み立て | 単体 | 各 5〜8 |
| 招待を開く・参加する（`accept-invitation.feature`） | 筋書き | 13 場面 |
| `resolveUsableInvitation`、参加のトランザクションの組み立て、取り消しの理由の読み分け | 単体 | 各 5〜8 |
| 画面（`screens.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 10 場面 |
| CDK のスタック（`stacks.test.ts`） | 組み立ての確かめ | 10 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

## 期待するカバレッジ

- U2 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定は変えない

## 差し替え（モック）の方針

- DynamoDB: `aws-sdk-client-mock` で差し替える。`TransactWriteItems` の取り消し（`TransactionCanceledException` と `CancellationReasons` の並び）を、どの項目の条件で断られたかごとに作る
- 同時の作り直し・同時の参加: 差し替えの中で「読んだあとに別の書き込みが先に入った」状態を作り、条件で断られることを確かめる（本物の並行は使わない）
- TTL で消えた前の招待: Families に印があり、Invitations に項目がない状態を差し替えで作る
- GSI の結果整合: 索引の Query の結果に本人を入れない状態を差し替えで作る
- 時刻: `vi.useFakeTimers()` で決める（期限 24 時間、期限ちょうど）
- LIFF: `@line/liff` を差し替え、`isApiAvailable('shareTargetPicker')` の true と false、`shareTargetPicker` の呼び出しを確かめる
- `history.replaceState` と `navigator.clipboard`: jsdom の上で差し替えて確かめる
- ログ: `console` への出力を集め、どの行にも 22 文字の印が含まれないことを確かめる
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）
- 招待の印は、テストの中で作る決まった 22 文字の値（例: `AbCdEfGhIjKlMnOpQrStUv`）。秘密の情報ではないが、本物の値は使わない
- `Idempotency-Key` はテストの中で作る決まった UUID
- JWT の鍵はテスト用の決まった値（U1 と同じ。本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
