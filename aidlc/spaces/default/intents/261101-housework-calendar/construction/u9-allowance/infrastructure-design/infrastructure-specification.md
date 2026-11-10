# インフラの仕様（Infrastructure Specification）— U9 お小遣いの額

U9（`u9-allowance`）で、U1〜U8 の構成に足す・変える AWS の資源を決めます。結論は **インフラの変更なし**です。新しいテーブル・索引・Lambda・IAM の文・環境変数・SSM パラメータ・指標・アラーム・CloudFront の振り分け・費用は足しません（NFR1.36、NFR4.89）。U9 は `api` の Lambda に読み取り専用の入口 `GET /v1/months/{month}/allowances` を 1 つ足し、画面（S5）を既存の S3 と CloudFront に載せるだけのアプリコードです。決めることはすべて NFR 設計（`nfr-design/logical-components.md` の「Infrastructure Design へ渡すこと」）で決まっていたため、この段階で人に聞くことはありませんでした。

## 実コードで確かめた結果（`infrastructure/lib/app-stack.ts`・`data-stack.ts` を読んだ）

U9 の読み取りを、実際の IAM の文・環境変数・CloudFront の設定に当てて確かめました。**インフラの食い違いは見つかりませんでした**（スモークチェックと README に古い記述があり、下の「食い違い」に正直に書きます）。

### `api` の Lambda の権限

| 資源 | 実コードの許可（読んだ結果） | U9 で使う操作 | 足りるか |
|------|---------------------------|--------------|---------|
| `Users` | 表: `GetItem`・`PutItem`・`UpdateItem`。索引 `lineUserId-index`: `Query`。索引 `familyId-index`: `Query`（U2 で足し済み） | 認証（`getUserStatus`）・`findFamilyChild`・`findDisplayName`・本人の補いの `GetItem`。メンバー一覧の `familyId-index` の `Query` | 足りる |
| `Families` | `GetItem`・`PutItem`・`UpdateItem`・`ConditionCheckItem` | `loadFamilyAndMembers` の `GetItem` を 1 回（作成時刻とメンバーを同じ結果から取る。ADR-U9-02） | 足りる |
| `ChoreTypes` | `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（U4・U5 の文） | 種類の一覧の `Query` | 足りる |
| `Calendar` | `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（U5 の文。索引なし） | 月の `Query`（`M#<month>#` の `begins_with`、強い整合性、続きのページまで） | 足りる |
| 環境変数 | `SSM_PREFIX`・`USERS_TABLE`・`FAMILIES_TABLE`・`REQUEST_RECORDS_TABLE`・`INVITATIONS_TABLE`・`NOTIFICATION_GROUPS_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE`・`ENV`・`ENTRY` | `USERS_TABLE`・`FAMILIES_TABLE`・`CHORE_TYPES_TABLE`・`CALENDAR_TABLE` | 足りる（名前をすべて読んで確かめた。NFR 設計で「読み切っていない」とした仮定を解消） |
| SSM | `jwt/*`・`line/*`・`cloudfront/*` の読み取り、条件つき `kms:Decrypt` | セッションの確かめ（既存）。U9 は新しい値を読まない | 足りる |

- U9 のコードは書き込みの命令（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）を送りません。`api` に書き込みの許可は既にありますが、U9 は使いません。確かめは単体テスト（クライアントの差し替えが書き込みを 0 回受ける。NFR4.89）で行い、IAM の許可では守れません（残る危険として下に書きます）
- `Scan`・`BatchGetItem` の許可は元からありません。U9 も使いません

### `line` の Lambda

何も足さない・何も変えません。U9 は `line` を通りません（LINE には何も送らない。reply も push も使わない。NFR5.16）。

### CloudFront（`/v1/*` の振り分け）

| 項目 | 実コード（読んだ結果） | U9 への意味 |
|------|----------------------|------------|
| キャッシュ | `/v1/*` は `CachePolicy.CACHING_DISABLED` | 額の応答が CloudFront に残らない。変えない。応答の `Cache-Control: no-store`（ADR-U9-05）はブラウザなどの途中に残さないための二重の備え |
| パス | `/v1/*` はパスをそのまま `api` の関数 URL へ渡す。画面の書き換え関数（`SpaRewrite`）は `/v1/` と `/line/` を触らない | `/v1/months/current/allowances` の `current` は通常のパスの一部としてそのまま届く。`2000-01` のような形の月と同じ扱い |
| クエリ・ヘッダー | `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER`（クエリ文字列・`Authorization`・Cookie も渡る） | U9 の入口はクエリも本文も読まないので影響しない（NFR4.87）。セッションは既存の `Authorization` で届く |
| メソッド | `AllowedMethods.ALLOW_ALL` | `GET` は通る |
| 応答ヘッダー | `SecurityHeaders`（CSP など）を `/v1/*` にも付与。`Cache-Control` は付けていない | U9 が付ける `no-store` と衝突しない（ポリシーは `Cache-Control` を上書きしない） |
| 画面（S5） | 既定の動作（S3、`CACHING_OPTIMIZED`、`SpaRewrite`）。拡張子のないパスは `/index.html` に書き換わる | S5 は `React.lazy` の別の塊で配信される。ビルドの設定は変えない |
| 反映時の無効化 | `BucketDeployment` が `/*` を無効にする | 新しい画面の塊が反映の直後から見える |

