# 速さの設計（Performance Design）— U9 お小遣いの額

U9（`u9-allowance`）の速さの要件（`nfr-requirements/performance-requirements.md` の NFR7.50〜NFR7.57）を、どう作るかを書きます。U1〜U8 の設計（読み取りの並行、入口で `now` を 1 回、冷たい起動を含めた測り方、データを直接書き換えない）はそのまま使います。U9 の入口は画面用の `GET /v1/months/{month}/allowances` だけで、**読み取り専用**です。LINE には何も送りません。

このステージで決めること（NFR 要件から預かったもの）は 4 つです。

1. 3 秒の予算の配分と、読み取りの段（最大 4 段）の組み方（ADR-U9-03、ADR-U9-04）
2. Families を 1 回の読み取りで済ませる分け方（`loadFamilyAndMembers`。ADR-U9-02）
3. 抜けた子供の確かめの並行（10 並行まで、4 段）
4. 画面 S5 の月の移動（250 ms の静まり、連番、重ね出しの抑止。ADR-U9-06）

## 時間の配分（NFR7.50〜NFR7.52、NFR7.54）

3 秒は「押す・開く瞬間から、見出しと子供ごとの行（または失敗の表示）が見えるまで」（NFR7.57 の 5.）。サーバー側の `REQUEST_END.durationMs` は 95% で 1,500 ミリ秒以内を補助の目標にし、残りを端末への通信・冷たい起動・描画に割り当てます。次の内訳は**未測定の見積もり**で、合格の判断は画面録画の結果だけで行います。

| 区間 | 予算（95% の目安） | 設計 |
|------|------------------|------|
| 署名・秘密のヘッダーの確かめ（`X-Origin-Verify`） | 10 ms | メモリの上の比較だけ。SSM の値は実行環境ごとに 1 回読んで持つ（U1 の設計。変えない） |
| 認証（`requireAuth` の `getUserStatus`） | 30 ms | `Users` の `GetItem` 1 回（既存。変えない） |
| 月の形の確かめ（422） | 1 ms | メモリの上だけ。DynamoDB より前（NFR4.86） |
| 段 2 の 3 つの同時の読み | 通常の月 100 ms、大きい月 200 ms | 月の Query ∥ `loadFamilyAndMembers` ∥ 種類の `list`。一番遅いものに揃う（下の「読み取りの段」） |
| 抜けた子供の確かめ | 0 ms（通常）、まれに +60 ms | 抜けた子供がいない月は段ごと飛ぶ。いるときは子供ごとの連なりを並行 |
| 集計・並べ替え・合計・応答の組み立て | 通常の月 5 ms、1,000 件でも 20 ms | メモリの上で担当を 1 回走査するだけ（下の「集計の作り」） |
| 冷たい起動 | 1,000 ms 台に収める | 追加の依存を入れない（NFR1.15）。起動時の読み込みを増やさない |

- 通常の月の warm な要求は、合計 250 ms 前後を見込みます（未測定）。ここから 3 秒までの余裕は、冷たい起動（1 秒台）と端末の通信に使います
- 冷たい起動の合格の判断は NFR7.57 の 4.（20 回のうち 10 回以上を冷たい起動にする）で、画面録画の結果だけで行います
- 届かないときの直し方は NFR7.57 の 7. のとおりで、順番は (1) 読み取りの並行が崩れていないかの確認、(2) 配信物の大きさ、(3) 起動時の読み込みの整理、(4) Lambda のメモリを 256 MB から 512 MB へ。Provisioned Concurrency など費用のかかる手段、保存した合計を持つ作り（ADR-005）は使わない

## 読み取りの段（NFR7.55、NFR7.56、ADR-U9-03）

用語: 「段」は DynamoDB（認証の読みを含む）を順に待つ段で、「確かめの順番」（入口の検査の番号。`security-design.md`）とは別です。順番に待つ段は**最大 4 段**です（認証 → 同時の 3 つ → 抜けた子供の `findFamilyChild` → `NOT_FOUND` のときだけ `findDisplayName`）。

