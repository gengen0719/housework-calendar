# U8 で足した契約・直した文書の一覧

U8（`u8-swap`）のコード生成で、契約と上流の文書に加えた変更の一覧です。この文書は Batch 1（Step 1）で新設し、Step 32 で完成させました。壊す変更（これまでの呼び出し方・値の意味を変えるもの）はありません。

## 上流の文書の更新（Step 1a。2026-11-10）

申し出を始める言葉を「代わって」から「家事交代」に直しました（機能設計 Q1、BR9.1）。「代わってくれる人を探しています」（申し出の知らせの文言）と、「代わってほしい」という説明の文は始める言葉ではないので直していません。

| ファイル                                                    | 直した場所                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `inception/user-stories/stories.md`                         | AC7.1.1、AC7.1.2、AC7.1.3、AC7.1.11、「あとの段階で決めること」の 2 項目（決まった内容 Q2 を添えた）       |
| `inception/requirements-analysis/requirements.md`           | FR7.1 の Given/When/Then 3 つ、FR7.2 の Given、`[assumption]`（FR7 の申し出は…「家事交代」と送ると始まる） |
| `inception/refined-mockups/mockups.md`                      | T2 の会話例、返事の表の 1 行目、1 対 1 と管理者の返事の注記（決まった内容 Q2 を添えた）                    |
| `inception/contract-design/contract-summary.md`             | C3 の `message`（「登録」〈U3〉、「家事交代」〈U8。FR7.1〉）                                               |
| `construction/u8-swap/functional-design/functional-spec.md` | 「筋書き用の読み替え表」に「直した日・直したファイル」の行を足した（表そのものは残す）                     |

未更新で残るもの（計画の対象外）: `inception/domain-design/components.md`（行 145・151 の「代わって」）、`inception/delivery-planning/bolt-plan.md`（行 85）、`inception/units-generation/unit-of-work.md`（行 114）。いずれも始める言葉の例示で、レビューの記録（`reviews/`）は当時のまま残す。

## LINE の上限の確認結果（Step 1b）

- 確かめた日: 2026-11-10
- 出典: LINE Developers「Messaging API reference」（https://developers.line.biz/en/reference/messaging-api/nojs/、2026-11-10 に取得）と、同「Using Flex Messages」「Flex Message elements」「Flex Message layout」（https://developers.line.biz/en/docs/messaging-api/ 以下、同日に取得）
- 読めなかった項目は「未確認」と書き、より厳しい側の値を使う。

| 項目                                                 | 機能設計の仮定            | 確かめた値                                                                                             | 出典（上の資料の項目）                                                             | 確かめた日 | どう直したか                                                                                                                 |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| carousel（Flex）のバブルの数                         | 12（U8 は 10 を使う）     | 12                                                                                                     | Flex Message の Carousel「Max: 12 bubbles」。JSON は 50 KB まで                    | 2026-11-10 | 仮定どおり。U8 は 10 のまま                                                                                                  |
| 1 回の reply のメッセージの通数                      | 5（U8 は 3 以内）         | 5                                                                                                      | Send reply message の `messages`「Max: 5」                                         | 2026-11-10 | 仮定どおり                                                                                                                   |
| Flex の `button` のアクションの `label`              | 26                        | 40                                                                                                     | Action objects「Specifications of the label」の表（Flex Message Button: 必須、40） | 2026-11-10 | 仮定（26）より緩い。`LINE_LIMITS.FLEX_BUTTON_LABEL_MAX = 40`                                                                 |
| buttons テンプレートのボタンの `label`               | 20                        | 20                                                                                                     | 同じ表（Template messages、image carousel 以外: 必須、20）                         | 2026-11-10 | 仮定どおり                                                                                                                   |
| postback アクションの `label` の一般の上限           | 20                        | 20（テンプレート）／40（Flex の button）／20（クイック返信・リッチメニュー）。使う場所で決まる         | 同じ表                                                                             | 2026-11-10 | 場所ごとに上の 2 行を使う                                                                                                    |
| buttons テンプレートの本文                           | 160（タイトル・画像なし） | 160（画像・タイトルなし）／60（あり）                                                                  | Buttons template の `text`                                                         | 2026-11-10 | 仮定どおり。U8 はタイトル・画像を付けない                                                                                    |
| `altText`                                            | 400                       | **1500**                                                                                               | Template message／Flex message の `altText`「Max character limit: 1500」           | 2026-11-10 | 仮定（400）より緩い。厳しい側の 400 を使い続ける（`ALT_TEXT_MAX = 400` を `LINE_LIMITS` に置く。確かめた上限の 1500 は注記） |
| postback の `data`                                   | 300                       | 300                                                                                                    | Postback action の `data`「Max character limit: 300」                              | 2026-11-10 | 仮定どおり                                                                                                                   |
| `displayText`                                        | （仮定なし）              | 300                                                                                                    | 同上                                                                               | 2026-11-10 | U8 は使わない                                                                                                                |
| buttons テンプレートのボタンの数                     | （仮定なし）              | 4 まで                                                                                                 | Buttons template の `actions`                                                      | 2026-11-10 | U8 は 2 つ                                                                                                                   |
| Flex の `button` の高さ（44 ピクセル以上か。NFR9.9） | 44 以上                   | **未確認**。資料は `height` に `sm`／`md`（既定 `md`）を指定できるとだけ書き、ピクセル数は書いていない | Flex Message の Button `height`                                                    | 2026-11-10 | より大きい側の `md` を指定する。画面での確かめを `docs/manual-check-u8.md` に入れる                                          |
| buttons テンプレートのボタンの高さ                   | 44 以上                   | **未確認**（資料に記載なし）                                                                           | —                                                                                  | 2026-11-10 | 実機の確かめ（`docs/manual-check-u8.md`）に回す                                                                              |
| LINE の標準の配色の色の差（4.5:1 以上か）            | 4.5:1 以上                | **未確認**（資料に色の値の記載なし）                                                                   | —                                                                                  | 2026-11-10 | 独自に指定した色で、色の差を計算する単体テストを Step 30 で足す                                                              |

