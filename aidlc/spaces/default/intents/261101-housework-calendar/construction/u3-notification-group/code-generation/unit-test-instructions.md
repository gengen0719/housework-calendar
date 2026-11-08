# 単体テストの手引き — U3 お知らせ先

## テストの道具

U1・U2 と同じです（`construction/u1-skeleton-family/code-generation/unit-test-instructions.md`）。

- Vitest（ルートの `vitest.config.ts` のワークスペースのプロジェクト: `shared`、`backend`、`infrastructure` は node、`frontend` は jsdom）
- Gherkin の筋書き（`.feature`）は `@amiceli/vitest-cucumber` で Vitest の上で動かす
- カバレッジは `@vitest/coverage-v8`。行 80% 以上を下限とする（`thresholds.lines: 80`。下げない）
- AWS SDK の差し替えは `aws-sdk-client-mock` と U1 の偽の DynamoDB（`fakeDynamo.ts`）、画面は `@testing-library/react`

## この単位のテストの動かし方

U3 のテストは、すべてパスに `u3-notification-group` を含むフォルダに置きます。次のコマンドは U3 のテストだけを動かします（リポジトリのルートで実行）。

```bash
npx vitest run u3-notification-group --coverage --coverage.include='packages/*/src/**' --coverage.include='infrastructure/lib/**'
```

U1・U2 の動きを壊していないことは、すべてのテストで確かめます。

```bash
npm test
```

1 つのファイルだけを動かすとき:

```bash
npx vitest run packages/backend/test/u3-notification-group/register-group.feature
```

## テストの量（Standard）

| 部品 | テストの種類 | 件数の目安 |
|------|-----------|----------|
| 共有パッケージ（印、文言） | 単体 | 5 |
| LINE のイベントの振り分けと打ち切り（`line-routing.feature`） | 筋書き（LINE の受け口から） | 6 場面 |
| `parseGroupCommand` | 単体 | 5〜8 |
| 参加の案内と登録（`register-group.feature`） | 筋書き | 15 場面 |
| `notificationGroupRepository`、登録し直しのトランザクション、`getGroupSummary`、`groupCommandGate`（登録） | 単体 | 各 5〜8 |
| 解除とグループの操作の入口（`unregister-and-gate.feature`） | 筋書き | 7 場面 |
| 解除のトランザクション、古い leave の判定、`groupCommandGate`（家族の確かめ） | 単体 | 各 5〜8 |
| 画面用 API（`notification-group-api.feature`） | 筋書き | 3 場面 |
| 画面（`screens.feature`） | 筋書き（React の画面。LIFF と API は差し替え） | 5 場面 |
| CDK のスタック（`stacks.test.ts`） | 組み立ての確かめ | 10 |

それぞれ、うまくいく場合と、少なくとも 2 つの失敗や境目の場合を含めます。

## 期待するカバレッジ

- U3 で足す・変えるコード（`packages/*/src/**`、`infrastructure/lib/**`）を含め、行カバレッジ 80% 以上
- 下回ったら、テストを足して上げる。下限の設定は変えない

## 差し替え（モック）の方針

- LINE の Webhook: テスト用のチャネルシークレットで署名を計算した本文を、U1 の LINE 用の受け口に送る。join・leave・message・postback の本文は、LINE の形どおりに作る（`source.type` が group・room・user のそれぞれ）
- LINE の API（グループの概要、reply）: `fetch` を差し替える。時間切れ（2 秒）・5xx・reply の失敗も作る
- DynamoDB: U1 の偽の DynamoDB で、条件式（`OR`、`attribute_exists`）を本当に評価する。`TransactWriteItems` の取り消し（`TransactionCanceledException` と `CancellationReasons`）を、どの項目の条件で断られたかごとに作る
- 同時の登録: 差し替えの中で「読んだあとに別の書き込みが先に入った」状態を作る（本物の並行は使わない）
- 前の版に戻したあとの状態: `Families.notificationGroupId` があり、`NotificationGroups` に記録がない状態を作る
- 時刻: `vi.useFakeTimers()` で決める（leave の `timestamp` と `registeredAt` の前後）
- ログ: `console` への出力を集め、グループの名前・本文・表示名が含まれないことを確かめる
- グループの操作の入口: U8 の操作の代わりに、テストの中で差し込むテスト用の操作を使う
- 本物の AWS や LINE にはつながない

## テストのデータ

- 筋書きの例の名前は要件のとおり（お母さん、太郎、花子、次郎）。グループの名前は「田中家」など
- LINE のユーザー ID、グループ ID、Webhook のイベント ID はテストの中で作る決まった値
- チャネルシークレットと JWT の鍵はテスト用の決まった値（本物の値は使わない）

## 実行の前に必要なこと

- Node.js 22（`.nvmrc`）
- リポジトリのルートで `npm ci`
- AWS の鍵や LINE のチャネルは不要
