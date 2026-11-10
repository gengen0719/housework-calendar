# U7 で足した契約の一覧

U7（`u7-review-confirm`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したものです。項目・操作・理由の印を足すのは契約の決まりで自由です。**壊す変更はありません**。月の状態への項目の追加は、`confirmed` だけを読む U5・U6 に影響しません。ただし、C8 の `changeDutyStatus` と `confirmMonth` は契約の引数 `at` を `options` に置き換えました（下の「形（変更）」）。これらを呼ぶのは U7 だけなので、ほかの単位には影響しません。`contract-summary.md` への反映を待つ一覧として、`docs/contract-changes-u1.md`〜`docs/contract-changes-u6.md` に続けて残します。

## 形（変更）— U7 だけが呼ぶ

- **C8 `changeDutyStatus(ctx, dutyId, action, options)`:** 契約の `(ctx, dutyId, action, at)` の `at` を `options` に置き換えた。`options` は `now` と `version`（見せた時点の版。数でも、数を返す関数でもよい）を持つ。
- **C8 `confirmMonth(ctx, month, options)`:** 契約の `(ctx, month, at)` の `at` を `options.now` に置き換えた。

## C1 画面用 API

- **`POST /v1/duties/{dutyId}/status`（操作・新規）:** 管理者だけ。本文は `{ "action": "cancel" | "markDone" | "markSkipped" | "unmarkSkipped", "version": integer }`（`version` は 0 以上の整数。余分な項目は捨てる）。200 は更新後の `Duty`。失敗は下の表を参照。
- **`PUT /v1/months/{month}/confirmation`（操作・新規）:** 管理者だけ。本文は読まない。200 `{}`（確定した。すでに確定済みでも 200）。
- **`DELETE /v1/months/{month}/confirmation`（操作・新規）:** 管理者だけ。本文は読まない。200 `{}`（取り消した。確定していなくても 200）。

`POST /v1/duties/{dutyId}/status` の失敗:

- 401: セッションがない（理由の印なし）
- 403 `ADMIN_ONLY`: 管理者でない（子供）。DynamoDB は読まない
- 403 `NOT_FAMILY_MEMBER`: 家族に入っていない
- 404 `NOT_FOUND`: 担当がない・ほかの家族・`dutyId` の形が違う
- 409 `MONTH_CONFIRMED`: 担当の月が確定済み
- 409 `INVALID_TRANSITION`: 表にない組（例: 「未」を取り消す）
- 422 `INVALID_REQUEST`: 本文なし・`action` が 4 つ以外・`version` が整数でない・負の数（担当を探す前に確かめる）
- 500 `INTERNAL`: 取引が 2 回続けて断られた、または予期しない例外

`PUT`・`DELETE /v1/months/{month}/confirmation` の失敗:

- 401: セッションがない
- 403 `ADMIN_ONLY` / `NOT_FAMILY_MEMBER`: 管理者でない・家族に入っていない
- 422 `INVALID_MONTH`: `month` が `YYYY-MM` の形でない（DynamoDB を読む前に確かめる）
- 500 `INTERNAL`: 予期しない例外

本文の `version` は、形（0 以上の整数）を確かめたうえで、見せた時点の版として使います。読んだ担当の版と違えば書かずに 409 `INVALID_TRANSITION`（確かめの順は 探す → 月の確定 → 版の食い違い → 表）。書き込みの条件にも見せた版（と `dutyId`、今の状態）を使います（BR8.4）。

## C8 カレンダーの窓口

- **`changeDutyStatus`（窓口・新規）:** 結果は `Duty` / `NOT_FOUND` / `MONTH_CONFIRMED` / `INVALID_TRANSITION` / `INTERNAL`。流れは、担当を探す → 月の確定 → 表の判定（`judgeTransition`）→ markDone は単価を読む → 取引を書く。取引は担当の `UpdateItem` ＋ 月の状態の `ConditionCheck`（markDone はさらに単価の `ConditionCheck`）。断られたら 1 回だけ読み直してやり直す。
  - 表: `cancel` は 済→未、`markDone` は 未・×→済、`markSkipped` は 未・済→×、`unmarkSkipped` は ×→未。
  - 「未」「×」に戻すときは、`recordedAt`・`recordedBy`・`unitPrice` を 3 つ同時に消す。`markDone` は 3 つをそろえて書く（記録者は操作した管理者）。
- **`confirmMonth`（窓口・新規）:** 月の状態を `confirmed=true`・`confirmedAt`・`confirmedByUserId` にする。行がある月は Update で `version+1`、行がまだ無い月は `attribute_not_exists` 条件つきの Put で `version=1` の確定行を作る。すでに確定済みでも同じ結果。`version` を条件にしない（BR8.14）。
- **`unconfirmMonth`（窓口・新規）:** `confirmed=false` にし、`confirmedAt`・`confirmedByUserId` を消し、`version+1`。行がまだ無い月は行を作らず何もしない。確定していなくても同じ結果。
- **`onDutyReassigned`（イベントの種類を追加）:** U5 の仕組みに `kind: 'status-changed'` **だけ**を足した。`'month-confirmed'` という月単位の種類は作らない。`changeDutyStatus` は、担当が「未」でなくなったとき（`markDone`・`markSkipped`）に 1 件、`confirmMonth` は確定の時点で「未」だった担当ごとに 1 件を、`notifyDutyReassigned(events)` で 1 回呼ぶ。`cancel`・`unmarkSkipped`（「未」に戻る）と `unconfirmMonth` は呼ばない。イベントの形（`dutyId`・`date`・`choreTypeId`・`fromChildUserId` が必須）は崩さない。関数が投げても結果は変えず、`DUTY_HOOK_FAILED`（警告）に `dutyId` と `kind` だけを残す。U8 が申し出の取り下げに使う（U8 まではなにもしない）。

