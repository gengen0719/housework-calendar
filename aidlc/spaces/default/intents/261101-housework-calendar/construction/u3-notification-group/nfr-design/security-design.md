# 安全の設計（Security Design）— U3 お知らせ先

U3（`u3-notification-group`）の安全の要件（`nfr-requirements/security-requirements.md` の NFR4.27〜NFR4.33、NFR5.8、NFR5.9）を、どう作るかを書きます。U1 の LINE 用の受け口の確かめ（`entries/line.ts`: 秘密のヘッダー → 署名 → 本文の形 → イベントごとに二度処理しない記録）と、U2 の設計はそのまま使います。

## イベントの振り分け（NFR4.27、NFR4.28）

`entries/line.ts` の振り分け表 `handlers` に、U3 のイベントを足します。どれも U1 の `processEvent` を通るので、署名の確かめと二度処理しない記録は同じです。

| イベント | 振り分け先 | 扱う条件 |
|---------|-----------|---------|
| `join` | `handlers/line/joinHandler.ts` | `source.type === 'group'` のときだけ案内を reply。`room` は何もしない |
| `leave` | `handlers/line/leaveHandler.ts` | `source.type === 'group'` のときだけ解除 |
| `message` | `handlers/line/messageHandler.ts` | `message.type === 'text'` だけ。グループの文字はグループの操作の入口へ、1 対 1 の「登録」は案内へ。ほかは何もしない |
| `postback` | `handlers/line/postbackHandler.ts` | `data` を読み解き、グループの操作の入口へ |

- `handlers/line/types.ts` の `LineEventSchema`（zod）に、`source.groupId`、`source.roomId`、`message.type`、`message.text`、`postback.data` を任意の文字列の項目として足す。文字数の上限は zod には入れない（1 件が長いだけで本文全体が 400 になるのを避ける。レビュー R-04）。長さは次の読み解きで確かめる
- グループの操作の読み解きは 1 つの関数 `parseGroupCommand(event)` にまとめる。postback の data は 300 文字以下のときだけ `URLSearchParams` で読み、`action` が `group.register` とちょうど同じときだけ `registerNotificationGroup` とする。文字は 5000 文字以下で `text.trim() === '登録'` のときだけ。どちらにも合わなければ `null`（何もしない）
- **二度処理しない記録の前に打ち切る（レビュー R-01）:** `message` と `postback` は、`processEvent` が二度処理しない記録（`lineEventRepository.begin`）を書く前に、`parseGroupCommand`（と、1 対 1 の「登録」の判定）で操作かどうかを決める。操作でなければ、記録も書かずに `LINE_EVENT_IGNORED` で終える。家族の会話のたびに DynamoDB に書かないため、読み書きの課金が会話の量で増えない。U1 の振り分け表を「イベントの種類 → `{ accepts(event): boolean, handle(event, now) }`」の形に変え、`accepts` が false なら記録の前に終える（follow、unfollow、join、leave は常に true）

```ts
// 形だけを示す（実装はコード生成で）
type GroupCommand = { kind: 'registerNotificationGroup' };
function parseGroupCommand(e: LineEvent): GroupCommand | null;
```

## グループの操作の入口（NFR4.29、NFR4.31）

`services/groupCommandGate.ts` に、グループでの操作を通す前の確かめを 1 か所にまとめます。U8 の「代わって」も、ここを通して呼びます。

1. `source.type` が `group` でなければ、操作しない（1 対 1 は案内、room は何もしない。BR4.13）
2. 操作が「登録」なら、家族はまだ決めない。`source.userId` から `findUserByLineId` で利用者を探し、友だちで、家族に入っていて、役割が `admin` のときだけ `ctx = { familyId: 利用者の家族, userId, role: 'admin' }` で `registerNotificationGroup` を呼ぶ。合わなければ文言 `NOTIFICATION_GROUP_ADMIN_ONLY` を reply（BR4.3、BR4.4）
3. それ以外の操作（U8）は、先に `findFamilyByGroup(groupId)` で家族を決める。登録されていなければ `GROUP_NOT_REGISTERED` の文言を reply。登録されていれば、`source.userId` の利用者が友だちで、`getMembership` の家族がグループの家族と同じときだけ `ctx = { familyId: グループの家族, userId, role }` で操作を呼ぶ。違えば `NOT_FAMILY_MEMBER` の文言を reply（BR4.10）
4. 断るときの reply には、文言の一覧（C10）の決まった文だけを使い、家族の名前・メンバー・担当を入れない

U3 の時点では 3 の操作がないため、テストでは入口に差し込むテスト用の操作で確かめます（NFR4.31 の確かめ方）。

## 1 グループ 1 家族（NFR4.30）[Q1]

- `NotificationGroups` テーブルのキーは `groupId`。登録のトランザクションの Put の条件は「`attribute_not_exists(groupId)` または `familyId = :myFamily`」
- 別の家族の記録があれば、この条件で断られる。`CancellationReasons` でこの項目の `ConditionalCheckFailed` を見たら、記録を読み直し、別の家族のものなら `GROUP_USED_BY_OTHER_FAMILY`（`reliability-design.md`）
- グループにいる人がどの家族かは確かめられない（先に登録した家族が使う。受け入れたリスク）

## 画面用 API（NFR4.32、NFR4.33）

| 操作 | 使う仕組み（U1） | 応答 |
|------|-----------------|------|
| `GET /v1/family/notification-group` | `requireAuth` → `requireMembership` | `{ groupName, registeredAt }` か `null`。`groupId` は組み立てに入れない |

- 画面はグループの名前を React の文字として出す（`dangerouslySetInnerHTML` を使わない）
- 裏側は、LINE から受け取ったグループの名前を 100 文字で切ってから残す

## グループの情報とログ（NFR5.8、NFR5.9）

- ログには `groupId` の全体を書く（[Q1] の NFR 要件の答え）。グループの名前・`message.text`・表示名は書かない。`LogData` の型で `groupName`、`text`、`displayName` という名前の項目を受け付けないようにする（U2 の `token` と同じ作り）。あわせて、`lib/logger.ts` の実行時の伏せ字（`REDACTED_KEY`）にも `groupName`、`displayName`、`text` を足し、型をすり抜けた値（`describeError` の中など）も伏せる（レビュー R-05）
- グループの名前は、お知らせ先の記録の項目としてだけ持つ。記録を消す（置き換え・解除）と名前も一緒に消える

## 脅威と備え

| 脅威 | 設計での備え |
|------|-------------|
| 偽の Webhook | U1 の秘密のヘッダーと署名（変更なし） |
| 似た文字や知らない postback での登録 | `parseGroupCommand` のちょうど一致 |
| 子供や家族以外の人の登録 | グループの操作の入口の 2 |
| 別の家族のグループの登録し直し | Put の条件 |
| 別の家族の人の操作で家族の情報が見える | グループの操作の入口の 3、4 |
| ログからの名前や会話の漏れ | `LogData` の型、記録の消し方 |

## Sources

- `construction/u3-notification-group/nfr-requirements/security-requirements.md`
- `construction/u3-notification-group/functional-design/rules.md`、`functional-spec.md`
- `construction/u1-skeleton-family/nfr-design/security-design.md`、`construction/u2-invitation/nfr-design/security-design.md`
- `packages/backend/src/entries/line.ts`、`handlers/line/types.ts`（いまの振り分けと本文の形）
- `nfr-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- [assumption] LINE の message イベントの文字は最大 5000 文字、postback の data は最大 300 文字です（Messaging API リファレンスの値。B3 で確かめる）
