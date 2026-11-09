## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-08T23:39:08Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/code-generation/traceability.json > coverage の NFR7.20、NFR7.21、NFR7.22、NFR7.23、AC4.1.6、NFR1.19 | 速さ（20 回の測定）と最初の請求額は、code-summary.md 自身が「この段階では動かしていない」と書いているのに、traceability では status が `OK` で、target はコードの性質を見るテスト（例: useMonthCalendar.test.tsx、view-calendar.feature）を指している。測定そのものは行われていないので、`OK` だと読む人に測定済みと誤解される | status を、測定が済むまで未了とわかる値（例: `PARTIAL`）にするか、note に「ステージングで作り手が測るまでは確定ではない」と書く。ステージングの測定結果を Build and Test で記録する | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/code-generation/code-summary.md > 計画からずれたところ（作業の決まり） | エディタ用のツールでなくシェルの `python3`・`sed`・`mv` でファイルを書き換えた場面が 3 回あったと自己申告されている。結果は検査・テストで確かめ済みだが、書き換えの経路が記録に残らない | 今後は決まりどおりファイル用ツールで書き換える。今回は、検査・テストが通っていること（format:check、lint、tsc、npm test がすべて通過）を理由に、追加の作業は不要 | New |
| R-03 | Minor | packages/backend/src/handlers/calendar/saveAssignment.ts > 冒頭コメントと packages/backend/src/services/calendarService.ts > judgeRequest | 確かめの順番の表（NFR4.52）には「今月か来月か」の 422 `MONTH_NOT_EDITABLE` がなく、コードは「月の確定（409）」のあと「重なり（422）」の前に置いている。表と動きの食い違いを示すテストはあるが、設計の表の側に書かれていない | NFR4.52 の順番の表に `MONTH_NOT_EDITABLE` の位置を書き足す（または docs/contract-changes-u5.md に載せる）。コードの変更は不要 | New |
| R-04 | Minor | packages/backend/src/services/calendarService.ts > isChoreTypeAssigned と packages/backend/src/repositories/calendarRepository.ts > buildAssignmentPut | 行が 0 行の割り当てを保存すると `choreTypeIds` が消えるため、その種類の担当がすべて消えたあとは「使われていない」になり、U4 で消せる。BR6.10 の文面（その月の割り当ての行か担当にあれば true）とは合っているが、画面や契約の文書に「割り当てから外して担当が消えた種類は消せるようになる」と書かれていない | docs/contract-changes-u5.md か README に、この動き（意図したもの）を 1 行書く | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| `npm run format:check` | PASS（All matched files use Prettier code style） | 整形の問題なし |
| `npm run lint` | PASS（出力なし、終了コード 0） | 検査の問題なし。`eslint-disable` は AssignmentPage.tsx の 1 か所（理由付き）だけ |
| `npx tsc --noEmit`（shared、backend、frontend、infrastructure） | PASS（4 つとも出力なし） | 型の問題なし |
| `npm test` | PASS（終了コード 0）。行 97.14%、文 95.74%、分岐 91.44%、関数 96.79% | 80% の下限を上回る。code-summary.md の数字と一致 |
| traceability.json の target の実在確認（node で読み取り） | 全 target が実在し、upstream_ids の取りこぼしなし | 意味の合い方は上の Minor（速さの `OK`）を除き妥当 |
| 秘密・UUID の直書きの検索（`packages/**/test/**`） | UUID の形は 3 つの fakeSecrets.ts にだけあり、すべて `// gitleaks:allow` 付き。U5 のテスト本体には直書きなし | 決まりを守っている（gitleaks 自体はこのマシンになく未実行） |
| `dangerouslySetInnerHTML` / `innerHTML` / `eval(` の検索（packages/frontend/src） | 0 件 | XSS の経路なし |

確かめた中身（読んだコードに対して）:

- **PATCH:** 担当の Update は `#status = :todo AND #version = :v AND #dutyId = :id` と月の確かめ（確定していない）が 2 項目の取引に入っている。断られたら `findDuty`（`DID#` → 担当 → 月の状態、強い整合性の GetItem 3 回）で読み直し、404／409 を決め、1 回だけやり直す。確かめの順番は 担当 404 → 本文 422 → 子供 404（`Users` の強い整合性 GetItem）→ 409 の順で NFR4.52 と一致。`dutyId` は小文字 UUID だけで、違えば DynamoDB を読まずに 404。
- **PUT のチャンク:** 消すは `status/version/dutyId` 条件と `DID#` の `attribute_exists`、作るは `attribute_not_exists`、変えるは同じ条件の Update。1 チャンクは書く項目＋月の確かめ 1＋種類の確かめ（作る・変えるに出る種類だけ）で 100 項目以内（`splitIntoChunks`、テストで 500 件でも確認）。同じ項目が 2 回出ることはない（担当ごとに 1 つ、確かめは月と種類ごとに 1 つ）。割り当ては最後に別の取引（最大 92 項目）で書き、月と種類の ConditionCheck を持つ。fakeDynamo は 100 項目超・同じ項目 2 回・条件式を本当に評価する。
- **changesHash と部分集合:** SHA-256 を `[familyId, month, rows]` から作り、並べ替えで入力の順番に左右されない。形の誤りは zod で 422、合わなければ 409 と新しい一覧。やり直しでは、最初に確かめた一覧の部分集合のときだけ通す（`version` を含む比べ）ので、間に別の書き込みが入れば 409 に戻る。
- **isChoreTypeAssigned:** `Scan` なし、索引なし、強い整合性の Query（`begins_with(sk, 'M#')`＋Filter）で、`DID#` は数えない。1 件当たれば続きを読まない。`entries/api.ts` の composition root で `setCalendarPort` に取り付け、`choreTypeService` は `calendarService` を import しない（輪なし）。
- **IAM:** `Calendar` への許可は GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem の 6 つだけで api のロールのみ。`ChoreTypes` に ConditionCheckItem を追加。line には `Calendar` の許可なし。Scan・Batch 系なし。
- **認可・入力:** 他家族の `dutyId` はキーが `ctx.familyId` の下になく 404。PUT／PATCH は `requireAdmin`、GET はメンバー全員。本文は 64 KB（Base64 は戻してから数える）で 413、知らない項目は zod が捨てる。ログは `redact` が秘密・名前・本文のキーを伏せ、種類名や表示名を型で禁止している。

### Summary

計画の 31 ステップはすべてコードとテストになっており、書き込みの条件、チャンクの 100 項目の上限、割り当てを最後に書く順、changesHash と部分集合の規則、強い整合性の読み取り、最小権限の IAM、他家族の 404 は、設計と一致していて、確認コマンドもすべて通りました。Critical・Major はなく、指摘は traceability の `OK` が測定未了を隠している点など、Minor 4 件です。
