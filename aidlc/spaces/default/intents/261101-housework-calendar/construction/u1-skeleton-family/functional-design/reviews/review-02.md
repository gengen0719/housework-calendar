## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T02:43:28Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F3、F4、「最初の画面の決め方」の表の「記録がない（友だち登録していない）」の行 | 友だち登録していない人（利用者の記録がない人）が画面を開いたときの流れが成り立っていません。F3 と BR2.1 は「そのユーザー ID の利用者のセッションを発行する」としていますが、記録がなければ userId がなく、Session.userId（必須、User.userId を参照）も C2 のセッショントークン（利用者の userId を含む）も作れません。さらに F4 は `GET /me` が「どの画面を出すか」を答えるとしていますが、BR1.5 は友だちでない人の画面用 API を `NOT_FRIEND` で断るとしており、`GET /me` が答えるのか断るのかが食い違っています。契約 C1 の `Me` には友だちかどうかを表す項目がなく（userId と displayName が必須）、`NOT_FRIEND` の HTTP の状態（403 か 409 か）も決まっていません。Q2 で決めた「友だち登録の案内だけを出す」画面を、作り手が推測なしに作れません | 記録がない人とブロック中の人について、C2 のセッション発行で何を返すか（例: セッションを出さず 403 `NOT_FRIEND` を返す、または記録なしでも LINE のユーザー ID だけのセッションを出す）を決めて F3 と BR2.1 に書いてください。あわせて、`GET /me` が友だちでない人に何を返すか（`Me` に友だちかどうかの項目を足すか、`NOT_FRIEND` で断るか）を 1 つに決め、`NOT_FRIEND` の HTTP の状態を決めて、F4、BR1.5、表を合わせてください | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F2 ブロック、F7 手順 2、F5 手順 2 | 設計が使う家族とメンバーの窓口と画面用 API の形が、契約に書かれていないか、契約と食い違っています。(1) 契約 C3 では unfollow は「calls: なし」ですが、F2 と BR1.3 は利用者を「ブロック中」にするため、家族とメンバーの窓口を呼ぶ必要があります。その窓口の名前がどこにもありません。(2) F7 手順 2 と BR1.5 の「友だちであることを確かめる」に使う窓口がありません（契約 C6 の `getMembership` は familyId と role だけを返します）。(3) 契約 C6 の `createFamily(userId)` には家族の名前の引数がなく、C1 の `POST /families` には本文（requestBody）も 422 `INVALID_FAMILY_NAME` の応答もありません。rules.md の Assumptions は理由の印を C10 に足すことだけに触れています | 家族とメンバーの窓口に足すもの（例: ブロック中にする窓口、友だちかどうかを確かめる窓口または `getMembership` の結果への friendStatus の追加、`createFamily` の名前の引数）と、`POST /families` の本文（name）と 422 `INVALID_FAMILY_NAME` の応答を、functional-spec.md の該当する流れに名前と形で書いてください。C3 の unfollow の「calls」も、契約の変更として足すと明記してください | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F5 手順 5、rules.md > BR1.8 | 契約の「二重に届いたとき」には「画面からの操作も、同じ操作を 2 回送られても結果が同じになる作りにする」とあります。ところが F5 と BR1.8 では、家族を作った人が通信の切れなどで同じ `POST /families` を送り直すと 409 `ALREADY_IN_FAMILY` になり、いま家族を作ったばかりの人に「すでに家族に入っています」と出ます。AC1.1.5 の「別の家族を作ろうとした」場合と、同じ操作の送り直しを見分ける方法がありません | 送り直しを見分ける方法を決めて書いてください。例えば、作った人がすでに自分の家族の管理者で、同じ名前の家族を作ったばかりなら、その家族を成功として返す。または画面が操作ごとの ID を送り、同じ ID なら前の結果を返す。AC1.1.5 の表示とぶつからないことも書いてください | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「流れ」全体 | 契約 C1 は `GET /family/members`（家族のメンバーの一覧）を U1 の操作としていますが、functional-spec.md にこの操作の流れがありません。Q5 で家族を作ったあとにメンバーの一覧を出さないことにしたため、U1 で作るかどうかがはっきりしません | U1 で `GET /family/members` を作るなら流れ（F7 の確かめの 1〜3 を使う）を足してください。作らないなら、どの単位で作るかを書いてください | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「データのつながり」の erDiagram | `FAMILY \|\|--\|{ USER : "メンバー"` は、どの利用者も必ず 1 つの家族に入っているという意味になります。entities.md では User.familyId は必須ではない（家族に入っていない利用者がいる）ので、図が entities.md と合っていません | 利用者側から見て家族は 0 か 1 になるよう、図の線を `FAMILY \|o--\|{ USER` などに直してください | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F1 手順 7、rules.md > BR2.7 | 失敗したら処理済みの記録を消して LINE の送り直しで処理し直す、という前提になっていますが、(1) LINE の Webhook の送り直しは LINE の管理画面で有効にしないと行われないこと、(2) Lambda が時間切れで止まったときは記録を消す処理も動かず、そのイベントは二度と処理されないこと、が書かれていません。友だち登録のイベントを落とすと、Q2 の決定によりその人は使えなくなります | 送り直しを有効にすることを前提として書き、記録を消せずに止まった場合の扱い（例: 処理中と処理済みを分け、処理中のまま一定時間たったものは処理し直してよいとする）を決めてください | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > Assumptions & Open Questions の 2 つ目 | 友だちかどうかを、受け取ったイベントの記録だけで判断するとしています。友だち登録のイベントを落とした人や、受け口ができる前に友だち登録した人（ステージングでの確かめなど）は、友だちなのに「友だち登録の案内」しか出ず、すでに友だちなので登録し直しもできません。元に戻す道がありません | イベントの記録がない、またはブロック中のときだけ LINE に友だちかどうかを問い合わせて直す、または案内の画面に「ブロックして登録し直す」などの戻し方を書く、のどちらかを決めて書いてください | Resolved (reviewer) |
| R-08 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F1 手順 7、rules.md > BR2.7 | 思いがけない失敗のときに「処理中」の記録を消し、LINE の送り直しで処理し直すとしているが、契約 C3 の `response` は「確かめたあとは、処理の結果にかかわらず 200 を返す」となっている。LINE は 200 を受け取ったイベントを送り直さないので、記録を消してもそのイベントは二度と届かない。友だち登録は BR1.11 で後から直るが、ブロック（F2）を落とすとブロックした人が「友だち」のまま使い続けられる。作り手はどちらに従うか推測するしかない | 思いがけない失敗のときは 200 以外（例: 500）を返して LINE に送り直させると決め、C3 の `response` の変更を「契約への追加」に足す。または 200 のまま送り直しには頼らず、ブロックを落とした場合の扱い（例: F7 でも一定時間ごとに LINE に確かめる）を決めて書く | New |
| R-09 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「契約への追加」C6 の窓口の行 | 契約 C6 の familyScope は「家族を決める前に使う窓口（registerUser、getMembership、requireAdmin、createFamily、acceptInvitation、findFamilyByGroup）を除き、すべての窓口は最初の引数に ctx を必ず受け取る」としている。新しく足す `markBlocked(lineUserId)`、`findUserByLineId(lineUserId)`、`getUserStatus(userId)` は ctx を受け取らないが、この除外の一覧に足すと書かれていない | 3 つの窓口を familyScope の除外の一覧に足すことを「契約への追加」に書く | New |
| R-10 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F5 手順 6〜7、rules.md > BR2.8 | 要求の記録（RequestRecord）は家族を作った「あと」に残すとあり、家族の作成と一緒にできるか（両方できるか両方できないか）が決まっていない。家族はできたが記録を残す前に止まった場合や、同じ印の要求が同時に 2 つ届いた場合、送り直しは 409 `ALREADY_IN_FAMILY` になり、「作ったばかりの人にこの表示は出ない」という手順 6 の説明が成り立たない。RequestRecord の持ち主は画面用 API の入口で、家族は家族とメンバーが持つので、部品をまたいで一緒に書けるかも書かれていない | 家族の作成・利用者の更新・要求の記録を 1 回の書き込みでまとめるか、要求の記録に「処理中」を持たせて先に書くかを決めて書く。部品をまたぐ場合の持ち主の扱いも書く | New |
| R-11 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「契約への追加」C1 `POST /families` の行、F5 手順 4 | 送り直しで「201 と作った家族」を返すとあるが、契約 C1 の 201 には本文の形がなく、追加の一覧にも 201 の本文が足されていない。画面が作ったあとに何を受け取るか（Me の family と同じ形か）が決まっていない | 201 の本文の形（例: `{ familyId, name, role }`）を「契約への追加」に足す | New |
| R-12 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/rules.md > BR1.11 violation | LINE に問い合わせられなかったときを「503 INTERNAL」としているが、契約の「画面用 API の失敗の形」では INTERNAL は 500。503 は契約にない | 500 `INTERNAL` に直すか、503 を使うなら「契約への追加」に足す | New |
| R-13 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F1 手順 3 | 「まだなら処理済みとして記録する」とあり、手順 7 と BR2.7 の「まず処理中として書き、終わったら処理済みにする」と食い違う | 手順 3 を「処理中として記録する」に直す | New |
| R-14 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F4 手順 2、F7 手順 2 | セッションを持ったままブロックし、友だち登録し直したのに follow のイベントを落とした人は、記録が「ブロック中」のまま F7 で 403 `NOT_FRIEND` になる。BR1.11 の直しはセッションの発行のときにしか動かないので、セッションの期限が切れるまで（期限の長さは未定）使えない | 画面が 403 `NOT_FRIEND` を受け取ったら ID トークンを取り直して `POST /sessions` を呼び直す（BR1.11 が動く）、と F4 に書く | New |

