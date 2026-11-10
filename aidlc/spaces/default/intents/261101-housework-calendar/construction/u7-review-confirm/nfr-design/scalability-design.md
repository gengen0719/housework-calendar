# 量と費用の設計（Scalability Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）の量と費用の要件（NFR1.30、NFR1.31、NFR3.11〜NFR3.13）を、どう作るかを書きます。U1〜U6 の設計（オンデマンドの DynamoDB、`Calendar` の 1 テーブルの作り、強い整合性の読み取り、`api` の Lambda、同時実行の上限）をそのまま使います。U7 は**新しいテーブル・索引・Lambda・指標・アラームを足しません**（NFR1.31）。U7 は画面用 API だけで LINE を呼ばないので、公式アカウントの無料のメッセージ数（月 200 通。NFR1）には 1 通も関わりません（NFR1.30）。費用 0 円（NFR1）を、新しい課金対象を足さないことと、LINE を使わないことで守ります。

## LINE を呼ばない（NFR1.30）

- U7 は LINE を 1 通も呼ばない。状態の変更・確定・取り消しは画面用 API で、`reply`・`push`・`multicast`・`broadcast` を使わない。公式アカウントの無料のメッセージ数（月 200 通。返事ではないお知らせは月 128 通の枠。NFR1）に、U7 の操作は 1 通も足さない
- 申し出の自動の取り下げ（BR8.15）も、U7 は `onDutyReassigned` を呼ぶ口を用意するだけで、U8 まで登録がなく、何も送らない（`reliability-design.md`）
- 確かめ方: 単体テストで、U7 のコード（状態の変更・確定・取り消しのサービスとハンドラー）が `fetch`（LINE の API）を 1 回も呼ばないこと。`onDutyReassigned` の登録がないとき、呼んでも何も起きないこと

## テーブルの形と項目（NFR1.31、NFR3.12）

- 保存先は U5 の `Calendar`（キー: `familyId` + `sk`、索引なし）と U4 の `ChoreTypes` の既存の項目だけを使う。U7 は `ChoreTypes` を**読むだけ**（markDone のとき単価を読み、取引で確かめる）で書かない
- U7 が書くのは次の 2 つの項目だけで、新しい項目や保存先を増やさない:
  - **日ごとの担当**（`M#<month>#D#<date>#<choreTypeId>`）: U6 までの `status`・`recordedAt`・`recordedBy`・`unitPrice`・`updatedAt`・`version` を書き換えるだけ。属性を足さない。「未」「×」に戻すときは `recordedAt`・`recordedBy`・`unitPrice` を `REMOVE` で消す（項目が増えない。BR8.5）
  - **月の状態**（`M#<month>#S`）: `confirmed` は U5 のまま。U7 が足すのは `confirmedAt`・`confirmedByUserId`・`version` の 3 属性だけ（1 家族・1 月に 1 件）。取り消しのときは `confirmedAt`・`confirmedByUserId` を `REMOVE`
- 月の状態への属性の追加は壊す変更にならない（U5・U6 は `confirmed` だけを読む。`docs/contract-changes-u7.md` に残す。`functional-spec.md`）
- 1 家族・1 月に 1 件なので、保存する量は増えない（量に数えるほどではない）。1 年分の月の状態は 12 件、担当は書き換えるだけなので件数は増えない
- 確かめ方（NFR3.12）: 単体テストで、状態の変更の更新式が機能設計の項目だけを書く（書く/消す）こと。月の状態の書き込みが `confirmed`・`confirmedAt`・`confirmedByUserId`・`version` だけを扱うこと。毎月の請求を作り手が見る（NFR1.5）

## 読み方と呼び出しの回数（NFR3.11）

読み取りはすべて、家族のキー（`familyId = ctx.familyId`）で、強い整合性（`ConsistentRead: true`）にする。Scan・BatchGetItem・BatchWriteItem は使わない。

| 読み取り | 呼び出し | 使う場面 |
|---------|---------|---------|
| 利用者 | `requireAuth` の `getUserStatus`（利用者の記録を 1 回。`familyId`・`role`・`friendStatus` をそこから取る） | 3 つの入口すべて |
| 担当の探索 | `DID#<dutyId>` の GetItem → 担当と月の状態の GetItem 2 回（同時）。既存の `findDuty`。GetItem 3 回 | 状態の変更 |
| 単価 | `ChoreTypes` の GetItem 1 回（`getCurrentUnitPrice`） | markDone の書く直前 |

