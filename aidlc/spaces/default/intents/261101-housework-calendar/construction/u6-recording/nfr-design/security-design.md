# 安全の設計（Security Design）— U6 記録

U6（`u6-recording`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.53〜NFR4.64、NFR5.10〜NFR5.12）を、どう作るかを書きます。U1〜U5 の設計（署名と秘密のヘッダーの確かめ、二度処理しない記録、`requireAuth`、`requireMembership`、パスの型の振り分け、遅延して読む本文、条件式の名前の置き換え）はそのまま使います。U6 の新しい入口は 2 つです。LINE の 1 対 1 の postback（`record.list`、`record.do`）と、`POST /v1/duties/{dutyId}/record` です。新しい秘密の情報は作りません（NFR5.10）。

## LINE の受け口の確かめの順番（NFR4.53〜NFR4.55）

`entries/line.ts` の `handler` と `processEvent` の順番を、U6 では**変えません**。U6 が足すのは、`postback` の `accepts` の判定だけです。

| 順 | 確かめ | 断ったときの応答 |
|----|--------|----------------|
| 1 | 設定の読み込み（`getConfig`。SSM の値は起動時に 1 回読み、保持） | 失敗は 500 |
| 2 | 秘密のヘッダー `X-Origin-Verify` | 403。DynamoDB にも LINE にも触れない |
| 3 | 署名 `x-line-signature`（生の本文に対する HMAC。定数時間の比べ） | 401。同上 |
| 4 | 本文の形（`WebhookBodySchema`） | 400 |
| 5 | イベントごとに、`Object.hasOwn(handlers, event.type)` で窓口を引く | なければ `LINE_EVENT_IGNORED` |
| 6 | **`accepts(event)`**: 記録の操作の厳密な形か（下の「postback の data の確かめ」）。ここまでは書き込みがない | 合わなければ `LINE_EVENT_IGNORED`（`type` だけ。二度処理しない記録も書かない） |
| 7 | `webhookEventId` がある | なければ `LINE_EVENT_SKIPPED` |
| 8 | 二度処理しない記録 `begin`（重複なら止める） | 重複は `LINE_EVENT_DUPLICATE` |
| 9 | `handle`: 1 対 1 の入口で利用者を確かめる（下） | 決まった文だけ |
| 10 | `recordDuty` / `listTodayRecordableDuties`（家族の範囲で探す。権限は裏側が決める） | 決まった文 |

- 1〜3 は、イベントの種類や送り元（1 対 1 かグループか）を読む前に行う（NFR4.53）。`record.do` に署名がない・書き換えた本文・秘密のヘッダーがない場合は、403 か 401 で、DynamoDB の読み書きも LINE への返事もない
- `accepts` は `message` の窓口には**足さない**（`message` は今のまま `isGroupOperation` だけ）。`postback` の窓口は `(event) => isGroupOperation(event) || parseRecordCommand(event) !== null` にする。`postbackHandler` は、まず `parseRecordCommand` で記録の操作を分け、そうでなければ今までの `handleGroupEvent` に渡す（2 つの判定は重ならない。記録は `source.type = user`、グループの登録は 1 対 1 では案内、グループでは登録で、`action` の値が違う）

## postback の data の確かめ（NFR4.54、NFR4.55）

`handlers/line/recordCommand.ts` の `parseRecordCommand(event)` が、**生の文字列に対する正規表現 1 つ**で形を決めます。`URLSearchParams` は使いません（項目の重複、順序の入れ替え、URL エンコード、`+` の空白への読み替えなど、「同じ値に見える違う文字列」を許してしまうため）。グループの登録の判定（`groupCommand.ts`）は今のまま変えません。

```ts
import { POSTBACK_DATA_MAX_LENGTH } from './groupCommand';
import type { LineEvent } from './types';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RECORD_DO = new RegExp(`^action=record\\.do&dutyId=(${UUID})&v=(0|[1-9][0-9]{0,8})$`);
export type RecordCommand = { kind: 'list' } | { kind: 'do'; dutyId: string; version: number };

export function parseRecordCommand(event: LineEvent): RecordCommand | null {
  const data = event.postback?.data;
  if (event.type !== 'postback' || event.source?.type !== 'user' || !event.replyToken) return null;
  if (data === undefined || data.length > POSTBACK_DATA_MAX_LENGTH) return null; // 300 文字
  if (data === 'action=record.list') return { kind: 'list' };
  const match = RECORD_DO.exec(data);
  return match?.[1] && match[2] ? { kind: 'do', dutyId: match[1], version: Number(match[2]) } : null;
}
```

