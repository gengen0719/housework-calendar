## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T03:08:32Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-design/performance-design.md > 工夫（画面）「応答の Duty で先に『済』を出す」 | `POST .../record` の 200 応答 `Duty` でカレンダー読み直しの前に即「済」を表示する設計が Assumptions 止まりで、functional-spec.md の F3-6「カレンダーを読み直して『済』の表示にする」と食い違う。コード生成の担当者が「先に出す（performance-design.md の設計）」か「読み直しのあとに出す（functional-spec.md の字義）」を迷う。 | performance-design.md の Assumptions の項目に「採用する」と明示するか、functional-spec.md の F3-6 の文言を「応答の Duty を使って即『済』を出し、続けてカレンダーを読み直す」に直し、両成果物の記述を一致させる。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-design/reliability-design.md > 失敗の分け方（LINE）「名前の Query の置き方」`settle` の利用箇所 | `settle` は「`Promise` に `catch` を付けて一時保持し、待つ直前に `await` する」パターンとして説明されているが、`settle` 関数のシグネチャ・型・実装ファイルが本設計に示されていない。U5 で定義済みかどうか、または U6 で新設するかが読み取れず、コード生成の担当者が独自に解釈する可能性がある。 | `settle` が U5 の既存関数であるか、あるいは U6 で新設するユーティリティかを明記し、型（例: `Promise<{ ok: true; value: T } \| { ok: false; error: unknown }>` など）と置き場所を示す。既存ならファイルパスを、新設なら `logical-components.md` の部品一覧に追加する。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u6-recording/nfr-design/observability-design.md > 記録のできごとのログ「DUTY_RECORD_REJECTED」レベル | 取引の読み直しが 2 回続けて断られた（`reason = INTERNAL`）は info レベルとされているが、同じ「記録できなかった」結果の `LINE_REPLY_FAILED` や `DUTY_RECORDED_HOOK_FAILED` は warn レベル。INTERNAL は「もう一度押してもらう」状態で意図的な選択だが、2 回続けて断られた場合は単純な競合（1 回で収まる想定）より深刻な可能性があり、その設計判断の根拠がここには示されていない。 | observability-design.md の `DUTY_RECORD_REJECTED`（`reason = INTERNAL`）の行に、info にした理由（「2 回連続の断りは異常ではなく再試行で回復できるため。U10 が知らせの対象にする」など）を 1 行追記し、warn との使い分けを明確にする。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| traceability.json の upstream_ids と coverage の突き合わせ（手動）| PASS | upstream_ids 55 件がすべて coverage に対応し、status が OK のみ（GAP・ORPHAN なし）。target の記述も具体的で設計成果物と一致している |
| 取引の 3 項目が DynamoDB の 100 項目制限内か（手動）| PASS | 担当 Update + 月の ConditionCheck + 種類の ConditionCheck = 3 項目。100 項目の制限を大幅に下回る |
| `parseRecordCommand` の `v=0` 処理の確認（手動） | PASS | `match[2]` は `'0'`（string）で truthy。`Number('0') === 0` で正しく処理される |
| `line` の Lambda 権限の不足確認（`app-stack.ts` 照合）| PASS（設計として正しい） | 既存の `app-stack.ts` に `Calendar` と `ChoreTypes` への `line` Lambda の権限がないことを確認。設計の「U6 で追加する」記述と整合している |
| `accepts` 変更後の 1 対 1 登録 postback の経路確認（手動） | PASS | `source.type=user` の `action=group.register` は `isGroupOperation` が true → `accepts` 通過 → `handlePostback` で `parseRecordCommand` が null → `handleGroupEvent` → 既存の処理。記録の操作と干渉しない |

### Summary

U6 記録の NFR 設計は、取引の形・断られたときの読み直し・二重押し・LINE の受け口・最小権限・秘密の扱いのすべての観点で、要件（NFR4.53〜NFR4.64、NFR5.10〜NFR5.12）を具体的な実装方針に正しく落とし込んでいる。Critical・Major の問題は見当たらず、3 件の Minor（画面の先出し設計の記述の揺れ、`settle` の定義箇所の不明確さ、`INTERNAL` を info にした判断の説明不足）はいずれもコード生成前に解消しやすい記述の補完で対処できる。
