# 信頼性の要件（Reliability）— U7 確認・修正と確定

U7（`u7-review-confirm`）の信頼性の要件です。U1〜U6 の要件（NFR2.1〜NFR2.43、NFR6.1〜NFR6.7、NFR11.1〜NFR11.6）をそのまま使います。U7 で大事なのは、状態の変更が「全部そろって」「一部だけ書かれない」ことと、確定した月の変更が各単位で確実に断られること、そして本番のデータを手で書き換えずに画面からすべて直せることです。お小遣いの元になるデータなので、金額の抜けた「済」や、記録の残った「未」を作らないことを要件にします。

## 書き込み（取引の原子性）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.44 | 状態の変更は、1 回の取引（`TransactWriteItems`）で担当の `UpdateItem`（status・version・dutyId の条件つき）と月の `ConditionCheck`（確定していない）を同時に行い、markDone はさらに単価の `ConditionCheck` を足す。取引は全部成功するか全部書かれないかのどちらかで、「一部だけ書かれた」状態はない。markDone で `status=done` のとき `recordedAt`・`recordedBy`・`unitPrice` が必ずそろい、cancel・markSkipped・unmarkSkipped で「未」「×」にするとき 3 項目が同時に空になる。どれか 1 つだけが残る/欠ける担当を作らない（BR8.5、BR8.6、U6 の NFR2.33 の不変条件と同じ）。担当を作らず、消さず、`origin` を変えない（BR8.4） | 取引を失敗させる差し替えで、担当が元の状態・`version` のまま変わらないこと。成功したあと、「済」なら 3 項目がそろい、「未」「×」なら 3 項目が空であること。markDone で単価が C7 から読んだ値のまま書き写されていること |
| NFR2.45 | 取引の条件で断られたら（担当が変わった・`version` が違う・先に確定された・単価が先に変わった）、読み直して BR8.4 の確かめ（1. 探す → 2. 月の確定 → 3. 表）を最初からやり直す。やり直しは 1 回まで（最初の 1 回を含め最大 2 回。U5 の NFR2.30・U6 の NFR2.34 と同じ `MAX_ATTEMPTS`）。やり直しても断られたら 500 `INTERNAL`（もう一度操作してもらう）で何も書かない。「競合」として扱うのは `ConditionalCheckFailed` と `TransactionConflict` だけで、ほかの Code は投げ直す（`classifyCancellation`）。読み直しで分かれ方が変われば、その印（`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`NOT_FOUND`）を返して何も書かない。markDone で単価が先に変われば、読み直して新しい単価を書き写す（FR2.2） | 取引の直前に、(a) 担当の `version` が増える、(b) 月の確定、(c) 単価の変更（markDone）、(d) 先に同じ担当を別の状態に変える、の各差し替えで期待の印になり、単価の変更のあとは新しい単価が書き写されること。2 回続けて断らせたときに 500 `INTERNAL` になり、3 回目の書き込みがないこと |
| NFR2.46 | 確定・取り消しは、目的の値にそろえる作りで、version を書き込みの条件にしない（BR8.14）。行がまだ無い月（記録のない月）への初回の確定は、行が無いことを条件（`attribute_not_exists`）にした `PutItem` で `version=1` の確定行を作り、行がある月は `UpdateItem` で `confirmed=true`・`confirmedAt`・`confirmedByUserId`・`version+1`。取り消しは、行がある月は `confirmed=false`・`confirmedAt` と `confirmedByUserId` を REMOVE・`version+1`、行がまだ無い月は行を作らず何もしない（BR8.11、BR8.12）。すでに目的の状態（確定済みを確定、未確定を取り消し）なら、何も取り違えずに同じ結果を返す。二度押し・確定↔取り消しの連打でも最後の操作の結果にそろう（BR8.16）。`attribute_not_exists` の条件が競合で断られた（同時に別の初回確定が走った）ときだけ、1 回読み直して `UpdateItem` の経路でそろえる | 確定・取り消しを 2 回ずつ、確定↔取り消しを連打する差し替えで、最後の操作の結果（確定済み／未確定）にそろうこと。行のない月への初回の確定で確定行が `version=1` で作られ、行のない月への取り消しで行が作られないこと |

## 確定した月が変えられないこと（下流への引き継ぎ）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.47 | 月を確定すると、それ以降、その月の担当・記録・状態の変更・割り当ての変更・加算・減額が、各単位の月の確かめ（`buildMonthGuard` の `ConditionCheck`）で `MONTH_CONFIRMED` に断られる（BR8.11、FR6.5）。U7 で確かめるのは、記録（U6）・取り消しなどの状態の変更（U7）・割り当ての保存と担当の子供の変更（U5）までが断られること。加算・減額が断られることは U11 の AC8.2.5 で確かめる（U7 では確かめない）。確定を取り消すと、これらがまた通るようになる（BR8.12、AC6.1.7） | 月を確定したあと、U5 の割り当ての保存・担当の子供の変更、U6 の記録、U7 の状態の変更が `MONTH_CONFIRMED` に断られる筋書き。確定を取り消したあと、同じ操作が通る筋書き |
| NFR2.48 | 確定の確かめは、操作しようとしている担当の日付の月で行う（今日の月ではない。U5・U6 の `buildMonthGuard` が担当の `month` で引く）。月をまたいだあとでも、確定していない過去の月の担当は状態を変えられる（AC6.1.8、BR8.14）。月末・年またぎ・うるう年の境でも、確定の確かめが担当の日付の月で行われる（U6 の NFR11.6 の境と同じ考え） | 時計を差し替えたテストで、2026 年 12 月を確定しないまま 2027 年 3 月になっても 12 月の担当の状態を変えられること。1 月 31 日と 2 月 1 日、12 月 31 日と翌年 1 月 1 日、うるう年の 2 月 29 日の担当の月の確かめが正しいこと |

## 失敗のときの扱い

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.49 | 思いがけない失敗（取引の読み直しが 2 回続けて断られた `INTERNAL`、DynamoDB に接続できないなどの例外）のときは、500 を返し、画面は「表示できませんでした。もう一度お試しください」と「読み込み直す」を出す（C10 の `INTERNAL` の文言。FR4.5、BR8.18）。状態の変更も確定も 1 つの取引なので、「一部だけ書かれた」状態はなく、もう一度操作すれば今の状態からやり直せる（画面は BR8.9 で今の状態のボタンを出し直す）。失敗を 15 分以内に作り手に知らせる仕組み（NFR2）は U10 で入れ、それまでは `INTERNAL` と 500 のログ（NFR2.53 の observability）で気づく | `INTERNAL`（読み直し 2 回断り）と例外の各差し替えで、500 になり、担当・月の状態が中途半端に書かれていないこと、画面に `INTERNAL` の文言が出ること |
| NFR2.50 | `onDutyReassigned`（BR8.15。状態の変更で担当が「未」でなくなったとき・月を確定したときに呼ぶ）の登録された関数が投げても、状態の変更・確定の結果は変えず、警告のログ（`DUTY_REASSIGN_HOOK_FAILED` など。`dutyId`・`kind` だけ。名前は書かない）を残す（U5 の NFR2.39・U6 の `onDutyRecorded` と同じ考え）。U8 までは登録がなく、何もしない。書き込みをやり直しても、同じ変更について 2 回呼ばない（成功したときだけ 1 回呼ぶ） | 登録した関数が投げる差し替えで、状態の変更・確定が成功のまま返り、ログが残ること。登録がないとき何も起きないこと。取引をやり直した 1 回の変更について、呼び出しが 1 回であること |

## データと時刻

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR6.8 | 本番のデータを手で書き換えない（NFR6、project.md の禁止事項）。FR6.1 の表のすべての変わり方（未→済、未→×、済→未、済→×、×→未、×→済）と、月の確定・確定の取り消しが、画面からできる（BR8.8）。間違いは、取り消す・済にする・やらなかったにする・やらなかったを外すと、確定の取り消しで直す。U7 は、本番のデータを書き換えるスクリプト・一括の修正の手順を作らない。本番のテーブルは `RemovalPolicy.RETAIN`（U5 の NFR6.6）。元に戻すボタンは置かず、もう一度操作して直す（U5・U6 と同じ） | U7 のコードに、`Calendar` の項目を直接書き換えるスクリプトがないこと。FR6.1 の 5 とおりと確定・取り消しを画面から行い、どれもデータの直接の書き換えなしで直せる筋書き（AC6.1.11）。CDK の設定で `Calendar` が `RETAIN` であること |
| NFR11.7 | 「今」と「確定した時刻」は、日本時間（`Asia/Tokyo`）を基準に扱う。裏側は、要求の入口で裏側の時計の「今」を 1 回だけ取り（`options.now`）、状態の変更の `recordedAt`（markDone のとき）・`updatedAt`、確定の `confirmedAt` に同じ「今」を使う。画面や端末の時計は使わない。`recordedAt`・`confirmedAt` は UTC で保存し、表示だけ日本時間にする。確定の確かめが担当の日付の月で行われること（NFR2.48）。日付の計算は U5 の `packages/shared` の日本時間の関数を使う（NFR8.10） | 時計を差し替えたテストで、markDone の `recordedAt` と確定の `confirmedAt` が入口の「今」であること、表示が日本時間になること。日本時間の 23:59:59.999（UTC 14:59:59.999）と 0:00:00.000（UTC 15:00:00.000）の境で、確定の確かめの対象の月が正しいこと |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR6、NFR11、FR6.1〜FR6.6、FR4.5、FR2.2、FR7.5）
- `inception/user-stories/stories.md`（AC6.1.1〜AC6.1.11）
- `inception/contract-design/contract-summary.md`（C8 `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`、C10 `INTERNAL`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.4〜BR8.6、BR8.8、BR8.11〜BR8.16、BR8.18）、`functional-spec.md`（F2〜F6、状態の変更の印と返事の対応）、`entities.md`（記録の 3 項目の不変条件、月の状態）
- `construction/u5-assignment-calendar/nfr-requirements/reliability-requirements.md`（NFR2.28〜NFR2.31、NFR6.6、NFR11.4）
- `construction/u6-recording/nfr-requirements/reliability-requirements.md`（NFR2.33〜NFR2.39、NFR6.7、NFR11.5、NFR11.6）
- 既存コード（読むだけ）: `services/calendarService.ts`（`changeDutyChild` の読み直し・`MAX_CHANGE_ATTEMPTS`・`notifyDutyReassigned`）、`repositories/calendarRepository.ts`（`findDuty`・`buildMonthGuard`・`buildUnitPriceGuard`・`classifyCancellation`・`writeTransaction`・`CHECK_DUTY_UNCHANGED`）、`infrastructure/lib/app-stack.ts`（`Calendar` の `RETAIN` は U5 のテストで確かめ済み）

## Assumptions & Open Questions

- [assumption] 確定・取り消しの version を書き込みの条件にしないのは、担当の書き換え（BR8.4）と違い「目的の値にそろえる」操作で、二度押しや連打でも最後の操作の結果にそろうためです（BR8.14）。`attribute_not_exists` の条件は、行の有無で書き方を分ける（初回確定の `PutItem`）ためだけに使い、同時の初回確定が競合したら 1 回読み直して `UpdateItem` でそろえます
- [assumption] AC6.1.6 の「加算・減額が確定済みの月で断られる」ことは U11 の AC8.2.5 で確かめます。U7 では、記録・取り消しなどの状態の変更・割り当ての変更が断られることまでを確かめます（NFR2.47）
- [assumption] 作り手への失敗の知らせ（15 分以内。NFR2）は U10 で入れます。それまでは `INTERNAL` と 500 のログ（NFR2.53 の observability）を見て気づきます
- [assumption] `onDutyReassigned` のイベントの `kind`（`status-changed`・`month-confirmed`。BR8.15）は U5 の仕組みに足す拡張で、U8 まで登録がなく何もしません。呼び出しが成功の 1 回に限られることだけを U7 で確かめます
