# 見守りの設計（Observability Design）— U9 お小遣いの額

U9（`u9-allowance`）の見守りの要件（`nfr-requirements/observability-requirements.md` の NFR2.74〜NFR2.77、NFR7.58）を、どう作るかを書きます。U1〜U8 の設計（1 行 1 件の JSON、リクエスト ID、30 日、書かないもの、`describeError`、`setRequestMetrics`）はそのまま使います。U9 は `api` の Lambda の読み取り専用の入口が 1 つだけです。指標・アラーム・ダッシュボードは足しません（NFR1.36）。作り手への知らせ（15 分以内）の仕組みは U10 で入れます。

U9 のログで特に守ることは、**名前も金額も残さない**ことです。お小遣いの画面は金額に最も近い場所なので、残してよいもの（件数と ID）と残さないもの（名前・単価・額・合計）を、はっきり分けます。

## 方針

- ログは既存の `logger`（`lib/logger.ts`）で出す。新しいログの仕組み・ライブラリ・設定は足さない
- ログの項目は、**ID（`familyId`・`dutyId`・`choreTypeId`）と件数と時間だけ**。値の型は、`LogData` の型が `displayName`・`name`・`text`・`groupName`・`description`・`token` を受け付けない（コンパイルで落ちる）ことに加え、`redact` が `displayName`・`name` などを `[REDACTED]` にする既存の二重の備えがある。U9 はこの 2 つに頼らず、そもそも名前や金額を**ログ関数に渡さない**
- ログを出すのは、**計算が最後まで成功したあと**にまとめて 1 か所（`loadAllowances` の終わり）。途中で失敗した要求は、成功のログも異常のログも出さず、既存の `REQUEST_ERROR` だけが残る（一部だけ出た記録が、成功したように見えない）
- 窓口 `getAllowances` の中で出すので、画面用 API 経由でも U10 の `role: system` 経由でも同じログが出る

## `ALLOWANCE_COMPUTED`（NFR2.74）

成功した 1 回の読み取りにつき、`info` を **1 件**出します。

| 項目 | 中身 |
|------|------|
| `event` | `ALLOWANCE_COMPUTED` |
| `familyId` | 家族の ID |
| `month` | `YYYY-MM`（`current` は実際の月） |
| `childCount` | 返した子供の行の数（`allowances.length`） |
| `lineCount` | 内訳の行（`lines`）の合計の数 |
| `dutyCount` | 読んだ月の担当の数（`duties.length`。「済」でないものも含む） |
| `doneCount` | 数えた「済」の数（異常で数えなかった担当を除く） |
| `departedChildCount` | 抜けた子供の行（`current: false`）の数 |
| `anomalyCount` | 異常の全数（下の「異常のログ」。行を省いた分も含む） |
| `durationMs` | 月の読み取りの開始から集計の終わりまで（`Date.now()` の差） |

- あわせて `setRequestMetrics({ dutyCount: duties.length })` を呼ぶ（U5 の `getMonthCalendar` と同じ。要求の終わりの `REQUEST_END` に `dutyCount` が載る）。3 秒の目標を担当の数と照らせるようにする
- **金額・名前・合計・回数の内訳は入れない**。`childCount`・`lineCount`・`doneCount` は全体の件数で、金額ではない
- 0 件の月（担当なし・子供なし）でも 1 件出す。数は 0
- `startedAt` は `loadAllowances` の先頭で取る（`now` の引数とは別。`now` は日本時間の月の計算に使う業務の時刻で、`durationMs` は実時間）。計算の途中で時計を差し替えたテストでも `durationMs` が負にならないように、`Date.now()` の差だけを使う

## 異常のログ（NFR2.75、ADR-U9-07）

`tallyDuties`（純粋な関数）は、ログを出さずに**異常の記録**を返します。ログを出すのは窓口です。

```ts
// 形の目安
interface AnomalyReport {
  withoutPrice: string[];            // dutyId（全数。出すのは先頭 20 件）
  ownerNotChild: string[];           // dutyId
  choreTypeMissing: Map<string, number>; // choreTypeId → 該当した担当の数（同じ種類は 1 行）
}
const ANOMALY_LOG_LIMIT = 20;        // 種類ごとの行の上限。1 か所に置く
```

