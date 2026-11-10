# 速さの設計（Performance Design）— U8 代わりにやる

U8（`u8-swap`）の速さの要件（`nfr-requirements/performance-requirements.md` の NFR7.39〜NFR7.48）を、どう作るかを書きます。U1〜U7 の設計（読み取りの並行、取引は 1 回、入口で `now` を 1 回、冷たい起動を含めた測り方）はそのまま使います。U8 の入口は LINE のグループだけで、画面は足しません。返事はすべて reply の 1 回です（NFR1.32）。

このステージで決めること（機能設計と NFR 要件から預かったもの）は 2 つです。(1) 3 秒の予算の配分と呼び出しの回数、(2) 月の確定のときのフックの並行数の制限（BR9.11 の (b)）。

## 時間の配分（NFR7.39〜NFR7.42、NFR7.43）

3 秒は「送る・押す瞬間から、返事が見える瞬間まで」（NFR7.48 の 5.）。サーバー側は 2,000 ミリ秒、残り 1,000 ミリ秒を LINE の配送と端末に割り当てます（NFR7.43）。サーバー側の 2,000 ミリ秒の内訳は目安です。

| 区間 | 予算（95% の目安） | 設計 |
|------|------------------|------|
| 署名・秘密のヘッダーの確かめ（`x-line-signature`、`X-Origin-Verify`） | 20 ms | メモリの上の HMAC だけ。SSM の値は Lambda の実行環境ごとに 1 回読んで持つ（U1 の設計） |
| 二度処理しない記録の `begin` | 15 ms | `PutItem` 1 回（既存） |
| グループの入口（`findFamilyByGroup` → `findUserByLineId`） | 30 ms | 読み取り 2 回。表示名はここで読んだ利用者の記録から取る（追加の読み取りなし） |
| U8 の中身（一覧 / 選ぶ / 引き受ける / やめる） | 一覧 60 ms、ほか 80〜120 ms | 下の「読み取りの並行」と「書き込みは 1 回の取引」 |
| `markDone` と reply | 15 ms + 150 ms | reply は `fetch` 1 回（時間切れ 5 秒。U1 の NFR7.5）。返事を作るのはメモリの上 |
| 冷たい起動 | 1,000 ms 台に収める | 追加の依存を入れない（NFR1.15）。起動時の読み込みを増やさない |

- 冷たい起動の合格の判断は、NFR7.48 の 4.（20 ラウンドのうち 10 ラウンド以上を冷たい起動にする）で、画面録画の結果だけで行います。サーバー側の `durationMs` は補助です（NFR7.43）
- 届かないときの直し方は NFR7.48 の 7. のとおりで、順番は (1) 起動時の読み込みをまとめる、(2) 配信物を減らす、(3) Lambda のメモリを 256 MB から 512 MB へ。Provisioned Concurrency など費用のかかる手段は使わない（NFR1）

## 読み取りの並行と書き込み 1 回（NFR7.44、NFR7.47）

```text
一覧 listSwappable : [今月の月 Query] ∥ [来月の月 Query] ∥ [種類 Query]  → 絞り込み → reply 1 回
選ぶ offerSwap     : [findDuty(DID# → 担当 → 月の状態)] ∥ [申し出 GetItem] ∥ [種類名 GetItem] → 取引 1 回 → reply
引き受ける acceptSwap : [findDuty] ∥ [申し出 GetItem] → [種類名 GetItem] → 取引 1 回（3 項目）→ reply
やめる withdrawSwap : [申し出 GetItem] → UpdateItem 1 回 → reply
```

