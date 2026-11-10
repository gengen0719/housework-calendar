# 速さの設計（Performance Design）— U7 確認・修正と確定

U7（`u7-review-confirm`）の速さの要件（NFR7.33〜NFR7.38）を、どう作るかを書きます。U1 の要件（NFR7.1〜NFR7.6）、U5 の要件（NFR7.20〜NFR7.24）、U6 の要件（NFR7.25〜NFR7.32）をそのまま使い、U7 の 3 つの操作に当てはめます。U7 は画面用 API だけで LINE の経路はありません（`functional-spec.md` の「U7 で作る画面用 API と LINE の操作」）。目標は「画面の表示と操作への返事は 95% が 3 秒以内」（NFR7）を、状態の変更・確定・取り消しに当てはめ、測るときは `api` の Lambda の起動の遅れ（コールドスタート）を含めます。サーバー側の補助の目標（NFR7.37）は 2,000 ミリ秒で、CloudFront・Lambda への届く時間と画面が読み直して描く時間に残します。

## 入口は 3 つ

- `POST /v1/duties/{dutyId}/status`（状態の変更。`changeDutyStatus`）
- `PUT /v1/months/{month}/confirmation`（確定。`confirmMonth`）
- `DELETE /v1/months/{month}/confirmation`（確定の取り消し。`unconfirmMonth`）

どれも管理者 1 人の操作で、量は少ない（1 か月に状態の変更が多くて数十回、確定・取り消しが数回。`scalability-design.md`）。速さの設計で決めるのは、呼び出しの回数（NFR7.35）を上限に収める作りと、取引を 1 往復で書くことです。

## 時間の配分

下の数字は設計の目安で、確かめ方は NFR 要件のとおり、ステージングで 20 回ずつ測ります（画面録画から読み取る。`measurement` の手順）。U7 の処理は書く前の読み取りが中心で、U6 の `record.do` と同じ粒度です。

| 操作 | サーバー側の処理（暖まった状態） | 目安 | 起動の遅れを足したとき |
|------|------------------------------|------|----------------------|
| 状態の変更 markDone（NFR7.33） | `requireAuth` の利用者の読み取り（約 10 ms）→ 担当の探索（`findDuty` の GetItem 3 回、約 30 ms）→ 単価の GetItem（約 10 ms）→ 取引（担当の `UpdateItem` ＋ 月の `ConditionCheck` ＋ 単価の `ConditionCheck`、約 30〜50 ms）。続けて画面が `GET …/calendar`（U5。約 300 ms）を読み直す | 状態の変更 250 ms + 読み直し 300 ms | 状態の変更 1.25 秒 + 読み直し 0.3 秒（起動の遅れは 1 回） |
| 状態の変更 cancel・markSkipped・unmarkSkipped（NFR7.33） | markDone から単価の GetItem と単価の `ConditionCheck` を除いたもの（取引は 2 項目） | 200 ms + 読み直し 300 ms | 1.2 秒 + 0.3 秒 |
| 確定・取り消し（NFR7.34） | `requireAuth` の利用者の読み取り → 月の状態の 1 回の書き込み（`PutItem` または `UpdateItem`、約 20〜40 ms）。続けて `GET …/calendar` を読み直す | 100 ms + 読み直し 300 ms | 1.1 秒 + 0.3 秒 |

- 起動の遅れは、ARM64 の Node.js 22、メモリ 256 MB、まとめて小さくした 1 つのファイルで、`getConfig`（SSM の読み込み。モジュールで保持）を含めて **1 秒台**に収まる見込み（U1〜U6 と同じ前提。U7 ではまだ測っていない）。`Init Duration` は `REPORT` の行で読む
- サーバー側の目標 2,000 ms（NFR7.37）は、ここでは冷たい起動でも約 1.3 秒で収まる配分にしてある。画面が確認の「はい」を押してから読み直して描くまでの時間を加えても 3 秒に収まる見込み
- 3 秒に届かないときの直し方は、U6 の NFR7.30 と同じ順（配信物を小さくする → 起動時の読み込みをまとめる → メモリを 256 MB から 512 MB へ）。常に温めておく仕組み（Provisioned Concurrency など、費用がかかるもの）は使わない（費用 0 円。NFR1）

