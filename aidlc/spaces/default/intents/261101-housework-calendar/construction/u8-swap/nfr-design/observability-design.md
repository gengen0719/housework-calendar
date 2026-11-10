# 見守りの設計（Observability Design）— U8 代わりにやる

U8（`u8-swap`）の見守りの要件（`nfr-requirements/observability-requirements.md` の NFR2.63〜NFR2.66、NFR7.49）を、どう作るかを書きます。U1〜U7 の設計（1 行 1 件の JSON、`requestId`、30 日の保管、名前・秘密を書かない、`describeError`）はそのまま使います。U8 は指標とアラームを足しません（NFR1.33）。作り手への知らせ（15 分以内）は U10 で入れます。それまでは CloudWatch Logs の検索で気づきます。

## 方針

- ログは `lib/logger.ts` の既存の形で出す。`event` は大文字の名前、`familyId`・`dutyId`・`offerId`・`userId`（アプリの ID）・`durationMs`・`reason` などの項目を JSON で並べる
- **1 回の操作について、結果のイベントは 1 件だけ**（成功か断りのどちらか）
- 利用者は LINE の ID ではなくアプリの `userId` で残す

## U8 のできごとのログ（NFR2.63）

| 操作 | イベント | 項目 | レベル |
|------|---------|------|--------|
| 一覧 | `SWAP_LISTED` | `familyId`、`count`（候補の数）、`shown`（ボタンに出した数）、理由の印があるときはその印、`durationMs` | info |
| 申し出る | `SWAP_OFFERED` | `familyId`、`dutyId`、`offerId`、`durationMs` | info |
| 引き受ける | `SWAP_ACCEPTED` | 同上 | info |
| 取り下げる | `SWAP_WITHDRAWN` | 同上 | info |
| 断り | `SWAP_REJECTED` | `familyId`、`dutyId`（分かるとき）、`op`（`list`・`offer`・`accept`・`withdraw`）、`reason`（理由の印） | info |
| 取引の読み直し | `SWAP_RETRY` | `dutyId`、`op`（warn ではなく info） | info |
| 管理者・1 対 1 への案内 | `SWAP_GUIDE_SENT` | `reason`（`ADMIN` か `ONE_TO_ONE`）、`familyId`（分かるときだけ） | info |
| 返事が送れなかった | `LINE_REPLY_FAILED`（U1〜U6 と同じ名前） | `describeError` の結果 | warn |
| 思いがけない失敗 | `REQUEST_ERROR`（U1 の `describeError`） | `error` | error |

`SWAP_REJECTED` の `reason` は次の印です: `NO_SWAPPABLE_DUTY`・`MONTH_CONFIRMED`・`NOT_FOUND`・`OFFER_OWNER_ONLY`・`DUTY_NOT_TODO`・`ALREADY_OFFERED`・`OFFER_GONE`・`CANNOT_ACCEPT_OWN_OFFER`・`OFFER_ALREADY_ACCEPTED`・`INTERNAL`。`GROUP_NOT_REGISTERED`・`NOT_FAMILY_MEMBER` は入口の `GROUP_COMMAND_REJECTED`（下記）が出すので、`SWAP_REJECTED` では重ねて出しません。

- 一覧の結果が「候補なし」「確定済み」のときは、`SWAP_LISTED` ではなく `SWAP_REJECTED`（`op: list`、`reason: NO_SWAPPABLE_DUTY` か `MONTH_CONFIRMED`）にします（結果のイベントは 1 件）
- 単体テストで、一覧（候補あり・候補なし・確定済み）、申し出、引き受け、取り下げ、各理由の断り、読み直し、管理者への案内、1 対 1 の案内、返事の失敗、思いがけない失敗のそれぞれに、上のイベントが 1 件ずつ出て、必要な項目が入っていることを確かめます

## フックの動きのログ（NFR2.64）

| イベント | いつ | 項目 | レベル |
|---------|------|------|--------|
| `SWAP_OFFER_CLOSED` | 申し出が**実際に `cancelled` になったときだけ**（条件で断られた件は出さない。確定の 300 件で 300 行にならないように） | `familyId`、`dutyId`、`via`（`child-changed`・`deleted`・`status-changed`・`recorded`） | info |
| `DUTY_HOOKS_DONE` | `notifyDutyReassigned` の 1 回の呼び出しごとに 1 件（件数が 1 件のときも出す） | `familyId`、`kind`、`count`（渡されたイベントの数）、`failed`（投げた関数の数）、`concurrency`（並行数）、`durationMs` | info |
| `DUTY_HOOKS_TRUNCATED` | 段階 2 の締め切りを採ったときだけ | `familyId`、`skipped`（打ち切って呼ばなかった数） | warn |
| `DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED`（既存） | 投げた関数 1 件ごと | `familyId`、`dutyId`、`kind`、`describeError` の結果。名前・単価は書かない | warn |