```text
段 1  requireAuth(getUserStatus) → requireMembership → 月の形（current を今の月に置き換え）
段 2  Promise.all([
        calendarRepository.loadMonth(familyId, month),        // Calendar Query 1 回（強い整合性、続きのページまで）
        familyMemberService.loadFamilyAndMembers(ctx),        // Families GetItem 1 + Users 索引 Query 1 (+ 本人の補い 0〜1)
        choreTypeService.list(ctx),                           // ChoreTypes Query 1
        adjustmentSource?.(ctx, month),                       // U11 が取り付けるとき（U9 の既定は何も読まない）
      ])
段 3  抜けた子供ごとの連なり（子供どうしは並行、最大 10 並行）
        findFamilyChild(ctx, id)
段 4  NOT_FOUND のときだけ findDisplayName(ctx, id)
（段ではない）メモリだけ: 集計 → 並べ替え → 合計 → AllowanceMonthView の組み立て
```

- 段 1 の `requireAuth`・`requireMembership` は U1 の既存のまま（`getUserStatus` の `GetItem` 1 回）。月の形が違えば 422 で止まり、以降の読み取りは 0 回
- 段 2 の 3 つは**同じ時刻に始める**。`Promise.all` に 3 つの Promise を直接渡し、どれかの完了を待ってから次を始めない（NFR7.56 の (a)）。`getFamilyCreatedAt` は別に読まず、`loadFamilyAndMembers` の結果の `family.createdAt` から取る
- 段 3〜4 は、抜けた子供がいないとき（通常）は丸ごと飛ぶ。「4 段」になるのは、抜けた子供がいて、かつ `findFamilyChild` が `NOT_FOUND` のときだけ
- 管理者の ID は、`loadFamilyAndMembers` が返したメンバー（`role: admin` を含む）との突き合わせだけで判断し、読まない（BR10.13 の 3）

### 呼び出しの回数（NFR7.55）

| 状況 | 内訳 | 回数 |
|------|------|------|
| 通常 | 認証 1 + 月 Query 1 + Families 1 + Users 索引 1 + ChoreTypes 1 | **5 回** |
| 索引の遅れで本人を補う | 通常 + Users `GetItem`（強い整合性）1 | **6 回** |
| 抜けた子供 k 人 | 通常 + `findFamilyChild` k + （`NOT_FOUND` の子供ごとに）`findDisplayName` 最大 k | 最大 **5 + 2k 回**（遅れもあれば 6 + 2k 回） |
| 月の Query が複数ページ | 通常 + 続きのページの数 | ページ数だけ増える（300 件で 1 ページ） |
| `role: system`（U10） | 本人の補いを呼ばない（NFR2.73） | 認証を通らないので **4 回**（月 Query + Families + 索引 + ChoreTypes） |
| 書き込み・`Scan`・`BatchGetItem`・外部への通信（`fetch`） | － | **0 回** |

- 回数は、担当の数・種類の数・今いる子供の数では増えません。増えるのは月の Query のページ数と、抜けた子供の数だけ
- 同時に動く呼び出しは、段 2 で 3 本（U11 の取り付けがあれば 4 本）、段 3 で多くても 10 本（NFR3.18）。子供ごとの連なりは 1 本につき同時に 1 呼び出し
- 単体テストは、DynamoDB のクライアントと `fetch` を差し替えて数える。担当 0・124・300・1,000 件、種類 4・10 個、今いる子供 1・3・10 人、抜けた子供 0・1・3 人の組み合わせで、5（6）＋ 2k に収まること。`findFamilyChild` が `NOT_FOUND` のときだけ `findDisplayName` が呼ばれることを確かめる（NFR7.55 の確かめ方 (1)〜(5)）

## `loadFamilyAndMembers` の分け方（NFR7.55、ADR-U9-02）

`Families` の項目は 1 回だけ読みます。既存の `listMembers` の内部を次のように分けます（外から見える戻りは変えない）。

