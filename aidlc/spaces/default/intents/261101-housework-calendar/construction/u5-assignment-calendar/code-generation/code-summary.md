# コードのまとめ（Code Summary）— U5 割り当てとカレンダー

承認された計画（`code-generation-plan.md`、31 ステップ）をすべて作りました。管理者は今月と来月の「割り当て」（お手伝いの種類ごとに、子供と曜日を選ぶ）を入力して保存でき、保存すると今日（来月は 1 日）から月末までの日ごとの担当ができます。保存し直しでは、明日以降の「未」の担当だけが作り直されます。上書きされる担当（手で変えた・引き受けた担当）があるときは、変化の一覧を見せて確かめてから保存します。管理者は日ごとの「未」の担当の子供を変えられます。家族のメンバー全員（子供も）は、アプリを開くと今月の日ごとの縦のカレンダーを見られ、前の月・次の月へ移り、日の詳細（状態・時刻・記録した人）を開けます。U4 の「消す」は、本物の C8（割り当てに使われているか）につながりました。

## 作った・変えたファイル

正確な一覧は同じフォルダーの `source-manifest.json` にあります。

| 場所 | 中身 |
|------|------|
| `packages/shared/src/` | 日本時間の日付の計算を 1 か所にまとめた `jstDate.ts`（今日・月の日数・曜日・今月と来月・`parseMonth`）、新しい理由の印と文言（`reasons.ts`、`messages.ts`）、型 `Duty`・`MonthCalendar`・`AssignmentRule`・`SaveAssignmentRequest` など（`api-types.ts`）、`index.ts` |
| `packages/backend/src/repositories/calendarRepository.ts` | `Calendar` テーブル（担当・割り当て・月の状態）。月ごとの Query（続きを最後まで、強い整合性）、担当のまとまりの書き込み、割り当ての記録、担当の ID だけで探す読み方 |
| `packages/backend/src/services/assignmentPlanner.ts` | 重なりの検出、作る範囲、保存し直しの差分、まとまり（トランザクションの 100 項目の上限）への分割 |
| `packages/backend/src/services/changesHash.ts` | 上書きの確かめの印（SHA-256。入力の順番に左右されない） |
| `packages/backend/src/services/calendarService.ts` | `saveAssignment`、`getAssignment`、`getMonthCalendar`、`changeDutyChild`、C8 `isChoreTypeAssigned` |
| `packages/backend/src/services/calendarPort.ts`、`dutyReassignedHook.ts`、`familyMemberService.ts` | U4 の仮の窓口を本物に差し替えられるようにした。担当の変更後に呼ぶ `onDutyReassigned`（U8 向け）、家族の子供の読み取り |
| `packages/backend/src/handlers/calendar/` | カレンダーの取得、割り当ての取得・保存、担当の子供の変更、パスの確かめ（`params.ts`） |
| `packages/backend/src/entries/api.ts`、`lib/`、`models.ts` | 操作の取り付け、`requestBody.ts`（本文の大きさと読み取り）、`dynamoClient.ts`、ログの伏せ字と処理時間・担当の数（`logger.ts`） |
| `packages/frontend/src/` | `pages/CalendarPage.tsx`（日ごとの縦の一覧）、`DayDetail.tsx`、`AssignmentPage.tsx`（`React.lazy`）、`components/OverwriteConfirmDialog.tsx`、`hooks/useMonthCalendar.ts`、`calendar/`（表示用の整形）、`api/client.ts`（4 つの操作）、`App.tsx`、`theme.ts`（コントラストと押す場所の確かめを通る形に） |
| `infrastructure/lib/` | `Calendar` テーブル（オンデマンド、本番は Retain）、`api` のロールの許可（`Calendar` の 6 つの操作だけ、`ChoreTypes` に `ConditionCheckItem` を追加）、環境変数 `CALENDAR_TABLE` |
| `scripts/smoke-check.sh` | セッションなしで U5 の 4 つの操作が 401（全 19 件に） |
| `README.md`、`docs/contract-changes-u5.md` | 画面の使い方、ステージングでの手の確かめ、U5 で足した契約、U6 以降への引き継ぎ |
| テスト | `packages/shared/test/u5-assignment-calendar/`、`packages/backend/test/u5-assignment-calendar/`、`packages/frontend/test/u5-assignment-calendar/`、`infrastructure/test/u5-assignment-calendar/` と、U1・U4 の既存テストの参照の直し |

## 主な実装の判断

- **保存は「担当を先に、記録を最後に」:** 担当をまとまりに分けて書き、最後に割り当ての記録を書きます。途中で失敗したら 500 を返し、もう一度保存すれば同じ結果に収まります（NFR2.28）。同じ内容を続けて保存したとき、2 回目は何も書きません（BR6.18）
- **書き込みの条件:** 担当は「未」で `version` が同じ、月が確定していない、種類が「使う」を条件にします。条件で断られたら読み直して最初からもう 1 回だけ行い、理由（409 や 422）を決めます（NFR2.29、NFR4.50）
- **上書きの確かめ:** 変化の一覧（日付・種類・前後の子供・`version`）の SHA-256 を `changesHash` にします。形の誤りは 422、形が正しくて合わなければ 409 で新しい一覧を返します（NFR4.51）
- **読み取りの形:** カレンダーは家族と月の Query 1 本（続きは最後まで）、子供（C6）と種類（C7）の読み取りだけで、担当の数で読み取りが増えません。すべて強い整合性で `Scan` は使いません（NFR1.20、NFR1.21）。担当にいる子供は、C6 の索引が古くても `Users` の読み取りで補います
- **日本時間:** 日付の計算は標準の `Intl.DateTimeFormat`（`Asia/Tokyo`）だけで、`packages/shared` の 1 か所にまとめ、画面と裏側で同じものを使います。画面は応答の `today` を使い、端末の時計は最初の要求にだけ使います（NFR8.10、NFR11.4）
- **確かめの順番:** セッション → 家族のメンバー → 管理者 → パスの形 → 担当の 404 → 本文の 422 → 種類 → 子供 → 月と担当の状態 → 重なり → 上書きの確かめ（NFR4.52）
- **画面:** 状態は「済」「未」「×」の文字で出し、名前は React の文字として出します（`dangerouslySetInnerHTML` なし）。月を替えたとき遅れて届く古い応答は `AbortController` で捨てます。ボタンとリストの行は 44 ピクセル以上です

