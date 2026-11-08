## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 確認したこと

- `npx vitest run u4-chore-types` は 11 ファイル、290 件がすべて通りました。`npx eslint .` はエラー 0 件です。
- U4 のバックエンドは、設計（reliability-design / security-design / rules）と照らして、次の点が合っていました。
  - 登録、改名、名前を変えない変更、使う／使わない、消すの条件式は設計どおりです。
  - `CancellationReasons` の並び（登録 = 種類・名前の印・送り直し、改名 = 新しい印・古い印・種類）と、`classify*` の読み分けも合っています。
  - 確かめの順番は 404（ID の形・種類）が 422・409 より先で、他の家族の種類は `familyId` をキーに含めるため「ない」と同じ 404 になります。
  - `getCurrentUnitPrice` は「使わない」の種類にも単価を返します。
  - `ConsistentRead` は種類の読み取りすべてに付いています。
  - DynamoDB の式で、予約語の別名（`#name` `#description` など）に未使用のものはなく、SET と REMOVE の属性も重なりません。
  - IAM は `api` だけに 5 つの操作（GetItem / Query / PutItem / UpdateItem / DeleteItem）で、Scan と ConditionCheckItem はありません。取引は項目ごとの Put / Update / Delete の許可で足ります。
  - ログは `name` と `description` を型で禁止し、実行時にも伏せます。
- 画面は、名前と説明を React の文字として出し、`pre-wrap` で改行を保ちます。登録の識別子は入力を変えると作り直し、通信の失敗だけで同じ値を使い回します。
- 一方、gitleaks の再発防止は、作り手が求めた目的（同じ検出を二度と出さない）を、今のままでは十分に果たしません。R-01 と R-02 が該当します。

### 指摘

**R-01（Major）ESLint のルールは、実際に検出された種類の値を止められません**
場所: `eslint.config.js:41-67`（`no-restricted-syntax` の 3 つの selector）

`.gitleaksignore` に残っている過去の検出は、どれも `generic-api-key` で、Idempotency-Key の UUID でした。ところが、今のルールは次のものを止めません。`npx eslint --stdin --stdin-filename packages/backend/test/u4-chore-types/probe.test.ts` で実際に試し、`password` の 1 件だけがエラーになり、次はすべて素通りしました。

- 名前に `key` を含む変数やプロパティ（`const idempotencyKey = '1111…'`、`{ idempotencyKey: '…' }`、`{ clientKey: '…' }`）。変数の selector は `^key|_key` しか見ず、Property の selector には `key` が入っていません。
- ヘッダー名の文字列キー `{ 'Idempotency-Key': '<UUID>' }`。
- テンプレートリテラル（`` const token = `abcdefgh1234` ``）と文字列の連結（`'abc' + 'x'`）。どちらも `Literal` ではありません。
- `Authorization: 'Bearer …'` のように、名前は秘密らしくないが値が秘密らしいもの。
- ESLint の対象外のファイル（`.feature` の例の表、`scripts/*.sh`、`.github/workflows/*.yml` の `originVerifySecret=ci-dummy-…`、`*.json`、README）。

名前の正規表現で止める作りなので、gitleaks の「値のエントロピー」での検出とは判定が一致せず、また同じ検出が出る見込みが高いです。

修正案:
1. selector の名前の正規表現に `key` と `auth` を加えます（`/secret|token|password|passwd|credential|api_?key|key$|^key|_key|authorization/i`）。`Property` の `key.value` にも同じものを使います。
2. `TemplateLiteral`（式なし）と `BinaryExpression[operator='+']` の selector を加えます。
3. 値の形でも止めます。UUID 形式の文字列（`/^[0-9a-f]{8}-[0-9a-f]{4}-/i`）と、16 文字以上の英数字と記号だけの文字列を、`fakeSecrets.ts` 以外では禁止します。
4. 残る穴は README に書きます。「ESLint は補助。最終の防御は push 前の `npm run secrets:scan`」と明記し、`.feature`・シェル・YAML は gitleaks に任せることを書きます。

**R-02（Major）今の PR の gitleaks の失敗が解消していません。`secrets:scan` も一度も実行されていません**
場所: `code-generation/code-summary.md`「残っていること」、`.github/workflows/ci.yml:61-64`、`scripts/secrets-scan.sh:16-26`

- code-summary にあるとおり、すでに push 済みのコミット 6bee814 の 2 件を CI の gitleaks がまだ検出します。`gitleaks-action` は PR のコミットの範囲を調べるので、新しい仕組みを足しても、そのコミットが履歴にある限り CI は赤のままです。再発防止は、この「今の赤」を片付けたことにはなりません。
- 手元に gitleaks がなく、`gitleaks git` と `--pre-commit` の動作は一度も確かめていません（ドキュメントの記述に頼っています）。
- 8.24 の書き方は `gitleaks git --redact --no-banner -v` と `gitleaks git --pre-commit ...` で合っています（8.19 以降）。ただし `--pre-commit` はまだ追跡していない新しいファイルを調べません。新規の `fakeSecrets.ts` などは `git add` するまで漏れます。