- **長さは正規表現より先に**確かめる（300 文字。U3 の NFR4.28）。JavaScript の `$` は複数行のフラグがなければ入力の最後だけに当たるので、末尾の改行は通らない。大文字の UUID、符号・小数点・指数・桁区切りのある `v`、先頭が 0 の `v`（`0` ちょうどは可）、10 桁以上の `v`、項目の重複、余分な項目、順番の違い、`%` によるエンコード、空の値は、どれも正規表現に合わず `null`
- `source.type` が `user` のときだけ（NFR4.55）。`group` と `room` は、同じ data でも `null` になり、`LINE_EVENT_IGNORED` で終わる（返事もしない）。受け付けるかどうかは `accepts` の中、つまり二度処理しない記録を書く**前**に決まる
- **`replyToken` がないイベントは受け付けない**（設計で足した守り）。返事の宛先がないまま記録だけ書くことを避けるため。実際の postback には必ず付くので、通常の動きには影響しない
- `source.userId` の有無は `accepts` では見ない。ないイベントにも「先に家族に参加してください」を返す（NFR4.56）ため
- `data` の値は秘密の情報を持たず、信じない。`dutyId` は押した人の家族の中だけで探し、`v` は見せた時点の版の比べにだけ使う（権限は下の節）
- 1 対 1 のほかの postback、`message`、形の外れた `record.*` は、二度処理しない記録を書かず、返事もしない（NFR3.7）

## 1 対 1 の入口で利用者を決める（NFR4.56）

`services/oneToOneGate.ts` に `authorizeChild(lineUserId)` を置きます（`groupCommandGate.ts` の `judgeRegister` と同じ考えで、別の小さな入口にする。`judgeRegister` は管理者を通す作りなので流用せず、子供を通す関数を並べる）。`familyMemberService.findUserByLineId`（`lineUserId-index` の Query。読むだけで利用者は作らない）の結果を、次のとおり 1 つの結果に分けます。

| 結果 | 当てはまる人 | 返事（本人にだけ。決まった文） | 担当・月・種類の読み書き |
|------|-------------|------------------------------|--------------------------|
| `child` | 友だち（`friendStatus = friend`）で、`familyId` があり、`role = child` | 先へ進む | する |
| `admin` | 友だちで、`familyId` があり、`role = admin` | `ADMIN_RECORD_GUIDE` | しない |
| `outsider` | 利用者の記録がない、`friendStatus` が友だちでない（ブロック中）、`familyId` がない、`role` が子供でも管理者でもない、`source.userId` がない | `JOIN_FAMILY_FIRST` | しない |

- 家族は利用者の記録の `familyId` だけから決める（`ctx = { familyId, userId, role: 'child' }`）。イベントや data の中の値からは決めない
- ブロック中かどうかは、保存してある `friendStatus` で見る。LINE のプロフィール取得は呼ばない（NFR2.38、NFR7.28）
- 返事に、家族の名前・メンバー・担当・種類の名前を入れない。ログは `RECORD_GUIDE_SENT`（`reason` は `ADMIN` か `NOT_IN_FAMILY`。`userId` と `familyId` は分かるときだけ）
- `lineUserId-index` は結果整合なので、友だち登録や家族への参加の直後は反映が遅れて `outsider` に見えることがありうる（U3 のグループの入口と同じ。もう一度押せば通る）
- 6 通り（子供、管理者、家族外、記録なし、ブロック中、`source.userId` なし）の単体テストで、返事が決まった文だけであること、`admin` と `outsider` では `Calendar` と `ChoreTypes` が 1 回も呼ばれないことを確かめる

## 権限は裏側が決める（NFR4.57、NFR4.59）

