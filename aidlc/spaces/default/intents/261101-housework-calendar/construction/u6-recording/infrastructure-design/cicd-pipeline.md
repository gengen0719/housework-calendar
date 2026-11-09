# 反映の流れ（CI/CD Pipeline）— U6 記録

U6（`u6-recording`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。変えるのは、CDK のテスト（新規 `infrastructure/test/u6-recording/stacks.test.ts`）、スモークチェック（`scripts/smoke-check.sh` に 4 件追加）、README だけです。

## ワークフロー

| ワークフロー | U6 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U6 のコードも Prettier、ESLint、型の検査（`tsc` の 4 つのプロジェクト。`infrastructure` を含む）、Vitest（行カバレッジ 80% 以上。NFR8.11）、gitleaks、`cdk synth` を通す |
| `deploy-staging.yml` | 変更なし。`main` への取り込みで、CI のあと `cdk deploy Housework-staging-App` が走り（`DataStack` は変更なし）、そのあと `smoke-check.sh` が走る |
| `deploy-production.yml` | 変更なし。作り手が手で動かす |

- 新しい秘密の情報、GitHub の Variables、パラメータストアのパラメータは足しません
- `cdk deploy` は `--require-approval never` なので、権限の追加（`line` の `Calendar` と `ChoreTypes` の 2 文）は配備の途中で止まりません。権限の中身は CDK のテストが固定して守ります

## CDK のスタックテスト（`infrastructure/test/u6-recording/stacks.test.ts`）

U5 のテスト（`u5-assignment-calendar/stacks.test.ts`）と同じ作り（`buildApp` でスタックを組み立て、`Template` で確かめる。ダミーの秘密の値は `test/fixtures/fakeSecrets.ts`）で、次を確かめます（NFR4.63、NFR4.64、NFR1.25）。

### 新しく確かめること

| 区分 | 確かめること |
|------|-------------|
| `line` の環境変数 | `CALENDAR_TABLE` がある |
| `line` の環境変数 | `CHORE_TYPES_TABLE` がある |
| `line` の `Calendar` の許可 | `GetItem`、`Query`、`UpdateItem`、`ConditionCheckItem` が**ちょうど 4 つ**（`PutItem`、`DeleteItem` がない） |
| `line` の `Calendar` の禁止 | `Scan`、`BatchGetItem`、`BatchWriteItem`、`PutItem`、`DeleteItem`、`dynamodb:*` が含まれない |
| `line` の `Calendar` の資源 | テーブルの ARN だけで `/index/` を含まない。文は 1 つ |
| `line` の `ChoreTypes` の許可 | `GetItem`、`Query`、`ConditionCheckItem` が**ちょうど 3 つ**（`PutItem`、`DeleteItem`、`UpdateItem` がない） |
| `line` の `ChoreTypes` の禁止 | `Scan`、`BatchGetItem`、`BatchWriteItem`、`PutItem`、`DeleteItem`、`UpdateItem`、`dynamodb:*` が含まれない |
| `line` の `ChoreTypes` の資源 | テーブルの ARN だけ。文は 1 つ |
| ステージング・本番の分離 | ステージングの `line` が本番の `Calendar` の ARN を含まない（クロス環境参照がない） |

### 変えないことの確かめ（U6 の前後で同じであること）

| 確かめること |
|-------------|
| `api` の `Calendar` の許可は U5 のまま（6 つ: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem） |
| `api` の `ChoreTypes` の許可は U5 のまま（6 つ: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem） |
| `line` の既存の許可（`Users`・`ProcessedLineEvents`・`NotificationGroups`・`Families`・SSM）が変わっていない |
| `line` に `Users` の `familyId-index` の Query がない |
| `line` に `jwt/*` の SSM がない |
| `api` のロールに `Resource: "*"` の DynamoDB の文がない（`kms:Decrypt` の条件つき文は U1 のまま） |
| Lambda は MemorySize 256・Timeout 30 のまま |
| ロググループの保管は 30 日のまま |
| `AWS::Logs::MetricFilter` は 1 つのまま（U6 でメトリクスフィルターを足さない） |
| テーブル・Lambda・ロググループの合計が U6 の前後で同じ（テーブル 8、Lambda 2、ロググループ 2） |
| 本番の `Calendar` は `DeletionPolicy = Retain` のまま |

