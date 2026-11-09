## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T00:50:01Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/reliability-requirements.md > NFR2.37 (b) と Assumptions & Open Questions の 1 つ目 | 承認済みの機能設計 BR7.17 は「予期しない例外のとき」にも本人へ「うまく記録できませんでした。もう一度お試しください」と返すと書いている（rules.md の BR7.17 の trigger と logic）。NFR2.37 (b) は反対に「reply せず 500 で LINE の再送に任せる」と決めており、2 つの文書が食い違ったまま残っている。食い違いは Assumptions に 1 行書かれただけで、「NFR の設計で調整」と先送りされている。コード生成は BR7.17 と NFR2.37 の両方を読むので、どちらに従うか実装者が推測することになる。なお NFR2.37 (b) の中身そのものは妥当である。U1 の NFR2.2 と、その元の決定（U1 の NFR 質問 Q1 の A）、U3 の NFR2.18 と同じ形で、reply トークンを使い切ってから 500 にすると再送で記録だけが黙って書かれ、返事と実際が食い違うため。直すべきなのは NFR ではなく機能設計の側である。さらに BR7.17 の trigger にある「残り時間が足りないとき」に当たる要件が NFR のどこにもない（Lambda の時間切れは 30 秒で、LINE への呼び出しは 5 秒） | 食い違いを Assumptions で済ませず、決着させる。(1) 機能設計の rules.md の BR7.17 と functional-spec.md の「記録の結果の印と返事の対応」の INTERNAL の行を、「取引の読み直しが 2 回続けて断られたときだけ本人に返事し、それ以外の予期しない例外は reply せず 500 にして再送に任せる（U1 の NFR2.2）」に直す。直せない場合は、BR7.17 を NFR2.37 に従わせると明記した改訂記録を残す。(2) 「残り時間が足りないとき」を、要件として定める（例: 残り時間を見ず、時間切れは (b) と同じ扱いにする）か、BR7.17 から外す。(3) NFR2.37 (a) と NFR2.38 の境目を 1 文で定める（単価の読み取りの失敗は例外なので (b)、種類が見つからない NOT_FOUND は INTERNAL なので (a)）。(4) traceability.json に、この扱いを残す | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/performance-requirements.md > 測り方の条件 の 1.（環境と量）と 7.（届かなかったとき）、NFR7.25、NFR7.30 | AC5.1.15 の「20 回行う」は、この手順では実行できない。1.は「20 回の途中で、担当を割り当て直して『未』の担当を用意し直す」と書くが、U5 の BR6.5 は担当を作るのを初回の保存だけとし、BR6.6 は「今日と過ぎた日の担当は変えない」「『済』はそのまま残し、新しい担当を作らない」と決めている。U5 のデータは同じ日付と種類の組に担当 1 件（約 124 件 = 31 日 × 4 種類）なので、家族全体で今日記録できる担当は多くて 4 件になる。記録した「済」を「未」に戻す入口は U7 まで存在せず、データを直接書き換えて用意することも同じ 1.が禁じている。LINE の記録は今日の担当だけなので、1 日で測れるのは最大 4 回で、20 回には 5 日以上かかる。7.の「直して新しい 20 回を測り直す」は、さらに日数がかかる。このままでは Build and Test で目標を確かめる方法がなく、「確かめ方が実行できる」とは言えない | 1.を実行できる手順に書き直す。例: (a) 月の初回の保存で日ごとの担当を作っておき、5 日以上に分けて 1 日 4 件以内で測る（測定の日付と回数を表に残す）、(b) ステージングに家族を複数用意し、家族ごとの初回の保存で今日の担当を作る、のどちらか、または組み合わせる。「割り当て直して用意し直す」の記述は削除する。7.の測り直しは、同じ制約（新しい日か新しい家族が要る）を踏まえた書き方にする。冷たい起動を 10 回以上含める条件（3.）も、日をまたぐ測定で満たせることを確かめて書く | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/performance-requirements.md > NFR7.25、測り方の条件 の 4.、Assumptions & Open Questions の 1 つ目 | AC5.1.15 の 3 秒の起点を「『記録する』を押した時点」と読む判断は妥当。人が選択肢を見て選ぶ時間は機械の速さの目標にならず、そのぶん NFR7.26 で「やった」から選択肢が出るまでを別に 3 秒以内と決めて穴を埋めている。20 回中 19 回、3 秒、返事が届くまでという文言とも合っている。ただし Assumptions の「要件の文言は変えていません」は言い過ぎで、AC は起点を書いておらず、起点の選び方が測定結果を左右する。また 4.の最後の文「機械が受け持つ時間は、どちらも 3 秒以内になる」は、2 つの返事のそれぞれが 3 秒以内なのか、合計なのかが読み取れない | Assumptions を「AC は起点を書いていないため、次のように読む」という書き方に直し、承認の場で人が確かめる点として残す。4.の最後の文は、「NFR7.25 と NFR7.26 のそれぞれが 3 秒以内で、合計では最大 6 秒近くになりうる」と、事実のとおりに書き直す | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/performance-requirements.md > NFR7.27 | サーバー側の補助目標 2,000 ミリ秒の物差しに `LINE_EVENT_DONE.durationMs` を使っているが、これは `entries/line.ts` の `processEvent` で `begin`（二度処理しない記録の書き込み）の後から測り始める値で、設定の読み込み（`getConfig`）、署名の確かめ、`begin`、`markDone` は入らない。文は「Webhook を受け取ってから 200 を返すまでのうち」と書くので、実態より小さく見える。残りの 1 秒の割り当てにも、これらと冷たい起動の `Init Duration` が隠れる。NFR7.28 の「通常 10 回以内、読み直しがあっても 15 回以内」も、読み直しで増える最大 5 回（担当の探索 3 回、単価 1 回、取引 1 回）を足すとちょうど 15 回で余裕がなく、`begin` と `markDone` を数えるかが書かれていない | NFR7.27 は、既存の `REQUEST_END.durationMs`（受け口全体）も並べて読み、`LINE_EVENT_DONE.durationMs` との差を原因の切り分けに使う、と書く。NFR7.28 は、二度処理しない記録の呼び出し（`begin`、`markDone`）を数えるかどうかを明記し、内訳（利用者、担当の探索、単価、種類の名前、取引、記録）を 1 行で示して上限が成り立つことを見せる | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/traceability.json > coverage | 機能設計が AC5.1.15 を「Deferred（nfr-requirements に渡す）」としたが、この traceability.json に受け取った記録がなく、NFR7.25 との対応が辿れない。BR7.17 の扱い（上の Major）も残っていない。また NFR2 は「作り手に 15 分以内に知らせが届く」ことを含むが OK とされ、実際の知らせは U10 に渡す（NFR2.43）。U5 も同じ付け方なので矛盾ではないが、U6 では「OK」が実態より強い | NFR7 の target の近くに「AC5.1.15 は NFR7.25、NFR7.26、NFR7.30 で受けた」と書く（`reverse` の欄を使ってもよい）。NFR2 は、15 分以内の知らせが U10 の担当であることを target に書き足すか、Deferred にする | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-requirements/security-requirements.md > NFR4.56（返事の内容）と NFR2.40（`RECORD_LIST_SHOWN`） | 受け口の安全は全体として十分に書けている。署名と秘密のヘッダーを先に確かめること（NFR4.53）、data の形をちょうど一致で見ること（NFR4.54）、1 対 1 に限ること（NFR4.55）、押した人を `source.userId` だけから決めて data を信じないこと（NFR4.56、NFR4.57）、古いボタンを書き込みの条件で断ること（NFR4.59）、`line` の権限が `Calendar` と `ChoreTypes` の項目単位の操作だけであること（NFR4.63、NFR4.64。既存の `app-stack.ts` と照らして矛盾なし）は、確かめ方つきで揃っている。残る小さな点が 1 つある。LINE にはメッセージを他の人へ転送できる場合があり、転送された「記録する」ボタンを別の人が押すことがありうる。NFR4.57 は結果を決まった文にする点で備えているが、その経路を明示した確かめ方がない | NFR4.57 の確かめ方に、「ほかの子供や家族外の人が、同じ data を持つボタンを押した場合」（転送や貼り付けを想定）を 1 通り足し、返事が決まった文だけで何も書かれないことを確かめる | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| ID の重複の確認（grep。U1〜U5 の nfr-requirements の表の行に、U6 が使う NFR1.23〜NFR1.29、NFR2.33〜NFR2.43、NFR3.7〜NFR3.10、NFR4.53〜NFR4.64、NFR5.10〜NFR5.12、NFR6.7、NFR7.25〜NFR7.32、NFR8.11、NFR8.12、NFR9.6、NFR9.7、NFR10.6、NFR10.7、NFR11.5、NFR11.6 があるか） | 重複なし | U5 までの番号の続きになっていて、U6 の中でも重複はない |
| traceability.json の GAP の確認 | GAP なし | NFR1〜NFR11 の 11 件がすべて OK で、target の ID は各ファイルに実在する。ただし Minor の指摘のとおり、Deferred の受け取りの記録がない |
| 既存コードとの照合（`entries/line.ts`、`services/lineApiService.ts`、`infrastructure/lib/app-stack.ts`） | 矛盾なし | `accepts` を二度処理しない記録の前に置く構造、500 での再送、`line` の既存の権限と環境変数、reply の 5 秒の時間切れは、要件の前提と合っている |
| 前のユニットの NFR との矛盾の確認 | NFR2.37 (b) は U1 の NFR2.2 と U3 の NFR2.18 と整合。矛盾は機能設計の BR7.17 との間だけ | 上の最初の Major |
| テスト・測定の実行 | 実行していない | NFR のステージで、実行するコードも測定もまだない。エンジンのコマンドは指示どおり実行していない |

### Summary

要件の各行が確かめ方を持ち、ID の重複と GAP もなく、受け口の安全（署名、data の形、1 対 1、本人だけ、古いボタン、最小権限、ログ、費用 0 円）も実用的に揃っている。AC5.1.15 の起点の読み方も妥当である。ただし、(1) BR7.17 と NFR2.37 (b) の食い違いが Assumptions に残されたままで機能設計が直っていないこと（NFR2.37 の中身は正しく、直すのは機能設計の側）、(2) 3 秒の測定手順が U5 の担当の作り方（同じ日付と種類に 1 件、今日と「済」は作り直さない）と衝突し、20 回を実際には行えないこと、の 2 点が Major なので NOT-READY とする。
