## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-02T12:54:06Z
**Iteration:** 1
**Verdict Dictated:** no

reviewed_at: 2026-11-02T12:54:06Z

この確認は助言（advisory）です。人が承認の前に考えるための材料として、重い順に並べています。人が Q1〜Q4 で決めたこと（確定と代わりにやるをカレンダーに置く、単価を書き写す、LINE のトークの受け口を独立させる、お小遣いの額を保存しない）は、問い直していません。

**確かめたこと**

- `depends_on` と `dependents` は 7 つの部品すべてで対応がとれていて（片方にだけ書かれた頼り方はない）、輪もありません。mermaid の図と文字での説明も YAML と同じです。
- データの持ち主は 11 のデータそれぞれに 1 つずつで、2 つの部品が同じデータを持つことはありません。
- FR1〜FR9 は、どれもいずれかの部品の受け持ちに載っています。US1.1〜US9.1 の 11 件は、すべて `traceability.json` で部品につながっています。
- ADR-001〜ADR-005 は、どれも Context / Decision / Consequences / Alternatives Rejected がそろっていて、Q1〜Q4 の回答と食い違うところはありません。
- NFR1（0 円）: 返事ではないお知らせは FR9.1 と FR9.2 だけで、お知らせの部品に集まっています。月 128 通の見積もりと、この分け方は矛盾しません。NFR7（3 秒）: 家族 4 人で、1 か月の担当が数百件なら、読むたびに計算しても達成できる見込みです（根拠は書類の [assumption] のとおりで、数値を測ったわけではありません）。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/components.md > お手伝いの種類 の responsibilities「割り当てに使われていない種類だけを消す（FR2.4）」 | 種類を消してよいかは「割り当てに使われたことがあるか」で決まりますが、割り当てを持つのはカレンダーです。お手伝いの種類はカレンダーに頼れません（カレンダーがお手伝いの種類に頼っているので、頼ると輪になります）。このままでは、どうやって確かめるかが決まっておらず、作るときに輪を作るか、ほかの部品のデータを直接読むことになりがちです | 頼り方を一方向のまま保てる方法を 1 つ選んで書いてください。例: カレンダーが割り当てを保存するときに、お手伝いの種類に「使われた」と知らせ、お手伝いの種類がその印を自分のデータとして持つ。または、消す操作の受け付けをカレンダー側に置く | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/components.md > 画面 の behaviour と External Dependencies の「LINE ログイン」の行 | 画面は React でブラウザ（LIFF）の中で動くので、裏側の部品を直接呼べません。そのあいだにある裏側の受け口（画面からの要求を受け取る API）がどの部品にも書かれていません。NFR4 の「画面からのすべての要求で LINE の認証の結果を確かめる」を受け持つ場所もはっきりせず、家族とメンバーの外部への頼りに「LINE ログイン」とあるだけです。次の作業単位の分割で、画面（静的な配信）と裏側（Lambda）をどう分けるかを決めるときに迷います | 「画面」がブラウザ側だけなのか、裏側の受け口も含むのかを書いてください。裏側の受け口を含むなら、その受け持ち（すべての要求で認証を確かめ、家族とメンバーに「この操作をしてよいか」を問い合わせてから各部品に渡す）を responsibilities に足してください。LINE のトークの受け口と同じように、独立した部品にしてもかまいません | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/components.md > External Dependencies の「AWS の監視と通知」の行 | NFR2 の「裏側の処理でエラーが起きたら 15 分以内に作り手に知らせる」は、表では「お知らせ（ほかの部品のエラーも）」となっていますが、お知らせの部品の responsibilities には FR9.5 の送信の失敗しかありません。ほかの部品のエラーを知らせる受け持ちがどこにもありません | ほかの部品のエラーを知らせることを、どの部品の受け持ちでもない共通の仕組み（インフラの設計で決める）とするか、どれかの部品の受け持ちに足すかを書いてください | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/components.md > カレンダー（担当と記録） の responsibilities | 日本時間で日付を扱うこと（NFR11）は、お知らせの部品にしか書かれていません。カレンダーも「今日まで」（FR5.5）、「明日以降」（FR3.3）、「担当の日が過ぎた」（FR7.5）、今日の担当（FR5.1）で日付の区切りを使います | カレンダーの受け持ちにも NFR11 を足すか、日付の区切りを全部品の共通の決まりとして書いてください | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/decisions.md > ADR-002 Decision「お小遣いは、加算・減額を受け付ける前に、月が確定しているかをカレンダーに問い合わせます」 | 問い合わせたあと、加算・減額を保存するまでのあいだに管理者が月を確定すると、確定した月に加算・減額が入ることがあります。管理者は 1 人なので起きにくいですが、FR6.5 の「確定している月は誰も変更できない」を必ず守れる形にはなっていません | 次の段階（機能の設計）で、確定の確かめと加算・減額の保存を 1 回の書き込みで条件つきにする、などの守り方を決めると書き残してください | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/components.md > LINEのトークの受け口 の responsibilities「返事を 3 秒以内に返す（NFR7）」 | 返事が間に合わなかったときの扱いが書かれていません。返事の代わりにプッシュで送ると、無料枠の月 200 通（NFR1）を使ってしまいます | 返事が送れなかったときにプッシュで送り直さない（NFR1 を守るため）ことを、受け持ちか前提として書いてください | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/decisions.md > ADR-001〜ADR-005 | 段階の決まりでは、大きな設計の決定ごとに安全への影響を書くことになっていますが、ADR には安全についての項目がありません。特に ADR-004（LINE から届いたことの確かめを 1 か所に集める）と ADR-001（どの部品が「この操作をしてよいか」を確かめるか）は安全に直接かかわります | ADR-001 と ADR-004 の Consequences に、安全への影響（どこで認証と権限を確かめるか、確かめ忘れが起きない理由）を 1〜2 行足してください | New |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/inception/domain-design/traceability.json > coverage の US5.1、US7.1、US1.2 | US5.1・US7.1・US1.2 は LINE のトークの受け口と画面も受け持っていますが（Component Summary の表のとおり）、`traceability.json` の target はカレンダーか家族とメンバーだけです。作業単位の分割でストーリーを単位に割り当てるときに、入口の部品が抜けて見えます | target に LINE のトークの受け口と画面も書くか、主な部品だけを書く決まりであることを書類に書いてください | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| depends_on と dependents の対応の確認（手で確認） | PASS: 7 部品すべてで対応がとれている | 片方にだけ書かれた頼り方はない |
| 輪の確認（手で確認） | PASS: 家族とメンバー → お手伝いの種類 → カレンダー → お小遣い → お知らせ・画面 の順に並べられる | ただし FR2.4 の確かめ方が決まると輪ができるおそれがある（1 つ目の Major） |
| データの持ち主の確認（手で確認） | PASS: 11 のデータそれぞれに持ち主が 1 つ | 2 つの部品が同じデータを持つことはない |
| ストーリーの対応の確認（手で確認） | PASS: `stories.md` の US1.1〜US9.1 の 11 件すべてが `traceability.json` にある | 抜けているストーリーはない |
| 段階で決められた検査の道具 | 実行していない: この段階の依頼に、動かす検査の道具は書かれていなかった | 上の確認は書類を読んで手で行った |

### Summary

部品の分け方、データの持ち主、頼り方の向きはしっかりしていて、Q1〜Q4 の回答とも合っています。Critical はなく、Major は 2 つです。1 つは、お手伝いの種類を消してよいかの確かめ方が決まっておらず、決め方しだいで頼り方が輪になること。もう 1 つは、画面からの要求を受ける裏側の受け口と、NFR4 の認証を確かめる場所がはっきりしないことです。どちらも作業単位の分割の前か、その中で直せます。
