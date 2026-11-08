# 単体テストの手引き — U4 お手伝いの種類

## テストの道具

U1〜U3 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`fakeDynamo.ts`）、画面は `@testing-library/react`

## この単位のテストの動かし方

U4 のテストは、すべてパスに `u4-chore-types` を含むフォルダに置きます。次のコマンドは U4 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u4-chore-types --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U1〜U3 の動きを壊していないことは、すべてのテストで確かめます。

```bash
npm test
```

1 つのファイルだけを動かすとき:

```bash
npx vitest run packages/backend/test/u4-chore-types/update-chore-type.feature
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| 共有パッケージ（印、文言） | 単体 | 5 |
| 入力の確かめ（`choreTypeValidation`） | 単体 | 8 |
| 一覧と登録（`create-chore-type.feature`） | 筋書き（画面用 API の入口から） | 12 場面 |
| `choreTypeRepository`、登録のトランザクション、ログの伏せ字と型 | 単体 | 各 5〜8 |
| 変更・使わない・使う・消す（`update-chore-type.feature`） | 筋書き | 14 場面 |
| 改名・消すのトランザクション、`getCurrentUnitPrice`、`calendarPort` | 単体 | 各 5〜8 |
| 画面（`screens.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 9 場面 |
| CDK のスタック（`stacks.test.ts`） | 組み立ての確かめ | 10 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

## 期待するカバレッジ

- U4 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定は変えない

## 差し替え（モック）の方針

- DynamoDB: U1 の偽の DynamoDB で、条件式（`attribute_not_exists`、`name = :oldName`、`active = :false`）を本当に評価する。`TransactWriteItems` の取り消し（`TransactionCanceledException` と `CancellationReasons`）を、どの項目の条件で断られたかごとに作る
- 同時の登録・改名・「使う」に戻す: 差し替えの中で「読んだあとに別の書き込みが先に入った」状態を作る（本物の並行は使わない）
- 一覧の続き: Query の応答を `LastEvaluatedKey` つきで 2 回に分けて返す差し替え
- C8 `isChoreTypeAssigned`: `calendarPort` を差し替えて、「使われていない」と「使われている」の両方を作る
- ログ: `console` への出力を集め、種類の名前と説明が含まれないことを確かめる。型のテストは `@ts-expect-error` で `name` を渡すとエラーになることを確かめる
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「皿洗い（追加分）」「洗濯物たたみ」など
- 種類の ID、`Idempotency-Key` はテストの中で作る決まった UUID
- JWT の鍵はテスト用の決まった値（本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
