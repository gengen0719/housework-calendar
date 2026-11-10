# 信頼性の設計（Reliability Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）の信頼性の要件（NFR2.44〜NFR2.50、NFR6.8、NFR11.7）を、どう作るかを書きます。U5 の作り（条件つきの `TransactWriteItems`、`CancellationReasons` の読み分け `classifyCancellation`、競合は読み直して 1 回だけやり直し、ほかの Code は投げ直す、`onDutyReassigned` フック）と、U6 の記録の作り（`findDuty` の判定の順番、単価の書き写しと `buildUnitPriceGuard`、`MAX_ATTEMPTS = 2`）をそのまま使います。テーブルの形とキーは U5 のとおりで、U7 は新しい保存先を作りません（`scalability-design.md`）。U7 で大事なのは、状態の変更が「全部そろって」「一部だけ書かれない」こと、確定・取り消しが version を条件にせず目的の値にそろうこと、確定した月の変更が各単位で確実に断られること、本番のデータを手で書き換えずに画面からすべて直せることです。

## 状態の変更の全体の流れ（NFR2.44、NFR2.45、BR8.2、BR8.4〜BR8.6）

画面（`POST /v1/duties/{dutyId}/status`）から、同じ関数 `changeDutyStatus(ctx, dutyId, action, options)` を通ります（`services/calendarService.ts` に足す）。`options` は `now`（要求の入口で 1 回だけ取った時刻）と `version`（画面が見せた時点の版。数でも、数を返す関数でも渡せる。本文を担当の 404 のあとで読むため。U5 の `changeDutyChild` と同じ）です。`action` は `cancel`・`markDone`・`markSkipped`・`unmarkSkipped` の 4 つ。

1. 本文の形を確かめる（担当を探す前。BR8.2 の順）。`action` が 4 つのどれでもない、`version` が欠ける・外れる → 422 `INVALID_REQUEST`（何も書かない。入口の zod。`security-design.md`）
2. 担当を探す（`findDuty`。`DID#` → 担当 → 月の状態の強い整合性の GetItem 3 回）。ない、または `dutyId` が違えば `NOT_FOUND`
3. `version` が関数なら、ここで呼ぶ（本文の 422 は担当の 404 のあと）
4. **判定の順番（BR8.4 を 1 つに決める）**。最初に当てはまったもので終える

| 順 | 確かめ | 当てはまったとき |
|----|--------|----------------|
| 1 | 担当が家族の中にある | なければ `NOT_FOUND` |
| 2 | その担当の月が確定している | `MONTH_CONFIRMED`（月は担当の `month`。今日の月ではない。NFR2.48） |
| 3 | いまの状態と `action` の組が FR6.1 の表にある | なければ `INVALID_TRANSITION` |
| 4 | 通過 | 書き込みへ（markDone は単価を読む） |

5. markDone なら、書き込みの直前に `getCurrentUnitPrice(ctx, choreTypeId)`（C7。GetItem 1 回、強い整合性。「使わない」の種類にも今の単価を返す）を読む。`NOT_FOUND`（種類がない。起きない前提）は 500 `INTERNAL` にして何も書かない（BR8.6）。それ以外の 3 つ（cancel・markSkipped・unmarkSkipped）は単価を読まない
6. 取引を 1 回書く（次の節）。書けたら 8. へ
7. 断られたら、**2.（担当の探索）からやり直す**。やり直しは 1 回まで（最初を含めて 2 回。`MAX_ATTEMPTS = 2`）。やり直しで要求の `version` は変えない（見せた時点のまま）。2 回目も断られたら 500 `INTERNAL`（何も書かない）
8. 書けたら、`DUTY_STATUS_CHANGED` を残し、担当が「未」でなくなった（markDone・markSkipped で済・× になった）とき `notifyDutyReassigned(events)` を 1 回呼び（フックの節。`onDutyReassigned` は登録の口で、ここで呼ぶのは実行側の `notifyDutyReassigned`）、更新後の `Duty` を返す

```text
for attempt in 1..2:
    found   = findDuty(ctx.familyId, dutyId)              // GetItem 3 回
    verdict = judge(found, action, resolveVersion())      // 順 1〜3。proceed 以外はここで返す
    price   = action == markDone ? getCurrentUnitPrice(ctx, verdict.duty.choreTypeId) : none
    items   = action == markDone ? buildMarkDoneItems(...) : buildResetStatusItems(...)
    if writeTransaction(items) == written:
        return success(nextDuty)
    logger.info(DUTY_STATUS_RETRY)                        // 競合だけがここに来る
return INTERNAL                                           // 2 回続けて断られた
```