- `record.do` の `dutyId` と `v` は信じない。`recordDuty(ctx, dutyId, v, …)` が、家族の範囲（`familyId = ctx.familyId`）で探し、本人の担当か確かめる（`reliability-design.md` の判定の順番）。ほかの家族の `dutyId` は、`DID#<dutyId>` が `ctx.familyId` の下にないので `NOT_FOUND`（存在しない ID と同じ読み取りの回数）。同じ家族のほかの子供の担当は `NOT_OWN_DUTY`
- **LINE の返事の同じ文**: `NOT_FOUND`、`NOT_OWN_DUTY`、`DUTY_CHANGED`、`NOT_TODAY_DUTY`、`DUTY_SKIPPED_BY_ADMIN` は、すべて「この担当は先に変更されました」と、押した本人の今の選択肢だけ（BR7.5）。ほかの子供の担当があるか、ほかの家族の担当があるかは返事から分からない。選択肢は押した本人の `ctx.userId` の担当だけで作る。画面用 API は、`NOT_FOUND` が 404、`NOT_OWN_DUTY` が 403 で、分けて返す（画面の文言は同じ「変更されました」。同じ家族の中の話で、ほかの家族の存在は漏れない）
- **転送や貼り付けで手に入れたボタン**: 家族外の人が押すと `JOIN_FAMILY_FIRST` だけ、同じ家族のほかの子供が押すと `NOT_OWN_DUTY` → 「この担当は先に変更されました」と**押した本人の**選択肢だけ。どちらも何も書かれず、元の持ち主の担当は変わらない
- **古くなったボタン（NFR4.59）**: 取引の条件（`status = todo`、`version`、`dutyId`、`childUserId`、月の確定、読んだ単価）で必ず断られる。管理者が「未」に戻した担当の古いボタンは `version` が増えているので `DUTY_CHANGED`、担当の子供を変えたあとは `NOT_OWN_DUTY`、確定した月は `MONTH_CONFIRMED`。**すでに自分が「済」にした担当の同じボタンだけは**、判定の順番の 3. で、書かずに最初の結果を返す
- **返事は本人にだけ**（NFR4.58）: `lineApiService.reply(event.replyToken, messages)` だけを使う。`recordHandler.ts` は `push`、`multicast`、`broadcast` を import せず、宛先 `to` を指定する呼び出しをしない。`NotificationGroups` を読まない。reply のトークンは 1 回だけ使い、ログにも DynamoDB にも data にも入れない。単体テストで、LINE への呼び出しが `POST /v2/bot/message/reply` だけ、1 イベントにつき 0 回か 1 回であること、URL に `push`・`multicast`・`broadcast` を含む呼び出しがないことを確かめる

## 画面用 API の確かめの順番（NFR4.60、NFR4.61）

| 操作 | パスの型 | 確かめの順番 |
|------|---------|------------|
| `POST /v1/duties/{dutyId}/record` | `/v1/duties/:dutyId/record` | requireAuth（セッション）→ requireMembership（ブロック中は 403 `NOT_FRIEND`、家族のメンバー）→ `dutyId` の形（小文字の 16 進数の UUID でなければ DynamoDB を読まずに 404）→ 家族の中での担当の探索（404）→ 本文の大きさ（64 KB。413）と zod（422 `INVALID_REQUEST`）→ 本人の担当か（403 `NOT_OWN_DUTY`）→ 以降 BR7.4 の 3〜9（409・422・500） |

- 管理者の確かめ（`requireAdmin`）は付けない。管理者の要求は `recordDuty` の本人の確かめで 403 `NOT_OWN_DUTY` になる（記録の修正は U7）
- ほかの家族の `dutyId` には、本文が正しくても誤っていても 404。本文は担当の 404 のあとで**遅延して**読む（`recordDuty` に `version` を関数で渡す。U5 の `changeDutyChild` と同じ。NFR4.52 と同じ考え）
- 本文は `version` だけを zod で読み、余分な項目は捨てる（`strip`）。数の形は 0 以上の安全な整数

```ts
import { z } from 'zod';

/** 本文は version だけ。status・recordedAt・recordedBy・unitPrice などの余分な項目は strip で捨てる（NFR4.61） */
export const recordBodySchema = z.object({
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
```

