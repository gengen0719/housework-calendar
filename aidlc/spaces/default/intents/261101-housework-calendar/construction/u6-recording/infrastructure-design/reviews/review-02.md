## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T04:19:31Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/infrastructure-design/cicd-pipeline.md > 「CDK のスタックテスト」節「既存テストへの影響」、および「変えないことの確かめ」表 | U5 の `stacks.test.ts` の `it('line に Calendar も ChoreTypes も含む文がない')` は、U6 を反映した `app-stack.ts` をビルドすると失敗する。設計では「U5 のテストは変えない」と明示しているが、テストは `buildApp` で同じスタックを組み立てるため、`line` のロールに Calendar 文と ChoreTypes 文が追加された状態では必ず `expect(json).not.toContain('Calendar')` が失敗する。「U6 のテストが固定する」と「U5 のテストは変えない」の両立は不可能。 | U5 の `stacks.test.ts` の当該テスト（`it('line に Calendar も ChoreTypes も含む文がない')`）を U6 の変更に合わせて修正するか、U5 の設計時点の状態を確かめる意図であることを明示して削除・スキップし、CI が壊れないようにする方針を cicd-pipeline.md に明記する。「変えない」は実装不可であるため方針を確定させること。 | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/infrastructure-design/cicd-pipeline.md > 「反映したあとの確かめ」節（「実際に追加する 4 件（3m〜3p）」と「実装では 3m の 1 件だけを追加」の記述） | 同じ節の中で「実際に追加する 4 件（3m〜3p）」と「実装では 3m の 1 件だけを追加して件数を 20 件にします」が矛盾している。実装者はどちらを正とすればよいか判断できない。 | いずれか一方に統一する。実装方針が「3m の 1 件だけ追加、計 20 件」であれば、「実際に追加する 4 件（3m〜3p）」の表を削除するか、「設計上の確認パターン（参考）」であることを明示する。 | Resolved (reviewer) |

> R-01 Reviewer note: cicd-pipeline.md の「U6 配備後に削除またはスキップするテスト」節および「既存テストへの影響」表に「削除またはスキップする」方針が明記され、U5・U4 の stacks.test.ts にも同内容のコメントが追加済み。ただし `Assumptions & Open Questions` の `[assumption]` 第 1 行に「このテストは U5 の記録として変えません」という旧文言が残存しており、本文の「削除またはスキップする」と字義上は矛盾する。実装判断への影響は低く（本文・コードが「削除またはスキップ」に統一されているため）、CI 通過と方針の両立という根幹の問題は解消されている。

> R-02 Reviewer note: 「実装では 3m の 1 件だけを追加して件数を 20 件にします」が本文に明記され、実装方針が確定した。ただし節見出し直下の「次の 4 件を足し」という文言と、コードブロックのコメント `# 3m〜3p. U6 の記録の 4 つのパスがセッションなしで 401` が残存しており、完全な統一には至っていない。実装者が「3m の 1 件だけ」を正と判断するのに十分な記述はある。

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| U5 stacks.test.ts コメント確認 | PASS: `it('line に Calendar も ChoreTypes も含む文がない（U5 の時点の確認。U6 で追加される）'` に「U6 でこのテストは壊れる。cicd-pipeline.md（u6-recording）を参照。U6 の適用後は削除またはスキップする。」のコメントが追加済み | R-01 の要求（CI が壊れないよう方針を明記）がコードレベルで対応済み |
| U4 stacks.test.ts コメント確認 | PASS: `it('line に ChoreTypes の許可がない（U4 の時点の確認。U6 で ConditionCheckItem が追加される）'` に同様のコメントが追加済み | U4 テストも同様に対応済み。前回レビューで指摘した U4 への言及も cicd-pipeline.md の「既存テストへの影響」表に明示されている |
| `Assumptions & Open Questions` 整合性確認 | 差異あり: `[assumption]` 第 1 行の「U5 の記録として変えません」が本文の「削除またはスキップする」と字義上矛盾。実装判断への実害はなし | R-01 の残存不整合として記録。本文・コードが優先されるため設計の実装可能性は損なわない |
| スモークチェック件数整合性確認 | 差異あり: 節導入文「4 件を足し」とコードコメント `3m〜3p` が残存。ただし「3m の 1 件だけを追加して 20 件」が明示されており、実装者の判断に支障はない | R-02 の残存表現として記録。実装上の矛盾は解消されている |
| 新規 Critical/Major 確認 | 新たな Critical・Major 指摘なし | 全体の設計整合性（権限の内容、環境変数、費用、元に戻す手順）は前回レビューで PASS が確認されており、今回の修正で後退した箇所はない |

### Summary

R-01・R-02 の根幹はいずれも解消された。R-01 については cicd-pipeline.md の本文と U5・U4 の stacks.test.ts の両方に「削除またはスキップする」方針が明記され、「変えない」方針と CI 通過の矛盾は解消されている。R-02 については「3m の 1 件だけ追加、計 20 件」が本文に明示され、実装判断に必要な情報は揃っている。`[assumption]` の「変えません」の文言と「4 件」「3m〜3p」の表現が残存しているが、これらは実装判断を妨げる水準ではない。