- 判定の順番は、本文の形（422。探す前）→ 探す（404）→ 月の確定（409 `MONTH_CONFIRMED`）→ 表の確かめ（409 `INVALID_TRANSITION`）です。`ADMIN_ONLY`（403）は入口の `requireAdmin` で先に断る（`security-design.md`）ので、`changeDutyStatus` は家族の管理者だけが呼ぶ前提で、この 4 つの印を返します
- `recordedBy`（済にするときは管理者 `ctx.userId`）と担当の子供 `childUserId` は別です（`childUserId` は変えない。BR8.6）

### FR6.1 の表の判定（BR8.2）

`action` と「いまの状態」の組が、次の 5 とおりのどれかのときだけ書き込みに進みます。表にない組は `INVALID_TRANSITION`。

| action | 許される「いまの状態」→「操作後」 |
|--------|--------------------------------|
| `cancel` | 済 → 未 |
| `markDone` | 未 → 済、× → 済 |
| `markSkipped` | 未 → ×、済 → × |
| `unmarkSkipped` | × → 未 |

## 取引の形（状態の変更）（NFR2.44、BR8.4〜BR8.6）

状態の変更の書き込みは 1 回の `TransactWriteItems`。markDone は 3 項目、ほかの 3 つは 2 項目です。属性名はすべて `ExpressionAttributeNames` で置き換えます（NFR4.69、U5・U6 の決まり）。

### markDone（未→済、×→済）: 3 項目

| 番号 | 項目 | 条件 |
|------|------|------|
| 0 | `Calendar`: 担当の `UpdateItem`（キー `M#<month>#D#<date>#<choreTypeId>`） | `#status = :from AND #version = :v AND #dutyId = :id` |
| 1 | `Calendar`: 月の状態の `ConditionCheck`（`M#<month>#S`。U5 の `buildMonthGuard`。担当の `month`） | `attribute_not_exists(#confirmed) OR #confirmed = :false` |
| 2 | `ChoreTypes`: 単価の `ConditionCheck`（`TYPE#<choreTypeId>`。U6 の `buildUnitPriceGuard`） | `#unitPrice = :price`（読んだ単価のまま） |

更新式は、記録の 3 項目を同時に**書く**: `SET #status = :done, #recordedAt = :now, #recordedBy = :by, #unitPrice = :price, #updatedAt = :now, #version = #version + :one`。`recordedBy` は管理者 `ctx.userId`、`recordedAt`・`updatedAt` は入口の `now`（UTC）、`unitPrice` は読んだ単価（BR8.6）。これは U6 の `buildRecordItems`（`calendarRepository.ts`）と同じ形で、違いは条件に `#childUserId = :by` を**付けないこと**（U7 の記録者は管理者で担当の子供ではないため）と、`:from` が `todo` だけでなく `skipped` にもなること（×→済）です。「いまの状態」の条件 `#status = :from` は、判定で見た状態（`todo` または `skipped`）を入れる。

```ts
// markDone（未→済・×→済）の担当の Update。属性名はすべて # の別名（NFR4.69）。15 行以内の抜粋
const update = { Update: { TableName: 'Calendar', Key: dutyKey,
  UpdateExpression: 'SET #status = :done, #recordedAt = :now, #recordedBy = :by, ' +
    '#unitPrice = :price, #updatedAt = :now, #version = #version + :one',
  ConditionExpression: '#status = :from AND #version = :v AND #dutyId = :id',
  ExpressionAttributeNames: { '#status': 'status', '#version': 'version' /* 式に出る名前をすべて */ },
  ExpressionAttributeValues: { ':done': 'done', ':from': fromStatus /* todo | skipped */ } } };
```

### cancel・markSkipped・unmarkSkipped（「未」「×」に戻す）: 2 項目

| 番号 | 項目 | 条件 |
|------|------|------|
| 0 | `Calendar`: 担当の `UpdateItem` | `#status = :from AND #version = :v AND #dutyId = :id` |
| 1 | `Calendar`: 月の状態の `ConditionCheck`（`buildMonthGuard`） | `attribute_not_exists(#confirmed) OR #confirmed = :false` |

更新式は、記録の 3 項目を同時に**消す**: `SET #status = :to, #updatedAt = :now, #version = #version + :one REMOVE #recordedAt, #recordedBy, #unitPrice`。`:to` は操作後の状態（`todo` または `skipped`）。3 項目を同時に `REMOVE` し、どれか 1 つだけが残る担当を作らない（BR8.5）。単価を読まないので単価の `ConditionCheck` は付けない（取引 2 項目）。

### 共通の守り

