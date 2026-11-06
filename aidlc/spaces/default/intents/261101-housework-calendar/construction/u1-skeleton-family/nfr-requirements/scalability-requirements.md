# 量と費用の要件（Scalability）— U1 最初の形と家族を作る

U1（`u1-skeleton-family`）が扱う量と、費用 0 円で動かすための要件です。

## 量の見込み

| 項目 | 見込み |
|------|-------|
| 家族の数 | 本番 1 家族（ステージングは作り手だけ） |
| 利用者の数 | 1 家族 4 人（母親と子供 3 人） |
| 画面を開く回数 | 1 人 1 日数回、家族で 1 日数十回 |
| LINE のイベント（U1 では友だち登録とブロック） | 月に数回 |
| 同時に使う人 | 多くて 4 人 |

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.1 | ずっと続く無料枠の中で動くサービスだけを使う: Lambda（関数 URL）、CloudFront、S3、DynamoDB（オンデマンド）、Systems Manager のパラメータストア（標準）、CloudWatch Logs [Q4、Q5] | CDK の構成に、ほかの費用のかかるサービスがないこと |
| NFR1.2 | API Gateway と Secrets Manager は使わない（12 か月後や毎月の費用がかかるため）[Q4、Q5] | CDK の構成に含まれないこと |
| NFR1.3 | ログは 30 日で消し、CloudWatch Logs の無料枠（5 GB）に収める [Q7] | CDK のログの保存期間の設定で確かめる |
| NFR1.4 | 処理済みのイベントの記録（7 日）と送り直しの記録（24 時間）は、DynamoDB の期限切れでの自動削除（TTL）で消す [Q7] | テーブルに TTL が設定されていること |
| NFR1.5 | AWS の請求額が 0 円であること | 毎月の請求を作り手が見る |
| NFR3.1 | 常に動かしておくサーバーやコンテナを持たない。処理は要求があるときだけ Lambda で動く | CDK の構成に EC2、常時起動の ECS などがないこと |
| NFR3.2 | 家族 4 人の量なら、Lambda と DynamoDB（オンデマンド）が自動で合わせる。そのうえで、大量の要求で費用が膨らまないよう、NFR1.6 で上限を置く | — |
| NFR1.6 | 大量の要求（悪意のある呼び出しを含む）で費用 0 円が崩れないよう、Lambda ごとに同時に動ける数の上限（予約された同時実行数）を小さく置く（例: 画面用 5、LINE 用 5）。上限を超えた要求は断られる。値は NFR の設計の段階で決める | CDK の設定で確かめる |
| NFR1.7 | AWS Budgets（2 つまでは無料）で、月の費用の見込みが 1 ドルを超えたら作り手にメールで知らせる。毎月の請求を待たずに気づけるようにする | Budgets の設定で確かめる |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3、制約）
- `inception/units-generation/unit-of-work.md`（Lambda を入口ごとに分ける）
- `nfr-requirements-questions.md` の回答 [Q4]、[Q5]、[Q7]

## Assumptions & Open Questions

- [assumption] Lambda、CloudFront、DynamoDB、CloudWatch Logs のずっと続く無料枠の内容は、作り始めるときに AWS の案内でもう一度確かめる
