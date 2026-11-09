## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T04:05:29Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/infrastructure-design/cicd-pipeline.md > 「CDK のスタックテスト」節「既存テストへの影響」、および「変えないことの確かめ」表 | U5 の `stacks.test.ts` の `it('line に Calendar も ChoreTypes も含む文がない')` は、U6 を反映した `app-stack.ts` をビルドすると失敗する。設計では「U5 のテストは変えない」と明示しているが、テストは `buildApp` で同じスタックを組み立てるため、`line` のロールに Calendar 文と ChoreTypes 文が追加された状態では必ず `expect(json).not.toContain('Calendar')` が失敗する。「U6 のテストが固定する」と「U5 のテストは変えない」の両立は不可能。 | U5 の `stacks.test.ts` の当該テスト（`it('line に Calendar も ChoreTypes も含む文がない')`）を U6 の変更に合わせて修正するか、U5 の設計時点の状態を確かめる意図であることを明示して削除・スキップし、CI が壊れないようにする方針を cicd-pipeline.md に明記する。「変えない」は実装不可であるため方針を確定させること。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/infrastructure-design/cicd-pipeline.md > 「反映したあとの確かめ」節（「実際に追加する 4 件（3m〜3p）」と「実装では 3m の 1 件だけを追加」の記述） | 同じ節の中で「実際に追加する 4 件（3m〜3p）」と「実装では 3m の 1 件だけを追加して件数を 20 件にします」が矛盾している。実装者はどちらを正とすればよいか判断できない。 | いずれか一方に統一する。実装方針が「3m の 1 件だけ追加、計 20 件」であれば、「実際に追加する 4 件（3m〜3p）」の表を削除するか、「設計上の確認パターン（参考）」であることを明示する。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| 既存コード（app-stack.ts）との照合 | PASS: `line` の createFunction 呼び出しに `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` がない（U5 テストが通る状態）。U6 で 2 つの環境変数と 2 文の権限を追加する設計と一致 | 環境変数の追加先・追加方法は明確。実装可能 |
| 既存コード（app-stack.ts）との照合：`api` の Calendar 権限 | PASS: 既存コードに GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem の 6 操作がある。U6 では変更不要と設計が明示しており一致 | U6 で `api` を変えないことが確かめられた |
| U4 テスト（u4-chore-types/stacks.test.ts）との照合 | PASS: `it('line に ChoreTypes の許可がない')` は U6 後に壊れる可能性があるが、U5 テストの `it('line に Calendar も ChoreTypes も含む文がない')` と同様の問題として U6 テストで新たに固定される設計になっている。ただし U4 テストの当該 it も同一の問題を持つため、U4 の `it('line に ChoreTypes の許可がない')` も U6 後に失敗する | U4 テストへの影響は cicd-pipeline.md に記載なし。設計書の「既存テストへの影響」節で明示されている問題と本質的に同じ問題が U4 テストにも存在する。ただし設計の論拠（「U5 テストは変えない」方針）の一貫性に関わるため、主要な指摘は U5 の既存テストへの影響の箇所に統合した |
| traceability.json の NFR 対応 | PASS: upstream_ids に挙がった全 NFRx.y（NFR1.23〜NFR1.28、NFR2.33〜NFR2.43、NFR3.7〜NFR3.10、NFR4.53〜NFR4.64、NFR5.10〜NFR5.12、NFR6.7、NFR7.25〜NFR7.32、NFR8.11〜NFR8.12、NFR9.6〜NFR9.7、NFR10.6〜NFR10.7、NFR11.5〜NFR11.6）について、coverage 配列に対応する target の記述が存在し、infrastructure-specification.md・cicd-pipeline.md・monitoring-design.md のいずれかに根拠がある | トレーサビリティに欠落なし |
| スモークチェック番号連続性 | PASS: 既存の smoke-check.sh は 3i〜3l で終わる（19 件）。U6 で 3m を追加するのは番号として連続している。ただし「実装では 3m の 1 件だけを追加して件数を 20 件にします」の記述と先頭コメント更新の記述は整合している | 「3m が U6 の 1 件」という方針の一貫性は、上記 Minor 指摘の解決後に確定される |
| 元に戻す手順の安全性 | PASS: 権限を削除した版に戻して再反映しても、Calendar テーブルは本番で RETAIN のため既存データは壊れない。`line` からの DynamoDB アクセスが失敗するだけで、既存の記録項目の形（U5 のまま）は変わらない | 元に戻す手順は安全 |
| 費用の見込み | PASS: DynamoDB オンデマンドの書き込み約 3,600 ユニット（約 0.003 ドル）、Lambda 呼び出し増分は月 0 円（無料枠の 0.1% 未満）、新しい有料サービスなし。月 1 円未満の見込みは U5 の最初の請求確認に含める方針で整合 | 費用の見込みは現実的 |
| line の Calendar・ChoreTypes への過剰権限の確認 | PASS: PutItem・DeleteItem・Scan・BatchGetItem・BatchWriteItem・dynamodb:* の追加なし。`api` のロールの変更なし。設計書（infrastructure-specification.md・security-design.md・nfr-design/logical-components.md）の「足さないもの」と一致 | 最小権限の原則が守られている |

### Summary

主要な問題は 1 つ：U5 の `stacks.test.ts` の `it('line に Calendar も ChoreTypes も含む文がない')` が U6 反映後に CI で失敗するにもかかわらず、設計は「変えない」と断言している点（同じ問題は U4 テストの `it('line に ChoreTypes の許可がない')` にも存在する）。テストが通るか壊れるかはコードベースの事実として決まり、「U5 の記録として残す」という意図だけでは CI が通らない。この方針を確定し、いずれかのテストへの対処（修正・削除・スキップ）を cicd-pipeline.md に明記すれば、インフラの設計自体（権限の内容、環境変数、スモークチェック、費用、元に戻す手順）は正確で実装可能な水準に達している。
