## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/reliability-design.md > 画面 S5 の月の移動（ADR-U9-06）> `issue` / `go` の形の目安 | 月の移動の形の目安では、`go()` が `seq` を進めません。`seq` を進めるのは `issue()` だけです。そのため、月 A の要求が飛んでいる間に [>] を押して `target=B`・`loading`・250 ms のタイマーにした後、タイマーが鳴る前に A の答えが届くと、その答えは最新の連番として描かれます。このとき `target.current = value.month` が B を A で上書きします。結果は 3 つです。(1) 利用者が押した B が失われる。(2) 画面は B に進まず A の `ready` に戻る。(3) タイマーが鳴ると `inFlight` が空なので、A をもう一度要求する。これは「押すたびに目標の月だけを更新し、最新の目標の月だけを要求する」（NFR2.72 の (b)）と、「要求が増えない」（NFR1.38、NFR7.53）に反します。表の「2 月の要求が飛んでいる間に 3 月へ移す」は、250 ms のうちに 2 月の答えが届く場合を扱っていません。同じ表の「[>] [<] で 2 月に戻る」の行も、この上書きの影響を受けます。 | 答えを描く条件を、連番が最新であることに加えて「待っている押しがない」ことにします。具体的には、`go()` で連番も進めて、押した時点より前の要求の答えを捨てます。あるいは、`target.current` を答えの `month` で上書きせず、最初の答えのときだけ置き換えます。そのうえで、同じ月への「重ねて出さない」規則と矛盾しないように表の場面を引き直し、「飛んでいる間に押す → タイマーの前に答えが届く」場面を S32 の画面のテストに加えます。 | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/logical-components.md > 足す・変える部品 `handlers/allowances/getAllowances.ts`（security-design.md の同ハンドラーの形の目安も同様） | 入口が `{ status: 200, body, headers: NO_STORE_HEADERS }`（`RouteResult`）を返す設計です。しかし実コードの `RouteResult` は `entries/api.ts` の中の `export` していない `interface` です。既存のハンドラー（`getCalendar` など）は本文だけを返し、振り分け表の側で `{ status, body }` に包んでいます。ハンドラーが `RouteResult` を使うには `entries/api.ts` を import する必要があり、同じ文書の「`entries → handlers → services` の一方向で輪を作らない」と食い違います。 | ハンドラーは `AllowanceMonthView` だけを返し、振り分け表の 1 行で `{ status: 200, body, headers: NO_STORE_HEADERS }` を組み立てます。`RouteResult` の型をどこかに移す設計にする場合は、`lib/` など下の層に置きます。 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/performance-design.md > 抜けた子供の確かめの並行（`mapWithConcurrency`）、reliability-design.md > 失敗は全体を投げる | 実コードの `mapWithConcurrency` は、1 つの lane が投げても他の lane を止めません。他の lane は、残りの項目を取り出して `findFamilyChild`／`findDisplayName` を呼び続けます。呼び出し元には最初の拒否で例外が返りますが、応答の後も読み取りが走ります。文書は「どれかが投げたら全体が投げる」としか書いておらず、この余分な読み取りは NFR7.55 の「回数」の上限の説明に含まれていません。 | 失敗後は新しい項目を取り出さないようにします。たとえば、`lib/promise.ts` に移すときに失敗の旗を足します。この変更を U8 のフックの既存の動き（worker が投げない前提）と矛盾させないことを書き、失敗後に呼び出しが増えないテストを加えます。 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/security-design.md > 受け口の確かめの順番、handler の形の目安 | 順番の一覧は 1〜5 の番号です。形の目安のコードのコメントは「段階 2」「段階 3」で、番号の付け方が一致しません。performance-design.md は「段 0」から「段 4」を使い、さらに別の番号です。「段」の定義（最大 4 段）を読む人が取り違えやすくなっています。 | 「段」は DynamoDB を待つ段、「確かめの順番」は入口の検査と、呼び方を分けて、番号体系を 1 つにそろえます。 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/reliability-design.md > 構成の図の `handlers/allowances/getAllowances.ts` の行 | 図の行に「ヘッダー付きの RouteResult を返す」と残っています。R-02 の直しのあと、logical-components.md と security-design.md では、ハンドラーは本文だけを返し、`RouteResult` は `entries/api.ts` の中に閉じています。同じ設計書の中で食い違っています。 | 図の行を「本文（`AllowanceMonthView`）だけを返す」に直します。ヘッダーを付けるのは `entries/api.ts` の振り分け表だと書き添えます。 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/nfr-design/reliability-design.md > 場面ごとの動き（[>] [<] で 2 月に戻る行）、および nfr-requirements の NFR1.38 (d)／NFR7.53 (c)／BR10.12 の「同じ月の要求が飛んでいる間は重ねて出さない」 | 要件の文言は「同じ月の要求が飛んでいる間は重ねて出さない」です。設計は、`go` のあとは古い要求を「飛んでいる要求」に数えない、と言い換えています。そのため [>] [<] で A に戻した場合、A の最初の要求は通信上まだ飛んでいるのに（答えは捨てる）、静まりのあとに A の要求をもう一度出します。通信は A で 2 本になります。1 回の静まりにつき新しい要求は 1 回で、押した回数に比例しないので、「余分な読み取りが増え続けない」という趣旨には反しません。ただし「重ねて出さない」の文字どおりの読みとは食い違います。機能設計の S32 の注記（「最新の連番の要求の月と目標の月が同じときだけ避ける」）と BR10.12 の「同じ月なら重ねない」は、この設計と整合します。矛盾は文言の定義の差で、動きの欠陥ではありません。 | 次のどちらかにします。(a) 設計に「この場面だけ、捨てた A の要求と新しい A の要求で A が最大 2 本になる。上限は静まり 1 回につき 1 本」と明記し、画面のテストの期待値を「A の要求が静まりのあとにちょうど 1 回増える」と書いたままにする。(b) 新しい要求を出すときに古い要求を `AbortController` で取り消す作りに決め、通信上も 1 本にする（設計は「取り消してよい」と任意にしている）。どちらでも、NFR1.38 (d)／NFR7.53 (c) の読み方（捨てた要求は「飛んでいる」に数えない）を設計の「決め」に残す。 | New |