- **担当を作らない**: `UpdateItem` は条件がなければ項目を作ってしまう。条件に `#status = :from`（`from` は `todo`・`done`・`skipped` のいずれか、`attribute_not_exists` ではない）があるので、項目がなければ条件が成り立たず断られる（作られない）。`PutItem`・`DeleteItem` を担当に発行しない（CDK の許可の `api` は U5 の範囲。NFR4.71）
- **「済」なら 3 項目がそろい、「未」「×」なら 3 項目が空**: markDone は 3 項目を `SET`、ほかは 3 項目を `REMOVE`。取引は全部成功するか全部書かれないか（BR8.18、NFR2.44）なので、どれか 1 つだけが残る/欠ける担当を作らない（U6 の NFR2.33 の不変条件と同じ）
- **変えない項目**: `origin`・`childUserId`・`date`・`choreTypeId` は式に出さず、変えない（U5・U6 の引き継ぎ、BR8.4）
- **月の確かめは担当の `month`**: 今日の月ではなく担当の日付の月で `buildMonthGuard` を引く（過去の月の担当も、確定していなければ直せる。NFR2.48、AC6.1.8）
- 条件式・更新式に出る属性名は、予約語かどうかにかかわらず**すべて `ExpressionAttributeNames`**（`#status`・`#version`・`#confirmed`・`#unitPrice`・`#recordedAt`・`#recordedBy`・`#updatedAt`・`#dutyId`）で置き換える。コード生成の単体テストで、組み立てた式のすべての属性名が `#` の別名になっていることを確かめる（U5・U6 の決まり）

## 断られたときの読み直し（NFR2.45、NFR4.70）

`writeTransaction`（U5）は、`TransactionCanceledException` の `CancellationReasons` を `classifyCancellation` で読み分けます。

| Code | 扱い |
|------|------|
| `ConditionalCheckFailed`、`TransactionConflict` だけ | 競合 → 読み直して 2.（担当の探索）からやり直す（1 回まで） |
| 1 つでも別の Code（`ThrottlingError`・`ProvisionedThroughputExceeded`・`ValidationError` など）、または Code が読み取れない | 投げ直す（→ `entries/api.ts` が 500 `INTERNAL` の `REQUEST_ERROR`）。読み直さない |

- **どの項目で断られたかでは分岐しない**（U6 の ADR-U6-01 と同じ理由）。項目 0 の失敗だけでも、原因は「状態が変わった」「`version` が増えた」「`dutyId` が変わった」の 3 つがあり、番号では決まらない。2 つ以上の項目が同時に失敗することもある（確定と単価の変更が重なる）。読み直しは BR8.4 の順番を最初から評価するだけなので、どの原因でも正しい印に着く。項目の番号はログ用（`DUTY_STATUS_RETRY`）にだけ使う
- 読み直し（2.〜4.）が出す結果は、差し込みごとに次のとおり（INVALID_TRANSITION の判定は、読み直したあとの「いまの状態」で行う）

| 取引の直前に差し込まれたもの | 読み直しの結果 |
|------------------------------|---------------|
| (a) 管理者が別の端末で担当を変える（`version` が増える・状態が変わる） | 3.（`INVALID_TRANSITION`。例: 「済」を取り消そうとしたら先に「未」に戻されていた）。何も書かない |
| (b) 月が確定された | 2.（`MONTH_CONFIRMED`）。何も書かない |
| (c) 単価が変わった（markDone のとき） | 判定は通り、**新しい単価を読み直して**もう一度書く（新しい単価が `unitPrice` に入る。FR2.2） |
| (d) 先に同じ担当を別の状態に変える | 3.（`INVALID_TRANSITION`）または 1.（`NOT_FOUND`。作り直されたとき）。何も書かない |

- **2 回続けて断られたら** 500 `INTERNAL`。3 回目の書き込みはしない。何も書かれていない（取引は全部か無しか）
- `DUTY_STATUS_RETRY` は info（失敗ではなく、競合は想定内）。2 回目も断られたときは `DUTY_STATUS_REJECTED`（`reason: INTERNAL`、error ではなく info）を残し、画面は 500 にする（`observability-design.md`）

## 確定・取り消しの冪等（NFR2.46、BR8.11、BR8.12、BR8.14）

確定（`confirmMonth(ctx, month, options)`）と取り消し（`unconfirmMonth(ctx, month)`）は、担当の書き換え（BR8.4）と違い、**version を書き込みの条件にしません**。目的の値にそろえる作りなので、二度押し・確定↔取り消しの連打でも最後の操作の結果にそろいます（BR8.14、BR8.16）。取引の読み直しの仕組みはいりません。入口で `requireAdmin` を通した前提で、どちらも成功（200）を返します（印の返しはありません）。

### 確定（行の有無で書き方を分ける）

月の状態（`M#<month>#S`）を `confirmed=true`・`confirmedAt=今`・`confirmedByUserId=ctx.userId`・`version` にそろえます。

| 月の状態の行 | 書き方 | 条件 |
|-------------|-------|------|
| 無い（記録のない月。`version` 0 として扱う） | `PutItem` で `version=1` の確定行を作る | `attribute_not_exists(#sk)`（行が無いこと） |
| ある | `UpdateItem` で `confirmed=true`・`confirmedAt`・`confirmedByUserId`・`version+1` | なし（目的の値にそろえる。version を条件にしない） |

