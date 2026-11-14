# コード生成の要約 — U9 お小遣いの額

この文書は途中経過です。最後の手順（Step 43 以降）で完成させます。

## Step 5: 権限と環境変数の確認（`infrastructure/lib/app-stack.ts` を読むだけ。変更なし）

確かめた日: Batch 1 の実行時。結果: **不足なし。インフラは変えない**（NFR1.36、NFR4.89）。

- `api` の Lambda の環境変数に `USERS_TABLE`・`FAMILIES_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE` がある
- `api` の権限: `Users`（`GetItem`・`PutItem`・`UpdateItem`）、`lineUserId-index` と `familyId-index` の `Query`、`Families`（`GetItem` ほか）、`ChoreTypes`（`GetItem`・`Query` ほか）、`Calendar`（`GetItem`・`Query` ほか）。U9 は読み取り（`GetItem`・`Query`）だけを使う
- `api` に `Scan`・`BatchGetItem`・`BatchWriteItem`・`dynamodb:*`、DynamoDB の `Resource: "*"` の文がない
- IAM の文の数: `api` 11、`line` 9（U8 の後のまま）
- CloudFront の `/v1/*` は `CACHING_DISABLED`。`SpaRewrite` は `/v1/` を触らない（`current` がそのまま届く）
