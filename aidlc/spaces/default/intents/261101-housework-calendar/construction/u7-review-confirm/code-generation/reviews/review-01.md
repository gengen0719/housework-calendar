## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T16:00:00Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | packages/backend/test/u7-review-confirm/confirmMonth.test.ts > it('呼び出し（書き込み）が 2 回以内（行がある月は Put が競合して Update。NFR7.35）') | テスト名は「書き込みが 2 回以内」と言うが、中身は `w.hooks.transactionSizes.length` が 0 であることしか確かめていない。確定は取引ではなく Put と Update なので、この値は常に 0 で、書き込みの回数を何も数えていない（空のテスト）。Put と Update の回数を数えるテストは calendarRepository.confirmItems.test.ts にあるが、サービスの `confirmMonth` 経由の回数は確かめられていない | 偽の DynamoDB が受けた PutItem と UpdateItem の回数を数えて「2 回以内」を確かめる形に直す。難しければテスト名から回数の主張を外し、回数の確認は confirmItems.test.ts の方だと分かるようにする | New |
| R-02 | Minor | packages/backend/src/services/calendarService.ts > confirmMonth（確定の書き込みのあとの `loadMonth` と `notifyDutyReassigned`）、および dutyView（書き込みのあとの `listMembers`） | 確定の書き込みが成功したあとに、フック用の材料として月を読み直す（`loadMonth`）。この読み取りが例外を投げると、月はすでに確定しているのに 500 を返す。フック登録関数が投げた場合は `notifyDutyReassigned` が握りつぶして結果を変えない設計なのに、材料の読み取りの失敗だけはその守りの外にある。`changeDutyStatus` の `dutyView` も、書き込みのあとに `listMembers` を呼ぶので同じ形（書けたのに 500）。また、すでに確定済みの月をもう一度確定すると、その月の「未」の担当ぶんの `status-changed` が毎回出る（結果は冪等だが、フックは繰り返し呼ばれる）。U8 が登録するまで実害はない | 書き込みのあとの読み取りを try/catch で囲み、失敗したら警告のログを残して成功のまま返す（または、少なくとも U8 で登録する前に判断を決める）。繰り返しの確定でフックを重ねて呼ぶかどうかも U8 の取り下げが冪等であることを前提に README か設計に一言残す | New |
| R-03 | Minor | packages/frontend/src/components/DutyStatusActions.tsx > `ACTIONS_BY_STATUS` と DayDetail.tsx への組み込み | 確定済みの月でも状態の変更ボタンを出したままにしている。設計（BR8.9）は「今の状態からできる操作だけ」を求め、月の確定には触れていないので設計とは矛盾しない。ただし確定済みの月ではどのボタンを押しても必ず 409 MONTH_CONFIRMED になり、確認ダイアログ（markDone では種類一覧の読み取りも）を通ったあとで初めて「この月は確定済みです」と分かる。承認済みの判断なので不具合ではない | 今回は直さなくてよい。直すなら `DutyStatusActions` に月の確定の有無を渡し、確定済みなら押せなくして理由を出す。残すなら、その判断を README の U7 の節に書き残す | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/code-generation/code-summary.md > 計画からずれたところ（`DUTY_HOOK_FAILED` の名前）と nfr-design/observability-design.md > ログの表（`DUTY_REASSIGN_HOOK_FAILED`） | コードは U5 の既存の `DUTY_HOOK_FAILED` に `kind` を足しているが、設計の表は `DUTY_REASSIGN_HOOK_FAILED` のまま。ずれは code-summary と traceability（NFR2.50）に注記済みで、U5 の検索条件を壊さない点でも妥当。ただし U10 以降で監視の検索を書く人が設計の表だけを見ると、存在しない名前を探す | U10 の監視を書く前に、設計の表を `DUTY_HOOK_FAILED`（`kind` つき）に直すか、README の運用の節に実際の名前を書く | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| `npm run format:check` | PASS（All matched files use Prettier code style） | U7 の新規ファイルと CalendarPage.tsx を含め整形の問題なし |
| `npm run lint` | PASS（エラーなし） | |
| `npx tsc --noEmit` shared / backend / frontend / infrastructure | PASS（4 つとも出力なし） | 型の問題なし |
| `npm test` | PASS: 134 ファイル、2673 件通過、2 件 skip（U6 で `it.skip` にした U4・U5 の 2 件のまま）。行 97.16%、文 95.84%、分岐 90.99%、関数 97% | 下限 80% を上回る。code-summary の 2664 件という数と今回の 2673 件は違うが（全体が 9 件多い）、失敗はなく、判定には影響しない |
| `git diff --stat -- infrastructure/lib` | 差分なし | `infrastructure/lib/` は変わっていない。`infrastructure/test/u7-review-confirm/` が新規。CloudFront は `ALLOW_ALL` なので PUT・DELETE も通る |
| `scripts/smoke-check.sh` | `check` の呼び出し 22 行と画面の配信の 1 件で 23 件。3n〜3p は 3 件 | 計画どおり。配備後に動かす（この環境では実行していない） |
| 直書きの調べ（U7 のテストと fakeSecrets.ts の差分） | 本物の UUID・鍵・トークンなし。担当 ID は `00000000-0000-4000-8000-0000000007a1` のような明らかな作り物で、`gitleaks:allow` の注記つき | gitleaks はこの環境にないため未実行（code-summary に明記済み）。作り手が `npm run secrets:scan` を行うこと |
| 差分の目視: CalendarPage.tsx、DayDetail.tsx、client.ts、theme.ts | 追加だけ（CalendarPage.tsx は +80 行、削除 0 行）。U1〜U6 の既存の行は変わっていない。DayDetail.tsx は import と `DutyStatusActions` の組み込み 9 行だけ | Python の一括置換で編集された CalendarPage.tsx に、意図しない変更は混ざっていない。`move()` に確認ダイアログの状態の初期化を足したのは意図どおり |

### Summary

U7 は計画どおりに作られ、コードそのものも正しい。`changeDutyStatus` は設計の取引の形（`status=:from`・`version`・`dutyId`、月の ConditionCheck、markDone の単価の ConditionCheck、記録 3 項目の同時 SET と同時 REMOVE、担当を作らない・消さない・`origin` と `childUserId` を変えない）と、競合だけ 1 回読み直し、2 回で INTERNAL、他の Code は投げ直す扱いを守っている。判定の順（探す→月の確定→version の食い違い→表）に足した「version の食い違い→INVALID_TRANSITION」は reliability-design の (a) と整合し、確定済みの月が先に断られる。`confirmMonth` と `unconfirmMonth` は version を条件にせず、行の無い月の Put（version=1）と競合時の Update、行の無い月の取り消しは何もしない作りで、フックは成功後 1 回だけ、確定時には「未」の担当ごとの `status-changed` に展開され、これがテストされている。画面用 API の確かめ順、子供が DynamoDB を読まないこと、month の 422、管理者だけに出るボタン、確認ダイアログ、`aria-busy`、`dangerouslySetInnerHTML` なしも確かめた。Critical と Major はなく、残るのは Minor 4 件（空のテスト、書き込み後の読み取りの失敗の扱い、確定済みの月のボタン、ログ名の設計とのずれ）で、実装を作り直す必要はない。
