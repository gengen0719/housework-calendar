# U11 加算・減額 — 実装のまとめ

## 実装した動作

管理者が子供の指定月へ理由付きの加算・減額を登録し、確認して削除できる。正のsafe integer、add/subtract、NFC正規化・trim後1〜100コードポイントの理由を共有検証する。改行以外の制御文字を断り、家族と作成者は信頼した文脈から決める。認証・所属・管理者・操作キーの確認を本文解釈より先に行う。

調整の実体とID索引、24時間の操作結果、C8の未確定月条件、C6の子供所属条件を同一取引で保存する。家族込みの入力ハッシュを照合し、同一キー10並行でも1件だけを保存する。応答喪失、確定後、削除後の再送は有効期間内の元の結果だけ返し、削除した行を復活させない。条件競合は強整合で再確認し初回込み最大2回、0〜50msの待機だけで打ち切る。新規調整のDB操作には2秒の中止期限、API書込前には残り時間の検査を置いた。

S5から登録フォームと合計に依存しない管理者用一覧へ進める。合計範囲外でも独立一覧から訂正でき、過去の子供・不明名の行も残す。削除確認は子供・符号付き額・理由を表示し、取消では送らない。入力保持、欄別エラー、多重押下抑止、保存結果不明時の入力・キー固定、24時間超の再送停止、成功後の表示失敗との区別、古い応答の排除、読み上げ、確認のフォーカス復帰を実装した。

C9の本番既定経路へ調整の全ページQueryを接続した。調整だけが残る過去の子供を含め、BigIntで中間計算し、返す担当小計と最終合計だけをsafe integerへ検証する。正負相殺の途中だけの超過では失敗せず、最終値の範囲外は422 ALLOWANCE_OUT_OF_RANGE。画面と月末まとめは同じ額を使い、U10の保存済み本文・宛先・キーは再試行で固定する。APIと通知は生の家族IDを含む旧C9ログを抑止し、getAllowanceMonthViewのemitLogs指定も尊重する。

## バックアップと構成

環境ごとに調整表1個を追加した。familyId/sk、オンデマンド、AWS管理暗号化、TTL/GSIなし、production RETAIN。APIだけGet/Query/Put/Delete、通知はGet/Queryとバックアップ操作を許可し、LINEには参照も権限も追加しない。Usersの子供条件にConditionCheckItemを追加し、月条件は既存Calendar権限を使用する。Lambda、予定、アラームの数は増やさない。

インフラ設計R-01に対応しbackupsEnabled/BACKUPS_ENABLEDを外向き通知から分離した。未指定は従来notificationsEnabledを継承し、新規導入の既定は両方無効。通知false/backup trueならBackupの予定と入口だけ動き、日次/月末・watchdog・cleanup・SQSは無効のまま。メール購読、実機試験、予算確認、0〜100円の二環境合算額を有効化条件とし、実行障害/DLQの既存アラームアクションを有効にする。外向き通知の欠測アラームは無効に保つ。

既存の日次バックアップへ調整表を追加し、固定した表名・ARN・環境別prefixでListBackupsと台帳を照合する。7日超で所有が確認できAVAILABLEのものだけ削除する。一方の表が失敗しても他方を試行し、定型通知と失敗を返す。新しい外部送信・依存はない。

## BDDと検証の記録

Testing Contract: sha256:3d8bf1680d2ab6a2f969ca114cd0d9226f3e81b28a3029acf4c20ae4b786b58f。既存4プロジェクトとBDD読込を使用し、設定・80%閾値・timeoutは変更していない。

| 切れ目 | 実装前の結果 | 実装後 |
|---|---|---|
| runner | 専用コマンドはNo test files foundでexit1 | BDDを作成し実行可能 |
| 登録API | 13ステップ中4件失敗（未実装404） | 13件成功 |
| 登録画面 | 入口/入力欄の2件失敗 | 成功 |
| 独立一覧・削除/画面回復 | 11ステップ中6件失敗（未実装） | 成功 |
| C9/通知 | 800→1200、0→-200の未反映2件失敗 | 成功 |
| 正確な計算/訂正 | 範囲外、担当小計、過去の子供、回復の5件失敗 | 成功 |
| backup-only入口 | 通知無効での起動2件失敗 | 成功 |
| CDK | 13件中12件失敗 | 13件成功 |

最初の登録BDDはScenario OutlineのExamples読込で停止したため、既存と同じScenario形式へ直し、実際の404による失敗を確認してから登録実装へ進んだ。記載件数はVitestのBDDステップを含むrunnerの件数である。後続の部品・結合試験を含め、100件以上の計画量を満たす。

変更前の指定全体確認はexit0、行96.54%。中間のU11/U9/U10/全IaC回帰は78ファイル1024成功・既存2skip。既存U9の読取回数は新しい調整Query分の4→5/10→11、APIのログ抑止期待、CDKの調整表1個とAPI許可1文の追加だけを理由付きで更新した。暗号化・認証・LINE権限・既存回帰を維持する。

最終の専用コマンド`npx vitest run u11-adjustments --no-coverage`はexit0、15ファイル161件成功。全体確認は次のコマンドを使用しexit0で完走した。

```sh
npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test
```

全体236ファイル、4165件成功・既存2件skip（4167件）。行96.27%（3821/3969）、文94.73%（4279/4517）、分岐90.21%（2767/3067）、関数95.02%（1013/1066）。CDK assertionのTemplate生成とLambdaバンドルは成功したが、独立したCDK CLI synth/deployは未実行。最終確認前には整形漏れ1件とfixture規約のlint1件で連結確認が停止し、両方を修正して同じコマンドを通した。個別formatterへfeatureを明示指定した実行は未対応parserでexit2となったが、対応するTS/TSXは整形し、最終の標準format:checkは成功した。

## 証跡

traceability.jsonはsensor-traceabilityで生成し、AC8.2.1〜7、共有AC1.1.12、BR12.1〜8、詳細NFR20件を対応付けた。ツールの初期集合から漏れた共有ACと観測NFR2.202/5.202/7.204も明示追加した。source-manifest.jsonには全変更ソース、設定、既存/新規テスト、fixture、説明書を記録した。アプリ/テストの既存変更や利用者のAGENTS.md・.gitignore・保護フォルダは上書きしない。レビュー・ライフサイクル操作は実行していない。

## Sources

- U11 functional-design、nfr-requirements、nfr-design、infrastructure-designと各review-01.md。
- 承認済みcode-generation-plan.md、unit-test-instructions.md、tool-produced Testing Contract。
- inceptionのrequirements、US8.2/共通認可AC、components、C1/C6/C8/C9、unit-of-workのU11。
- docs/contract-changes-u11.md、docs/adjustment-runbook.md、docs/manual-check-u11.md。

## Assumptions & Open Questions

新たな利用者の選択事項はない。gitleaks未導入でnpm run secrets:scanはexit1。未計画の導入は行わず、秘密検査は未完了として残す。実機3秒（各20回中19回）、読み上げ/コントラスト/押下域、実CI、AWS配備、実メール15分、別表復元、実LINE、実料金は未実施。

二環境合算約91円/月は、増分0.155USDと既存条件付き0.25503USD、200円/USD、税等10%余裕の計画仮定。現在の料金や請求ではなく、残枠・実サイズ・要求量・Lambda/CloudWatch増分・為替・復元時費用を配備前に再評価する。予算通知は強制上限ではない。実機確認が済むまで有効化せず、未確認の本番運用を完了扱いにしない。
