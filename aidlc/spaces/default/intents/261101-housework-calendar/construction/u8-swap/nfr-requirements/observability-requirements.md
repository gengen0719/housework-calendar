# 見守りの要件（Observability）— U8 代わりにやる

U8（`u8-swap`）の見守りの要件です。U1〜U7 の要件（ログの形、リクエスト ID、30 日、書かないもの。NFR2.5〜NFR2.8、NFR2.21〜NFR2.23、NFR2.32、NFR2.40〜NFR2.43、NFR2.51〜NFR2.53、NFR7.6、NFR7.24、NFR7.32、NFR7.38）をそのまま使います。U8 は LINE の `line` の Lambda が中心で、確定・記録・担当の変更のフックは `api` と `line` の両方で動きます。作り手への知らせ（15 分以内）は U10 で入れます。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.63 | 申し出のできごとをログに残す（BR9.18）。`SWAP_LISTED`（`familyId`、`count`＝候補の数、`shown`＝ボタンに出した数、理由の印があるときはその印、`durationMs`）、`SWAP_OFFERED`（`familyId`、`dutyId`、`offerId`、`durationMs`）、`SWAP_ACCEPTED`（`familyId`、`dutyId`、`offerId`、`durationMs`）、`SWAP_WITHDRAWN`（`familyId`、`dutyId`、`offerId`、`durationMs`）、`SWAP_REJECTED`（`familyId`、`dutyId`（分かるとき）、`op`＝`list`・`offer`・`accept`・`withdraw`、`reason`＝理由の印: `NO_SWAPPABLE_DUTY`・`MONTH_CONFIRMED`・`NOT_FOUND`・`OFFER_OWNER_ONLY`・`DUTY_NOT_TODO`・`ALREADY_OFFERED`・`OFFER_GONE`・`CANNOT_ACCEPT_OWN_OFFER`・`OFFER_ALREADY_ACCEPTED`・`INTERNAL`）、`SWAP_RETRY`（取引の読み直しをしたこと。`dutyId`、`op`。warn ではなく info）、`SWAP_GUIDE_SENT`（`reason`＝`ADMIN`（管理者が「家事交代」と送った）か `ONE_TO_ONE`（1 対 1 の案内）。家族の ID は分かるときだけ）。返事が送れなかったときは U1〜U6 と同じ名前の `LINE_REPLY_FAILED`（warn）。思いがけない失敗は、U1 の `describeError` で `REQUEST_ERROR` として残す。利用者は LINE の ID ではなくアプリの `userId` で残す。1 回の操作について、結果のイベントは 1 件だけ出す（成功か断りのどちらか） | ログの出し方の単体テストで、一覧（候補あり、候補なし、確定済み）、申し出、引き受け、取り下げ、各理由の断り、読み直し、管理者への案内、1 対 1 の案内、返事の失敗、思いがけない失敗のそれぞれに、上のイベントが 1 件ずつ出て、必要な項目が入っていること |
| NFR2.64 | フックの動きをログに残す（BR9.11、BR9.18）。(a) `SWAP_OFFER_CLOSED`（`familyId`、`dutyId`、`via`＝`child-changed`・`deleted`・`status-changed`・`recorded`）: 申し出が実際に `cancelled` になったときだけ 1 件（条件で断られた件は出さない。確定の 300 件で 300 行にならないようにするため）。(b) `DUTY_HOOKS_DONE`（`familyId`、`kind`、`count`＝渡されたイベントの数、`failed`＝投げた関数の数、`concurrency`＝並行数、`durationMs`）: `notifyDutyReassigned` の 1 回の呼び出しごとに 1 件（件数が 1 件のときも出す）。**`kind` の書き方**: 1 回の呼び出しの種類が 1 つ（例: 月の確定は `status-changed` だけ）のときは、その種類の文字列 1 つ。種類（`child-changed`・`deleted`・`status-changed`）が混ざるときは、文字列ではなく**種類ごとの件数のオブジェクト**（例: `{"child-changed": 2, "status-changed": 298}`。件数の合計は `count` と一致する）にする。`mixed` のような件数の分からない値は使わない。NFR7.46 の「フックの時間」の測定元になる。(c) `DUTY_HOOKS_TRUNCATED`（`familyId`、`skipped`＝打ち切って呼ばなかった数。NFR7.46 の段階 2 を採ったときだけ）。(d) 投げた関数は、既存の `DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED`（warn。`familyId`・`dutyId`・`kind` と `describeError` の結果。名前・単価は書かない）を 1 件ずつ残す | 300 件のイベント（開いた申し出 10 件、フックが投げる 2 件）で、`SWAP_OFFER_CLOSED` が 10 件、`DUTY_HOOKS_DONE` が 1 件（`count`＝300、`failed`＝2）、`DUTY_HOOK_FAILED` が 2 件出ること。条件で断られた 288 件がログに出ないこと |
| NFR2.65 | ログに、名前や秘密の情報、LINE の ID を残さない（BR9.18）。書かないもの: 子供・管理者の表示名、お手伝いの名前、**LINE のユーザー ID と LINE のグループ ID**、reply トークン、postback の data の全文、受け取った message の text、返事の本文（Flex Message やテンプレートの中身）、Webhook の本文、チャネルのトークンとシークレット、署名、秘密のヘッダーの値、単価と金額（U6 の NFR2.41、U7 の NFR2.52 と同じ考え）。形の外れた `swap.*` の postback や「家事交代」でない text を無視するときは、`LINE_EVENT_IGNORED` に `type` だけを書く（data や text の文字は書かない。NFR4.75、NFR4.76）。**既存の `GROUP_COMMAND_REJECTED`（U3 の `runGroupOperation`。いまは LINE のグループ ID `groupId` を書いている）は、U8 の経路でも出るので、`groupId` を書かない形に直す**（`reason` と、分かるときのアプリの `userId` だけにする）。この変更を `docs/contract-changes-u8.md` に一覧として残し、U3 のテストの期待も合わせて直す | 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・LINE のユーザー ID・グループ ID・reply トークン・data・text）を入れたイベントを、成功、すべての断り（`GROUP_NOT_REGISTERED`・`NOT_FAMILY_MEMBER` を含む）、`INTERNAL`、思いがけない例外、返事の失敗、形の外れた入力の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと。`GROUP_COMMAND_REJECTED` に `groupId` がないこと |
| NFR2.66 | U8 の失敗を、ログから `event` と `reason` で検索できる形で残す（`SWAP_REJECTED` の `reason: INTERNAL`、`REQUEST_ERROR`、`LINE_REPLY_FAILED`、`DUTY_HOOK_FAILED`・`DUTY_RECORDED_HOOK_FAILED`（`kind` が swap のフックに限らず全部）、`CONFIRM_POST_READ_FAILED`、`DUTY_HOOKS_TRUNCATED`）。U8 は指標とアラームを足さない（NFR1.33）。U10 が、これらのイベントを作り手への知らせの対象に入れる（15 分以内。NFR2）。それまでは、作り手が CloudWatch Logs で `INTERNAL` と 500 を検索して気づく。**引き継ぎは U10 の入力に書く**（置き場所: 機能設計の `functional-spec.md` の「次の単位への引き継ぎ」の U10 の行と、`construction/u8-swap/` の引き継ぎの記録に、この NFR2.66 の対象イベントの一覧（上の括弧のもの＋`DUTY_HOOKS_DONE` の `failed` が 1 以上の件）を書く。U10 の nfr-requirements は、その `functional-spec.md` の「次の単位への引き継ぎ」を読み取り元の 1 つにする）: 特に、フックの失敗は保存の結果を変えないので、画面にもグループにも出ない。ログでしか分からない | 上のイベントがすべて 1 行 1 件の JSON で `event` と `reason`（または `error`）を持つこと（NFR2.5 の形）。引き継ぎの書き込みが U10 の入力にあること（レビュー） |
| NFR7.49 | U8 の経路も、かかった時間をログに残す（U1 の NFR7.6、U6 の NFR7.32、U7 の NFR7.38）。`LINE_EVENT_DONE.durationMs`（既存。`begin` の後から `markDone` の後まで）と `REQUEST_END.durationMs`（既存）に加え、`SWAP_LISTED`・`SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN` に操作だけの `durationMs`、`DUTY_HOOKS_DONE` にフックの `durationMs` を残す。冷たい起動かどうかは、Lambda の `REPORT` の行の `Init Duration` で見分けられる（追加の実装は要らない）。3 秒の目標（NFR7.39〜NFR7.42）を、サーバー側の時間（NFR7.43）と照らして原因を分けられること | ログから `durationMs` を読めること。ステージングの測定で、`REPORT` の `Init Duration` の有無で冷たい起動を数えられること |