### 上限に関する決めたこと

- Flex の `button` の `label` は公式の上限が 40 文字ですが、`rules.md` BR9.6 の「名前は 20 文字まで」は変えません（短いほうが安全で、表示が崩れにくいため）。計算式 `SWAP_CHORE_NAME_MAX = FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1` は、`FLEX_BUTTON_LABEL_MAX = 40` なら 34 になります。名前の長さは `min(34, 20)` で 20 文字に収める（Step 9 で定数にする）。
- 知らせの本文の表示名・お手伝いの名前の長さ（`SWAP_NOTICE_NAME_MAX`）は、本文の上限 160 から計算し、20 を上限とする。

## U3 の既存の動きを直したところ（Step 12。承認の確認点 2）

- `runGroupOperation`（`services/groupCommandGate.ts`）の操作の型を `(ctx) => …` から `(ctx, displayName) => …` にした。第 2 引数は、入口で読んだ利用者の記録の表示名（追加の読み取りはしない）。`FamilyContext` は変えていない。引数が 1 つの操作は、これまでどおり動く。
- `GROUP_COMMAND_REJECTED` のログから `groupId`（LINE のグループ ID）を外した。残るのは `reason` と、分かるときのアプリの `userId` だけ（NFR2.65）。ほかのログ（`GROUP_JOINED`、`NOTIFICATION_GROUP_REJECTED`、`GROUP_SUMMARY_FAILED`）は変えていない。
- U3 のテストを全文読んだ結果（`unregister-and-gate.steps.ts`、`groupCommandGate.test.ts`、`unregisterNotificationGroup.test.ts`）:
  - `groupId` の値を期待している箇所は **なかった**（`GROUP_COMMAND_REJECTED` と `GROUP_NOT_REGISTERED` が出ることだけを見ていた）。`groupCommandGate.test.ts` の `groupId: 'C_1'` はログの伏せ字の一般の確認で、`GROUP_COMMAND_REJECTED` ではないので変えていない。
  - 計画で見つけていなかった直し: `unregisterNotificationGroup.test.ts` の「家族のメンバーなら、家族・利用者・役割つきで操作を呼ぶ」が `toHaveBeenCalledWith(ctx)`（引数がちょうど 1 つ）を期待していた。表示名の第 2 引数が増えたので、`(ctx, 表示名)` の期待に直した。
  - 足した期待: `unregister-and-gate.steps.ts` の「登録されていないグループ…」に、`GROUP_COMMAND_REJECTED` の行にグループ ID の項目も値もないことの確認。

## U5 のフックのテストの期待を直したところ（Step 11・13）

- `notifyDutyReassigned` を、イベントを最大 4 件ずつ並行して呼ぶ形にした（BR9.11、NFR3.15）。型（`DutyReassignedEvent`・`DutyReassignedHook`・`notifyDutyReassigned(events)`）は変えていない。1 つのイベントの中で登録された関数を登録の順に `await` することも変えていない。
- 変わったのは「別のイベントどうしの前後」。`u5-assignment-calendar/dutyReassignedHook.test.ts` の「担当ごとに順に await して呼ぶ」が、イベント間の完全な直列（`start A, end A, start B, end B`）を期待していたので、「1 つの担当の中は start → end の順」だけを確かめる形に直した。
- 新しく `DUTY_HOOKS_DONE`（info）を、登録された関数があり、イベントが 1 件以上のときに 1 回の呼び出しにつき 1 件出す。何も登録されていないとき、イベントが空のときは、これまでどおり何も出ない（U5・U7 の「何もしない」のテストは変更なし）。

