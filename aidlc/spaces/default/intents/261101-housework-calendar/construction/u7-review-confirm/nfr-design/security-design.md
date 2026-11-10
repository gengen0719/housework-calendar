# 安全の設計（Security Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.65〜NFR4.73、NFR5.13）を、どう作るかを書きます。U1〜U6 の設計（`requireAuth`・`requireMembership`・`requireAdmin`、パスの型の振り分け、遅延して読む本文、条件式の名前の置き換え、ログの伏せ字）はそのまま使います。U7 の新しい入口は 3 つで、すべて画面用 API です。`POST /v1/duties/{dutyId}/status`、`PUT /v1/months/{month}/confirmation`、`DELETE /v1/months/{month}/confirmation`。LINE の経路はありません（U7 は画面だけ。NFR1.30）。新しい秘密の情報は作りません（NFR5.13）。

## 画面用 API の確かめの順番（NFR4.65、NFR4.66、NFR4.67、NFR4.68）

3 つの入口は、U1 の共通の確かめ（セッション → ブロック中の 403 `NOT_FRIEND` → 家族のメンバー）を先に通し、続けて管理者の確かめ（`requireAdmin`）を通します。U5 の NFR4.52 と同じ順番（セッション → 家族 → 管理者 → パスの値の形 → 404 → 本文）です。

| 操作 | パスの型 | 確かめの順番 |
|------|---------|------------|
| `POST /v1/duties/{dutyId}/status` | `/v1/duties/:dutyId/status` | `requireAuth`（セッション。ブロック中は 403 `NOT_FRIEND`）→ `requireMembership`（家族外は 403 `NOT_FAMILY_MEMBER`）→ `requireAdmin`（子供は 403 `ADMIN_ONLY`）→ 本文の形の確かめ（`{ action, version }` を zod。外れたら 422 `INVALID_REQUEST`。探す前。BR8.2 の順）→ `dutyId` の形（小文字の 16 進数の UUID でなければ DynamoDB を読まずに 404）→ 家族の中での担当の探索（`findDuty`。404）→ 以降 BR8.4 の判定（409 `MONTH_CONFIRMED`・`INVALID_TRANSITION`、500 `INTERNAL`） |
| `PUT /v1/months/{month}/confirmation` | `/v1/months/:month/confirmation` | `requireAuth` → `requireMembership` → `requireAdmin` → `month` の形（日本時間の `YYYY-MM`。外れたら DynamoDB を読まずに 422 `INVALID_MONTH`）→ 月の状態の書き込み |
| `DELETE /v1/months/{month}/confirmation` | `/v1/months/:month/confirmation` | 同上（取り消しの書き込み） |

- **`requireAdmin` を家族の確かめのあとに重ねる（NFR4.65）**: U6 の記録（本人の担当か）と違い、U7 は「管理者か」で決まる。子供が直接 API を呼んだときだけ 403 `ADMIN_ONLY` になり、担当・月の状態・単価の読み書きを 1 回もしない（`requireAdmin` は `ctx.role` を見るだけで DynamoDB を読まない。`middleware/requireAdmin.ts`）。画面は管理者にしかボタンを出さない（BR8.1、BR8.9、BR8.13）が、できるかの判断は裏側の `requireAdmin` が行う（画面の判断は見た目のため）
- **本文の形の確かめが、担当の探索より先（NFR4.67、BR8.2）**: `POST …/status` は本文の 422（`INVALID_REQUEST`）を担当を探す前に出す。これは U5・U6 の「本文は担当の 404 のあとで遅延して読む」と**順番が違う**。U7 は本文に `action` という「結果を分ける値」が入り、`action` が無効なら 404 を調べる前に 422 で返すのが BR8.2 の順だから。実装は、入口のルートで本文を先に zod で読む（下の「本文の検証」）。`dutyId` の形と担当の探索はそのあと
- **確定・取り消しの `month` の形（NFR4.68）**: `PUT`／`DELETE …/confirmation` のパスの `month` は、日本時間の `YYYY-MM`（例 `2027-01`）の形だけを受け付ける。4 桁の年・`-`・01〜12 の月でなければ、DynamoDB を読まずに 422 `INVALID_MONTH`（`contract-summary.md` の C1）。本文は読まない（確定・取り消しに本文はない。余分な本文は無視する。契約の「受け取る側は知らない項目を無視する」）
- 家族は、セッションの利用者の `familyId` から裏側が決める（`requireAuth` が利用者の記録から `familyId`・`role` を取る。`middleware/requireAuth.ts`）。URL や本文の値からは決めない（`familyScope`、U5 の NFR4.42）

