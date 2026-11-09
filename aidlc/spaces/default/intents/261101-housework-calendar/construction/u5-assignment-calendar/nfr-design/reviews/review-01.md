## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-08T14:20:27Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/reliability-design.md > 「チャンクに分ける」の表（消す・子供を変えるの条件）と「競合と断られ方」 | PATCH には `dutyId` の条件を足したが、保存（PUT）のチャンクの「消す」「子供を変える」の条件は `status = todo AND version = :読んだ version` のままで `dutyId` を含まない。`logical-components.md` の「担当を変えるときは `dutyId` と `version` を条件にする」という約束と、U5 自身の書き方が食い違う。2 つ以上の保存が重なり、読んだあとに担当が消されて同じ日・同じ種類に作り直される（キーは同じで `version = 1`）と、別の担当を変える・消すことがありうる。消す側は引き当て `DID#<古い dutyId>` を条件なしで消すため、新しい担当の引き当てが残り、その担当を PATCH や記録が探せなくなる。あわせて「同時の保存ではあとから保存したほうが残る」は正確ではなく、チャンクが交互に書かれて新旧が混ざったまま、割り当てだけがあとの内容になりうる（次の保存で収まる） | チャンクの「消す」「子供を変える」の条件にも `dutyId = :読んだ dutyId` を加え、`logical-components.md` の約束と同じにする。引き当ての Delete には `attribute_exists(sk)` など、担当の Delete と一緒に成否が決まる条件を付ける。「あとから保存したほうが残る」を「担当が混ざることがあり、次の保存で収まる」に直す | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/reliability-design.md > 「割り当ての保存の全体の流れ」手順 2、「読み取りの整合性」の範囲の外 | 応答の `children`（子供の表示名）を、結果整合の `familyId-index` で読む C6 のメンバー一覧だけで作るとしている。一方で、子供の確かめは強い整合性の GetItem にして、参加した直後の子供も割り当てられるようにした。この組み合わせでは、参加直後の子供を割り当てた保存の応答（と直後の読み直し）で、その子供が `children` に出ず、名前が空になるか、表示が欠ける恐れがある | 子供ごとの `Users` の GetItem の結果（`displayName` を含む）を、`children` を作るときにメンバー一覧へ足す、と書く。担当にいる `childUserId` が `children` に必ず含まれることを筋書きに足す | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/performance-design.md > 時間の配分の「日ごとの担当の変更」、aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/scalability-design.md > 読み方の `PATCH /duties/{dutyId}` と読み書きの量の見込み | PATCH の読み取りを「GetItem 2 回」（`DID#` と担当）と数えているが、`reliability-design.md` の手順 3 は書く前に月が確定しているかを判断する（409 `MONTH_CONFIRMED` を 409 `DUTY_NOT_TODO` より先に返すため）。そのためには `M#<month>#S` の GetItem がもう 1 回いる。同じ子供へ変える場合は書き込みがなく、月の確かめも読み取りだけになる | 読み取りを 3 回に直す。または、確定の判断を書き込みの ConditionCheck と断られたあとの読み直しだけにする場合は、同じ子供のときの確定月の応答（200 か 409 か）を決めて書く | New |
| R-04 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/security-design.md > 「書き込みの条件で守る」の表、reliability-design.md > 「チャンクに分ける」「日ごとの担当の変更」手順 5 | 条件式で名前の置き換えが必要と書いているのは `status` だけ。式に出る `active`、`confirmed`、`version`、`dutyId` も、予約語に当たる可能性がある（U4 のコードは `#active` を使っている）。書き忘れると、実行時に `ValidationException` になり、保存が 500 になる（`ValidationError` は投げ直す扱い） | 「式の属性名は、すべて `ExpressionAttributeNames` で置き換える」という決まりを 1 行で書き、コード生成の確かめ（単体テスト）に入れる | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/scalability-design.md > 「読み書きの量の見込み」の表の直後 | 表の外に、行 `\| 種類を消す前の確かめ \| Query（まれ） \|` だけが残っている。段落のあとなので表として描かれず、壊れた 1 行の文字になる | この行を表の中に戻すか、`isChoreTypeAssigned` の説明として文章に直す | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u5-assignment-calendar/nfr-design/scalability-design.md > テーブルの形（1 年の保存量）と「読み方」の `isChoreTypeAssigned` の費用 | 1 年の担当は約 1500 件で、担当 1 件を 0.4 KB とすると約 0.6 MB になるが、文書は「約 0.5 MB」と「約 0.4 MB」を使っている。強い整合性の読み取りは 4 KB で 1 ユニットなので約 150 ユニットで、「約 100」は小さい。費用の結論（月 1 円未満）は変わらない | 数字を 0.6 MB、約 150 読み取りユニットにそろえる | New |

