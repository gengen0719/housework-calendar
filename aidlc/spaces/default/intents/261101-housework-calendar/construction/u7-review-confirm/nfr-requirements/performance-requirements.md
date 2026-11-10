# 速さの要件（Performance）— U7 確認・修正と確定

U7（`u7-review-confirm`）の速さの要件です。U1 の要件（NFR7.1〜NFR7.6）と U5 の要件（NFR7.20〜NFR7.24）、U6 の要件（NFR7.25〜NFR7.32）をそのまま使い、U7 の操作に当てはめます。U7 は画面用 API だけで、LINE の経路はありません（機能設計の「U7 で作る画面用 API と LINE の操作」）。入口は 3 つです。`POST /v1/duties/{dutyId}/status`（状態の変更）、`PUT /v1/months/{month}/confirmation`（確定）、`DELETE /v1/months/{month}/confirmation`（確定の取り消し）。U7 では人に聞くことはありませんでした。決めることは、要件、U1〜U6 の要件、U7 の機能設計の答えから決まっています。

## 目標

NFR7（画面の表示と操作への返事は 95% が 3 秒以内）を、U7 の 3 つの操作に当てはめます。「3 秒以内」は 95% が満たすことで、確かめ方は「20 回行い、19 回以上が 3 秒以内」です（NFR7、U6 の NFR7.29 と同じ形）。測り方の条件は「測り方の条件」（NFR7.36）にまとめます。

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.33 | 状態の変更。日の詳細で状態を変えるボタンを押し、確認で「はい」を押してから、カレンダー（または日の詳細）が読み直されて新しい状態の表示になるまで（`POST /v1/duties/{dutyId}/status` と、続けて読み直す `GET /v1/months/{month}/calendar` または日の詳細の読み直し）。5 とおりの操作（cancel・markDone・markSkipped×2・unmarkSkipped）のうち、取引の項目が最も多い markDone（担当の `UpdateItem` ＋ 月の `ConditionCheck` ＋ 単価の `ConditionCheck`）を代表に測る | 20 回行い、19 回以上が 3 秒以内（95%） | ステージングで、家族 4 人分（子供 3 人、種類 4 つ、1 か月分の担当約 124 件。U5 の NFR7.20・U6 の NFR7.29 と同じ量）のデータで 20 回行い、「はい」を押した瞬間と新しい状態が出た瞬間を画面録画から読み取る。測り方の条件は NFR7.36。使う担当は U6 の測定とは別の、過ぎた日の担当にする |
| NFR7.34 | 月の確定・確定の取り消し。カレンダーの月の見出しの「この月を確定する」または「確定を取り消す」を押し、確認で「はい」を押してから、カレンダーが読み直されて「確定済み」の表示が出る（または消える）まで（`PUT`／`DELETE /v1/months/{month}/confirmation` と、続けて読み直す `GET /v1/months/{month}/calendar`） | 確定・取り消しそれぞれ 20 回行い、19 回以上が 3 秒以内（95%） | NFR7.33 と同じ方法で、確定と取り消しを各 20 回。行がまだ無い月（記録のない月）への初回の確定（`attribute_not_exists` 条件の Put で確定行を作る。BR8.11）も 3 回含め、すべて 3 秒以内であること（行の有無で書き方が分かれるため） |
| NFR7.35 | 呼び出しの数。1 回の操作での DynamoDB の呼び出しと外部への通信の回数 | 状態の変更（`POST /duties/{dutyId}/status`）: DynamoDB は通常 6 回以内（単価を読む markDone。単価を読まない cancel など 4 とおりは 5 回以内）、取引の読み直しが入っても 11 回以内（markDone。ほかは 9 回以内）。確定・取り消し（`PUT`／`DELETE`）: 2 回以内。外部への通信（HTTP）は、どの操作も 0 回（U7 は LINE を呼ばない。NFR1.30）。内訳（状態の変更の markDone）: 利用者の確かめ 1（`requireAuth` の `getUserStatus` で利用者の記録を 1 回読み、`familyId`・`role`・`friendStatus` をそこから取る。セッションは SSM・DynamoDB を使わない。NFR4.65。`requireMembership`・`requireAdmin` は AuthContext の値を見るだけで DynamoDB を読まない）+ 担当の探索 3（`findDuty` の `DID#` → 担当 → 月の状態）+ 単価 1 + 取引 1 = 6 回（通常）、読み直し（NFR2.45）で担当の探索 3 + 単価 1 + 取引 1 が増えて最大 11 回、9 回を超える場合は markDone の読み直しだけで、cancel など単価を読まない操作は通常 5 回（利用者 1 + 担当の探索 3 + 取引 1）・読み直し 9 回に収まる。確定・取り消しは、利用者の確かめ 1 + 月の状態の 1 回の書き込み = 2 回（確定は件数の注意のためのカレンダー読み取りは画面側で、API は書き込みだけ） | 単体テストで、DynamoDB のクライアントを差し替えて回数を数える。担当 1 件、124 件のデータで同じ上限に収まること。読み直し（取引の条件で断る差し替え）のときの回数も上限に収まること。`fetch`（LINE）が 1 回も呼ばれないこと |
| NFR7.36 | 測り方の条件（NFR7.33、NFR7.34 に共通） | 下の「測り方の条件」のとおり | 測定の記録を Build and Test の成果物に残す（NFR8.13） |

