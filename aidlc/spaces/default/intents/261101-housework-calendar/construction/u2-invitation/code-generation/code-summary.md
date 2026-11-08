# コードのまとめ（Code Summary）— U2 招待

承認された計画（`code-generation-plan.md`、23 ステップ）をすべて作りました。管理者が招待用のリンクを作って LINE で送り、子供がそのリンクを開いて家族の名前を確かめてから、子供として家族に入れます。「家族の設定」の画面でメンバーの一覧が見られます。

## 作ったファイル

| 場所 | 中身 |
|------|------|
| `packages/shared/src/` | 理由の印 `IDEMPOTENCY_KEY_REUSED`、文言 `INVITATION_NOT_FRIEND_HINT`・`INVITATION_SHARE_TEXT`、型 `Member`・`InvitationView`・`InvitationPreview` |
| `packages/backend/src/lib/router.ts`、`entries/api.ts` | パスの型（`:token`）での振り分け。ログの `path` はパスの型で、印は出ない |
| `packages/backend/src/services/invitationTokenService.ts` | 印（`crypto.randomBytes(16)` の Base64URL、22 文字）、形の確かめ、印の SHA-256 |
| `packages/backend/src/services/familyMemberService.ts` | `listMembers`、`createInvitation`、`getCurrentInvitation`、`resolveUsableInvitation`、`previewInvitation`、`acceptInvitation` |
| `packages/backend/src/repositories/` | `invitationRepository.ts`（新規）、作り直しと参加のトランザクション（`familyRepository.ts`）、`familyId-index` の Query（`userRepository.ts`）、送り直しの記録の `operation`・`target`（`requestRecordRepository.ts`） |
| `packages/backend/src/handlers/` | `family/listMembers.ts`、`invitation/{create,getCurrent,preview,accept}.ts` |
| `packages/frontend/src/` | `pages/FamilySettingsPage.tsx`、`pages/InvitationPage.tsx`、`invitation/readInvitationParam.ts`、`invitation/formatExpiry.ts`、`liff/share.ts`、`App.tsx` などの変更 |
| `infrastructure/lib/` | `Invitations` テーブル、`Users` の `familyId-index`、`api` のロールの許可、メトリクスフィルタ `InvitationInvalidCount` |
| `scripts/smoke-check.sh` | セッションなしで U2 の 5 つの操作が 401 になる確かめ |
| `README.md`、`docs/contract-changes-u2.md` | shareTargetPicker の設定、週 1 回のメトリクスの見方、濫用されたときの止め方、ログインしての確かめの手順。U2 で足した契約の一覧 |

## テスト

| 確かめ | 結果 |
|--------|------|
| `npx vitest run u2-invitation` | 17 ファイル、398 件が通過 |
| `npm test`（U1 を含むすべて。レビューの直しのあと） | 41 ファイル、791 件が通過。行カバレッジ 97.64% |
| `npm run format:check`、`npm run lint`、`tsc --noEmit`（shared、backend、frontend、infrastructure） | すべて通過 |
| `npx cdk synth` | AWS の認証情報なしで合成できた（反映はしていない） |

筋書きは 6 つです（`routing-logs`、`members`、`create-invitation`、`accept-invitation`、画面の `screens`、共有パッケージの単体テスト）。NFR 設計で挙げた競合（同時の作り直し、開いたあとの作り直し・期限切れ、TTL 後の作り直し、送り直し、同時の参加）も筋書きに入っています。AWS・LINE・LIFF は差し替えで動かし、本物にはつないでいません。

## 書いたが、この段階では動かしていない確かめ

| 確かめ | 理由 |
|--------|------|
| LIFF の URL に `?invitation=` を付けて開いたときに印が読めるか | 実機の LINE が必要。ステージングで作り手が確かめる |
| shareTargetPicker で送れるか | LIFF アプリの設定と実機が必要 |
| 画面 3 秒の速さ（NFR7.7〜NFR7.10） | ステージングで測る |

## 計画からずれたところ

- **`INVITATIONS_TABLE` の置き場所:** `lib/config.ts` ではなく、U1 のテーブル名の環境変数と同じ `lib/dynamoClient.ts` に置きました
- **Users の `ConditionCheckItem` の許可:** インフラ設計の表にはありましたが、コードで Users に ConditionCheck を使っていないため、付けていません（使う操作だけを許可）
- **印を URL から外すタイミング:** ID トークンが取れた直後にしました。外のブラウザで LINE ログインに移ると今の URL に戻るため、先に外すと印が消えてしまうからです。LINE アプリの中では、実質すぐに外れます
- **作り直しの確認:** ダイアログではなく、画面の中に確認の文と「作り直す」「やめる」を出す形にしました
- **`createFamily` の送り直し:** 同じ `Idempotency-Key` で別の操作の記録があれば 422 `IDEMPOTENCY_KEY_REUSED` を返すようになりました。U1 のテストはそのまま通っています
- **作業の決まり:** 開発担当がファイルの書き換えに 2 回シェル（python と `node -e`）を使いました。内容は確かめ、整形・検査・テストも通っています

## レビューを受けて直したこと（review-01、すべて Minor）

- R-01: 参加の取引が `TransactionConflict` だけで断られたら 1 回やり直す。取り消しの Code を warn に残す（印は先頭 4 文字だけ）
- R-02: 作り直しで「競合」と見なすのは `ConditionalCheckFailed` と `TransactionConflict` だけ。ほかの Code は投げ直し、warn に残す
- R-03: 認証のときの利用者の読み取りを強い整合性にした（参加の直後に 403 にならない）
- R-04: 招待の画面で断られたとき、理由にかかわらず戻るボタンを出す（家族があれば「カレンダーへ」、なければ「はじめの画面へ」）
- R-06: 参加で理由が分からず失敗するとき、warn に利用者と家族を残す
- R-05（偽の DynamoDB の死角）は、ステージングでの手の確かめ（README のログインしての確かめ）で補う。あわせて、既存のテストで `TransactionCanceledException` の import が抜けていて、通るだけになっていた箇所を直した

## 残っていること

- 反映の前に、ステージングと本番の LIFF アプリで shareTargetPicker を有効にする（README）
- `contract-summary.md` への反映は、U1 と同じく `docs/contract-changes-u2.md` の一覧として待たせています

## Sources

- `code-generation-plan.md`、`unit-test-instructions.md`
- `construction/u2-invitation/functional-design/`、`nfr-design/`、`infrastructure-design/`

## Assumptions & Open Questions

- [assumption] LIFF のクエリは `liff.init` のあとに読めます（ステージングで確かめる）
