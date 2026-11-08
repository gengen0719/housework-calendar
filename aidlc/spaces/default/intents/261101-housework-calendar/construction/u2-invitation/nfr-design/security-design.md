# 安全の設計（Security Design）— U2 招待

U2（`u2-invitation`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.14〜NFR4.26、NFR5.7）を、どう作るかを書きます。U1 の設計（`construction/u1-skeleton-family/nfr-design/security-design.md`）の認証の流れ・認可の仕組み・CloudFront の秘密のヘッダー・XSS への備えは、そのまま使います。

## 招待の印の作り方と確かめ方（NFR4.14〜NFR4.16、NFR4.24）

- 新しく `services/invitationTokenService.ts` を置き、印の作成と形の確かめだけを受け持つ
- 作成は `crypto.randomBytes(16).toString('base64url')`。結果は 22 文字ちょうど、`[A-Za-z0-9_-]` のみ
- 形の確かめは正規表現 `^[A-Za-z0-9_-]{22}$`。合わなければ DynamoDB を読まずに 409 `INVITATION_INVALID`
- 招待の ID（invitationId）は、印とは別に `crypto.randomUUID()` で作る（NFR4.15）
- ESLint の `no-restricted-properties` で `Math.random` を禁止する（裏側と画面の両方）

```ts
// 形だけを示す（実装はコード生成で）
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const newInvitationToken = (): string => randomBytes(16).toString('base64url');
export const isWellFormedToken = (t: string): boolean => TOKEN_PATTERN.test(t);
```

## 招待が使えるかの判断（NFR4.16、BR3.6）

`familyMemberService` の 1 つの関数 `resolveUsableInvitation(token, now)` で、次をこの順で確かめる。どれかに合わなければ、すべて同じ `INVITATION_INVALID` を返す（理由を分けない）。

1. 印の形（上の正規表現）
2. `Invitations` に印の記録がある（強い整合性の読み取り）
3. `status` が `active`
4. 家族（Families）の `currentInvitationToken` がこの印と同じ（作り直された印を断る）
5. `now < expiresAt`

参加（accept）は、このあとトランザクションの条件でもう一度同じことを確かめる（`reliability-design.md`）。

## 認可（NFR4.19〜NFR4.21）

| 操作 | 使う仕組み（U1） | 家族の決め方 |
|------|-----------------|-------------|
| `GET /v1/family/members` | requireAuth → requireMembership | セッションの利用者の familyId |
| `GET /v1/family/invitation` | requireAuth → requireAdmin | 同上 |
| `POST /v1/family/invitations` | requireAuth → requireAdmin | 同上 |
| `GET /v1/invitations/{token}` | requireAuth（ブロック中は 403 `NOT_FRIEND`）。家族のメンバーでなくてよい | 招待の記録の familyId だけ（NFR4.20） |
| `POST /v1/invitations/{token}/accept` | 同上 | 同上 |

- 本文やクエリに `familyId` が入っていても読まない。招待の操作の本文は受け取らない（空の本文だけを受け付ける）
- メンバーの一覧の応答は `{ userId, displayName, role }` だけを組み立てて返す。Users の記録をそのまま返さない（lineUserId を出さない）

## ログで印を伏せる（NFR4.26、NFR5.7）

- 画面用 API の振り分けを、いまの「完全に同じパス」の表から、パスの型（`/v1/invitations/:token`、`/v1/invitations/:token/accept`）で合わせる形に変える
- `entries/api.ts` の順番を「パスの型を決める → `REQUEST_START` を書く → 秘密のヘッダー → 認証 → 処理」に入れ替える。いまは型を決める前に `rawPath` を書いているので、それをやめる（レビュー R-05）
- 404 の経路と、思いがけない失敗（`REQUEST_ERROR`、`describeError`）の出力にも、パスや URL を入れない。単体テストで、印を含むパスで 404 と 500 を起こし、ログに印が出ないことを確かめる
- 要求のログ（`REQUEST_START`、`REQUEST_REJECTED`、`REQUEST_END`）の `path` には、`event.rawPath` ではなく、合った型（`route`）を書く。型に合わなかった要求は `path: 'unmatched'` とし、パスそのものは書かない
- 招待のできごとのログには、印の先頭 4 文字だけを `tokenPrefix` として書く（`observability-design.md`）
- 単体テストで、どのログの行にも 22 文字の印が含まれないことを確かめる

