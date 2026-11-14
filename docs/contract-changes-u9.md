# U9 で足した契約・直した文書の一覧

U9（`u9-allowance`）のコード生成で、契約に加えた変更の一覧です。この文書は Batch 1（Step 1）で新設しました。残りの節は Step 42 で完成させます。

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

## 残りの節（Step 42 で完成）

`current`、`findDisplayName`、`getFamilyCreatedAt`、`loadFamilyAndMembers`、`listMembers` の `role: system` 対応、`Cache-Control: no-store` と `RouteResult.headers`、`mapWithConcurrency` の移動、文言、`formatYen`、加算・減額の差し込み口 `AdjustmentSource` の形。
