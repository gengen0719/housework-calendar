## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T13:45:00Z
**Iteration:** 1
**Verdict Dictated:** no

U7 のインフラ設計 3 成果物（`infrastructure-specification.md`・`monitoring-design.md`・`cicd-pipeline.md`）と `traceability.json` を、既存コード（`infrastructure/lib/app-stack.ts`・`data-stack.ts`・`app.ts`、`infrastructure/test/` の u4〜u6、`scripts/smoke-check.sh`、`.github/workflows/`）と上流の NFR 設計に照らして検証しました。主要な主張はすべて裏が取れました。

検証の要点（根拠つき）:

- **「U7 はインフラ追加なし・`app-stack.ts` を変えない」** — 正しい。`app-stack.ts` の `api` の `Calendar` の文は U5 で 6 操作（`GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`）を付与済み。U7 の確定行の作成（`M#<month>#S` への `attribute_not_exists` つき `PutItem`）はこの既存の `PutItem` の範囲内。`ChoreTypes` も U4 で 6 操作付与済みで、U7 の `GetItem`・`ConditionCheckItem`（単価）はその範囲内。`api` の `environment` に `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` が既にある。したがって IAM・環境変数の追加は不要で、主張と一致。
- **「U7 で追加で壊れる既存 CDK テストは無い」** — 正しい。U7 は `line` も `app-stack.ts` も変えない。U6 で `it.skip` にした 2 件（`test/u5-assignment-calendar/stacks.test.ts` の「`line` に Calendar も ChoreTypes も含む文がない」、`test/u4-chore-types/stacks.test.ts` の「`line` に ChoreTypes の許可がない」）は現物の `it.skip` と記述まで一致し、U7 で触れずスキップのまま。`u6-recording/stacks.test.ts`（`api` の Calendar 6・ChoreTypes 6、`line` の Calendar 4・ChoreTypes 3、Lambda 256/30/ARM64、本番 Calendar の Retain、構成の数）は `app-stack.ts` が不変なので通ったまま。
- **CDK テストの新規内容** — 固定する値（`api` Calendar 6・ChoreTypes 6、`line` Calendar 4・ChoreTypes 3、`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`、MemorySize 256/Timeout 30/ARM64、ロググループ 30 日、本番 Calendar の Retain）はすべて現物の `app-stack.ts` と一致。構成の数（テーブル 8・Lambda 4・ロググループ 2・MetricFilter 1）も `data-stack.ts`（8 テーブル）と `app-stack.ts`（`InvitationInvalidMetricFilter` 1 件、`api`/`line` + CDK 補助 2 = 4 Lambda、2 LogGroup）に一致。u6 の既存ヘルパー（`statementsFor`/`actionsOnTable`/`lambdaVariables`）を使う前提も現物どおり。
- **スモークチェック 3n〜3p** — 正しい。現物の `smoke-check.sh` は 20 件・末尾が 3m で、3n から続ける番号は連続。3 入口すべてセッションなしで 401（本文が空でも 401 で止まるので書き込みなし）。PUT・DELETE は `/v1/*` の CloudFront behavior が `AllowedMethods.ALLOW_ALL`（現物で確認）なので CloudFront を通って `api` に届き 403・405 にならない。`duty_id` の作り物 UUID と `month = 2000-01` は現物の 3i〜3m と同じ値。
- **traceability** — `upstream_ids` の 36 件（NFR1.30・1.31、NFR2.44〜2.53、NFR3.11〜3.13、NFR4.65〜4.73、NFR5.13、NFR6.8、NFR7.33〜7.38、NFR8.13、NFR9.8、NFR10.8、NFR11.7）は nfr-design の `traceability.json` の `upstream_ids` と完全一致し、全件 `OK` で `target` も非空。費用 0 円（新しい課金対象なし・LINE を呼ばない）と元に戻す手順（`git revert` のみ、権限・環境変数は戻す対象なし、`Calendar` は本番 RETAIN で既存データが残る）は spec・cicd・reliability-design の記述と整合。

