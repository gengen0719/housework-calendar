# 安全の設計（Security Design）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.42〜NFR4.52）を、どう作るかを書きます。U1〜U4 の設計（認証、`requireMembership`、`requireAdmin`、パスの型の振り分けとログ）はそのまま使います。U5 は新しい秘密の情報も LINE の操作も足しません（NFR5 は U1〜U3 のまま）。

## 振り分けと確かめの順番（NFR4.42、NFR4.43、NFR4.52）

| 操作 | パスの型 | 確かめの順番 |
|------|---------|------------|
| `GET /v1/months/{month}/calendar` | `/v1/months/:month/calendar` | requireAuth → requireMembership → `month` の形（422 `INVALID_MONTH`） |
| `GET /v1/months/{month}/assignment` | `/v1/months/:month/assignment` | requireAuth → requireMembership → `month` の形（422） |
| `PUT /v1/months/{month}/assignment` | `/v1/months/:month/assignment` | requireAuth → requireMembership → requireAdmin（403 `ADMIN_ONLY`）→ `month` の形（422）→ 本文の大きさ（413）と zod（422 `INVALID_ASSIGNMENT`）→ 行の整え → **全行**の種類の 404 → **全行**の種類が「使わない」（422 `CHORE_TYPE_INACTIVE`）→ **全行**の子供の 404 → 月の確定（409 `MONTH_CONFIRMED`）→ 今月か来月か（422 `MONTH_NOT_EDITABLE`）→ 重なり（422 `ASSIGNMENT_OVERLAP`）→ 上書きの確かめ（409 `OVERWRITE_CONFIRMATION_REQUIRED`）→ 書き込み |
| `PATCH /v1/duties/{dutyId}` | `/v1/duties/:dutyId` | requireAuth → requireMembership → requireAdmin → `dutyId` の形（404）→ 担当の GetItem（家族の範囲。404）→ 本文の大きさと zod（422 `INVALID_REQUEST`）→ 子供の 404 → 月の確定（409 `MONTH_CONFIRMED`）→ 「未」か（409 `DUTY_NOT_TODO`）→ 書き込み |

- 管理者の確かめは、月や担当の確かめより先（子供はどの月・どの担当でも 403 になり、何も読まない。NFR4.42）
- ほかの家族の `dutyId` は、本文が正しくても誤っていても、ない ID と同じ 404 `NOT_FOUND`。本文の読み込み（大きさと zod）は、担当の確かめの**あと**に行う。U4 の NFR4.41 と同じ「遅延して読む」作りで、ハンドラーの中で必要になった時点で `readBody()` を呼ぶ。読み取り（担当・メンバー）を同時に行っても、判断の順は上の表のとおりにする
- 月の確定（409）が今月か来月かの確かめ（422）より先なのは、BR6.2 のとおり。確定した過去の月への保存は 409 になる
- **PUT の行の確かめの順番は 1 つに決める**: 全行の種類の 404 → 全行の種類の 422 `CHORE_TYPE_INACTIVE` → 全行の子供の 404。reliability-design.md の手順 3 も NFR4.52 も同じ順にする。根拠は 3 つ。(1) BR6.3 が行の部品を「種類、子供、曜日」の順に並べている。(2) 「全行を 1 つの確かめごとにまとめて」判断するので、行の並び順を変えても同じ本文には同じ応答になる（行ごとに種類→子供と判断すると、行の順で応答が変わる）。(3) 種類についても「ない（404）」を「使わない（422）」より先にするのは、U4 の確かめ（存在してから状態）と同じ。例: 1 行目が「使わない」の種類、2 行目がほかの家族の種類なら 404。1 行目が「使わない」の種類、2 行目がほかの家族の子供なら 422 `CHORE_TYPE_INACTIVE`（子供の確かめには進まない）
- PATCH の順番は、担当の 404 → 本文の 422 → 子供の 404 → 月の確定 409 → 担当が「未」でない 409
- パスの型の振り分けは U2 の `router.ts` の `:name` を使う。ログの `path` には型（`/v1/months/:month/assignment`）を書き、月や ID の実際の値を書かない

## 家族の範囲（NFR4.43、NFR4.44、NFR4.45）

