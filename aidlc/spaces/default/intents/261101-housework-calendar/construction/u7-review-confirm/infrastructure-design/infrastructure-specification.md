# インフラの仕様（Infrastructure Specification）— U7 確認・修正と確定

U7（`u7-review-confirm`）で、U1〜U6 の構成に足す・変える AWS の資源です。**新しいテーブル・Lambda・索引・指標・アラームは足しません**（NFR1.31）。さらに U6 と違い、**`AppStack` の IAM と環境変数も変えません**。U7 は `api` の Lambda に状態の変更・確定・取り消しの処理（アプリコード）を足すだけで、`api` に要る権限と環境変数は U4・U5 で足し済みです（`app-stack.ts` を読んで確かめ済み。下の表）。`line` の Lambda は U7 で一切変えません（LINE の経路なし。NFR4.72、NFR1.30）。決めることはすべて NFR 設計（`nfr-design/logical-components.md` の「Infrastructure Design へ渡すこと」）で決まっているため、この段階では人に聞くことはありませんでした。

## Deployment

| Facet | Choice | Rationale |
|-------|--------|-----------|
| 計算の形 | U1 の `api` の Lambda に 3 つの入口（`POST /v1/duties/:dutyId/status`、`PUT`・`DELETE /v1/months/:month/confirmation`）を足す。新しい Lambda は作らない。`line` には何も足さない | NFR1.31、NFR3.13、NFR1.30。U7 は `api` の既存の Lambda に処理を足すだけ |
| 入口 | 変更なし。`/v1/*` の `api` に 3 つの入口は `AllowedMethods.ALLOW_ALL` で通る（`POST`・`PUT`・`DELETE`。`PATCH /v1/duties/:dutyId` の U5・`POST …/record` の U6 と同じパス型。新しい CloudFront の behavior は不要） | スモークチェック（`cicd-pipeline.md`）で 401 が返ることを確かめる |
| 保存 | `DataStack` は変えない（`Calendar` テーブルは U5 で作済み。`ChoreTypes` テーブルは U4 で作済み）。U7 は `Calendar` の既存の項目（日ごとの担当・月の状態）を書き換えるだけで、新しい項目や保存先を増やさない | NFR1.31、NFR3.12 |
| 環境 | ステージングと本番の両方に同じ変更（`AppStack` のコード反映のみ）。環境ごとに新しい設定・秘密・パラメータを足さない（NFR10.8） | U1 のとおり |
| IaC | **`infrastructure/lib/` のインフラ定義は変えない**。`app-stack.ts`・`data-stack.ts`・`app.ts` はそのまま（U7 は IAM・環境変数を足さない）。変えるのは `infrastructure/test/u7-review-confirm/stacks.test.ts`（新規。前後で同じことを固定）、`scripts/smoke-check.sh`、README、アプリコード（`packages/*`） | `api` の props に `calendar`・`choreTypes` はすでにあり（U4、U5）、権限・環境変数も足り済み |
| 配備の順番 | `Housework-<env>-App` のコード反映だけ（`DataStack` に変更なし、`AppStack` の IAM・環境変数の追加もなし）。ステージングで確かめてから本番へ。**コードが変わる反映は、`api` の冷たい起動を作る機会にもなる**（速さの測定に使う。環境変数や設定を手で書き換えない。NFR10.8、NFR6.8） | U5 の Calendar が既存なので Data スタックの更新は不要 |
| 大きさ | `api` の Lambda: 256 MB、30 秒、ARM64 のまま。測定で 3 秒を超えたときだけ 512 MB への引き上げを検討（無料枠に収まるかを先に確かめる）。常に温めておく仕組み（Provisioned Concurrency など有料）は使わない | NFR3.13、NFR7.33、NFR7.34。U1 の設定を変えない |
| 秘密の情報 | 足さない。`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` の値はテーブル名（CloudFormation が付けた名前）で、秘密ではない。U7 は LINE を呼ばないのでチャネルトークンも使わない。`jwt/*` の SSM は U1 のまま `api` が起動時に読む | NFR5.13 |
| 本番の初期データ | CDK でも配備の手順でも入れない。記録のデータと月の確定はアプリの画面の操作でだけ変わる | 本番のデータは手で書き換えない決まり（NFR6.8、BR8.8） |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---------|------|---------------|-------|
| DynamoDB `Calendar`（既存。U5 で作済み） | database | 変更なし（`DataStack` は触らない） | `api` から `GetItem`・`Query`・`UpdateItem`・`PutItem`・`ConditionCheckItem` を使う。すべて U5 で足した権限の範囲内。U7 は担当を消さないので `DeleteItem` は使わない（権限は残る） |
| DynamoDB `ChoreTypes`（既存。U4 で作済み） | database | 変更なし | `api` から markDone のとき `GetItem`（単価の読み）・`ConditionCheckItem`（単価の確かめ）を使う。U4 で足した権限の範囲内 |
| Lambda `api`（コードのみ変更） | compute | 権限・環境変数・メモリ・時間切れはすべて U7 の前後で**同じ**。中のコード（ルートとサービス）だけ足す | `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` は U4・U5 で足し済み。256 MB・30 秒・ARM64 のまま |
| Lambda `line`（変更なし） | compute | U7 で何も変えない | U7 は LINE の経路を持たない（NFR4.72、NFR1.30） |
| IAM（`api` のロール） | access control | **追加なし**（下の表）。`line` のロールも変えない | `grantReadWriteData` は使わない（Scan などが付くため）。U5・U4 で足した絞った権限のまま |
| CloudWatch Logs | logging | 変更なし（`api` と `line` のロググループ、保管 30 日） | `monitoring-design.md`。指標とアラームは U10 |
| CloudFront | cdn | 変更なし | `/v1/*` が `api` の関数 URL に届く。3 つの入口は既存の behavior で通る |

