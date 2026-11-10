# 信頼性の設計（Reliability Design）— U8 代わりにやる

U8（`u8-swap`）の信頼性の要件（`nfr-requirements/reliability-requirements.md` の NFR2.54〜NFR2.62、NFR6.9、NFR11.8、NFR11.9）を、どう作るかを書きます。U1〜U7 の設計（取引の項目の組み立て `buildMonthGuard`・`CHECK_DUTY_UNCHANGED`・`writeTransaction`、`classifyCancellation`、`MAX_ATTEMPTS`、二度処理しない記録、入口で `now` を 1 回）はそのまま使い、U8 は**申し出の項目の組み立てを足すだけ**にします。大事なのは次の 4 つです。(1) 担当の持ち主が移る書き込みが「全部そろって」だけ起きる、(2) 同時に引き受けても成立するのは 1 人、(3) 申し出が有効かの判断がフックに頼らない、(4) 本番のデータを手で書き換えずに直せる。

## 申し出の項目（SWAP# 項目）の設計（ADR-U8-02）

`Calendar` の `familyId` ＋ `sk = SWAP#<dutyId>` に置く 1 項目です（`entities.md` の `SwapOffer`）。書き方は `UpdateItem` と `TransactWriteItems` の項目ごとの `Update`・`ConditionCheck` だけです（`PutItem`・`DeleteItem` は使わない。`security-design.md`）。

| 属性 | 申し出る | 引き受ける | 取り下げる | フックの掃除 |
|------|---------|-----------|-----------|-------------|
| `offerId` | 新しい UUID | 条件で比べる | 条件で比べる | — |
| `offererUserId` | 押した人 | — | — | — |
| `dutyVersion` | 読んだ担当の `version` | — | — | — |
| `status` | `open` | `accepted` | `withdrawn` | `cancelled` |
| `acceptedByUserId`・`acceptedAt` | 取り除く | 引き受けた人・`now` | — | — |
| `createdAt` | `now` | — | — | — |
| `updatedAt` | `now` | `now` | `now` | `now` |

- 項目は `UpdateItem` なので、なければ作られ、あれば上書きされます。「申し出る」はこれで、取り下げ・引き受け・自動でなくなったあとの**申し出し直し**も同じ書き方です（新しい `offerId` の `open` に上書き。BR9.12）
- 「申し出る」の条件は「項目がない、または `status` が `open` でない、または `dutyVersion` が今の担当の `version` と違う」です。`UpdateItem` の条件で項目がないときは `attribute_not_exists(#sk)` が真になります。有効な `open` が残っているときだけ断られ、`ALREADY_OFFERED` になります
- 「引き受ける」「取り下げる」「掃除」の条件は `#status = :open`（引き受け・取り下げは `#offerId = :offerId` も）です。項目がなければ断られ、**作られません**

## 3 つの書き込みの形（NFR2.54）

### (a) 申し出る — `offerSwap`（取引の 3 項目）

| 項目 | 内容 |
|------|------|
| 申し出の `Update` | 上の表の「申し出る」。条件は「項目がない、または `status` が `open` でない、または `dutyVersion` が今の担当の `version` と違う」 |
| 担当の `ConditionCheck` | 読んだ値のまま（`dutyId`、`version`、`status`＝todo、`childUserId`＝押した人）。`CHECK_DUTY_UNCHANGED` の形 |
| 月の `ConditionCheck` | 月が確定していない（`buildMonthGuard`。担当の `month` で引く） |

担当そのものは書き換えません。

### (b) 引き受ける — `acceptSwap`（取引の 3 項目、ADR-U8-03）

```text
担当の Update      : SET childUserId = :taker, origin = 'swap', version = version + 1, updatedAt = :now
                    条件 dutyId = :id AND version = :dutyVersion AND status = 'todo' AND childUserId = :offerer
申し出の Update    : SET status = 'accepted', acceptedByUserId = :taker, acceptedAt = :now, updatedAt = :now
                    条件 status = 'open' AND offerId = :offerId
月の ConditionCheck : 確定していない（buildMonthGuard）
```