- 行の有無は、確定の前に月の状態を 1 回読んで分ける（`getMonthState`。NFR7.35 の確定の 2 回のうち 1 回は書き込み。読みは `requireAuth` の利用者の 1 回に含めず、確定の「月の状態の 1 回の書き込み」の中で `PutItem`／`UpdateItem` を選ぶための 1 回に数えると 2 回を超える恐れがあるため、**行の有無は条件つきの 1 回の書き込みで分ける**: まず `attribute_not_exists` 条件の `PutItem` を試し、`ConditionalCheckFailed`（行が既にある）なら `UpdateItem` でそろえる。これなら通常は 1 回、初回確定が競合したときだけ 2 回目の書き込みになる。利用者 1 + 書き込み 1 = 2 回を守る）
- `attribute_not_exists` の `PutItem` が競合（同時に別の初回確定が走った）で断られたときだけ、1 回読み直して `UpdateItem` の経路でそろえる（NFR2.46）。これは version の競合の読み直しではなく、行の有無の分岐の解決
- すでに確定済みの月をもう一度確定しても、`UpdateItem` が `confirmed=true` にそろえるだけで同じ結果（`confirmed` は true のまま、`version` は増える。BR8.11）

```ts
// 確定: まず行が無いことを条件に Put、競合なら Update でそろえる（version は条件にしない。BR8.14）。抜粋
const put = { Put: { TableName: 'Calendar', Item: confirmedRow /* version:1 */,
  ConditionExpression: 'attribute_not_exists(#sk)', ExpressionAttributeNames: { '#sk': 'sk' } } };
// ConditionalCheckFailed のとき: UpdateItem で confirmed=true, confirmedAt, confirmedByUserId, version+1
```

### 取り消し

| 月の状態の行 | 書き方 |
|-------------|-------|
| ある | `UpdateItem` で `confirmed=false`・`confirmedAt` と `confirmedByUserId` を `REMOVE`・`version+1` |
| 無い（記録のない月） | 行を作らず何もしない（既に未確定 = false と同じ結果。BR8.12） |

- 取り消しも version を条件にしない。行が無ければ何もしない（`UpdateItem` を `attribute_exists(#sk)` 条件で試し、断られたら何もしないで成功を返す、または `getMonthState` で行の有無を見てから `UpdateItem` する。どちらでも 2 回以内に収まる。NFR7.35）
- 確定していない月の取り消しは、何も変えずに同じ結果（`confirmed` は false のまま）
- 取り消したあと、担当・記録・状態の変更・割り当ての変更・加算・減額がまた通る（AC6.1.7、NFR2.47）

## 確定した月が変えられないこと（NFR2.47、NFR2.48）

- 月を確定すると、それ以降、その月の記録（U6）・状態の変更（U7）・割り当ての保存と担当の子供の変更（U5）が、各単位の月の確かめ（`buildMonthGuard` の `ConditionCheck`）で `MONTH_CONFIRMED` に断られる。U7 は確定行を書くだけで、断るのは各単位の既存の取引（U5・U6）と U7 の状態の変更（上の取引の項目 1）
- 加算・減額が断られることは U11 の AC8.2.5 で確かめる（U7 では確かめない。`nfr-requirements/reliability-requirements.md` の NFR2.47）
- **確定の確かめは、操作しようとしている担当の日付の月**で行う（今日の月ではない。NFR2.48）。`buildMonthGuard` は担当の `month` で引くので、月をまたいだあとでも確定していない過去の月の担当は状態を変えられる（AC6.1.8、BR8.14）。月末・年またぎ・うるう年の境でも、担当の日付の月で確かめる（NFR11.7、U6 の NFR11.6 の境と同じ）

## 失敗のときの扱い（NFR2.49、BR8.18）