- 結果を決める値は、すべて裏側が決める: 記録した時刻は入口で 1 回取った裏側の時計の `now`、記録した人は `ctx.userId`、単価は `getCurrentUnitPrice` の値だけ。画面の時計や端末の時刻は使わない。テストで、`unitPrice: 99999`、ほかの子供の `recordedBy`、昔の `recordedAt` を本文に付けても、書かれた値が裏側のものであることを確かめる
- 画面（NFR4.62）: 子供の表示名・種類の名前・確認の文・理由の文字は React の文字として出す。`dangerouslySetInnerHTML` を使わない決まり（ESLint）のまま

## 書き込みの条件で守る（NFR4.59、NFR2.33）

| 守りたいこと | 条件（取引の項目） |
|-------------|------------------|
| 「済」「×」の担当を二重に書かない、変えられた担当・作り直された担当に書かない | 担当の Update の条件 `#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by` |
| 確定した月に書かない | 月の状態の ConditionCheck（確定していない。記録のない月は通る） |
| 単価が先に変わったときに古い単価を書かない | 種類の ConditionCheck `#unitPrice = :price` |
| 担当を作らない・消さない | 条件に `#status = :todo` があるので、項目がなければ Update は断られる（作られない）。Put と Delete は使わない |

- **決まり**: 条件式・更新式に出る属性名は、すべて `ExpressionAttributeNames`（`#status` など）で置き換える（U5 の決まり）。コード生成の単体テストで、組み立てた式の属性名がすべて置き換えられていることを確かめる

## `line` の Lambda の最小権限（NFR4.63、NFR4.64）

U6 で `line` のロールに足すものは、次の 2 つの文だけです。リソースは自分の環境のそのテーブルの ARN だけで、`*` は使わず、索引の ARN も足しません。

| テーブル | 足す操作 | 使う場面 |
|----------|---------|---------|
| `Calendar` | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:UpdateItem`、`dynamodb:ConditionCheckItem` | 担当・月の状態の GetItem、今日の担当の Query、記録の Update、月の状態の確かめ |
| `ChoreTypes` | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:ConditionCheckItem` | 単価の GetItem、名前の一覧の Query、単価の確かめ |

- 環境変数は `CALENDAR_TABLE`（`props.calendar.tableName`）と `CHORE_TYPES_TABLE`（`props.choreTypes.tableName`）だけを足す。秘密の情報は入れない（NFR5.10）。`dynamoClient.ts` の `tables.calendar()` と `tables.choreTypes()` のコメント（「画面用の Lambda だけが持つ」）を、「`line` も持つ（U6）」に直す
- `TransactWriteItems` 自体の許可はない。取引は項目ごとの許可（担当の `UpdateItem`、月の状態と種類の `ConditionCheckItem`）で確かめられる（U3 の `NotificationGroups` の取引と同じ）
- **足さないもの（NFR4.64）**: `Calendar` と `ChoreTypes` への `PutItem`、`DeleteItem`、`BatchGetItem`、`BatchWriteItem`、`Scan`、`dynamodb:*`、テーブルの作成・削除。`Users` の `familyId-index` の Query。`jwt/*` の SSM パラメータ。SNS・SES・Lambda の呼び出しなど別のサービス。`line` の既存の許可（`Users`、`Families`、`ProcessedLineEvents`、`NotificationGroups`、SSM の `line/*` と `cloudfront/*`）は増やさない。`api` のロールは U6 で変えない
- CDK のテスト（`infrastructure` のテスト）で、`line` のロールの IAM ポリシーを取り出して確かめる: (1) 上の表と一致する、(2) 上の「足さないもの」が 1 つも含まれない、(3) U6 の前後で `line` の既存の許可が変わっていない（既存の許可の一覧を期待値として固定する）、(4) `api` の許可が変わっていない、(5) ステージングの `line` が本番のテーブルの ARN を含まない、(6) 環境変数のキーが U5 の一覧に `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` を足したものと一致する

## 秘密の情報（NFR5.10〜NFR5.12）

