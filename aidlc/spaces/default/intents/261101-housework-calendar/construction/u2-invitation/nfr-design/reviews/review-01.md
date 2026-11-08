## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 全体の所見

U2 の NFR 設計（security / reliability / scalability / observability / logical-components）を、`rules.md`（BR3.4〜BR3.8）、NFR 要件、既存コード（`entries/api.ts`、`data-stack.ts`、`requestRecordRepository.ts`）と突き合わせました。トランザクションの基本形（家族の「いまの招待の印」を条件にした作り直し、参加時に 3 つを同時に確かめる形）は筋が通っています。重大（Critical）な欠陥は見つかりませんでした。一方で、実装者が迷う、または本番で詰まる Major が 2 件あります。コード生成の前に設計へ反映してください。Major は 2 件のため、基準（Critical なし、Major 2 件以下）に照らして先へ進めます。

### 指摘

**R-01（Major）送り直しの記録がトランザクションに入っていない**
- 場所: `nfr-design/reliability-design.md`「招待の作り直し」手順 3、「参加」手順 3、`scalability-design.md`「読み書きの量の見込み」（どちらも「3 件」）
- 内容: 既存の `requestRecordRepository.buildPutItem` は、結果の記録を TransactWriteItems の 1 項目として書き、同じ組があれば条件で失敗させる作りです（BR2.8）。U2 の 2 つのトランザクションにはこの Put がありません。記録が別書きだと、書き込み成功から記録までの間で落ちたとき、同じ `Idempotency-Key` の再送が「新しい招待」として通り、送ったばかりのリンクが replaced になります（BR3.5 の目的に反します）。また、記録の条件で失敗したときの取り消し理由の読み分け（reliability-design 手順 4）にも、この項目が抜けています。
- 修正: 作り直しは 4 件、参加は 4 件（RequestRecords の Put を足す）と書き直す。記録には `operation` と `target`（accept は招待の印）を入れる。取り消し理由の表に「RequestRecords の条件 → 記録を読み直して前の結果を返す。operation/target が違えば 422 `IDEMPOTENCY_KEY_REUSED`」を足す。件数の見込みも直す。

**R-02（Major）前の招待が TTL で消えたあとの作り直しが詰まる、または空の記録が作られる**
- 場所: `reliability-design.md`「招待の作り直し」手順 3 の「Invitations の Update: 前の招待を replaced」
- 内容: Families の `currentInvitationToken` は残り続けますが、Invitations の項目は期限 + 7 日で TTL により消えます。消えたあとに作り直すと、DynamoDB の Update は存在しない項目を新しく作ってしまいます（`status: replaced` だけの `ttl` なしの項目が永久に残る）。これを避けるために `attribute_exists` の条件を足すと、今度は毎回条件失敗になり、手順 4 の「1 回やり直して 500 `INTERNAL`」に落ちて、管理者が二度と招待を作れなくなります。
- 修正: 前の招待の Update には `attribute_exists(#token)` を条件にした上で、読み取りの時点で前の招待が存在しない（または期限切れで既に使えない）場合は、そもそも Update を含めない組み立てにする。つまり手順 1〜2 で `currentInvitationToken` の Invitations を読み、なければ Update を省く。単体テストに「前の招待が TTL で消えている」ケースを足す。

**R-03（Minor）使えない印の総当たりの見積もりと費用の記述が合っていない**
- 場所: `security-design.md`「脅威と備え」、`nfr-requirements/security-requirements.md` NFR4.17、`scalability-design.md`
- 内容: 見積もり（5 並列 × 50 ミリ秒 × 24 時間）を計算すると約 86 億ではなく約 864 万回（2^23）です。強さの結論は変わりませんが、数字が 1000 倍ずれています。また、友だち登録さえあれば誰でも叩けるため、この回数は Lambda の無料枠（月 100 万要求）を数時間で超え、形が正しい印は強い整合性の読み取りに進みます。DynamoDB のオンデマンドには「25 GB の無料枠」の読み書きぶんはなく（読み書きの常時無料枠はプロビジョンドのみ）、「無料枠に収まる」という scalability-design の書き方は濫用時に当てはまりません。費用 0 円の条件に対し、濫用時は Budgets の警告頼みになっています。
- 修正: 数字を直す。濫用時の費用の上限と止め方（Budgets のアラームと、Lambda の同時実行数を 0 にする手順を README に）を設計に書く。余裕があれば、形が正しくても存在しない印の失敗が続く利用者を、送り直しの記録と同じ仕組みで数える案も検討する。