- 3 項目は 1 回の `TransactWriteItems` で、**全部成功するか全部書かれないか**です。「担当だけ変わって申し出が開いたまま」「申し出だけ引き受け済みで担当が変わらない」状態は作りません
- **不変条件**: 「担当の `childUserId` が引き受けた子供に変わった」と「申し出の `status` が `accepted`」は同時に起きます。担当の `status`・記録の項目（`recordedAt`・`recordedBy`・`unitPrice`）・`date`・`choreTypeId` は変わりません。担当を作らず、消しません
- 引き受けた子供の**自分の担当には触れません**（取引の項目に含めない。同じ日の同じ種類には 1 家族 1 担当なので重ならない）
- `acceptSwap` は `onDutyReassigned` を**呼びません**（申し出が同じ取引で `accepted` になり、取り下げる申し出が残らないため。BR9.9）

### (c) 取り下げる — `withdrawSwap`（`UpdateItem` 1 回）

申し出の `UpdateItem`: `SET #status = 'withdrawn', #updatedAt = :now`、条件は `#status = :open AND #offerId = :offerId`。条件で断られたら申し出を `GetItem` で読み、`OFFER_GONE`・`OFFER_ALREADY_ACCEPTED` を言い分けます。

## 先着の 1 人だけ（NFR2.55）

- 2 人が同時に押しても、申し出の条件（`status` が `open` かつ `offerId` が同じ）が片方だけを通します。成立するのは 1 人で、担当の `version` は 1 だけ増えます
- 負けた側は取引が断られ、担当・申し出・月の状態を読み直して、`OFFER_ALREADY_ACCEPTED`（先に引き受けられた）か `OFFER_GONE`（その間に取り下げ・自動でなくなった）を受け取ります
- 同じ子供が 2 回押したときは、2 回目に `OFFER_ALREADY_ACCEPTED` です。申し出た本人・管理者は取引に進まず `CANNOT_ACCEPT_OWN_OFFER` です

筋書き（`Promise.all` で動かす差し替え）にするのは次の 4 通りです。最終の状態が 1 つに決まること（担当の持ち主が 1 人、申し出の状態が 1 つ、`version` の増えが 1 回）を確かめます。

1. 別々の 2 人の子供が同時に引き受ける
2. 同じ子供が 2 回続けて引き受ける
3. 引き受けと取り下げが同時
4. 引き受けと管理者による担当の子供の変更が同時

ステージングの「ほぼ同時に押す」確認は、人の指の同時性に左右されるので保証にはなりません。保証は差し替えのテストで行います。

## 断られたときの読み直し（NFR2.56）

- 取引・条件つきの書き込みが条件で断られたら、担当・申し出・月の状態を読み直して、判定の最初から評価します。やり直しは 1 回まで（最初を含めて最大 2 回。`MAX_ATTEMPTS` は U5・U6・U7 と同じ）
- 「競合」と扱うのは `ConditionalCheckFailed` と `TransactionConflict` だけです（`classifyCancellation`）。`ThrottlingError`・`ProvisionedThroughputExceeded` などは読み直さずに投げ直します
- 読み直しで分かれ方が変われば、その印（`OFFER_ALREADY_ACCEPTED`・`OFFER_GONE`・`ALREADY_OFFERED`・`MONTH_CONFIRMED`・`DUTY_NOT_TODO`・`NOT_FOUND`）を返して何も書きません。2 回続けて断られたら `INTERNAL`（LINE は「うまく申し出られませんでした。もう一度お試しください」、引き受けは「うまく引き受けられませんでした。もう一度お試しください」）にして何も書きません。読み直しをしたら `SWAP_RETRY`（info）を 1 件残します
- 筋書きにする差し込み: 取引の直前に (a) 管理者が担当の子供を変える、(b) 月の確定、(c) 別の子供が先に引き受ける、(d) 申し出の取り下げ、(e) 同じ担当への別の申し出、を入れる差し替えで、期待の印になること。2 回続けて断らせたとき `INTERNAL` になり 3 回目の書き込みがないこと。`ThrottlingError` の差し替えで読み直しをせず投げ直すこと

