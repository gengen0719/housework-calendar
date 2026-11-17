# U11 性能要件

## Requirements

| ID | 目標 | 確認方法 |
|---|---|---|
| NFR7.201 | S5表示、登録後のS5表示、削除後のS5表示は、4人家族の想定利用で各20回中19回以上が3秒以内。操作開始から最新の内訳・合計の表示までを測る | ステージングで各20回。コールド起動も含む。未配備では未検証とする |
| NFR7.202 | 月1000件の調整・既存の月担当を含む場合も全件を欠落なく扱う。保存処理の待機・再試行は既存APIの時間上限内で有限にする | 検証用データによる全件・ページ境界・競合試験。API単体時間と画面時間を区別 |
| NFR9.201 | 処理中・失敗・成功を文字と読み上げで区別し、理由100文字の入力と表示で画面を破綻させない | キーボード、幅320px、長文・改行・絵文字、読み上げ手動確認。押下44×44、文字4.5:1以上 |

## Sources

- `construction/u11-adjustments/functional-design/functional-spec.md` 登録・削除・読取ワークフロー
- `construction/u11-adjustments/functional-design/rules.md` BR12.3・BR12.5・BR12.8

`inception/requirements-analysis/requirements.md` NFR7・NFR9、U11のBR12.3・BR12.8。1000件は検証用負荷であり上限ではありません。

## Assumptions & Open Questions

- 実機の通信条件と測定結果は配備前後に記録する。ローカルの模擬応答から3秒達成と断定しない。