| イベント（warn） | 項目 | 条件 | 行の数 |
|-----------------|------|------|-------|
| `ALLOWANCE_DUTY_WITHOUT_PRICE` | `familyId`、`dutyId` | 「済」なのに `unitPrice` が空（`undefined`／`null`）で、数えなかったとき | 担当ごとに 1 行。**先頭 20 行まで** |
| `ALLOWANCE_CHORE_TYPE_MISSING` | `familyId`、`choreTypeId` | 「済」の担当の種類が一覧にないとき | 種類（`choreTypeId`）ごとに 1 行。**先頭 20 行まで**（`choreTypeId` の昇順で決める） |
| `ALLOWANCE_DUTY_OWNER_NOT_CHILD` | `familyId`、`dutyId` | 担当の持ち主が管理者の ID だったとき | 担当ごとに 1 行。**先頭 20 行まで** |

- **上限は種類ごとに 20 行**。300 件の担当が全部おかしくても、各種類で 20 行、合計で多くても 60 行。超えた分は行を出さず、数だけを `ALLOWANCE_COMPUTED.anomalyCount` に入れる
- `anomalyCount` = `withoutPrice.length` + `ownerNotChild.length` + `choreTypeMissing` の担当の数の合計。**行を省いた分も含む**。`anomalyCount` が 1 以上なら、行が 20 行で切られていても気づける
- 「どの担当を先頭に出すか」を毎回同じにする（`loadMonth` の返す担当は `sk` の順 = 日付、種類の ID の順で既に決まっている。その順のまま先頭から取る）
- 異常のイベントに、`userId`・`childUserId`・表示名・種類の名前・金額・LINE の ID は**入れない**（担当と種類の ID だけで調べられる）
- **単価 0 円の担当は異常ではなく、ログも残さない**（S14）。管理者の担当が来ても `findFamilyChild`・`findDisplayName` を呼ばない
- 出す順序: 異常の行（`warn`）を先に、最後に `ALLOWANCE_COMPUTED`（`info`）を 1 件。同じ要求の中の `requestId` は `logger` が自動で付ける

## ログに残さないもの（NFR2.76）

| 書かないもの | 理由・備え |
|------------|----------|
| 子供・管理者の表示名、お手伝いの種類の名前 | `LogData` の型と `redact` が止めるが、U9 は渡さない |
| 単価・小計・合計・加算・減額の金額と理由（U11 の分も含む） | 金額に最も近い場所。テストで目印の数字（例 98765）が出ないことを確かめる |
| 回数の内訳（種類ごと・子供ごとの `count`） | 金額に結びつく。全体の件数（`doneCount` など）だけ残す |
| LINE のユーザー ID・グループ ID | U9 は LINE の ID を読まない（`userId` はアプリの ID。ログにも出さない） |
| `Authorization` ヘッダーの値、セッションの文字列、リクエスト本文、秘密の値 | U1 の NFR2.8 と同じ。読み取りには本文がない |
| 例外の文に入る名前・金額 | 窓口が自分で投げるエラーは `familyId` だけを含める。SDK のエラーを名前や金額で包み直さない。思いがけない失敗は U1 の `describeError` を通す |

残してよいもの: `familyId`、`month`、`dutyId`、`choreTypeId`、各種の件数、`durationMs`、`requestId`。

**確かめ方**（NFR2.76 の確かめ方を実装する）: 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・加算・減額の理由、ほかの数と重ならない目印の単価 98765・合計）を入れたデータで、成功、0 円の月、異常な担当（3 種類）、読み取りの失敗、`findDisplayName` の `NOT_FOUND`、`role: system` の呼び出しの**すべての分かれ道**を処理し、`console.log` を差し替えて集めた**全行**に、目印の文字も目印の数字も含まれないこと。`ALLOWANCE_COMPUTED` と異常の行の項目名が、このファイルの許可した一覧と**完全に一致**すること。

## 失敗の見つけ方（NFR2.77）