Critical・Major はありません。下記は Minor（判定を妨げません）。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/infrastructure-design/monitoring-design.md > Logs & Tracing の `DUTY_REASSIGN_HOOK_FAILED` の行、および Assumptions の 3 点目 | 上流の `functional-spec.md`（C8 `onDutyReassigned` の表と「次の単位への引き継ぎ」）は `onDutyReassigned` の `kind` に `'status-changed'` と `'month-confirmed'` の 2 つを足すと書くが、本成果物は `reliability-design.md` R-01 の決定（`'month-confirmed'` は作らず、月の確定も担当ごとの `status-changed` に展開）に合わせて `'status-changed'` だけとしている。読み手には上流 2 文書の食い違いが見え、どちらが正かが明示されていない | インフラ側の判断（`status-changed` だけ）は正しく、IAM・環境変数・構成の数に影響しないため本成果物の記述変更は不要。コード生成の入力として、`functional-spec.md` の C8 `onDutyReassigned` 行を `reliability-design.md` R-01 に合わせて `'status-changed'` のみへ直す（または `docs/contract-changes-u7.md` で正を明記する）ことを、後続ステージの申し送りに残すとよい | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u7-review-confirm/infrastructure-design/cicd-pipeline.md > 反映したあとの確かめ（`scripts/smoke-check.sh`）の本文 | 「`month` は U5 と同じ作り物の `2000-01` を使います」という表現は、現物の `smoke-check.sh` が `month` という変数を持たず `2000-01` をリテラルで URL に埋め込んでいる点と照らすと、`${month}` 変数の存在を示唆するように読めなくもない。実装差分の擬似コードは正しく `2000-01` をリテラルで書いており、動作に矛盾はない | 誤読を避けるため「`month` は `2000-01`（U5 と同じ作り物）をリテラルで使う」の旨に言い換えると明確。動作には影響しないため任意 | New |

### Validation Tool Results

ステージ定義（`.kiro/aidlc-common/stages/construction/infrastructure-design.md`）は、設計ステージ向けの `required-sections`・`upstream-coverage`・`linter`・`type-check`・`traceability` センサーを宣言していますが、レビュアーが手で実行する検証ツール（`validate-*` 等）は列挙していません。代わりに、設計の主張を現物コードとの手照合で検証しました（上記「検証の要点」）。CDK コマンド・エンジンコマンドは依頼どおり実行していません。

| 確認 | 結果 | 解釈 |
| --- | --- | --- |
| `app-stack.ts` の `api` Calendar/ChoreTypes の操作集合 | 一致（各 6 操作、`PutItem` 含む） | 「追加なし」と確定行 `PutItem` が既存範囲内という主張を裏づけ |
| `app-stack.ts` の `api` 環境変数 | `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` あり | 環境変数の追加不要の主張を裏づけ |
| `line` の文（Calendar 4・ChoreTypes 3）と環境変数 | 一致 | U7 は `line` を変えない＝ NFR4.72 の主張を裏づけ |
| 構成の数（テーブル 8・Lambda 4・LogGroup 2・MetricFilter 1） | data-stack/app-stack と一致 | CDK テストの固定値が現物と整合 |
| `/v1/*` の CloudFront `AllowedMethods` | `ALLOW_ALL`（GET/HEAD/OPTIONS/PUT/PATCH/POST/DELETE） | 3n〜3p の PUT/DELETE が 403/405 にならない主張を裏づけ |
| `smoke-check.sh` の現状件数・番号 | 20 件、末尾 3m | 3n 開始・23 件への更新が連続と一致 |
| `it.skip` の 2 件（u4・u5） | 記述まで一致 | 「U7 で追加破壊なし」「2 件はスキップ継続」の主張を裏づけ |
| `traceability.json` の 36 ID と nfr-design の upstream | 完全一致・全件 OK・target 非空 | 全 NFRx.y 対応の主張を裏づけ |

### Summary

U7 Infrastructure Design の 3 成果物と traceability は、現物の `app-stack.ts`／既存テスト／`smoke-check.sh`／上流 NFR 設計と整合しており、「インフラ追加なし・`app-stack.ts` 不変・既存 CDK テストを追加で壊さない・3 入口の 401 スモークチェック・全 NFRx.y 対応・費用 0 円・安全な戻し手順」という主要な主張はすべて裏が取れました。Critical・Major はなく、残る 2 件は上流文書間の食い違いの申し送りと文言の明確化という Minor のみです。判定は READY。