## 画面での印の扱い（NFR4.18、NFR4.23）

- 画面は起動したときに、LIFF の初期化のあと `URLSearchParams` で `invitation` を読む。形を確かめ、すぐに `history.replaceState` で URL から外す
- 印はコンポーネントの状態（メモリ）にだけ持つ。localStorage・sessionStorage・Cookie には書かない
- 家族の名前は React の文字として出す（`dangerouslySetInnerHTML` を使わない。U1 の NFR4.12）
- U1 の Referrer-Policy（`strict-origin-when-cross-origin`。CloudFront の応答ヘッダー）を変えない。shareTargetPicker のメッセージには、利用者に送るリンクだけを入れる

## 「LINE で送る」（NFR1.10、NFR1.11）

- `liff.isApiAvailable('shareTargetPicker')` が true なら `liff.shareTargetPicker([{ type: 'text', text }])`。false ならシェアの URL（`https://line.me/R/share?text=<encodeURIComponent(text)>`）を開く
- 送る文は C10 の文言（`INVITATION_SHARE_TEXT`）に、家族の名前・期限（日本時間）・リンクを入れて作る
- 送るのは管理者本人の LINE から。裏側から push は送らない

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 印の総当たり | 128 ビットの印、形の先行確認、同時実行数の上限 5（U1）、使えない印の数のメトリクス（`observability-design.md`） |
| ログや履歴からの漏れ | パスの型でログを書く、印の先頭 4 文字だけ、`history.replaceState` |
| 子供が招待を作る | requireAdmin。画面はボタンを出さない |
| 家族の指定のすり替え | 家族は招待の記録だけで決める。本文を受け取らない |
| 作り直しと参加の競合 | トランザクションの条件（`reliability-design.md`） |
| 転送されたリンクでの参加 | 受け入れる（24 時間、作り直し、参加前の確認、メンバーの一覧、参加のログ） |

## Sources

- `construction/u2-invitation/nfr-requirements/security-requirements.md`、`tech-stack-decisions.md`
- `construction/u2-invitation/functional-design/rules.md`、`functional-spec.md`
- `construction/u1-skeleton-family/nfr-design/security-design.md`
- `packages/backend/src/entries/api.ts`（いまの振り分けと要求のログ）
- `nfr-design-questions.md` の回答 [Q1]、[Q2]
- [LINE Developers: LIFF API リファレンス（liff.shareTargetPicker、liff.isApiAvailable）](https://developers.line.biz/ja/reference/liff/)

## Assumptions & Open Questions

- 送り直しの記録（RequestRecords）には、参加の `target` として印の SHA-256 だけを持ちます。招待を作る操作の `result`（前と同じ応答を返すための本文）にはリンクが入りますが、これは管理者本人への応答の写しで、24 時間で TTL により消えます。Invitations に取り出せる形で持つ理由（再表示）と同じ理由で受け入れます（レビュー R-06）
- テーブルの暗号化は U1 のとおり `AWS_MANAGED`（AWS 管理の KMS 鍵）です。NFR 要件の「AWS 所有の鍵」もこれに合わせて直しました（レビュー R-07）。鍵の月額の費用はかからず、KMS への要求は月 2 万回の無料枠の中に収まる見込みです。ステージングの請求で確かめます
- [assumption] LIFF の URL に付けたクエリは、LIFF の初期化のあと `location.search` で読めます。B2 でステージングで確かめます
