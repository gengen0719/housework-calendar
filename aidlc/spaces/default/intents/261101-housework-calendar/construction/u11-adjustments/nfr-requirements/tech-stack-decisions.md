# U11 技術選定

## Decisions

| 選定 | 理由・制約 |
|---|---|
| 既存TypeScript共有型、React画面、Node.js Lambda API | U11のための別サービスや認証を増やさず、既存S5・C9と結合する |
| 既存DynamoDBの家族・月で絞った保存と条件付き更新/トランザクション | 確定と変更の競合、作成再送の一意性を保護する。既存カレンダーの所有者が提供する月の保護を利用する |
| 既存Vitest・BDD・Prettier・ESLint・TypeScriptとGitHub Actions | NFR8.201。設定と閾値を弱めない。`.codex/**`のlint除外を維持する |
| 既存CloudWatchとメール通知 | 追加の運用基盤を増やさずNFR2.201・NFR2.202を検証する |

ここで新しいライブラリやバージョンの選定・更新はしません。具体的な保存キー、競合方式、正確な合計計算、独立した訂正経路はNFR設計で固定します。

## Alternatives

別のデータベースや常時稼働サービスは、今回の規模と予算に対して不要です。合計失敗時の訂正を本番データの手修正に任せる案はNFR6に反するため採りません。入力の業務上限を新設して回避する案も既存決定を変えるため採りません。

## Sources

`inception/units-generation/unit-of-work.md`、`inception/contract-design/contract-summary.md`、U11機能設計、`aidlc/spaces/default/memory/team.md`、本工程NFR1.201・NFR3.201・NFR6.201・NFR8.201。

## Assumptions & Open Questions

- 保存キーと所有者の公開窓口の具体的な結合は、既存コードに合わせて次工程で確認する。