- `∥` は `Promise.all` で並行します。`findDuty` の中の 3 回（`DID#` の `GetItem` → 担当 → 月の状態）は既存の形のまま、順番に読みます（担当の `month` が分かってから月の状態を引くため）
- 「選ぶ」の申し出の `GetItem` は、機能設計 BR9.7（元の持ち主の判定）・BR9.17 のとおり、`findDuty` と**並行**して読みます（直列にしません）。読む回数は変わらず 10 回のままです。レビュー R-01 への対応で、図を BR9.7 に合わせました
- 申し出の `GetItem` は強い整合性で 1 回（NFR3.14）。種類の名前は返事の組み立てだけに使うので、失敗しても「お手伝い」と言い換えて続けます（NFR2.61）
- 書き込みは 1 回の取引、または 1 回の `UpdateItem` だけです。LINE の API は reply の 1 回だけで、プロフィール取得・push 系は呼びません（NFR1.32）
- 取引の読み直しは 1 回まで（BR9.15、NFR2.56）。reply は 1 イベントにつき 0 回か 1 回、送り直しはしません（NFR7.47）

### 呼び出しの回数（NFR7.44）

数えるのは、二度処理しない記録（`begin`、`markDone`、失敗時の `release`）を含む全部です。

| 操作 | 内訳 | 通常 | 読み直しがあるとき |
|------|------|------|------------------|
| 一覧 | 家族 1 + 利用者 1 + 月 Query 2 + 種類 Query 1 + `begin` 1 + `markDone` 1 | 7 回（上限 8） | 一覧には取引がないので変わらない |
| 選ぶ | 家族 1 + 利用者 1 + 担当の探索 3 + 申し出 1 + 種類名 1 + 取引 1 + `begin` 1 + `markDone` 1 | 10 回 | 担当の探索 3 + 申し出 1 + 取引 1 が増えて最大 15 回 |
| 引き受ける | 同上（取引は 3 項目で 1 回と数える） | 10 回 | 最大 15 回 |
| やめる | 家族 1 + 利用者 1 + 申し出 1 + `UpdateItem` 1 + `begin` 1 + `markDone` 1 | 6 回 | 読み直しなし（`UpdateItem` の条件で断られたら申し出を読んで言い分ける。7 回） |

- 回数は、担当の数・種類の数・家族の人数で増えません。11 件以上の候補があっても Query は 1 回ずつです（月の Query は 1 ページ 1 MB までで 1 か月 300 件でも 100 KB 台）
- 単体テストは、DynamoDB のクライアントと `fetch` を差し替えて数えます。担当 1 件・12 件・31 件、種類 4 個・10 個の組み合わせで、上限に収まることを確かめます。`getProfile` と LINE の push 系の呼び出しが 0 回であることも確かめます

## フックが既存の経路に足す呼び出し（NFR7.45）

`registerSwapHooks()` が登録するフックは、1 回につき申し出の項目への条件つき `UpdateItem` を 1 回だけ発行します（`reliability-design.md` の「フックの掃除」）。

| 既存の経路 | 呼び出し数の読み替え |
|-----------|--------------------|
| U6 記録 `record.do`（NFR7.28） | 通常 10 回以内（9 + フック 1）、読み直しがあっても 15 回以内（14 + フック 1）。フックは書けた 1 回についてだけ呼ぶ。**上限は変わらない** |
| U7 状態の変更 `POST /duties/{dutyId}/status` | `markDone`・`markSkipped`（「未」でなくなる操作）は通常 7 回、読み直しで 12 回に上限を引き上げる。`cancel`・`unmarkSkipped` は変わらない（フックを呼ばない） |
| U5 `changeDutyChild` | 通常の回数 + 1 |
| U5 割り当ての保存 | 変わった・消えた担当 1 件につき + 1。件数は多くて数百で、下の並行数で包む |
| U8 `acceptSwap` | **フックを呼ばない**（申し出は同じ取引で `accepted` になるため。BR9.9） |

- フックが登録されていないときは、呼び出し数が U5〜U7 の値のままであることを単体テストで確かめます
- NFR7.22（作り直しのある保存）、NFR7.25（`record.do`）、NFR7.33（`markDone`）の 3 秒の目標は、**U8 の反映後に測り直します**（NFR7.48 の 8.）。前の表は残して新しい表を足します

## 月の確定のときのフックの並行数（NFR7.46、NFR3.15、NFR8.16）

### 決め（ADR-U8-01）