## 家族の範囲で探す（NFR4.66）

- **状態の変更**: `POST /v1/duties/{dutyId}/status` は、パスの `dutyId` を家族の範囲（`familyId = ctx.familyId`）で `findDuty` が探す（`DID#<dutyId>` が `ctx.familyId` の下にあるか）。ほかの家族の `dutyId` は見つからず 404 `NOT_FOUND`（ほかの家族のデータがあることも知らせない。BR8.4、NFR4）
- **確定・取り消し**: `PUT`／`DELETE /v1/months/{month}/confirmation` も、月の状態を `familyId = ctx.familyId` のキーで読み書きし、ほかの家族の月には触れない
- URL や本文で家族を指定できない（`familyScope`）。別の家族の `dutyId`・月を本文が正しくても誤っても指定しても、404（担当）か、自分の家族の月だけが変わる。別の家族の月の状態は変わらない

## 本文の検証（NFR4.67）

`POST /v1/duties/{dutyId}/status` の本文は、`{ action, version }` だけを zod で読み、ほかの項目は捨てます（`strip`）。本文は 64 KB まで（U5・U6 と同じ。超えたら 413）。

```ts
import { z } from 'zod';

/** 本文は action と version だけ。status・recordedAt・recordedBy・unitPrice などの余分な項目は strip で捨てる（NFR4.67） */
export const statusChangeBodySchema = z.object({
  action: z.enum(['cancel', 'markDone', 'markSkipped', 'unmarkSkipped']),
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
```

- `action` は 4 つのどれか、`version` は 0 以上の安全な整数。どちらかが欠ける・外れると 422 `INVALID_REQUEST` で何も変えない。`version` の文字列・負の数・小数・先頭 0 は zod の `number().int().min(0)` が弾く
- パスの `dutyId` は小文字の 16 進数の UUID（36 文字）でなければ、DynamoDB を読まずに 404（U5 の NFR4.52 と同じ。既存の `requireDutyIdParam` 相当）
- **結果を決める値は、すべて裏側が決める**: `status`・`recordedAt`・`recordedBy`・`unitPrice`・`updatedAt`・`childUserId` を本文から受け取らない。記録した時刻は要求の入口で 1 回取った裏側の時計の `now`、「済にする」の記録した人は `ctx.userId`（管理者）、単価はその時点の `getCurrentUnitPrice` の値だけ（BR8.6、`reliability-design.md`）。テストで、`unitPrice: 99999`・ほかの子供の `recordedBy`・`status: done` を本文に付けても、書かれた値が裏側のものであることを確かめる
- 確定・取り消しの本文は読まない（NFR4.68）。`month` の形の確かめは DynamoDB を読む前

## 取引の条件で守る（NFR4.69、NFR4.70）

状態の変更の書き込みは 1 回の取引で、見せたあとに変わった担当・確定された月・変わった単価を上書きしないよう、条件で守ります（`reliability-design.md` の「取引の形」）。

| 守りたいこと | 条件（取引の項目） |
|-------------|------------------|
| 見せたあとに変わった担当を上書きしない | 担当の `UpdateItem` の条件 `#status = :from AND #version = :v AND #dutyId = :id`（`from` は「いまの状態」） |
| 確定した月を変えない | 月の状態の `ConditionCheck`（確定していない。`buildMonthGuard`。担当の `month`。記録のない月は通る） |
| markDone で単価が先に変わったら古い単価を書かない | 種類の `ConditionCheck` `#unitPrice = :price`（markDone だけ。`buildUnitPriceGuard`） |
| 担当を作らない・消さない | 条件に `#status = :from` があるので、項目がなければ `UpdateItem` は断られる（作られない）。`PutItem`・`DeleteItem` を担当に使わない |

