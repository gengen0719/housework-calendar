## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/reliability-design.md > 画面 S5 の月の移動（ADR-U9-06）> `issue` / `go` の形の目安 | 月の移動の形の目安では、`go()` が `seq` を進めません。`seq` を進めるのは `issue()` だけです。そのため、月 A の要求が飛んでいる間に [>] を押して `target=B`・`loading`・250 ms のタイマーにした後、タイマーが鳴る前に A の答えが届くと、その答えは最新の連番として描かれます。このとき `target.current = value.month` が B を A で上書きします。結果は 3 つです。(1) 利用者が押した B が失われる。(2) 画面は B に進まず A の `ready` に戻る。(3) タイマーが鳴ると `inFlight` が空なので、A をもう一度要求する。これは「押すたびに目標の月だけを更新し、最新の目標の月だけを要求する」（NFR2.72 の (b)）と、「要求が増えない」（NFR1.38、NFR7.53）に反します。表の「2 月の要求が飛んでいる間に 3 月へ移す」は、250 ms のうちに 2 月の答えが届く場合を扱っていません。同じ表の「[>] [<] で 2 月に戻る」の行も、この上書きの影響を受けます。 | 答えを描く条件を、連番が最新であることに加えて「待っている押しがない」ことにします。具体的には、`go()` で連番も進めて、押した時点より前の要求の答えを捨てます。あるいは、`target.current` を答えの `month` で上書きせず、最初の答えのときだけ置き換えます。そのうえで、同じ月への「重ねて出さない」規則と矛盾しないように表の場面を引き直し、「飛んでいる間に押す → タイマーの前に答えが届く」場面を S32 の画面のテストに加えます。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/logical-components.md > 足す・変える部品 `handlers/allowances/getAllowances.ts`（security-design.md の同ハンドラーの形の目安も同様） | 入口が `{ status: 200, body, headers: NO_STORE_HEADERS }`（`RouteResult`）を返す設計です。しかし実コードの `RouteResult` は `entries/api.ts` の中の `export` していない `interface` です。既存のハンドラー（`getCalendar` など）は本文だけを返し、振り分け表の側で `{ status, body }` に包んでいます。ハンドラーが `RouteResult` を使うには `entries/api.ts` を import する必要があり、同じ文書の「`entries → handlers → services` の一方向で輪を作らない」と食い違います。 | ハンドラーは `AllowanceMonthView` だけを返し、振り分け表の 1 行で `{ status: 200, body, headers: NO_STORE_HEADERS }` を組み立てます。`RouteResult` の型をどこかに移す設計にする場合は、`lib/` など下の層に置きます。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/performance-design.md > 抜けた子供の確かめの並行（`mapWithConcurrency`）、reliability-design.md > 失敗は全体を投げる | 実コードの `mapWithConcurrency` は、1 つの lane が投げても他の lane を止めません。他の lane は、残りの項目を取り出して `findFamilyChild`／`findDisplayName` を呼び続けます。呼び出し元には最初の拒否で例外が返りますが、応答の後も読み取りが走ります。文書は「どれかが投げたら全体が投げる」としか書いておらず、この余分な読み取りは NFR7.55 の「回数」の上限の説明に含まれていません。 | 失敗後は新しい項目を取り出さないようにします。たとえば、`lib/promise.ts` に移すときに失敗の旗を足します。この変更を U8 のフックの既存の動き（worker が投げない前提）と矛盾させないことを書き、失敗後に呼び出しが増えないテストを加えます。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/security-design.md > 受け口の確かめの順番、handler の形の目安 | 順番の一覧は 1〜5 の番号です。形の目安のコードのコメントは「段階 2」「段階 3」で、番号の付け方が一致しません。performance-design.md は「段 0」から「段 4」を使い、さらに別の番号です。「段」の定義（最大 4 段）を読む人が取り違えやすくなっています。 | 「段」は DynamoDB を待つ段、「確かめの順番」は入口の検査と、呼び方を分けて、番号体系を 1 つにそろえます。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| nfr-requirements と nfr-design の `traceability.json` の NFR ID 照合 | 要件側 47 件がすべて設計側に含まれる。設計側にだけある ID は NFR7.20（S1 の測り直し）のみ | 47 件すべてに対応先がある。NFR7.20 は U5 の既存の目標を測り直す参照で、問題なし |
| 実コード: `lib/http.ts`、`entries/api.ts`、`lib/promise.ts`、`dutyReassignedHook.ts`、`familyMemberService.ts`、`requireMembership.ts`、`choreTypeService.ts`、`calendarRepository.ts`、`lib/logger.ts` | 設計の前提（`json` の形、`listMembers` の 3 回の読み、`findFamilyChild` の強い整合性、`loadMonth` の `confirmed`、`LogData` の型制限、`list` が使わない種類も返すこと、`mapWithConcurrency` の所在）は一致。不一致は上の Major 1 件と Minor 2 件 | `FamilyScope`／`ReadContext` の型の絞り込みは `role` の判別で成立する見込み |
| `infrastructure/lib/app-stack.ts` の `api` の権限と環境変数 | `Users` の `GetItem`・`familyId-index` の `Query`、`Families` の `GetItem`、`Calendar` の `Query`、`ChoreTypes` の `Query`、および `USERS_TABLE`／`FAMILIES_TABLE`／`CHORE_TYPES_TABLE`／`CALENDAR_TABLE` がすべて既にある | 追加の権限・環境変数・リソースが要らず、費用 0 円の前提（NFR1.36）は成り立つ。ログの追加も最大 約 60 行 / 要求で、既存の 30 日のログの範囲 |
| 読み取り回数と段の整合 | 通常 5 回、補いで 6 回、抜けた子供 k 人で最大 5 + 2k 回、`role: system` で 4 回。performance-design、security-design、reliability-design、scalability-design、NFR7.55／NFR7.56 の間で一致 | 内部の矛盾なし |
| 画面の既存パターン（`CalendarPage.tsx` の `lazy`、`client.ts` の `signal`、`useMonthCalendar.ts` の `AbortController`） | 設計が参照する前例は実在する | 画面の部品の置き方は実現できる。ただし月の移動の形の目安に上の Major の不具合がある |

### Summary

NFR 要件 47 件への対応、実コードとの整合、0 円の前提、読み取りの回数と段の組み方は、概ね実装できる水準です。ただし、画面 S5 の月の移動の形の目安には欠陥があります。飛んでいる要求の答えがデバウンスの待ち時間に届くと、利用者が押した月が失われ、余分な要求も出ます。開発者がそのまま実装すると S32 の意図を外すため、この点を直してから READY にしてください。ほかの 3 件は Minor で、コード生成時に直せます。