## 測り方の条件

NFR7.36 の中身です。U6 の NFR7.30 と同じ考え方で、U7 の画面操作に合わせます。

1. **環境と量:** ステージングで、家族 4 人分（管理者 1 人、子供 3 人。お手伝いの種類 4 つ。1 か月分の担当約 124 件）。データは、アプリの画面（割り当ての保存、記録）で作り、データを直接書き換えて用意しない（ステージングでも同じ。NFR6.8、U6 の NFR7.30 の 1. と同じ）。U7 の状態の変更は管理者の操作なので、U6 の LINE の測定のような「1 日に種類の数まで」の制約は受けません（管理者は過ぎた日の担当も直せる）。測る担当は、過ぎた日の「済」「未」「×」を混ぜて用意し、5 とおりの変化のうち代表の markDone（未→済、×→済）を 20 回測れるようにします。markDone を 20 回測るには、「未」または「×」の担当が 20 件以上必要なので、過ぎた複数の日の担当を使うか、1 か月分（約 124 件）の中から「未」の担当を選びます。markDone は 1 件測るごとにその担当が「済」になり同じ担当では測り直せないため、過ぎた日の「未／×」担当を 20 件以上そろえる前提を、U6 の NFR7.30 の (a)(b) と同じ粒度で確かめます。測定月の経過日数によっては過ぎた日の「未／×」が 20 件に足りないことがあるので、20 回は次の (a) か (b)、または両方の組み合わせで行います。(a) 測定月の経過日数が十分にあり（家族 4 人・種類 4 つで 1 日あたり最大 12 件程度の過ぎた日の担当が見込めるため、5 日以上の経過があれば 20 件以上）、過ぎた複数の日の「未／×」担当を使う。(b) ステージングに家族を複数用意し（それぞれ管理者 1 人と子供 1 人以上）、家族ごとの過ぎた日の「未／×」担当を合わせて 20 件以上をそろえる。確定・取り消しは、確定していない月を 1 つ用意し、確定 → 読み直し → 取り消し → 読み直しを繰り返して各 20 回測ります（確定と取り消しは version を条件にせず、二度押しや連打でも最後の結果にそろう。BR8.14）。測定の日付、家族、回数を表に残します。
2. **端末:** アプリの画面（スマートフォンの LINE の中の LIFF、またはパソコンのブラウザ）で、ステージングに対して測ります。家族が使う端末に近い方で測り、測った端末を記録に残します。
3. **冷たい起動を含める:** `api` の Lambda の起動の遅れ（コールドスタート）を、家族が実際に使うときと同じ割合で含めます。管理者が確認・修正をするのは 1 日に数回で、前の操作から間が空いて冷たい起動になることが多いので、20 回のうち 10 回以上は冷たい起動で行います。冷たい起動かどうかは、CloudWatch Logs の `REPORT` の行に `Init Duration` があるかで見分けます（`api` の Lambda）。冷たい起動が 10 回に届いたかは、`REPORT` の `Init Duration` の数で確かめてから、20 回を数えます。足りない分は、U5・U6 と同じく、コードが変わるステージングへの反映をするか、数十分以上要求を送らずに待って作ります。環境変数や設定を手で書き換えて実行環境を入れ替える方法は使いません（NFR6.8、U6 の NFR7.30 の 3. と同じ）。
4. **何を 1 回と数えるか:** NFR7.33 は、確認の「はい」を押してから新しい状態の表示が出るまでを 1 回とします。確認の 1 行を読んで「はい」を押すまでの人の迷う時間は含めません。NFR7.34 も同じく、確認の「はい」から「確定済み」の表示が出る（または消える）までを 1 回とします。
5. **時間の読み取り:** 端末の画面録画（1 秒に 30 コマ以上）から、「はい」を押した瞬間と、カレンダー（または日の詳細）が新しい状態になった瞬間のコマを読み取り、差を出します。
6. **数え方:** 20 回の結果をすべて表に残します。失敗した回（表示が変わらない、エラー）も 1 回と数え、3 秒以内に入れません。1 回も除きません。
7. **届かなかったとき:** 19 回に届かなかったときは、除外や目標の引き下げをしません。サーバー側の時間（`REQUEST_END.durationMs`。NFR7.37）、冷たい起動の回数、DynamoDB の呼び出し数（NFR7.35）から原因を調べ、直してから、新しい 20 回を測り直します。測り直しにも冷たい起動を 10 回以上含めます（3.）。直す手段の例（これで足りないときは設計に戻す）: 配信物の大きさを減らす、起動時の読み込み（パラメータストア）をまとめる、Lambda のメモリを増やす（256 MB から 512 MB へ。無料枠の中に収まる量）。常に温めておく仕組み（Provisioned Concurrency など、費用がかかるもの）は、費用 0 円（NFR1）に反するので使いません（U6 の NFR7.30 の 7. と同じ）。