修正案:
1. U4 のコードを `main` に取り込む前に、人が決めます。(a) 6bee814 を含む PR のブランチを書き直して該当の値を fixtures に移す、または (b) 値がテスト用の作り物と確かめたうえで `.gitleaksignore` に 2 件の Fingerprint を足す。どちらでも、決めたことを code-summary に記録します。
2. `brew install gitleaks` のあとに `npm run secrets:scan` を一度動かし、結果（0 件）を記録します。
3. `scripts/secrets-scan.sh` の 2 つ目の検査は `--pre-commit` ではなく、`git add -N .`（または `git ls-files -o --exclude-standard` を `git add -N`）してから実行するか、`gitleaks dir . --redact`（`node_modules` は `.gitleaks.toml` の allowlist で除く）を使います。また、`gitleaks git --help` で版を判定する書き方は、古い版で成功を返すことがあります。`gitleaks version` から 8.19 以上かを確かめる書き方に変えてください。

**R-03（Minor）送り直しの記録を、強い整合性なしで読み、競合のあとに 500 を返すことがあります**
場所: `packages/backend/src/services/choreTypeService.ts:318-321`、`packages/backend/src/repositories/requestRecordRepository.ts:14-18`

同じ Idempotency-Key で 2 つの登録が同時に届くと、後の方は `request-conflict` になり、勝った方の記録を `find` で読み直します。この `GetCommand` は `ConsistentRead` なしの結果整合なので、まだ見えないと `undefined` になり、`INTERNAL`（500）を返します。設計の「送り直しの記録の条件なら 1 に戻る」とも違います。また期限切れで TTL がまだ消していない記録は、`find` が「ない」と扱う一方で、取引の `attribute_not_exists` は失敗するため、同じキーなら（最大 48 時間）500 が続きます。画面は 1 操作ごとに新しい UUID を使うので、実害は小さいです。

修正案: `find` に `ConsistentRead: true` を付け（U1 の共通部分なので U1〜U3 のテストの期待も確認します）、`request-conflict` のときは 500 にせず 1 回だけ最初の `find` からやり直します。期限切れの記録は、`ConditionExpression: 'attribute_not_exists(idempotencyKey) OR expiresAt <= :now'` にして上書きできるようにします。

**R-04（Minor）「消す」で IN_USE のときに「使わない」へ変えた操作が、記録にもログにも残りません**
場所: `packages/backend/src/services/choreTypeService.ts:208-214`

`remove` は手順 1 で `active = false` を書いてから C8 を確かめます。使われていると 409 を返しますが、種類は「使わない」に変わったままです（設計で受け入れ済みで、画面の文言 `CHORE_TYPE_IN_USE_DEACTIVATED` もこれを案内しています）。ところが `CHORE_TYPE_ACTIVE_CHANGED` のログが出ず、`CHORE_TYPE_REJECTED` だけが残ります。だれがいつ「使わない」にしたか追えません。

修正案: 手順 1 の成功後に `CHORE_TYPE_ACTIVE_CHANGED`（`active: false`、`via: 'delete'`）を 1 行出します。`via` はログの許可項目なので型の変更は要りません。

**R-05（Minor）競合の筋書きは、条件式の文字列を比べるだけで、実際の評価は確かめていません**
場所: `packages/backend/test/u4-chore-types/choreTypeChangeTransactions.test.ts:50-80`、`create-chore-type.steps.ts`・`update-chore-type.steps.ts`

`build*Items` の `ConditionExpression` が設計と同じ文字列であること、`CancellationReasons` の読み分け、リトライ回数は、単体テストで押さえられています。一方「同時に登録して 1 つだけ」「消す途中で使うに戻す」などの筋書きは、インメモリの代役が条件を再現して動いており、式そのもの（`#name`・`:oldName` の別名や、予約語、SET と REMOVE の重なり）が DynamoDB で通ることは確かめていません。式の誤りは本番で `ValidationException` になるまで見えません。

修正案: ステージングで PUT・PATCH・DELETE（改名、説明を消す、消す）を 1 通り動かす手順を unit-test-instructions に必須として書きます。余力があれば `dynamodb-local` で式だけを確かめるテストを 1 本足します。

**R-06（Minor）画面で、変更中に種類が他の人に消されていた場合の後始末がありません**
場所: `packages/frontend/src/pages/ChoreTypesPage.tsx`（`ChoreTypeForm` の `submit` と `toFieldErrors`）

変更の保存が 404 になると、`default` の分岐で一般のエラー文言だけが出て、フォームも一覧もそのままです。`toggleActive` と `remove` は 404 で一覧を読み直していますが、フォームにはその処理がありません。

修正案: 変更フォームで 404 を受けたら、`onClose` と一覧の再読み込み（`refresh`）を呼び、「この種類はもうありません」の文言を通知に出します。

### 総合

指摘は Major が 2 件（R-01、R-02）で、どちらも gitleaks の再発防止に関するものです。U4 のバックエンド、IAM、画面の主な動きは、設計どおりに実装されていました。合格の基準（Critical なし、Major は 2 件まで）は満たしますが、R-01 と R-02 は、この変更を `main` に取り込む前に直すことを強く勧めます。直さないと、同じ検出が再び CI を止めます。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