- 読み書きのキーは、いつも `familyId = ctx.familyId`（セッションの利用者の家族）。URL や本文に家族の ID はない
- ほかの家族の `dutyId` は、`DID#<dutyId>` のキーが `ctx.familyId` の下にないので「ない」と同じ（見つからないときも、ほかの家族のものだったときも同じ応答と同じ読み取りの回数にする）
- 割り当ての行の `choreTypeId` は C7 の一覧（その家族の種類）の中にあること。なければ 404 `NOT_FOUND`
- **子供は `Users` テーブルの強い整合性の GetItem で確かめる**: `childUserId` ごと（重複を除く）に `Users`（パーティションキー `userId`）を `ConsistentRead: true` で GetItem し、`familyId = ctx.familyId` かつ `role = child` であること。ない、ほかの家族、管理者の `userId` は、どれも同じ 404 `NOT_FOUND`。結果整合の索引（`familyId-index`）は確かめに使わない（参加した直後の子供が見えない・外れた子供が残る、を避ける）。保存では重複を除いた `childUserId` の GetItem を同時に行い（家族の子供は数人。`rules` は 200 行までなので最大でも 200 回、1 回 1 読み取りユニット）、PATCH では 1 回
- 種類は一覧を 1 回読んで確かめる（行ごとに読まない。NFR1.21）。子供の表示名はカレンダーの応答を作るためだけに C6 のメンバー一覧（索引）を読み、確かめには使わない
- 権限の影響: `api` のロールは `Users` の `GetItem` をすでに持っている（`infrastructure/lib/app-stack.ts` の 122〜126 行目で確認した）ので、足す許可はない

## 入力の確かめ（NFR4.46、NFR4.47、NFR4.48）

| 入力 | 確かめ | 違うとき |
|------|-------|---------|
| パスの `month` | `^\d{4}-\d{2}$` かつ `parseMonth`（年 2000〜2100、月 01〜12）。日付の計算に渡す前に確かめる | 422 `INVALID_MONTH` |
| パスの `dutyId` | UUID の形で、**小文字の 16 進数だけ**（`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`、大文字は受けない）。`crypto.randomUUID()` は小文字なので、正しい ID は必ず通る。キー `DID#<dutyId>` を組む前に確かめるので、大文字の同じ ID が別のキーとして引かれることもない | DynamoDB を読まずに 404 `NOT_FOUND` |
| 本文の大きさ | 64 KB（65536 バイト）まで。Base64 の本文は戻してから数える。JSON に読む前に確かめる | 413 `PAYLOAD_TOO_LARGE` |
| PUT の本文 | 下の zod | 422 `INVALID_ASSIGNMENT` |
| PATCH の本文 | `{ childUserId }` だけ（下の zod） | 422 `INVALID_REQUEST` |

```ts
import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const ruleRow = z.object({
  choreTypeId: uuid,
  childUserId: uuid,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});
export const assignmentBodySchema = z.object({
  rules: z.array(ruleRow).max(200)
    .refine((rows) => new Set(rows.map((r) => r.choreTypeId)).size <= 90),
  confirmedChangesHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export const dutyChangeBodySchema = z.object({ childUserId: uuid });
```

- **ID は小文字の UUID だけ**: `uuid` の正規表現は `i` を付けず、大文字を受けない（本文の ID は 422、パスの `dutyId` は 404）。キーに使う ID が 1 通りの書き方に決まり、大文字小文字で別のキーを引くことがない。`childUserId` を UUID の形に絞ったのは、NFR4.46 の「U1 の利用者 ID と同じ形」に合わせたもの。NFR4.47 が「文字列」と書いていたので、**NFR4.47 を「UUID の形」に直した**（要件と設計の差はない）
- **知らない項目は捨てる**（zod の既定の `strip`。PUT の `rules` の行も PATCH の本文も `.strict()` にしない）。`familyId` や `version` が付いていても読まない。NFR4.48 の「余分な項目」は「`childUserId` に加えた余分な項目は捨てる。余分な項目だけで `childUserId` がない本文は 422」と読み、NFR4.48 の文言をそうそろえた。曜日の数は、重なりを 1 つにまとめる前に 7 個まで（8 個は 422）
- **`rules` に含まれる種類の数は 90 まで**（`refine`。超えれば 422 `INVALID_ASSIGNMENT`）。割り当ての記録の書き込みは「割り当ての Put 1 + 月の確かめ 1 + 種類の確かめ（最大 90）= 最大 92 項目」で、TransactWriteItems の 100 項目に必ず収まり、種類の確かめが常に割り当ての Put と同じトランザクションに入る（NFR4.50 の「種類が使う」という条件を、割り当ての記録の書き込みでも外さない）。家族の種類の数（4 つ）の 20 倍以上
- 行を整えたあとの扱い（同じ種類と子供の行をまとめる、曜日の重なりを 1 つにする）は C8 の中の関数で行い、画面は同じ関数を使わない（裏側が正）
- PUT の `confirmedChangesHash` の形の誤り（64 文字の 16 進数でない）は 422 `INVALID_ASSIGNMENT`。形は正しいが合わないときは 409（下）
- 本文なし・数・配列・余分な項目だけの本文は、PATCH で 422 `INVALID_REQUEST`

