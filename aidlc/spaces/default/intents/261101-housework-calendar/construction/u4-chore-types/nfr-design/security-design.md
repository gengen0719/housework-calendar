# 安全の設計（Security Design）— U4 お手伝いの種類

U4（`u4-chore-types`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.34〜NFR4.41）を、どう作るかを書きます。U1〜U3 の設計（認証、`requireMembership`、`requireAdmin`、パスの型の振り分けとログ、送り直しの記録）はそのまま使います。

## 振り分けと確かめの順番（NFR4.34、NFR4.41）

| 操作 | パスの型 | 確かめの順番 |
|------|---------|------------|
| `GET /v1/chore-types` | `/v1/chore-types` | requireAuth → requireMembership |
| `POST /v1/chore-types` | `/v1/chore-types` | requireAuth → requireMembership → requireAdmin → `Idempotency-Key` の形 → 本文（422）→ 名前の重なり（409） |
| `PUT /v1/chore-types/:choreTypeId` | `/v1/chore-types/:choreTypeId` | requireAuth → requireMembership → requireAdmin → ID の形（404）→ 種類の GetItem（404）→ 本文（422）→ 名前の重なり（409） |
| `PATCH /v1/chore-types/:choreTypeId` | 同上 | requireAuth → requireMembership → requireAdmin → ID の形（404）→ 種類（404）→ 本文の `active`（422） |
| `DELETE /v1/chore-types/:choreTypeId` | 同上 | requireAuth → requireMembership → requireAdmin → ID の形（404）→ 種類（404）→ 使わないにする → C8 の確かめ（409）→ 消す |

- 種類の ID の形は UUID（`crypto.randomUUID()` で作る）。正規表現で合わなければ DynamoDB を読まずに 404
- 種類の GetItem のキーは `familyId = ctx.familyId`（セッションの利用者の家族）なので、ほかの家族の種類は「ない」と同じ 404 になる（NFR4.36）
- 本文は zod で読む。`familyId`、`choreTypeId`、`active`（PUT）、`createdAt` などの知らない項目は `strip` で捨てる

## 入力の確かめ（NFR4.37、NFR4.40）

`packages/shared` に、画面と裏側で同じ確かめを使う関数を置きます（画面は入力欄の下の文言、裏側は 422）。

```ts
// 形だけを示す（実装はコード生成で）
normalizeChoreName(raw: string): Result<string, 'INVALID_CHORE_TYPE_NAME'>   // NFC、前後の空白、1〜20 コードポイント、制御文字なし
validateUnitPrice(raw: unknown): Result<number, 'INVALID_UNIT_PRICE'>        // Number.isSafeInteger かつ 0 以上
normalizeDescription(raw: unknown): Result<string | undefined, 'INVALID_DESCRIPTION'> // NFC、100 コードポイント、改行以外の制御文字なし
```

- 前後の空白は `\s` に全角の空白（U+3000）を含めて除く。制御文字は Unicode の `\p{Cc}`（説明では `\n` を除く）
- 単価は JSON の数値で、文字列は受けない（zod の `z.number()`。`z.coerce` は使わない）
- PATCH の本文は `z.object({ active: z.boolean() })`。ほかの項目は捨てる

## 名前の重なりの文言の出し分け（BR5.3）

- 名前の印の Put が条件で断られたら、印の `choreTypeId` の種類を読み、その `active` で 2 つの文言（「別の名前で」か「『使う』に戻すか」）を出し分ける。理由の印はどちらも 409 `CHORE_TYPE_NAME_TAKEN` で、応答の `details.conflictActive`（true/false）で画面が文言を選ぶ

## 画面（NFR4.38）

- 名前と説明は React の文字として出す。説明の改行は CSS の `white-space: pre-wrap` で出す（HTML に変えない）

## 送り直し（NFR4.39、NFR4.41）

- 登録は U1・U2 の送り直しの記録（`operation: createChoreType`）を、種類と名前の印と同じトランザクションで書く。同じ印で本文が違う送り直しを見分けるため、確かめの関数で正規化したあとの値（名前・単価・説明）を決まった順の JSON にしたものの SHA-256 を `target` として残し、違えば 422 `IDEMPOTENCY_KEY_REUSED`。`models.ts` の `RequestOperation` に `createChoreType` を足す（レビュー R-06）

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 子供が単価を変える | requireAdmin を種類の読み取りより先に |
| ほかの家族の種類の操作 | キーに `familyId = ctx.familyId` |
| ほかの家族の種類があることを 422・409 で漏らす | ID と種類の 404 を本文の確かめより先に |
| 悪いスクリプト | 共有の確かめの関数、React の文字、`pre-wrap` |
| `"false"` で逆に切り替わる | `z.boolean()` |

## Sources

- `construction/u4-chore-types/nfr-requirements/security-requirements.md`
- `construction/u4-chore-types/functional-design/rules.md`、`functional-spec.md`
- `construction/u2-invitation/nfr-design/security-design.md`（パスの型、送り直し）

## Assumptions & Open Questions

- [assumption] Node.js 22 の正規表現は `\p{Cc}`（Unicode のプロパティ）に対応しています