## 呼び出しの回数（NFR7.35）

呼び出しの回数は、担当の数・種類の数・家族の人数で増えません（NFR3.11）。内訳は次のとおり。

| 操作 | 内訳 | 通常 | 読み直し込みの最大 |
|------|------|------|-------------------|
| 状態の変更 markDone（未→済・×→済） | 利用者 1（`requireAuth` の `getUserStatus` の 1 回。`requireMembership`・`requireAdmin` は AuthContext を見るだけで DynamoDB を読まない）+ 担当の探索 3（`findDuty`: `DID#` → 担当 → 月の状態）+ 単価 1 + 取引 1 | **6** | **11**（読み直しで担当の探索 3 + 単価 1 + 取引 1 が増える） |
| 状態の変更 cancel・markSkipped・unmarkSkipped | 利用者 1 + 担当の探索 3 + 取引 1（単価を読まない） | **5** | **9**（読み直しで担当の探索 3 + 取引 1 が増える） |
| 確定・取り消し | 利用者 1 + 月の状態の 1 回の書き込み 1 | **2** | **2**（version を条件にしないので取引のやり直しはない。BR8.14、NFR2.46） |

- 外への通信（HTTP）は、どの操作も **0 回**（U7 は LINE を呼ばない。NFR1.30）。`fetch` が 1 回も呼ばれないことを単体テストで確かめる
- 確定の確認に出す「未」の件数（BR8.10）は画面が持っているカレンダー（`getMonthCalendar` の結果）から数えるので、確定の API は件数のための読み取りを足さない（NFR7.35、確定・取り消しは 2 回）
- `requireAuth` は利用者の記録を 1 回読み、`familyId`・`role`・`friendStatus` をそこから取る（セッションは SSM・DynamoDB を使わず JWT の署名を確かめるだけ。`middleware/requireAuth.ts`）。NFR4.65 の家族・管理者の確かめは、この 1 回の読み取りの値だけで済む
- 単体テストで、DynamoDB のクライアントを差し替えて回数を数える。担当 1 件・124 件のデータで同じ上限に収まること、読み直し（取引の条件で断る差し替え）のときの回数も上限に収まることを確かめる

## 工夫（裏側）

- **書き込みは 1 回の取引**: 状態の変更は、担当の `UpdateItem` ＋ 月の `ConditionCheck`（＋ markDone は単価の `ConditionCheck`）を 1 往復で書く（`reliability-design.md` の「取引の形」）。確かめのための読み取りを別に挟まない。既存の `writeTransaction`（U5）をそのまま使う
- **確定・取り消しは 1 項目の書き込み**: 月の状態の `PutItem`（行が無い月）または `UpdateItem`（行がある月）1 回だけ。version を条件にしないので取引の読み直しがいらない（NFR2.46）
- **読み直しは競合のときだけ 1 回**: 状態の変更の取引が競合（`ConditionalCheckFailed`・`TransactionConflict`）で断られたら、1 回だけ読み直してやり直す（U6 の `MAX_ATTEMPTS = 2` と同じ。NFR2.45）。2 回続けて断られたら 500 `INTERNAL`
- **単価を読むのは markDone だけ**: cancel・markSkipped・unmarkSkipped は記録の 3 項目を空にするだけなので、`getCurrentUnitPrice` を呼ばず、単価の `ConditionCheck` も付けない（取引 2 項目。回数 5）
- **状態の変更の処理は `calendarService.ts` に足す**: U5 の `changeDutyChild` と同じファイルに `changeDutyStatus`・`confirmMonth`・`unconfirmMonth` を足す。`api` の経路なので、`line` のバンドルは重くならない（`logical-components.md`）
- **コールドスタートに効く作り**: DynamoDB のクライアントと日本時間の `Intl.DateTimeFormat`（`jstDate.ts`）はモジュールの先頭で 1 つだけ作る（U1、U5）。AWS SDK は Lambda のランタイムのものを使う（バンドルに入れない。U1 の `externalModules`）。本文の検証の `zod` は U1〜U6 で既にあり、U7 で依存を足さない