## サーバー側の補助の目標

| ID | 対象 | 目標 | 確かめ方 |
|----|------|------|---------|
| NFR7.37 | サーバー側の処理時間（補助の目標）。受け口全体の時間（ログの `REQUEST_END.durationMs`。`entries/api.ts` の `handler` の最初から最後まで） | 状態の変更・確定・取り消しの 95% が 2,000 ミリ秒以内。残りを、画面から CloudFront・Lambda への届く時間と、画面が読み直して描くまでの時間に割り当てる | NFR7.33、NFR7.34 の測定と同じ期間のログから `REQUEST_END.durationMs` を取り出して並べる。画面録画の差と照らして原因を切り分ける（冷たい起動の `Init Duration` は `REPORT` の行で別に読む）。この補助の目標は目安で、合格の判断は NFR7.33・NFR7.34 の画面録画の結果だけで行う（U6 の NFR7.27 と同じ考え） |

## 量の前提

家族 4 人（子供 3 人）で、管理者の確認・修正は 1 日に多くても数回、月の確定・取り消しは 1 か月に数回です。1 か月分の担当（約 124 件）を 1 回の `GET /v1/months/{month}/calendar` で読む量は U5 の NFR7.20 で確かめ済みで、U7 は新しい読み取りの経路を足しません。状態の変更の取引は 3 項目（担当の `UpdateItem` ＋ 月の `ConditionCheck` ＋ 単価の `ConditionCheck`）で、DynamoDB の取引の上限（100 項目）に比べて十分小さく、担当の数・種類の数・家族の人数では増えません（NFR3.11）。

## Sources

- `inception/requirements-analysis/requirements.md`（NFR7、NFR1、FR6.1〜FR6.6）
- `inception/user-stories/stories.md`（US6.1、AC6.1.1〜AC6.1.11。NFR7 の対応）
- `inception/contract-design/contract-summary.md`（C1 の `POST /duties/{dutyId}/status`・`PUT`・`DELETE /months/{month}/confirmation`、C8 `changeDutyStatus`・`confirmMonth`・`unconfirmMonth`）
- `construction/u7-review-confirm/functional-design/functional-spec.md`（F1〜F6、U7 で作る画面用 API と LINE の操作）、`rules.md`（BR8.4、BR8.6、BR8.11、BR8.14）
- `construction/u1-skeleton-family/nfr-requirements/performance-requirements.md`（NFR7.1〜NFR7.6）
- `construction/u5-assignment-calendar/nfr-requirements/performance-requirements.md`（NFR7.20〜NFR7.24。測り方の形）
- `construction/u6-recording/nfr-requirements/performance-requirements.md`（NFR7.25〜NFR7.32、NFR7.29 の画面の測定、NFR7.30 の測り方の条件）
- 既存コード（読むだけ）: `packages/backend/src/entries/api.ts`（`REQUEST_START`・`REQUEST_END`・`durationMs`、ルート表）、`services/calendarService.ts`（`changeDutyChild` の読み直しの形、`MAX_CHANGE_ATTEMPTS`）、`repositories/calendarRepository.ts`（`findDuty` の GetItem 3 回、`buildMonthGuard`・`buildUnitPriceGuard`、`writeTransaction`）、`infrastructure/lib/app-stack.ts`（`api` のメモリ 256 MB、時間切れ 30 秒）

## Assumptions & Open Questions

- [assumption] NFR7.33 の代表に markDone を選ぶのは、5 とおりの操作のうち取引の項目が最も多く（単価の `ConditionCheck` を足す）、単価の読み取りが 1 回増えるため、最も遅くなりうる操作だからです。cancel・markSkipped・unmarkSkipped は単価を読まず、取引の項目も 2 つなので、markDone が 3 秒以内なら残りも収まる見込みです。測定で疑わしければ各操作を 20 回ずつ測ります
- [assumption] 冷たい起動の Node.js 22・256 MB の起動の遅れは、U6 までと同じく、パラメータストアの読み込み（`getConfig`）を含めて 1 秒台に収まる見込みですが、U7 の操作でもまだ測っていません。測って足りなければ NFR7.36 の 7. の手順で直します
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は、画面が持っているカレンダー（`getMonthCalendar` の結果）から数えるので、確定の API の呼び出し数（NFR7.35）には含めません。カレンダーの読み取り自体の速さは U5 の NFR7.20 で確かめ済みです