> R-01 Reviewer note: F3 手順 5 と BR1.5・BR1.11 で、記録がない人は LINE に問い合わせ、友だちでなければ `POST /sessions` が 403 `NOT_FRIEND` を返してセッションを出さないと 1 つに決まった。GET /me はセッションを持つ人だけが届き、ブロック後は F7 で 403 `NOT_FRIEND`。HTTP の状態も「契約への追加」に書かれ、表とも合っている

> R-02 Reviewer note: 「契約への追加」に C3 unfollow の calls（`markBlocked`）、C6 の `markBlocked`・`findUserByLineId`・`getUserStatus`、`createFamily(userId, name)`、POST /families の本文・ヘッダー・422/400 が名前と形で書かれた。ただし ctx の決まりとの食い違いが残る（新しい指摘を参照）

> R-03 Reviewer note: BR2.8 と F5 手順 4 で `Idempotency-Key` による送り直しの見分け方が決まり、409 より先に判定すると書かれた。記録の書き込みが家族の作成と一緒でない場合の穴は新しい指摘で扱う

> R-04 Reviewer note: 「U1 で作る画面用 API の操作」の表で、`GET /family/members` は U2 で作ると書かれた

> R-05 Reviewer note: erDiagram が `FAMILY \|o--\|{ USER` に直り、User.familyId が任意であることと合っている

> R-06 Reviewer note: 再送を管理画面で有効にする前提（Assumptions と BR2.7）、処理中と処理済みの区別、止まった処理を時間で見分けてやり直すことが書かれた。ただし C3 の「必ず 200 を返す」と合わず再送が起きない点は新しい指摘で扱う

> R-07 Reviewer note: BR1.11 で、記録がない人とブロック中の人だけセッション発行時に LINE のプロフィール取得で友だちか確かめて直すと決まった

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| （なし） | ステージの定義に検証ツールは挙げられていない | 手で契約・要件・Q&A と突き合わせた |

### Summary

前回の 7 件はすべて直っています。残る大きな点は、失敗時に「処理中」を消して LINE の再送に頼る設計が、契約 C3 の「必ず 200 を返す」と合わず、ブロックのイベントを落とすと元に戻らないことです。Major は 1 件なので READY としますが、承認の前にこの点と、部品をまたぐ送り直しの記録の扱いを見てください。
