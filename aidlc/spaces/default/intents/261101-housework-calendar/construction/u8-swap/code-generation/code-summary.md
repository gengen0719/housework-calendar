# コードのまとめ（Code Summary）— U8 代わりにやる

承認された計画（`code-generation-plan.md`、37 ステップ）の Step 1〜37 を実行しました。子供どうしがお知らせ先のグループで「家事交代」と送ると、代われる担当（10 件まで）がボタンで出ます。担当を選ぶと「引き受ける」「申し出をやめる」が出て、先着 1 人の引き受けで担当の子供が変わります（`origin=swap`、金額は変わらない）。インフラ（`infrastructure/lib/`）、`scripts/smoke-check.sh`（23 件のまま）、画面（`packages/frontend`）は変えていません。

**この段階で確かめ切れていないものが多くあります。下の「正直な一覧」を先に読んでください。**

## 作った・変えたファイル

正確な一覧は同じフォルダーの `source-manifest.json`（73 件）にあります。

| 場所                                                                                                       | 中身                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/reasons.ts`、`messages.ts`                                                            | `OFFER_OWNER_ONLY`、見出し・案内・知らせ・結果・失敗の文言と、値を入れる関数                                                                                                                              |
| `packages/backend/src/handlers/line/swapCommand.ts`（新設）                                                | 「家事交代」の完全一致、`swap.*` の postback を生の文字列に対する正規表現で厳密に読む                                                                                                                     |
| `packages/backend/src/handlers/line/swapHandler.ts`（新設）                                                | 管理者・子供・1 対 1 の分岐、結果の印から返事への対応、reply の失敗の握りつぶし（警告）                                                                                                                   |
| `packages/backend/src/services/swapService.ts`（新設）                                                     | `listSwappableDuties`・`offerSwap`・`acceptSwap`・`withdrawSwap`・`closeOffer`・`registerSwapHooks`、`isOfferValid`（読んだ値だけから有効さを判定）                                                         |
| `packages/backend/src/repositories/swapRepository.ts`（新設）、`models.ts`                                 | `Calendar` の `SWAP#<dutyId>` の項目。作成・引き受け（3 項目の取引）・取り下げ・掃除。`PutItem`・`DeleteItem` は使わない                                                                                   |
| `packages/backend/src/services/dutyReassignedHook.ts`                                                      | `notifyDutyReassigned` を最大 4 件ずつ並行に（`DUTY_HOOK_CONCURRENCY`、範囲 2〜5）。`DUTY_HOOKS_DONE`                                                                                                     |
| `packages/backend/src/services/groupCommandGate.ts`                                                        | 操作の第 2 引数に表示名。`GROUP_COMMAND_REJECTED` から `groupId` を外した                                                                                                                                 |
| `packages/backend/src/services/lineApiService.ts`、`handlers/line/messageHandler.ts`、`postbackHandler.ts` | `LINE_LIMITS`、carousel、buttons テンプレート、文字数の計算。「家事交代」と `swap.*` の受け渡し                                                                                                           |
| `packages/backend/src/entries/api.ts`、`line.ts`                                                           | `accepts` の追加と、起動の枠での `registerSwapHooks`（`api`: reassigned・recorded、`line`: recorded のみ）                                                                                                |
| `docs/contract-changes-u8.md`、`docs/manual-check-u8.md`、`README.md`                                      | 契約の変更・LINE の上限の確認結果・許容した残る危険、手での確かめ 14 件、U8 の使い方                                                                                                                      |
| 上流の文書 5 つ                                                                                            | 「代わって」を「家事交代」に直した（`stories.md`、`requirements.md`、`mockups.md`、`contract-summary.md`、`functional-spec.md` の読み替え表）                                                              |
| テスト                                                                                                     | `packages/shared/test/u8-swap/`、`packages/backend/test/u8-swap/`、`infrastructure/test/u8-swap/stacks.test.ts`。補助: `fakeSecrets.ts`、`fakeDynamo.ts`（遅い読み取りの `readDelayMs` を追加）、U3・U5 のテストの期待の直し |

## 主な実装の決め

