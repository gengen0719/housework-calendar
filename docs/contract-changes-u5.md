# U5 で足した契約の一覧

U5（`u5-assignment-calendar`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したもの、形を変えたものです。項目・操作・理由の印を足すのは契約の決まりで自由です。ただし、C1 の `PUT /months/{month}/assignment` の本文は、契約の `confirmOverwrite`（真偽値）を `confirmedChangesHash`（印）に**置き換えました**。画面と裏側はどちらも U5 で作るので、ほかの単位には影響しません。`contract-summary.md` への反映を待つ一覧として、`docs/contract-changes-u1.md`〜`docs/contract-changes-u4.md` に続けて残します。

## C1 画面用 API

| 操作                                | 足したもの・変えたもの | 中身                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/months/{month}/calendar`   | 応答                   | 家族のメンバー全員（子供も）。200 `MonthCalendar`、422 `INVALID_MONTH`、403 `NOT_FAMILY_MEMBER`                                                                                                                                                                                                                                    |
| `GET /v1/months/{month}/assignment` | 応答（新規）           | 家族のメンバー全員。200 `AssignmentView`（`{ month, rules, exists }`。割り当てがなければ `exists` は `false`、`rules` は空）、422 `INVALID_MONTH`、403 `NOT_FAMILY_MEMBER`                                                                                                                                                         |
| `PUT /v1/months/{month}/assignment` | 本文・応答             | 管理者。本文 `{ "rules": AssignmentRule[], "confirmedChangesHash"?: string }`（`confirmOverwrite` の置き換え。印は 64 文字の小文字の 16 進数）。行は 200 まで、種類は 90 まで。64 KB を超える本文は 413 `PAYLOAD_TOO_LARGE`。200 `MonthCalendar`、下の失敗の表を参照                                                               |
| `PATCH /v1/duties/{dutyId}`         | 操作（新規）           | 管理者。本文 `{ "childUserId": string }` だけ。200 `Duty`、422 `INVALID_REQUEST`、404 `NOT_FOUND`（担当がない・ほかの家族・子供でない人）、409 `MONTH_CONFIRMED`・`DUTY_NOT_TODO`、403 `ADMIN_ONLY`。契約の `changeDutyChild` を画面から呼ぶ入口。ほかの家族の `dutyId` は、本文が誤っていても 404（本文は担当を探したあとで読む） |

`PUT /months/{month}/assignment` の失敗:

| 状態 | 理由の印                          | 中身                                                                                                                                    |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 422  | `INVALID_MONTH`                   | 月の形が正しくない                                                                                                                      |
| 422  | `INVALID_ASSIGNMENT`              | 本文の形・曜日・行数・種類の数の誤り                                                                                                    |
| 422  | `MONTH_NOT_EDITABLE`              | 今月と来月以外                                                                                                                          |
| 422  | `CHORE_TYPE_INACTIVE`             | 「使わない」の種類が含まれる                                                                                                            |
| 422  | `ASSIGNMENT_OVERLAP`              | `details.overlaps`: `OverlapItem[]`（`{ date, weekday, choreTypeId, childUserIds }`）。同じ日の同じ種類に担当が 2 人以上                |
| 409  | `OVERWRITE_CONFIRMATION_REQUIRED` | `details.changes`: `OverwriteChange[]`、`details.changesHash`: 上書きの確かめの印。画面は印を `confirmedChangesHash` に入れて保存し直す |
| 409  | `MONTH_CONFIRMED`                 | 確定済みの月                                                                                                                            |
| 404  | `NOT_FOUND`                       | 種類・子供が、ない・ほかの家族・子供でない                                                                                              |
| 413  | `PAYLOAD_TOO_LARGE`               | 本文が 64 KB を超える                                                                                                                   |
| 500  | `INTERNAL`                        | 書き込みが 2 回続けて競合した、または残り時間が足りない。一部の担当が書き換わっていることがある（もう一度保存するとそろう）             |

## 共有の型（`packages/shared`）

| 型・値                                               | 中身                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Duty`                                               | 契約の項目に、**`origin`**（`'rule' \| 'manual' \| 'swap'`。割り当てから作った・管理者が変えた・引き受けた）、**`version`**（担当が変わるたびに増える整数）、**`recordedByName`**（記録した人の表示名。記録がなければ `null`）を足した。`choreName` は必須 |
| `MonthCalendar`                                      | 契約の `month`・`confirmed`・`hasAssignment`・`duties` に、**`children`**（`CalendarChild[]`、その家族の子供）、**`choreTypes`**（`CalendarChoreType[]`。担当に出てくる種類。「使わない」も含む）、**`today`**（裏側の日本時間の今日）を足した             |
| `hasAssignment`の意味                                | 割り当ての記録が**保存されているか**。行が 0 行の割り当てを保存した月でも `true`。担当の有無とは関係しない                                                                                                                                                 |
| `AssignmentRule`・`AssignmentView`                   | `{ choreTypeId, childUserId, weekdays }`（曜日は 0=日曜〜6=土曜）、`{ month, rules, exists }`                                                                                                                                                              |
| `SaveAssignmentRequest`・`ChangeDutyChildRequest`    | PUT・PATCH の本文                                                                                                                                                                                                                                          |
| `OverwriteChange`                                    | `{ date, choreTypeId, fromChildUserId, toChildUserId }`。**`toChildUserId` は `string \| null`**。作り直したあとにその日のその種類の担当がなければ `null`（画面は「なし」と出す）                                                                          |
| `OverlapItem`                                        | `{ date, weekday, choreTypeId, childUserIds }`                                                                                                                                                                                                             |
| `ASSIGNMENT_MAX_RULES`・`ASSIGNMENT_MAX_CHORE_TYPES` | 200、90（割り当ての入力の上限）                                                                                                                                                                                                                            |
| `jstDateOf`・`weekdayOf` ほか（`jstDate.ts`）        | 日本時間の日付の計算。画面と裏側で同じものを使う                                                                                                                                                                                                           |