> R-01 Reviewer note: reliability-design.md の `go()` が `++seq.current` を行うようになり、押した時点より前の要求の答えはタイマーの前に届いても捨てられます（`mine !== seq.current`）。`target` は答えで書き換わらず、最初の答え（`target === 'current'`）だけが置き換えます。場面表で追ってもすべて成立します。(1) A 飛行中に [>] → 答えが先に届く: A は捨てられ、`target`=B のまま、タイマーで B を 1 回だけ要求し、A は再要求されません。(2) [>] [<] で A に戻る: `seq` が 1→2→3 と進むので `issue` の重ね出し判定（`latest.seq === seq.current`）が外れ、静まりのあとに A を新しい番号で 1 回だけ要求します。押した回数に比例して増えません。(3) 範囲が未知の間は [<] [>] が無効なので、最初の読み込み中に `go` は呼ばれません。(4) 失敗の答えも番号が最新のときだけ `error` にします。S32 の画面のテストにも、この場面の (1)〜(4) が加わっています。

> R-02 Reviewer note: logical-components.md で、ハンドラーは本文（`AllowanceMonthView`）だけを返し、`{ status, body, headers }` は `entries/api.ts` の振り分け表が組み立てると直っています。security-design.md の形の目安も同じです。`RouteResult` は `entries/api.ts` の中に閉じており、`entries → handlers → services` の一方向と矛盾しません。ただし reliability-design.md に古い記述が 1 か所残っています（New findings 参照）。

> R-03 Reviewer note: performance-design.md の「並行の道具」と reliability-design.md の「抜けた子供」、logical-components.md の `lib/promise.ts` に、失敗のあとは新しい項目を取り出さない旗が足されています。U8 のフックの `worker` は投げないので動きは変わらないこと、新しいテスト（失敗のあとに新しい項目が始まらない、投げないときは従来どおり）も書かれています。

> R-04 Reviewer note: 「段」は DynamoDB を順に待つ段、「確かめの順番」は入口の検査（1〜5）と、performance-design.md と security-design.md の両方に用語の注記が入りました。security-design.md のコードのコメントも「確かめの順番 3／4」にそろっています。

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 月の移動の形の目安（`issue`／`go`）の手作業の追跡 | 場面表の 6 つの場面とコードが一致。A 飛行中に [>] して答えが先に届く場合は A を描かず、B を 1 回だけ要求 | R-01 の欠陥は解消 |
| NFR2.72 (b)／NFR7.53 (c)／NFR1.38 (d)／BR10.12／F2／S32 との整合 | 「連番を `go` でも進める」「答えで目標を書き換えない（最初の答えを除く）」は NFR2.72 (b) の文言と一致。S32 の注記とも一致。[>] [<] の戻りで再要求 1 回になる点だけ、「重ねて出さない」の文字どおりの読みと差がある | 上の Minor 1 件。動きの欠陥ではない |
| R-02〜R-04 の直しの反映箇所の照合（logical-components.md、performance-design.md、reliability-design.md、security-design.md） | R-03、R-04 は全箇所に反映。R-02 は reliability-design.md の図に 1 行だけ古い記述 | 上の Minor 1 件 |

### Summary

R-01（Major）の欠陥は、`go` が連番を進める作りで直り、場面表とテストの期待値もそろっています。R-02〜R-04 も直っています。新しい指摘は Minor 2 件（図の古い記述 1 行、「重ねて出さない」の言い換えの明記）で、コード生成のときに直せます。これ以降 Critical も Major もないため、READY です。