- **承認の確認点 1（「担当を選ぶ」のあとの reply の失敗）:** 既定の (1) のまま許容しました。申し出は `open` で残り、選び直しは `ALREADY_OFFERED`（文だけ）になります。設計（`rules.md` BR9.7）は変えていません。`swap-line-resilience.feature` の 2 つ目の場面が再現します。`docs/contract-changes-u8.md` に「許容した残る危険」として残しました。
- **承認の確認点 2（`groupId` の削除）:** 既定どおり外しました。U3 のテストには `groupId` の値を期待する箇所がなく、「`groupId` が出ない」期待を足しました。計画で見つけていなかった U3 の直しが 1 つあります（`runGroupOperation` の呼び出しの期待が引数 1 つだったのを `(ctx, 表示名)` に）。U5 の `dutyReassignedHook.test.ts` も、並行化でイベント間の直列の期待をやめる直しをしました。
- **LINE の上限（Step 1b）:** 公式資料で確かめました。Flex の `button` の `label` は 40 文字（仮定は 26）、buttons テンプレートの `label` は 20、本文は 160、`data` は 300、carousel は 12 バブル、reply は 5 通まで。`altText` は 1500 ですが、厳しい側の 400 を使い続けています。担当の名前は 20 文字に収めます（`SWAP_CHORE_NAME_MAX` は `FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1` から計算）。
- **知らせの形:** buttons テンプレート（Flex ではない）。担当を選ぶ一覧だけが Flex の carousel です。
- **`registerSwapHooks` を呼ぶ位置:** `entries/api.ts` と `entries/line.ts` のモジュールの読み込み時に 1 回ずつ。
- **フックの失敗に頼らない:** 申し出が有効かは、読んだ担当・月・申し出の状態だけから判定します（`isOfferValid`）。フックは掃除（`cancelled` にする）だけです。
- **Step 5（権限と環境変数の確認。`app-stack.ts` を読むだけ。変更なし）:** `line` は `Calendar` に 4 操作（`GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`）、`ChoreTypes` に 3 操作（読み取りと `ConditionCheckItem`）があり、環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` もあります。`api` は両表に 6 操作。`line` に余計な許可（`PutItem`・`DeleteItem`・Batch・`Scan`・`dynamodb:*`・`Resource: "*"`）はありません。不足なし。

## テストの結果

| 確かめ                                                                                                                  | 結果                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 確認コマンド（`format:check`、`lint`、`tsc --noEmit` 4 つ、`npm test`）                                                 | すべて通過                                                                                                                  |
| `npm test`（U1〜U8 のすべて）                                                                                           | 160 ファイル、3209 件が通過（skip 2 件。U6 で `it.skip` にした U4・U5 の 2 件のまま）                                       |
| 行カバレッジ                                                                                                            | 97.36%（下限の 80% を上回る）。ステートメント 96.13%、分岐 91.65%、関数 97.13%。`swapService.ts` は行 99.02%                |
| `npx vitest run u8-swap`                                                                                                | 26 ファイル、530 件が通過                                                                                                    |
| U8 の筋書き（BDD）                                                                                                      | 10 本、109 場面                                                                                                             |
| CDK のテスト（U8）                                                                                                      | 17 件。インフラが前後で同じことを固定（`line` の 4 操作・3 操作、IAM の文の数、環境変数、数、メモリ・ARM64、`Retain` など） |
| 秘密の検索（Step 33）                                                                                                   | U8 のフォルダー・ソース・文書に、本物らしい鍵・ID・トークンの形の文字列はなし（下の「秘密」を参照）                           |

AWS・LINE は差し替えで動かし、本物にはつないでいません。

## 正直な一覧

### 計画と作ったものの数

- **筋書き（`.feature`）:** 計画は各ステップの数の合計で約 156 場面（Summary は「約 150」）。作ったのは **109 場面**です。ファイル別（作った／計画）: `swap-hooks` 12／12、`swap-gate` 8／8、`swap-transaction` 14／16、`swap-list` 9／12、`swap-offer-withdraw` 14／20、`swap-accept` 10／18、`swap-cleanup` 9／14、`swap-line` 11／22、`swap-line-roles` 15／20、`swap-line-resilience` 7／14。1 つの場面に複数の確かめをまとめた箇所があるため数が少なくなっていますが、場面の数は計画より少ないのが事実です。
- **Step 23 の単体テスト（後から追加）:** `listSwappableDuties.test.ts`（8 件）、`offerSwap.test.ts`（8 件）、`acceptSwap.test.ts`（7 件）、`withdrawSwap.test.ts`（7 件）と、日本時間の境の `swapJstBoundary.test.ts`（6 件）を足しました。判定の順と断りの印、競合の読み直し（1 回だけ、2 回続くと INTERNAL）を確かめます。同じ日・同じ種類の担当は 1 件しか置けないため、`dutyId` の昇順は同点の最終決めとして残るだけで、テストでは種類の順が `dutyId` の大小に左右されないことを確かめました。
- 作業の依頼文にあった「32 場面と約 56 場面」という数は、私が数えた結果（109 場面と約 156 場面）と合いません。ここでは数えた値を書きます。
- 追加した場面（この Batch）: `swap-line-roles.feature` に「読み取りが遅れても、待ち時間は読み取りの回数の足し算にならない」（BR9.17）。`fakeDynamo.ts` に `readDelayMs`（遅い読み取りの再現）を足して作りました。120 ミリ秒の遅れで、3 回の読み取りが 300 ミリ秒未満で終わることを確かめます。実時間で測るので、非常に遅い環境では不安定になる可能性があります（3 回続けて通過しました）。

### 実行していない確かめ

- `docs/manual-check-u8.md` の **14 件はすべて未実行**です（ステージングと本物の LINE・AWS が要るため）。
- 速さ（NFR7.39〜NFR7.43、AC7.1.11 の 3 秒、20 回中 19 回）と、月の確定の 300 件・スロットル 0（NFR7.46）は **測っていません**。`traceability.json` では Deferred です。
- `npm run secrets:scan`（gitleaks）は、この環境に gitleaks が入っていないため実行していません。
- スモークチェック（`scripts/smoke-check.sh`、23 件）は配備後に動かすもので、未実行です。
- DynamoDB の料金の単価は公式の料金表で確かめていません（未確認）。月に 1 円に満たないという見積もりの根拠は、設計の見積もりのままです。

### 確かめられていない項目

- **ボタンの高さ（NFR9.9）:** 担当のボタンは `height: md` を指定しましたが、44 ピクセル以上になるかは資料に書かれておらず**未確認**です。buttons テンプレートのボタンは高さを指定できず、これも未確認です。
- **buttons テンプレートのボタンの色の差:** 色を指定できず、LINE の標準の配色の色の差が 4.5:1 以上かは**未確認**です。担当のボタン（carousel）だけ、独自に指定した色（`#1b5e20` に白い文字）で 4.5:1 以上を計算で確かめました（`swapColors.test.ts`）。標準の緑（`#17c950`）に白い文字は 4.5:1 に届きません。実機の目視は手での確かめ 1・2 に入れてあります。
- **日本時間 23:59／0:00 の境:** `swapJstBoundary.test.ts` で確かめました（UTC 14:59:59.999／15:00 の前後。日付の境・月末・年またぎ・うるう日 2/29）。NFR11.8・NFR11.9 は OK です。
- **ログの `durationMs`:** `SWAP_LISTED`・`SWAP_OFFERED`・`SWAP_ACCEPTED`・`SWAP_WITHDRAWN` の成功のログに付けました（NFR7.49 は OK。`swapLogs.test.ts` で確かめ）。断りのログには付けません。
- **同時の引き受け:** 本物の並行ではなく、取引の直前に別の書き込みを差し込んで再現しています（設計どおり）。本物の DynamoDB での競合は確かめていません。

