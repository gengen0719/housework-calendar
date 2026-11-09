# 信頼性の設計（Reliability Design）— U6 記録

U6（`u6-recording`）の信頼性の要件（NFR2.33〜NFR2.39、NFR6.7、NFR11.5、NFR11.6）を、どう作るかを書きます。U5 の作り（条件つきの `TransactWriteItems`、`CancellationReasons` の読み分け `classifyCancellation`、競合は読み直して 1 回だけやり直し、ほかの Code は投げ直す、`onDutyReassigned` と同じ形のフック）をそのまま使います。テーブルの形とキーは U5 のとおりで、U6 は新しい保存先を作りません（`scalability-design.md`）。

## 記録の全体の流れ（NFR2.33〜NFR2.35、BR7.4、BR7.6〜BR7.8）

LINE（`record.do`）と画面（`POST /v1/duties/{dutyId}/record`）は、同じ関数 `recordDuty(ctx, dutyId, version, options)` を通ります（`services/recordingService.ts`）。`options` は `todayOnly`（LINE だけ true）、`now`（要求の入口で 1 回だけ取った時刻）、`route`（`line` か `api`。ログの印だけで、動きは変えない）です。`version` は数でも、数を返す関数でも渡せます（画面は本文を担当の 404 のあとで読むため。U5 の `changeDutyChild` と同じ）。

1. `today = jstDateOf(now)`（要求の入口で 1 回。以降すべて同じ値）
2. 担当を探す（`findDuty`。`DID#` → 担当 + 月の状態。強い整合性の GetItem 3 回）。ない、または `dutyId` が違えば `NOT_FOUND`
3. `version` が関数なら、ここで呼ぶ（本文の 422 は担当の 404 のあと）
4. **判定の順番（BR7.4 を 1 つに決める）**。最初に当てはまったもので終える

| 順 | 確かめ | 当てはまったとき |
|----|--------|----------------|
| 1 | 担当が家族の中にある | なければ `NOT_FOUND` |
| 2 | `childUserId` が `ctx.userId` | 違えば `NOT_OWN_DUTY`（ほかの子供、管理者） |
| 3 | 状態が「済」 | `recordedBy` が `ctx.userId` なら**書かずに** `alreadyRecorded = true` で今の担当を返す。違えば `DUTY_ALREADY_DONE` |
| 4 | その担当の月が確定 | `MONTH_CONFIRMED`（月は担当の `month`。今日の月ではない） |
| 5 | 状態が「×」 | `DUTY_SKIPPED_BY_ADMIN` |
| 6 | 日付が `today` より後 | `FUTURE_DUTY` |
| 7 | `todayOnly` で日付が `today` でない | `NOT_TODAY_DUTY` |
| 8 | 要求の `version` が今の `version` と違う | `DUTY_CHANGED` |
| 9 | 通過 | 単価を読んで取引で書く |

- **二重押し（BR7.8）の順番**: 3 を 4〜8 より前に置く。2 回目の要求は `version` が古くても、月が確定していても、本人が記録済みなら成功として最初の結果を返す。「本人が記録済み」は `status = done` かつ `recordedBy = ctx.userId` だけで決める（`recordedAt` の新旧や経路は見ない）。LINE と画面の同時の記録（NFR2.35 (c)）も同じ分かれ方になる
- `status` が「済」で `recordedBy` が空という担当は U6 では作らない（NFR2.33）。U5 のテストの前提データも 3 つ同時に入れる（機能設計の仮定）。万一あっても 3. で `DUTY_ALREADY_DONE` に倒れ、書き換えない
5. 通過したら、`getCurrentUnitPrice(ctx, choreTypeId)`（GetItem 1 回、強い整合性）を読む。`NOT_FOUND`（種類がない）は `INTERNAL` にして何も書かない（NFR2.38）。読み取りが例外で失敗したら投げる（下の (b)）。**「使わない」の種類でも記録できる**ので、`active` は確かめない（FR2.3）
6. 取引を 1 回書く（次の節）。書けたら 8. へ
7. 断られたら、2. からやり直す。**やり直しは 1 回まで**（最初を含めて 2 回）。やり直しで要求の `version` は変えない（見せた時点のまま）。2 回目も断られたら `INTERNAL`（何も書かない）
8. 書けたら、`DUTY_RECORDED` を残し、`onDutyRecorded` を 1 回呼び（フックの節）、`{ duty, alreadyRecorded: false }` を返す