- **`kind` の書き方**: 1 回の呼び出しの種類が 1 つ（例: 月の確定は `status-changed` だけ）のときは、その種類の文字列。種類が混ざるときは、文字列ではなく**種類ごとの件数のオブジェクト**（例: `{"child-changed": 2, "status-changed": 298}`。件数の合計は `count` と一致する）にします。`mixed` のような件数の分からない値は使いません
- `DUTY_HOOKS_DONE` の `durationMs` は、`notifyDutyReassigned` の入口から戻るまでです。`performance-design.md` のフックの時間の目標（95% が 1,000 ms 以内）の測定元になります
- `DUTY_HOOKS_DONE` は `mapWithConcurrency` の完了後に 1 回だけ出すので、関数が増えても行数は増えません。`failed` は `worker` 内の `catch` で数えます
- 単体テストで、300 件のイベント（開いた申し出 10 件、フックが投げる 2 件）に対し、`SWAP_OFFER_CLOSED` が 10 件、`DUTY_HOOKS_DONE` が 1 件（`count`＝300、`failed`＝2）、`DUTY_HOOK_FAILED` が 2 件出ること、条件で断られた 288 件がログに出ないことを確かめます

## ログに残さないもの（NFR2.65）

- 書かないもの: 子供・管理者の表示名、お手伝いの名前、**LINE のユーザー ID と LINE のグループ ID**、reply トークン、postback の data の全文、受け取った message の text、返事の本文（Flex Message やテンプレートの中身）、Webhook の本文、チャネルのトークンとシークレット、署名、秘密のヘッダーの値、単価と金額
- 形の外れた `swap.*` の postback や「家事交代」でない text を無視するときは、`LINE_EVENT_IGNORED` に `type` だけを書きます
- **範囲（レビュー R-03）**: 「LINE のグループ ID を残さない」が守る範囲は **U8 の経路（`runGroupOperation` を通る「家事交代」と swap.* の操作）だけ**です。その経路で出るログのうち、既存で `groupId` を書いているのは `GROUP_COMMAND_REJECTED` だけなので、これだけを直します。ほかの既存のログ（例: `joinHandler.ts` の `GROUP_JOINED`、`NOTIFICATION_GROUP_REJECTED`、`GROUP_SUMMARY_FAILED`）は LINE のグループ ID を書いたままで、U8 の対象外です（変えません。U8 の経路では出ません）
- **`GROUP_COMMAND_REJECTED`（U3 の `runGroupOperation`）は、いま `groupId` を書いているので、U8 で `groupId` を書かない形に直します**（`reason` と、分かるときのアプリの `userId` だけ）。この変更を `docs/contract-changes-u8.md` の一覧に残し、U3 のテストの期待も合わせて直します。調べものには `familyId`（分かるときだけ）で足ります
- 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前（タグや改行、21 文字以上を含む）・LINE のユーザー ID・グループ ID・reply トークン・data・text）を入れたイベントを、成功、すべての断り（`GROUP_NOT_REGISTERED`・`NOT_FAMILY_MEMBER` を含む）、`INTERNAL`、思いがけない例外、返事の失敗、形の外れた入力の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないことを確かめます。`GROUP_COMMAND_REJECTED` に `groupId` がないことも確かめます

## 失敗の見つけ方（NFR2.66）

U8 は指標もアラームも足しません。失敗は、ログから `event` と `reason`（または `error`）で検索できる形で残ります。

| 見つけたい失敗 | 検索するもの |
|--------------|------------|
| 取引の読み直しが続けて断られた | `SWAP_REJECTED` の `reason: INTERNAL` |
| 思いがけない失敗（500） | `REQUEST_ERROR` |
| 返事が送れなかった | `LINE_REPLY_FAILED` |
| フックが投げた（swap に限らず全部） | `DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED`、`DUTY_HOOKS_DONE` の `failed` が 1 以上 |
| 確定のあとの一覧の読み取りが失敗した | `CONFIRM_POST_READ_FAILED` |
| フックを打ち切った | `DUTY_HOOKS_TRUNCATED` |

