# コードのまとめ（Code Summary）— U6 記録

承認された計画（`code-generation-plan.md`、35 ステップ）をすべて作りました。子供は LINE の公式アカウントとの 1 対 1 のトーク（リッチメニュー「やった」）と、カレンダー画面の両方から、今日の自分の担当を「やった」と記録できます。記録できる担当が複数あれば選び（1 件でも選択肢を出す）、選んだ担当がその後に変わっていたら、いまの選択肢を出し直します。二重に押しても、同じイベントの再送でも、記録は 1 件のままです。記録した時点のお手伝いの単価を、同じ取引でその担当に書き写します（あとで U9 が金額を数えるため）。管理者や家族に入っていない人が押したときは、本人にだけ案内を返し、グループには何も送りません。

## 作った・変えたファイル

正確な一覧は同じフォルダーの `source-manifest.json` にあります。

| 場所 | 中身 |
|------|------|
| `packages/shared/src/` | 記録の型（`RecordDutyRequest`・`RecordDutyResponse`）、理由の印（`DUTY_CHANGED`・`DUTY_ALREADY_DONE`・`NOT_TODAY_DUTY`・`ADMIN_RECORD_GUIDE`・`JOIN_FAMILY_FIRST`）と文言、`jstDate.ts` の `jstTimeOf`（記録時刻の「HH:mm」） |
| `packages/backend/src/lib/promise.ts` | `settle` ユーティリティ（`Promise` を catch 付きで一時保持し、未処理の拒否を出さずに待つ） |
| `packages/backend/src/handlers/line/recordCommand.ts` | postback の data を正規表現 1 つで厳密に読む（`record.list`／`record.do&dutyId=…&v=…`）。`source.type=user` と `replyToken` を必須にする。`MAX_RECORD_CHOICES=12` |
| `packages/backend/src/services/oneToOneGate.ts` | 1 対 1 の入口。`source.userId` だけから、子供・管理者・家族外を見分ける |
| `packages/backend/src/services/recordingService.ts` | `listTodayRecordableDuties`、`recordDuty`。確かめの順番（BR7.4）、二重押しの判定を `version` の比べより前に、断られたら競合だけ 1 回読み直し・それ以外は 500 |
| `packages/backend/src/repositories/calendarRepository.ts` | 今日の担当の読み取り・月の状態の読み取り・記録の Update 取引（担当の Update ＋ 月の状態の ConditionCheck ＋ `ChoreTypes` の単価の ConditionCheck の 3 項目。属性名はすべて `ExpressionAttributeNames`） |
| `packages/backend/src/services/dutyRecordedHook.ts` | 記録が書けた 1 回だけ呼ぶ `onDutyRecorded`（U8 向け。投げても記録の結果は変えない） |
| `packages/backend/src/handlers/line/recordHandler.ts`、`postbackHandler.ts`、`entries/line.ts` | 1 対 1 の記録の入口、`record.list`／`record.do` の返事の組み立て（Flex の carousel）、`accepts` に記録の postback を追加 |
| `packages/backend/src/handlers/calendar/recordDuty.ts`、`entries/api.ts` | 画面用 API `POST /v1/duties/:dutyId/record`。検証の順番（セッション → 家族 → `dutyId` の形 → 担当の 404 → 本文の 422 → 本人の 403） |
| `packages/backend/src/services/lineApiService.ts`、`lib/dynamoClient.ts` | reply のテキスト・carousel の組み立て、`line` も `Calendar`・`ChoreTypes` を読むコメント |
| `packages/frontend/src/` | `components/DutyRecordAction.tsx`（「やった」ボタンと理由。カレンダーと日の詳細で共用）、`RecordConfirmDialog.tsx`、`api/client.ts` の `recordDuty`、`calendar/format.ts`、`CalendarPage.tsx`・`DayDetail.tsx`・`App.tsx`・`theme.ts` |
| `infrastructure/lib/app-stack.ts` | `line` に環境変数 2 つ（`CALENDAR_TABLE`・`CHORE_TYPES_TABLE`）と権限 2 文（`Calendar` に 4 操作、`ChoreTypes` に 3 操作）。Put・Delete・Scan は足さない |
| `scripts/setup-rich-menu.ts` | リッチメニューの set／get／delete（`--env` 必須、トークンは SSM から実行時に読む、SDK なし fetch） |
| `scripts/smoke-check.sh`、`README.md`、`docs/contract-changes-u6.md` | スモークチェック 3m（計 20 件）、U6 の使い方と戻し方、U6 で足した契約 |
| テスト | `packages/shared/test/u6-recording/`、`packages/backend/test/u6-recording/`、`packages/frontend/test/u6-recording/`、`infrastructure/test/u6-recording/stacks.test.ts` と、U1〜U5 の既存インフラテストの参照の直し |

## 主な実装の判断