## 書き込みの条件で守る（NFR4.50）

確かめと書き込みの間に、記録（U6）・引き受け（U8）・確定（U7）・種類を消す（U4）が入っても壊れないよう、条件は書き込みの中に持たせます（`reliability-design.md` の表）。

| 守りたいこと | 条件 |
|-------------|------|
| 「済」「×」の担当を「未」に戻さない・消さない | 子供の変更と削除の条件 `status = todo AND version = :読んだ version AND dutyId = :読んだ dutyId`（`status` は予約語なので `#status` と名前の置き換えを使う）。引き当ての Delete は `attribute_exists(sk)` |
| 消されて作り直された別の担当を、PATCH で変えない | PATCH の条件 `status = todo AND version = :読んだ version AND dutyId = :呼ばれた dutyId`（キーは日付と種類なので、作り直されても同じキーになる。`dutyId` で別の担当を見分ける） |
| 確定した月を変えない | すべてのチャンク・割り当て・PATCH のトランザクションに、月の状態の ConditionCheck（確定していない） |
| 「使わない」にした種類で新しく担当を作らない | 作る・変えるを含むチャンクと割り当ての書き込みに、`ChoreTypes` の ConditionCheck（`active = true`） |
| 同じ日の同じ種類の担当が二重にならない | 作るときの担当の Put の条件 `attribute_not_exists(sk)` |

- **決まり**: 条件式・更新式に出る属性名は、予約語かどうかにかかわらず、すべて `ExpressionAttributeNames`（`#status` など）で置き換える。コード生成の単体テストで、組み立てた式の属性名がすべて置き換えられていることを確かめる

## 上書きの確かめの印 `changesHash`（NFR4.51）

```ts
export interface HashedChange {
  date: string;
  choreTypeId: string;
  fromChildUserId: string;
  toChildUserId: string | null;
  version: number;
}

export declare function computeChangesHash(familyId: string, month: string, changes: HashedChange[]): string;
```

- 計算のしかた（コードにせず文章で決める）: 入力をコピーして、日付の順、同じ日は種類の ID の順（文字列の辞書順）に並べる。各行を `[date, choreTypeId, fromChildUserId, toChildUserId, version]` の配列にし、`[familyId, month, rows]` を `JSON.stringify` した文字列の SHA-256（Node の `node:crypto`）を、16 進数 64 文字で返す。入力の順番には左右されない
- 入れるのは `familyId`、`month`、確かめの一覧（日付と種類の順に並べたもの。日付・種類・前の子供・後の子供か `null`・担当の `version`）。決まった形の配列の JSON にして SHA-256 を取り、16 進数 64 文字で返す
- 一覧に入るのは、上書き・削除される担当のうち、`origin` が `manual` か `swap` の「未」のものだけ（BR6.7）。一覧が空なら印は不要で、`confirmedChangesHash` が付いていても無視する
- 受け取った印は、裏側がいまの一覧から作り直した印と**ちょうど同じ**ときだけ受け入れる。違えば 409 `OVERWRITE_CONFIRMATION_REQUIRED`（`details` に新しい `changes` と `changesHash`）。印に担当の `version` が入っているので、確かめたあとに担当が変わると印が合わなくなる
- 内部のやり直し（競合のあとの読み直し）だけは例外がある。最初の試行で印が合った一覧を要求の中で覚えておき、やり直しで作った一覧が**その部分集合**（行の 5 つの値がすべて同じ行だけでできている。空も含む）なら、印を比べずに続ける。前の試行が書き換えた担当は `origin = rule` に変わって一覧から消えるので、印はそのままでは合わなくなるため。部分集合でなければ（別の人が変えて `version` や子供が違う行が出た、新しい行が増えた）409 `OVERWRITE_CONFIRMATION_REQUIRED` にする。最初の試行で一覧が空だったときは、やり直しの一覧も空のときだけ続ける（`reliability-design.md`）
- この印は鍵のない計算なので、改ざんを防ぐものではなく、管理者が見ていない一覧で上書きするのを防ぐための確認の印。認可の代わりではない（認可は requireAdmin。NFR4.42）。印を作れる人は、管理者のセッションがあればもともと保存できる
- 印の比較は、秘密を守るためではないので、普通の文字列の比較でよい
- 保存の本文に `confirmedChangesHash` が付くだけで、`confirmOverwrite`（真偽値）は受け取らない