- LINE の返事に使うチャネルアクセストークンとチャネルシークレットは、U1 の SSM（`line/channel-access-token`、`line/channel-secret`）を、これまでどおり起動時に読む（`getConfig`）。U6 で新しい秘密は作らない
- **リッチメニューの設定のスクリプト**（`scripts/` に置く小さな TypeScript。`logical-components.md`）: トークンは、環境ごとの SSM から実行のときに読むか、実行する人が環境変数で渡す。スクリプトにも README にも設定ファイルにも値を書かない。例は `<作り物の値>`。環境（`staging` か `production`）の指定が必須で、指定がなければ何もしない（既定で本番を選ばない。NFR10.6）
- テストとその前提データ（筋書き、画面のテスト、スクリプトの例）に、本物の LINE のユーザー ID、グループ ID、トークン、署名の鍵、表示名を使わない（NFR5.11）。署名のテストには、`<作り物の値>` で計算した本物の HMAC を使う。gitleaks（CI）が通ること
- ログと DynamoDB に残さないもの（NFR5.12）: LINE のユーザー ID、表示名、reply トークン、postback の data の全文、返事の本文（Flex Message の中身）、種類の名前、単価と金額。二度処理しない記録に入れるのは U1 の決めたイベントの ID と状態だけ（`observability-design.md`）

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 偽の Webhook で、ほかの人の名前で記録させる | 秘密のヘッダーと署名を最初に確かめる（NFR4.53）。受け口の順番は変えない |
| data を書き換えて、ほかの子供・ほかの家族の担当を記録する | 厳密な形以外は無視（NFR4.54）。`dutyId` は `ctx.familyId` の範囲で探し、本人の担当かを裏側が確かめる（NFR4.57） |
| 古いボタンを再び押して、取り消された担当・確定した月・変えられた担当を記録する | 取引の条件（`version`、`dutyId`、`status`、月、単価）（NFR4.59） |
| グループや room に貼られたボタンから記録する | `source.type = user` だけ受け付ける（NFR4.55） |
| 家族外の人がリッチメニューから家族の情報を知る | 決まった文だけ。家族の情報を入れず、担当・月・種類を読まない（NFR4.56） |
| 返事が家族のグループに届いて、お小遣いの内容が見える | reply だけを使う。push・`to` の指定なし（NFR4.58） |
| 子供が画面用 API に単価や記録した人を直接書く | 本文は `version` だけ。余分な項目は `strip`。値は裏側が決める（NFR4.61） |
| 同じイベントの再送、同時の 2 回押しで二重に記録される | 二度処理しない記録と、取引の条件、本人の記録済みは書かずに返す（NFR2.35） |
| `line` の Lambda が乗っ取られて、種類や担当を消す・作る | `Calendar` は Update のみ（Put・Delete なし）、`ChoreTypes` は読むだけ（NFR4.63、NFR4.64）。取引の `Update` は条件に `status = todo` があり、項目を作れない |
| 偽の Webhook を大量に送って費用を増やす | 署名の確かめを先に。同時実行の上限（U1）。記録の操作でないイベントは書き込みなし（NFR3.7） |
| 署名の鍵・トークンが漏れる | 環境ごとの SSM とリポジトリの検査（gitleaks）。スクリプトに値を書かない |
| 子供が自分で「済」を取り消して記録を書き換える | 取り消す入口を作らない（BR7.13）。管理者の取り消しは U7 |

## ADR-U6-02 postback の data を、`accepts` の中で、1 つの正規表現で厳密に確かめる

**Context**

- `entries/line.ts` の `accepts` は、二度処理しない記録を書く前に、処理する価値のないイベントを打ち切る（NFR3.4、NFR4.28）。偽のイベントや形の外れたイベントが、書き込みの費用や記録を生まないための仕組みである
- 既存のグループの登録の判定（`groupCommand.ts` の `isRegisterRequest`）は、`URLSearchParams(data).get('action')` で `action` だけを見る。余分な項目や重複があっても通る。登録は権限の確かめが厳しく、副作用も小さいので許容されている
- 記録の `data` には `dutyId` と `v` が入り、書き込みの対象と条件を決める。「同じ値に見える違う文字列」（大文字の UUID、`v=01`、`%` エンコード、項目の重複）を通すと、同じ操作が複数の表現を持ち、テストと監査が難しくなる

**Decision**

