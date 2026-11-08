# U2 で足した契約の一覧

U2（`u2-invitation`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したものです。項目・操作・理由の印を足すのは契約の決まりで自由で、壊す変更はありません。`contract-summary.md` への反映を待つ一覧として、U1 の `docs/contract-changes-u1.md` に続けて残します。

## C1 画面用 API

| 操作                                  | 足したもの     | 中身                                                                                                                                                                                |
| ------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/family/members`              | 応答           | 200 `[{ "userId": string, "displayName": string, "role": "admin" \| "child" }]`。管理者が最初、子供が入った順（同じ時刻は表示名、それも同じなら userId）。403 `NOT_FAMILY_MEMBER`   |
| `GET /v1/family/invitation`           | 操作（新規）   | 管理者だけ。200 `{ "url": string, "expiresAt": string } \| null`、403 `ADMIN_ONLY`                                                                                                  |
| `POST /v1/family/invitations`         | ヘッダー・応答 | `Idempotency-Key`（必須、UUID）。201 `{ "url": string, "expiresAt": string }`、400 `IDEMPOTENCY_KEY_REQUIRED`、403 `ADMIN_ONLY`、422 `IDEMPOTENCY_KEY_REUSED`                       |
| `GET /v1/invitations/{token}`         | 操作（新規）   | 友だちなら家族に入っていなくてよい。200 `{ "familyName": string, "expiresAt": string }`、409 `INVITATION_INVALID`・`ALREADY_IN_OTHER_FAMILY`・`ALREADY_IN_FAMILY`                   |
| `POST /v1/invitations/{token}/accept` | ヘッダー・応答 | `Idempotency-Key`（必須、UUID）。200 参加した（`GET /v1/me` の `family` と同じ形）、400 `IDEMPOTENCY_KEY_REQUIRED`、409 に `ALREADY_IN_FAMILY` を足す、422 `IDEMPOTENCY_KEY_REUSED` |

- 印（`token`）は 22 文字の base64url。形の合わない印は、期限切れ・作り直し・存在しないのと区別せず、どれも 409 `INVITATION_INVALID`
- 要求のログの `path` はパスの型（`/v1/invitations/:token`）で書き、印の全体は出さない。型に合わないパスは 404 で `unmatched`

## C6 家族とメンバーの窓口

| 窓口                                                     | 中身                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `listMembers(ctx)`                                       | `Member[]` または `NOT_FAMILY_MEMBER`                                                                                |
| `getCurrentInvitation(ctx)`                              | `Invitation` / `null` / `ADMIN_ONLY`                                                                                 |
| `createInvitation(ctx, idempotencyKey)`                  | `Invitation` または `ADMIN_ONLY`。前の招待は使えなくなる（作り直し）                                                 |
| `previewInvitation(userId, token)`                       | `InvitationPreview` / `INVITATION_INVALID` / `ALREADY_IN_OTHER_FAMILY` / `ALREADY_IN_FAMILY`（家族を決める前に使う） |
| `acceptInvitation(userId, token, idempotencyKey)` の結果 | `ALREADY_IN_FAMILY` を足す。参加の書き込みは `TransactWriteItems`（子供にする・招待と家族の確かめ・結果の記録）      |

## C10 理由の印と文言

| 印または文言                 | 文言                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `IDEMPOTENCY_KEY_REUSED`     | 理由の印（同じ印で別の操作・対象の要求。422）                                                |
| `INVITATION_NOT_FRIEND_HINT` | 友だち登録したら、もう一度このリンクを開いてください（画面だけで使う文言。理由の印ではない） |
| `INVITATION_SHARE_TEXT`      | 招待の送り文句。家族の名前・期限・リンクが入る                                               |

## データと共有の型（決めごと）

- DynamoDB: `Invitations`（PK `token`、TTL `ttl`）、`Users` の GSI `familyId-index`（射影 `INCLUDE`: `displayName`、`role`、`familyJoinedAt`）。`Families` に `currentInvitationToken`、`currentInvitationId`、`Users` に `familyJoinedAt`、`RequestRecords` に `operation`、`target` の項目を足す（キーと設定は変えない）
- `packages/shared`: `Member`、`InvitationView { url, expiresAt }`、`InvitationPreview { familyName, expiresAt }`
- メトリクス: `Housework/<env>/InvitationInvalidCount`（`INVITATION_REJECTED` かつ `reason = INVITATION_INVALID` の数。U10 のアラームが読む）