## 申し出が有効かの判断はフックに頼らない（NFR2.57）

有効 ＝ 次の 5 つがすべて成り立つ（BR9.8）。**読んだときの担当・月の状態・申し出の状態だけ**から決めます。

| 条件 | 見るもの |
|------|---------|
| (a) | 申し出の `status` が `open` |
| (b) | 担当が見つかり、`version` が申し出の `dutyVersion` と同じ |
| (c) | 担当の `status` が todo で、`childUserId` が `offererUserId` |
| (d) | 担当の `date` が今日以降（日本時間） |
| (e) | 担当の月が確定していない |

- 判断のために項目を書き換えません（読むだけ）。FR7.5 の 4 つの終わり方（管理者が担当の子供を変えた、日が過ぎた、「未」でなくなった、月が確定された）は、どれもこの判断で「なくなった」になります。「担当の日が過ぎた」はイベントがないので、読んだときに今日と比べます
- 引き受け済み（`accepted`）は「引き受けられた」、`withdrawn`・`cancelled`、(a) が `open` で (b)〜(e) を満たさないものは「なくなった」として、返事を言い分けます
- 「申し出る」では、この判断で「有効でない `open`」が残っているなら上書きできます（`ALREADY_OFFERED` にならない）
- **確定の取り消しのあと**: フックが成功して `cancelled` になった申し出は戻らず、フックが失敗して `open` のまま残った申し出は (e) を満たして有効に戻ります。この差を許容し、戻す処理は足しません（BR9.11）。戻る場合も、担当の `version`・状態・日付が申し出たときのままなら、引き受けは正しく成立します
- 筋書き: フックを「登録しない・投げる・遅らせる」の 3 通りのそれぞれで、4 つの終わり方と (b)〜(e) の各条件を 1 つずつ外した状態で、`acceptSwap` が `OFFER_GONE` を返し、`offerSwap` が古い `open` を上書きできること。時計の差し替えで、担当の日が今日（有効）と昨日（なくなった）になる境（日本時間の 23:59:59.999 と 0:00:00.000）を確かめます

## フックの設計（NFR2.58、NFR2.59）

### 掃除の中身（ADR-U8-02 の続き）

