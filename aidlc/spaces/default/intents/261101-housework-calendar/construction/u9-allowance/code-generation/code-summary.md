# U9 お小遣い機能の実装結果

家族全員が月ごとのお小遣いの内訳を見られる読み取り専用のAPIと画面S5を実装しました。済の担当に保存された単価で毎回集計し、種類ごとの単価変更、0円、抜けた子供、負の調整を扱います。今回の再開ではStep27からのAPI入口、画面、運用文書と確認を完成させました。Step1〜26の既存実装も同じ単位のテストで確認しました。

## 実装したファイル

全パスは隣の `source-manifest.json` に記録しました。共有の型・文言・金額表示、バックエンドの読み取り窓口と集計・ログ・HTTPヘッダー、フロントエンドのAPIクライアント・月の制御・S5・カレンダー入口、単体とGherkinテスト、CDK差分なしの14件、スモークの追加1件、README、契約変更、手での確認を含みます。既存の `.gitignore` の変更と `AGENTS.md` はそのままにしました。2026-11-15の追加依頼で `.agents/`・`.codex/` の305ファイルを整形しました（実コードの意味とチェック設定は変えない整形のみ）。インフラ定義、LINE入口、GitHub Actionsの変更はありません。

## 主な決定

- 確認点1〜3は記録どおりです。完全一致の `current`、成功200だけ `cache-control: no-store`、独立した内部処理用の型を使います。既存の `FamilyContext` と `requireMembership` の戻りは変えません。
- `FamilyScope`・`SystemContext`・`ReadContext` は `middleware/requireMembership.ts`。書き込み窓口に内部処理用の型を渡せないことは型のテストで確認しました。
- `AdjustmentSource` は家族・月・子供ID一覧を受け、子供IDごとの調整行のMapを返す非同期関数です。既定は空、U11がoptionsで渡します。調整を含む合計はバックエンドが計算し、画面は再計算しません。
- C8の `listDoneDuties` と `isMonthConfirmed` は公開しましたが、集計は `calendarRepository.loadMonth` を一回呼びます。二つの窓口を別々に呼んで同じ月を二回読むことを避け、同じ読み取り結果から確定と担当を取ります。
- S5は既存と同じAppの状態で切り替えます。新しいURLは作りません。カレンダーからは答えのtodayの月、初期月を持たないS5はcurrentで一回だけ要求します。端末の時計を使いません。
- 月移動は250ms待ち、連番・対象月の照合・AbortControllerで古い応答を捨てます。読み込み中に古い内容は残さず、先読み・ポーリングをしません。
- 読み取りが失敗したら全体を失敗させ、成功した場合だけ集計と異常のログを出します。異常ログは種類ごと20行、件数は省略分を含みます。名前・金額は記録しません。

## 検証結果

| 確認 | 結果 |
| --- | --- |
| U9のみ `npx vitest run u9-allowance` | 32ファイル、538件通過 |
| 既存U1〜U8の指定回帰 | 165ファイル、3248件通過、既存の2件はskipのまま |
| 全体 `npm test` | 197ファイル、3786件通過、2件skip。行97.34%（3151/3237）、文96.15%、分岐91.76%、関数96.89%。行80%の下限を変更せず通過 |
| U9指定coverageコマンド | 538件は全通過。全ソースを測るため行21.93%となり、全体80%の判定だけexit1。単位固有の失敗ではなく全体は上のnpm testで判定 |
| shared・backend・frontend・infrastructureの `tsc --noEmit -p` | すべて通過 |
| `npx eslint packages infrastructure` | 通過 |
| U9対象のPrettier確認 | 通過 |
| `npm run build --workspace @housework/frontend` | 成功。S5は別の塊3.97kB、gzip1.72kB。既存の主な塊が500kBを超える案内は残る |
| CDK差分なしテスト | 14件通過。apiのIAM文11、line9、テーブル8、Lambda4、ログ2、MetricFilter1、アラーム0のまま。Users・Families・ChoreTypes・Calendarの読み取り許可と環境変数は既存で足りる |
| 書込・外部通信の見張り | 集計の筋書き、importsとwriteGuardでDynamoDB書込0・LINE通信0を確認 |
| `bash -n scripts/smoke-check.sh` | 通過。見出し全24件・READMEの一覧とU9節も全24件 |
| 全体 `npm run format:check` | 追加依頼により305ファイルを整形後、すべて通過。保護フォルダへの書込は正式な権限昇格で実行 |
| 全体 `npm run lint` | 成功。利用者の明示依頼（3ba72b87）により `eslint.config.js` の ignores に `.codex/**` を追加。保護された既存ツール内95件はlint対象外。ほかの除外・ルール緩和なし |
| `npm run secrets:scan` | 実行したがgitleaks未インストールのため検査開始前にexit1。インストール・設定緩和は行っていない |