```ts
// familyMemberService.ts
export async function loadFamilyAndMembers(
  ctx: ReadContext,
): Promise<{ family: Family; members: Member[] }> { /* 既存 listMembers の中身。本人の補いは ctx.role !== 'system' のときだけ */ }

export async function listMembers(ctx: ReadContext): Promise<Member[]> {
  return (await loadFamilyAndMembers(ctx)).members; // 薄い関数。戻りは今のまま
}
```

- `allowanceService` は `loadFamilyAndMembers` を **1 回だけ**呼び、メンバーと `family.createdAt`（`firstMonth` の計算）を同じ結果から取る。`getFamilyCreatedAt` は、他の呼び出し元のための薄い窓口として足すが、`allowanceService` は使わない（単独で `Families` を読む形にしない）
- 既存のテスト（`listMembers` の並び順・本人の補い・LINE の ID を返さないこと）は無修正で通ること（`tsc` と既存のテストで確かめる）。`ctx` の型の広げ方は `security-design.md` の ADR-U9-01 を参照
- `Families` の読みは結果整合（`familyRepository.findById` の既定）のまま。家族の作成時刻は後から変わらないので、結果整合で足りる

## 抜けた子供の確かめの並行（NFR7.56、NFR3.18、ADR-U9-04）

```ts
// allowanceService.ts（形の目安）。mapWithConcurrency は lib/promise.ts に移す（下の注）
const resolved = new Map<string, OwnerInfo>();
await mapWithConcurrency(unknownOwnerIds, OWNER_LOOKUP_CONCURRENCY /* 10 */, async (id) => {
  const child = await findFamilyChild(ctx, id);                 // 強い整合性の GetItem
  if (child.ok) return void resolved.set(id, { displayName: child.value.displayName, current: true });
  const named = await findDisplayName(ctx, id);                 // NOT_FOUND のときだけ
  resolved.set(id, named.ok ? { displayName: named.value, current: false } : { displayName: null, current: false });
});
```

| 決め | 内容 |
|------|------|
| 並行の上限 | 定数 `OWNER_LOOKUP_CONCURRENCY = 10` を 1 か所に置く。抜けた子供が 10 人を超える月は量の前提の外（NFR3.17）だが、超えても 10 人ずつ処理して**止まらない** |
| 連なり | 1 人につき `findFamilyChild` → （`NOT_FOUND` のときだけ）`findDisplayName` の順。2 つを 1 つにまとめる作りにはしない（NFR7.55） |
| 対象 | 担当の持ち主のうち、`loadFamilyAndMembers` のメンバー（管理者・子供の両方）にいない ID だけ。重複を除き、`userId` の順に並べてから処理する（毎回同じ順に始める） |
| 失敗の扱い | `NOT_FOUND` は結果として扱う。それ以外の例外は握りつぶさず投げる（全体の失敗。NFR2.68）。1 つの連なりが投げても、`Promise.all` が全体を拒否にする |
| 並行の道具 | U8 で作った `mapWithConcurrency`（`services/dutyReassignedHook.ts`）を、`lib/promise.ts` に移して共有する。`dutyReassignedHook.ts` は同じ名前で再び公開する（既存の import とテストを壊さない）。新しい依存は入れない（NFR1.15）。**移すときに「失敗の旗」を足す**: 1 つの lane の `worker` が投げたら旗を立て、ほかの lane は旗を見て新しい項目を取り出さない（始まっている呼び出しは最後まで走る）。戻りの Promise は最初の拒否で拒否される（今と同じ）。U8 のフックの `worker` は投げない作り（中で `try/catch`）なので旗は立たず、**U8 のフックの動き（並行数・処理する項目・順序）は変わらない**。旗は `worker` が投げる U9 の使い方でだけ効く |
| 順に待つ段 | 10 人以内なら全体で 4 段（認証 → 同時の 3 つ → `findFamilyChild` → `findDisplayName`）。単体テストで、差し替えた時計つきの遅れを入れ、各連なりが互いを待たずに始まることを確かめる |