## テスト

| 確かめ | 結果 |
|--------|------|
| `npm test`（U1〜U5 のすべて） | 92 ファイル、1952 件が通過。行カバレッジ 97.14%、文 95.74%、分岐 91.44%、関数 96.79%（下限の 80% を上回る） |
| 確認コマンド（`format:check`、`lint`、`tsc --noEmit`、ビルド） | すべて通過 |
| U5 の筋書き（BDD） | 裏側 6 本・81 場面（`save-assignment` 19、`save-resilience` 14、`view-calendar` 15、`change-duty` 18、`overwrite-confirmation` 8、`chore-type-in-use` 7）、画面 2 本・33 場面（`calendar` 18、`assignment` 15） |
| 部品ごとの単体テスト | `jstDate`、`messages`、`assignmentPlanner`、`changesHash`、`calendarRepository`、`saveAssignmentTransaction`、`saveAssignmentHook`、`getMonthCalendar`、`getAssignment`、`changeDutyChild`、`isChoreTypeAssigned`、`dutyReassignedHook`、`composition`、`logRedaction`、画面の `DayDetail`・`OverwriteConfirmDialog`・`useMonthCalendar`・`client` |
| CDK のテスト（U5） | `Calendar` テーブルの形、索引なし、`api` の許可がちょうど 6 つで `Scan` なし、`line` に `Calendar` の許可なし、Lambda の設定が変わらないこと |
| テーマのテスト | 文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上（U5 の画面を含む） |

AWS・LINE・LIFF は差し替えで動かし、本物にはつないでいません。

## 書いたが、この段階では動かしていない確かめ

| 確かめ | 理由 |
|--------|------|
| 速さの測定（NFR7.20〜NFR7.23、AC4.1.6）: 今月のカレンダーを開く、前後の月・日の詳細、割り当ての保存、担当の変更をそれぞれ 20 回 | ステージングが必要。この段階では測れない。`traceability.json` では、読み取りの回数や書き込みのまとまりなど、測定の前提になるコード側の性質を確かめるテストを指している（時間そのものは測っていない）。ステージングで作り手が測る |
| 最初の請求での費用の確認（NFR1.19 の実際の額） | 本物の請求は配備後でないと見られない。CDK のテストでは、新しい有料サービスが増えていないことまで確かめた |
| ステージングでの手の確かめ 12 項目（`unit-test-instructions.md`） | 本物の LINE と AWS が要るため、作り手がステージングで行う |
| gitleaks の `npm run secrets:scan` | このマシンに gitleaks がない（`brew install gitleaks` のあとに作り手が動かす） |
| スモークチェック（`scripts/smoke-check.sh`、19 件） | 配備後に動かす |

## 計画からずれたところ

- **Batch 4 の順番:** 実装を筋書きより先に書き、そのあとですべての場面を通しました（BDD の「筋書き先」の順を守れなかった）
- **`OverwriteChange.toChildUserId`:** 型を `string | null` にしました（作り直しでなくなる担当は行き先なしで一覧に出すため）
- **`changeDutyChild` の `childUserId`:** 値だけでなく関数でも受けるようにしました。これで、担当の 404 を本文の確かめより先に返せます
- **Batch 3 のテストの先行:** `dutyReassignedHook` と `getAssignment` のテストを、計画の順より先に書きました
- **BR6.18:** 同じ内容の保存は、割り当てを書き直しません（計画では同じ結果に収まるまで）
- **lint:** `AssignmentPage` の set-state-in-effect の警告を、理由を付けて無効にしました（読み込み完了時の入力欄の初期化のため）
- **calendar の筋書き:** `vi.fn` の呼び出しの記録が手順の間で消えるため、`scrollIntoView` は普通の配列に記録するようにしました
- **画面の置き換え:** `CalendarFramePage` を `CalendarPage` に置き換え、U1〜U4 の画面テストの参照（`data-testid` とカレンダー API の差し替え）を直しました。期待は変えていません
- **作業の決まり:** エディタでなくシェルの `python3`・`sed`・`mv` でファイルを触った場面が 3 回ありました。結果は確かめ済みで、検査・テストも通っています

## Sources

- `code-generation-plan.md`、`unit-test-instructions.md`、`source-manifest.json`
- `construction/u5-assignment-calendar/functional-design/`、`nfr-requirements/`、`nfr-design/`、`infrastructure-design/`

## Assumptions & Open Questions

- [assumption] 速さ（3 秒以内）は、読み取りの回数と書き込みのまとまりの数から見て満たせると考えているが、ステージングの測定で確かめるまでは確定ではない