利用者の明示依頼による `.codex/**` のlint対象外化後、指定の連結確認コマンドをそのまま実行し、exit 0で完了しました。format、lint、shared・backend・frontend・infrastructureの型検査、全体テストをすべて順に通過したため、Step47を完了しました。行80%の下限は変更していません。

## 未実行と引き継ぎ

`docs/manual-check-u9.md` のステージング実機16件、3秒の測定（通常月・大きい月・月移動・冷たい起動）、U9反映後のS1の測り直し、実際のCloudFront経由スモーク、読み上げと目での確認は未実行です。AWSやLINEへ接続しておらず、反映・本番動作を確認したとは扱いません。単価は公式料金表で読み取り単位の定義まで確認できましたが、東京リージョンの数値は取得本文に出ず未確認です。月1円未満は設計の見積もりのままです。

## 計画との差

- 画面ビルドはルートにbuildスクリプトがないため、既存のワークスペースのスクリプトを明示して実行しました。
- Gherkinは画面の主な流れを二つのfeatureにまとめ、細かい境界はページ10件・hook8件・client5件・テーマ6件の単体テストで補いました。Step32〜33の場面数の目安をそのままのシナリオ数にはしていません。
- CDKの配信物はリポジトリ内の固定fixtureを使い、独自の一時ファイル生成は行いません。
- `.codex/**` のlint対象外化は利用者の明示依頼（3ba72b87）で行いました。行カバレッジの下限、ほかのlintルール、ワークフローのガード設定は変更していません。gitleaksの検査は未実行のままです。

## Sources

- 同じ単位の承認済み計画、機能設計、NFR設計、インフラ設計、共有の契約と要件。
- 上記コマンドの実行結果。値は2026-11-15の実行時点。

## Assumptions & Open Questions

ステージング未実行、gitleaks未導入、東京の料金単価の未確認が残ります。保護された `.codex/` 内の既存lint95件は修正せず、利用者の依頼により検査対象外としています。

## 追加依頼による修正と保護されたファイルの拒否

利用者の追加依頼（c5fffb87: 「1 既存コードも修正して」）に基づき、全体整形とレビューの表示2件を修正しました。`INVALID_MONTH` は専用の文言を表示し、内訳なし・調整のみの子供には0円の空状態を出しません。先に回帰テスト2件を追加して失敗を再現し、修正後はページ10件が通過しました。

`.codex/tools/aidlc-distribution.ts` の `isSafeOnboardingPath` にある正規表現の不要なエスケープを1文字除く `apply_patch` は、PreToolUseが次の理由で拒否しました（変更は適用されていません）。これ以降、保護を回避する編集は行っていません。

> AIDLC runtime records and hooks belong to the harness: hooks write them when the person acts, and the engine reads them. A tool call cannot invoke a hook, choose a session, set a bypass, edit those records, or replace installed enforcement files. Use the engine commands for workflow work. For intentional installed-file maintenance, use the official updater or an external terminal outside the running agent workflow.

その後、利用者が「.codexフォルダはlintの検査対象外にして」（3ba72b87）と明示したため、`eslint.config.js` の ignores に `.codex/**` を追加しました。95件のツール実コードは変更していません。ほかのルールの無効化やガード変更は行っていません。305ファイルの整形パスと `eslint.config.js` はsource-manifestに追加し、以前のパスも残しました。
