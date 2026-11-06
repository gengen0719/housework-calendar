# 止まらないことの設計（Reliability Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の止まらないことと安全の要件（`nfr-requirements/reliability-requirements.md`）をどう作るかです。

## エラーの種類と返し方

| 種類 | 説明 | 裏側の返し方 |
|------|------|------------|
| 業務のエラー（断る） | 決まりで断った（確定済み、管理者の操作でないなど） | `{ ok: false, reason: '<印>' }` + HTTP 4xx |
| 思いがけない失敗 | データベースにつながらない、LINE の API が失敗するなど | エラーを投げる → 入口が受け止めてログに残し 500 を返す |

入口（Lambda の関数）に共通のエラーハンドラーを置く。

```typescript
// 仕組みの形
const handler = async (event) => {
  try {
    return await processRequest(event);
  } catch (err) {
    logger.error({ err, requestId: event.requestContext?.requestId });
    return { statusCode: 500, body: JSON.stringify({ error: { reason: 'INTERNAL' } }) };
  }
};
```

## LINE のイベントの「処理中」管理（BR2.7、NFR2.2）

処理中と処理済みを分ける仕組みです（`functional-design/functional-spec.md` の F1）。

1. イベントを受け取ったとき、`ProcessedLineEvents` テーブルに `status: 'processing'`、`receivedAt: now()` を、まだ記録がないときだけ書く（DynamoDB の `ConditionExpression: attribute_not_exists(webhookEventId)`）
2. 「処理中」のまま 2 分を過ぎている記録は、やり直してよいと判断する
3. 処理が終わったら `status: 'done'` に更新する
4. 思いがけない失敗のとき: 「処理中」の記録を消し、500 を返す。LINE の再送（LINE の管理画面で有効にする）で処理し直せる
5. Lambda が時間切れで止まり記録を消せなかったとき: 2 分後に LINE が再送した要求で、手順 1 の条件付きの書き込みに成功し（古い記録は TTL で消えるか、2 分を過ぎているとしてやり直す）、処理し直せる

## 家族を作るときの整合性（NFR2.3）

Family テーブルに書いてから User テーブルを更新する。

DynamoDB の `TransactWriteItems`（最大 25 件の書き込みをまとめて、全部できるか、全部できないか）を使う。

```typescript
// 仕組みの形
await dynamodb.transactWrite({
  TransactItems: [
    { Put: { TableName: 'Families', Item: newFamily } },
    { Update: { TableName: 'Users', Key: { userId }, ... } },
  ]
});
```

## 送り直しを見分ける仕組み（BR2.8）

`RequestRecords` テーブルに記録する。

1. 同じ `userId` と `idempotencyKey` の組がテーブルにあれば、何もせず前の結果を返す
2. なければ処理し、`RequestRecords` に結果を入れる（TTL は 24 時間後）
3. 手順 1 と 2 の間に別の要求が来たとき（競合）は、DynamoDB の `ConditionExpression` で処理できるのを 1 つに絞る

## DynamoDB のデータの守り方（NFR6.2）

- 本番のテーブルは、CDK スタックを消してもテーブルが消えないように `removalPolicy: RemovalPolicy.RETAIN` を設定する
- ポイントインタイムリカバリは費用がかかるので使わない

## LINE に問い合わせられなかったときのフォールバック（NFR2.4）

`requireAuth` の中で `lineApiService.getProfile` の呼び出し（BR1.11）が LINE のエラーまたは時間切れで失敗したとき、利用者を断らずリトライを促す。

1. LINE の API が 5 秒（NFR7.5）を超えた、または 5xx を返した場合は、`{ ok: false, reason: 'LINE_API_UNAVAILABLE' }` を `familyMemberService` から返す（エラーを投げない）
2. セッションの発行（`POST /sessions`）の入口がこれを受け取ったとき: 503 `{ error: { reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' } }` を返す。これは 500 ではなく 503 で返すことで、画面がリトライを自動的に試みられるようにする
3. 画面は 503 を受け取ったとき: 「表示できませんでした。もう一度お試しください」と「読み込み直す」ボタンを出す（FR4.5 と同じ扱い）
4. ログには LINE の API の失敗として記録する（秘密の情報は含めない）

この設計は、LINE の API が一時的に遅いときも利用者が使えなくなるのを防ぎます。LINE が本当に使えない状態が続く場合は、作り手が CloudWatch Logs で気づきます。

## Sources

- `nfr-requirements/reliability-requirements.md`（NFR2.1〜NFR2.4、NFR6.1〜NFR6.2）
- `construction/u1-skeleton-family/functional-design/rules.md`（BR2.7、BR2.8）
- `construction/u1-skeleton-family/functional-design/functional-spec.md`（F1 手順 7）

## Assumptions & Open Questions

- [assumption] DynamoDB の `TransactWriteItems` は、家族 4 人の量では問題なく動く
- LINE の再送は、LINE Developers の管理画面（Webhook の設定）でステージングと本番の両方のチャネルで有効にする
