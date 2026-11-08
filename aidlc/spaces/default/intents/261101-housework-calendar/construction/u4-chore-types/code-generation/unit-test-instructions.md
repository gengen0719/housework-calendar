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

## 必須: ステージングでの手動の確認（DynamoDB の式）

単体テストの DynamoDB は代役（`fakeDynamo.ts`）で、条件式は代役が再現して評価しています。更新の式（`UpdateExpression` の `SET` と `REMOVE`、`#name` `#description` などの別名、予約語）が本物の DynamoDB で通るかは、テストでは確かめていません。式の誤りは、本番で `ValidationException` になるまで見えません。そこで、U4 の変更を本番に反映する前に、**ステージングで次の 4 つを一通り動かして確かめます（必須）**。

| 操作 | 確かめること |
|------|-------------|
| 改名（PUT で名前を変える） | 200 で新しい名前になる。古い名前で、別の種類を新しく登録できる。`ValidationException` が出ない |
| 説明を消す（PUT で `description` なし） | 200 で説明がなくなる（`REMOVE` が通る）。ほかの項目（単価など）は変わらない |
| 「使う」「使わない」の切り替え（PATCH） | 200 で `active` が変わる。続けて逆にも切り替えられる |
| 消す（DELETE） | 204 で一覧から消える。同じ名前で登録し直せる（名前の印も消えている）。使われている場合の 409 は C8 がつながるまで確かめられない |

確かめ方: ステージングの画面（LIFF）の「お手伝いの種類」から操作するか、ステージングの API に管理者のセッションで直接リクエストします。CloudWatch Logs に `ValidationException` や `INTERNAL`（500）が出ていないことも見ます。結果（日付、確かめた人、4 つの結果）は `code-summary.md` に残します。余力があれば、`dynamodb-local` で式だけを確かめるテストを 1 本足します（任意）。

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。種類は「皿洗い」「皿洗い（追加分）」「洗濯物たたみ」など
- 種類の ID、`Idempotency-Key` はテストの中で作る決まった UUID。UUID や鍵らしく見える値は、直接書かず `test/fixtures/fakeSecrets.ts` に置いて import する（ESLint が止める。README 参照）
- JWT の鍵はテスト用の決まった値（本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
