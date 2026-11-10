## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T13:00:00Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | construction/u7-review-confirm/nfr-requirements/performance-requirements.md > NFR7.35 の「内訳（状態の変更の markDone）」 | 呼び出し回数の内訳が、既存コードの実際の読み取りと食い違っています。内訳は「利用者の確かめ（`requireMembership` で利用者 1 ＋ 家族 1）」として 2 回の DynamoDB 読み取りを数え、markDone 通常 7 回・読み直し最大 12 回としています。しかし既存の `middleware/requireAuth.ts` は利用者の記録を 1 回だけ読み（`getUserStatus`。ここに `familyId`・`role`・`friendStatus` が入る）、`middleware/requireMembership.ts` と `requireAdmin.ts` は AuthContext の値を見るだけで DynamoDB を読みません。したがって家族の記録を別に読む 1 回は存在せず、認証＋メンバー確認の読み取りは 1 回です。実際は markDone 通常 6 回（利用者 1 ＋ findDuty 3 ＋ 単価 1 ＋ 取引 1）、読み直し最大 11 回、確定・取り消しは 2 回（利用者 1 ＋ 月の状態の書き込み 1）になります。見出しの上限「状態の変更は通常 5 回以内・読み直し 9 回以内」「確定・取り消しは 2 回以内」と内訳（7／12、確定は「利用者と家族の確かめ ＋ 書き込み」で 3 相当）も互いに合いません。さらに同じ成果物の NFR4.65 は「セッションは SSM・DynamoDB を使わない」と書いており、NFR7.35 が家族の確かめを 1 回の読み取りと数えることと矛盾します。NFR7.35 の回数は NFR3.11・NFR3.13 の確かめ方（単体テストで呼び出し回数を数える）が参照するため、この数が確定していないと単体テストの期待値を書けません。 | NFR7.35 の内訳を、既存コードに合わせて直してください。認証＋メンバー確認は利用者 1 回の読み取りだけ（`requireAuth` の `getUserStatus`。`requireMembership`・`requireAdmin` は読み取りなし）とし、markDone 通常 6 回・読み直し最大 11 回、cancel など単価を読まない操作は通常 5 回・読み直し 9 回、確定・取り消しは 2 回、と内訳・見出しの上限・NFR4.65 の記述をそろえた 1 つの数にしてください（別案として「家族 1」の読み取りが本当に必要なら、どの経路で発生するかを明示してください）。 | New |
| R-02 | Minor | construction/u7-review-confirm/nfr-requirements/performance-requirements.md > NFR7.33・NFR7.36（markDone の代表測定） | NFR7.33 は 5 とおりの状態変更のうち markDone を代表に 20 回測るとし、NFR7.36 の 1. は「『未』または『×』の担当が 20 件以上必要」としています。markDone は 1 件測るごとにその担当が「済」になり、同じ担当では再測定できないため、20 回には 20 件の別々の「未／×」担当が要ります。U5 の初回保存で 1 か月分（約 124 件）が「未」で作られる前提なら不足はありませんが、「過ぎた日」に限る条件（NFR7.33 の確かめ方・NFR7.36 の 1.）と重なると、月の経過日数によっては過ぎた日の「未」担当が 20 件に満たない場合がありえます。 | NFR7.36 の 1. に、過ぎた日の「未／×」担当を 20 件以上そろえる前提（測定月の経過日数、または複数日・複数家族の組み合わせ）を、U6 の NFR7.30 の (a)(b) と同じ粒度で 1 文足してください。 | New |
| R-03 | Minor | construction/u7-review-confirm/nfr-requirements/reliability-requirements.md > NFR2.49 の「NFR2.46 の observability」 | 「`INTERNAL` と 500 のログ（NFR2.46 の observability）」とありますが、NFR2.46 は確定・取り消しの冪等の信頼性要件で、observability（ログで気づく）は observability-requirements.md の NFR2.53 が扱います。scalability-requirements.md の [assumption] と reliability の別の [assumption] も同じ「NFR2.46 の observability」という参照になっています。参照先の取り違えで、読み手が該当要件にたどり着けません。 | NFR2.49 と関連する [assumption] の「NFR2.46 の observability」を、ログで失敗に気づく要件である NFR2.53 への参照に直してください。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| traceability.json の点検（手動） | PASS | upstream_ids は inception の NFR1〜NFR11 を全て列挙（requirements.md の NFR 定義と一致）。coverage は 11 件すべて OK で、target の NFRx.y は各成果物に実在（NFR1.30/1.31、NFR2.44〜2.53、NFR3.11〜3.13、NFR4.65〜4.73、NFR5.13、NFR6.8、NFR7.33〜7.38、NFR8.13、NFR9.8、NFR10.8、NFR11.7）。reverse の BR8.15・AC6.1.6 の target も妥当。GAP・ORPHAN なし |
| ID 連番・重複（前ユニットとの照合） | PASS | u6 の最終 ID（NFR1.29、NFR2.43、NFR3.10、NFR4.64、NFR5.12、NFR7.32、NFR8.12、NFR9.7、NFR10.7、NFR11.6）の直後から u7 が開始（NFR1.30、NFR2.44、NFR3.11、NFR4.65、NFR5.13、NFR7.33、NFR8.13、NFR9.8、NFR10.8、NFR11.7）。重複・欠番なし |
| app-stack.ts との突き合わせ（NFR4.71／4.72） | PASS | `infrastructure/lib/app-stack.ts` で `api` は Calendar に Get/Query/Put/Update/Delete/ConditionCheck、ChoreTypes に Get/Query/Put/Update/Delete/ConditionCheck を保持し、環境変数 CALENDAR_TABLE・CHORE_TYPES_TABLE もあり。`line` は Users・Families・ProcessedLineEvents・NotificationGroups・Calendar・ChoreTypes・SSM(line/*,cloudfront/*)。NFR4.71／4.72 の「足し済み／足さない」の主張は現状と一致 |
| api.ts / 認証経路の突き合わせ（NFR7.35） | FAIL | `requireAuth` は利用者 1 回のみ読み取り、`requireMembership`・`requireAdmin` は読み取りなし。NFR7.35 の内訳が家族の読み取り 1 回を余分に数えている（Major 指摘の根拠） |

### Summary

ID の連番・traceability・権限と環境変数の主張（app-stack.ts と一致）・認可・入力検証・取引の原子性と読み直し・確定の冪等・ログの秘匿・費用 0 円は、確かめ方つきで一貫しており実装できます。唯一の Major は NFR7.35 の呼び出し回数の内訳が既存の認証経路（利用者 1 回のみ、メンバー確認は読み取りなし）と食い違い、見出しの上限・NFR4.65・NFR3.11/3.13 の確かめ方とも整合しない点です。Critical はなく Major は 1 件のため判定は READY ですが、単体テストの期待値に直結するため早期の修正を勧めます。