## 工夫（画面）（NFR9.8）

- **応答の `Duty` で先に新しい状態を出す**: `POST …/status` の 200 の応答（更新後の `Duty`）で、読み込み済みの月の担当を差し替えて新しい状態（「済 … お母さんが記録」など）を出す。続けてカレンダー（または日の詳細）を読み直して全体をそろえる（`functional-spec.md` の F2-3、U6 の画面の工夫と同じ）。ユーザーに見える変化は応答で出るので、`GET` の読み直しの時間を全部は待たない
- **押したらすぐ受け付けたと分かる**: ボタンを押したら確認（StatusChangePreview・MonthConfirmPreview）を出し、「はい」を押したら送信中はボタンを押せなくして（`aria-busy`）二重送信しない。サーバー側も二重押しを取り違えない（BR8.16）
- **確認は画面の中の小さな部品**: StatusChangePreview・MonthConfirmPreview は保存しない値で、MUI のダイアログを `React.lazy` にしない（開く操作が速くなければならない。最初に読むファイルに含める）
- **キャッシュしない**: 家族の誰かの操作で状態が変わっても古く見えないよう、画面の中のキャッシュは持たない（U5・U6 と同じ）

## サーバー側の補助の目標（NFR7.37）

- 受け口全体の時間は、既存の `REQUEST_END.durationMs`（`entries/api.ts` の `handler` の最初から最後まで）に出る。追加の実装は要らない（`observability-design.md`）
- 目標は状態の変更・確定・取り消しの 95% が 2,000 ミリ秒以内。残りを、画面から CloudFront・Lambda への届く時間と、画面が読み直して描くまでの時間に割り当てる
- この補助の目標は目安で、合格の判断は NFR7.33・NFR7.34 の画面録画の結果だけで行う（U6 の NFR7.27 と同じ考え）。冷たい起動の `Init Duration` は `REPORT` の行で別に読む

## 測り方（NFR7.33、NFR7.34、NFR7.36）

測り方の条件は `nfr-requirements/performance-requirements.md` の「測り方の条件」（NFR7.36）のとおりで、U6 の NFR7.30 と同じ考え方を U7 の画面操作に合わせたものです。設計としての要点だけを書きます。

| 目標 | 測ること | 回数 |
|------|---------|------|
| NFR7.33 | 確認の「はい」を押した瞬間から、カレンダー（または日の詳細）が新しい状態の表示になるまで。代表は取引の項目が最も多い markDone | 20 回（冷たい起動 10 回以上） |
| NFR7.34 | 確認の「はい」を押した瞬間から、「確定済み」の表示が出る（または消える）まで。行が無い月への初回の確定（`attribute_not_exists` の Put。BR8.11）も 3 回含める | 確定・取り消し各 20 回（冷たい起動 10 回以上） |
| NFR7.35 | 呼び出しの数（単体テスト。DynamoDB のクライアントと `fetch` を差し替えて数える） | 担当 1・124 件、読み直しの組み合わせ |
| NFR7.37 | ログの `REQUEST_END.durationMs` の 95 パーセンタイル（`path` の型で分ける） | 上の測定と同じ期間 |

