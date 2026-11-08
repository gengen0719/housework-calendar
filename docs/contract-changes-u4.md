# U4 で足した契約の一覧

U4（`u4-chore-types`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したもの、形を変えたものです。項目・操作・理由の印を足すのは契約の決まりで自由です。壊す変更はありません。`contract-summary.md` への反映を待つ一覧として、`docs/contract-changes-u1.md`〜`docs/contract-changes-u3.md` に続けて残します。

## C1 画面用 API

| 操作                                   | 足したもの           | 中身                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/chore-types`                  | 応答                 | 家族のメンバー。200 `ChoreType[]`（「使う」を登録順、そのあとに「使わない」）、403 `NOT_FAMILY_MEMBER`                                                                                                                                                                                             |
| `POST /v1/chore-types`                 | 本文・ヘッダー・応答 | 管理者。本文 `{ "name": string, "unitPrice": integer, "description"?: string }`。`Idempotency-Key` 必須。201 `ChoreType`、422 `INVALID_CHORE_TYPE_NAME`・`INVALID_UNIT_PRICE`・`INVALID_DESCRIPTION`・`INVALID_REQUEST`、409 `CHORE_TYPE_NAME_TAKEN`（`details.conflictActive`）、403 `ADMIN_ONLY` |
| `PUT /v1/chore-types/{choreTypeId}`    | 本文・応答           | 管理者。本文は POST と同じ（`active` は含めない）。200 `ChoreType`、422・409（同上）、404 `NOT_FOUND`、403 `ADMIN_ONLY`                                                                                                                                                                            |
| `PATCH /v1/chore-types/{choreTypeId}`  | 操作（新規）         | 管理者。本文 `{ "active": boolean }` だけ（`"false"`・`0`・なしは 422 `INVALID_REQUEST`）。200 `ChoreType`、404 `NOT_FOUND`、403 `ADMIN_ONLY`。契約の「使う／使わないを変える」を、名前・単価の変更と分けた                                                                                        |
| `DELETE /v1/chore-types/{choreTypeId}` | 応答                 | 管理者。204、409 `CHORE_TYPE_IN_USE`（使われたことがある。種類は「使わない」のまま）、409 `CHORE_TYPE_STATE_CHANGED`（消す途中で「使う」に戻された）、404 `NOT_FOUND`、403 `ADMIN_ONLY`                                                                                                            |

- 409 `CHORE_TYPE_NAME_TAKEN` の `details.conflictActive` は、名前が重なった相手が「使う」なら `true`、「使わない」なら `false`。画面はこれで文言を分ける（`true`: 「皿洗い（追加分）」を勧める、`false`: 「使う」に戻す案内）
- 別の家族の種類の ID、形の違う ID は、本文が正しくても誤っていても 404 `NOT_FOUND`
- 名前・説明はログに出さない（`name`・`description` は型と実行時の伏せ字で禁止）

## C7 お手伝いの種類の窓口

| 窓口                                          | 足したもの   | 中身                                                                                                                                                                           |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list(ctx)`                                   | 結果の決まり | 「使わない」の種類も `active` つきで返す                                                                                                                                       |
| `getCurrentUnitPrice(ctx, choreTypeId)`       | 結果の決まり | 「使わない」の種類にも今の単価を返す。`NOT_FOUND` は種類がないか、ほかの家族のときだけ                                                                                         |
| `create(ctx, input)`                          | 結果         | `ChoreType` / `INVALID_CHORE_TYPE_NAME` / `INVALID_UNIT_PRICE` / `INVALID_DESCRIPTION` / `CHORE_TYPE_NAME_TAKEN`（`conflictActive` つき）                                      |
| `update(ctx, choreTypeId, input)`             | 結果         | 上と同じ + `NOT_FOUND`                                                                                                                                                         |
| `setActive(ctx, choreTypeId, active)`（新規） | 窓口         | `ChoreType` / `NOT_FOUND`。名前・単価・説明は変えない                                                                                                                          |
| `delete(ctx, choreTypeId)`                    | 結果の決まり | `void` / `NOT_FOUND`。呼ぶ前に入口が `setActive(false)` と C8 `isChoreTypeAssigned` の確かめをする。消す書き込みは `active = false` を条件にする（`CHORE_TYPE_STATE_CHANGED`） |