## ログの項目の対応

| 操作 | イベント | 使う値 |
|------|---------|--------|
| 「家事交代」（一覧） | `SWAP_LISTED`、または `SWAP_REJECTED`（`op: list`）、`SWAP_GUIDE_SENT` | `familyId`、候補の数、ボタンの数、理由の印、`durationMs`（アプリの ID と数だけ） |
| 担当を選ぶ | `SWAP_OFFERED`、または `SWAP_REJECTED`（`op: offer`） | `familyId`、`dutyId`、`offerId`、理由の印 |
| 引き受ける | `SWAP_ACCEPTED`、または `SWAP_REJECTED`（`op: accept`） | 同上 |
| 申し出をやめる | `SWAP_WITHDRAWN`、または `SWAP_REJECTED`（`op: withdraw`） | 同上 |
| 取引の読み直し | `SWAP_RETRY` | `dutyId`、`op` |
| フックの掃除 | `SWAP_OFFER_CLOSED`、`DUTY_HOOKS_DONE`、`DUTY_HOOKS_TRUNCATED`、`DUTY_HOOK_FAILED` | `familyId`、`dutyId`、`via`・`kind`、件数、`durationMs` |
| 共通 | `REQUEST_START` / `REQUEST_END` / `REQUEST_ERROR` / `LINE_EVENT_DONE` / `LINE_EVENT_IGNORED` | 既存の形（`type`、`durationMs`、`requestId`（NFR2.6）、環境（NFR2.5）） |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR7、NFR4、NFR5）
- `construction/u8-swap/functional-design/rules.md`（BR9.11、BR9.14、BR9.15、BR9.18）、`functional-spec.md`（結果の印と返事の対応、F5）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`（NFR2.5〜NFR2.8、NFR7.6）
- `construction/u3-notification-group/nfr-requirements/observability-requirements.md`（NFR2.21〜NFR2.23。`GROUP_COMMAND_REJECTED` の元の決め）
- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`（NFR2.32、NFR7.24）
- `construction/u6-recording/nfr-requirements/observability-requirements.md`（NFR2.40〜NFR2.43、NFR7.32。LINE の経路のログの形）
- `construction/u7-review-confirm/nfr-requirements/observability-requirements.md`（NFR2.51〜NFR2.53、NFR7.38）
- 既存コード（読むだけ）: `lib/logger.ts`（`describeError`、`setRequestId`）、`entries/line.ts`（`REQUEST_START`、`LINE_EVENT_DONE`、`LINE_EVENT_IGNORED`、`REQUEST_END`）、`services/groupCommandGate.ts`（`GROUP_COMMAND_REJECTED` が `groupId` を書いている）、`services/dutyReassignedHook.ts`（`DUTY_HOOK_FAILED`）、`services/dutyRecordedHook.ts`（`DUTY_RECORDED_HOOK_FAILED`）、`services/calendarService.ts`（`CONFIRM_POST_READ_FAILED`）

## Assumptions & Open Questions

- [assumption] `GROUP_COMMAND_REJECTED` の `groupId` を外す変更（NFR2.65）は、U3 の既存のログの形を U8 で変えることになります。機能設計の BR9.18 は「LINE のグループ ID は残さない」と決めているので、それに合わせました。U3 のテストが `groupId` を期待している場合は、コード生成で期待を直します。調べものに困る場合は、`familyId`（分かるときだけ）で足ります。承認の場で、この U3 のログの変更でよいかを確かめてください
- [assumption] `SWAP_OFFER_CLOSED` を実際に閉じたときだけ出す（NFR2.64 の (a)）のは、確定のたびに 300 行が出ないようにするためです。フックが「条件で断られた」ことを呼び出し側に返す形にはしません（関数の型を変えない）。件数の全体は `DUTY_HOOKS_DONE` の `count` で分かり、開いていた申し出の数は `SWAP_OFFER_CLOSED` の数で分かります
- [assumption] `SWAP_LISTED` などに `durationMs` を足すのは、フックの時間と操作の時間を分けて見るためです（NFR7.49）。操作の中身が重くなったときに原因を切り分けられます
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