| 失敗 | 残るログ | 見つけ方 |
|------|---------|---------|
| 読み取りの失敗による 500 `INTERNAL`、思いがけない例外 | `REQUEST_ERROR`（既存。`path` は `/v1/months/:month/allowances`、`error`、`stack`、`requestId`） | CloudWatch Logs で `event = "REQUEST_ERROR"` と `path` で検索 |
| 異常なデータ（3 種類） | `ALLOWANCE_DUTY_WITHOUT_PRICE`・`ALLOWANCE_CHORE_TYPE_MISSING`・`ALLOWANCE_DUTY_OWNER_NOT_CHILD` | `event` で検索。件数の多さは `ALLOWANCE_COMPUTED.anomalyCount` が 1 以上の行で見つける |
| 401・403・422 | 既存の `REQUEST_REJECTED`（`status`、`reason`、`path`） | 使う人の操作の結果なので失敗に数えない。U1 の既存のログの形のまま |

- 1 行 1 件の JSON で、`event` と `reason`（または `error`）を持つ（NFR2.5 の形）。既存の `entries/api.ts` の `REQUEST_START`／`REQUEST_REJECTED`／`REQUEST_ERROR`／`REQUEST_END` を変えない
- これらの異常は、画面にもグループにも出ない（画面は開ける）ので、**ログでしか分からない**。額が実際より少なく見えうる
- U9 は指標とアラームを足さない（NFR1.36）。作り手は、U10 が知らせの仕組みを入れるまで、CloudWatch Logs で検索して気づく

### U10 への引き継ぎ（NFR2.77）

U10 の nfr-requirements は、この節を読み取り元の 1 つにしてください（U8 の NFR2.66 と同じ形）。

- 作り手への知らせ（15 分以内）の対象に入れるイベント: `REQUEST_ERROR`（`path` が `/v1/months/:month/allowances`）、`ALLOWANCE_DUTY_WITHOUT_PRICE`、`ALLOWANCE_CHORE_TYPE_MISSING`、`ALLOWANCE_DUTY_OWNER_NOT_CHILD`、`ALLOWANCE_COMPUTED` の `anomalyCount` が 1 以上のもの（異常の行を省いた分も拾うため）
- U10 の月末のまとめが `getAllowances(ctx, month)` を呼んで失敗したときは、例外を送信の失敗と同じ扱いで知らせる（BR10.17、NFR2.68）
- U10 の入口（`scheduled` の Lambda）は、`takeRequestMetrics` を要求の終わりに呼ぶ決まり（`setRequestMetrics` の値が次の要求に残らないようにする）を、`entries/api.ts` の `handler` と同じ形で持つこと
- `SystemContext` を `handlers/**`・`entries/api.ts` から import しないこと（`security-design.md` の ADR-U9-01）

## かかった時間のログ（NFR7.58）

| 見るもの | 元になるログ | 使い方 |
|---------|------------|--------|
| 受け口全体 | 既存の `REQUEST_END.durationMs`（`path` は `/v1/months/:month/allowances`） | 95% が 1,500 ミリ秒以内（補助。NFR7.54） |
| 読み取りと集計 | `ALLOWANCE_COMPUTED.durationMs` | 通常の月の 95% が 500 ミリ秒以内、大きい月の 95% が 800 ミリ秒以内（補助） |
| 担当の数 | `REQUEST_END.dutyCount`（`setRequestMetrics`）と `ALLOWANCE_COMPUTED.dutyCount` | 3 秒の目標を担当の数と照らして、遅い月の原因を分ける |
| 冷たい起動 | 既存の `REQUEST_END.coldStart`（`takeRequestMetrics` が付ける）と、Lambda の `REPORT` の `Init Duration` | 追加の実装は要らない |
| 読み取りの回数 | **ログには出さない**。単体テストで守る（NFR7.55） | 呼び出しごとのログは量が増える割に目的に合わないため |

- ステージングの測定（NFR7.57）で、`REQUEST_END`／`ALLOWANCE_COMPUTED` の `durationMs` と `dutyCount` を取り出して表に残す。補助の目標は目安で、**合格の判断は画面録画の結果だけ**で行う（NFR7.54）

## SLI と見方

| 指標 | 目標 | 見る場所 |
|------|------|---------|
| 画面の表示時間（S5） | 95% が 3 秒以内（NFR7.50〜NFR7.52） | ステージングの画面録画の測定（反映のたびの定常の指標は置かない。費用 0 円のため。NFR1.36） |
| サーバー側の処理時間 | `REQUEST_END.durationMs` の 95% が 1,500 ミリ秒以内（補助） | CloudWatch Logs（ログのクエリ） |
| 失敗の数 | 500 `INTERNAL` と `ALLOWANCE_*` の件数（数値目標は置かない。NFR2：稼働率の数値目標はない） | CloudWatch Logs（`event` と `reason` の検索） |
| 異常なデータの数 | `anomalyCount` が 0（通常の書き込みでは起きない前提。BR10.13） | CloudWatch Logs（`ALLOWANCE_COMPUTED.anomalyCount` が 1 以上の行の検索） |

