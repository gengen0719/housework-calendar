# U9 で足した契約・直した文書の一覧

U9（`u9-allowance`）のコード生成で、契約に加えた変更の一覧です。

## 置き換え

契約 C1 の `Allowance` を、Q6 で決めた形に置き換えました。案の段階の `Allowance`（`lines` に `kind: chore | adjustment` を持つ形）は、まだ誰も使っていません。

| 項目         | 内容                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Allowance`  | `childUserId`・`displayName`・`current`・`month`・`lines`（`choreTypeId`・`choreName`・`unitPrice`・`count`・`amount`）・`adjustments`（`adjustmentId`・`amount`・`reason`）・`total` |
| 確かめたこと | `packages` に `Allowance`・`allowances` の入口・`listDoneDuties`・`isMonthConfirmed`・`findDisplayName`・`getFamilyCreatedAt`・`FamilyScope` が、U9 の前には 0 件だった               |

## 応答の形の例外

`GET /months/{month}/allowances` の応答を、契約の `Allowance[]` から `AllowanceMonthView`（`month`・`confirmed`・`today`・`firstMonth`・`lastMonth`・`allowances`）に包みました。

- 本来は「壊す変更」（`/v2` を足して古いほうを残す）に当たります
- まだ誰も使っていない入口なので、`/v2` を作らずに置き換えました
- これは作り手が承認した例外です（契約に「`Allowance` の中身は U9 の設計で決める」という文言があるわけではありません）
- 窓口 `getAllowances` の戻りは、契約どおり `Allowance[]` のままです

## 承認の確認点の結果

コード生成計画の承認の場で、3 つの確認点はすべて既定のとおりに決まりました。

| 確認点                                     | 結果                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1. パスの月に `current` を使えるようにする | 使う（`GET /v1/months/current/allowances`）                                                                   |
| 2. 成功の応答に `Cache-Control: no-store`  | 付ける（成功の 200 だけ。エラーの応答は変えない）                                                             |
| 3. `role: system` の型の足し方             | `FamilyScope`・`SystemContext`・`ReadContext` を足す。`FamilyContext` と `requireMembership` の戻りは変えない |

## 追加した窓口

| 契約 | 変更                                                                                                                                          | 実装                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| C1   | `GET /v1/months/{month}/allowances`。月は `YYYY-MM` または完全一致の `current`。認証→友だち状態→家族→月の順で確認                             | `handlers/allowances/getAllowances.ts`・`params.ts`、`entries/api.ts` |
| C6   | `loadFamilyAndMembers(ctx)` が家族とメンバーを一緒に返す。Families の読み取りは一回。`listMembers` はそのメンバー部分を返し、既存の答えを保つ | `services/familyMemberService.ts`                                     |
| C6   | `findDisplayName(scope, userId)` は表示名だけ、`getFamilyCreatedAt(scope)` は家族の作成時刻を返す。LINE は呼ばない                            | 同上                                                                  |
| C8   | `listDoneDuties(scope, month)`・`isMonthConfirmed(scope, month)` を公開                                                                       | `services/calendarService.ts`                                         |
| C9   | `getAllowances(ctx, month, options?)` は `Allowance[]`、`getAllowanceMonthView` は画面用の包みを返す                                          | `services/allowanceService.ts`                                        |
| C10  | 見出し、空の月、子供なし、あなた、不明な名前、読込失敗の文言と `formatYen`                                                                    | `packages/shared/src/messages.ts`・`yen.ts`                           |

`FamilyScope = { familyId }`、`SystemContext = { familyId, role: 'system' }`、`ReadContext = FamilyContext | SystemContext` は `middleware/requireMembership.ts` に置きます。読み取りの窓口だけが受け、書き込みは `FamilyContext` のままです。`requireMembership` の戻りと共有の `Role` は変えません。

`AdjustmentSource` は `(scope: FamilyScope, month: string, childUserIds: readonly string[]) => Promise<ReadonlyMap<string, readonly AllowanceAdjustmentLine[]>>`。既定は空、U11 が `options.adjustments` に取り付けます。投げた場合は全体を失敗させます。

`RouteResult.headers` と `json` の追加ヘッダーは任意です。`content-type: application/json` が常に優先し、`cache-control: no-store` はお小遣いの成功200だけです。既存の応答は変えません。`mapWithConcurrency` は `lib/promise.ts` に移動し、U8 の `dutyReassignedHook.ts` からも再公開します。失敗後に新しい項目を始めないオプションをU9だけで使います。

S5 は既存と同じ画面の状態で切り替え、`React.lazy` で別の塊にします。カレンダーからは応答の `today` の月、月を持たない呼出しでは `current` を使います。ブックマーク用の新しいURLは作りません。

## 費用の確認

2026-11-15 に [AWS公式料金表](https://aws.amazon.com/dynamodb/pricing/) を確認しました。オンデマンドの強い整合性の読み取りは4KB単位で1 RRU、結果整合性は半分です。東京の単価の数値は取得した料金表本文に表示されず、**未確認**です。「月1円未満」は設計の見積もりのままで、実測・請求の確認前に確定した費用として扱いません。API呼出し回数と課金RRUは同じではなく、月の項目サイズとページ数に依存します。新しいAWS資源、DynamoDB書込、LINE通信はありません。
