# 見守りの要件（Observability）— U9 お小遣いの額

U9（`u9-allowance`）の見守りの要件です。U1〜U8 の要件（ログの形、リクエスト ID、30 日、書かないもの。NFR2.5〜NFR2.8、NFR2.32、NFR2.63〜NFR2.66、NFR7.6、NFR7.24、NFR7.49）をそのまま使います。U9 は `api` の Lambda の読み取り専用の入口が 1 つだけです。作り手への知らせ（15 分以内）の仕組みは U10 で入れます。

U9 のログで特に守ることは、**名前も金額も残さない**ことです。お小遣いの画面のログは、金額に最も近い場所にあるので、残してよいもの（件数と ID）と残さないもの（名前・単価・額・合計）を、はっきり分けます（NFR2.76）。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.74 | お小遣いを読んだことを、1 回の要求につき `ALLOWANCE_COMPUTED`（info）を **1 件**残す（BR10.15）。項目は `familyId`、`month`（`YYYY-MM`。`current` は実際の月）、`childCount`（返した子供の行の数）、`lineCount`（内訳の行の合計の数）、`dutyCount`（読んだ月の担当の数）、`doneCount`（数えた「済」の数）、`departedChildCount`（抜けた子供の行の数）、`anomalyCount`（NFR2.75 の異常の全数。ログの行を省いた分も含む）、`durationMs`（月の読み取りの開始から集計の終わりまで）。あわせて、既存の `setRequestMetrics({ dutyCount })` で要求の測定値に担当の数を残す（U5 の NFR7.24 と同じ。3 秒の目標を担当の数と照らせるように）。**金額・名前・合計は入れない**。失敗した要求では `ALLOWANCE_COMPUTED` を出さず、失敗は `REQUEST_ERROR` に残す（NFR2.77） | ログの出し方の単体テストで、成功した 1 回の要求に `ALLOWANCE_COMPUTED` が 1 件だけ出て、上の項目がそろい、数が前提データと一致すること（`doneCount` が「済」の数、`childCount` が行の数）。失敗させた要求では出ないこと。0 件の月（担当なし・子供なし）でも 1 件出て、数が 0 であること |
| NFR2.75 | **異常なデータを検索できる形で残す**（BR10.13、NFR2.70）。(a) `ALLOWANCE_DUTY_WITHOUT_PRICE`（warn。`familyId`、`dutyId`）: 「済」なのに `unitPrice` が空（`undefined`／`null`）の担当を数えなかったとき。(b) `ALLOWANCE_CHORE_TYPE_MISSING`（warn。`familyId`、`choreTypeId`）: 「済」の担当の種類が一覧にないとき（同じ `choreTypeId` は 1 要求につき 1 行）。(c) `ALLOWANCE_DUTY_OWNER_NOT_CHILD`（warn。`familyId`、`dutyId`）: 担当の子供が管理者の ID だったとき。**単価 0 円の担当は異常ではなく、ログも残さない**。1 回の要求で出す異常の行は、**種類ごとに 20 行まで**（全体がおかしいデータでも、300 件の担当で 300 行にならないように）。超えた分は行を出さず、数だけを `ALLOWANCE_COMPUTED.anomalyCount` に入れる。利用者は LINE の ID ではなくアプリの `userId` を使うが、これらのイベントには利用者の ID も入れない（担当と種類の ID だけで調べられる） | 3 種類の異常を 1 件ずつ入れて、それぞれのイベントが `familyId` と指定の ID だけで 1 件出ること。単価 0 円の担当でログが出ないこと（S14）。異常な担当を 25 件入れたとき、行が 20 行で、`anomalyCount` が 25 になること。`dutyId`・`choreTypeId` 以外の項目（名前・金額）が入っていないこと |
| NFR2.76 | **ログに、名前・金額・秘密の情報・LINE の ID を残さない**（BR10.15）。書かないもの: 子供・管理者の表示名、お手伝いの名前、**単価・小計・合計・加算・減額の金額と理由**（U11 で入る分も含む）、`count`（回数）のうち金額に結びつくもの（`ALLOWANCE_COMPUTED` に入れる `doneCount` などの全体の件数は、金額ではないので残す）、**LINE のユーザー ID とグループ ID**、セッションの文字列（`Authorization` ヘッダーの値）、リクエスト本文（読み取りには本文がない）、秘密の値の全部（U1 の NFR2.8 と同じ）。残してよいもの: `familyId`、`month`、`dutyId`、`choreTypeId`、各種の件数、`durationMs`、`requestId`。思いがけない失敗は、U1 の `describeError` を通す（例外の文に名前や金額が入らないことを、U9 のコードが保つ）。**異常（NFR2.75）の行にも名前や金額を入れない** | 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・加算・減額の理由、ほかの数と重ならない目印の単価（例 98765）・合計）を入れたデータで、成功、0 円の月、異常な担当（3 種類）、読み取りの失敗、`findDisplayName` の `NOT_FOUND`、`role: system` の呼び出しの全部の分かれ道で処理し、出たログの全行に目印の文字が 1 つも含まれないこと（金額の目印の数字も含まれないこと）。`ALLOWANCE_COMPUTED` と異常の行の項目名が、NFR2.74・NFR2.75 の許可した一覧と一致すること |
| NFR2.77 | U9 の失敗を、ログから `event` と `reason`（または `error`）で検索できる形で残す。対象: `REQUEST_ERROR`（`path` が `/v1/months/:month/allowances`。読み取りの失敗による 500 `INTERNAL` と、思いがけない例外）、`ALLOWANCE_DUTY_WITHOUT_PRICE`・`ALLOWANCE_CHORE_TYPE_MISSING`・`ALLOWANCE_DUTY_OWNER_NOT_CHILD`（NFR2.75）。401・403・422 は、使う人の操作の結果なので失敗に数えず、U1 の既存のログの形（`REQUEST_END` のステータス）のままにする。U9 は指標とアラームを足さない（NFR1.36）。U10 が、これらのイベントを作り手への知らせの対象に入れる（15 分以内。NFR2）。それまでは、作り手が CloudWatch Logs で `REQUEST_ERROR`／500 と `ALLOWANCE_*` を検索して気づく。**引き継ぎは下の「U10 への引き継ぎ」に書く** | 上のイベントが 1 行 1 件の JSON で `event` と `reason`（または `error`）を持つこと（NFR2.5 の形）。引き継ぎの書き込みがこの文書にあること（レビュー） |
| NFR7.58 | U9 の経路も、かかった時間をログに残す（U1 の NFR7.6、U5 の NFR7.24、U8 の NFR7.49）。`REQUEST_END.durationMs`（既存。パスの型 `/v1/months/:month/allowances`）と `ALLOWANCE_COMPUTED.durationMs`、要求の測定値の `dutyCount` で、3 秒の目標（NFR7.50〜NFR7.52）を、サーバー側の時間（NFR7.54）と担当の数で照らして原因を分けられる。冷たい起動かどうかは、Lambda の `REPORT` の行の `Init Duration` で見分けられる（追加の実装は要らない）。読み取りの回数は、ログには出さず、単体テスト（NFR7.55）で守る（呼び出しごとのログは量が増える割に目的に合わないため） | ログから `durationMs` と `dutyCount` を読めること。ステージングの測定で、`REPORT` の `Init Duration` の有無で冷たい起動を数えられること |

