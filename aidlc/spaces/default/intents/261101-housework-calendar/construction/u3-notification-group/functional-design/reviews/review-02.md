## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 2
**Verdict Dictated:** no

### 概要

U3 の機能設計（entities.md、rules.md、functional-spec.md、traceability.json）を、US1.2（AC1.2.1〜AC1.2.5）と契約のまとめ（C3、C6、C10）に照らして出し直しを確かめました。前回の R-01〜R-08 は、各文書に「レビュー R-xx」の印つきで直しが入っています。なお review-01.md の本文は表が空で、R-01〜R-08 の中身が書かれていません。そのため、各指摘の中身は修正箇所の印と前回の概要（R-01: U10 の宛先の窓口、R-02: 別の家族の人の扱い、R-03: 一意性の守り方）から読み取りました。実行できる検証ツールはなく、確かめたのは文書どうしの突き合わせです。

### 前回の指摘の状況

| ID | 状況 | 確かめた内容 |
|---|---|---|
| R-01 | Resolved | functional-spec.md の契約への追加で、`getNotificationGroup(ctx): groupId \| NOTIFICATION_GROUP_NOT_REGISTERED` を契約のまま変えないと明記しています。画面用には別の `getNotificationGroupView` を足し、グループ ID を画面に返しません。U10 が push の宛先を得る窓口は残っています |
| R-02 | Resolved | rules.md の BR4.10 と functional-spec.md の F4 で、登録済みのグループでも、操作した人がそのグループの家族のメンバーか C6 `getMembership` で確かめます。違えば「このアプリは家族のメンバーだけが使えます」と返し、グループの家族の情報は返しません。ctx は確かめが通ったときだけ作ります。これは契約の familyScope と合っています |
| R-03 | Resolved | BR4.6 と BR4.9 が、置き換えと取り外しを条件つきの 1 回のトランザクションにしました。条件は 3 つ（新しいグループの記録、家族の notificationGroupId、前のグループの記録）で、グループ→家族と家族→グループの両方向の一意を同じ書き込みで守ります。再試行は 1 回までと決まっています。entities.md の制約の書き方とも合っています |
| R-04 | Resolved | 子供を断る理由の印は U1 の `ADMIN_ONLY` を使い、LINE の文言だけ `NOTIFICATION_GROUP_ADMIN_ONLY` にします。新しい理由の印を足さず、契約の「消さない・意味を変えない」に反しません |
| R-05 | Resolved | BR4.13 が 1 対 1 のトークと room の扱いを決めました。1 対 1 は案内を返し、room は何も返しません。BR4.1 の room での無言とも合っています |
| R-06 | Resolved | BR4.7 の返事に家族の名前が入ってグループの他の人にも見えることを、受け入れる判断として Assumptions に書きました。登録するのは管理者が選んだ家族のグループで、名前は 1〜20 文字の呼び名です |
| R-07 | Resolved | BR4.8 でグループ名の取得を 2 秒で打ち切り、失敗しても登録を止めません（reply トークンの期限と NFR7 の 3 秒に収まります）。BR4.4 の文言の分かりにくさも、README の「困ったとき」に書く方針が Assumptions にあります |
| R-08 | Resolved | BR4.9（外されたら登録を外す）が FR1.5 にまだない点を、`docs/contract-changes-u3.md` の一覧で要件への反映を待つものとして Assumptions に書きました。traceability.json の reverse にも N/A として根拠つきで載っています |

### 新しい指摘

| ID | Severity | Location | Finding | Required action |
|---|---|---|---|---|
| R-09 | Minor | construction/u3-notification-group/functional-design/functional-spec.md > 契約への追加 > C6 家族とメンバー（`registerNotificationGroup`） | 契約では `registerNotificationGroup(ctx, groupId): void \| ADMIN_ONLY` ですが、U3 は `(ctx, groupId, groupName): { familyName } \| ADMIN_ONLY \| GROUP_USED_BY_OTHER_FAMILY` に変えています。引数と戻り値の形を変えており、項目や操作を足すだけの変更とは言えません。この窓口を使う他の単位があれば食い違います | `docs/contract-changes-u3.md` に、既存の窓口の形を変える変更として載せ、利用者がほかにいないことを確かめます。または別名の窓口に分けます |
| R-10 | Minor | construction/u3-notification-group/functional-design/traceability.json > coverage の AC1.2.5、reverse | AC1.2.5 の対応先に BR4.13 を入れていますが、BR4.13 は登録の操作が 1 対 1 のトークや room に届いたときの扱いで、AC1.2.5 の中身ではありません。一方、BR4.13 は reverse には載っていません | BR4.13 を AC1.2.5 の対応先から外し、reverse に N/A（FR1.5。グループ以外での登録の扱い）として載せます。functional-spec.md の対応表も同じに直します |

### Summary

R-01〜R-08 はいずれも直っており、文書どうしの食い違いは見つかりませんでした。AC1.2.1〜AC1.2.5 の対応はそろっています。残るのは Minor の R-09、R-10 だけで、実装を止めるものではありません。実装に進めます。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