> **U6 配備後に削除またはスキップするテスト**: U6 の `app-stack.ts` を適用すると、U5 の `test/u5-assignment-calendar/stacks.test.ts` の `it('line に Calendar も ChoreTypes も含む文がない（U5 の時点の確認...）'` と U4 の `test/u4-chore-types/stacks.test.ts` の `it('line に ChoreTypes の許可がない（U4 の時点の確認...）'` は必ず失敗します（`line` に権限が加わるため）。これら 2 件は U6 の CDK コードを反映したあとに**削除またはスキップ**します。U6 の `u6-recording/stacks.test.ts` が U6 後の `line` の権限を新たに固定します（コードのコメントにも記載済み）。

### 既存テストへの影響

U6 の変更は `DataStack` を変えないため、U5・U4 のテストのうち `AppStack` に関係しないものは U6 後も通ります。ただし次の 2 件は**U6 の CDK コードを適用した時点で必ず失敗します**。

| テストファイル | テスト名（`it(...)` の先頭） | 失敗する理由 | U6 配備後の対処 |
|---|---|---|---|
| `test/u5-assignment-calendar/stacks.test.ts` | `line に Calendar も ChoreTypes も含む文がない（U5 の時点の確認...）` | U6 で `line` に `Calendar`・`ChoreTypes` の 2 文が加わるため | **削除またはスキップする**。U6 の `stacks.test.ts` が代わりの確認を持つ |
| `test/u4-chore-types/stacks.test.ts` | `line に ChoreTypes の許可がない（U4 の時点の確認...）` | U6 で `line` に `ChoreTypes` の文が加わるため | **削除またはスキップする**。U6 の `stacks.test.ts` が代わりの確認を持つ |

> **注**: 上の 2 件のテストは、現在（U5・U4 のコードのまま）は**通ります**。壊れるのは U6 の CDK コードを `app-stack.ts` に適用したあとです。コードのコメントにも「U6 の適用後は削除またはスキップする」と記載済みです。U6 の `u6-recording/stacks.test.ts` が U6 後の `line` の権限（`Calendar` 4 文・`ChoreTypes` 3 文）を新たに固定します。

その他の既存テストへの影響:

- U1 の「DynamoDB テーブル 8 つ」テスト: 変化なし（DataStack は変えない）
- U4 の「`ChoreTypes` の許可が 6 つ」テスト（`api` の許可を確かめる行）: 変化なし（`api` の `ChoreTypes` は変えない）

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

U5 の確かめ（3i〜3l）のあとに 3m の 1 件を追加し（3n〜3p は重複するため追加しない）、先頭コメントの件数を 20 件に直します。

| 番号 | 確かめ | HTTP メソッド / 引数 | 期待 |
|------|--------|-------------------|------|
| 3m | `POST /v1/duties/:dutyId/record`（セッションなし） | `-X POST -H "$json" --data '{}'` | 401 |
| 3n | `POST /v1/duties/:dutyId/record`（api の関数 URL から直接）  | api_direct への POST | ← 別途 4. の check で確認済み。追加なし |

実際に追加するのは `record` エンドポイントの確かめのみです。`duty_id` 変数は U5 で定義済みのものを使います。

```bash
# 3m. U6 の記録のパスがセッションなしで 401（書き込みはしない）
# duty_id は U5 で定義済み（11111111-1111-4111-8111-111111111111）
check "POST /v1/duties/:dutyId/record (セッションなし)" 401 \
  -X POST -H "$json" --data '{}' "${base}/v1/duties/${duty_id}/record"
# LINE の Webhook：record.list の形の postback（署名なしは 401 で止まる。3. と同じ結果のため新規追加なし）
# record.do の形（本体の変更は line Lambda に届く前に署名で止まる。3. と同じ）
# LINE の記録操作への追加の確かめは不要（既存の 3. で `/line/webhook` の署名確かめが通ることを確認済み）
```