- 取引の条件で断られたら（担当が変わった・`version` が違う・先に確定された・単価が先に変わった）、1 回だけ読み直して BR8.4 の確かめ（1. 探す → 2. 月の確定 → 3. 表）を最初からやり直す（NFR4.70、`reliability-design.md`）。やり直しても断られたら 500 `INTERNAL`
- 「競合」として扱うのは `ConditionalCheckFailed` と `TransactionConflict` だけ。ほかの Code（`ThrottlingError` など）は投げ直す（`classifyCancellation`。U5 の NFR2.31・U6 の NFR2.34）
- 確定・取り消し（`confirmMonth`・`unconfirmMonth`）は version を条件にせず、目的の値にそろえる作りなので、読み直しのやり直しは要らない（二度押し・連打でも最後の結果にそろう。BR8.14、NFR2.46）
- **決まり**: 条件式・更新式に出る属性名は、予約語かどうかにかかわらず、**すべて `ExpressionAttributeNames`**（`#status`・`#version`・`#dutyId`・`#confirmed`・`#unitPrice`・`#recordedAt`・`#recordedBy`・`#updatedAt`・`#confirmedAt`・`#confirmedByUserId`・`#sk`）で置き換える（U5・U6 の決まり）。コード生成の単体テストで、組み立てた式のすべての属性名が `#` の別名になっていることを確かめる

## `api` の Lambda の権限と環境変数（足し済みの確認）（NFR4.71、NFR4.72）

U7 は `api` の Lambda に新しい権限も環境変数も足しません。既存コード（`infrastructure/lib/app-stack.ts`）を読んで確かめた結果です。

