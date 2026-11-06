## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T02:37:42Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F3、F4、「最初の画面の決め方」の表の「記録がない（友だち登録していない）」の行 | 友だち登録していない人（利用者の記録がない人）が画面を開いたときの流れが成り立っていません。F3 と BR2.1 は「そのユーザー ID の利用者のセッションを発行する」としていますが、記録がなければ userId がなく、Session.userId（必須、User.userId を参照）も C2 のセッショントークン（利用者の userId を含む）も作れません。さらに F4 は `GET /me` が「どの画面を出すか」を答えるとしていますが、BR1.5 は友だちでない人の画面用 API を `NOT_FRIEND` で断るとしており、`GET /me` が答えるのか断るのかが食い違っています。契約 C1 の `Me` には友だちかどうかを表す項目がなく（userId と displayName が必須）、`NOT_FRIEND` の HTTP の状態（403 か 409 か）も決まっていません。Q2 で決めた「友だち登録の案内だけを出す」画面を、作り手が推測なしに作れません | 記録がない人とブロック中の人について、C2 のセッション発行で何を返すか（例: セッションを出さず 403 `NOT_FRIEND` を返す、または記録なしでも LINE のユーザー ID だけのセッションを出す）を決めて F3 と BR2.1 に書いてください。あわせて、`GET /me` が友だちでない人に何を返すか（`Me` に友だちかどうかの項目を足すか、`NOT_FRIEND` で断るか）を 1 つに決め、`NOT_FRIEND` の HTTP の状態を決めて、F4、BR1.5、表を合わせてください | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F2 ブロック、F7 手順 2、F5 手順 2 | 設計が使う家族とメンバーの窓口と画面用 API の形が、契約に書かれていないか、契約と食い違っています。(1) 契約 C3 では unfollow は「calls: なし」ですが、F2 と BR1.3 は利用者を「ブロック中」にするため、家族とメンバーの窓口を呼ぶ必要があります。その窓口の名前がどこにもありません。(2) F7 手順 2 と BR1.5 の「友だちであることを確かめる」に使う窓口がありません（契約 C6 の `getMembership` は familyId と role だけを返します）。(3) 契約 C6 の `createFamily(userId)` には家族の名前の引数がなく、C1 の `POST /families` には本文（requestBody）も 422 `INVALID_FAMILY_NAME` の応答もありません。rules.md の Assumptions は理由の印を C10 に足すことだけに触れています | 家族とメンバーの窓口に足すもの（例: ブロック中にする窓口、友だちかどうかを確かめる窓口または `getMembership` の結果への friendStatus の追加、`createFamily` の名前の引数）と、`POST /families` の本文（name）と 422 `INVALID_FAMILY_NAME` の応答を、functional-spec.md の該当する流れに名前と形で書いてください。C3 の unfollow の「calls」も、契約の変更として足すと明記してください | New |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F5 手順 5、rules.md > BR1.8 | 契約の「二重に届いたとき」には「画面からの操作も、同じ操作を 2 回送られても結果が同じになる作りにする」とあります。ところが F5 と BR1.8 では、家族を作った人が通信の切れなどで同じ `POST /families` を送り直すと 409 `ALREADY_IN_FAMILY` になり、いま家族を作ったばかりの人に「すでに家族に入っています」と出ます。AC1.1.5 の「別の家族を作ろうとした」場合と、同じ操作の送り直しを見分ける方法がありません | 送り直しを見分ける方法を決めて書いてください。例えば、作った人がすでに自分の家族の管理者で、同じ名前の家族を作ったばかりなら、その家族を成功として返す。または画面が操作ごとの ID を送り、同じ ID なら前の結果を返す。AC1.1.5 の表示とぶつからないことも書いてください | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「流れ」全体 | 契約 C1 は `GET /family/members`（家族のメンバーの一覧）を U1 の操作としていますが、functional-spec.md にこの操作の流れがありません。Q5 で家族を作ったあとにメンバーの一覧を出さないことにしたため、U1 で作るかどうかがはっきりしません | U1 で `GET /family/members` を作るなら流れ（F7 の確かめの 1〜3 を使う）を足してください。作らないなら、どの単位で作るかを書いてください | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > 「データのつながり」の erDiagram | `FAMILY \|\|--\|{ USER : "メンバー"` は、どの利用者も必ず 1 つの家族に入っているという意味になります。entities.md では User.familyId は必須ではない（家族に入っていない利用者がいる）ので、図が entities.md と合っていません | 利用者側から見て家族は 0 か 1 になるよう、図の線を `FAMILY \|o--\|{ USER` などに直してください | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > F1 手順 7、rules.md > BR2.7 | 失敗したら処理済みの記録を消して LINE の送り直しで処理し直す、という前提になっていますが、(1) LINE の Webhook の送り直しは LINE の管理画面で有効にしないと行われないこと、(2) Lambda が時間切れで止まったときは記録を消す処理も動かず、そのイベントは二度と処理されないこと、が書かれていません。友だち登録のイベントを落とすと、Q2 の決定によりその人は使えなくなります | 送り直しを有効にすることを前提として書き、記録を消せずに止まった場合の扱い（例: 処理中と処理済みを分け、処理中のまま一定時間たったものは処理し直してよいとする）を決めてください | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/functional-design/functional-spec.md > Assumptions & Open Questions の 2 つ目 | 友だちかどうかを、受け取ったイベントの記録だけで判断するとしています。友だち登録のイベントを落とした人や、受け口ができる前に友だち登録した人（ステージングでの確かめなど）は、友だちなのに「友だち登録の案内」しか出ず、すでに友だちなので登録し直しもできません。元に戻す道がありません | イベントの記録がない、またはブロック中のときだけ LINE に友だちかどうかを問い合わせて直す、または案内の画面に「ブロックして登録し直す」などの戻し方を書く、のどちらかを決めて書いてください | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| （なし） | このステージの定義には検証ツールがありません | 手で、受け入れ条件・契約（C1、C2、C3、C4、C6）・回答（Q1〜Q6）と突き合わせました。traceability.json の受け入れ条件（AC1.1.1〜AC1.1.13）はすべて行があり、OK の行の BR はすべて rules.md にあります |

### Summary

受け入れ条件との対応と回答の反映はできていますが、Q2 で決めた「友だちでない人には案内だけ」を、記録がない人のセッション発行と `GET /me` で成り立たせる方法が決まっていません。また、家族とメンバーの窓口と `POST /families` の形が契約と合っておらず、家族を作る操作の送り直しの扱いも契約に反しているため、このままでは作り手が推測して作ることになります。