### Validation Tool Results

| Tool | Result | Interpretation |
| --- | --- | --- |
| 15 行を超えるコードブロックの検査（awk で全 7 ファイルの囲みを数えた） | 超えたのは `logical-components.md` のファイル木 1 つだけ（27 行） | ファイル木は対象外。コードは最大でも 15 行（`reliability-design.md` の `DutyReassignedEvent` が 15 行、`security-design.md` の zod が 14 行）。PASS |
| traceability.json の上流 ID との突き合わせ（`nfr-requirements/*.md` の NFRx.y を grep） | 33 件すべてが `upstream_ids` と `coverage` に載り、すべて OK | NFR1.19〜22、NFR2.28〜32、NFR3.6、NFR4.42〜52、NFR6.6、NFR7.20〜24、NFR8.9、NFR8.10、NFR9.5、NFR11.4 に欠けと余りがない。PASS |
| 既存コードとの突き合わせ（`infrastructure/lib/app-stack.ts`、`choreTypeRepository.ts`、`familyMemberService.ts`） | `api` のロールは `Users` の GetItem を 122〜126 行目で持つ。`ChoreTypes` の項目は `familyId` と `sk = TYPE#<choreTypeId>`。利用者・種類の ID は `randomUUID()` | `Users` の許可は追加不要、`ChoreTypes` の `ConditionCheckItem` だけが追加で必要、という記述は正しい。小文字の UUID の前提も合う。PASS |
| エンジンの検証ツール | 依頼の指示により実行していない | 上の結果は、手作業の読み取りと grep・awk によるもの |

確かめた内容（数字と順番）:

- **PATCH の条件**: `status = todo AND version AND dutyId` と月の ConditionCheck の 2 項目。読み直しの評価順（404、409 `MONTH_CONFIRMED`、409 `DUTY_NOT_TODO`、`version` だけなら 1 回やり直し）は、`security-design.md`、`reliability-design.md`、NFR2.30 で一致している。U8 の引き受けと「消して作り直し」の差し替えが、筋書きに入っている。
- **PUT の確かめ順**: 全行の種類の 404、全行の種類の 422、全行の子供の 404、月の確定 409、今月か来月かの 422、重なり 422、上書きの 409 が、`security-design.md`、`reliability-design.md` の手順 3〜6、NFR4.52 で一致している。
- **チャンクの数字**: 4 種類 124 件は、確かめ 5、1 チャンク 47 件（99 項目）、47・47・30 件の 3 チャンク（99、99、65 項目）、割り当て 6 項目で、トランザクションは 4 回。項目は 248 + 15 + 6 = 269。×2 で約 540 書き込みユニット。10 種類約 310 件は、確かめ 11、1 チャンク 44 件、8 チャンク + 1 回で 9 回。3 文書とも一致し、計算も正しい。費用は 1100 書き込みユニット × 0.71 ドル + 7000 読み取りユニット × 0.14 ドル ≒ 0.002 ドルで、約 0.3 円。
- **100 項目の上限**: 割り当ての書き込みは最大 1 + 1 + 90 = 92 項目。チャンクは、項目と確かめを合わせて 100 を超えない分け方で、確かめが 90 種類でも 1 件ずつなら収まり、止まらない。同じトランザクションで同じ項目を 2 回触る組み合わせは見つからなかった（月の状態は 1 回、種類は種類ごとに 1 回、担当と `DID#` は別のキー）。
- **ID と本文**: `dutyId` は小文字限定、`childUserId` と `choreTypeId` は小文字の UUID、zod は余分な項目を捨てる（`strip`）。NFR4.46〜4.48 と一致している。
- **子供の確かめ**: `Users` の強い整合性の GetItem（`familyId` と `role`）で、索引は確かめに使っていない。
- **内部のやり直しの `changesHash`**: 部分集合の規則は、5 つの値（日付、種類、前の子供、後の子供、`version`）が同じ行だけを許す。別の人が変えた行や、新しく増えた行は 409 になる。最初の一覧が空なら、やり直しも空のときだけ続行する。安全な作りと読めた。

### Summary

Critical と Major の指摘はなく、READY です。前回の下書きで直された点（PATCH の `version` と `dutyId`、コードの行数、部分集合の規則、PUT の確かめ順、チャンク・項目・費用の数字、種類 90 の上限、子供の強い整合性の確かめ）は、文書の間で一致していて、DynamoDB の制約にも当たりません。残りは Minor です。要点は、保存のチャンクの条件にも `dutyId` を足すこと、参加直後の子供の表示名を `Users` の GetItem から補うこと、PATCH の読み取り回数と予約語の置き換えの決まりを直すこと、数字と表の細かい直しです。