**実装では 3m の 1 件だけを追加**して件数を 20 件にします（U5 が 4 件追加して 19 件になったのと同じ方針）。3n〜3p に相当するパターンは 3m と本質的に重複するため（401 確認の目的は同じ）、追加しません。

> 実装上のコメント: 件数コメントを「全 20 件: …3i〜3l が U5 の 4 件、3m が U6 の 1 件」に直す。

---

**実装の詳細（smoke-check.sh に足す差分）**:

```bash
# 3m. U6 の記録操作がセッションなしで 401（書き込みはしない）
check "POST /v1/duties/:dutyId/record (セッションなし)" 401 \
  -X POST -H "$json" --data '{}' "${base}/v1/duties/${duty_id}/record"
```

先頭コメントを「全 20 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件、3i〜3l が U5 の 4 件、3m が U6 の 1 件」に直します。

- `duty_id` は U5 で定義済みの `11111111-1111-4111-8111-111111111111` をそのまま使います（`record` のパスにも同じ形が通る）
- スモークチェックは書き込みをしません（セッションなしで 401 で止まる）

## 反映の順番

1. U6 のプルリクエストを `main` に取り込む（CI が通ってから squash-merge）→ ステージングに自動で反映される（`AppStack` の更新のみ）
2. `smoke-check.sh` が通ることを確かめる（20 件）
3. 作り手がステージングで手で確かめる（下の表）
4. `deploy-production.yml` を手で動かす（本番に同じ変更が入る）
5. 本番で `smoke-check.sh` の結果と、`monitoring-design.md` の問い合わせ 4（返事の失敗・フックの失敗が 0 件）を確かめる

### ステージングでの手での確かめ

| # | 操作 | 期待 |
|---|------|------|
| 1 | 子供のアカウントで LINE の 1 対 1 トークを開き、リッチメニューの「やった」を押す | 今日の「未」の担当の選択肢が返ってくる |
| 2 | 選択肢のボタンを 1 つ押す | 「〇〇を記録しました（時:分）」が返ってくる |
| 3 | 同じボタンを再度押す（二重押し） | 最初と同じ返事（最初の時刻）。記録は 1 件のまま |
| 4 | 管理者のアカウントで「やった」を押す | 「お手伝いの記録は子供のメニューです」が返ってくる |
| 5 | 家族に入っていないアカウントで「やった」を押す | 「先に家族に参加してください」が返ってくる |
| 6 | 子供のアカウントでアプリを開き、「やった」ボタンを押して確認から「記録する」を押す | 「済 HH:MM 〇〇が記録」の表示に変わる。続けてカレンダーが読み直される |
| 7 | 確認ダイアログで Esc を押す | ダイアログが閉じ、「やった」ボタンにフォーカスが戻る |
| 8 | 管理者のアカウントでアプリを開く | 「やった」ボタンが出ない（ボタンも理由文字も出ない） |
| 9 | `line` のログを見る（`monitoring-design.md` の問い合わせ 1・2） | `DUTY_RECORDED` に `route = line`、`durationMs` が出る。LINE のユーザー ID・表示名が出ない |
| 10 | 速さを測る（NFR7.25〜NFR7.27。コールドスタートを含めて 20 回） | 95% が 3 秒以内（結果は `build-and-test` の記録に残す） |
| 11 | `line` のバンドルの大きさを確かめる（Build and Test への引き継ぎ） | U5 以前から大幅に増えていないこと（`calendarService` を import していない） |

- コールドスタートを作る方法は U5 と同じ（コードが変わる反映、または数十分以上待つ）。環境変数を手で書き換える方法は使いません
- 本番ではテストデータを入れません

## 前の版に戻す

