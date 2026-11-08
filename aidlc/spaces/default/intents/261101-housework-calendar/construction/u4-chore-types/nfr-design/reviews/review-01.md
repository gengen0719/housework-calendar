## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 全体の所見

`ChoreTypes` を 1 つのテーブル（`familyId` + `sk`）にする案 A は、家族の範囲がキーで守られ、名前の印と種類を同じトランザクションにでき、費用（オンデマンド、数十件）も問題ありません。比べた案 B より妥当だと判断します。確かめの順番（セッション → メンバー → 管理者 → 印の形 → ID の形 → 種類 404 → 本文 422 → 409）も、ほかの家族の種類を 422・409 で漏らさない作りになっています。実装できる粒度です。

ただし、トランザクションの条件に 2 件の競合の抜けがあります（Major が 2 件で、READY の上限です）。コード生成の前に設計を直してください。

確かめたこと: `packages/backend/src/lib/logger.ts`、`lib/router.ts`、`entries/api.ts`、`repositories/requestRecordRepository.ts`、`infrastructure/lib/data-stack.ts` を読みました。実際に動かしてはいません（設計の段階のため）。

### 指摘

**R-01 [Major]** 消す手順の最後のトランザクションが「使わない」のままかを条件にしていない
- 場所: `nfr-design/reliability-design.md` > 消す の 4（`BR5.9`）
- 内容: 手順 1 で `active=false` にしてから、手順 4 で種類を `attribute_exists(sk)` だけを条件に消します。手順 1 と 4 の間に、別の画面から PATCH で「使う」に戻され、U5 が割り当てを保存すると、割り当てに使われた種類が消えます。手順 2 の C8 の確かめは、その保存より前の状態を見ています。
- 直し方: 手順 4 の種類の Delete の条件を `attribute_exists(sk) AND active = :false` にします。条件で断られたら、手順 1 からやり直す（1 回だけ）か、409 `CHORE_TYPE_IN_USE` として扱う、と書いてください。「競合と失敗」の筋書きに「消している間に『使う』に戻された」も足してください。

**R-02 [Major]** 名前を変えない変更に `name` の条件がなく、名前と名前の印がずれる
- 場所: `nfr-design/reliability-design.md` > 変更 の 2
- 内容: 手順 1 で名前 A を読み、「名前が変わらない」と判断して Update します。この Update の条件は `attribute_exists(sk)` だけです（名前を変える場合の手順 3 にある `name = :oldName` がありません）。読んだあとに別の要求が名前を A から B に変えると（印は B）、この Update が `name` を A に書き戻します。種類の名前は A、印は B で、A の印はないため、A という名前をほかの種類が取れてしまい、BR5.3 が崩れます。
- 直し方: 名前が変わらない場合は `name` を SET に含めないか、条件に `name = :oldName` を足します。断られたら 1 回だけやり直す、と書いてください。

**R-03 [Minor]** 消す前の確かめ（C8）についての U5 への引き継ぎが足りない
- 場所: `nfr-design/reliability-design.md` > U5 への引き継ぎ、`scalability-design.md` > Assumptions
- 内容: U5 の `saveAssignment` に ConditionCheck（`active = true`）を入れる引き継ぎは適切です。ただし、C8 `isChoreTypeAssigned` が整合性の強い読み取り（GSI ではなく、強い整合性の Query / GetItem）であることが書かれていません。結果整合の読み取りだと、手順 1 の直前に確定した割り当てを見落とし、R-01 と同じ結果になります。
- 直し方: 引き継ぎに「C8 は ConsistentRead で読む。GSI を使うなら結果整合なので使わない」と 1 行足してください。

**R-04 [Minor]** 読み取りの整合性の指定が一部にしかない
- 場所: `scalability-design.md` > テーブルの形（一覧の Query、C7 `getCurrentUnitPrice` の GetItem）
- 内容: 変更の GetItem だけ「強い整合性」とあります。一覧の Query と `getCurrentUnitPrice` は未指定です（既定は結果整合）。登録直後の一覧、消した直後の 404、記録時の単価の読み取りが古くなることがあります（案 B を退けた理由と同じ問題が残ります）。既存の `userRepository` / `familyRepository` には `consistent` オプションがあります。
- 直し方: 一覧の Query、`getCurrentUnitPrice`、名前の印を読む（409 の出し分け）の読み取りを `ConsistentRead: true` と明記してください（数十件なので費用は増えません）。

**R-05 [Minor]** ログの伏せ字の変更内容を具体的にする（既存のログとの衝突は確認できなかった）
- 場所: `nfr-design/observability-design.md` > 種類のできごとのログ、Assumptions
- 内容: `name` を禁止しても、既存のログとは衝突しません。`logger.*` の呼び出しを確認すると、項目は `event`、`method`、`path`、`status`、`reason`、`durationMs` などで、`name` を使うものはありません（`name: family.name` は応答の組み立てで、ログではありません）。ただし、現在の伏せ字は `REDACTED_EXACT_KEY = /^(groupName|text|display_?name)$/i` で、`name` と `description` は入っていません。設計は「実行時の伏せ字にも足す」とだけ書いています。また、確かめは「コード生成で確かめる」という仮定になっています。
- 直し方: `REDACTED_EXACT_KEY` に `name|description` を足し、`LogData` に `name?: never; description?: never` を足す、とファイルと式まで書いてください。確かめの方法は「`logger.info({ name })` が `[REDACTED]` になる単体テストと、型エラーになる型テスト」にし、仮定ではなく受け入れの条件にしてください。

**R-06 [Minor]** 送り直しの記録の `target` に使う本文の SHA-256 の作り方が決まっていない
- 場所: `nfr-design/security-design.md` > 送り直し、`logical-components.md`
- 内容: 「本文の SHA-256」が、受け取った生の本文か、正規化した（NFC、空白除去、知らない項目を捨てた）値かが書かれていません。生の本文だと、同じ意味の送り直しで空白の差があるだけで 422 になります。また、`models.ts` の `RequestOperation`（`operation` の型）に `createChoreType` を足すことと、`target` の説明（現在は familyId と招待の印）の更新が、`logical-components.md` の変更一覧にありません。
- 直し方: 正規化したあとの `{name, unitPrice, description}` を固定の順序で JSON にして SHA-256 を取る、と書き、`models.ts` を変更一覧に足してください。

**R-07 [Minor]** 名前の重なり（409）の出し分けの読み取りと、取りこぼしの扱い
- 場所: `nfr-design/security-design.md` > 名前の重なりの文言の出し分け
- 内容: 印の Put が断られたあとに印の `choreTypeId` の種類を読む手順は、R-04 の強い整合性がないと、直前に作られた種類を読み損ねます。また、読んだときに種類がない（別の要求が消した直後）場合の動きが書かれていません。
- 直し方: 強い整合性で読み、種類がなければ `conflictActive` を付けずに（または 1 回だけやり直して）判断する、と 1 行書いてください。

### 検証ツールの結果

このステージには実行する検証ツールはありません。`traceability.json` は、NFR 要件のレビュー対象の ID（NFR1.16〜NFR11.3）をすべて `OK` として設計の場所に結んでおり、欠けはありませんでした。

### まとめ

案 A のテーブルの形、確かめの順番、家族の範囲、費用は妥当で、既存のログとの衝突もありません。READY ですが、R-01（消す手順の条件）と R-02（名前を変えない変更の条件）は、データの食い違いにつながる競合なので、コード生成の前に直してください。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
