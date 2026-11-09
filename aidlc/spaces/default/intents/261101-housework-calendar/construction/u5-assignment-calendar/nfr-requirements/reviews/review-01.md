## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/reliability-requirements.md > NFR2.29 | 書き込み中に種類が「使わない」になったときの結果を「409 `CHORE_TYPE_INACTIVE`」と書いているが、機能設計では 422 である（rules.md の BR6.8、functional-spec.md の PUT の結果表）。このままだと、実装者とテストの書き手が 409 と 422 のどちらを正とするか迷い、筋書きと実装がずれる | NFR2.29 を 422 `CHORE_TYPE_INACTIVE` に直す（`MONTH_CONFIRMED` だけが 409）。または機能設計側を直して 3 つの文書をそろえる | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/reliability-requirements.md > NFR2.29、NFR2.30 | (1) NFR2.29 のやり直しで、確かめの印が合わなくなる場合（書き込みの間に別の担当が「未」のまま変わった）の結果が `OVERWRITE_CONFIRMATION_REQUIRED` になるはずなのに、結果の一覧にない。(2) NFR2.30 は条件が外れたとき `DUTY_NOT_TODO` だけを書くが、月の確定が先に入った場合は `MONTH_CONFIRMED` のはずで、どちらかを区別する読み直しの扱いがない。(3) 同じ子供への変更は「何も変えない」(BR6.9) のに、NFR2.30 は version を必ず 1 増やすと読め、不要な version の変化が確かめの印を無効にする | (1) 結果の一覧に `OVERWRITE_CONFIRMATION_REQUIRED` を足す。(2) 条件で断られたら読み直して 409 の理由を決める、と書く。(3) 子供が同じときは書かず version も増やさない、と書く | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/security-requirements.md > NFR4.51 | 確かめの印の材料が「変化の一覧と担当の version」としか書かれていない。家族の ID と月を含めるか、並べ方と文字列の作り方、形が悪い印（NFR4.47 の 64 文字の 16 進数に合わない）は 422、合わない印は 409 と分けるか、が決まっていない。また、この印は秘密ではなく（鍵なしの SHA-256）、確かめの操作ミスを防ぐ働きであって、悪意ある利用者を止める働きではない。それを要件が区別していない | 材料（familyId、month、日付・種類・前後の子供・version を日付と種類の順に並べたもの）と、形の誤り（422）と不一致（409）の扱いを書く。「誤操作の防止であり、認可の代わりではない」と一文添える | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/security-requirements.md > NFR4.42、NFR4.46、NFR4.47、NFR4.48 | U4 の NFR4.41 にあった「確かめの順番」の一覧が U5 にない。パスの月の形（422 `INVALID_MONTH`）、本文の形（422）、管理者の確かめ（403）、担当や種類・子供の 404、月の 409 の前後が、NFR4.42 の「管理者を先に」だけでは決まらない（特に PATCH で本文の 422 とほかの家族の `dutyId` の 404 のどちらが先か） | 順番を 1 行で書く。例: セッション → 家族のメンバー → 管理者 → パスの形（月・`dutyId`）→ 担当の 404（家族の範囲）→ 本文の 422 → 状態の 409。機能設計の流れ（F3、F4）と合わせ、筋書きの前提にする | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/security-requirements.md > NFR4.46、NFR4.47 | 入力の上限に抜けがある。(1) `childUserId` の長さと形に上限がない（DynamoDB のキーに使う文字列）。(2) 本文の大きさの上限がない（200 行の上限だけ）。(3) GET の `month` は `0050-01` や `9999-12` も通り、年が 2 桁の日付は標準の Date 関数で 1900 年代に読まれる落とし穴があり、日付の計算（NFR8.10）の入力として危険 | `childUserId` は U1 の利用者 ID の形・長さに合わせる。本文は大きさの上限を置く。GET の `month` は年の範囲（例: 2000〜2100）を決め、外は 422 `INVALID_MONTH` にし、筋書きに入れる | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/tech-stack-decisions.md > NFR9.5 | AC4.1.7（4.5:1、44×44 ピクセル、文字の状態）を確かめる方法が書かれていない。ほかの NFR は「確かめ方」の列を持つが、この行は理由とほかの案だけで、何を測るか（コントラスト比の自動検査か、画面の寸法の検査か）、U1〜U4 の画面をどの方法で通すかが決まっておらず、測れる要件になっていない | 確かめ方を足す。例: テーマの色の組み合わせを計算で確かめる単体テスト、押す場所の最小寸法を確かめる画面のテスト、「済」「未」「×」の文字が出ることを確かめる筋書き。対象の画面の一覧も書く | New |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/scalability-requirements.md > NFR1.20、NFR1.21（と security-requirements.md > NFR4.44） | `PATCH /v1/duties/{dutyId}`（`dutyId` だけで担当を探す）と、U4 から引き継いだ `isChoreTypeAssigned`（どの月の担当にも使われたか、直後の保存も見落とさない）の読み方が、Scan なしでどうなるかが NFR にない。月をキーにした Query (NFR1.20) だけでは、この 2 つの経路は賄えない。後者は強い整合性の読み取りが必要（BR6.10）だが NFR に写っていない | 2 つの経路を Scan なしで、強い整合性で読むことを要件に書く（索引にするか、家族の中を Query するかは NFR の設計で決める）。1 年 約 1500 件の範囲で費用が増えないことも添える | New |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-requirements/reliability-requirements.md > NFR11.4、Assumptions & Open Questions | 質問を省いたことは、おおむね妥当（決まっていないことが少なく、U1〜U4 から引き継げる）。ただし次の点は補いが要る。(1) 保存が途中で失敗すると、管理者が保存し直すまで家族に新旧が混ざった担当が見える。画面の文言はあるが、管理者が画面を閉じたときの気づき方（15 分以内に作り手へ知らせる NFR2 の確かめ）が U10 まで先送りで、U5 の間は穴になる。(2) JST の筋書きに、12 月の「来月」が翌年 1 月になる境目が入っていない。(3) 速さの測定にコールドスタート（同時実行 5）を含めるかが決まっていない | (1) 先送りを承知のうえの判断として、U5 のレビュー結果に明記するか、`ASSIGNMENT_PARTIAL_FAILURE` を既存の 15 分の知らせの対象に入れる。(2) 12 月（来月は翌年 1 月）を NFR11.4 の確かめに足す。(3) NFR7.20〜NFR7.23 に、コールドスタートを含めるかを書く | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (実行なし) | この段階の成果物に付いた検証ツールはなく、traceability.json と各 NFR の ID を手で突き合わせた | NFR1〜NFR11 は N/A（NFR5、NFR10）を含めすべて対応先がある。NFR1.19〜1.21、2.28〜2.32、3.6、4.42〜4.51、6.6、7.20〜7.24、8.9〜8.10、9.5、11.4 は、ファイル内の ID と一致した |

### Summary

U1〜U4 の引き継ぎ、家族の範囲、管理者の確かめ、上書きの確かめの印、日本時間の扱いは筋が通っており、開発者が実装を始められる状態です。直すべき点は、種類が「使わない」になったときの HTTP の状態が NFR2.29 だけ 409 で機能設計の 422 と食い違っていること（Major 1 件）です。残りは、確かめの順番、入力の上限、確かめ方の明記などの補いです。
