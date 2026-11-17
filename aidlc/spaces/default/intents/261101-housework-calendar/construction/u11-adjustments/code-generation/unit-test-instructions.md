# U11 テスト手順

## Setup and Configuration

既存Vitestのshared/node、backend/node、frontend/jsdom、infrastructure/nodeとBDD読込を使います。新しい依存は追加しません。`vitest.config.ts`の各test/u11-adjustmentsの読込を確認し、必要な対象追加以外で閾値や既存設定を変えません。最初のBDD実行前にrunnerの設定を確認し、テストが未作成ならNo tests foundを準備段階の事実として記録します。構文/環境/依存で止まる状態のまま実装に進みません。

## Exact Unit Command

```sh
npx vitest run u11-adjustments --no-coverage
```

各プロジェクトの`test/u11-adjustments/`のtest/spec/stepsだけに一致させます。該当ファイルがない状態を最終合格にしないため、passWithNoTestsは付けません。featureは対応するstepsから実行します。実装より先に各スライスのGiven/When/Thenと実行結果を記録します。

## Test Inventory

| 範囲 | 内容 | 目安 |
|---|---|---|
| shared検証 | 正金額・種類・空白・100/101文字・NFC・絵文字・制御文字 | 8件以上 |
| repository | 原子的な実体/索引/結果、全ページ、家族キー、条件と競合 | 8件以上 |
| service | 認可・対象・月確定・再送・失効・削除後非復活 | 8件以上 |
| API | 401/403/404/409/422/500、登録・削除・独立一覧 | 8件以上 |
| 画面登録 | ラベル・入力保持・多重押下・結果不明・古い応答 | 8件以上 |
| 画面一覧/削除 | 確認・取消・確定・範囲外でも訂正・フォーカス | 8件以上 |
| C9/通知結合 | 正負と相殺・過去の子供・1000件・再送本文固定 | 8件以上 |
| backup/入口 | LINE通知と独立、表/prefix/ARN、期限・障害・安全ログ | 8件以上 |
| CDK | 二環境・RETAIN・IAM・独立backup起動・有効化設定 | 8件以上 |
| BDD横断 | AC7件と共通認可、競合、結果不明、訂正回復 | 合計100件以上を目安 |

Standardは各部品5〜8件以上と重要境界の結合試験が下限です。数を満たすだけの無意味な試験や、実装の文字列をなぞる試験は書きません。

## Expected Coverage Targets

行カバレッジ80%以上はプロジェクト全体の下限です。この専用コマンドではcoverageを測りません。Build and Testと承認済みConstruction全体確認で全スイートのcoverageを測り、閾値を変更しません。このファイルには全体実行コマンドを混ぜません。

## Mocks and Fixtures

AWS SDKは型付きの模擬応答で取引項目とキャンセルを検証し、並行試験では条件の成立順を制御します。LINE/SNSを実送信せず、通知C9差込口と本文固定を模擬で検証します。frontendは実際の操作・可視文言・API応答遅延で確認します。CDKは偽の秘密値でsynth/assertionし、実AWSへ接続しません。時刻は固定し、日本時間の月末、TTLの等号境界、保存成功後の表示失敗を再現します。

## Manual and Deferred Checks

実機3秒（各20回中19回）、読み上げ/コントラスト/押下域、CI、AWS配備、バックアップ別表復元、メール15分以内、実料金は`docs/manual-check-u11.md`へ未実施理由とともに記録します。秘密検査の道具が未導入なら実行済みと書きません。これらをローカル試験で代替済みとは扱いません。

## Sources

`code-generation-plan.md`、U11機能設計・品質要件・品質設計・インフラ設計、既存`vitest.config.ts`。
