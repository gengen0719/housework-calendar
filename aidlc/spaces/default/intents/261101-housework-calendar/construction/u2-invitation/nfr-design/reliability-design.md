# 信頼性の設計（Reliability Design）— U2 招待

U2（`u2-invitation`）の信頼性の要件（NFR2.10〜NFR2.13、NFR6.3）を、どう作るかを書きます。U1 の設計（入口のエラーハンドラー、TransactWriteItems、送り直しの記録）はそのまま使います。

## 招待の作り直し（NFR2.10、NFR2.12、BR3.4）[Q1]

1. Families を強い整合性で読み、`currentInvitationToken`（なければ空）を覚える
2. 新しい印と招待の ID を作る
3. 1 で覚えた印があれば、その Invitations の項目を強い整合性で読む。TTL で消えていれば（項目がない）、前の招待の Update は組み立てに含めない（レビュー R-02）
4. TransactWriteItems で次を一緒に書く（前の招待があれば 4 件、なければ 3 件）
   - Families の Update: `currentInvitationToken` と `currentInvitationId` を新しい値にする。条件は「`currentInvitationToken` が 1 で覚えた値と同じ（なければ属性がない）」
   - Invitations の Put: 新しい招待（`status: active`、`expiresAt` = 今 + 24 時間、`ttl` = 期限 + 7 日）。条件は「同じ印がない」
   - Invitations の Update（3 で項目があったときだけ）: `status: replaced`。条件は `attribute_exists(#token)`。読んでから書くまでの間に TTL で消えたときは、この条件で断られ、5 のやり直しで項目なしとして組み立て直す
   - RequestRecords の Put: U1 の `requestRecordRepository.buildPutItem` で、`operation: createInvitation`、`target: familyId`、結果（201 と応答の本文）を一緒に書く。条件は「同じ利用者と印の組がない」（レビュー R-01）
5. 断られたら（`TransactionCanceledException`）、`CancellationReasons` の並びで、どの項目の条件かを見る
   - RequestRecords の条件 → 記録を読み直す。`operation` と `target` が同じなら、前の結果をそのまま返す。違えば 422 `IDEMPOTENCY_KEY_REUSED`
   - Families または前の招待の条件 → 1 から 1 回だけやり直す。それでも断られたら 500 `INTERNAL`
6. どれかが失敗すれば、どれも書かれない。前の招待は使えるまま残る

## 参加（NFR2.11、BR3.8）

1. 最初に RequestRecords を読み、同じ利用者と印の記録があれば、`operation` と `target` が同じなら前の結果を返し、違えば 422 `IDEMPOTENCY_KEY_REUSED`（U1 の送り直しと同じ作り。参加したあとの送り直しが `ALREADY_IN_FAMILY` にならない）
2. `resolveUsableInvitation(token, now)`（`security-design.md`）で招待を確かめ、Users を強い整合性で読み、家族に入っていれば `ALREADY_IN_OTHER_FAMILY` か `ALREADY_IN_FAMILY`
3. TransactWriteItems で次の 4 つを一緒に確かめて書く
   - Users の Update: `familyId`、`role: child`、`familyJoinedAt` を入れる。条件は「`familyId` がない」かつ「`friendStatus` が `friend`」
   - Invitations の ConditionCheck: 「`status` が `active`」かつ「`expiresAt` > 今」
   - Families の ConditionCheck: 「`currentInvitationToken` がこの印」
   - RequestRecords の Put: `operation: acceptInvitation`、`target` は印の SHA-256（印そのものは持たない。レビュー R-06）、結果（200）。条件は「同じ利用者と印の組がない」（レビュー R-01）
4. 断られたら、どの条件で断られたか（`CancellationReasons` の並び）を見る
   - RequestRecords の条件 → 1 と同じく記録を読み直して前の結果か 422 `IDEMPOTENCY_KEY_REUSED`
   - Users の条件 → Users を読み直して `ALREADY_IN_OTHER_FAMILY` か `ALREADY_IN_FAMILY`
   - Invitations か Families の条件 → `INVITATION_INVALID`

## 筋書きにする競合と失敗（NFR8.4。レビュー R-07）

コード生成で、受け入れ条件の筋書きに加えて、次を Given/When/Then の筋書きにします。

- 2 つの端末から同時に招待を作り直すと、使える招待は 1 つだけになる
- 招待を開いたあと、管理者が作り直してから「参加する」を押すと、参加できない
- 招待を開いたあと、期限が過ぎてから「参加する」を押すと、参加できない
- 前の招待が TTL で消えたあとでも、作り直せる
- 同じ `Idempotency-Key` で招待を作る要求を 2 回送ると、招待は 1 つで、同じリンクが返る
- 同じ `Idempotency-Key` で別の招待に参加しようとすると、422 で断られる
- 2 つの招待で同時に参加しようとすると、1 つの家族にだけ入る

## 時刻（NFR2.13）

- 期限の判断は裏側の `now`（入口で 1 回だけ取る。U1 の作り）で行う。画面の時刻は使わない
- `expiresAt` は ISO 8601 の UTC。画面は `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' })` で「11/9 17:30 まで使えます」の形にする
- `now` が `expiresAt` と同じ時刻なら使えない（`<` で比べる）

## 失敗したときの画面

| 応答 | 画面 |
|------|------|
| 409 `INVITATION_INVALID` / `ALREADY_IN_OTHER_FAMILY` / `ALREADY_IN_FAMILY` | C10 の文言（`ALREADY_IN_FAMILY` は「カレンダーへ」も出す） |
| 403 `ADMIN_ONLY` | U1 の文言。ボタンは出していないので、通常は起きない |
| 500 `INTERNAL`、通信の失敗 | U1 の「表示できませんでした。もう一度お試しください」と、もう一度のボタン（同じ `Idempotency-Key` で送り直す） |

## データ（NFR6.3）

- 招待・参加のデータはアプリの操作だけで変わる。本番のデータを手で書き換えない
- Invitations テーブルも、本番では CDK でスタックを消しても消えない設定（`RemovalPolicy.RETAIN`）にする（U1 の NFR6.2）

## Sources

- `construction/u2-invitation/nfr-requirements/reliability-requirements.md`
- `construction/u2-invitation/functional-design/rules.md`（BR3.4、BR3.6〜BR3.8）
- `construction/u1-skeleton-family/nfr-design/reliability-design.md`
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- [assumption] DynamoDB の TransactWriteItems は、取り消しのとき項目ごとの理由（`CancellationReasons`）を返します。どの条件で断られたかは、その並びで見分けます