- 作り手は、それまで CloudWatch Logs で `INTERNAL` と 500 を検索して気づきます。**フックの失敗は保存の結果を変えないので、画面にもグループにも出ません。ログでしか分かりません**
- **U10 への引き継ぎ**: U10 が、上の表のイベントを作り手への知らせの対象に入れます（15 分以内。NFR2）。この一覧を、機能設計の `functional-spec.md` の「次の単位への引き継ぎ」の U10 の行と、`construction/u8-swap/` の引き継ぎの記録に書きます。U10 の nfr-requirements は、その「次の単位への引き継ぎ」を読み取り元の 1 つにします。名前と形は U10 まで変えません

## かかった時間のログ（NFR7.49）

| 時間 | 出どころ | 使い道 |
|------|---------|--------|
| `LINE_EVENT_DONE.durationMs`（既存。`begin` の後から `markDone` の後まで） | `entries/line.ts` | NFR7.43 の補助の目標 |
| `REQUEST_END.durationMs`（既存） | `entries/line.ts`、`entries/api.ts` | NFR7.43、NFR7.46 |
| `SWAP_LISTED`・`SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN` の `durationMs` | U8 の操作だけ（入口の確かめと reply を除く） | 操作の中身が重くなったときの切り分け |
| `DUTY_HOOKS_DONE.durationMs` | `notifyDutyReassigned` | NFR7.46 の「フックの時間」 |
| `REPORT` の `Init Duration`（Lambda が出す） | 追加の実装は要らない | 冷たい起動の数え方（NFR7.48 の 4.） |

3 秒の目標（NFR7.39〜NFR7.42）を、サーバー側の時間（NFR7.43）と照らして原因を分けられるようにします。**合格の判断は画面録画の結果だけ**で、サーバー側の時間は補助です。

## SLI と見方

| 見たいこと | 見るもの | 目安 |
|-----------|---------|------|
| 返事の速さ | `LINE_EVENT_DONE.durationMs`、`REQUEST_END.durationMs` の 95% | 2,000 ms 以内（補助） |
| 確定の速さ | `REQUEST_END.durationMs`（確定のパス）、`DUTY_HOOKS_DONE.durationMs` の 95% | 2,000 ms、1,000 ms 以内 |
| 申し出の結果 | `SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN` と `SWAP_REJECTED` の `reason` の分布 | `INTERNAL` が 0 に近いこと |
| フックの健全さ | `DUTY_HOOKS_DONE.failed`、`DUTY_HOOK_FAILED` の件数 | 0 |
| 掃除の効き | `SWAP_OFFER_CLOSED` の数と、確定時に開いていた申し出の数 | 一致（測定 1 回目） |

SLO の数値化と指標・アラームの設計は U10 で行います。U8 は検索できる形にそろえるところまでです。

## 相関 ID の持ち回り

`requestId`（NFR2.6）は U1 のまま、`line` と `api` の入口で `setRequestId` し、U8 のログの全行に入ります。1 回の webhook に複数のイベントがあっても、各イベントのログは同じ `requestId` で束ねられ、`dutyId`・`offerId` で操作を追えます。

## Sources

- `construction/u8-swap/nfr-requirements/observability-requirements.md`（NFR2.63〜NFR2.66、NFR7.49）、`performance-requirements.md`（NFR7.43、NFR7.46、NFR7.48）、`reliability-requirements.md`（NFR2.58、NFR2.59、NFR2.60）、`security-requirements.md`（NFR4.75、NFR4.76、NFR4.84）
- `construction/u8-swap/functional-design/rules.md`（BR9.11、BR9.14、BR9.15、BR9.18）、`functional-spec.md`（結果の印と返事の対応）
- `construction/u7-review-confirm/nfr-design/observability-design.md`（形の手本）
- 既存コード（読むだけ）: `lib/logger.ts`、`entries/line.ts`、`services/groupCommandGate.ts`（`GROUP_COMMAND_REJECTED` が `groupId` を書いている）、`services/dutyReassignedHook.ts`、`services/dutyRecordedHook.ts`、`services/calendarService.ts`（`CONFIRM_POST_READ_FAILED`）

## Assumptions & Open Questions

- [assumption] `GROUP_COMMAND_REJECTED` から `groupId` を外す変更は、U3 の既存のログの形を U8 で変えます。機能設計の BR9.18 に合わせた変更です。U3 のテストが `groupId` を期待していればコード生成で直します。承認の場で、この変更でよいかを確かめてください
- [assumption] `SWAP_OFFER_CLOSED` を実際に閉じたときだけ出すため、フックが「条件で断られた」ことを呼び出し側に返す形にはしません（関数の型を変えない）。件数の全体は `DUTY_HOOKS_DONE` の `count` で、開いていた申し出の数は `SWAP_OFFER_CLOSED` の数で分かります
- [assumption] `SWAP_LISTED` などに `durationMs` を足すのは、フックの時間と操作の時間を分けて見るためです
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