## ログの項目の対応

| 場面 | イベント | 使う値 |
|------|---------|--------|
| お小遣いの読み取りの成功 | `ALLOWANCE_COMPUTED`（info） | `familyId`、`month`、`childCount`、`lineCount`、`dutyCount`、`doneCount`、`departedChildCount`、`anomalyCount`、`durationMs` |
| 「済」なのに単価が空 | `ALLOWANCE_DUTY_WITHOUT_PRICE`（warn） | `familyId`、`dutyId` |
| 種類が一覧にない | `ALLOWANCE_CHORE_TYPE_MISSING`（warn） | `familyId`、`choreTypeId` |
| 担当の子供が管理者 | `ALLOWANCE_DUTY_OWNER_NOT_CHILD`（warn） | `familyId`、`dutyId` |
| 読み取りの失敗・思いがけない例外 | `REQUEST_ERROR`（既存） | `describeError` の結果（名前・金額を含まない）、`requestId` |
| 共通 | `REQUEST_START` / `REQUEST_END`（既存） | `path`、ステータス、`durationMs`、`dutyCount`、`requestId`（NFR2.6）、環境（NFR2.5） |

## 見守りの指標（SLI／SLO）

| 指標 | 目標 | 見る場所 |
|------|------|---------|
| 画面の表示時間（S5） | 95% が 3 秒以内（NFR7.50〜NFR7.52） | ステージングの画面録画の測定（反映のたびの定常の指標は置かない。費用 0 円のため。NFR1.36） |
| サーバー側の処理時間 | `REQUEST_END.durationMs` の 95% が 1,500 ミリ秒以内（NFR7.54。補助） | CloudWatch Logs（ログのクエリ） |
| 失敗の数 | 500 `INTERNAL` と `ALLOWANCE_*` の件数（数値目標は置かない。NFR2：稼働率の数値目標はない） | CloudWatch Logs（`event` と `reason` の検索） |
| 異常なデータの数 | `anomalyCount` が 0 であること（通常の書き込みでは起きない前提。BR10.13） | CloudWatch Logs（`ALLOWANCE_COMPUTED.anomalyCount` が 1 以上の行の検索） |