NFR7.46 の方針 (b) を採ります。`notifyDutyReassigned` を、**イベントを最大 4 件ずつ並行して呼ぶ形**に変えます。

| 項目 | 決め |
|------|------|
| 並行数 | 定数 `DUTY_HOOK_CONCURRENCY`（初期値 **4**、変えてよい範囲 **2〜5**）。1 か所に置き、読みやすい名前を付ける |
| 5 にしてよい条件 | 測定で `Calendar` の `WriteThrottleEvents` が 0 のままのときだけ。スロットルが出たら下げる |
| 1 つのイベントの中 | 登録された関数は、これまでどおり**登録の順に `await`** する（順序の意味を変えない） |
| 関数が投げたとき | 握りつぶさず `DUTY_HOOK_FAILED`（警告。`familyId`・`dutyId`・`kind` と `describeError`）を 1 件残し、ほかのイベントは続ける。保存・確定の結果は変えない |
| 型 | `DutyReassignedEvent`・`DutyReassignedHook`・`notifyDutyReassigned(events)` の型は**変えない**（契約の形は変わらない） |
| `notifyDutyRecorded` | 1 件ずつなので変えない |
| 依存 | 入れない。小さな自前の関数（下の `mapWithConcurrency`）で作る |

(a)「いまの順番に待つ形のまま」は単独では採りません。見積もり（未測定）は、`UpdateItem` 1 回を 5〜15 ミリ秒として、300 件を順番に待つと 1.5〜4.5 秒で、確定の応答の 3 秒を悲観側で超えるためです。(a) は測定の手順として並べて残します（NFR7.46 の方針の表）。(c) の月単位のイベントは今は採りません。

### 形（コード生成の目安）

```ts
/** items を最大 limit 件ずつ並行して処理する。1 件の失敗は呼び出し側で扱い、ほかを止めない。 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T; // 単一スレッドなので取り合いは起きない
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
```

- `worker` の中で登録された関数を順に `await` し、投げた関数は `try/catch` で警告にします（`worker` は投げない）。これで「関数が投げても残りが続く」が保てます
- 300 件を 4 並行で 5〜15 ミリ秒ずつ処理すると約 0.4〜1.1 秒（未測定の見積もり）。1 つのパーティション（`familyId`）の書き込みは毎秒 1,000 件が目安なので、5 ミリ秒の応答で 4 並行（毎秒約 800 件）に収めます。条件で断られる書き込みも 1 書き込み分の容量を使うので数に入れます

### 目標と確かめ方（NFR7.46）

| 見るもの | 目標 | 元になるもの |
|---------|------|------------|
| 確定の応答 | 20 回のうち 19 回以上が 3 秒以内 | 画面録画 |
| 確定の要求全体 | 95% が 2,000 ms 以内 | ログ `REQUEST_END.durationMs` |
| そのうちフックの時間 | 95% が 1,000 ms 以内 | ログ `DUTY_HOOKS_DONE.durationMs`（`observability-design.md`） |
| 書き込み | 300 件以内の `UpdateItem`。`PutItem`・`DeleteItem`・`Scan`・`BatchWriteItem` は 0。`WriteThrottleEvents` は 0 | 単体テストの数え方、CloudWatch の DynamoDB の指標 |
| 結果 | **1 回目の確定だけ**、開いていた申し出がすべて `cancelled`、開いていなかった担当に申し出の項目が**作られていない** | 測定の前後で `SWAP#` の項目の数と状態を数える |

- 2〜20 回目は時間（(1)(2)）と書き込みの数・スロットル（(3)）だけを見ます。開いた申し出を毎回そろえたいときは、確定の前に LINE の操作で 10 件以上を作り直し、結果の表に「作り直し有り／無し」を書きます（データを直接書き換えない。NFR6.9）
- 単体テストで、300 件を渡したとき、同時に動く関数が 4 件を超えないこと、すべてのイベントが 1 回ずつ呼ばれること、関数が投げても残りが続くこと、書き込みが 300 回以内の条件つき `UpdateItem` であることを確かめます