ログの検索の例（CloudWatch Logs Insights。コード生成で README に残す）:

```text
fields @timestamp, event, familyId, month, anomalyCount, durationMs
| filter event = "ALLOWANCE_COMPUTED" and anomalyCount > 0
| sort @timestamp desc
```

## 相関 ID の持ち回り

- `entries/api.ts` の `handler` が `setRequestId(awsRequestId)` を入口で呼び、`logger` が全行に `requestId` を付ける（既存）。U9 は何も足さない。1 回の要求の `REQUEST_START` → （異常の行）→ `ALLOWANCE_COMPUTED` → `REQUEST_END` が同じ `requestId` でつながる
- 画面（ブラウザ）側のエラーの収集は、U1〜U8 と同じく足さない。画面の失敗は API の応答（500 や通信の失敗）として裏側に現れるものだけを見る

## Sources

- `construction/u9-allowance/nfr-requirements/observability-requirements.md`（NFR2.74〜NFR2.77、NFR7.58、U10 への引き継ぎ）、`security-requirements.md`（NFR4.93）、`reliability-requirements.md`（NFR2.68、NFR2.70）、`performance-requirements.md`（NFR7.54）
- `construction/u9-allowance/functional-design/rules.md`（BR10.13、BR10.15、BR10.16、BR10.17）、`functional-spec.md`（F5、シナリオ S14・S30・S30b・S31）
- `construction/u8-swap/nfr-design/observability-design.md`（形の手本：できごとのログ、残さないもの、失敗の見つけ方、SLI）
- 既存コード（読んで確かめた）: `lib/logger.ts`（`LogData` が `displayName`・`name` を型で断る、`REDACTED_KEY`／`REDACTED_EXACT_KEY`、`setRequestMetrics`・`takeRequestMetrics` の `dutyCount` と `coldStart`、`describeError`）、`entries/api.ts`（`REQUEST_START`／`REQUEST_REJECTED`／`REQUEST_ERROR`／`REQUEST_END`、`setRequestId`）、`services/calendarService.ts`（`setRequestMetrics({ dutyCount })` の使い方）

## Assumptions & Open Questions

- [assumption] `ALLOWANCE_COMPUTED` の `childCount`・`lineCount`・`doneCount` などの件数は、金額ではなく、金額を推測できる量でもない（家族 4 人の子供の人数と回数の全体）と見て残します。回数の内訳（種類ごと・子供ごと）は残しません。件数も残したくない場合は、承認の場で指示してください
- [assumption] 機能設計の BR10.15 が挙げた `ALLOWANCE_COMPUTED` の項目に、`doneCount`・`departedChildCount`・`anomalyCount`・`durationMs` を足しました。足した項目は件数か時間で、名前も金額も入りません
- [assumption] `ALLOWANCE_CHORE_TYPE_MISSING` の行は種類ごとに 1 行、`anomalyCount` には該当した**担当の数**を足す、と決めました（NFR2.75 は「同じ `choreTypeId` は 1 要求につき 1 行」と「全数」を別に書いており、全数の数え方は書いていないため、担当の数で読みました）。種類の数で数えるべきなら、承認の場で指示してください
- [assumption] 異常の行の上限（種類ごとに 20 行）は、ログの量を抑える目安です。データ全体がおかしくなるほどの異常は、`anomalyCount` が大きいことで気づけます
- [assumption] 異常のログを計算の成功後にまとめて出すので、途中で失敗した要求では、見つけた異常がログに残りません。失敗した要求の原因調査は `REQUEST_ERROR` で行い、異常は次に成功した要求で出ます（同じデータなら毎回出る）
- [assumption] 「`takeRequestMetrics` を要求の終わりに呼ぶ」決まりを U10 に引き継ぎます。U10 の入口は U9 の時点で存在せず、この決まりの実現は U10 で確かめます
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