取引の項目数と呼び出しの回数は、担当の数・種類の数・家族の人数では増えない（NFR7.35）。

| 操作 | 取引の項目 | DynamoDB の呼び出し（通常） | 読み直し込みの最大 |
|------|-----------|---------------------------|-------------------|
| 状態の変更 markDone | 3（担当の `UpdateItem` ＋ 月の `ConditionCheck` ＋ 単価の `ConditionCheck`） | 6（利用者 1 + 探索 3 + 単価 1 + 取引 1） | 11（読み直しで探索 3 + 単価 1 + 取引 1） |
| 状態の変更 cancel・markSkipped・unmarkSkipped | 2（担当の `UpdateItem` ＋ 月の `ConditionCheck`） | 5（利用者 1 + 探索 3 + 取引 1） | 9（読み直しで探索 3 + 取引 1） |
| 確定・取り消し | 1（月の状態の `PutItem` または `UpdateItem`） | 2（利用者 1 + 書き込み 1） | 2（version を条件にしないので取引の読み直しがない。BR8.14） |

- 取引の上限（100 項目）に比べて 3 項目は十分小さい（NFR3.11）
- 担当の探索は家族のキーの `GetItem`（`findDuty` の 3 回）だけ、月の状態は `GetItem`（確定の有無で `PutItem`／`UpdateItem` を選ぶための条件つき書き込みに含む）。Scan 系の呼び出しをしない
- 確定の確認に出す「未」の件数（BR8.10）は画面が持っているカレンダー（`getMonthCalendar` の結果）から数えるので、U7 の API は件数のための新しい読み取りを足さない（NFR7.35、確定・取り消しは 2 回）
- 確かめ方（NFR3.11）: 単体テストで、取引の項目数が markDone で 3・ほかの状態変更で 2・確定/取り消しで 1 であること。読み取りが家族のキーつき・強い整合性で、Scan 系の呼び出しがないこと。担当 1 件・124 件のデータで呼び出し数が同じ上限であること

## 読み書きの量と費用（NFR1.31、NFR3.12）

- 量の見込み: 管理者 1 人が、1 日に多くても数回、確認・修正（状態の変更）をする。月の確定・取り消しは 1 か月に数回。1 か月に `POST /v1/duties/{dutyId}/status` が多くて数十回、`PUT`／`DELETE /v1/months/{month}/confirmation` が数回で、`api` の Lambda の無料枠（月 100 万回）のごく一部
- 書き込みユニット（取引は 2 倍で数え、ConditionCheck も 1 項目として数える）: markDone の取引は担当の Update（約 0.4 KB で 1 × 2）+ 月の ConditionCheck（1 × 2）+ 単価の ConditionCheck（1 × 2）= 6。ほかの状態変更は担当の Update（1 × 2）+ 月の ConditionCheck（1 × 2）= 4。確定・取り消しは 1 項目の書き込み（1 × 2）= 2。月に数十回の書き込みで合計は数百書き込みユニット未満
- 読み取りユニット（強い整合性の GetItem は 4 KB まで 1）: 状態の変更 1 回で利用者（索引の Query 0.5）+ 探索 3 + 単価 1（markDone）= 約 4.5。月に数十回で数百読み取りユニット未満
- DynamoDB の従量の課金は、月に数十回の書き込みの見込みで 1 円に満たず、AWS の請求額は 0 円のまま（U1〜U6 と同じ前提。オンデマンドの読み書きは無料枠の対象外なので「請求額 0 円」は端数の丸めに頼る。U5 の最初の請求の確認に含めて見る。`logical-components.md`）。U7 の増分は U5・U6 の読み書きよりずっと小さい
- ログは U1 の既存のログ（30 日。NFR2.7）に出す。指標とアラームは U10 で入れる（U10 が U7 の失敗のイベントも対象に入れる。NFR2.53）
- 確かめ方（NFR1.31）: CDK のテストで、U7 の前後に、テーブル・Lambda・ログのグループ・指標・アラームの数が変わらず、`api`・`line` の権限と環境変数が変わらないこと（NFR4.71、NFR4.72）