注: `mapWithConcurrency` を `lib/promise.ts` に移すのは、`allowanceService` が「フックの module」に頼る向きを避けるためです。移すときの確認は `tsc` と U8 のフックのテスト（並行数が 4 を超えないこと）で行い、`lib/promise.ts` に次のテストを足します: (1) 10 件・並行 2 で 3 件目の `worker` が投げたとき、戻りが拒否され、それ以降の項目の `worker` が新しく始まらない（呼び出しの総数が、投げた時点で始まっていた分を超えない）。(2) `worker` が投げないとき、全項目が処理され、並行数が上限を超えない（U8 のフックと同じ動き）。

## 集計の作り（NFR7.56 の (b)(c)(d)）

- **担当を 1 回走査するだけ**。入れ子の走査・担当ごとの再検索・種類ごとの `filter` をしない。1 回の走査の中で、子供ごとに `Map<owner, Map<key, count>>` へ足していく（`key` は `choreTypeId` と `unitPrice` を区切り文字でつないだ文字列）
- 走査の入力は `loadMonth` が返した担当の配列。`status !== 'done'` は読み飛ばす。「済」の担当ごとに、(1) `unitPrice` が空（`undefined`／`null`）なら数えず異常に記録、(2) 持ち主が管理者なら数えず異常に記録、(3) 持ち主がメンバーにいなければ未知の持ち主の集合に足す、(4) それ以外は `Map` に足す
- 並べ替えは、子供ごとの内訳の行（多くても 20 行前後）と子供の数（多くても 10 人）だけ。種類の並び順は `choreTypeService.list` の順番を `Map<choreTypeId, index>` にして一度だけ引く
- 応答の大きさ: 通常の月 10 KB 以内、想定の最大（子供 10 人 × 内訳 20 行）50 KB 以内。許可した項目だけを組み立てるので、担当の項目が混ざらない（`security-design.md`）。圧縮は Lambda の関数 URL の前（CloudFront）に任せ、アプリは何もしない
- 自動のテストに入れないもの: 集計の時間そのもの（NFR8.17）。入れるもの: 1,000 件で走査が 1 回に収まること（読み取りの回数が増えないこと）と、応答の大きさ

## 画面 S5 の速さ（NFR7.52、NFR7.53、ADR-U9-06）

- **入口ごとの呼び出しは 1 回**: S1 から開くときは S1 の `MonthCalendar.today` の月で S5 の API を 1 回。直接開くときは `month=current` で 1 回だけ（先に `GET /months/{month}/calendar` を呼ばない）。月の移動・読み直しは、押しが静まって（最後の押しから 250 ms）から最新の目標の月で 1 回
- 先読み・自動の読み直し・タイマーでの再取得は**しない**。`visibilitychange` の購読もしない（NFR1.38 の (e)。裏側に回っている間は、そもそも何も起きない）
- 画面の描画は、答えの `allowances` を並べるだけ。重い計算（合計・小計）は裏側が済ませて返すので、画面は足し算をしない
- 画面の部品は `React.lazy` で S5 を別の塊にし、S1 の初期表示の重さを増やさない（U5 の `AssignmentPage` と同じ形。`CalendarPage.tsx` の既存の `lazy` を見て合わせる）。U9 の反映後に S1 の表示（NFR7.20）を 1 回測り直す（NFR7.57 の 8.）

月の移動の中身は `reliability-design.md` の「画面 S5 の月の移動（ADR-U9-06）」に書きます。新しい要求を出すときは古い要求を `AbortController` で取り消し、取り消された要求は「飛んでいる要求」に数えません（呼び出しの数には「出した要求」として数える）。

## 測り方の設計（NFR7.57、NFR7.58）