## C8 カレンダーの窓口（仮）と U5 への引き継ぎ

- `isChoreTypeAssigned(ctx, choreTypeId): boolean` を U4 で仮に置き、いつも `false`（使われていない）を返す。`setCalendarPort` で差し替えられる作りで、テストでは「使われている」に差し替えて確かめている
- U5 への引き継ぎ:
  - 本物の `isChoreTypeAssigned` は、割り当ての記録を**強い整合性の読み取り**で確かめる（結果整合の索引は使わない）。使われた直後の取り消しで「使われていない」と誤らないため
  - `saveAssignment` は、種類が「使う」（`active = true`）であることを、保存と同じトランザクションの **ConditionCheck** にする。消す操作との競合を防ぐため
  - U4 は `api` のロールに `ConditionCheckItem` を足していない。U5 で `ChoreTypes` に **`dynamodb:ConditionCheckItem` を足す**（CDK の `app-stack.ts` とテストの期待の両方）

## C10 理由の印と文言

| 印または文言                      | 文言                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_CHORE_TYPE_NAME`         | 名前を 1〜20 文字で入力してください                                                                                                           |
| `CHORE_TYPE_NAME_TAKEN`           | 同じ名前の種類があります。1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように、別の名前で登録してください                               |
| `INVALID_DESCRIPTION`             | 説明は 100 文字までで入力してください                                                                                                         |
| `INVALID_REQUEST`                 | 操作の内容が正しくありません。もう一度お試しください                                                                                          |
| `CHORE_TYPE_STATE_CHANGED`        | 状態が変わりました。もう一度お試しください                                                                                                    |
| `CHORE_TYPE_IN_USE`（文言を設定） | 割り当てに使われたことがあるので消せません。『使わない』にしてください                                                                        |
| `choreTypeNameTakenMessage(bool)` | 重なった相手が「使わない」のとき（`false`）は、『使わない』になっている同じ名前の種類があります。『使う』に戻すか、別の名前で登録してください |
| `CHORE_TYPE_NAME_HINT`            | 1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように分けて登録します                                                                     |
| `CHORE_TYPE_PRICE_CHANGE_NOTE`    | 単価を変えると、このあとに付く記録から新しい単価になります                                                                                    |
| `CHORE_TYPE_DEACTIVATE_CONFIRM`   | 使わないにすると、新しい割り当てで選べなくなります。過去の記録とお小遣いはそのまま残ります                                                    |
| `CHORE_TYPE_DELETE_CONFIRM`       | この種類を消しますか？ 消すと元に戻せません                                                                                                   |
| `CHORE_TYPE_IN_USE_DEACTIVATED`   | 割り当てに使われたことがあるので消せません。『使わない』にしました（画面だけで使う）                                                          |
| `CHORE_TYPE_ALREADY_GONE`         | すでに消えています（画面だけで使う）                                                                                                          |

## データと共有の型（決めごと）

- DynamoDB: `ChoreTypes`（PK `familyId`、SK `sk`、TTL なし、本番 `RETAIN`、`tableName` は指定しない）。種類と名前の印を同じ家族のパーティションに置く
- `packages/shared`: `ChoreType`、`ChoreTypeInput`、`SetChoreTypeActiveRequest`、`normalizeChoreName`・`validateUnitPrice`・`normalizeDescription`（画面と裏側で同じ確かめを使う）
- 環境変数: `api` に `CHORE_TYPES_TABLE`（`line` には足さない）
- `api` のロール: `ChoreTypes` に `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem` だけ（`Scan`・`ConditionCheckItem` はない）

## U9 への引き継ぎ

- 単価は 0 以上の安全な整数（`Number.MAX_SAFE_INTEGER` 以下）まで受け付け、上限は設けていない。そのため、記録の回数 × 単価の合計が**安全な整数を超える**ことがありうる（現実の家族の量ではほぼ起きない）
- U9 のお小遣いの合計は、安全な整数を超えるときの扱い（`BigInt` で数える、または上限を超えたら断る・丸めずに知らせる）を決めてから計算する。黙って丸めた金額を出さない

## 要件への反映を待つもの

- **FR2.1〜FR2.4**: 名前の重なりを断ること（BR5.3）、「使わない」から「使う」に戻せること、`PATCH` で「使う／使わない」だけを変えることを、要件の書き方に合わせて足す
