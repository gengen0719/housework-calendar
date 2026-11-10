## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/entities.md > Assumptions & Open Questions（2 つ目の [assumption]）と functional-spec.md > 契約への追加 > C1 `GET /months/{month}/allowances` | 設計は `Allowance` を置き換える理由を「契約が『Allowance の中身は U9 の設計で決める』としているため」と書いていますが、`contract-summary.md` にその文言はありません（検索して確かめました）。契約には `Allowance`（`lines` に `kind: chore/adjustment`）と、応答が `Allowance[]` であることが書いてあります。応答を `AllowanceMonthView` の入れ物に変えるのは、契約の「壊す変更（画面用 API）」（`/v2` を足して古いほうを残す）に当たります。実際には `packages` の中に `Allowance` も `allowances` の入口もまだなく、誰も使っていないことは確かめられました。つまり、変えること自体は成り立ちますが、根拠として挙げた文が実在しません | 根拠の文を直します。「契約の `Allowance` は案で、まだ誰も使っていない入口なので、`/v2` を作らずに置き換える。作り手が承認した例外」と書き、`docs/contract-changes-u9.md` にも同じ理由を書きます。あわせて、AC8.2.6 の内訳「-200 円」は `adjustments` の行として描くことを U11 への引き継ぎに一言足します | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/rules.md > BR10.13 の 3 番（管理者のユーザー ID の担当）と BR10.6、functional-spec.md > F3 手順 3 | 手順 3 は、一覧にいない子供を `findFamilyChild` で確かめ、見つからなければ「抜けた子供」として `findDisplayName` で名前を読むと書いています。実際の `findFamilyChild`（`familyMemberService.ts`）は、利用者がいない、ほかの家族、管理者のどれも同じ `NOT_FOUND` を返します。そのため、管理者の ID が担当に出てきても、抜けた子供と見分けられず、BR10.13 の 3 番「行を作らず ALLOWANCE_DUTY_OWNER_NOT_CHILD を残す」にたどり着けません。見分ける元が書かれていません | F3 に、管理者かどうかを `listMembers` の管理者の一覧（role が admin）と突き合わせて先に判断する、と書きます。管理者の ID なら行を作らずログに残し、そうでないものだけを `findFamilyChild` →`findDisplayName` に進めます。テストの筋書き（S30 の並び）にも 1 件足します | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/rules.md > BR10.13 の 1 番、BR10.4 と functional-spec.md > S14 | 「済」なのに単価が「空」の担当を数えない、と決めています。一方で単価 0 円は正しい値として行に出します（S14）。実装で `if (!duty.unitPrice)` のように書くと、0 円の担当を異常として落とし、額は変わらなくても行と回数が消えます。実際の保存側は `unitPrice ?? null` と書いており、0 は有効な値です | 「空」を `undefined` か `null` のときだけ、と書きます（0 は空ではない）。S14 に「0 円の担当は異常のログを残さない」を足します | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/rules.md > BR10.14 の logic と functional-spec.md > 次の単位への引き継ぎ > 配備 | BR10.14 の見出しは「保存先も権限も環境変数も足さない」ですが、本文は「足りなければ U9 で足す」とあり、食い違っています。コード生成の人が、足してよいのか迷います | 見出しを「原則足さない。コード生成で `app-stack.ts` を確かめ、足りない権限があれば、その差分だけを U9 で足す」の形にそろえます | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/rules.md > BR10.10（同じ内容は functional-spec.md > 画面の文言） | AC8.1.2 は「今月の記録はまだありません（0 円）」と文言を決めていますが、設計は見ている月が今日の月でないときに「この月の…」へ変えます。判断は [assumption] に出してあり、AC の例（1 月）は今日の月で試せば通ります。ただ、テスト日が 1 月でない場合に AC8.1.2 の文言と合わなくなります | 現状の判断でよいが、コード生成のシナリオで AC8.1.2 は「今日の月を見ている」前提の日付を固定して書く、と筋書き S2 に一言足します | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u9-allowance/functional-design/functional-spec.md > Assumptions & Open Questions（「最初の月は…」）と entities.md > AllowanceMonthView.today | 画面は最初の月を決めるのに `today` が要りますが、`today` は S5 の答えにしかありません。S1 を経由しないで S5 を直接開くと、先にカレンダーの GET を 1 回呼ぶ必要があり、呼び出しが 2 回になります（NFR7 の 3 秒の余裕を減らします）。また、`getFamilyCreatedAt` は `listMembers` が読む Families と同じ項目を別に読みます | 月の指定を省略できる形（たとえば現在の月を返す問い合わせ）にするか、直接開いたときの 2 回の読みが 3 秒に収まることを BR10.16 の計測に含める、と書きます。Families の読みは 1 回にまとめられる実装の余地があることを引き継ぎに一言添えます | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json の前方の確認（手で突き合わせ） | PASS | upstream_ids の AC8.1.1〜AC8.1.4、AC5.1.13 の 5 件すべてが OK で、target の BR10.x は rules.md に実在する |
| 決まりの ID の連続（手で確認） | PASS | BR10.1〜BR10.19 が欠けも重なりもなく並び、U8 の最後の BR9.19 の次から始まる |
| 実コードとの突き合わせ（検索と読み取り） | PASS（注記あり） | `unitPrice` は `recordingService`（U6）と `calendarService` の markDone（U7）で `getCurrentUnitPrice` から書き写され、取り消しなどで除かれる（`calendarService.ts` の分割代入）。U8 の引き受けは「未」の担当の `childUserId`・`origin` だけを書き `unitPrice` に触れない。`loadMonth` は強い整合性で続きも読み、月は sk の接頭辞で決まるので日付の月の判断と合う。`choreTypeService.list` の並び（使う、続けて使わない）は BR10.4 の前提と合う。`findDisplayName`・`getFamilyCreatedAt`・`listDoneDuties`・`isMonthConfirmed`・`getAllowances` はまだコードにない（設計の「作る・足す」と一致）。抜ける・外す操作はコードになく、`current: false` の行は前提データのテストでだけ起きる（設計も認めている） |
| validate-domain-model などの検証ツール | 未実行 | この単位の設計にひも付く検証ツールの指定はブリーフになく、実行していない。`functional-design-questions.md` の回答 A は読み直していない（ブリーフの記述を前提にした） |

### Summary

U9 の設計は、「済」だけを書き写した単価で数える、額を入れる先は担当の子供、保存せず読むたびに計算する、という中心の決まりが、U6〜U8 の実コードと矛盾せず、受け入れ条件 AC8.1.1〜AC8.1.4 と AC5.1.13 を漏れなく受けています。重大な指摘はなく、開発者が迷わず作れる状態です。契約の根拠の文の誤り、管理者 ID と抜けた子供の見分け、単価 0 円と「空」の区別を直せば、さらに確実になります。