### `api` の Lambda の権限（足さないことの確認）

U7 は `api` の Lambda に新しい権限も環境変数も足しません。`infrastructure/lib/app-stack.ts` を読んで確かめた結果です（NFR4.71）。

U7 が `api` で使う操作が、すべて U4・U5 の既存の権限の範囲内であること（**変更前 → 変更後が同じ**）:

| テーブル | 変更前（U6 まで。`api`） | U7 で使う操作 | 変更後（U7。`api`） | 追加 |
|---------|------------------------|--------------|--------------------|------|
| `Calendar` | `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（6 つ） | 担当の `UpdateItem`、月の状態の `UpdateItem`、確定行の `PutItem`（`attribute_not_exists`）、月・単価の `ConditionCheckItem`、`findDuty` の `GetItem` | 同じ（6 つ） | **なし** |
| `ChoreTypes` | `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`（6 つ） | 単価の `GetItem`、単価の `ConditionCheckItem` | 同じ（6 つ） | **なし** |

環境変数（`api`。**変更前 → 変更後が同じ**）:

| 環境変数 | 変更前（U6 まで） | 変更後（U7） | 追加 |
|---------|-----------------|------------|------|
| `CALENDAR_TABLE`（`props.calendar.tableName`） | ある（U5） | 同じ | なし |
| `CHORE_TYPES_TABLE`（`props.choreTypes.tableName`） | ある（U4） | 同じ | なし |
| `ENV`・`SSM_PREFIX`・`ENTRY` ほか | ある（U1） | 同じ | なし |

既存の `api` の権限（変えない。参考）:

| テーブル / 資源 | アクション |
|---------------|-----------|
| `Users` テーブル | `GetItem`・`PutItem`・`UpdateItem` |
| `Users` の `lineUserId-index`・`familyId-index` | `Query` |
| `Families` | `GetItem`・`PutItem`・`UpdateItem`・`ConditionCheckItem` |
| `RequestRecords` | `GetItem`・`PutItem` |
| `Invitations` | `GetItem`・`PutItem`・`UpdateItem`・`ConditionCheckItem` |
| `NotificationGroups` | `GetItem` |
| SSM `jwt/*`・`line/*`・`cloudfront/*` | `ssm:GetParameter`・`ssm:GetParameters`（＋ 条件つきの `kms:Decrypt`） |

**足さないもの（NFR4.71、NFR4.72）**: `api` にも `line` にも新しい IAM の文・環境変数を足さない。担当への `PutItem`・`DeleteItem` を**新たに発行する処理は書かない**（U7 は担当を作らない・消さない。確定行の作成は月の状態の項目への `PutItem` で、U5 で足した `Calendar` の `PutItem` の範囲内）。`line` の既存の権限（`Users`・`Families`・`ProcessedLineEvents`・`NotificationGroups`・`Calendar`・`ChoreTypes`・SSM の `line/*`・`cloudfront/*`）は増やさない・減らさない。

### `app-stack.ts` を変えないことの説明（設計の確認）

```ts
// U7: app-stack.ts の IAM・環境変数は変更しない。
// api の Calendar の文（U5）は既に GetItem/Query/PutItem/UpdateItem/DeleteItem/ConditionCheckItem を含む。
//   → U7 の UpdateItem(担当・月の状態) / PutItem(確定行) / ConditionCheckItem(月・単価) / GetItem はこの範囲内。
// api の ChoreTypes の文（U4）は既に GetItem/.../ConditionCheckItem を含む。
//   → U7 の GetItem(単価) / ConditionCheckItem(単価) はこの範囲内。
// api の environment は既に CALENDAR_TABLE・CHORE_TYPES_TABLE を持つ（U4・U5）。
// line の文・environment は U7 で触らない（LINE の経路なし）。
// したがって addToRolePolicy も environment への追加も U7 では行わない。
```

これは設計の説明用で（≤15 行）、U7 は実際には `app-stack.ts` に差分を作りません。U7 の実装差分はアプリコード（`packages/*`）と、前後で同じことを固定する CDK テスト（`infrastructure/test/u7-review-confirm/stacks.test.ts`）とスモークチェックだけです。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|-----------------|------------|----------------|-----------------|
| `Calendar` テーブル（U5 の持ち物） | U5 | U6（記録）、U7（状態の変更・月の確定・取り消し）、U8（代わりにやる）、U9（読むだけ）、U10、U11 | U7（`api`）は `UpdateItem`（担当・月の状態）・`PutItem`（確定行の作成のみ）・`ConditionCheckItem`・`GetItem`・`Query`。担当の `DeleteItem` は使わない（担当を消さない）。操作は `calendarService.ts`（C8 の窓口）を通す |
| `ChoreTypes` テーブル（U4 の持ち物） | U4 | U5（`ConditionCheckItem`）、U6（`GetItem`・`Query`・`ConditionCheckItem`）、U7（`GetItem`・`ConditionCheckItem`） | U7（`api`）は `ChoreTypes` を**読むだけ**（書かない）。markDone のときだけ単価を読み、取引で確かめる |

- `line` はこの U7 の共有に関わりません（U7 は LINE の経路を持たない。NFR1.30、NFR4.72）

## 費用の見込み

| サービス | U7 の増分（月） | 無料枠 | 見込み |
|---------|---------------|--------|--------|
| DynamoDB（書き込み、オンデマンド） | 数百書き込みユニット未満（`scalability-design.md`。取引は 2 倍で数え ConditionCheck も含む。状態の変更 月に数十回、確定・取り消し 数回） | 対象外（従量） | 1 円に満たない |
| DynamoDB（読み取り、オンデマンド） | 数百読み取りユニット未満（状態の変更 1 回で約 4.5 読み取りユニット） | 対象外（従量） | 1 円に満たない |
| Lambda `api` の呼び出し増分 | 月に数十回（状態の変更）＋ 数回（確定・取り消し） | 月 100 万回 | **月 0 円**（無料枠のごく一部） |
| LINE のメッセージ | U7 は LINE を呼ばない（reply・push・multicast・broadcast なし） | — | 0 円（無料のメッセージ数を 1 通も使わない。NFR1.30） |
| 新しい有料のサービス | なし | — | なし |

- 合計（1 環境の月の増分）: 1 円に満たない小さな量。管理者 1 人の操作で量が少ない
- **U5 の最初の請求の確認**（`cicd-pipeline.md`）に、U7 の増分を含めて見ます。U7 だけを切り出して確かめる手順は不要です
- オンデマンドの読み書きは無料枠の対象外です（U5 の説明のとおり）。AWS の請求額は端数の丸めで 0 円のまま

## 本番のデータの決まりとの関係

| 決まりの守り方 | 内容 |
|---------------|------|
| 書く経路を最小にする | `api` の既存の権限のまま。U7 で新しい IAM の文を足さない。担当を作る・消す処理を書かない（`PutItem`・`DeleteItem` を担当に新たに発行しない。確定行の `PutItem` は月の状態の項目のみ） |
| 秘密を含まない | 新しい環境変数・SSM パラメータ・GitHub Variables を足さない。U7 は LINE を呼ばないので新しいトークンもない |
| 直接の書き換えをしない | `Calendar` の項目を直接書き換えるスクリプト・一括修正の手順を作らない（BR8.8）。記録のデータと月の確定はアプリの画面の操作でだけ変わる |
| 戻す手順が安全 | 前の版に戻して再反映しても、U7 は権限・環境変数を足さないので消えるものはない。記録済みのデータと月の状態は `Calendar` に残り、読み書きしても壊れない（項目の形は U5 のまま。月の状態に足す `confirmedAt`・`confirmedByUserId`・`version` は U5・U6 が読まない） |

### 元に戻す手順

| 場面 | 戻し方 |
|------|--------|
| U7 のコードの不具合 | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する |
| 権限・環境変数を戻す必要があるか | **ない**。U7 は `app-stack.ts` を変えないので、戻しても消える権限・環境変数はない（U6 と違う点） |
| ステージング | `Calendar` のデータは確認用なので失ってよい（U5 の `DESTROY` で既存） |

- U7 は `Calendar` の既存の項目（担当の状態・月の状態）を書き換えるので、本番でコードを戻しても、書き込み済みの状態や月の確定は `Calendar` に残ります（U5 の `RETAIN`。消えない）。戻したコードが U7 以前なら状態の変更・確定の入口が無くなりますが、`Calendar` の既存のデータは壊れません（月の状態の追加属性 `confirmedAt`・`confirmedByUserId`・`version` は U5・U6 が読まないので無害）

## Sources

- `construction/u7-review-confirm/nfr-design/logical-components.md`（Infrastructure Design へ渡すこと。追加なしの引き継ぎ）
- `construction/u7-review-confirm/functional-design/functional-spec.md`（C1 の 3 入口、C8 の `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`、契約への追加、次の単位への引き継ぎ）
- `inception/domain-design/components.md`（コンポーネントの所有境界。カレンダーが月の確定と状態を持つ。ADR-001、ADR-003、ADR-005）
- `construction/u7-review-confirm/nfr-design/security-design.md`（NFR4.65〜NFR4.73、NFR5.13、権限と環境変数が足り済み）
- `construction/u7-review-confirm/nfr-design/scalability-design.md`（費用、読み書きの量、LINE を呼ばない、構成の数）
- `construction/u7-review-confirm/nfr-design/reliability-design.md`（取引の形、確定・取り消しの冪等、`Calendar` の RETAIN、元に戻す手順、ADR-U7-01）
- `construction/u7-review-confirm/nfr-design/performance-design.md`（メモリ 256・時間切れ 30、常温めなし）
- `inception/contract-design/contract-summary.md`（C1、C8、C10、`familyScope`）
- `construction/u6-recording/infrastructure-design/infrastructure-specification.md`（形の手本、Calendar の共有、本番のデータの決まり）
- `infrastructure/lib/app-stack.ts`、`data-stack.ts`、`app.ts`（既存の作りと権限。`api` の `Calendar` 6 操作・`ChoreTypes` 6 操作・`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`、`line` の権限、256 MB・30 秒・ARM64、`Calendar` の `RETAIN` は本番で設定）

## Assumptions & Open Questions

- [assumption] `api` の権限・環境変数が足り済みであることは、`infrastructure/lib/app-stack.ts` を読んで確かめました（`api` の `Calendar` と `ChoreTypes` の 6 操作ずつ、`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` が `api` にある）。U7 は Infrastructure Design に**追加なし**で引き継ぎます。確定行の作成の `PutItem`（`attribute_not_exists`）も U5 の `Calendar` の `PutItem` の範囲内です
- [assumption] 月の状態（`M#<month>#S`）に足す `confirmedAt`・`confirmedByUserId`・`version` は項目の属性で、テーブルの定義（`DataStack`）には影響しません（索引を足さない）。属性の追加は壊す変更になりません（`confirmed` だけを読む U5・U6 に影響しない。`docs/contract-changes-u7.md` はコード生成で書きます）
- [assumption] `calendarService.ts`・`calendarRepository.ts` への追加はアプリコードの変更で、Infrastructure Design の成果物には含みません。インフラ側は `app-stack.ts` を変えないことだけを確定させます
- 追加の質問はありません