```text
for attempt in 1..2:
    found   = findDuty(ctx.familyId, dutyId)               // GetItem 3 回
    verdict = judge(found, ctx, version, options, today)   // 順 1〜8。proceed 以外はここで返す
    price   = getCurrentUnitPrice(ctx, verdict.duty.choreTypeId)   // GetItem 1 回
    if writeTransaction(buildRecordItems(verdict.duty, price, ctx, now)) == written:
        return success(verdict.duty, price, now)
    logger.info(DUTY_RECORD_RETRY)                         // 競合だけがここに来る
return INTERNAL                                            // 2 回続けて断られた
```

## 取引の形（NFR2.33、NFR2.34、BR7.6、BR7.7）

1 回の `TransactWriteItems` は 3 項目で、順番を固定します（`CancellationReasons` は項目の並びと同じ順で返るため）。

| 番号 | 項目 | 条件 |
|------|------|------|
| 0 | `Calendar`: 担当の Update（キー `M#<month>#D#<date>#<choreTypeId>`） | `#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by` |
| 1 | `Calendar`: 月の状態の ConditionCheck（`M#<month>#S`。U5 の `buildMonthGuard`） | `attribute_not_exists(#confirmed) OR #confirmed = :false` |
| 2 | `ChoreTypes`: 種類の ConditionCheck（`TYPE#<choreTypeId>`） | `#unitPrice = :price`（読んだ単価のまま） |

```ts
declare const dutyKey: Record<string, string>;
const update = {
  Update: { TableName: 'Calendar', Key: dutyKey,
    UpdateExpression: 'SET #status = :done, #recordedAt = :now, #recordedBy = :by, ' +
      '#unitPrice = :price, #updatedAt = :now, #version = #version + :one',
    ConditionExpression: '#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by',
    ExpressionAttributeNames: { '#status': 'status', '#version': 'version' /* 式に出る名前をすべて */ } },
};
```

- **書く 6 項目だけ**（`status`、`recordedAt`、`recordedBy`、`unitPrice`、`updatedAt`、`version`）。`origin`、`childUserId`、`date`、`choreTypeId` は式に出さず、変えない。`recordedAt` と `updatedAt` は同じ `now`（UTC の ISO 8601）
- **担当を作らない**: `UpdateItem` は条件がなければ項目を作ってしまう。条件に `#status = :todo` があるので、項目がなければ条件が成り立たず、断られる（作られない）。担当の Put と Delete は U6 のコードに書かない（CDK で `PutItem`、`DeleteItem` の許可も付けない。`security-design.md`）
- **条件の `#childUserId = :by` は守りの二重化**: 担当の子供が変われば `version` が増える（U5 の約束）ので `version` だけでも足りるが、記録者が必ず担当の子供本人であることを、書き込み自身が保証する
- **月の確かめは担当の `month`** を使う（画面からは過去の月の担当も記録できるため。今日の月ではない）。記録のない月は確定していない扱い（BR6.2）で、ConditionCheck が通る
- **種類の確かめは `unitPrice` だけ**。`ChoreTypes` に ConditionCheck が付く項目は 1 つなので、項目数は 3 で、100 項目の上限に比べて十分小さい（NFR3.9）。種類の項目は読むだけで書かない
- 条件式・更新式に出る属性名は、予約語かどうかにかかわらず、**すべて `ExpressionAttributeNames`** で置き換える（`status`、`version`、`confirmed`、`unitPrice`、`recordedAt` など。U5 の決まり）。コード生成の単体テストで、組み立てた式のすべての属性名が `#` の別名になっていることを確かめる
- `TransactWriteItems` の `ClientRequestToken` は、AWS SDK v3 が要求ごとに自動で付け、SDK の通信の再試行では同じ値になる。通信の再試行で取引が 2 回実行されることはない（コード生成でテストの差し替えにより、SDK の既定の動きを確かめる。Assumptions）。この節の「やり直し」は新しい命令を作るので、別の値になる（意図したやり直し）

## 断られたときの読み直し（NFR2.34、NFR2.35）

`writeTransaction`（U5）は、`TransactionCanceledException` の `CancellationReasons` を `classifyCancellation` で読み分けます。