- **記録は 1 回の取引:** 担当の Update（`status=todo`・`version`・`dutyId`・`childUserId` を条件）、月の状態の ConditionCheck、`ChoreTypes` の単価の ConditionCheck の 3 項目を 1 つの `TransactWriteItems` にまとめます。断られたら、競合（`ConditionalCheckFailed`・`TransactionConflict`）だけ読み直して最初からもう 1 回行い、2 回続けて断られたら 500 にします（NFR2.33〜2.36）
- **二重押し:** 「本人が記録済み」の判定を `version` の比べより先に置くので、古いボタンでも 2 回目は成功扱い（`alreadyRecorded`）になります。同じイベントの再送は U1 の二度処理しない記録で弾きます（BR7.8）
- **単価の書き写し:** 書き込みの直前に U4 の `getCurrentUnitPrice` を読み、同じ取引で「単価がその値のまま」を確かめて担当に書き写します。「使わない」種類の担当も記録できます（BR7.12）
- **失敗の返し方:** 読み直しが 2 回続けて断られたときだけ本人に返事をし、それ以外の予期しない例外は reply せず 500 にして LINE の再送に任せます。reply を使い切ってから記録だけが書かれるのを避けます（NFR2.37）
- **名前の読み取り:** `choreTypeService.list`（Query 1 回）で読みます。`Scan` は使いません（NFR1.20、NFR1.21）
- **LINE の受け口:** `accepts` の順番（署名 → 本文 → `accepts` → `begin`）は変えず、postback の `accepts` に記録の判定を足すだけです。返事は本人にだけ reply し、push は使いません（NFR4.56、NFR4.58）
- **画面:** 記録のあと、応答の `Duty` で先に「済」を出し、続けてカレンダーを読み直します。名前は React の文字として出します（`dangerouslySetInnerHTML` なし）。ボタンは 44 ピクセル以上です
- **最小権限:** `line` に足すのは `Calendar` の 4 操作と `ChoreTypes` の 3 操作だけで、`api` のロールは変えません（NFR4.63、NFR4.64）

## テスト

| 確かめ | 結果 |
|--------|------|
| `npm test`（U1〜U6 のすべて） | 115 ファイル、2294 件が通過（skip 2 件）。行カバレッジ 97.1%（下限の 80% を上回る） |
| 確認コマンド（`format:check`、`lint`、`tsc --noEmit` 4 つ、`npm test`） | すべて通過 |
| U6 の筋書き（BDD） | 裏側 5 本（`one-to-one-gate`、`record-list`、`record-do-line`、`record-api`、`record-resilience`。単価の書き写しと競合は `record-resilience` の (c) と `recordingService.test.ts` で確かめる）、画面 2 本（`calendar-record`、`record-confirm-dialog`） |
| 部品ごとの単体テスト | `settle`、`recordCommand`、`oneToOneGate`、`recordingService`、`listTodayRecordableDuties`、`calendarRepository.recordItems`、`buildRecordCarousel`、`buildMessages`、`buildTextMessage`、`dutyRecordedHook`、画面の `DayDetail.record`・`RecordConfirmDialog`・`client.recordDuty`・`theme`、`shared` の `jstTimeOf`・`messages` |
| CDK のテスト（U6） | `line` の `Calendar` 4 操作・`ChoreTypes` 3 操作、足さないもの（Put・Delete・Scan）、環境変数 2 つ、テーブル数が変わらないこと、本番は Retain |

AWS・LINE・LIFF は差し替えで動かし、本物にはつないでいません。

## 書いたが、この段階では動かしていない確かめ

| 確かめ | 理由 |
|--------|------|
| 速さの測定（NFR7.25〜NFR7.32、AC5.1.15 の 3 秒）: 「やった」から選択肢、記録のボタンから返事を、日や家族を分けて 20 回ずつ（コールドスタートを含む） | ステージングが必要。この段階では測れない。`traceability.json` では、読み書きの回数など測定の前提になる性質を確かめるテストを指す。ステージングで作り手が測り、Build and Test に引き継ぐ |
| 最初の請求での費用の確認（NFR1 の実際の額） | 本物の請求は配備後でないと見られない。CDK のテストで新しい有料サービスが増えていないことまで確かめた |
| ステージングでの手の確かめ、gitleaks の `npm run secrets:scan` | 本物の LINE・AWS や gitleaks の導入が要るため、作り手が行う（`brew install gitleaks` のあと） |
| スモークチェック（`scripts/smoke-check.sh`、20 件）、リッチメニューの設定（`scripts/setup-rich-menu.ts`） | 配備後に動かす |

## 計画からずれたところ

- **`dutyRecordedHook.ts` の前倒し:** 計画では新設が Batch 6（Step 27）でしたが、`recordingService` が依存するため Batch 5 で先に作りました。フック専用の単体テストは計画どおり Batch 6 です
- **共用コンポーネント:** 記録 UI の重複を避けるため、`DutyRecordAction.tsx` を 1 つ新設し、カレンダーと日の詳細の両方から使いました
- **既存インフラテストの追加の直し:** 計画は U4・U5 の「line に Calendar/ChoreTypes がない」テストの削除・スキップだけを挙げていましたが、U6 の反映で U2・U3 の同種の不変条件（`ConditionCheckItem` がない、`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` がない）も崩れたため、同じ方針で `it.skip` または期待の更新を行いました。U6 後の正しい期待は `infrastructure/test/u6-recording/stacks.test.ts` が固定します。理由はコードのコメントに残しています
- **BR7.2 の筋書きの seed:** `@amiceli/vitest-cucumber` の `Background` が期待どおり動かなかったため、各 `Scenario` の最初の `Given` に seed を畳み込む、U1〜U5 と同じパターンに直しました

## Sources

- `code-generation-plan.md`、`unit-test-instructions.md`、`source-manifest.json`
- `construction/u6-recording/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`

## Assumptions & Open Questions

- [assumption] 速さ（3 秒以内）は、読み書きの回数と reply 1 回の構成から見て満たせると考えているが、ステージングの測定で確かめるまでは確定ではない
- [assumption] LINE の carousel の上限（12）、reply の通数、Flex のボタンの高さは、公式の資料での確認を配備前に行う前提で、`MAX_RECORD_CHOICES` を 1 か所に置いた
