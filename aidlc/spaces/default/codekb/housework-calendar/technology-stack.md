> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

# 技術スタック

マニフェストで確認した固定バージョン。

| 技術 | バージョン・用途 |
| --- | --- |
| TypeScript | 6.0.3 |
| React / React DOM | 19.3.1 |
| MUI | 9.5.0 |
| Emotion React / Styled | 11.14.0 / 11.14.1 |
| LIFF | 2.31.2 |
| Vite / React plugin | 8.3.5 / 6.1.2 |
| AWS SDK v3 | 3.1161.0（DynamoDB、SSM、SNS、SQS、CloudWatch） |
| jsonwebtoken / zod | 9.0.3 / 4.6.7 |
| CDK library / CLI / constructs | 2.275.0 / 2.1147.0 / 10.8.1 |
| Vitest / V8 coverage | 5.0.5 |
| React Testing Library / jsdom | 16.3.3 / 30.1.3 |
| vitest-cucumber | 8.0.0 |
| ESLint / Prettier | 9.39.5 / 3.9.10 |

AWS Lambda、DynamoDB、CloudFront を利用。依存の最新性や脆弱性は今回の静的調査では未検証。

## 今回の確認範囲

新しい依存は調査段階では追加していない。上記バージョン表は前回資料を保持した参照情報で、今回マニフェストを再精読していない。対象コードは既存React/MUI、TypeScript、zod、AWS SDKの構成を使う。