## LINE の受け口と返事の形（Batch 6。Step 24〜30）

- **申し出の知らせの形: buttons テンプレート**（Flex ではない）。タイトル・画像なしで、本文は「{名前}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています」（160 文字以内。名前は `SWAP_NOTICE_NAME_MAX` に収める）、ボタンは「引き受ける」「申し出をやめる」の 2 つ（postback。ラベルは 20 文字以内）。`altText` は本文と同じ文（上限は 400 文字を使い続ける）。理由: 上限（本文 160、ラベル 20、`data` 300）が資料で確かめられていて、U3・U6 のボタンの作りと揃うため。担当を選ぶ一覧だけが Flex の carousel（1 バブル 1 担当、10 件まで）。
- **ボタンの値**（`functional-spec.md` の C3 のとおり。生の文字列に対する正規表現で厳密に読む）: `action=swap.offer&dutyId=<UUID>`、`action=swap.accept&dutyId=<UUID>&offerId=<UUID>`、`action=swap.withdraw&dutyId=<UUID>&offerId=<UUID>`。一番長い値も 300 文字以内（`swapCommand.test.ts` で確認）。
- **言葉**: 前後の空白（全角を含む）・改行を除いて「家事交代」と完全に一致するときだけ。グループと 1 対 1 の `message.type=text` だけを受け付け、ルームや 1 対 1 のボタンの値は二度処理しない記録を書く前に打ち切る。
- **ボタンの高さ**: Flex の担当のボタンは `height: md`（資料は `sm`／`md` の指定のみで、ピクセル数は未確認）。buttons テンプレートの高さは指定できない。実機の確かめは `docs/manual-check-u8.md`。
- **ボタンの色（NFR9.9）**: LINE の標準の緑（`#17c950`）に白い文字では 4.5:1 に届かない（`swapColors.test.ts` で計算）。担当のボタンは `color: #1b5e20`（白い文字に対して 4.5:1 以上。計算で確認）を指定した。buttons テンプレートのボタンの色は指定できないので、標準の配色のまま（色の差は未確認。実機で確かめる）。
- **管理者・1 対 1 の案内**: 管理者の「家事交代」は担当も申し出も読まずに案内だけ（`SWAP_GUIDE_SENT` の `reason=ADMIN`）。1 対 1 の「家事交代」は誰が送っても同じ案内で、何も読まない（`reason=ONE_TO_ONE`）。
- **起動の枠**: `entries/api.ts` は `registerSwapHooks({ reassigned: true, recorded: true })`、`entries/line.ts` は `registerSwapHooks({ reassigned: false, recorded: true })` を、読み込み時に 1 回呼ぶ。
- **確認点 1 の既定 (1)**: 「担当を選ぶ」の書き込みのあとに reply が失敗したときの扱いは、設計どおり許容した（`swap-line-resilience.feature` の 2 つ目の場面が再現）。

## 契約への追加（Step 32）