## C8 カレンダーの窓口

| 窓口                                                                       | 足したもの・変えたもの | 中身                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `saveAssignment(ctx, month, rules, confirmedChangesHash, today, options?)` | 形（変更）             | 契約の `confirmOverwrite` を `confirmedChangesHash`（`string \| undefined`）に置き換え、`today`（日本時間の日付）と `options`（`now`、`remainingTimeMs`、`newId`）を足した。結果は `MonthCalendar` / `NOT_FOUND` / `CHORE_TYPE_INACTIVE` / `MONTH_CONFIRMED` / `MONTH_NOT_EDITABLE` / `ASSIGNMENT_OVERLAP`（`overlaps`）/ `OVERWRITE_CONFIRMATION_REQUIRED`（`changes`、`changesHash`）/ `INTERNAL`。契約の戻り値 `Assignment` ではなく、保存後の `MonthCalendar` を返す |
| `getAssignment(ctx, month)`                                                | 窓口（新規）           | `AssignmentView`。割り当てがなければ `exists: false`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `getMonthCalendar(ctx, month, today)`                                      | 形（変更）             | `today` を足した。Calendar の Query（強い整合性・1 回）、C6 のメンバー、C7 の種類を同時に読む。読み取りの回数は担当の数で増えない                                                                                                                                                                                                                                                                                                                                        |
| `changeDutyChild(ctx, dutyId, childUserId, options?)`                      | 結果の決まり           | `Duty` / `NOT_FOUND`（担当がない・ほかの家族・子供でない）/ `MONTH_CONFIRMED` / `DUTY_NOT_TODO` / `INTERNAL`。契約の戻り値に `NOT_FOUND` を明記した。`childUserId` は関数でも渡せる（担当の 404 のあとに本文を読むため）                                                                                                                                                                                                                                                 |
| `isChoreTypeAssigned(ctx, choreTypeId)`                                    | **本物**               | U4 の仮の窓口（いつも `false`）を、強い整合性の Query に置き換えた。Scan・結果整合の索引は使わない。取り付けは `entries/api.ts`（`setCalendarPort`）。`choreTypeService` は `calendarPort` の形だけに頼り、`calendarService` を import しない（循環を避ける）。割り当ての行から外し、その種類の担当がすべて消えた種類は「使われていない」になり、U4 で消せるようになる（BR6.10 どおり、意図した動き）                                                                    |
| `onDutyReassigned(hook)`                                                   | 仕組み（新規）         | 担当の子供が変わった・担当が消えたときに呼ばれる。イベントは `{ familyId, dutyId, date, choreTypeId, kind: 'child-changed' \| 'deleted', fromChildUserId, toChildUserId?, newOrigin? }`。書けたあとに担当ごとに順に呼び、関数が投げても保存の結果は変えない（`DUTY_HOOK_FAILED` の警告を残す）。U8 が申し出の取り下げに使う                                                                                                                                              |
| C6 `findFamilyChild(ctx, userId)`                                          | 窓口（新規）           | その家族の子供を 1 人、強い整合性で確かめる。いない・ほかの家族・管理者は、どれも `NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                            |

## C10 理由の印と文言

| 印または文言                                       | 文言                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `INVALID_MONTH`（新しい印）                        | 月の指定が正しくありません                                                     |
| `INVALID_ASSIGNMENT`（新しい印）                   | 割り当ての入力に誤りがあります                                                 |
| `MONTH_NOT_EDITABLE`（新しい印）                   | 割り当てを入力できるのは今月と来月だけです                                     |
| `PAYLOAD_TOO_LARGE`（新しい印）                    | 送る内容が大きすぎます                                                         |
| `NO_ASSIGNMENT_MESSAGE`                            | この月の割り当てはまだありません                                               |
| `NO_DUTY_LABEL`                                    | 担当なし                                                                       |
| `MONTH_CONFIRMED_LABEL`                            | 確定済み                                                                       |
| `OVERWRITE_CONFIRM_HEADING`                        | 次の担当が上書きされます                                                       |
| `COPY_LAST_MONTH_LABEL`                            | 先月と同じにする                                                               |
| `COPY_LAST_MONTH_SKIPPED_INACTIVE`                 | 使わないお手伝いは入れませんでした                                             |
| `COPY_LAST_MONTH_NONE`                             | 先月の割り当てはありません                                                     |
| `CALENDAR_LOAD_FAILED_RETRY`                       | 読み込み直す                                                                   |
| `ASSIGNMENT_SAVE_FAILED`                           | 保存できませんでした。もう一度保存してください                                 |
| `ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE`              | 一部の担当だけが書き換わっていることがあります。もう一度保存すると、そろいます |
| `assignmentOverlapMessage(日付, 種類の名前)`       | 1月4日(月) の皿洗いに担当が 2 人います                                         |
| `overwriteChangeMessage(日付, 種類の名前, 元, 先)` | 1月22日 皿洗い: 太郎 → 花子                                                    |

既存の印 `ASSIGNMENT_OVERLAP`・`OVERWRITE_CONFIRMATION_REQUIRED`・`MONTH_CONFIRMED`・`DUTY_NOT_TODO`・`CHORE_TYPE_INACTIVE` は、そのまま使う。

## データとログ（決めごと）

- DynamoDB: `Calendar`（PK `familyId`、SK `sk`、索引なし、TTL なし、本番 `RETAIN`、`tableName` は指定しない）。1 つのテーブルに次を置く
  - 割り当て `M#<month>#A`
  - 日ごとの担当 `M#<month>#D#<date>#<choreTypeId>`
  - 月の状態 `M#<month>#S`
  - 担当の引き当て `DID#<dutyId>`
