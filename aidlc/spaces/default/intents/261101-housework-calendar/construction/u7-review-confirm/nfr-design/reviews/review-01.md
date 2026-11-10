## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T13:20:00Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/nfr-design/reliability-design.md > 「onDutyReassigned フック」 | `month-confirmed`（月の確定）で渡す「代わりにやる」の取り下げの手がかりの形が決まっていない。既存の仕組み（`dutyReassignedHook.ts`）の 1 件分は、`dutyId`・`date`・`choreTypeId`・`fromChildUserId` が必ず要る「1 つの担当」の形だが、月の確定は特定の担当に結びつかない（どの担当の `dutyId`・`date`・`fromChildUserId` を入れるかが決まらない）。設計は「月に関わる担当ごとに呼ぶか、`month` を足して U8 が引くか」をコード生成に委ねており、`fromChildUserId` を省略できる形にする前提も書いている。U8 までは登録がなく動きに影響しないが、渡す形が未確定のまま残る | `month-confirmed` のときに渡す中身（担当ごとに複数回呼ぶのか、`month` を 1 つ渡すのか）と、`fromChildUserId` などを省略する形を、設計の時点で 1 つに決めておく。既存の「1 つの担当」の形を崩さずに月をまたぐ事実をどう表すかを明記する | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/nfr-design/reliability-design.md > 「onDutyReassigned フック」および同項の抜粋 | フックを呼ぶところを一貫して「`onDutyReassigned` を呼ぶ」と書いているが、既存コードでは `onDutyReassigned` は関数を**登録する**口で、呼ぶ（実行する）のは `notifyDutyReassigned(events)`（担当の一覧をまとめて渡す）。読み手が「登録」と「呼び出し」を取り違えやすい | 「登録する口（`onDutyReassigned`）」と「書けたあとに呼ぶ処理（`notifyDutyReassigned`）」を言葉で分けて書く。U5 の `changeDutyChild` と同じく、成功のあとに一覧を 1 回渡す形であることを明記する | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/nfr-design/observability-design.md > 「U7 のできごとのログ」 | 取引が競合で断られたときに既存の `writeTransaction`／`classifyCancellation` が必ず出す `CALENDAR_TRANSACTION_CANCELED`（warn。断られた Code の一覧）が、ログのできごとの一覧に入っていない。U7 の状態の変更でも競合のたびに出るが、設計の表に無いため、`DUTY_STATUS_RETRY`（info）との役割の違いや warn が出ることが読み取れない | 既存の `CALENDAR_TRANSACTION_CANCELED`（warn）を U7 のログの一覧に加えるか、U7 では `DUTY_STATUS_RETRY`（info）に寄せる（既存の warn を出さない）のかを明記する。「競合は想定内で warn を増やさない」という設計の狙いと既存の warn の関係をそろえる | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| （ステージ定義に自動の検証ツールの指定なし。手で照合） | — | `traceability.json` の `upstream_ids`（NFR1.30・1.31、2.44〜2.53、3.11〜3.13、4.65〜4.73、5.13、6.8、7.33〜7.38、8.13、9.8、10.8、11.7）が 6 つの `nfr-requirements/*.md` の ID と 1:1 で一致。`coverage` はすべて `OK` で具体的な設計（ファイルと節）を指す。GAP・ORPHAN なし |
| 既存コードとの照合（`app-stack.ts`） | PASS | `api` の `Calendar`・`ChoreTypes` は 6 操作ずつ（`GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`）、環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` ともにあり。`line` の権限も設計が列挙した一覧と一致。「U7 は追加なし」の主張は妥当 |
| 既存コードとの照合（取引・冪等） | PASS | `buildMonthGuard`（`attribute_not_exists(#confirmed) OR #confirmed = :false`）、`buildUnitPriceGuard`、`buildRecordItems`（条件に `#childUserId = :by` を含む）、`findDuty`（GetItem 3 回）、`classifyCancellation`（`ConditionalCheckFailed`・`TransactionConflict` だけ）、`writeTransaction` を確認。設計の取引の形・読み直し・markDone の差分（`#childUserId` を条件から外す・`:from` に `skipped` も）と整合 |
| 既存コードとの照合（呼び出し回数 NFR7.35） | PASS | `requireAuth` は `getUserStatus` 1 回、`requireMembership`・`requireAdmin` は DynamoDB を読まない、`findDuty` は 3 回を確認。markDone 6（利用者1+探索3+単価1+取引1）、ほか 5、確定・取り消し 2（利用者1+書き込み1）が成り立つ。performance・scalability・reliability の 3 文書で数が一致 |
| 設計段階の制約（コード 15 行以下） | PASS | security・reliability の抜粋はいずれも 15 行以内。完成実装ではなく式・型の抜粋にとどまる |

### Summary

全 NFRx.y がトレーサビリティに入り、具体的な設計へ対応している。状態変更の取引（担当の条件つき Update ＋ 月の ConditionCheck ＋ markDone の単価 ConditionCheck）、断られたときの競合だけ 1 回の読み直し（それ以外 500）、記録 3 項目の同時書き/同時クリア、確定・取り消しの version を条件にしない冪等（行が無い月は `attribute_not_exists` の Put で version=1、競合時のみ Update へ）、確かめの順番と権限、呼び出し回数、ログの伏せ字・費用 0 円は、上流要件・U5/U6・既存コードと整合し、実装可能。残る指摘は `onDutyReassigned` の `month-confirmed` の渡し方・呼び出しと登録の呼び分け・既存の `CALENDAR_TRANSACTION_CANCELED` ログの扱いの明確化で、いずれも Minor。Critical・Major なし。