| 契約                                           | 区分             | 中身                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C3 postback                                    | 足したもの（形） | `action=swap.offer&dutyId=<UUID>`、`action=swap.accept&dutyId=<UUID>&offerId=<UUID>`、`action=swap.withdraw&dutyId=<UUID>&offerId=<UUID>`。グループに届いたものだけを、生の文字列に対する正規表現で厳密に読む（BR9.16）。最長でも 300 文字以内          |
| C3 message                                     | 足したもの       | グループの text で、前後の空白を除いて「家事交代」と完全に一致 → 一覧。1 対 1 の同じ言葉は案内だけ（BR9.1、BR9.4）                                                                                                                                      |
| C8 `listSwappableDuties(ctx, today)`           | 形（変更）       | `Duty[]` の代わりに `SwappableDuty[]`（`dutyId`・`date`・`choreTypeId`・`choreName`。日付の近い順、同じ日は種類の順）。10 件への絞りは受け口                                                                                                            |
| C8 `offerSwap` / `acceptSwap` / `withdrawSwap` | 形（変更）       | `dutyId` と `options.now` を足した。結果は理由の印（`OFFER_OWNER_ONLY`・`OFFER_GONE`・`CANNOT_ACCEPT_OWN_OFFER`・`OFFER_ALREADY_ACCEPTED`・`ALREADY_OFFERED`・`DUTY_CHANGED` など）。引き受けでの `NOT_FOUND` は `OFFER_GONE` に含める                  |
| C8 `onDutyReassigned` / `onDutyRecorded`       | 使うもの         | U8 が `registerSwapHooks` で登録する。型は変えない。引き受けはフックを呼ばない                                                                                                                                                                          |
| C6 `runGroupOperation`                         | 形（追加）       | 操作関数の第 2 引数に、押した人の表示名を渡す（`FamilyContext` は変えない。追加の読み取りなし。引数 1 つの既存の操作はそのまま動く）                                                                                                                    |
| C10 理由の印と文言                             | 足したもの       | `OFFER_OWNER_ONLY`（「この操作は申し出た人だけができます」）。見出し・案内・管理者／1 対 1 の文・知らせと結果の文・失敗の文。更新したファイル: `packages/shared/src/reasons.ts`、`messages.ts`、`packages/shared/test/u8-swap/messages.test.ts`（新設） |
| データ                                         | 足したもの       | `Calendar` の `SWAP#<dutyId>` の項目（`SwapOffer`）。テーブル・索引・TTL・権限・環境変数は足していない（`infrastructure/test/u8-swap/stacks.test.ts` が前後で同じことを固定）                                                                           |
| `lineApiService.ts`                            | 足したもの       | `LINE_LIMITS`、`SWAP_CHORE_NAME_MAX`、`SWAP_NOTICE_NAME_MAX`、`truncateForLine`、`buildSwapCarousel`、`buildSwapOfferMessage`、ボタンの値を作る関数                                                                                                     |

## フックの並行数（Step 11）

- `notifyDutyReassigned` は、イベントを最大 `DUTY_HOOK_CONCURRENCY` 件（4。変えてよい範囲は 2〜5。範囲外は `clampConcurrency` で丸める）ずつ並行に処理する。型は変えていない。1 つのイベントの中は登録の順に `await` する。
- 並行数を変えたら、月の確定（300 件規模）を測り直す（`docs/manual-check-u8.md` の確かめ 13）。段階 2 の締め切り（`DUTY_HOOKS_TRUNCATED` を出す打ち切り）は、測定の結果が出るまで入れていない（型の定義だけ）。

## 許容した残る危険（承認の確認点 1。既定 (1) のまま）

- 起きること: 「担当を選ぶ」の書き込みは成功したのに reply が失敗すると、申し出は `open` で残るが、グループに「引き受ける」「申し出をやめる」のボタンが出ない。もう一度選ぶと `ALREADY_OFFERED`（文だけ）になり、ボタンを出し直す手段がない。
- 害: 「その担当で代わってもらえない」だけ。データは壊れない。申し出は担当が変わる・済になる・日が過ぎる・月が確定するといずれ無効になる（BR9.8）。
- 扱い: 設計どおり許容した（`rules.md` BR9.7 の 5. と `functional-spec.md` の対応表は変えていない）。`swap-line-resilience.feature` の「担当を選んだあとに reply が失敗すると…」がこの状態を再現している。
- 遅れて届いた担当変更のフックが、付け替えの直後に新しい持ち主が出し直した有効な申し出を `cancelled` にし得る（掃除の条件が `offerId` も `dutyVersion` も見ないため。レビュー R-01）。害は引き受け側に「この申し出はもうありません」と出るだけで、担当や金額は壊れず、出し直せば直る。許容した。直す場合は、フックのイベントに担当の `version` を足し、掃除の条件に `dutyVersion` を加える。
- 承認の場で別の案 (2)（本人に `ALREADY_OFFERED` を返すときだけボタンを添える）が選ばれた記録はない。(2) にする場合は、`rules.md`・`reliability-design.md` に書き戻し、この節と上の場面の期待を直す。

## 費用の確認（Step 33）

- U8 は reply だけを使う（`push`・`multicast`・`broadcast`・プロフィール取得なし）。`fetch` の見張り（reply 以外の通信が 0 回）を `swap-line-roles.feature`（ひと通りの操作）、`swap-line-resilience.feature`（読み取りの回数）、`swapHandler.test.ts` で確かめている。
- DynamoDB の追加の費用の見積もり（月に 1 円に満たない。確定の 300 件の書き込みが月に数回）の根拠は `nfr-design/scalability-design.md` のまま。**料金の単価は公式の料金表で確かめられていない（未確認）**。この作業では外部の資料を読める道具がなかったため。桁として 1 円に満たない結論は変わらない見込みだが、最初の請求（U5 の確認に含める）で確かめる。