| Code | 扱い |
|------|------|
| `ConditionalCheckFailed`、`TransactionConflict` だけ | 競合 → 読み直して 2. からやり直す（1 回まで） |
| 1 つでも別の Code（`ThrottlingError`、`ProvisionedThroughputExceeded`、`ValidationError` など）、または Code が読み取れない | 投げ直す（下の (b)）。読み直さない |

- **どの項目で断られたかでは分岐しない**。理由は 3 つ。(1) 項目 0 の失敗だけでも、原因は「済になった」「`version` が増えた」「`dutyId` が変わった」「子供が変わった」の 4 つがあり、番号では決まらない。(2) 2 つ以上の項目が同時に失敗することがある（確定と単価の変更が重なる）。(3) 読み直しは BR7.4 の順番を最初から評価するだけなので、どの原因でも正しい印に着く。項目の番号は**ログ用**にだけ使う（`DUTY_RECORD_RETRY.failed` に `duty`、`month`、`price` の組を書く）
- 読み直し（2.）が出す結果は、差し込みごとに次のとおり

| 取引の直前に差し込まれたもの | 読み直しの結果 |
|------------------------------|---------------|
| (a) 管理者が担当の子供を変えた、担当を「×」にした、取り消した（`version` が増える） | 2.（`NOT_OWN_DUTY`）か 5.（`DUTY_SKIPPED_BY_ADMIN`）、または 8.（`DUTY_CHANGED`）。何も書かない |
| (b) 月が確定した | 4.（`MONTH_CONFIRMED`）。何も書かない |
| (c) 種類の単価が変わった | 判定は通り、**新しい単価を読み直して**もう一度書く（FR2.2）。新しい単価が `unitPrice` に入る |
| (d) 同じ担当の別の記録（同じ本人の二重押し、LINE と画面の同時） | 3.（`alreadyRecorded = true`）。書かず、`onDutyRecorded` も呼ばない |
| (d') 管理者が先に「済にする」 | 3.（`DUTY_ALREADY_DONE`） |

- **2 回続けて断られたら** `INTERNAL`。3 回目の書き込みはしない。何も書かれていない（取引は全部か無しか）
- `DUTY_RECORD_RETRY` は info（失敗ではなく、競合は想定内）。2 回目も断られたときは `DUTY_RECORD_REJECTED`（`reason = INTERNAL`、error ではなく info）を残し、LINE では (a) の返事、画面では 500 にする

## 失敗の分け方（LINE）（NFR2.37、NFR2.38）

`entries/line.ts` の `processEvent` は、`begin` のあとで `handle` を呼び、投げたら `release` して投げ直し（→ 500）、投げなければ `markDone` します（U1 のまま）。U6 の `recordHandler` は、この枠の中で次の 3 つを守ります。

| 分け方 | 起きること | 返事 | 二度処理しない記録 | HTTP |
|--------|-----------|------|------------------|------|
| (a) 読み直しが 2 回続けて断られた（`INTERNAL`） | 何も書かれていない | 本人にだけ「うまく記録できませんでした。もう一度お試しください」 | 処理済み（`markDone`） | 200 |
| (b) 思いがけない例外（DynamoDB に接続できない、`ThrottlingError`、単価・利用者・種類の名前の読み取りの失敗、Lambda の時間切れ） | 書く前に起きたものは何も書かれない | **reply しない**（トークンを使わない） | 「処理中」を消す（`release`） | 500。LINE が送り直す |
| (c) 書けたあと reply が失敗（トークンの期限切れ、LINE の障害） | 記録は残る | 送れない。取り消さない | 処理済み | 200 |

- **(b) で返事をしない理由**: reply のトークンを使い切ってから 500 になると、LINE の再送で処理が黙って走り、返事と実際が食い違う。送り直されたイベントは、記録済みなら `alreadyRecorded`（3.）で「記録しました（最初の時刻）」と返事ができる。再送が届かないとき（再送の設定が無効、期限切れ）は、子供がもう一度「やった」を押せば、「済 16:42」の選べない並びで確かめられる
- **(c) の作り**: reply の呼び出しだけを `try/catch` で囲み、失敗は `LINE_REPLY_FAILED`（warn。`type` と `describeError`。U3 と同じ）にして握りつぶす。記録の結果は変えない。reply は 1 回で、送り直さない（NFR7.31）
- **書いたあとに例外が出ない作りにする**: 取引が `written` を返したあとに、投げうるものを置かない。(1) 返事に使う種類の名前の Query は、**書く前**に結果を取り出す（失敗すれば何も書かれていない (b) になる）。(2) 返事の組み立ては純粋な関数。(3) フックは `try/catch` 済み。(4) ログは投げない。こうして、書けたのに 500 になって再送で二重に見える、を避ける（二重にはならず `alreadyRecorded` になるが、返事が遅れる）
- **名前の Query の置き方**: 子供と分かった直後に `choreTypeService.list(ctx)` を始め、結果を `{ ok, value | error }` の形で受ける（`settle`）。担当の探索と並行して走り、待つのは返事を作る直前（記録の場合は取引の直前）だけ。待たずに終わる経路（`MONTH_CONFIRMED` など）で失敗が「未処理の拒否」にならないよう、`catch` を付けた Promise にしてある。1 イベントの中で使い回し、呼び出しは 1 回（NFR7.28）
- **`markDone` の失敗**: `handle` の外なので `release` されず 500 になる。再送は「処理中」のまま `begin` が重複と判断するか、期限（U1 の `STALE_AFTER_MS`）が過ぎれば再実行され、`alreadyRecorded` で最初の結果を返す。記録は 1 件のまま
- **読み取りの失敗は書き込みに進まない（NFR2.38）**: 利用者、担当、単価、種類の名前のどれが失敗しても、取引の前に例外になる。種類が見つからない（`getCurrentUnitPrice` が `NOT_FOUND`）は例外ではなく結果なので `INTERNAL` (a)。LINE の API が止まっていても記録はできる（(c)）。記録の経路は LINE への問い合わせ（プロフィールの取得）をしない
- 画面の `INTERNAL` は 500 の `INTERNAL`、そのほかの例外も U1 の共通の入口が 500 にする（`REQUEST_ERROR`）

```text
handleRecord(event, now):
    gate = authorizeChild(event.source.userId)                  // 利用者 1 回読む
    if gate is admin/outsider: reply(決まった案内); return     // 担当・月・種類は読まない
    names = settle(choreTypeService.list(gate.ctx))             // 並行
    result = recordDuty(gate.ctx, cmd.dutyId, cmd.version, {todayOnly, now, route: 'line'})
    messages = buildMessages(result, await names)               // 書いたあとに投げない
    try { reply(event.replyToken, messages) } catch { LINE_REPLY_FAILED }   // (c)
```

## `onDutyRecorded` フック（NFR2.35、NFR2.39、BR7.14）

U8 が、「済」になった担当に出ている「代わりにやる」の申し出を取り下げるための口です。U5 の `dutyReassignedHook.ts` と同じ作りで `services/dutyRecordedHook.ts` に置きます。

```ts
export interface DutyRecordedEvent {
  familyId: string;
  dutyId: string;
  date: string; // 日本時間の YYYY-MM-DD
  choreTypeId: string;
  childUserId: string;
}
export type DutyRecordedHook = (event: DutyRecordedEvent) => Promise<void>;
export declare function onDutyRecorded(hook: DutyRecordedHook): void;
```

- 呼ぶのは**取引が `written` を返したあと、その 1 回だけ**。`alreadyRecorded` の結果、取引をやり直して `alreadyRecorded` に着いた場合、断った結果では呼ばない。同じ記録について 2 回呼ばない（呼ぶ場所は 8. の 1 か所）
- 登録された関数が投げても記録の結果は変えず、`DUTY_RECORDED_HOOK_FAILED`（warn。`familyId`、`dutyId`、`describeError`。名前は書かない）を残す。U8 までは登録がなく、何もしない
- 通知は「届けば取り下げる」ためのもので、最後の守りは U8 側の条件にある（書いたあとフックの前に落ちると届かない。U5 の `onDutyReassigned` と同じ）。U8 は引き受けるとき、担当が「未」のままで `version` が申し出のときのままであることを条件にする（U8 の NFR で決める）
- **`api` と `line` の両方の起動の枠（composition root）で、同じ登録をする**。記録はどちらの Lambda でも起きるため。U8 は両方に足す（`logical-components.md` の約束）

## 日本時間（NFR11.5、NFR11.6）

- 要求の入口で `now = new Date()` を 1 回だけ取る。LINE は `processEvent` に渡る `now`（`handler` の中で 1 回。1 つの Webhook の中の複数のイベントは同じ値）、画面は U5 の入口の `now`。LINE の `timestamp`、端末と画面の時計は使わない。再送されたイベントは、送り直された時点の新しい `now` で処理される（古い時刻で書かない）
- `today = jstDateOf(now)`（U5 の `packages/shared/src/jstDate.ts`）、月は `monthOfDate(today)`。担当の日付との比べ（今日か、今日より後か）は文字列の比べ（`YYYY-MM-DD` は辞書順と日付順が一致）
- `recordedAt` と `updatedAt` は同じ `now` の UTC の ISO 8601。表示用に `jstTimeOf(instant): 'HH:mm'`（`Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`。インスタンスはモジュールの先頭で 1 つ）を `jstDate.ts` に足す。`alreadyRecorded` の返事の時刻は、最初の `recordedAt` から作る
- 確かめ方（単体テスト、時計の差し替え）:
  - 日本時間の 23:59:59.999（UTC 14:59:59.999）と 0:00:00.000（UTC 15:00:00.000）で、今日の担当が別の日になること（NFR11.5）
  - 1 月 7 日 23:59 と 1 月 8 日 0:00 の記録が、それぞれ 1 月 7 日と 1 月 8 日の担当を「済」にすること。1 月 7 日 23:59 に出した選択肢を 0:00 を過ぎて押すと `NOT_TODAY_DUTY`（出し直し）。画面は日付またぎでも `todayOnly` でないので記録できる（NFR11.6 (a)(b)）
  - 1 月 31 日 23:59 と 2 月 1 日 0:00 で、確定の確かめが**担当の日付の月**で行われること（今日の月ではない）。うるう年の 2 月 29 日、12 月 31 日から翌年 1 月 1 日（NFR11.6 (c)(d)）
  - 再送の `alreadyRecorded` の返事の時刻が最初の時刻であること

## データ（NFR6.7）

- 記録のデータ（`status`、`recordedAt`、`recordedBy`、`unitPrice`）は、アプリの操作（LINE の記録と画面の記録）でだけ変わる。U6 のコードに、`Calendar` の項目を直接書き換えるスクリプトと、取り消しの入口（API、postback、画面）を作らない（BR7.13）。リッチメニューのスクリプトは `Calendar` にも `ChoreTypes` にも触れない
- 間違って記録したときの直し方は、管理者が画面で取り消す操作（U7、FR6.2）で、U6 では作らない。取り消しの確かめは U7 の受け入れ条件（AC6.1.x）に引き継ぐ（`logical-components.md`）
- `Calendar` は本番で `RemovalPolicy.RETAIN`（U5 の設定のまま。U6 は変えない）。CDK のテストで確かめる
- リッチメニューはデータではなく公式アカウントの設定で、README の手順（NFR10.7）で作り直せる

## 障害のときの振る舞い

| 失敗 | 利用者に見えること | データへの影響 |
|------|-------------------|--------------|
| `Calendar` の読み取りが失敗（LINE） | 返事なし。LINE の再送で処理される。再送がなければ、もう一度「やった」を押す | なし |
| 単価・種類の名前の読み取りが失敗 | 同上 | なし（書く前） |
| 取引が 2 回続けて断られた | 「うまく記録できませんでした。もう一度お試しください」 | なし（全部か無し） |
| 取引が思いがけない Code で断られた（`ThrottlingError`） | 返事なし（再送）。画面は 500 と「読み込み直す」 | なし |
| 書けたあと reply が失敗 | 返事が届かない。もう一度「やった」で「済 16:42」を確かめられる | 記録は残る |
| フックが失敗 | 画面には見えない | 記録は残る。取り下げ漏れは U8 の条件で守る |
| LINE から同じイベントが再送 | 二度処理しない記録で止まる。記録が済んでいれば最初の結果 | 1 件のまま |
| 記録と管理者の変更・確定・単価の変更が重なる | 上の表のとおり、読み直して正しい印か、新しい単価で記録 | 確定した月、「×」、変えられた担当は変わらない |
| `ProcessedLineEvents` の読み書きが失敗 | `begin` の失敗は 500（何も処理しない）。`markDone` の失敗は 500（記録は 1 件のまま。再送は `alreadyRecorded`） | なし / 記録のみ |

## 筋書きにする競合と失敗（NFR8.11）

- 取引の直前に、(a) 管理者の担当の変更（`version` が増える）、(b) 月の確定、(c) 種類の単価の変更、(d) 同じ担当の別の記録を差し込む差し替えで、それぞれ上の表の結果になる。単価の変更のあとは新しい単価が `unitPrice` に入り、元の単価は残らない
- 2 回続けて断らせると `INTERNAL` で、3 回目の書き込みがない（書き込みの呼び出しが 2 回で止まる）
- 同じイベントを 2 回、別のイベントで同じ担当を 2 回、2 つの要求を同時に（条件つきの書き込みの動きを再現した差し替えで）送ると、書き込みが成功するのは 1 回、記録は 1 件、`recordedAt` と `unitPrice` は最初のまま、`onDutyRecorded` は 1 回
- 取引を失敗させると担当は「未」のまま、`version` も変わらない。成功した担当は 3 つの記録の項目がそろう
- 管理者が先に「済」にした担当は `DUTY_ALREADY_DONE`。本人の二重押しは版が古くても成功
- (a)(b)(c) の失敗を起こす差し替えで、返事の有無、HTTP の状態（200、500）、イベントの記録（処理済み、消える）、記録の有無が上の表のとおり。(b) のあとの再送で記録が 1 件
- 単価の読み取りの失敗、種類がない（`NOT_FOUND`）、利用者の読み取りの失敗で、担当が「未」のまま。LINE の API を失敗させても記録が残る
- 登録されたフックが投げても記録が成功のまま返り、`DUTY_RECORDED_HOOK_FAILED` が残る。登録がなければ何も起きない
- 思いがけない Code（`ThrottlingError`）の差し替えで、読み直さずに投げ直す
- 「済」の担当の古い選択肢（`v` が古い）を押しても、本人なら二重押しとして成功。管理者が「未」に戻した（`version` が増えた）担当の古いボタンは `DUTY_CHANGED` で記録しない（NFR4.59）

## ADR-U6-01 記録の書き込みと断られたときの扱い

**Context**

- 記録は家族のお小遣いの回数と金額の元になるので、二重に数えない、金額の抜けた「済」を作らない、確定した月を変えない、を同時に守る必要がある
- 守る条件は 3 つの項目にまたがる: 担当（状態、版、`dutyId`）、月の状態（確定）、種類（読んだ単価のまま）。DynamoDB の条件は 1 項目の中でしか書けないので、複数の項目の条件は `TransactWriteItems` の ConditionCheck で書く
- 同じ担当には、同じ本人の二重押し、LINE と画面の同時、管理者の変更・確定・単価の変更が重なりうる。LINE は同じイベントを再送する

**Decision**

- 記録の書き込みは、担当の Update + 月の ConditionCheck + 種類の単価の ConditionCheck を 1 回の `TransactWriteItems` にまとめる（上の「取引の形」）。単価は書く直前に 1 回読み、読んだ値を `unitPrice` に書き写すと同時に、「その値のまま」を同じ取引で確かめる
- 断られたら、断られた項目の番号では分岐せず、**必ず読み直して BR7.4 の判定の順番を最初から評価する**。やり直しは 1 回まで。2 回続けて断られたら `INTERNAL`（何も書かない）
- 二重押しは、判定の順番で「本人が記録済み」を最初の方（3.）に置き、書き込みを伴わずに最初の結果を返す（`alreadyRecorded`）。同時の 2 つの要求は、条件つきの書き込みの片方だけが成功し、もう片方が読み直して同じ分かれ方に着く

**Consequences**

- よい点: 「済」と 3 つの記録の項目が全部か無しかで書かれる。確定した月、変えられた担当、変わった単価を、読んだ値のままで上書きしない。判定のコードが 1 本（LINE も画面も同じ）で、競合の原因が増えても分岐が増えない。U7・U8 も同じ形（`dutyId` + `version` + 月の確かめ）で書ける
- よくない点: 取引は項目が 3 つで、書き込みユニットが約 6 になる（月に数百回で費用への影響は小さい。`scalability-design.md`）。競合のたびに最大 5 回の読み書きが増える（上限の中。NFR7.28）。単価が頻繁に変わると 2 回続けて断られうるが、管理者 1 人の操作との重なりに限られ、もう一度押せば収まる
- 取引の `ConditionCheck` に `ChoreTypes` の許可（`ConditionCheckItem`）が `line` に必要になる（`security-design.md`）

**Alternatives Rejected**

| 案 | よいところ | 選ばなかった理由 |
|----|----------|----------------|
| A. 担当の `UpdateItem` 1 項目だけ（月の確定と単価は読んだだけで確かめない） | 書き込みが軽く、権限も少ない | 読んだあとに月が確定すると、確定した月の担当を書き換える（FR6.5 に反する）。読んだあとに単価が変わると、古い単価が書かれる（FR2.2 の「変更したあとに付いた記録から新しい単価」に反する） |
| B. 単価を担当の項目に最初から持たせ、記録のときに種類を読まない | 種類を読まなくてよい | U5 が担当を作る時点の単価を持つと、単価の変更が「変更後に付いた記録から」にならない。担当を作る時点で単価を決めるのは ADR-003（記録のときに書き写す）に反する |
| C. 取引が断られた項目の番号で分岐し、読み直しをしない | 読み取りが減る | 項目 0 の失敗だけでも原因が 4 つあり、番号では印が決まらない。複数の項目が同時に失敗すると分岐が増える。読み直しのほうが単純で、印が必ず正しい |
| D. 競合のやり直しを回数制限なしにする（バックオフつき） | 2 回続けて断られる場面が減る | 3 秒の目標（NFR7.25）を超えうる。LINE の Lambda を長く占める。家族 4 人の量では 1 回で足りる（NFR 要件の仮定） |
| E. 条件つきの書き込みを使わず、読んでから書く（アプリ側の排他） | 実装が単純に見える | Lambda が複数動くと排他にならない。二重押し・同時の記録が二重に書かれる |

## Sources

- `construction/u6-recording/nfr-requirements/reliability-requirements.md`（NFR2.33〜NFR2.39、NFR6.7、NFR11.5、NFR11.6）、`performance-requirements.md`（NFR7.28、NFR7.31）、`security-requirements.md`（NFR4.59）
- `construction/u6-recording/functional-design/rules.md`（BR7.4〜BR7.8、BR7.11、BR7.13、BR7.14、BR7.17）、`functional-spec.md`（記録の結果の印と返事の対応、次の単位への引き継ぎ）
- `construction/u5-assignment-calendar/nfr-design/reliability-design.md`（取引、競合、フック、日本時間の形）、`logical-components.md`（他の単位との約束）
- 既存コード（読むだけ）: `entries/line.ts`（`processEvent` の `begin`、`release`、`markDone`）、`repositories/calendarRepository.ts`（`findDuty`、`buildMonthGuard`、`classifyCancellation`、`writeTransaction`）、`services/choreTypeService.ts`（`getCurrentUnitPrice`、`list`）、`services/dutyReassignedHook.ts`、`handlers/line/groupEventHandler.ts`（`LINE_REPLY_FAILED` の扱い）、`packages/shared/src/jstDate.ts`

## Assumptions & Open Questions

- [assumption] `TransactWriteItems` の `ClientRequestToken` を AWS SDK v3 が自動で付け、通信の再試行で同じ値になる、という SDK の既定の動きに頼っています。コード生成で、SDK のバージョンの動きを確かめます（違えば、LINE の `webhookEventId` と試行の番号から作った 36 文字以内の値を明示で渡します）
- [assumption] 担当の子供が変われば `version` が増える（U5 の約束）ので、条件の `#childUserId = :by` は二重の守りです。U5 のコードがこれを守っていることを、コード生成で U5 の単体テストと突き合わせます
- [assumption] 家族 4 人の量では、同じ担当を同時に押したときにほぼ限られ、1 回のやり直しで収まります（NFR 要件の仮定のまま）
- [assumption] `ProcessedLineEvents` の `STALE_AFTER_MS` を過ぎた「処理中」の再実行は U1 の作りで、`markDone` の失敗の再送が `alreadyRecorded` に着く動きは、コード生成の筋書きで確かめます
- 作り手への失敗の知らせ（15 分以内）は U10 で入れます。それまでは `DUTY_RECORD_REJECTED`（`reason = INTERNAL`）と `REQUEST_ERROR` を CloudWatch Logs で検索して気づきます（`observability-design.md`）