**R-04（Minor）メンバーの一覧が結果整合の索引から読まれる点が書かれていない**
- 場所: `scalability-design.md` テーブルの形（`familyId-index`）、`rules.md` BR3.11
- 内容: GSI の読み取りは結果整合のみです。参加した直後・家族を作った直後に一覧を開くと、本人が出ないことがあります。また、並び順は `familyJoinedAt` を使いますが、既存の管理者（U1 で作成済みのステージングのデータ）には `familyJoinedAt` がなく、`logical-components.md` が直すのは U1 の createFamily だけです。
- 修正: 「参加や作成の直後は、応答に自分を足して返す、または画面側で再取得する」と決める。`familyJoinedAt` がない既存利用者の並び（`createdAt` などで補う）を設計に書く。ステージングの既存データを手で書き換えず、読み取り側で欠けを許す形にする（本番のデータを手で書き換えない決まりに合わせる）。

**R-05（Minor）既存の振り分けの作りに合わせた書き換えの範囲が不足している**
- 場所: `logical-components.md`（`entries/api.ts`、`lib/router.ts`）、`security-design.md`「ログで印を伏せる」
- 内容: いまの `entries/api.ts` は、振り分けの前に `REQUEST_START` で `event.rawPath` を書き、`routes[`${method} ${event.rawPath}`]` で完全一致の照合をしています。印を伏せるには、ログより先にパスの型を決める順序の入れ替えが必要で、404 の経路や `REQUEST_ERROR`（`describeError`）に印が入らないことの確認も要ります。設計は方向を示していますが、この順序の変更が明記されていません。
- 修正: 「型の決定 → `REQUEST_START` → 認証」の順にする、と手順で書く。`describeError` の出力にもパス・URL が入らないことをテストの観点に足す。

**R-06（Minor）RequestRecords に印そのものが残る**
- 場所: `reliability-design.md` / `scalability-design.md`（`target` に招待の印）
- 内容: accept の `target` と、作成の `result` には印が入ります。ログではなくテーブルなので NFR5.7 の違反ではありませんが、取り出せる形で 24 時間余分に持つことが、NFR4.18 の整理（Invitations に取り出せる形で持つ理由）に書かれていません。
- 修正: `target` は印のハッシュ（SHA-256）にして比較だけに使う。作成の `result` に印を残す場合は、その理由を security-design に一文足す。

**R-07（Minor）暗号化の鍵の記述が要件と設計でずれ、追跡が弱い**
- 場所: `nfr-design/traceability.json` NFR4.18、NFR4.22、NFR8.4
- 内容: 要件は「AWS 所有の鍵」、設計と実コード（`TableEncryption.AWS_MANAGED`）は「AWS 管理の鍵」で、設計側の Assumptions にだけ書かれています。NFR4.22 の追跡先は 422 `IDEMPOTENCY_KEY_REUSED` の取り消し処理（R-01）を含まず、NFR8.4 の追跡先は「コード生成の計画で置く」という先送りで、競合（同時作り直し・作り直しと参加の競合）の筋書きが設計にありません。
- 修正: 要件の記述を実装に合わせて直すか、差を要件側にも書く。NFR4.22 の追跡先に R-01 の修正後の節を指す。NFR8.4 には、同時の作り直し、作り直しと参加の競合、TTL 後の作り直し（R-02）を筋書きの題として列挙する。

### 確認できたこと

- 作り直しの Families 条件（`currentInvitationToken` が読んだ値、なければ属性なし）は、同時の最初の作成でも 1 つだけが通ります。
- 参加の 3 条件（Users の familyId なしと friend、Invitations の active と期限内、Families の現在の印）は、確かめてから書くまでの間の作り直しと期限切れを防げます。
- 家族は招待の記録だけで決め、本文を受け取らない点、メンバーの応答を組み立てて lineUserId を出さない点は、認可として妥当です。
- 新しい Lambda を作らず、テーブルと GSI の追加だけで済むため、既存の `data-stack.ts` に素直に足せます（Users への GSI 追加は 1 回の変更で可）。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
