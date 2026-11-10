## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 依頼文に `Date for this review:` の行がなかったため未記入（推測しない）
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/nfr-design/performance-design.md > 読み取りの並行と書き込み 1 回（選ぶ offerSwap の図） | 図では「申し出 GetItem」を `findDuty` の後に読む形（直列）だが、機能設計 BR9.7 は「元の持ち主」の判定のため申し出を `findDuty` の探索と並行して読むと書いている。直列でも回数（10 回）は変わらず 3 秒の予算には収まるが、2 つの文書で読む順番が食い違う | 図を BR9.7 に合わせて `findDuty` と申し出の `GetItem` を並行にするか、直列のままにする理由を 1 行書いて BR9.7 側を直す | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/nfr-design/logical-components.md > 足す・変える部品（`services/swapHooks.ts`）と reliability-design.md > 登録（`registerSwapHooks`） | `registerSwapHooks` の置き場所が、論理コンポーネントでは `swapHooks.ts`、機能設計 BR9.11 では「swapService の registerSwapHooks」と食い違っている。`closeOffer` は `swapHooks.ts` と読める | どちらかに統一する（`swapHooks.ts` に置くなら BR9.11 の記述を設計の決めに合わせて読み替える旨を書く）。コード生成の計画で決める旨の注記でもよい | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/nfr-design/observability-design.md > ログに残さないもの | `groupId` を外すのは `GROUP_COMMAND_REJECTED` だけ。既存コードには `GROUP_JOINED`（joinHandler.ts）、`NOTIFICATION_GROUP_REJECTED`、`GROUP_SUMMARY_FAILED` など LINE のグループ ID を書くログが残る（読んで確認）。U8 の経路では出ないので「全分かれ道のログに目印なし」の試験には影響しないが、NFR2.65 の「LINE のグループ ID を残さない」の範囲が U8 の経路に限ることが書かれていない | 範囲を「U8 の経路で出るログ」と明記し、ほかの既存ログの `groupId` は U8 では変えない（別の単位で扱う）と `docs/contract-changes-u8.md` に 1 行残す | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/nfr-design/reliability-design.md > 残る危険（承認の場で人が決めること） | 「担当を選ぶ」の書き込みは成功したが reply が失敗すると、申し出が `open` でボタンが出ないまま残る。設計は決めを承認の場に預けている（害は限定的でデータは壊れない）。設計として未決のまま次へ渡る | 承認の場で (1) 許容か (2) `ALREADY_OFFERED` のときにボタンを添えるか、を決め、決めた内容を `rules.md` と本書に書き戻す。個人的には (2) が小さな変更で救済になる | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 依頼で指定された検証ツール | なし（実行せず） | このステージには検証ツールの指定がない |
| NFR 追跡の手作業照合（nfr-requirements/traceability.json の NFR1〜NFR11 と NFR の ID を nfr-design/traceability.json と突き合わせ） | PASS | 要件の NFR1.32〜35、NFR2.54〜66、NFR3.14〜16、NFR4.74〜85、NFR5.14〜15、NFR6.9、NFR7.39〜49、NFR8.14〜16、NFR9.9、NFR10.9〜10、NFR11.8〜9 の 54 件がすべて設計の追跡に載り、参照先の文書に対応する節がある。要件側の ID で設計に載っていないものはない |
| 既存コードとの照合（読むだけ） | PASS（Minor の注意のみ） | `app-stack.ts`: `line` は `Calendar` に GetItem・Query・UpdateItem・ConditionCheckItem、`ChoreTypes` に GetItem・Query・ConditionCheckItem、`api` は 6 操作で、引き受けの取引（担当 Update ＋ 申し出 Update ＋ 月の ConditionCheck）と掃除の条件つき UpdateItem は追加の許可なしで足りる。環境変数 `CALENDAR_TABLE` は `line`・`api` にある。`dutyReassignedHook.ts` は `for` で順に `await` する形で、並行数 4 の `mapWithConcurrency` への変更は型を変えずにできる。`calendarService.confirmMonth` は「未」の担当ごとの `status-changed` を 1 回の `notifyDutyReassigned` に渡しており、設計の前提と一致。`groupCommandGate.ts` は `groupId` を書いており、設計が直す対象と一致。`DutyOrigin` に `swap` は既にある。登録関数（`registerSwapHooks`）は未実装で、設計どおり新規 |
| 0 円の制約 | PASS | 新しいテーブル・索引・Lambda・指標・アラーム・SSM・push なし。reply のみ。書き込みは確定 1 回あたり最大 300 件の条件つき UpdateItem でオンデマンドの無料に近い規模。reply が無料枠に数えられない前提と DynamoDB の単価は設計も未確認の仮定として明記しており、ステージングの前後比較とコード生成での料金表の確認に回している |

### Summary

U8 の NFR 設計は、NFR 要件の全 ID を満たし、機能設計（BR9.7〜BR9.19）と既存コードに沿っていて、`line`・`api` の権限と環境変数を足さずに実装でき、費用 0 円の条件も守れる。先着の取引、フックに頼らない有効さの判断、並行数 4 の掃除という要になる決めに構造上の欠陥は見つからなかった。Critical と Major はなく、Minor は文書間の食い違い 2 件、ログの範囲の明記 1 件、承認の場で人が決める reply 失敗の扱い 1 件で、READY と判断する。