- `parseRecordCommand` を新しく作り、生の `data` 文字列に対する正規表現 1 つ（`record.list` は文字列の完全一致）で形を決める。`source.type = user` と `replyToken` の有無も同じ関数で確かめ、`accepts` と `postbackHandler` の両方が同じ関数を使う（判定が 2 か所でずれない）
- 合わなければ `LINE_EVENT_IGNORED`（`type` だけ）。`data` の文字はログに出さない
- 既存の `groupCommand.ts` は変えない（U3 の動きを変えない）

**Consequences**

- よい点: 操作の表現が 1 つに決まる。外れた値の筋書きが数えられる（NFR4.54 の一覧）。判定が副作用のない純粋な関数で、単体テストが書きやすい。`accepts` に使うので、外れた値は書き込みを生まない
- よくない点: 正規表現は UUID の version と variant のビットを見ない（形だけ。権限は裏側が決めるので問題はない）。`v` の桁数の上限（9 桁）を超える版は、受け付けない（実際の `version` は小さい数なので現実には起きない）。`groupCommand.ts` と書き方が違う（記録の操作は書き込みの対象を持つため）

**Alternatives Rejected**

| 案 | よいところ | 選ばなかった理由 |
|----|----------|----------------|
| A. `URLSearchParams` で読み、各項目を zod で確かめる | 既存の書き方と同じ | 重複、順序、エンコードの違いを通す。「同じ値の違う表現」を許す。項目の重複は `get` が最初の値だけを返すため、見えなくなる |
| B. `accepts` は緩く（`action` が `record.*` なら通す）、`handle` の中で厳密に確かめる | `accepts` が単純 | 形の外れたイベントが `begin`（書き込み）まで進み、処理済みの記録を無駄に書く（NFR3.7、NFR4.54 に反する） |
| C. zod の文字列の形（`.regex`）で確かめる | 型と一緒に書ける | 結果は同じで、依存と起動時の読み込みが増える。入口の判定は軽く保ちたい |

## Sources

- `construction/u6-recording/nfr-requirements/security-requirements.md`（NFR4.53〜NFR4.64、NFR5.10〜NFR5.12）、`scalability-requirements.md`（NFR3.7）
- `construction/u6-recording/functional-design/rules.md`（BR7.1、BR7.3〜BR7.5、BR7.9、BR7.15）、`functional-spec.md`（F1〜F3、配備）
- `inception/contract-design/contract-summary.md`（C1、C3、C6、C8、C10、familyScope）
- `construction/u5-assignment-calendar/nfr-design/security-design.md`（確かめの順番、遅延して読む本文、名前の置き換え）
- 既存コード（読むだけ）: `entries/line.ts`（`accepts`、`processEvent`）、`handlers/line/groupCommand.ts`、`postbackHandler.ts`、`services/groupCommandGate.ts`、`services/familyMemberService.ts`（`findUserByLineId`）、`services/lineApiService.ts`（`reply`）、`lib/dynamoClient.ts`、`infrastructure/lib/app-stack.ts`（`line` の既存の権限）

## Assumptions & Open Questions

- [assumption] `oneToOneGate.ts` を別の小さな入口として作ります（機能設計の「コード生成で決める」を、この段階で別にすると決めました）。`groupCommandGate` に足しても 6 通りの分かれ方は満たせますが、`judgeRegister` が管理者を通す作りで、グループの入口と 1 対 1 の入口を同じファイルに置くと読み違えやすいためです。コード生成で反対の理由が見つかれば、振り分けを保ったまま統合してよい
- [assumption] `replyToken` がない record 系のイベントを受け付けないのは、要件の一覧（NFR4.54）にない設計上の追加です。実際の postback には必ず付くため、要件の動きは変わりません。この守りを不要とする場合は `parseRecordCommand` の 1 行を消すだけです
- [assumption] 条件の `#childUserId = :by` は NFR4.57 を書き込み自身でも守る二重の守りで、要件にはない追加です（`reliability-design.md`）
- [assumption] リッチメニューのスクリプトの置き場所は `scripts/`、トークンは SSM（`line/channel-access-token`）から読みます。実行する人が AWS の認証情報を持っている前提です。詳細はコード生成と Infrastructure Design で決めます
