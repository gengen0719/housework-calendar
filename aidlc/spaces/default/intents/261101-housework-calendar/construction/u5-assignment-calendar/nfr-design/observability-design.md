# 見守りの設計（Observability Design）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の見守りの要件（NFR2.32、NFR7.24）を、どう作るかを書きます。U1〜U4 の `lib/logger.ts`（JSON の 1 行、リクエスト ID、30 日、伏せ字）をそのまま使います。

## 割り当てと担当のできごとのログ（NFR2.32）

| `event` | レベル | いつ | 項目 |
|---------|-------|------|------|
| `ASSIGNMENT_SAVED` | info | 保存できた | `familyId`、`userId`、`month`、`mode`（`first` か `resave`）、`dutyCount`（作るべき担当の数）、`createdCount`、`changedCount`、`deletedCount`、`overwriteConfirmed`（上書きの確かめを通したか）、`chunkCount`、`attempts`（1 か 2） |
| `ASSIGNMENT_REJECTED` | info | 保存を断った | `familyId`、`userId`、`month`（形が正しいとき）、`reason`（理由の印。`ASSIGNMENT_OVERLAP`、`OVERWRITE_CONFIRMATION_REQUIRED`、`MONTH_CONFIRMED`、`MONTH_NOT_EDITABLE`、`CHORE_TYPE_INACTIVE`、`INVALID_ASSIGNMENT`、`NOT_FOUND`、1 つも書けない `INTERNAL` など） |
| `ASSIGNMENT_PARTIAL_FAILURE` | error | 1 つ以上のチャンクが書けたあとで失敗した | `familyId`、`userId`、`month`、`mode`、`committedChunks`（書けた数）、`totalChunks`、`attempts`、`error`（`describeError`） |
| `DUTY_CHILD_CHANGED` | info | 担当の子供を変えた | `familyId`、`userId`、`dutyId`、`fromChildUserId`、`toChildUserId` |
| `DUTY_CHANGE_REJECTED` | info | 担当の変更を断った | `familyId`、`userId`、`dutyId`（形が正しいとき）、`reason`（`DUTY_NOT_TODO`、`MONTH_CONFIRMED`、`NOT_FOUND`、`INVALID_REQUEST`、`INTERNAL`） |
| `DUTY_HOOK_FAILED` | warn | `onDutyReassigned` が投げた | `familyId`、`dutyId`、`error` |

- 中身は家族の ID、利用者の ID、担当・種類の ID、数、理由の印だけ。種類の名前と子供の表示名は書かない。`LogData` の型は `name`・`displayName` を受け付けない（U3・U4）ので、型でも防がれる
- 項目の名前に `body`、`token`、`secret` などの伏せ字になる語を使わない（`confirmedChangesHash` や `changesHash` は印の値そのものを書かず、書くのは `overwriteConfirmed` の真偽値だけ）
- 割り当ての行の中身（`rules`）と上書きの一覧は書かない。数だけを書く（サイズと個人の行動の量を抑える）
- `ASSIGNMENT_SAVED` の `dutyCount` は、NFR7.22 の 3 秒の目標を担当の数と照らして読むためのもの（NFR7.24）
- `ASSIGNMENT_PARTIAL_FAILURE` は、U10 の「作り手への知らせ」の対象にする。項目の名前と形は U10 まで変えない（`reliability-design.md`）。この段階ではメトリクスもアラームも足さない（カスタムメトリクスは U10 で決める）

## かかった時間（NFR7.24）

- U1 の `REQUEST_END`（`path`、`durationMs`）が U5 の 4 つの操作にも付く。`path` はパスの型（`/v1/months/:month/calendar`、`/v1/months/:month/assignment`、`/v1/duties/:dutyId`）で、月や ID の実際の値は入らない
- `REQUEST_END` に次を足す（U1〜U4 の項目は変えない）
  - `coldStart`（真偽値）: 実行環境の最初の要求だけ true。モジュールの先頭の変数で数える。測定でコールドスタートを数えるときの目印（`performance-design.md`）
  - `dutyCount`: 保存のときだけ。要求の中で `setRequestMetrics({ dutyCount })` のように 1 回だけ設定し、`finally` の `REQUEST_END` が読む（`lib/logger.ts` のモジュール変数。`requestId` と同じ作りで、要求の終わりに消す）
- Lambda の `REPORT` 行（`Duration`、`Init Duration`、`Max Memory Used`）は、CloudWatch Logs に自動で出る。起動の遅れの時間はそこから読む

## SLI と見方

目標を決めるだけで、この段階では自動の判定は足しません（U10）。作り手が CloudWatch Logs Insights で読む目印です。

| SLI | 読み方 | 目標（要件） |
|-----|-------|------------|
| カレンダーを開く時間 | `path = /v1/months/:month/calendar` の `durationMs` の 95 パーセンタイル（`coldStart` の有無で分けて読む） | NFR7.20、NFR7.21（画面で測った時間が 3 秒以内） |
| 保存の時間 | `path = /v1/months/:month/assignment`（PUT）の `durationMs` と `ASSIGNMENT_SAVED.dutyCount` | NFR7.22 |
| 担当の変更の時間 | `path = /v1/duties/:dutyId` の `durationMs` | NFR7.23 |
| 保存の成功の割合 | `ASSIGNMENT_SAVED` と `ASSIGNMENT_REJECTED`（`reason = INTERNAL`）と `ASSIGNMENT_PARTIAL_FAILURE` の件数 | 部分的な失敗は 0 を目指す（U10 で知らせる） |
| 競合のやり直し | `ASSIGNMENT_SAVED.attempts = 2` の件数 | 参考（多ければ条件と順番を見直す） |

読み方の例（Logs Insights）:

```text
fields @timestamp, path, durationMs, coldStart
| filter event = "REQUEST_END" and path like /months/
| stats pct(durationMs, 95) as p95, count() as n by path, coldStart
```

## 相関と保管

- `requestId` は U1 の仕組みでそのまま付く。保存の中のチャンクごとのログは出さない（1 回の保存は `ASSIGNMENT_SAVED` か `ASSIGNMENT_PARTIAL_FAILURE` の 1 行で足りる）
- ログの保管は 30 日（U1）。個人の名前は入らない
- 分散トレースは使わない（Lambda 1 つと DynamoDB だけ。費用 0 円の条件）

## Sources

- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`
- `construction/u4-chore-types/nfr-design/observability-design.md`
- `packages/backend/src/lib/logger.ts`、`packages/backend/src/entries/api.ts`（`REQUEST_END` の出し方）

## Assumptions & Open Questions

- [assumption] `REQUEST_END` の項目を足すのは、U1 の `entries/api.ts` の `finally` の中の 1 か所です。既存のログの形を使う単体テスト（`path` の確かめ）は、項目が増えても通ります
- 保存の途中の失敗を作り手に知らせる仕組み（15 分以内）は U10 で入れます