```ts
/** 申し出の項目があって open のときだけ cancelled にする。項目がなければ作らない（NFR4.81） */
async function closeOffer(familyId: string, dutyId: string, via: string, now: Date): Promise<void> {
  try {
    await updateSwapOffer({ familyId, sk: `SWAP#${dutyId}`, set: { status: 'cancelled', updatedAt: now.toISOString() }, ifStatus: 'open' });
    logger.info({ event: 'SWAP_OFFER_CLOSED', familyId, dutyId, via }); // 実際に閉じたときだけ
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error; // 項目がない・open でない: 何もしない
  }
}
```

- 条件で断られたとき（項目がない、`open` でない）は何もせず、`ConditionalCheckFailedException` だけを握りつぶします（警告を出さない。申し出のない担当の方がほとんどなので）。ほかの例外は呼び出し側（`notifyDutyReassigned`・`notifyDutyRecorded`）に投げ、保存・記録・確定の結果は変えずに警告（`DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED`。`dutyId`・`kind` だけ）を残します
- `via` は `child-changed`・`deleted`・`status-changed`・`recorded` です

### 登録（`registerSwapHooks`）

| 起動の枠 | 登録するもの | 理由 |
|---------|------------|------|
| `api`（`entries/api.ts` の composition root） | `onDutyReassigned`（`child-changed`・`deleted`・`status-changed` のどれでも `closeOffer`）と `onDutyRecorded`（`recorded`） | 担当の子供の変更・割り当ての保存・状態の変更・月の確定・画面からの記録は `api` で起きる |
| `line`（`entries/line.ts` の起動の枠） | `onDutyRecorded` **だけ** | LINE からの記録（U6）は `line` で起きる。`line` に担当の子供を変える書き込みはない |

- `registerSwapHooks` は、Lambda の実行環境ごとに**1 回だけ**呼びます。モジュールの先頭のフラグ（`registered`）で二重の登録を防ぎます（`hooks` の配列は追加するだけなので、2 回呼ぶとフックが 2 回動くため）。`api` では 2 種類を、`line` では `onDutyRecorded` だけを登録する引数を取る形にします
- 登録を 2 回呼んでも、1 つのイベントでフックが 1 回しか動かないことを、書き込みの回数で確かめます。`line` の枠を読み込んだあと `onDutyReassigned` に登録がないこと、`api` の枠で両方に登録があることも確かめます
- 取引をやり直した 1 つの変更について、フックは**1 回だけ**呼びます（U5 の NFR2.39・U6 の NFR2.35・U7 の NFR2.50 の引き継ぎ）。`acceptSwap` が成功したときは 1 回も呼ばれません

### 月の確定のときの掃除（NFR2.59）

- 確定の書き込みが済んだあとに、「未」の担当の一覧を読む `loadMonth` が失敗したときは、成功のまま返し、警告（`CONFIRM_POST_READ_FAILED`。既存）を残します
- 一覧の読み取りが成功しても、300 件のうち一部のフックが失敗したら、残りは続け、失敗は 1 件ずつ警告で残します（並行数 4 の `mapWithConcurrency`。`performance-design.md`）
- 掃除されずに `open` のまま残った申し出は、月が確定されたので (e) を満たさず「なくなった」と読まれます。フックの数は確定の時点で「未」だった担当の数を超えません
- 段階 2 の締め切りで打ち切った場合も同じ扱いです（`DUTY_HOOKS_TRUNCATED` に件数だけ残す）
- 筋書き（300 件）: (a) 10 件目のフックが投げる、(b) 一覧の読み取りが失敗する、(c) すべてのフックが投げる、の各差し替えで、確定が成功のまま返ること、残りのフックが続くこと、残った `open` の申し出が `acceptSwap` で `OFFER_GONE` になること

## LINE の失敗の分け方（NFR2.60、NFR2.61、NFR2.62）

| 場合 | 扱い |
|------|------|
| (a) 取引の読み直しが 2 回続けて断られた（`INTERNAL`） | そのグループに「うまく申し出られませんでした。もう一度お試しください」（引き受けは「うまく引き受けられませんでした。もう一度お試しください」）と reply し、イベントは処理済みにして 200 を返す |
| (b) 思いがけない例外（DynamoDB に接続できない、`ThrottlingError` など） | U1 の NFR2.2 のとおり「処理中」の記録を消して 500 を返し、LINE に送り直してもらう。このとき reply トークンは使わない。送り直しても、書き込みは下の (c) 以降で二重にならない |
| (c) 書けたあとに reply が送れなかった（トークンの期限切れ、LINE の障害） | 書いた結果は取り消さず、警告（`LINE_REPLY_FAILED`）だけ残して、イベントは処理済みにする。500 にしない |
| (d) 書き込みの後に投げる処理 | **置かない**（BR9.14）。返事の組み立てに必要な読み取り（名前、種類の名前）は、書き込みの前に済ませるか、失敗しても言い換えの値（「だれか」「お手伝い」）で続ける。書いたあとの例外で 500 にして再送されると、書けた結果の返事が出なくなるのを避けるため |

- 書き込みに必要な読み取り（`findDuty`、申し出の `GetItem`、利用者の記録）が例外で読めなければ、書き込みに進まず (b) です。読み取りが成功して見つからないとき（担当なし、申し出なし）は、`NOT_FOUND`・`OFFER_GONE` の印で返し、書きません。種類が見つからないときは、返事の名前を「お手伝い」と言い換えるだけで書き込みは止めません
- LINE の API が止まっていても、申し出・引き受け・取り下げの保存はできます（返事を送れないだけ）。申し出の経路は LINE への問い合わせ（プロフィールの取得）に頼りません
- 同じ操作が重なっても二重に動きません。(i) 同じ LINE のイベントの再送は、U1 の二度処理しない記録で止まります（BR2.7）。(ii) 別のイベントの二重押しは、申し出る → `ALREADY_OFFERED`、引き受ける → `OFFER_ALREADY_ACCEPTED`、やめる → `OFFER_GONE` で、何も書きません。(iii) 書き込みの成功の後で処理が止まって再送された同じイベントは、読み直して現在の状態から判定します（申し出る → `ALREADY_OFFERED`、引き受ける → `OFFER_ALREADY_ACCEPTED`、やめる → `OFFER_GONE`）。(d) により、これは DynamoDB の障害のような稀な場合だけです
- 筋書き: 上の (a)(b)(c) それぞれを起こす差し替えで、返事の有無、ステータス（200、500）、イベントの記録（処理済み、消える）、書き込みの有無が表のとおりであること。(d) は、返事の組み立て用の読み取りを書き込みのあとで失敗させる差し替えで、書いた結果が残り、言い換えの値で返事が出て、200 であること。(iii) は `markDone` を失敗させる差し替えで再送したとき、書き込みが二重にならず決まった返事になること

## データ（NFR6.9）

- 申し出の項目と、引き受けで変わった担当の `childUserId`・`origin` は、アプリの操作でだけ変わります。U8 は本番のデータを書き換えるスクリプト、一括の修正の手順、申し出の項目を直接消す入口を作りません
- 間違いや想定外の状態は、アプリの操作で直せます。(a) 間違った申し出は、申し出た本人が取り下げる、または管理者が担当の子供を変える（U5。フックまたは BR9.8 で申し出が「なくなった」になる）、(b) 引き受けた担当を取り消したいときは、引き受けた子供が申し出し直す（BR9.12）、または管理者が担当の子供を変える（U5 の画面）、(c) 開いたまま残った古い申し出は、BR9.8 の判断で無害（読んだときに「なくなった」）、(d) 確定した月の申し出は、確定の取り消し（U7）のあとに有効に戻り得るが、これは BR9.11 が許容した差。元に戻すボタンは置きません
- `Calendar` は本番で `RemovalPolicy.RETAIN`（U5 の NFR6.6）。測定用のデータもアプリの画面と LINE の操作で作ります（NFR7.48）。CDK のテストで `Calendar` が `RETAIN` であることを確かめます

## 日本時間（NFR11.8、NFR11.9）

- 要求の入口で「今」を 1 回だけ取ります。`line` は Webhook の入口で `new Date()` を 1 回取り、その要求の全イベントで共有します。`api` は `now` です。これを (a) 今日の日付と月、(b) 担当の日付との比べ（今日以降か）、(c) 申し出の `createdAt`・`updatedAt`・`acceptedAt` と担当の `updatedAt` に使います。LINE のイベントの `timestamp`、画面や端末の時計は使いません
- `createdAt` などは UTC で保存し、返事の日付（「1月8日」）だけ日本時間で表します。日付の計算は U5 の `packages/shared` の日本時間の関数を使います（NFR8.10）
- 境のテスト（時計の差し替え）: (a) 23:59:59.999（UTC 14:59:59.999）に「家事交代」と送ると今日の担当が出て、0:00:00.000 に送ると翌日が「今日」で昨日の担当は出ない、(b) 23:59 に出した一覧のボタンを 0:00 を過ぎて押すと昨日の担当は `DUTY_NOT_TODO`、(c) 1 月 31 日と 2 月 1 日・12 月 31 日と翌年 1 月 1 日・うるう年の 2 月 29 日で一覧の対象の月（今日の月と次の月）が正しい、(d) 12 月 31 日 23:59 には来月（1 月）の担当が一覧に出て、1 月 1 日 0:00 からは 1 月と 2 月が対象になる、(e) 今月が確定していて来月が確定していないときは来月の担当だけを出す。今月も来月も候補がなく今日の月が確定しているときは `MONTH_CONFIRMED`

## 残る危険（承認の場で人が決めること）

「担当を選ぶ」の書き込みが成功したのに reply が失敗すると（上の (c)）、申し出の項目は `open` で残りますが、グループには「引き受ける」「申し出をやめる」のボタンが出ていません。同じ担当をもう一度選ぶと `ALREADY_OFFERED`（文だけでボタンなし）になり、ボタンを再び出す手段がありません。申し出た本人は、その日が過ぎるか管理者が担当を変えるまで取り下げられず、ほかの子供も引き受けられません。害は「その担当で代わってもらえない」だけで、データは壊れません（BR9.8）。reply の失敗自体が稀（トークンの期限切れ、LINE の障害）なので、U8 では**この設計に入れません**。

承認の場で人が決めること: (1) このまま許容する（現状の扱い）、(2) 申し出た本人に `ALREADY_OFFERED` を返すときだけ「引き受ける」「申し出をやめる」のボタンを添える（機能設計 BR9.7・BR9.8 付近の変更。NFR の追加ではなく機能設計の変更として扱い、`docs/contract-changes-u8.md` にも残す）。決めた内容（(1) か (2) か、日付）は、この項目と機能設計の `rules.md` に書き戻します。このステージでは決めません。

レビュー（R-04）の推奨: (2)（申し出た本人への `ALREADY_OFFERED` のときだけボタンを添える）。小さな変更で救済になるため。ただし機能設計の変更になるので、決めるのは承認の場の人です。

## Sources

- `construction/u8-swap/nfr-requirements/reliability-requirements.md`（NFR2.54〜NFR2.62、NFR6.9、NFR11.8、NFR11.9）、`security-requirements.md`（NFR4.79〜NFR4.82）、`performance-requirements.md`（NFR7.46）、`observability-requirements.md`（NFR2.64）
- `construction/u8-swap/functional-design/rules.md`（BR9.7〜BR9.15）、`functional-spec.md`（F2〜F5、申し出の状態、担当の変わり方）、`entities.md`（SwapOffer、不変条件）
- `construction/u7-review-confirm/nfr-design/reliability-design.md`（形の手本、フックの引き継ぎ）
- 既存コード（読むだけ）: `services/dutyReassignedHook.ts`、`services/dutyRecordedHook.ts`、`services/calendarService.ts`（`confirmMonth`、`MAX_CHANGE_ATTEMPTS`）、`repositories/calendarRepository.ts`（`classifyCancellation`、`writeTransaction`、`buildMonthGuard`）、`entries/line.ts`

## Assumptions & Open Questions

- [assumption] **「担当を選ぶ」の reply 失敗の残る危険**は、上の節のとおりです。(1) 許容か (2) ボタンを添えるかを承認の場で人が決め、決めた内容をこの項目と `rules.md` に書き戻します。決める前に次の段階へ進めません
- [assumption] 同じ子供が 2 回「引き受ける」を押したときの 2 回目は、機能設計（BR9.9）どおり `OFFER_ALREADY_ACCEPTED`（引き受けた本人にも同じ文）です。文言の決めは変えません
- [assumption] 「ほぼ同時に押す」ステージングの手の確認は保証にならず、保証は差し替えのテストで行います（U6 の NFR2.35 と同じ考え）
- [assumption] `registerSwapHooks` の二重登録の防止は、実行環境ごとのモジュールのフラグで足ります（Lambda の実行環境ではモジュールが 1 回だけ読み込まれる）。テストでフラグをリセットする口をテスト用に用意します（`resetDutyReassignedHooks` と同じ考え）
- [assumption] `UpdateItem` の条件 `attribute_not_exists(#sk) OR …` は、項目がないとき真になる前提です。コード生成の単体テストと、可能なら DynamoDB の動きを再現する差し替えで確かめます
- [assumption] 確定の取り消しのあとに申し出が戻る差（NFR2.57）は、機能設計が許容したものを引き継ぎます