### 資源の定義（`data-stack.ts`）

| 項目 | 実コード | U9 の影響 |
|------|---------|----------|
| `Calendar` | 主キー `familyId`＋`sk`、索引なし、TTL なし。`RemovalPolicy` は本番 `RETAIN`・ステージング `DESTROY`（共通の `common`） | 変更なし。U9 は読むだけ |
| `Users` | `userId` が主キー。索引 `lineUserId-index`・`familyId-index` | 変更なし。既存の `familyId-index` を読むだけ |
| Lambda の大きさ | `api`・`line` とも 256 MB・30 秒・ARM64・Node.js 22。`reservedConcurrency` はコンテキストで与えたときだけ | 変更なし。測定で 3 秒に届かないときだけ 512 MB を検討する（NFR7.54 の手順の (4)） |
| ロググループ | 各 Lambda に 1 つ、保管 1 か月（30 日） | 変更なし。新しいロググループなし |
| `MetricFilter` | `api` のロググループに 1 つ（`InvitationInvalidCount`） | 足さない |

> **結論**: U9 に必要なインフラの変更は**ありません**。`infrastructure/lib/` の差分は作りません。

### 食い違い（正直な報告）

| # | 見つけたこと | 影響 | 扱い |
|---|------------|------|------|
| 1 | インフラ（権限・環境変数・CloudFront）に NFR 設計との食い違いは**なし** | なし | — |
| 2 | `scripts/smoke-check.sh` の見出しは「全 23 件」で、`/v1/months/{month}/allowances` の確かめがない | 反映後の確かめで、U9 の入口が CloudFront を通って `api` に届き、認証で止まることを確かめられない | `cicd-pipeline.md` のとおり 1 件（3q）を足し、全 24 件にする（コード生成で実施） |
| 3 | README に古い数が残っている（14 行目「反映後の確かめ（4 つ）」。385・428・499・542・564 行目の「全 23 件」） | 読む人が件数を取り違える | コード生成で README を直す。方針は 1 つ: 各単位の節（385・428・499・542・564 行目）は「その単位の時点の件数」として残し、14 行目（U1 のころから古い）と U9 の節で全 24 件を示す（`cicd-pipeline.md` と同じ） |
| 4 | `app-stack.ts` の U4 の文の注記「line には足さない」は U6 で古くなっている（U8 の指摘のまま） | 動作に影響なし | 触れる機会があれば直す。U9 では `app-stack.ts` を変えない |
| 5 | `infrastructure/test/u9-allowance/stacks.test.ts` はまだない（コード生成で作る） | 「U9 で差分がない」ことの固定は、コード生成が済むまで未確認 | `cicd-pipeline.md` に確かめる項目を決めた。コード生成の最初に `app-stack.ts` を再度読む |

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | 既存の `api` の Lambda に読み取り専用の入口を 1 つ足す。新しい Lambda は作らない。`line` は変えない | NFR1.36。U10 の `scheduled` は U10 が足す |
| 入口 | `GET /v1/months/{month}/allowances`（`month` は `YYYY-MM` または `current`）。CloudFront の `/v1/*` → `api`。新しい振り分けは足さない | 既存の `/v1/*` がそのまま通る（実コードで確かめた） |
| 保存 | `DataStack` は変えない。何も書かない（保存した合計は持たない。ADR-005） | NFR1.36、NFR2.67 |
| 環境 | ステージングと本番の両方に同じ変更（`AppStack` のコード反映と画面の塊のみ）。環境ごとの新しい設定・秘密・パラメータはない | NFR10.11 |
| IaC | `app-stack.ts`・`data-stack.ts`・`app.ts` は変えない。変えるのは新規 `infrastructure/test/u9-allowance/stacks.test.ts`、`scripts/smoke-check.sh`（1 件）、README、`docs/contract-changes-u9.md`、アプリコード（`packages/*`） | 差分がないことをテストで固定する |
| 配備の順番 | `Housework-<env>-App` のコード反映のみ。`main` への取り込みでステージングに自動、本番は作り手が確認してから手で | NFR10.11、NFR6.10 |
| 画面の配信物 | S5 を `React.lazy` の別の塊にする。ビルドの設定は変えない。S1 の初期表示を重くしない | NFR7.52。反映後に S1（NFR7.20）を 1 回測り直す |
| 大きさ | 256 MB・30 秒・ARM64 のまま。Provisioned Concurrency は使わない | 費用 0 円（NFR1.36） |
| 秘密の情報 | 足さない。LINE のトークンを読みも使いもしない。テストの前提データには `<作り物の値>` を使う | NFR5.16、NFR5.17 |
| 本番の初期データ | CDK でも配備の手順でも入れない。測定のデータは画面と LINE の操作で作る | NFR6.10 |
| ステージングでの確認 | ステージング用の公式アカウントと作り手だけの家族 2 つ（NFR7.57）。ステージングの公式アカウントを本番のお知らせ先のグループに入れない | NFR10.11 |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Calendar`（既存） | database | 変更なし | U9 は月の `Query` を 1 回（`begins_with`）。`Scan`・`BatchGetItem` を使わない。本番は `RETAIN` のまま |
| DynamoDB `Users`・`Families`・`ChoreTypes`（既存） | database | 変更なし | `Users` は `GetItem`・`familyId-index` の `Query`、`Families` は `GetItem` 1 回、`ChoreTypes` は `Query`。すべて読み取り |
| Lambda `api`（コードのみ変更） | compute | 権限・環境変数・メモリ・時間切れは U9 の前後で同じ | 読み取り専用の入口 1 つ。読み取りの段は最大 4 段、抜けた子供の確かめは 10 並行まで |
| Lambda `line`（変更なし） | compute | 同上 | U9 は通らない |
| IAM | access control | 追加なし | `grantReadWriteData` は使わない。絞った文のまま |
| CloudFront | cdn | 変更なし | `/v1/*` は CACHING_DISABLED。S5 の塊は既存の S3 配信に載る |
| S3（画面） | storage | 変更なし | 新しい塊が 1 つ増えるだけ（無料枠に収まる大きさ） |
| CloudWatch Logs | logging | 変更なし（30 日） | `monitoring-design.md`。指標とアラームは U10 |
| LINE Messaging API（外部） | external | U9 は呼ばない | メッセージの無料枠に数えない（0 通） |

### 足さないもの（NFR4.89）

| 区分 | 足さないもの |
|------|-------------|
| `api` | 新しい DynamoDB の許可（索引の ARN を含む）、`Scan`・`BatchGetItem`・`BatchWriteItem`、`dynamodb:*`、`Resource: "*"` の DynamoDB の文 |
| `line` | 何も足さない |
| 共通 | 新しい環境変数・SSM パラメータ・GitHub Variables、新しいテーブル・索引・Lambda・ロググループ・メトリクスフィルター・アラーム・ダッシュボード、CloudFront の振り分け・キャッシュポリシーの変更 |

### 残る危険（NFR 設計から引き継ぎ）

`api` には `Calendar` などへの書き込みの許可が U5 までに付いています。U9 のコードが書かない保証はコードとテスト（書き込みの命令 0 回）に頼っており、IAM では守れません。`api` が乗っ取られた場合の被害の範囲は U5 から変わらず、U9 では広がりません。許可の絞り込み（U9 を読み取りだけの別の Lambda に分ける案）は、費用と構成の増加に見合わないので採りません。承認の場で確かめる項目にします。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Calendar` テーブル | U5 | U6、U7、U8、U9（読み取りのみ）、U10、U11 | U9 は `calendarRepository.loadMonth` の `Query` だけ。書き込みの窓口を import しない |
| `Users` の `familyId-index` | U2 | U4〜U9 ほか | U9 は `listMembers` 系の `Query`。`findDisplayName` は `GetItem` で表示名だけを取る |
| `Families` テーブル | U1 | U2〜U9 ほか | U9 は `loadFamilyAndMembers` の `GetItem` 1 回 |
| `ChoreTypes` テーブル | U4 | U5〜U9 ほか | U9 は `Query` のみ |
| `getAllowances` の窓口 | U9 | U10（`role: system`）、U11（`AdjustmentSource`） | `SystemContext` は U10 の入口だけが作る。`handlers/**`・`entries/api.ts` から import しない |

## 費用の見込み

| サービス | U9 の増分（月） | 無料枠 | 見込み |
|---------|---------------|--------|--------|
| DynamoDB（読み取り、オンデマンド） | 画面の表示ごとに 5〜6 回、抜けた子供がいると +2 回ずつ。家族が月に数十回開いても数百回 | 対象外（従量） | 1 円に満たない（`nfr-design/scalability-design.md`） |
| DynamoDB（書き込み） | 0 | — | 0 円 |
| Lambda | `api` の呼び出しが月に数十回増える | 月 100 万回 | 0 円 |
| CloudFront・S3 | 画面の塊が 1 つ増える。額の応答は転送量が小さい（50 KB 以内） | 無料枠内 | 0 円 |
| LINE のメッセージ | 送らない | — | 0 円（0 通） |
| CloudWatch Logs Insights（手で使う問い合わせ） | 作り手が確認のときだけ。ログは 30 日保管で量が小さい | 対象外（検索したデータ量の従量） | 新しい資源の費用はなし。検索したデータ量の従量だけで、月 1 ドルの Budgets の範囲内。広い期間の検索を常用しない |
| 新しい有料のサービス | なし | — | なし |

- 新しい資源は足しません。従量なのは DynamoDB の読み取りと手で使う Logs Insights の検索だけで、どちらも月 1 ドルの Budgets の範囲内に収まる見込みです。呼び出しの回数の確かめに使う `AWS/DynamoDB` の標準メトリクスは追加費用なしです（`monitoring-design.md`）。U5 の最初の請求の確認に U9 の増分を含めて見ます

## 元に戻す手順

| 場面 | 戻し方 |
|------|--------|
| U9 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する（NFR10.12） |
| 権限・環境変数を戻す必要があるか | ない。U9 は `app-stack.ts` を変えないので、消える権限・環境変数はない |
| データ | 移行も削除も要らない。U9 は何も書かない |
| 動作 | 前の版に戻すと S5 の入口と API が消える（`GET .../allowances` は 404）。S1 のカレンダーなどは変わらない |
| 順序の注意 | U10 が `getAllowances` を使い始めたあとは、**U10 を先に戻す**。そうしないと U10 の月末のまとめが失敗する（NFR10.12） |
| `lib/promise.ts` の `mapWithConcurrency` の移動 | U9 と一緒に戻る。U8 のフックは再公開で名前と並行数を保つ設計なので、戻しても動く |

## 本番のデータの決まりとの関係

| 決まりの守り方 | 内容 |
|---------------|------|
| 書かない | U9 は何も書かない。新しい IAM の文を足さない |
| 秘密を含まない | 新しい環境変数・SSM パラメータ・GitHub Variables を足さない |
| 直接の書き換えをしない | `Calendar` などを直接書き換えるスクリプト・一括修正の手順を作らない（NFR6.10）。測定のデータは画面と LINE の操作で作る |

## Sources

- `construction/u9-allowance/nfr-design/logical-components.md`（Infrastructure Design へ渡すこと、障害の波及範囲、他の単位との約束）
- `construction/u9-allowance/nfr-design/security-design.md`（NFR4.89、権限と環境変数は足さない、NFR5.16・NFR5.17）
- `construction/u9-allowance/nfr-design/scalability-design.md`、`reliability-design.md`、`performance-design.md`、`observability-design.md`
- `construction/u9-allowance/functional-design/functional-spec.md`（契約への追加、次の単位への引き継ぎ）
- `inception/domain-design/components.md`（C10 お小遣いの計算）
- `inception/contract-design/contract-summary.md`（C1、C6〜C10）
- `construction/u8-swap/infrastructure-design/infrastructure-specification.md`（形の手本）
- `infrastructure/lib/app-stack.ts`、`infrastructure/lib/data-stack.ts`、`scripts/smoke-check.sh`、`.github/workflows/*.yml`、`README.md`（実コードを読んで確かめた）

## Assumptions & Open Questions

- [assumption] インフラの食い違いは見つかりませんでした。`api` の `Users`（`GetItem`、`familyId-index` の `Query`）、`Families`（`GetItem`）、`ChoreTypes`（`Query`）、`Calendar`（`GetItem`・`Query`）、4 つの環境変数は、NFR 設計の記述と一致しました
- [assumption] `/v1/months/current/allowances` の `current` がパスとして CloudFront を通ることは、設定を読んで確かめた結果です（書き換え関数は `/v1/` を触らない）。実際に届くことは、スモークチェックの 3q（401）とステージングの画面で確かめます
- [assumption] U9 のコードはまだ書かれていません。「書き込みの命令 0 回」と「差分なし」は、コード生成後の単体テストと CDK のテストで初めて確かめられます。コード生成の最初に `app-stack.ts` を再度読み、不足があれば `security-design.md` に戻って足します
- [assumption] 画面の塊が S3 と CloudFront の無料枠に収まる前提です。大きさは測定で確かめます
- 追加の質問はありません