| 場面 | 戻し方 |
|------|--------|
| U6 のコードの不具合（`Calendar` のデータに影響しない部分） | `git revert` して `main` に取り込む。ステージングは自動、本番は手で反映する |
| `line` の権限・環境変数だけを戻す | 前の版に戻して反映すると `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` の環境変数と 2 文の権限が消える。`line` から `Calendar`・`ChoreTypes` に触れなくなる。`Calendar` の記録済みデータは壊れない（項目の形は U5 のまま） |
| ステージング | `Calendar` のデータは確認用なので失ってよい（U5 の `DESTROY` で既存） |

- U6 は `Calendar` に書き込みをするので、本番に記録が入ったあとにコードを戻しても、記録の項目は `Calendar` に残ります（U5 の `RETAIN`。消えない）。戻したコードが U5 以前なら `line` に `Calendar` の権限がなく、LINE からの記録は失敗しますが、既存のデータは壊れません
- リッチメニューは README の取り消し手順（NFR10.7）で外します

## 費用の確かめ

U6 の増分（月約 0.003 ドル、約 0.5 円）は、U5 の最初の請求の確認（`construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md` の「費用の確かめ（最初の請求）」）に含めて見ます。U6 だけを分けて確かめる必要はありません。増分は U5 の 2 倍に届かない量なので、U5 の範囲内に収まるはずです。

## README に足すこと

- リッチメニューの設定・確認・取り消し（`scripts/setup-rich-menu.ts` の使い方。`--env staging` / `--env production` の指定が必須。トークンは SSM か環境変数から読む。値は例として `<作り物の値>`。NFR10.7）
- 速さの測り方: LINE のアプリで 20 回押して画面録画から読み取る手順（3 秒の基準、コールドスタートの含め方）。NFR7.30
- スモークチェックの記述の更新: 「全 19 件」を「全 20 件」に。`POST /v1/duties/:dutyId/record` が 401 になることを書き足す
- 配備後に LINE の Webhook の再送が有効なことを確認する手順（リッチメニューで「やった」を押したあと、本番に届いていることを確かめる）

## 秘密の情報

U6 で新しい秘密の情報はありません。`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` の値はテーブル名です。リッチメニューのスクリプト（`scripts/setup-rich-menu.ts`）が使うチャネルアクセストークンは、既存の SSM（`line/channel-access-token`）から実行時に読みます。スクリプトにも README にも値を書きません（例は `<作り物の値>`）。gitleaks（CI）が通ること。

## Sources

- `construction/u6-recording/infrastructure-design/infrastructure-specification.md`、`monitoring-design.md`
- `construction/u6-recording/nfr-design/logical-components.md`（CDK のテスト、リッチメニュー、配備の順番、元に戻す手順、費用）
- `construction/u6-recording/nfr-design/security-design.md`（NFR4.63、NFR4.64）
- `construction/u6-recording/nfr-design/performance-design.md`（NFR7.25〜NFR7.30、測り方）
- `construction/u5-assignment-calendar/infrastructure-design/cicd-pipeline.md`（形の手本、費用の確かめ）
- `scripts/smoke-check.sh`、`.github/workflows/`（既存）

## Assumptions & Open Questions

- [assumption] U5 の `stacks.test.ts` の「`line` に Calendar も ChoreTypes も含む文がない（U5 の時点の確認）」と U4 の「`line` に ChoreTypes の許可がない（U4 の時点の確認）」は、U6 の CDK コードを適用した後に削除またはスキップします。U6 のテスト（`u6-recording/stacks.test.ts`）が U6 後の権限を新たに固定します
- [assumption] `smoke-check.sh` の 3m は POST の 401 確認のみで、3n〜3p に相当する追加のパターンは実質的に重複するため 1 件に絞ります。20 件で U6 の確かめとして十分です
- [assumption] リッチメニューの画像とスクリプト（`scripts/setup-rich-menu.ts`）はコード生成で作ります。Infrastructure Design の成果物には含みません
- 追加の質問はありません
