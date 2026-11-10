## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | packages/backend/src/repositories/swapRepository.ts > buildCloseUpdate（掃除の条件式） | 掃除の条件は「項目があって status が open」だけで、offerId も dutyVersion も見ていません。担当の子供が変わった直後に、書き込みのあと・フックが走る前の短い間に新しい持ち主が申し出し直すと、遅れて届いた古いイベントのフックが、できたばかりの有効な申し出を cancelled にし得ます。結果は引き受け側に「この申し出はもうありません」と出るだけで、担当や金額は壊れず、申し出し直せば直ります。BR9.11 の文面どおりの動きなので設計との食い違いではありません。 | 許容する残る危険として docs/contract-changes-u8.md の「許容した残る危険」に 1 行足してください。直す場合は、フックのイベントに担当の version を足して、掃除の条件に dutyVersion を加える形にします。 | New |
| R-02 | Minor | packages/backend/src/services/swapService.ts > loadChoreTypes（catch の中） | 種類の一覧が読めないとき、名前を「お手伝い」に言い換え、並び順も種類の順でなく担当の ID の順に落ちますが、ログが 1 行も出ません。返事を止めない点は BR9.14 のとおりです。しかし、種類の読み取りが続けて失敗しても CloudWatch で検索できず、NFR2.66（失敗を event と reason で検索できる）の趣旨から外れます。 | catch の中で、familyId だけを付けた warn のログを 1 件残してください（名前・単価・ID 以外は書かない）。テストも 1 件足してください。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/code-generation/source-manifest.json > writes（73 件）と reviewed-source-f90d3300654c.tsv（69 行） | U8 が packages/backend/src/repositories/calendarRepository.ts の CHECK_DUTY_UNCHANGED・dutyUnchangedValues・DUTY_UNCHANGED_NAMES を export に変えています（swapRepository が使っています）。しかし、このファイルも calendarService.ts も manifest にも reviewed-source にもありません。作業ツリーでは U7 の未コミットの変更と混ざって見えるため、U8 のレビューの対象と版の記録から外れています。 | export に変えた箇所を U8 の変更として manifest に足し、reviewed-source を取り直してください。U7 の未コミットの変更とは別のコミットに分けると、あとで追えます。 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u8-swap/code-generation/traceability.json > NFR8.15、NFR7.44、NFR5.14、NFR2.55 の status | 注記では未確認・一部だけと書いてあるのに status が OK のものがあります。NFR8.15 は高さ 44 ピクセルが未確認、NFR7.44 は二度処理しない記録を含む読み取り回数の上限を数えていない、NFR5.14 は gitleaks が未実行、NFR2.55 は本物の並行ではなく差し込みで再現しています。status だけ読む人は、確かめ済みと受け取ります。 | 該当する行の status を Deferred か Partial に直し、手での確かめの番号を target に添えてください。 | New |
| R-05 | Minor | docs/manual-check-u8.md、.gitleaks.toml、.github/workflows/ci.yml（gitleaks の実行） | この環境に gitleaks がなく、`npm run secrets:scan` は実行されていません。リポジトリは公開です。私が U8 のソース・テスト・文書に、AWS の鍵・JWT・長い 16 進数・秘密鍵の見出し・Bearer の形を検索したところ、該当はありませんでした。テストの作り物の値には gitleaks:allow が付いています。ただし、gitleaks 本体での確認は済んでいません。 | プルリクエストを出す前に、手元か CI で gitleaks を実行し、結果を残してください。CI の gitleaks が失敗したら main に取り込まないでください。 | New |
| R-06 | Minor | packages/backend/test/u8-swap/*.feature（109 場面。計画は約 156 場面） | 計画との差は swap-accept 10／18、swap-line 11／22、swap-offer-withdraw 14／20、swap-cleanup 9／14、swap-list 9／12、swap-line-resilience 7／14、swap-transaction 14／16 です。code-summary.md は正直に書いています。私は BR9.1〜BR9.19 の各項目に対応するテストがあることを、コードと場面名で確かめました。足りない箇所は、単体テスト 5 本（listSwappableDuties・offerSwap・acceptSwap・withdrawSwap・swapJstBoundary）が受け持っています。u8-swap のテストは 31 ファイル 568 件が通ります。この差は、リリースを止める理由にはなりません。 | 追加は必須ではありません。承認の記録に「場面は 109、足りない分は単体テストで受け持った」と書いてください。余力があれば、swap-line の「ルームは何もしない」と「1 対 1 のボタンの値は何もしない」を場面にしてください。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npx vitest run u8-swap` | PASS: 31 ファイル、568 件 | 実際に通りました。CDK の合成（Bundling）を含みます。code-summary の 26 ファイル・530 件は書いた時点の数で、いまはそれより増えています。 |
| `npx tsc --noEmit -p packages/backend` | PASS（出力なし） | 型の誤りはありません。 |
| `npx eslint`（swapService・swapRepository・swapHandler・swapCommand） | PASS（出力なし） | 検査に引っかかりません。 |
| `npx prettier --check packages/backend/src packages/shared/src` | PASS | 整形のずれはありません。 |
| gitleaks | 未実行（コマンドがない） | 代わりに、パターン検索で U8 のファイルに本物らしい値がないことだけ確かめました。上の Minor を参照してください。 |
| 手での確かめ 14 件、速さ（3 秒）、300 件の確定、スモークチェック | 未実行 | traceability では Deferred と明記されています。ステージングでの確かめまで残ります。 |

**コードを読んで確かめたこと**

- 「家事交代」の完全一致: swapCommand.ts の parseSwapMessage は、text で 5000 文字以内、`text.trim() === '家事交代'` のときだけ受け付けます。「代わって」「かわって」「家事交代して」「家事 交代」、零幅の空白をはさんだものは、テストで拒否されています。entries/line.ts の accepts が、二度処理しない記録を書く前に打ち切ります。
- ボタンの値: swap.offer・swap.accept・swap.withdraw は、生の文字列に対する正規表現 3 つで厳密に読みます。group の source、replyToken、300 文字以内の条件つきです。最長は約 107 文字です。dutyId と offerId は randomUUID なので、小文字の UUID の形に合います。
- 家族の決め方: ボタンの値からは決めません。runGroupOperation が、グループの登録から家族を決め、利用者を 1 回だけ読んで ctx と表示名を渡します。担当の検索 findDuty は familyId で絞られるので、ほかの家族の担当は NOT_FOUND です。
- SWAP# の項目の書き込み: swapRepository.ts は UpdateCommand と TransactWriteCommand だけを使います。ソース全体を検索すると、PutCommand・DeleteCommand は swap のコードにありません（ほかの既存のファイルにあるだけ）。属性名はすべて # の別名です。getOffer は強い整合性の GetItem です。
- 引き受けの取引は 3 項目です（担当の Update、申し出の Update、月の ConditionCheck）。担当の条件は status=todo・version=dutyVersion・dutyId・childUserId=申し出た子供です。申し出の条件は status=open と offerId です。取引の項目はどれも別の項目で、同じ項目を 2 回書きません。ChoreTypes は含みません。
- 引き受けはフックを呼びません。swapService.acceptSwap には notifyDutyReassigned も notifyDutyRecorded の呼び出しもありません。entries のほかに、これらを呼ぶのは calendarService と recordingService だけです。
- フックの登録: entries/api.ts は `registerSwapHooks({ reassigned: true, recorded: true })`、entries/line.ts は `{ reassigned: false, recorded: true }` を、モジュールの読み込み時に呼びます。二重登録は `registered` の印で防いでいます。記録の通知は recordingService が api と line の両方の経路から呼びます。
- 有効さの判定: isOfferValid は読んだ値だけで (a)〜(e) を判定し、項目を書き換えません。フックが失敗・遅延・未登録でも正しさは保たれます。
- 判定の順は functional-spec の表（OFFER_GONE → 本人・管理者 → 引き受け済み → 取引）と一致します。管理者の担当選択・取り下げは OFFER_OWNER_ONLY、引き受けは CANNOT_ACCEPT_OWN_OFFER です。管理者の「家事交代」は、担当も申し出も読まずに案内だけを返します。
- 0 円: 返事は reply だけです。swap のソースに push・multicast・broadcast・getProfile の呼び出しはありません（コメントに言葉があるだけ）。infrastructure/lib の変更はなく、line の Calendar への許可は GetItem・Query・UpdateItem・ConditionCheckItem のままで、PutItem・DeleteItem は足されていません。新しいテーブルも索引もありません。
- 秘密: swap のソースにも、テストの作り物の値以外にもありません。ログに残るのは familyId・dutyId・offerId・op・reason・durationMs だけで、名前・LINE の ID・金額は書かれません。GROUP_COMMAND_REJECTED から groupId は外されています。
- 競合: 書き込みが断られたら読み直して 1 回だけやり直し、2 回続けば INTERNAL（何も書かれない）。想定外のエラー（ThrottlingError など）は投げ直されます。LINE の再送のとき、reply の失敗は握りつぶして警告にするので、書いた結果は重ねて書かれません。

### Summary

Critical と Major の指摘はありません。BR9.1〜BR9.19、3 項目の引き受けの取引、SWAP# の UpdateItem と取引だけの書き込み、引き受けがフックを呼ばないこと、api と line の両方でのフックの登録、0 円（reply だけ）を、要約ではなくコードで確かめました。指摘は Minor 6 件です。遅れたフックが新しい申し出を cancelled にし得る小さな窓、種類の読み取り失敗が無音であること、manifest から calendarRepository.ts が漏れていること、traceability の status の甘さ、gitleaks が未実行であること、場面数の差です。場面数の差（109／約 156）は、BR ごとの網羅と単体テスト 568 件で補われており、リリースを止める理由ではありません。ただし、PR の前に gitleaks の実行と、ステージングでの手での確かめ 14 件が残っています。