- 思いがけない失敗（状態の変更の取引が 2 回続けて断られた `INTERNAL`、DynamoDB に接続できないなどの例外）は、500 を返す。画面は「表示できませんでした。もう一度お試しください」と「読み込み直す」（C10 の `INTERNAL` の文言。FR4.5）を出す
- 状態の変更も確定・取り消しも 1 つの取引（または 1 回の書き込み）なので、「一部だけ書かれた」状態はない。もう一度操作すれば今の状態からやり直せる（画面は BR8.9 で今の状態のボタンを出し直す）
- 失敗を 15 分以内に作り手に知らせる仕組み（NFR2）は U10 で入れる。それまでは `DUTY_STATUS_REJECTED`（`reason: INTERNAL`）、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED` のログ（NFR2.53 の observability）で気づく
- 例外は U1 の共通の入口（`entries/api.ts` の `handler`）が 500 の `REQUEST_ERROR` にする

| 失敗 | 利用者に見えること | データへの影響 |
|------|-------------------|--------------|
| 状態の変更の取引が 2 回続けて断られた | 500。「表示できませんでした」と「読み込み直す」 | なし（全部か無し） |
| 取引が思いがけない Code で断られた（`ThrottlingError`） | 500 | なし |
| `getCurrentUnitPrice` が種類なし（起きない前提） | 500 `INTERNAL` | なし（書く前） |
| DynamoDB に接続できない | 500（`REQUEST_ERROR`） | なし |
| フックが投げた | 画面には見えない（成功のまま） | 状態の変更・確定は残る。取り下げ漏れは U8 の条件で守る（NFR2.50） |
| 別の端末の操作と重なる | 読み直して正しい印（`MONTH_CONFIRMED`・`INVALID_TRANSITION`）、または新しい単価で記録 | 確定した月・変えられた担当は変わらない |

## `onDutyReassigned` フック（NFR2.50、BR8.15）

U8 が、担当が「未」でなくなったとき・月を確定したときに、その担当の「代わりにやる」の申し出を取り下げるための口です。U5 の `services/dutyReassignedHook.ts`（既存）に `kind` を足します。

### 登録する口と、書けたあとに呼ぶ処理を分ける（R-02）

既存コードは、2 つを別の名前で分けています。U7 もこの分け方を崩しません。

- **`onDutyReassigned(hook)`** は、U8 が自分の取り下げの関数を**登録する口**です（登録するだけ。何も実行しない）。U7 は登録しません（U8 が、必要な `api` の起動の枠＝composition root で登録する）。U8 までは何も登録されていません。
- **`notifyDutyReassigned(events)`** は、**書けたあとに呼ぶ処理**です。登録済みの関数に、担当の一覧（`DutyReassignedEvent[]`）を**1 回まとめて渡して**順に実行します。U7 は、取引（または確定の書き込み）が成功したあと、このひとつの処理を 1 回だけ呼びます。登録がなければ、渡しても何も起きません。
- これは U5 の `changeDutyChild` と同じ形です。`changeDutyChild` は、取引が `written` になったあとに `notifyDutyReassigned([ ... ])` を**成功後に 1 回**、一覧（1 件）で呼びます。U7 の状態の変更・確定も同じく、成功後に `notifyDutyReassigned(events)` を 1 回呼ぶ形にそろえます。

### `month-confirmed` で渡す中身を 1 つに決める（R-01）

既存の `DutyReassignedEvent` は、`familyId`・`dutyId`・`date`・`choreTypeId`・`fromChildUserId` が**必ず要る「1 つの担当」の形**です（`reassignEvents` が担当ごとに 1 件組み立てる）。この必須の形を崩さない方を選びます。すなわち **`month` を 1 つ渡す新しい形は作らず、`fromChildUserId` 等を任意にもしません**。

- 月の確定も、**その月で「未」でなくなった担当ごとに `status-changed` と同じ 1 件ずつ**に展開し、`notifyDutyReassigned(events)` に一覧でまとめて 1 回渡します。各件は 1 つの担当の形のまま（`dutyId`・`date`・`choreTypeId`・`fromChildUserId` がそろう）。月をまたぐ事実は「月に関わる担当の一覧」として一覧の中身で表し、イベント 1 件の形は変えません。
- U7 で `kind` に **`'status-changed'`**（状態の変更で担当が「未」でなくなった）だけを足します。`'month-confirmed'` という月単位の新しい `kind` は足しません。確定で取り下げる担当も `'status-changed'` の 1 件として渡します（「未でなくなった担当」という事実は状態変更と確定で同じため。U8 は `kind` で挙動を分けなくてよい）。
- `fromChildUserId` は担当の子供（必須のまま）。`toChildUserId`・`newOrigin` は `'child-changed'` のときだけで、`'status-changed'` では付けません（既存の任意の形のまま）。

```ts
// 既存 dutyReassignedHook.ts の kind に status-changed を足すだけ（U8 向け。必須フィールドは変えない）。抜粋
export interface DutyReassignedEvent {
  familyId: string; dutyId: string; date: string; choreTypeId: string;
  kind: 'child-changed' | 'deleted' | 'status-changed';
  fromChildUserId: string; // 必須のまま（1 つの担当の形を崩さない）
  toChildUserId?: string; newOrigin?: 'rule' | 'manual'; // child-changed のときだけ（既存）
}
```

- 呼ぶのは**取引（または確定の書き込み）が成功したあと、その 1 回だけ**（`notifyDutyReassigned(events)` を 1 回）。状態の変更では、担当が「未」でなくなった（markDone・markSkipped）ときに、その 1 件を一覧に入れて呼ぶ（cancel で「済→未」、unmarkSkipped で「×→未」は「未」に戻るので入れない。一覧が空なら呼ばなくてよい）。取引をやり直して成功した 1 回の変更についても、呼び出しは 1 回（呼ぶ場所は 8. の 1 か所。U6 の `notifyDutyRecorded` と同じ）
- 月の確定（`confirmMonth`）が成功したあと、その月で「未」でなくなった担当（確定の時点で「未」だったものが対象外になる、の意味は BR8.15／U8 の取り下げ仕様に従う）を一覧にして `notifyDutyReassigned(events)` を 1 回呼ぶ。確定の取り消し（`unconfirmMonth`）では呼ばない（取り下げるのは確定したときだけ）
- 登録された関数が投げても、状態の変更・確定の結果は変えず、警告のログ（`DUTY_REASSIGN_HOOK_FAILED`。`dutyId`・`kind` だけ。名前は書かない。NFR2.50）を残す。既存の `notifyDutyReassigned` は担当ごとに `DUTY_HOOK_FAILED` を出すので、U7 の呼び出しの文脈に合わせて `kind` を含める（`observability-design.md` で整える）。U8 までは登録がなく、何もしない
- 通知は「届けば取り下げる」ためで、最後の守りは U8 側の条件にある（書いたあとフックの前に落ちると届かない。U5・U6 と同じ）
- **`api` の起動の枠（composition root）で登録する**。U7 の状態の変更・確定は `api` でだけ起きる（LINE の経路はない。NFR1.30）。U8 は必要な枠に登録する（U6 の約束のとおり、記録は両方で起きるが U7 の状態の変更は `api` だけ）

## 日本時間（NFR11.7）

- 要求の入口で `now = new Date()` を 1 回だけ取る（`entries/api.ts` の `handler` の `now`）。状態の変更の `recordedAt`（markDone のとき）・`updatedAt`、確定の `confirmedAt` に同じ `now` を使う。画面や端末の時計は使わない
- `recordedAt`・`confirmedAt`・`updatedAt` は UTC の ISO 8601。表示だけ日本時間にする（U5 の `packages/shared` の `jstDate.ts` を使う。NFR8.10）
- 月の確かめ（`buildMonthGuard`）は担当の `month` で引く（`monthOfDate` ではなく担当の項目の `month`）。確定の確かめが担当の日付の月で行われる（NFR2.48）
- 確かめ方（単体テスト、時計の差し替え）:
  - markDone の `recordedAt` と確定の `confirmedAt` が入口の `now` であること、表示が日本時間になること
  - 日本時間の 23:59:59.999（UTC 14:59:59.999）と 0:00:00.000（UTC 15:00:00.000）の境で、確定の確かめの対象の月が正しいこと
  - 2026 年 12 月を確定しないまま 2027 年 3 月になっても 12 月の担当の状態を変えられること。1 月 31 日と 2 月 1 日、12 月 31 日と翌年 1 月 1 日、うるう年の 2 月 29 日の担当の月の確かめが正しいこと（NFR2.48、NFR11.7）

## データ（NFR6.8）

- 記録のデータ（`status`・`recordedAt`・`recordedBy`・`unitPrice`）と月の確定は、アプリの画面の操作（状態の変更・確定・取り消し）でだけ変わる。U7 のコードに、`Calendar` の項目を直接書き換えるスクリプト・一括の修正の手順を作らない（BR8.8）
- 間違いは、取り消す・済にする・やらなかったにする・やらなかったを外す（BR8.4〜BR8.6）と、確定の取り消し（BR8.12）で直す。FR6.1 の 6 とおりの変わり方（未→済、未→×、済→未、済→×、×→未、×→済）と、月の確定・取り消しが画面からできる（AC6.1.11）
- 元に戻すボタンは置かず、もう一度操作して直す（U5・U6 と同じ）
- `Calendar` は本番で `RemovalPolicy.RETAIN`（U5 の設定のまま。U7 は変えない）。CDK のテストで確かめる

## 筋書きにする競合と失敗（NFR8.13）

- 取引の直前に、(a) 管理者が別の端末で担当を変える（`version` が増える・状態が変わる）、(b) 月の確定、(c) 単価の変更（markDone）、(d) 先に同じ担当を別の状態に変える、の各差し替えで、上の表の結果（`INVALID_TRANSITION`・`MONTH_CONFIRMED`・新しい単価での記録）になること。単価の変更のあとは新しい単価が `unitPrice` に入り、元の単価は残らない
- 2 回続けて断らせると 500 `INTERNAL` で、3 回目の書き込みがない（書き込みの呼び出しが 2 回で止まる）
- 取引を失敗させると担当は元の状態・`version` のまま変わらないこと。成功したあと、「済」なら 3 項目がそろい、「未」「×」なら 3 項目が空であること。markDone で単価が C7 から読んだ値のまま書き写されていること
- `PutItem`・`DeleteItem` を担当に発行しないこと（担当を作らない・消さない）
- 確定・取り消しを 2 回ずつ、確定↔取り消しを連打する差し替えで、最後の操作の結果（確定済み／未確定）にそろうこと。行の無い月への初回の確定で確定行が `version=1` で作られ、行の無い月への取り消しで行が作られないこと
- 登録されたフックが投げても状態の変更・確定が成功のまま返り、`DUTY_REASSIGN_HOOK_FAILED` が残ること。登録がなければ何も起きないこと。取引をやり直した 1 回の変更について、呼び出しが 1 回であること
- 時計を差し替えて、日本時間の境・月末・年またぎ・うるう年で確定の確かめが担当の日付の月で行われること（NFR11.7）
- 思いがけない Code（`ThrottlingError`）の差し替えで、読み直さずに投げ直すこと（`classifyCancellation`）

## ADR-U7-01 状態の変更は 1 回の取引、確定・取り消しは version を条件にしない冪等の書き込み

**Context**

- 状態の変更は家族のお小遣いの回数と金額の元になるので、金額の抜けた「済」や記録の残った「未」を作らない、確定した月を変えない、見せたあとに変わった担当を上書きしない、を同時に守る必要がある（BR8.5、BR8.6、NFR2.44）
- 守る条件は 3 つの項目にまたがる: 担当（状態・版・`dutyId`）、月の状態（確定）、種類（markDone は読んだ単価のまま）。DynamoDB の条件は 1 項目の中でしか書けないので、複数の項目の条件は `TransactWriteItems` の `ConditionCheck` で書く。これは U6 の記録（ADR-U6-01）と同じ構図で、U7 は記録者が管理者である点と、×→済 の遷移がある点だけが違う
- 一方、月の確定・取り消しは「目的の値にそろえる」操作で、二度押し・確定↔取り消しの連打が起きうる（BR8.14、BR8.16）。担当の書き換えのような version の楽観ロックは、連打のたびに `INTERNAL` を生みやすく、要件（最後の操作の結果にそろう）に合わない

**Decision**

- 状態の変更は、担当の `UpdateItem` ＋ 月の `ConditionCheck`（＋ markDone は単価の `ConditionCheck`）を 1 回の `TransactWriteItems` にまとめる。断られたら、断られた項目の番号では分岐せず、読み直して BR8.4 の判定を最初から評価する。やり直しは 1 回まで（U6 の `MAX_ATTEMPTS = 2` と同じ）。2 回続けて断られたら `INTERNAL`。既存の `buildRecordItems`・`writeTransaction`・`classifyCancellation`・`buildMonthGuard`・`buildUnitPriceGuard` の形をそのまま使い、U7 は状態の変更用の項目の組み立て（markDone の 3 項目、ほかの 2 項目）を足す
- 月の確定・取り消しは、**version を書き込みの条件にしない**。行が無い月への初回の確定は `attribute_not_exists` 条件の `PutItem`（`version=1`）、行がある月は `UpdateItem`。初回の `PutItem` が競合したときだけ 1 回読み直して `UpdateItem` でそろえる。取り消しは行があれば `UpdateItem`、無ければ何もしない。すでに目的の状態なら何も取り違えずに同じ結果を返す

**Consequences**

- よい点: 「済」と 3 つの記録の項目が全部か無しかで書かれる。確定した月・変えられた担当を上書きしない。判定のコードが 1 本で、競合の原因が増えても分岐が増えない。U5・U6 と同じ形（`dutyId` + `version` + 月の確かめ）なので、既存のテストの差し替えがそのまま使える。確定・取り消しは連打でも最後の結果にそろい、`INTERNAL` を生まない（NFR2.46）
- よくない点: 状態の変更の取引は markDone で 3 項目（書き込みユニットが約 6）。管理者 1 人の操作で月に数十回なので費用への影響は小さい（`scalability-design.md`）。競合のたびに最大 5 回の読み書きが増える（上限 11 の中。NFR7.35）。確定の初回に `PutItem` が競合すると 2 回目の書き込みになるが、同時の初回確定に限られる
- 確定・取り消しは version を条件にしないので、2 つの端末が同時に「確定」と「取り消し」を送ると、あとに届いた書き込みが勝つ（最後の操作の結果にそろう）。これは要件どおり（BR8.14）で、取り違えではない

**Alternatives Rejected**

| 案 | よいところ | 選ばなかった理由 |
|----|----------|----------------|
| A. 確定・取り消しも version を条件にする（楽観ロック） | 状態の変更と同じ形で統一できる | 二度押し・連打のたびに `INTERNAL` を生む。要件（最後の操作の結果にそろう。BR8.14、BR8.16）に反する |
| B. 状態の変更で、断られた項目の番号で分岐し、読み直しをしない | 読み取りが減る | 項目 0 の失敗だけでも原因が 3 つ（状態・版・dutyId）あり、番号では印が決まらない。複数の項目が同時に失敗すると分岐が増える。読み直しのほうが単純で印が必ず正しい（U6 の ADR-U6-01 C と同じ） |
| C. markDone で単価を担当に持たせず、お小遣いの計算時に種類を読む | 記録のときに種類を読まなくてよい | FR6.3「操作した時点の単価」と ADR-003（記録のときに書き写す）に反する。単価の変更が「変更後に付いた記録から」にならない |
| D. 確定・取り消しに version の楽観ロックをかけ、競合を回数制限なしでやり直す | 連打に強い | 3 秒の目標（NFR7.34）を超えうる。目的の値にそろえる作りなら楽観ロック自体が不要 |
| E. 状態の変更を条件つきの書き込みを使わず、読んでから書く（アプリ側の排他） | 実装が単純に見える | Lambda が複数動くと排他にならない。別の端末の同時操作が取り違えられる（U6 の ADR-U6-01 E と同じ） |

## Sources

- `construction/u7-review-confirm/nfr-requirements/reliability-requirements.md`（NFR2.44〜NFR2.50、NFR6.8、NFR11.7）、`security-requirements.md`（NFR4.69、NFR4.70）、`performance-requirements.md`（NFR7.35）、`scalability-requirements.md`（NFR3.11、NFR3.13）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.2、BR8.4〜BR8.6、BR8.11、BR8.12、BR8.14〜BR8.16、BR8.18）、`functional-spec.md`（F2〜F6、状態の変更の印と返事の対応、契約への追加）、`entities.md`（記録の 3 項目の不変条件、月の状態、`version` の既定 0）
- `inception/contract-design/contract-summary.md`（C8 `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`、C10 `INTERNAL`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`）
- `inception/domain-design/components.md`（カレンダーが月の確定と状態を持つ。ADR-001、ADR-003、ADR-005）
- `construction/u6-recording/nfr-design/reliability-design.md`（取引・競合・フック・日本時間の形、ADR-U6-01）
- `construction/u5-assignment-calendar/nfr-design/reliability-design.md`（取引・競合・フックの形）
- 既存コード（読むだけ）: `services/calendarService.ts`（`changeDutyChild` の読み直し・`MAX_CHANGE_ATTEMPTS`・`notifyDutyReassigned`）、`services/recordingService.ts`（`recordDuty` の判定の順番と `MAX_ATTEMPTS`）、`repositories/calendarRepository.ts`（`findDuty`・`buildMonthGuard`・`buildUnitPriceGuard`・`buildRecordItems`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`）、`services/dutyReassignedHook.ts`（`DutyReassignedEvent`・`notifyDutyReassigned`・`DUTY_HOOK_FAILED`）、`infrastructure/lib/app-stack.ts`（`Calendar` の `RETAIN` は U5 のテストで確かめ済み）

## Assumptions & Open Questions

- [assumption] 確定・取り消しの version を書き込みの条件にしないのは、担当の書き換え（BR8.4）と違い「目的の値にそろえる」操作で、二度押し・連打でも最後の操作の結果にそろうためです（BR8.14）。`attribute_not_exists` の条件は、行の有無で書き方を分ける（初回確定の `PutItem`）ためだけに使い、同時の初回確定が競合したら 1 回読み直して `UpdateItem` でそろえます
- [assumption] 確定の呼び出しを 2 回以内（NFR7.35）に収めるため、行の有無は「まず `PutItem`（`attribute_not_exists`）を試し、競合なら `UpdateItem`」の 1 回の書き込みで分けます。別に `getMonthState` を読んで分ける案だと利用者 1 + 読み 1 + 書き 1 = 3 回になり上限を超えるため採りません。実装の細かい形（1 回の条件つき Upsert か Put/Update の使い分けか）はコード生成に委ねますが、「行が無い月は新しい確定行を作る」分岐の意図は設計で確定させます（BR8.11）
- 月の確定の取り下げの渡し方は設計で 1 つに決めました（R-01）: 既存の「1 つの担当」の形（`fromChildUserId` 必須）を崩さず、`month` を 1 つ渡す新しい形は作らない。確定も「その月で『未』でなくなった担当ごとに `status-changed` の 1 件」に展開し、`notifyDutyReassigned(events)` に一覧でまとめて 1 回渡す。U7 は登録せず（U8 が composition root で登録）、U8 まで何もしません。U7 で確かめるのは、成功後に `notifyDutyReassigned(events)` が 1 回だけ呼ばれること、各件が 1 つの担当の形（`dutyId`・`date`・`choreTypeId`・`fromChildUserId`）であることです
- [assumption] AC6.1.6 の「加算・減額が確定済みの月で断られる」ことは U11 の AC8.2.5 で確かめます。U7 では、記録・状態の変更・割り当ての変更が断られることまでを確かめます（NFR2.47）
- [assumption] 作り手への失敗の知らせ（15 分以内。NFR2）は U10 で入れます。それまでは `DUTY_STATUS_REJECTED`（`reason: INTERNAL`）、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED` を CloudWatch Logs で検索して気づきます（`observability-design.md`）