| 必要なもの | 既に `api` にあるか | 根拠（`app-stack.ts`） |
|-----------|---------------------|----------------------|
| `Calendar` への `GetItem`・`Query`・`UpdateItem`・`PutItem`・`DeleteItem`・`ConditionCheckItem` | ある（U5 で足し済み） | 「U5: 割り当てと日ごとの担当（api だけ）」の文に 6 操作すべて含む |
| `ChoreTypes` への `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem` | ある（U4 で足し済み） | 「U4: お手伝いの種類（api だけ）」の文に 6 操作すべて含む |
| 環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` | ある | `api` の `environment` に `CALENDAR_TABLE: props.calendar.tableName`・`CHORE_TYPES_TABLE: props.choreTypes.tableName` |

- U7 の書き込みに要るのは、`Calendar` への `UpdateItem`（担当・月の状態）・`PutItem`（確定行の作成。行が無い月の `attribute_not_exists` の Put。NFR2.46）・`ConditionCheckItem`（月の状態・単価の確かめ）・`GetItem`・`Query`、`ChoreTypes` への `GetItem`・`ConditionCheckItem`（単価の読みと確かめ）。これらはすべて U4・U5 の範囲内
- U7 は担当を作らない・消さないので、`PutItem`・`DeleteItem` を**担当には**使わない（確定行の作成は月の状態の項目への `PutItem` で、U5 で足した `Calendar` の `PutItem` の範囲内。NFR4.71）
- **`line` の Lambda には U7 で権限も環境変数も足さない（NFR4.72）**: U7 は LINE の経路を持たない（画面だけ）。`line` のコード・権限・環境変数に U7 由来の変更がない。既存の `line` の権限（`Users`・`Families`・`ProcessedLineEvents`・`NotificationGroups`・`Calendar`・`ChoreTypes`・SSM の `line/*`・`cloudfront/*`）は増やさない
- 確かめ方: CDK のテスト（`infrastructure` のテスト）で、U7 の前後に `api` の IAM ポリシーと環境変数が変わらないこと、U7 で新しい IAM の文・環境変数が足されていないこと、`line` の権限・環境変数が変わらないこと、構成の数（テーブル・Lambda・ログのグループ・指標・アラーム）が変わらないこと（NFR1.31）、`Calendar` が本番で `RETAIN` であること、同時実行数・メモリ・時間切れが U1 のまま（256 MB・30 秒）であることを確かめる（`logical-components.md` に引き継ぐ）

## 秘密の情報（NFR5.13）

- U7 で新しい秘密の情報は作らない。U7 は LINE を呼ばないので、チャネルアクセストークン・チャネルシークレットも使わない。セッションの署名の鍵は U1 の SSM（`jwt/*`）を `api` が起動時に読む、これまでどおり（`getConfig`）
- スクリプト・README・設定ファイルに秘密の値を書かない。例は `<作り物の値>` と書く
- テストとその前提データ（筋書き、画面のテスト）に、本物の秘密の値・表示名を使わない。gitleaks（CI。NFR5）が通ること

## ログに名前・単価を出さない（NFR4.73）

- ログには操作の事実だけを残し、名前・単価・秘密の情報を残さない（BR8.17）。残すイベントと項目は `observability-design.md` のとおり: `DUTY_STATUS_CHANGED`（`familyId`・`dutyId`・`action`・`fromStatus`・`toStatus`）、`DUTY_STATUS_REJECTED`（理由の印）、`MONTH_CONFIRMED_SET`（`familyId`・`month`・`confirmed` の新しい値）
- 残さないもの: 子供・管理者の表示名、お手伝いの名前、LINE のユーザー ID、単価と金額（markDone で書き写す単価も残さない）、セッショントークン、署名の鍵、秘密のヘッダーの値（U1 の NFR2.8・NFR5.4、U5 の NFR2.32、U6 の NFR2.41 と同じ考え）
- 利用者は、LINE の ID ではなくアプリの `userId`（`ctx.userId`）で残す（表示名は残さない）
- 既存の `lib/logger.ts` の伏せ字が効く: `LogData` の型が `name`・`displayName` を受け付けず、`secret`・`token`・`signature`・`password`・`body`・`cookie` を含む名前と `name`・`description` の値を伏せる。単価は名前に `price` を含めてもよいが、そもそもログの引数に渡さない（型では防げないので、組み立ての値をログに渡さないことをコード生成とテストで守る）
- 確かめ方（NFR4.73、NFR2.52）: 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・単価）を入れた担当・月で、成功・各断り（`ADMIN_ONLY`・`NOT_FOUND`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`INVALID_REQUEST`・`INTERNAL`）・思いがけない例外の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと

## 画面（NFR9.8 の安全の面）

- 種類の名前・子供の表示名を HTML として差し込まない（React の文字として出す。`dangerouslySetInnerHTML` を使わない決まり（ESLint）のまま。U1 の NFR4.12・U6 の NFR4.62）
- 確認（StatusChangePreview・MonthConfirmPreview）の文言も文字として出す。詳しいアクセシビリティは `performance-design.md` の画面の工夫

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 子供が API を直接呼んで、担当の状態を変える・月を確定する・取り消す | `requireAdmin` で 403 `ADMIN_ONLY`。担当・月・単価を 1 回も読み書きしない（NFR4.65） |
| 家族外・ほかの家族の管理者が、ほかの家族の担当や月を変える | 家族の範囲で探す（`findDuty`・月の状態のキーが `ctx.familyId`）。404。URL・本文で家族を指定できない（NFR4.66、`familyScope`） |
| 本文に `unitPrice` や `recordedBy` を書いて、金額や記録した人を偽る | 本文は `action`・`version` だけ `strip` で読み、結果の値は裏側が決める（NFR4.67） |
| 不正な `action`・`version`・`month` で、思わぬ書き込みや例外を起こす | zod で形を確かめ、外れたら 422 で何も書かない（NFR4.67、NFR4.68） |
| 見せたあとに古くなったボタンで、取り消し済み・確定済み・変えられた担当を変える | `version`・今の状態・月の確定を同じ取引で確かめ、断られたら 1 回読み直す（NFR4.69、NFR4.70） |
| 二度押し・確定↔取り消しの連打で、状態が取り違えられる | 状態の変更は `version` と表で、確定・取り消しは目的の値にそろえる（NFR4.70、BR8.14、BR8.16） |
| 確定済みの月が、別の経路（記録・割り当て・加算・減額）で変わる | 各単位の月の確かめ（`buildMonthGuard`）で `MONTH_CONFIRMED`（U5・U6・U9・U11。U7 は確定を書くだけ。NFR2.47） |
| ログに単価や名前が残り、家族のお小遣いの情報が漏れる | 操作の事実だけ。名前・単価・秘密を残さない（NFR4.73、NFR5.13） |
| `api` が乗っ取られて、担当を消す・作る | U7 は担当を作らない・消さない。`PutItem`・`DeleteItem` を担当に使わない（NFR4.71。`api` の権限は U5 の範囲） |

## ADR を立てない判断

安全の設計に独立した ADR は立てません。確かめの順番（セッション → 家族 → 管理者 → 本文の形 → 404）と、本文の形を担当の探索より先に確かめる判断（NFR4.67、BR8.2）は、U5・U6 の形の自然な拡張です。重要な判断（取引の形と冪等）は `reliability-design.md` の ADR-U7-01 にあります。

## Sources

- `construction/u7-review-confirm/nfr-requirements/security-requirements.md`（NFR4.65〜NFR4.73、NFR5.13）、`scalability-requirements.md`（NFR3.11）、`observability-requirements.md`（NFR2.52）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.1、BR8.2、BR8.4〜BR8.6、BR8.9、BR8.13、BR8.17）、`functional-spec.md`（F1〜F6、状態の変更の印と返事の対応、契約への追加）、`entities.md`
- `inception/contract-design/contract-summary.md`（C1、C6 `requireAdmin`、C7 `getCurrentUnitPrice`、C8、C10、`familyScope`、画面用 API の失敗の形）
- `construction/u6-recording/nfr-design/security-design.md`（確かめの順番、遅延して読む本文、名前の置き換え、秘密の扱い）
- `construction/u5-assignment-calendar/nfr-design/security-design.md`（確かめの順番 NFR4.52）
- 既存コード（読むだけ）: `entries/api.ts`（`requireAuth`、ルート表、`verifyOriginHeader`、`REQUEST_REJECTED`／`REQUEST_ERROR`、本文を遅延して読む形）、`middleware/requireAuth.ts`（セッションと `getUserStatus`）、`middleware/requireMembership.ts`、`middleware/requireAdmin.ts`（`ADMIN_ONLY`。DynamoDB を読まない）、`services/calendarService.ts`（`changeDutyChild` の権限・404・読み直しの形）、`repositories/calendarRepository.ts`（`findDuty` の家族の範囲、`buildMonthGuard`・`buildUnitPriceGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`）、`lib/logger.ts`（`LogData`・伏せ字・`describeError`）、`infrastructure/lib/app-stack.ts`（`api`・`line` の既存の権限と環境変数）

## Assumptions & Open Questions

- [assumption] `POST /v1/duties/{dutyId}/status` の権限は、U6 の記録（本人の担当か）と違い「管理者か」で決まるので、`requireAdmin` を家族の確かめのあとに重ねます。子供が直接 API を呼んだときだけ 403 `ADMIN_ONLY` になります（画面は管理者にしかボタンを出さない。BR8.1、BR8.9）
- [assumption] 月の確定・取り消しは本文を持たないので、`PUT`／`DELETE` の本文は読まず、余分な本文があっても無視します（契約の「受け取る側は知らない項目を無視する」）。`month` の形の確かめ（NFR4.68）は、DynamoDB を読む前に行います
- [assumption] 状態の変更は、本文の形の 422 を担当の探索より先に出します（NFR4.67、BR8.2）。これは U5・U6 の「本文は担当の 404 のあとで読む」と順番が違い、`action` が結果を分ける値だからです。実装は入口で本文を先に zod で読みます。`dutyId` の形と担当の探索はそのあとです
- [assumption] 確定行の作成（行がまだ無い月への初回の確定。BR8.11）は `Calendar` への `PutItem`（`attribute_not_exists` 条件）で、U5 が `api` に足した `Calendar` の `PutItem` の範囲内です。U7 で新しい権限は要りません（`app-stack.ts` を読んで確かめ済み）
- [assumption] ログの `DUTY_STATUS_CHANGED` に `action`・`fromStatus`・`toStatus` を残すのは操作の調べもののためで、単価・名前は残しません（NFR4.73、BR8.17）。調べものには `familyId` と `dutyId` で足ります