## Lambda と同時実行（NFR3.13）

- 処理は U1 の `api` の Lambda に足す。新しい Lambda は作らない。`api` の同時実行の上限は U1 の値（NFR1.6、NFR3.6）のまま、メモリ 256 MB、時間切れ 30 秒、ARM64 のまま。CDK のテストで、同時実行数の設定が U1 の決めた値のままであることを確かめる
- 管理者 1 人の操作なので、同時の書き込みはめったに起きない。別の端末からの二重操作や、確定↔取り消しの連打でも、書き込みは担当ごと・月ごとの項目に分かれ、取引の条件（状態の変更は `version`、確定・取り消しは目的の値にそろえる）で取り違えない（NFR4.70、BR8.14、BR8.16）。1 回のやり直しで足りる見込み
- 確かめ方（NFR3.13）: CDK のテストで `api` の同時実行数の設定が U1 の決めた値のままであること。単体テストで、競合の差し替えのときに 1 回だけ読み直し、2 回目で `INTERNAL` になること

## 上限と余裕

| 項目 | 上限・見込み | 余裕 |
|------|------------|------|
| 1 か月の操作数 | 状態の変更 数十回、確定・取り消し 数回 | Lambda の無料枠（100 万回）のごく一部 |
| 1 回の状態の変更の DynamoDB の呼び出し | markDone 通常 6・最大 11、ほか 5・9 | 上限（NFR7.35） |
| 1 回の確定・取り消しの呼び出し | 2 | 上限（NFR7.35） |
| 外への通信（HTTP） | 0 回 | LINE を呼ばない（NFR1.30） |
| 取引の項目 | markDone 3、ほか 2、確定・取り消し 1 | 100 |
| 月の状態に足す属性 | 3（`confirmedAt`・`confirmedByUserId`・`version`）× 1 家族 1 月 1 件 | 保存量は無料枠の 25 GB に比べて無視できる |

## ADR を立てない判断

量と費用の設計に独立した ADR は立てません。U7 は新しいテーブル・Lambda・課金対象を足さず、U5 の `Calendar` の既存の項目を書き換えるだけで、重要な判断（取引の形と冪等）は `reliability-design.md` の ADR-U7-01 にあります。

## Sources

- `construction/u7-review-confirm/nfr-requirements/scalability-requirements.md`（NFR1.30、NFR1.31、NFR3.11〜NFR3.13）、`performance-requirements.md`（NFR7.35）、`reliability-requirements.md`（NFR2.46）
- `construction/u7-review-confirm/functional-design/entities.md`（新しい保存先なし、月の状態に足す 3 属性、担当の書き換え）、`rules.md`（BR8.5、BR8.11、BR8.14〜BR8.16）、`functional-spec.md`（配備、U7 で作る画面用 API と LINE の操作）
- `construction/u6-recording/nfr-design/scalability-design.md`（テーブルの形、費用の計算の前提、LINE を使わない・課金対象を足さない形）
- `construction/u5-assignment-calendar/nfr-design/scalability-design.md`（テーブルの形、費用の計算の前提）
- 既存コード（読むだけ）: `repositories/calendarRepository.ts`（索引なし・強い整合性・`findDuty` の GetItem 3 回、取引の項目）、`middleware/requireAuth.ts`（`getUserStatus` の 1 回の読み取り）、`infrastructure/lib/app-stack.ts`（`api` の既存の構成、メモリ 256 MB・時間切れ 30 秒、`line` は U7 で変えない）

## Assumptions & Open Questions

- [assumption] 月の状態に足す `version` は、確定・取り消しの回数の手がかりで、書き込みの条件には使いません（確定・取り消しは目的の値にそろえる。BR8.14）。1 家族・1 月に 1 件なので量には影響しません
- [assumption] カスタム指標とアラームを U7 で足さないのは、費用 0 円と無料枠の数を守るためです。U7 の失敗をログから見つけられるようにする要件は NFR2.53（observability）にあります。U10 がこれらを作り手への知らせの対象に入れます
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は画面が持っているカレンダーから数えるので、U7 の API は件数を数えるための新しい読み取りを足しません（U5 の `getMonthCalendar` の結果を使う）
