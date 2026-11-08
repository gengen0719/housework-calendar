## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 確かめたこと

- `npx vitest run u2-invitation` を実行し、17 ファイル・398 件がすべて通ることを確かめました。
- 作り直し（rotate）と参加（accept）の取引は、設計（reliability-design.md の 4・5 と「参加」）と項目の数・順番・条件式が一致しています。
  - `CancellationReasons` の読み分けは、並び順を `kinds` 配列で持ち、送り直しの記録 → 利用者 → 招待・家族の優先で判断しています。設計どおりです。
  - TTL で前の招待が消えていた場合は、3 件に組み立て直してやり直します（R-02 の設計）。
- 冪等性は、同じ印の記録を先に読み、`operation` と `target` が違えば 422 にします。参加の `target` は SHA-256 で、印そのものは RequestRecords に入りません。
  - 招待を作る操作の `result` にはリンク（印）が入ります。security-design.md の Assumptions で受け入れ済みで、24 時間の TTL があります。
- 印の扱い:
  - ログには `route`（パスの型）と `tokenPrefix`（先頭 4 文字）だけが出ます。
  - `LogData` の型で `token` は受け付けず、キー名による伏せ字もあります。
  - フロントは印をメモリ（state）にだけ持ち、`replaceState` で URL から外します。ストレージへの書き込みは見つかりませんでした。
- 認可と家族の範囲:
  - 家族と役割は `requireAuth` が利用者の記録から取ります。URL や本文からは決めません。
  - 招待の作成と現在の招待の取得は `requireAdmin` を通ります。
  - `listMembers` は `ctx.familyId` だけで索引を引き、LINE のユーザー ID は射影にも結果にも含まれません。
  - 参加で入る家族は、招待の記録からだけ決まります。
- IAM は、コードが使う操作とちょうど合っています。
  - Families: Get / Put / Update / ConditionCheck
  - Invitations: Get / Put / Update / ConditionCheck
  - RequestRecords: Get / Put
  - Users の `familyId-index`: Query
  - 余分な Delete や `*` はありません。Users に ConditionCheck を付けない判断も、コードと一致しています。
- DynamoDB の予約語（`token`、`status`、`role`）は別名で扱われています。`ttl` は式に使われていません。
- テストの偽の DynamoDB（fakeDynamo）は、条件式を本当に評価し、1 つでも外れれば何も書きません。競合は `beforeNextTransaction` で再現しています。通るだけのテストではありません。

Critical と Major はなく、Minor のみです。

### 指摘

1. **R-01 / Minor** — `packages/backend/src/repositories/familyRepository.ts` の `classifyAcceptCancellation` と `acceptInvitation`（約 L196〜L240）
   - 参加の取引が `TransactionConflict` や `ThrottlingError` で断られると、`undefined` になって例外を投げ直し、500 になります。
   - きょうだいが同じ招待を同時に開くと、Invitations と Families の ConditionCheck の項目を共有します。そのため、取引同士の競合は起こり得ます。
   - 作り直しは `stale` として 1 回やり直しますが、参加にはそれがありません。画面は 500 を再試行できる失敗として扱い、同じ識別子で送り直すので、利用者は困りません。ただし運用では原因が見えません。
   - 直し方: 理由が `TransactionConflict` だけのときは、参加も 1 回だけやり直すか、競合を表す結果を返します。いずれにしても `CancellationReasons` の Code を `warn` ログに出します（印は出しません）。

2. **R-02 / Minor** — `familyRepository.ts` の `classifyCancellation`（約 L123〜L131）
   - `None` 以外の Code はすべて `stale` になります。`ValidationError` のような作りの誤りも、競合として 1 回やり直され、最後は `INTERNAL` になります。
   - 取り消しの理由はどこにも記録されません。ステージングで式が拒否されても、原因をログから追えません。
   - 直し方: `ConditionalCheckFailed` と `TransactionConflict` だけを `stale` にします。ほかの Code は例外として投げ直すか、少なくとも Code をログに出します。

3. **R-03 / Minor** — `packages/backend/src/middleware/requireAuth.ts` と `userRepository.findById`（`getUserStatus`）
   - 家族と役割を読む `GetItem` が、結果整合のままです。
   - 参加や家族作成の直後に、古い値（`familyId` なし）を読むと、`GET /v1/family/members` が 403 `NOT_FAMILY_MEMBER` になることがあります。
   - `MemberList` は失敗を「やり直す」に出すだけなので、実害は小さいです。
   - 直し方: `requireAuth` の読み取りを `consistent: true` にします。読み取りの費用は 1 件分のままです。または、参加直後の最初の呼び出しだけ強い整合性にします。

4. **R-04 / Minor** — `packages/frontend/src/pages/InvitationPage.tsx` の `rejected` 表示（約 L103〜L116）
   - 「カレンダーへ」は `ALREADY_IN_FAMILY` のときだけです。
   - `INVITATION_INVALID` と `ALREADY_IN_OTHER_FAMILY` では行き先がありません。まだ家族に入っていない人は、アプリを閉じて開き直さないと家族作成の画面に進めません。
   - 機能設計は文言の表示だけを求めているので、仕様どおりではあります。
   - 直し方: 理由を問わず戻るボタンを出し、`onGoToCalendar`（`closeInvitation`）に繋ぎます。ボタンの文言は、家族がなければ「はじめの画面へ」、あれば「カレンダーへ」にします。

5. **R-05 / Minor** — `packages/backend/test/u1-skeleton-family/helpers/fakeDynamo.ts` の `conditionHolds`
   - 偽物は式の一部（AND の連結、比較、`attribute_(not_)exists`）しか解釈しません。そのため、実際の DynamoDB の予約語・式の文法エラー・`TransactionConflict` は、テストでは見つかりません。
   - 今回、予約語は目視で確かめ、問題はありませんでした。ただし、これを守るテストがありません。
   - 直し方: 式で使う属性名が予約語に当たらないかを調べる小さなテストを足します。または、ステージングの確かめの手順に、参加・作り直しの 1 往復を明記します。

6. **R-06 / Minor** — `packages/backend/src/services/familyMemberService.ts` の `acceptInvitation`（'user' で断られた分岐、約 L395〜L410）
   - 読み直しても拒否の理由が見つからないときは、`throw new Error` で 500 になります。理由は設計どおりの想定外の失敗ですが、そのとき `userId` や Code が構造化ログに残りません。
   - 直し方: 投げる前に `logger.warn` で `event`、`userId`、`familyId` を書きます。印は先頭 4 文字だけにします。

### 要約

作り直しと参加の取引、CancellationReasons の読み分け、冪等性、印の扱い、認可、IAM は、設計とコードが一致しています。テストは条件を評価する偽物の上で競合を再現しており、通るだけのものではありません。残りは運用上の見えにくさ（R-01、R-02、R-06）、整合性（R-03）、画面の行き止まり（R-04）、テストの死角（R-05）で、どれもリリースを止めるものではありません。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