- **環境と量**: ステージングで、家族 4 人分（管理者 1 人、子供 3 人、種類 4 つ、1 か月分の担当約 124 件。U5・U6 と同じ量）。データはアプリの画面（割り当ての保存、記録）で作り、直接書き換えて用意しない（NFR6.8）
- **markDone の 20 件の用意**: markDone は 1 件測るとその担当が「済」になり同じ担当では測り直せないので、過ぎた日の「未／×」の担当を 20 件以上そろえる。測定月の経過日数が足りないときは、過ぎた複数の日の担当を使うか、家族を複数用意して合わせる（NFR7.36 の (a)(b)）。U7 の管理者の操作は、U6 の LINE の「1 日に種類の数まで」の制約を受けない（過ぎた日も直せる）
- **冷たい起動を作る方法**: 20 回のうち 10 回以上を冷たい起動で行う。方法は (1) コードが変わるステージングへの反映、(2) 数十分以上要求を送らずに待つ、の 2 つだけ。環境変数や設定を手で書き換えて実行環境を入れ替えない（NFR6.8、U6 の NFR7.30 の 3.）。冷たい起動かは `api` の Lambda の `REPORT` の行の `Init Duration` で見分ける
- **何を 1 回と数えるか**: 確認の「はい」を押してから新しい状態（または「確定済み」）が出るまで。人の迷う時間は含めない。失敗した回も 1 回と数え、3 秒以内に入れない。1 回も除かない
- **届かなかったとき**: 除外や目標の引き下げをしない。サーバー側の時間（NFR7.37）、冷たい起動の回数、DynamoDB の呼び出し数（NFR7.35）から原因を調べ、直してから、新しい 20 回を測り直す（冷たい起動 10 回以上を含める）
- **自動のテストに時間の目標を入れない**（NFR8.13）: ネットワークに左右されて不安定になるため。自動で確かめるのは呼び出しの回数の上限（NFR7.35）だけ。測定の手順は README に書き、結果は Build and Test の成果物に表で残す（日時、環境、端末、20 回それぞれの時間と冷たい起動か、サーバー側の `durationMs`、合格か）

## ADR を立てない判断

速さの設計に独立した ADR は立てません。重要な判断（状態の変更の取引と読み直し、確定・取り消しの冪等）は `reliability-design.md` の ADR-U7-01 にあります。この文書の工夫（取引を 1 往復で書く、markDone だけ単価を読む、応答で先に新しい状態を出す）は、その帰結です。

## Sources

- `construction/u7-review-confirm/nfr-requirements/performance-requirements.md`（NFR7.33〜NFR7.38、測り方の条件）、`tech-stack-decisions.md`（NFR8.13、NFR9.8）、`scalability-requirements.md`（NFR3.11、NFR3.13）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.4〜BR8.6、BR8.10、BR8.14、BR8.16）、`functional-spec.md`（F1〜F6）
- `construction/u6-recording/nfr-design/performance-design.md`（時間の配分と測り方の形、NFR7.29、NFR7.30）
- `construction/u5-assignment-calendar/nfr-design/performance-design.md`（測り方の形）
- 既存コード（読むだけ）: `packages/backend/src/entries/api.ts`（`REQUEST_START`・`REQUEST_END`・`durationMs`・`path`、ルート表）、`middleware/requireAuth.ts`（`getUserStatus` の 1 回の読み取り）、`services/calendarService.ts`（`changeDutyChild` の読み直し、`MAX_CHANGE_ATTEMPTS`）、`repositories/calendarRepository.ts`（`findDuty` の GetItem 3 回、`buildMonthGuard`・`buildUnitPriceGuard`・`writeTransaction`）、`infrastructure/lib/app-stack.ts`（`api` のメモリ 256 MB、時間切れ 30 秒）

## Assumptions & Open Questions

- [assumption] NFR7.33 の代表に markDone を選ぶのは、5 とおりの操作のうち取引の項目が最も多く（単価の `ConditionCheck` を足す）、単価の読み取りが 1 回増えるため、最も遅くなりうる操作だからです。cancel・markSkipped・unmarkSkipped が markDone より速いことは、呼び出しの回数（5 対 6）からも分かります。測定で疑わしければ各操作を 20 回ずつ測ります
- [assumption] 冷たい起動の Node.js 22・256 MB の起動の遅れは、U6 までと同じく 1 秒台に収まる見込みですが、U7 の操作でもまだ測っていません。測って足りなければ NFR7.36 の 7. の手順で直します
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は画面が持っているカレンダーから数えるので、確定の API の呼び出し数（NFR7.35）には含めません。カレンダーの読み取り自体の速さは U5 の NFR7.20 で確かめ済みです