- 環境変数: `api` に `CALENDAR_TABLE`（`line` には足さない）
- `api` のロール: `Calendar` に `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（`Scan`・`BatchGetItem`・`BatchWriteItem` はない）。`ChoreTypes` にも **`dynamodb:ConditionCheckItem` を足した**（U4 の引き継ぎどおり。保存の取引で種類が「使う」ことを確かめる）
- ログ: `ASSIGNMENT_SAVED`、`ASSIGNMENT_REJECTED`、`ASSIGNMENT_PARTIAL_FAILURE`（途中で失敗して一部が書かれた。`writtenChunks`・`totalChunks`）、`DUTY_CHILD_CHANGED`、`DUTY_CHANGE_REJECTED`、`DUTY_HOOK_FAILED`。`REQUEST_END` に `dutyCount` と `coldStart`（実行環境の最初の要求だけ `true`）が付く。名前や中身は出さない

## U6〜U8 への引き継ぎ

- **担当を書き換えるときの条件:** 担当の項目を更新するときは、`dutyId` と `version` を条件にする（`#status = :todo AND #version = :v AND #dutyId = :id` の形）。書き換えるたびに `version` を 1 増やす。読んだときから変わっていないことを確かめないと、保存し直しや日ごとの変更と競合する
- **月の状態の ConditionCheck:** 担当を書き換える取引には、月の状態（`M#<month>#S`）が確定済みでないことの ConditionCheck を入れる。U7 が確定する月に、U6・U8 の書き込みが紛れ込まないようにするため
- **`origin` の持ち主:** U5 が書く `origin` は、割り当ての保存（`rule`）と管理者の変更（`manual`）の 2 つ。`swap`（引き受けた担当）の値と書き込みは U8 の持ち物で、U5 は書かない。`swap` の担当を割り当ての保存し直しで上書きしうる点は、U5 の上書きの確かめの一覧に出る。U6・U7 は `origin` を変えない前提で作る
- **担当の作成・削除は U5 だけ:** 担当を作るのも消すのも、割り当ての保存だけ。U6〜U8 は既存の担当の状態・子供・記録を変えるだけにし、担当を作らない・消さない
- **`DID#` の引き当て:** `dutyId` から担当を探すには、`DID#<dutyId>` を GetItem で引き、月・日・種類から担当と月の状態を読む（強い整合性の GetItem 3 回）。Scan は使わない。ほかの家族の `dutyId` は `NOT_FOUND`
- **`line` に `Calendar` の許可を足すのは、読み書きする単位:** `line`（LINE 用の受け口）には、いまは `CALENDAR_TABLE` も権限もない。`line` から `Calendar` を読み書きする単位（U6 の「記録」のコマンドなど）が、その単位の中で環境変数と、必要な最小限の権限（と CDK のテストの期待）を足す
- **`onDutyReassigned`:** U8 が申し出の取り下げに登録する。担当の子供が変わった・消えたときに呼ばれる

## U9・U10 への引き継ぎ

- **U9（お小遣い）:** `Duty` の「済」と書き写した単価（`unitPrice`）を、お小遣いの根拠として読む。月が確定済みかは月の状態で見る。U4 の引き継ぎ（合計が安全な整数を超えうる）も続く
- **U10（見張り）:** `ASSIGNMENT_PARTIAL_FAILURE`（保存の途中で失敗して、一部の担当だけが書かれた）が出たら知らせる。直し方は管理者がもう一度保存すること（手でデータを直さない）。ログの保管は 30 日なので、30 日より前のことはログからは分からない

## 要件への反映を待つもの

- **割り当てと日ごとの担当の要件**（要件の番号は、反映のときに合わせる）: 上書きの確かめを真偽値ではなく、一覧の印（`confirmedChangesHash`）で行うこと、「先月と同じにする」が入力欄に写すだけで保存しないことを、要件の書き方に合わせて足す
