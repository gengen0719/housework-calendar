# インフラ設計の質問 — U10 お知らせ

## 引き継ぐ条件

- ステージングと本番を分け、既存のAWS CDK構成へ通知用の入口・定時起動・再試行・記録・メール監視を追加する。
- 自動再送は予定時刻から15分以内だけ。対象の子供がいない月末は送らない。
- 作り手への障害通知はメール。実際の受信用アドレスは配備時の環境設定に置く。
- 費用の旧目標は0円。Q2の回答「B 月100円」で、ステージングと本番の合計を月100円以内とする目標へ変更した。無料枠・クレジットの適用を未確認のまま無料とはしない。

## Q1 利用予定のAWSアカウントの状況

AWS公式の無料枠の条件は、2025年7月15日より前に作成したアカウントと、それ以降のFree／Paidプランで異なるため、費用見積もりの前提を確認します。アカウントID、請求情報、鍵は書かないでください。ステージングと本番で状況が違う場合は、それぞれの回答を書いてください。

- A. 2025年7月15日より前に作成したアカウントを使う。継続無料枠と現在の利用量を前提に見積もる。
- B. 2025年7月15日以降に作成したPaidプランのアカウントを使う。クレジットの有無や期限は別途配備前に確認する。
- C. 2025年7月15日以降に作成したFreeプランのアカウントを使う。利用できるサービスとクレジットの期限を確認して設計する。
- D. まだ不明、またはまだアカウントを用意していない。無料枠を控除しない参考見積もりとし、配備前に費用0円の条件を満たせることを確認する。請求が発生する構成の配備を承認する回答ではない。
- X. Other (please specify)

[Answer]:A

## Q2 費用0円と既存の従量課金構成の食い違い

Q1=Aを受け、継続無料枠と既存コードを照合して次の食い違いを確認しました。

- 要件と制約: 「毎月の運用費用は0円。お知らせは減らさない」（`ideation/feasibility/constraint-register.md`のC-F1、NFR1）。
- 承認済みの初期設計: S3とDynamoDBについて「0円〜1円未満」と記載し、従量課金の利用を前提としている（`construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md`の費用表）。
- 現在のコード: `infrastructure/lib/data-stack.ts`のテーブルは`PAY_PER_REQUEST`（従量課金）。通知の読み書きを足しても、既存アカウントという理由だけで無料にはならない。
- AWS公式: 読み書きの継続無料枠はプロビジョンド容量向け。保存やバックアップ、監視などの費用も別に評価する必要がある。

どちらを優先するかを決めてください。まだ追加課金のある構成は配備していません。

- A. 毎月0円を維持する（推奨）。既存の保存方式も含め、無料枠内へ収める案と影響を確認する。性能・安全性の条件を下げず、満たせない場合はその点を提示する。
- B. 少額の課金を許容する。月の上限額を回答に併記してください。その額以内を目標として見積もり、配備前に見積もりを確認する。予算通知は請求を強制停止する仕組みではない。
- X. Other (please specify)

[Answer]: B 月100円

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3、NFR10）
- `construction/u10-notifications/nfr-design/`（性能・安全性・容量・信頼性・監視・論理構成）
- `inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`
- [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/)（2026-11-15確認）
- [AWS Billing Free Tier FAQ](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-FAQ.html)（2026-11-15確認）
- [DynamoDB料金と無料枠](https://aws.amazon.com/dynamodb/pricing/)（2026-11-15確認）
- `construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md`（既存の費用表）、`ideation/feasibility/constraint-register.md`（C-F1）
- `infrastructure/lib/data-stack.ts`（現行の容量方式）