## 画面（NFR4.49）

- 種類の名前と子供・記録した人の表示名は、React の文字として出す（`dangerouslySetInnerHTML` を使わない）。名前の中のタグは文字として見える
- 色だけに頼らず、状態は「済」「未」「×」の文字でも出す（`NFR9.5`、`logical-components.md`）
- 子供には割り当ての画面への入口と「担当を変える」を出さない（見せないだけでなく、裏側が 403 にする）

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 子供が割り当てや担当を変える | requireAdmin を最初に。何も読まず 403（NFR4.42） |
| ほかの家族の担当・割り当てを見る・変える | キーに `familyId = ctx.familyId`。引き当てもその家族の下（NFR4.43〜NFR4.45） |
| ほかの家族の担当の ID の有無を探る | `dutyId` の形、引き当て、担当のどれで断られても同じ 404。本文の確かめは 404 のあと（NFR4.52） |
| 大きすぎる本文・多すぎる行で処理を重くする | 本文 64 KB、行 200 まで、曜日 7 個まで、種類 90 まで。JSON に読む前に大きさを確かめる（NFR4.46、NFR4.47） |
| 形の悪い月で日付の計算が狂う | `parseMonth` で年を 2000〜2100 に絞ってから計算（NFR4.46） |
| 確かめを飛ばして、引き受けた担当を上書きする | `changesHash` が合うときだけ上書き（NFR4.51） |
| 記録や確定と保存が重なって、記録や確定が壊れる | 書き込みの条件（`status`、`version`、月の状態、種類の `active`）（NFR4.50） |
| 名前に埋め込んだタグ | React の文字として出す（NFR4.49） |

## 権限（Infrastructure Design へ）

`api` の Lambda の役割に足す許可は、必要な最小限です（`logical-components.md` の引き継ぎも参照）。

- `Calendar`: `GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`、`ConditionCheckItem`（索引はないので、テーブルの ARN だけ）
- `ChoreTypes`: **`ConditionCheckItem` を足す**（U4 の `GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem` に追加。割り当ての書き込みのトランザクションが種類の `active` を確かめるため）
- `Users`: **追加なし**。子供の確かめの `GetItem`（強い整合性）は、`api` のロールがすでに持っている（`app-stack.ts` で確認した）
- `Scan` と `BatchGetItem` は足さない。LINE 用の Lambda には `Calendar` の許可を足さない（U5 では使わない）

## Sources

- `construction/u5-assignment-calendar/nfr-requirements/security-requirements.md`
- `construction/u5-assignment-calendar/functional-design/rules.md`（BR6.1〜BR6.9）、`functional-spec.md`
- `construction/u4-chore-types/nfr-design/security-design.md`（確かめの順番と遅延して読む本文）
- `packages/backend/src/lib/router.ts`、`entries/api.ts`（パスの型と本文の読み方）、`infrastructure/lib/app-stack.ts`（既存の権限）

## Assumptions & Open Questions

- [assumption] 本文の大きさの確かめ（413）は、U1 の `parseJsonBody` には今ありません。U5 のコード生成で、遅延して読む関数に足します（U1〜U4 の経路の動作は変えない）
- [assumption] `PAYLOAD_TOO_LARGE` は新しい理由の印として C10 に足します（`messages.ts` に文言も足す）
- [assumption] 利用者の ID と種類の ID は U1・U4 で `crypto.randomUUID()` が作った小文字の UUID の形です（コード生成で確かめる。大文字を含む ID が過去に作られていると、割り当てが 422 になるため）
- [assumption] `childUserId` を UUID の形に絞ったのは、NFR4.47 の元の文言（文字列）との差でした。NFR4.46 の「U1 の利用者 ID と同じ形」に合わせて NFR4.47 を直しました
- [assumption] C6 に「利用者 1 人を強い整合性で読む」窓口がなければ、コード生成で足します（`Users` の GetItem で、`familyId` と `role` を返す。`getUserStatus` と同じ読み方）。許可は足りています
