# 速さの設計（Performance Design）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）の速さの要件（`nfr-requirements/performance-requirements.md`）をどう作るかです。

## Lambda の起動の速さ（コールドスタート）

Lambda の起動の時間を小さくする方法です。

| 対策 | 内容 |
|------|------|
| メモリの大きさ [Q4] | 画面用と LINE 用の Lambda のメモリを 256 MB から始める（NFR7.4）。B1 でステージングで計測し、必要なら調整する |
| DynamoDB クライアントの使い回し [Q5] | グローバルのスコープで DynamoDB のクライアントを 1 つ作り、要求のたびに使い回す。パラメータストアの値も起動のときに 1 回だけ読む |
| バンドルの大きさ | esbuild で Lambda のコードをまとめる（Tree Shaking）。AWS SDK v3 はモジュールごとに読み込み、使うものだけにする |
| TypeScript の実行 | Lambda には JavaScript にまとめたファイルを配備し、TypeScript のコンパイルは配備の前に行う（Lambda の実行時に `ts-node` は使わない） |

## LINE へ呼び出すときの時間切れ

LINE の API の呼び出しには 5 秒の時間切れを付ける（NFR7.5）。

```typescript
// 仕組みの形
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
  // http タイムアウトは SDK の設定または axios の設定で
});
```

時間切れのときは、思いがけない失敗として上位に投げる。入口が受け止めてログに残し、500 を返す。

## Lambda のメモリの予算

| Lambda | メモリの開始値 | 変える基準 |
|--------|-------------|----------|
| 画面用 API | 256 MB | B1 でステージングで計測し、NFR7.1〜NFR7.2 を 95% が 3 秒以内に収まらなければ増やす |
| LINE 用 | 256 MB | B1 でステージングで計測し、NFR7.3 を 95% が 10 秒以内に収まらなければ増やす |

Lambda のメモリを増やすと CPU の割り当ても増えるが、費用の無料枠は「時間 × メモリ」の合計で計算される。家族 4 人の量では無料枠に収まる見込みで、B1 で確かめる。

## Sources

- `nfr-requirements/performance-requirements.md`（NFR7.1〜NFR7.6）
- `nfr-requirements/tech-stack-decisions.md`（Lambda、TypeScript、AWS SDK v3）
- `nfr-design-questions.md` の回答 [Q4]、[Q5]

## Assumptions & Open Questions

- [assumption] Lambda の 256 MB で画面 3 秒以内、LINE 10 秒以内に収まる。B1 でステージングで計測して確かめる
