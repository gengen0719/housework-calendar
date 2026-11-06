# 見える化の設計（Observability Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の見える化の要件（`nfr-requirements/observability-requirements.md`）をどう作るかです。

## 構造化ログ（NFR2.5〜NFR2.8）

Lambda の CloudWatch Logs に、1 行 1 件の JSON でログを出す。

```typescript
// 仕組みの形（実装はコード生成で）
const log = (level: 'info' | 'warn' | 'error', data: object) => {
  console.log(JSON.stringify({
    level,
    timestamp: new Date().toISOString(),  // UTC
    env: process.env.ENV,                 // 'staging' | 'production'
    entry: process.env.ENTRY,             // 'api' | 'line'
    requestId: currentRequestId,          // NFR2.6
    ...data,
    // 秘密の情報・トークンは入れない（NFR2.8）
  }));
};
```

ログに入れる情報：

| 場面 | ログの内容（中身の例） |
|------|----------------|
| 要求を受け取ったとき | `{ event: 'REQUEST_START', method, path, userId? }` |
| 業務のエラー（断った） | `{ event: 'REQUEST_REJECTED', reason, userId? }` |
| 思いがけない失敗 | `{ event: 'REQUEST_ERROR', error: err.message, stack: err.stack }` |
| LINE のイベントを処理したとき | `{ event: 'LINE_EVENT_PROCESSED', type, userId?, result }` |
| 要求が終わったとき | `{ event: 'REQUEST_END', durationMs }` — NFR7.6 |

秘密の情報（チャネルシークレット、ID トークン、JWT）はログに書かない（NFR2.8）。

## リクエスト ID の伝わり方（NFR2.6）

Lambda の `context.awsRequestId` をリクエスト ID として使う。グローバルの変数に入れ（またはアプリ全体で受け渡せる方法で）、そのリクエストに関するすべてのログ行に付ける。

## ログの残す期間（NFR2.7）

CloudWatch Logs のロググループの保存期間を CDK で 30 日に設定する。

```typescript
// CDK の形（実装はコード生成で）
new logs.LogGroup(this, 'ApiLogGroup', {
  logGroupName: `/aws/lambda/${apiFunction.functionName}`,
  retention: logs.RetentionDays.ONE_MONTH,
  removalPolicy: RemovalPolicy.DESTROY,  // ステージングは消してよい
});
```

## 速さの計測

Lambda の関数の最初と最後に時刻を記録して、かかった時間をログに残す（NFR7.6）。B1 でステージングで動かして、NFR7.1〜NFR7.3 の目標に収まるかを確かめる。

## 作り手への知らせ（U10 で入れる）

エラーのアラームと通知先は U10 で作る（`inception/delivery-planning/bolt-plan.md` の B10）。U1〜U9 のあいだは、CloudWatch Logs を自分で見て確かめる。

## Sources

- `nfr-requirements/observability-requirements.md`（NFR2.5〜NFR2.8、NFR7.6）
- `inception/delivery-planning/delivery-planning-questions.md` の Q4（知らせは U10）

## Assumptions & Open Questions

- `console.log` で出したログは CloudWatch Logs に自動で入る（Lambda の標準の動き）。追加の設定は不要