- 測り方の条件（ステージング、家族 2 つ、冷たい起動の割合、画面録画、1 回の数え方、除外しない、測り直し）は NFR7.57 のとおりに実装する。データはアプリの画面と LINE の操作で作り、直接書き換えない
- 3 秒の目標は自動のテストに入れない（ネットワークと端末で不安定になるため）。自動で確かめるのは、呼び出しの回数の上限（NFR7.55）、読み取りの並行（NFR7.56）、応答の大きさ、画面の呼び出しの数（NFR7.53）だけ
- 測定の手順は README に書き、結果は Build and Test の成果物に表で残す。表には日時、環境、端末、入口（S1 から・直接）、20 回それぞれの時間と冷たい起動かどうか、サーバー側の `durationMs`、DynamoDB の呼び出しの数、ブラウザの通信の記録の数、合格かどうかを入れる
- 時間のログ: `REQUEST_END.durationMs`（既存）と `ALLOWANCE_COMPUTED.durationMs`（読み取りの開始から集計の終わりまで）、`setRequestMetrics({ dutyCount })`。冷たい起動は `REPORT` の `Init Duration` で見分ける（`observability-design.md`）

## Sources

- `construction/u9-allowance/nfr-requirements/performance-requirements.md`（NFR7.50〜NFR7.57）、`observability-requirements.md`（NFR7.58、NFR2.74）、`scalability-requirements.md`（NFR1.37、NFR1.38、NFR3.17、NFR3.18）、`reliability-requirements.md`（NFR2.68、NFR2.72、NFR2.73）、`tech-stack-decisions.md`（NFR8.17、NFR8.19）
- `construction/u9-allowance/functional-design/functional-spec.md`（F1〜F3、シナリオ S32・S33・S35）、`rules.md`（BR10.6、BR10.12、BR10.13、BR10.16）
- `construction/u8-swap/nfr-design/performance-design.md`（形の手本。時間の配分、`mapWithConcurrency` の形）
- 既存コード（読んで確かめた）: `services/familyMemberService.ts`（`listMembers` は `familyRepository.findById` 1 回 → `userRepository.listByFamily` 1 回 → 結果に本人がいないときだけ `findById({ consistent: true })`。`findFamilyChild` は `findById({ consistent: true })` 1 回）、`services/choreTypeService.ts`（`list` は `listByFamily` の Query 1 回で `ctx.familyId` だけを使う）、`repositories/calendarRepository.ts`（`loadMonth` は `ConsistentRead: true` の Query で、`LastEvaluatedKey` がある間は読み続ける）、`services/dutyReassignedHook.ts`（`mapWithConcurrency`）、`services/calendarService.ts`（`Promise.all` で月・種類・メンバーを並行に読む形、`setRequestMetrics({ dutyCount })`）、`hooks/useMonthCalendar.ts`（`AbortController` で古い月の要求を取り消す既存の形）

## Assumptions & Open Questions

- [assumption] 各区間の予算（認証 30 ms、段 2 100〜200 ms、集計 5〜20 ms、合計 250 ms 前後）は、DynamoDB の読み取りが 1 回数十ミリ秒以内という**未測定の見積もり**です。合格の判断は画面録画だけで行います（NFR7.54）
- [assumption] `mapWithConcurrency` を `lib/promise.ts` に移し、`dutyReassignedHook.ts` から再び公開する形は、U8 の既存のテストと import を壊さないという見込みです。コード生成で `tsc` と U8 のテストで確かめ、壊れるなら移さずに `dutyReassignedHook.ts` から import します（向きが少し悪いだけで動作は変わりません）
- [assumption] 抜けた子供の連なりが 10 人を超えたとき（量の前提の外）は、10 人ずつ処理して順に待つ段が増えます。速さの目標は保証しません（NFR3.17）
- [assumption] `choreTypeService.list` は `ctx.familyId` だけを使うと読んで確かめました（`list` の本体は `listByFamily(ctx.familyId)` と並べ替えだけ）。型を `ReadContext` に広げても本体は変えない見込みです
- [assumption] S5 を `React.lazy` の別の塊にする判断は、`CalendarPage.tsx` に `AssignmentPage` の `lazy` の前例があることからの設計です。ビルドの塊の大きさは未測定で、コード生成のあとの測り直し（NFR7.20）で確かめます
- 人に聞くことは、このファイルにはありません
