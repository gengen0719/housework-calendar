# テスト結果

この段階で実行した以下のコマンドはすべて終了コード0。部分実行は重複を含み、件数を合算しない。

| コマンド | 結果 |
| --- | --- |
| unit-test-instructions.md 準備確認 | 18ファイル344件成功 |
| 同 新規BDDシナリオ | 3ファイル18件成功 |
| 同 関連回帰 | 32ファイル736件成功 |
| npm test -- --maxWorkers=4 | 243ファイル、4210成功・2skip、失敗0、総数4212 |
| npm run build --workspace @housework/frontend | 成功 |
| npm run lint | 成功 |
| npx tsc --noEmit -p packages/shared | 成功 |
| npx tsc --noEmit -p packages/backend | 成功 |
| npx tsc --noEmit -p packages/frontend | 成功 |
| npx tsc --noEmit -p infrastructure | 成功 |

全体coverage: 行96.14%（3919/4076）、文94.61%、分岐90.22%、関数94.73%。基準80%以上。coverage/lcov.infoに記録。テスト範囲・閾値は変更せず並列上限4で実行した。

新規バックエンドシナリオはNode上で実API入口・認証・fake Dynamoの条件式評価を通す。画面はjsdomでマスタ登録、依頼、表示条件、失敗後の入力保持などを検証する。実ブラウザー、実LINE、AWS、CIの実行は行っていない。実サービスの動作成功を意味するものではない。
