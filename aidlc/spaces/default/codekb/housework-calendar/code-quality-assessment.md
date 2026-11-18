> 以前の調査内容を保持。今回の追加・差分は末尾の重点調査節を参照。精読範囲はreverse-engineering-timestamp.mdに記録。

# コード品質

| 観点 | 評価・根拠 |
| --- | --- |
| 命名 | good: 意味の明確な画面・hook・API 名 |
| 関数サイズ | fair: CalendarPage は複数の表示責務を持つ |
| エラー処理 | good: API エラー変換、読み直し UI、要求取消 |
| テスト存在 | good: 領域別 BDD と単体テスト |
| 重複・不要コード | 未検証: 全実装の詳細解析は行っていない |

CI は Prettier、ESLint、TypeScript、Vitest V8 行80%以上、gitleaks、画面ビルド、CDK synth。今回はテスト・ビルドを実行していないため現在の成功や実測カバレッジは主張しない。

変更時の注意: U2 invitation、U3 notification-group、U4 chore-types の screens.steps.tsx が open-settings-button を直接クリックする。U5 calendar.steps.tsx と assignment.steps.tsx が enter/edit-assignment-button の存在とクリックを扱う。メニューを開く操作を追加し、管理者・子供、確定済み・過去月、未割り当ての分岐を保つ。U9 のレイアウト・金額導線も維持する。

新しいメニューはキーボード操作、名前、開閉状態、閉じる操作、長い家族名のレイアウトを検証する必要がある。既存公開 API と保存処理への影響は小さい。

## 臨時担当の検証候補

関連テストはfrontend/backendのu5-assignment-calendar、u6-recording、u7-review-confirm、u9-allowance、u10-notificationsに存在（今回一覧を確認、実行していない）。現時点の成功・カバレッジは主張しない。

追加時は管理者成功、子供拒否、他家族ID、無効種類、実在しない日、範囲外、確定競合、同日同種類、二重送信、保存後再読込、未割り当て月の導線、月ルール再保存による保持を検証する。自由記述を扱うなら型・長さ・金額保存方式も新たに決める必要がある。前回メニュー変更の説明は過去の知識として保持。