### 段階（並行数 4 で届かなかったとき）

1 つずつ試し、そのたびに 20 回を測り直します。

1. 並行数を 2〜5 の範囲で調べ直す。スロットルが 0 のまま、フックの時間が縮むかを見る
2. フックの時間に締め切りを置く。確定の要求の中で、フックの呼び出しを**新しく始めるのは 1,200 ミリ秒まで**とし、超えたら残りを打ち切って `DUTY_HOOKS_TRUNCATED`（`skipped` の件数だけ）を残す。打ち切られた申し出は `open` のまま残るが、正しさは BR9.8 が守る（確定された月の担当なので「有効でない」と読まれる。`reliability-design.md`）。確定の取り消しのあとに有効に戻り得る差は、BR9.11 が許容済み
3. (c) 月単位のイベントを U7 の契約に足す。**U7 の契約の変更なので人の判断になる**。そこまで来たら、測定の表と 1.〜2. の結果を添えて、人に報告して止まる（自動では進めない）

## 測り方の設計（NFR7.48、NFR7.43、NFR8.14）

- 測り方の条件（ステージング、家族 4 人、冷たい起動の割合、画面録画、1 回の数え方、除外しないこと、測り直し）は NFR7.48 のとおりに実装します。データはアプリの画面と LINE の操作で作り、直接書き換えません。同じ担当を「申し出る → 引き受ける → その子供が申し出る → 元の子供が引き受ける」と行き来させれば、20 回がそろいます
- 3 秒の目標は自動のテストに入れません（ネットワークと LINE の配送で不安定になるため）。自動で確かめるのは、呼び出しの回数の上限（NFR7.44、NFR7.45）と、フックの並行数と件数（NFR3.15）だけです
- 測定の手順は README に書き、結果は Build and Test の成果物に表で残します。表には日時、環境、端末、20 回それぞれの時間と冷たい起動かどうか、サーバー側の `durationMs`、スロットルの有無、送信数の前後の比較（NFR1.32）、合格かどうかを入れます

## Sources

- `construction/u8-swap/nfr-requirements/performance-requirements.md`（NFR7.39〜NFR7.48）、`scalability-requirements.md`（NFR1.32、NFR3.14、NFR3.15）、`reliability-requirements.md`（NFR2.56、NFR2.61）、`observability-requirements.md`（NFR7.49）、`tech-stack-decisions.md`（NFR8.14、NFR8.16）
- `construction/u8-swap/functional-design/functional-spec.md`（F1〜F7）、`rules.md`（BR9.9、BR9.11、BR9.15、BR9.17）
- `inception/contract-design/contract-summary.md`（C3、C8）
- `construction/u7-review-confirm/nfr-design/performance-design.md`（形の手本）
- 既存コード（読むだけ）: `services/dutyReassignedHook.ts`（`for` で順に `await` する `notifyDutyReassigned`、`DUTY_HOOK_FAILED`）

## Assumptions & Open Questions

- [assumption] DynamoDB の `UpdateItem` 1 回が 5〜15 ミリ秒、並行数 4 と上限 5 の根拠（1 パーティション毎秒 1,000 件の目安）は、いずれも**未測定の見積もり**です。測定が違えば NFR7.46 の段階で直します。測定で 1 回が 2 ミリ秒以下なら (a) でも足りるので、(a) の測定も並べて残します
- [assumption] `findDuty` の 3 回の読み取りは既存の形のまま順番に読みます。並行にできるのは申し出と種類名だけです。回数の上限（NFR7.44）は、この形で収まる見込みです
- [assumption] 3 秒の起点は U6 の NFR7.25 と同じ読み（送る・押す瞬間から返事が見えるまで）、AC7.1.11 は操作ごとに 20 回と読む、という NFR 要件の仮定を引き継ぎます。承認の場で確かめてください
- 並行数の段階 3（U7 の契約の変更）に進むときだけ人の判断が要ります。それ以外にこのステージで人に聞くことはありません
