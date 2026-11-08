# 量と費用の要件（Scalability）— U4 お手伝いの種類

U4（`u4-chore-types`）の量と費用の要件です。U1〜U3 の要件（NFR1.1〜NFR1.15、NFR3.1〜NFR3.4）をそのまま使います。

## 量の見込み

家族は 1 つ、お手伝いの種類は数十件ほどです。登録や変更は月に数回です。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.16 | U4 で新しく費用のかかる AWS のサービスを足さない。種類の記録は DynamoDB（オンデマンド）、処理は U1 の画面用の Lambda に足す | CDK の構成で確かめる |
| NFR1.17 | 一覧は家族の種類だけを読む（ほかの家族の記録を読まない作り）。Scan を使わない。Query は続き（LastEvaluatedKey）がなくなるまで読み、件数が多くても一覧が途中で切れない（レビュー R-06） | 単体テストで、読み取りが家族の条件つきであること。続きがある応答を 2 回返す差し替えで、全件がそろうこと |
| NFR1.18 | 登録の回数の上限は付けない。登録できるのは家族の管理者だけで（NFR4.34）、1 回の登録は DynamoDB の書き込み 2 件（種類と名前の印）だけのため、何度押されても同時実行数の上限（NFR3.5）の中に収まる（U2 の NFR4.25 と同じ考え。レビュー R-06） | — |
| NFR3.5 | 処理は U1 の画面用の Lambda の同時実行数の上限（5）の中で動く | CDK の構成で確かめる |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3）
- `construction/u2-invitation/nfr-requirements/scalability-requirements.md`

## Assumptions & Open Questions

- 読み書きの従量の課金は、家族の量では月 1 円に満たない見込みです（U1〜U3 と同じ前提）
