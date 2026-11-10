## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T12:40:00Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | construction/u7-review-confirm/functional-design/functional-spec.md > F2 手順 3・4、および「U7 で作る画面用 API と LINE の操作」表の `POST /v1/duties/{dutyId}/status` | 「済にする」が成功したときに返す更新後の Duty のうち「記録した人の表示名」（recordedByName。管理者なら「お母さん」）を、どう組み立てるかが書かれていない。既存コードでは、カレンダー全体を読む経路（calendarService の buildMonthCalendar）は家族全員（管理者を含む）から名前を引くので管理者名が出るが、担当 1 件だけを返す経路（handlers/calendar/recordDuty.ts の dutyView）は「子供だけ」を引く findFamilyChild を使うため、管理者が記録した担当では表示名が空になる。設計は成功後にカレンダーを読み直す前提（BR8.9）なので画面上は正しく「お母さんが記録」と出るが、状態変更の応答そのものの表示名は空になりうる | functional-spec に、`POST /v1/duties/{dutyId}/status` の応答の Duty の recordedByName を、子供だけでなく家族のメンバー全員（管理者を含む）から引くことを 1 行明記する。または「応答の Duty の表示は使わず、必ずカレンダーを読み直して表示する」ことを明記する | New |
| R-02 | Minor | construction/u7-review-confirm/functional-design/rules.md > BR8.11 の logic「月の状態（M#<month>#S）を Update（記録がなければ Put）」 | 確定・取り消しの書き込みで、月の状態の行がまだ無い月（記録のない月）に初めて書くときの作りが「Update（記録がなければ Put）」と一言で書かれているが、既存の Calendar テーブルの書き込みはすべて取引（TransactWrite）で、同じ取引内で「あれば Update・なければ Put」を 1 項目で表せない（既存コードに該当の組み立て関数もまだない。U5 の buildMonthGuard は ConditionCheck 専用）。unconfirm の「確定していない月の取り消し」で行が無いときの挙動（何も書かないのか、false の行を作るのか）も確定していない | BR8.11・BR8.12 に、月の状態の行が無いときの初回書き込みの作り（例: version=0・attribute_not_exists を条件にした Put と、既存行への Update の出し分け、または `confirm` のときだけ Put し `unconfirm` で行が無ければ何もしないこと）を 1〜2 文で足す。実装の詳細はコード生成に委ねてよいが、「行が無い月」の分岐の意図は設計で確定させる | New |
| R-03 | Minor | construction/u7-review-confirm/functional-design/functional-spec.md >「状態の変更の印と返事の対応」表、および entities.md > Duty.status の制約（INVALID_TRANSITION の例） | 画面は BR8.9 で「今の状態からできる操作だけ」を出すため、`INVALID_TRANSITION` は「見せたあとに状態が変わった」ときに起きる、と表の注記にある。一方 BR8.2 では、action が 4 つのどれでもないときの 422 `INVALID_REQUEST` も定義しているが、この表には `INVALID_REQUEST`（422）の行があるのに、INVALID_TRANSITION と INVALID_REQUEST の切り分け（どちらが「読み直す／読み直さない」か）は読み取れるものの、両者が同時に起きうる順序（まず本文の形→次に状態の表）が functional-spec の F2 の疑似コードに現れていない | F2 の疑似コード（1〜4 のステップ）に、action の値そのものが 4 つのどれでもない場合の 422 `INVALID_REQUEST` を、探す前（または月の確定の確かめの前）のどこで弾くかを 1 行加え、BR8.2 の順（形の確かめ→表の確かめ）と一致させる | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| traceability（手で照合） | PASS | upstream_ids は AC6.1.1〜AC6.1.11 の 11 件すべて。coverage は全件 OK で、target の BR8.x（BR8.1〜BR8.12、BR8.14）はすべて rules.md に実在。reverse は BR8.13・BR8.15・BR8.16・BR8.17・BR8.18 を N/A と理由つきで説明。rules.md の BR8.1〜BR8.18 は、coverage か reverse のどちらかに必ず現れ、説明のない業務ルールの orphan はない |
| cross-reference（手で照合） | PASS | C6 requireAdmin・C7 getCurrentUnitPrice・C8 changeDutyStatus/confirmMonth/unconfirmMonth、C10 の既存の印（MONTH_CONFIRMED・INVALID_TRANSITION・ADMIN_ONLY・NOT_FOUND・NOT_FAMILY_MEMBER・INVALID_MONTH・INTERNAL・DUTY_CHANGED）は contract-summary と docs/contract-changes-u5/u6 に実在。FR6.1 の状態遷移表の 5 とおり（＋ U6 が持つ未→済）と entities.md・functional-spec の状態機械が一致 |
| state-transition（FR6.1 表との照合） | PASS | cancel 済→未、markDone 未→済・×→済、markSkipped 未→×・済→×、unmarkSkipped ×→未。表にない組は INVALID_TRANSITION。二度押しの冪等（BR8.16）と version を条件にしない確定／取り消し（BR8.14）は、FR6.5 の「いつでも確定・取り消し」と整合 |
| 既存コード・インフラとの整合（手で照合） | PASS | findDuty・buildMonthGuard・buildUnitPriceGuard・CHECK_DUTY_UNCHANGED・writeTransaction は calendarRepository.ts に実在。api.ts の経路追加（POST status、PUT/DELETE confirmation）は既存の登録の形と整合。app-stack.ts の api ロールは Calendar に GetItem/Query/UpdateItem/PutItem/DeleteItem/ConditionCheckItem、ChoreTypes に GetItem/ConditionCheckItem を既に持ち、U7 の必要を満たす（設計の「足りなければ足す」は保守的で妥当）。MonthState への項目追加（confirmedAt・confirmedByUserId・version）は U5 の MonthState（confirmed のみ）への純粋な追加で、confirmed だけを読む U5・U6 を壊さない |

### Summary

U7（u7-review-confirm）の機能設計は、受け持つ AC6.1.1〜AC6.1.11 を [Q1]〜[Q6] の答えどおりに設計しており、traceability に GAP も偽りの OK もなく、18 本の BR8.x はすべて説明されている。状態遷移・INVALID_TRANSITION・月の確定／取り消しの冪等・version を条件にしない判断・単価の書き写しの ConditionCheck・「未／×」に戻すときの 3 項目の消去（Q1）・認可（管理者だけ）・既存コードとインフラ権限との整合は、どれも検証できた。残る指摘はいずれも Minor（応答 Duty の表示名の組み立て、月の状態の初回書き込みの分岐、INVALID_REQUEST の弾く位置）で、実装で潰せる範囲であり、設計の健全性を損なわないため READY とする。