### 承認の確認点の既定

- 確認点 1: 「担当を選ぶ」のあとの reply の失敗は、**そのまま許容**（既定 (1)）。
- 確認点 2: `GROUP_COMMAND_REJECTED` から `groupId` を **外した**（既定どおり）。承認の場で別の選択をした記録はありません。

### 秘密

- 作り物の値は `packages/backend/test/fixtures/fakeSecrets.ts` にだけ置き、行ごとに `// gitleaks:allow テスト用の作り物の値` を付けています。文書とコメントは `<作り物の値>` と書きます。
- 文字列の検索（AWS の鍵・LINE の ID・JWT・長い base64／16 進数・秘密鍵の見出し）を U8 のフォルダー、`swap*.ts`、`docs/*-u8.md` にかけたところ、該当は `fakeSecrets.ts` の U5・U6 の作り物の値（許可コメントつき）と、AI-DLC の承認の記録のハッシュだけでした。U8 のファイルにはありません。

## 計画からずれたところ

- 上の「計画と作ったものの数」のとおり、場面が計画より少ない。
- 速さの「差し込みの遅れ」の場面を `swap-line-roles.feature` に足した（計画にはなかった追加）。
- U3 のテスト 1 件と U5 のテスト 1 件の期待を直した（`docs/contract-changes-u8.md`）。
- `.gitkeep`（空のフォルダーの印）を `infrastructure/test/u8-swap/` と `packages/shared/test/u8-swap/` から消した。

## Sources

- `code-generation-plan.md`、`unit-test-instructions.md`、`source-manifest.json`、`traceability.json`
- `construction/u8-swap/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`
- `docs/contract-changes-u8.md`、`docs/manual-check-u8.md`

## Assumptions & Open Questions

- [assumption] 速さ（3 秒以内）は、読み取りが並行で、書き込みが 1 回の取引という構成から満たせると考えているが、ステージングの測定で確かめるまでは確定ではない。
- [assumption] 今回の依頼文にあった場面数（32 と約 56）は別の数え方だった可能性がある。私の数え方は `.feature` の `Scenario` の行数。
- 開いた点: ボタンの高さと buttons テンプレートの色の差は、実機で見るまで分からない。