## C1 月の状態（`MonthCalendar` の元になる項目）

月の状態（`M#<month>#S`）に `confirmedByUserId`（確定した管理者）と `version`（確定・取り消しの回数の手がかり）を足した。`confirmedAt` は U5 の型にあったものを U7 が書く。`confirmed` と `MonthCalendar.confirmed` の意味は変えない。行がない月は「確定していない」のまま。

## C10 理由の印と文言

理由の印は新しく足さない。画面が使う文言（理由の印ではない）を `packages/shared/src/messages.ts` に足した。

- 状態の変更の確認: 「{月}/{日} {お手伝い} {子供} を『済』にします」（済にする）、「{月}/{日} {お手伝い} {子供}: {前} → {後} に戻します」（「未」に戻す）、「…: {前} → {後} にします」（「×」にする）
- 注意: 「お小遣いの回数から外れます」（取り消し・済→×）、「{単価} 円で数えます」（済にする）
- ボタン: 「はい」「やめる」「読み込み直す」
- 確定の確認: 「{月}を確定しますか？ 確定すると変更できなくなります」。未の担当があれば「。未の担当が {N} 件あります。確定すると、これらは記録もやらなかったにもできなくなります」を添える
- 確定の取り消しの確認: 「{月}の確定を取り消しますか？ 取り消すと、また変更できるようになります」

既存の印と文言 `MONTH_CONFIRMED`・`INVALID_TRANSITION`・`ADMIN_ONLY`・`NOT_FOUND`・`NOT_FAMILY_MEMBER`・`INVALID_MONTH`・`INVALID_REQUEST`・`INTERNAL` は、そのまま使う。

## 共有の型（`packages/shared`）

- `StatusChangeAction`: `'cancel' | 'markDone' | 'markSkipped' | 'unmarkSkipped'`
- `StatusChangeRequest`: `POST …/status` の本文。`{ action, version }`
- `StatusChangeResponse`: 更新後の担当。U5 の既存の `Duty` 型
- `StatusChangePreview`・`MonthConfirmPreview`: 画面が確認に出す中身（保存しない）
- `statusChangePreviewLine`・`monthConfirmPreviewText`・`unitPriceCountNote`: 確認の文言を作る関数

## データとログ（決めごと）

- DynamoDB: U7 はテーブル・索引を足さない（`Calendar` は U5、`ChoreTypes` は U4 で作済み）。
- 環境変数・IAM: **変えない**（`api` は U4・U5 で足した `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` と、`Calendar`・`ChoreTypes` への 6 操作で足りる）。`line` も変えない（U7 は LINE の経路を持たない）。`infrastructure/lib/` に差分はなく、`infrastructure/test/u7-review-confirm/stacks.test.ts` が前後で同じことを固定する。
- ログ: `DUTY_STATUS_CHANGED`（状態を変えた）、`DUTY_STATUS_REJECTED`（断った。理由つき）、`DUTY_STATUS_RETRY`（取引を読み直してやり直した）、`MONTH_CONFIRMED_SET`（確定・取り消しをした）。`DUTY_HOOK_FAILED` に `kind` を足した。名前・単価は出さない。

## U8〜U11 への引き継ぎ

- **U8（代わりにやる）:** `onDutyReassigned` に `kind: 'status-changed'`（担当が「未」でなくなった）が届く。そのときにその担当の申し出を取り下げる。月の確定は担当ごとの 1 件に展開されて届く。
- **U9（お小遣い）:** 「済」の担当の `unitPrice` を種類ごとに足して額を出す。取り消し・やらなかったで「済」でなくなった担当は `unitPrice` が空になり、数から外れる。確定済みかは月の状態で見る。
- **U10（お知らせ）:** 16 時のリマインドは確定している月には送らず、確定を取り消した月にはまた送る。月末のまとめは確定の有無によらず送る。
- **U11（加算・減額）:** 確定している月の加算・減額を、月の確かめ（`buildMonthGuard`）で `MONTH_CONFIRMED` に断る（AC8.2.5）。

## 要件への反映を待つもの

- **状態の変更と月の確定の要件**（要件の番号は、反映のときに合わせる）: `POST /v1/duties/{dutyId}/status` の本文と応答、`PUT`・`DELETE /v1/months/{month}/confirmation`、状態の変更の表（FR6.1）、取引の条件（担当の ID・版・今の状態、月が確定していないこと）、確定と取り消しの冪等の決まりを、要件の書き方に合わせて足す。