ダッシュボードとアラームは U9 では足しません（NFR1.36）。作り手への知らせの仕組みは U10 で入れます。

## U10 への引き継ぎ

U10 の nfr-requirements は、この節を読み取り元の 1 つにしてください（U8 の NFR2.66 と同じ形）。

- 作り手への知らせ（15 分以内）の対象に入れるイベント: `REQUEST_ERROR`（`path` が `/v1/months/:month/allowances`）、`ALLOWANCE_DUTY_WITHOUT_PRICE`、`ALLOWANCE_CHORE_TYPE_MISSING`、`ALLOWANCE_DUTY_OWNER_NOT_CHILD`（機能設計の BR10.13 が「作り手に知らせる対象」としたもの）、`ALLOWANCE_COMPUTED` の `anomalyCount` が 1 以上のもの（異常の行を省いた分も拾うため）
- U10 の月末のまとめが `getAllowances(ctx, month)` を呼んで失敗したときは、例外を送信の失敗と同じ扱いで知らせる（BR10.17、NFR2.68）
- U10 が `role: system` で呼ぶときの型と本人の補いの扱いは、NFR2.73 のとおり（U9 のコード生成で直す）
- これらの異常は、画面にもグループにも出ない（画面は開ける）ので、ログでしか分からない。額が実際より少なく見えうる

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR4、NFR5、NFR7）
- `construction/u9-allowance/functional-design/rules.md`（BR10.13、BR10.15、BR10.16、BR10.17）、`functional-spec.md`（F5、シナリオ S14・S30・S30b・S31）
- `construction/u1-skeleton-family/nfr-requirements/observability-requirements.md`（NFR2.5〜NFR2.8、NFR7.6）
- `construction/u5-assignment-calendar/nfr-requirements/observability-requirements.md`（NFR2.32、NFR7.24。読み取りの入口の測定値と件数のログ）
- `construction/u7-review-confirm/nfr-requirements/observability-requirements.md`（NFR2.51〜NFR2.53、NFR7.38）
- `construction/u8-swap/nfr-requirements/observability-requirements.md`（NFR2.63〜NFR2.66、NFR7.49。名前・金額を残さない書き方、U10 への引き継ぎの形）
- 既存コード（読むだけ）: `lib/logger.ts`（`describeError`、`setRequestMetrics` の `dutyCount`、`logger`）、`entries/api.ts`（`REQUEST_START`／`REQUEST_END`／`REQUEST_ERROR`）、`services/calendarService.ts`（`setRequestMetrics({ dutyCount })` の使い方）

## Assumptions & Open Questions

- [assumption] `ALLOWANCE_COMPUTED` に入れる `childCount`、`lineCount`、`doneCount` などの件数は、金額ではなく、金額を推測できる量でもない（家族 4 人の子供の人数と回数の全体）と見て残します。回数の内訳（種類ごと・子供ごと）は残しません。件数も残したくない場合は、承認の場で指示してください
- [assumption] 機能設計の BR10.15 が挙げた `ALLOWANCE_COMPUTED` の項目（`familyId`、`month`、`childCount`、`lineCount`、`dutyCount`）に、`doneCount`、`departedChildCount`、`anomalyCount`、`durationMs` を足しました。足した項目は、どれも件数か時間で、名前も金額も入りません。調べもの（異常が出た要求の特定、遅い月の原因）に役立つためです
- [assumption] 異常の行の上限（種類ごとに 20 行）は、ログの量を抑える目安です。データ全体がおかしくなるほどの異常は、`anomalyCount` が大きいことで気づけます
- [assumption] 読み取りの回数をログに出さないのは、1 回の要求に 5 回前後の読み取りがあり、呼び出しごとのログは量が増える割に、回数は単体テストで守れるためです（NFR7.55）
- [assumption] 画面（ブラウザ）側のエラーの収集（画面が描けなかったなど）は、U1〜U8 と同じく、この単位では足しません。画面の失敗は API の応答（500 や通信の失敗）として裏側に現れるものだけを見ます
- 作り手への知らせの仕組み（何で受け取るか）は U10 で決めます
