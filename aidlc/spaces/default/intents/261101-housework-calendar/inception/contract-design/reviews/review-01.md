## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T01:30:42Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C6〜C9 部品の窓口（C8_カレンダー、C7_お手伝いの種類、C9_お小遣い） | 家族の範囲の指定がそろっていません。`saveAssignment(familyId, ...)` や `changeDutyChild(familyId, dutyId, ...)` は家族を受け取りますが、`recordDuty(childUserId, dutyId, at)`、`changeDutyStatus(adminUserId, dutyId, ...)`、`acceptSwap(childUserId, offerId)`、`getCurrentUnitPrice(choreTypeId)`、`deleteAdjustment(adminUserId, adjustmentId)`、`addAdjustment(adminUserId, input)`（中の childUserId）は家族を受け取りません。C1 は「メンバーであること・管理者であること」だけを確かめると書いていて、「URL の dutyId・adjustmentId・childUserId がその家族のものか」を誰が確かめるかが書かれていません。このままだと、別の家族の管理者が dutyId を指定して状態を変えられる作りになりえます（FR1.7、NFR4 の「ほかの家族のメンバーからの要求が断られること」）。 | すべての窓口で、入口が `getMembership` で決めた familyId を必ず渡し、部品が「対象の担当・申し出・加算減額・子供がその家族のものか」を確かめて、違えば `NOT_FOUND`（または `NOT_FAMILY_MEMBER`）で断る、と契約に書いてください。 | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C4 messagingApi.push.idempotency | `X-Line-Retry-Key` を「お知らせの種類と日付から決まる値」としています。LINE の再試行キーは UUID の形でなければならず、同じチャネルで同じキーを使うと、宛先が違っても重複として断られる（409）と理解しています。家族を含めずに決めると、2 つ目の家族への同じ日のリマインドが届かなくなります。この点は記事の [assumption] でも「作るときに確かめる」とされています。 | キーは種類・日付・家族（お知らせ先）から作る UUID（例: UUIDv5）にすると書き、LINE の仕様（形、有効な期間、409 のときの扱い）を確かめた結果を記録してください。 | New |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > 二重に届いたとき ／ C1 `POST /months/{month}/adjustments` | 「画面からの操作も、同じ操作を 2 回送られても結果が同じになる作りにする」と書いていますが、加算・減額の記録（201 で新しく作る操作）には、二重に送られたことを見分ける手段（要求ごとの印など）がありません。ボタンを 2 回押したり、時間切れで送り直したりすると、減額が 2 件記録され、お小遣いの額がずれます。 | 新しく作る POST 操作（加算・減額、家族を作る、招待を作る）について、要求の印（例: `Idempotency-Key` ヘッダー）で同じ要求を 1 回だけ扱うか、この決まりの対象外とする理由を契約に書いてください。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C3 deduplication.store | 受け取ったイベント ID の記録の持ち主を「LINE 用の受け口」としていますが、`components.md` では LINE のトークの受け口は「自分ではデータを持たない」（entities: []）とされ、Entity Ownership の表にもこのデータがありません。 | 記録の持ち主を部品の設計とそろえ、必要なら components.md の Entity Ownership にこのデータを足す、と明記してください。 | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C3 deduplication | イベント ID を「処理の前に記録するか、処理のあとに記録するか」が決まっていません。先に記録して処理が途中で失敗すると、LINE の送り直しが捨てられて記録が失われます。あとに記録すると、同時に届いた 2 通がどちらも処理されえます（操作そのものの冪等さで守る前提なら、そう書く必要があります）。 | 記録の順番（例: 条件付きの書き込みで「処理中」を記録し、失敗したら消す）を決めて契約に書くか、機能設計の Open Questions に足してください。 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C10 messages | 理由の印のうち、`ADMIN_ONLY`、`UNAUTHENTICATED`、`NOT_FOUND`、`CHORE_TYPE_IN_USE`、`CHORE_TYPE_INACTIVE`、`ASSIGNMENT_OVERLAP`、`OVERWRITE_CONFIRMATION_REQUIRED`、`NOT_OWN_DUTY`、`INVALID_TRANSITION`、`INVALID_AMOUNT` に文言がありません。特に `CHORE_TYPE_IN_USE` は、FR2.4 の「消せず、『使わない』にするよう案内される」という決まった振る舞いがあります。 | 足りない印の文言を足すか、値を入れる文言として機能設計で足すものを印ごとに挙げてください。 | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/contract-design/contract-summary.md > C8_カレンダー acceptSwap / withdrawSwap | ほかの担当を変える操作には `MONTH_CONFIRMED` がありますが、引き受け（担当の子供が変わる）と取り下げにはありません。確定すると申し出がなくなる決まり（unit-of-work-dependency.md の U8 の頼り先の説明）で `OFFER_GONE` になる前提だと読めますが、その決まりも、確定を取り消したときに申し出が戻るかも、契約に書かれていません（FR6.5）。 | 確定と申し出の関係（確定で申し出がなくなる、取り消しで戻らないなど）を C8 に書くか、`MONTH_CONFIRMED` を足してください。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| なし | ステージの定義に検証ツールの指定はありません | 目で、upstream の unit-of-work.md、unit-of-work-dependency.md、components.md、requirements.md と照らし合わせました。U1〜U11 の頼り方（輪なし）、3 つの入口、Q1〜Q9 の回答は契約に正しく反映されています。秘密の情報はリポジトリに置かない（NFR5、project.md の Forbidden）とする記述も C2、C4 にあります。 |

### Summary

契約の一覧、失敗の形、バージョンの決まり、Q1〜Q9 の反映は丁寧で、ほぼそのまま作れる形です。ただし、承認の前に考えていただきたい点が 3 つあります。部品の窓口で、対象のデータがその家族のものかを誰が確かめるかが決まっていないこと（NFR4、FR1.7）。push の再試行キーに家族が入っていないこと。加算・減額の記録が二重に送られたときに防ぐ手段がないこと。重大な指摘が 3 つあるため、判定の決まりに従って NOT-READY としていますが、この判定は助言です。
