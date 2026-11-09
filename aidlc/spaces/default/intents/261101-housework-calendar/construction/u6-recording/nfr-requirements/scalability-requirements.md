# 量と費用の要件（Scalability）— U6 記録

U6（`u6-recording`）の量と費用の要件です。U1〜U5 の要件（NFR1.1〜NFR1.22、NFR3.1〜NFR3.6）をそのまま使います。費用 0 円（NFR1）の条件のうち、LINE の公式アカウントの無料枠（月 200 通）に U6 が関わらないこと（reply は無料、push は使わない）を、ここで要件にします。

## 量の見込み

子供 3 人が、1 人あたり 1 日に「やった」を 1〜4 回押します。1 回の記録で、選択肢の表示（`record.list`）と記録（`record.do`）の 2 イベントが `line` の Lambda に届きます。1 日に多くて 24 イベント、1 か月に約 720 イベントで、Lambda の無料枠（月 100 万回）の 0.1% 未満です。1 年の記録は約 1,500 件（1 日に約 4 件の担当）で、U5 が作った担当の項目を書き換えるだけなので、保存する量は増えません。画面からの記録は、これよりずっと少ない見込みです。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.23 | U6 の経路は、LINE への返事をすべて reply で送り、push、multicast、broadcast を使わない。画面からの記録（`POST /v1/duties/{dutyId}/record`）は LINE を呼ばない（BR7.9、FR5.5）。公式アカウントの無料のメッセージ数（月 200 通。NFR1）に、U6 の操作は 1 通も足さない | 単体テストで、U6 のコードが LINE の `/v2/bot/message/push`、`/multicast`、`/broadcast` を呼ばないこと。画面用 API の記録で `fetch` が 1 回も呼ばれないこと |
| NFR1.24 | 1 つのイベントにつき、reply の呼び出しは 1 回だけ。1 回の reply に入れるメッセージは 3 通以内（見出しの文、Flex Message の carousel、選べない文字の並び）で、LINE の 1 回の reply の上限（5 通）に収める | 単体テストで、reply の呼び出しが 0 回か 1 回で、`messages` が 3 件以内であること。13 件以上の「未」の担当でも同じであること |
| NFR1.25 | U6 で新しく費用のかかる AWS のサービス、Lambda 関数、DynamoDB のテーブル・索引、CloudWatch のカスタム指標（メトリクスフィルター）、アラームを足さない。処理は U1 の `line` と `api` の Lambda に足し、データは U5 の `Calendar` と U4 の `ChoreTypes` の既存の項目を書き換える。ログは U1 の既存のログ（30 日。NFR2.7）に出す。指標とアラームは U10 で入れる（無料枠のカスタム指標の数を、U10 が見て使う） | CDK のテストで、U6 の前後に、テーブル・Lambda・ログのグループ・指標・アラームの数が変わらず、`line` の権限と環境変数だけが変わること（NFR4.63） |
| NFR1.26 | 記録で読むデータは、その子供の家族の月の Query（月の接頭辞つき）と、`GetItem` と、種類の一覧の Query 1 回だけにする。Scan、BatchGetItem、BatchWriteItem を使わない。呼び出しの数は担当の数では増えない（NFR7.28）。DynamoDB の従量の課金は、月に約 720 イベント、各 10 回前後の呼び出しの見込みで 1 円に満たない（U1〜U5 と同じ前提）。AWS の請求額は 0 円のまま | 単体テストで、読み取りが家族のキーつき・強い整合性であること、Scan 系の呼び出しがないこと。毎月の請求を作り手が見る（NFR1.5） |
| NFR1.27 | ステージングで NFR7.25、NFR7.26 の測定を行う前後で、公式アカウントの当月の送信数（LINE Official Account Manager、または Messaging API の送信数の取得）を比べ、U6 の操作で送信数が増えていない（reply は数えられない）こと。本番では、反映後の月の送信数が、返事ではないお知らせの上限（月 128 通。NFR1）を超えないこと | 20 回 × 2 種類の測定の前後のステージングの送信数が同じであること。本番は反映後に作り手が月の送信数を見る |
| NFR1.28 | リッチメニューの設定は、作り手が環境ごとに 1 回行うスクリプトでだけ行う（LINE のリッチメニューの API は無料）。Lambda は、実行のときにリッチメニューの API を呼ばない（呼ぶと、トークンを使う回数と権限の範囲が増えるため） | 単体テストで、`line` と `api` の Lambda のコードにリッチメニューの API の呼び出しがないこと |
| NFR3.7 | 記録の操作ではないイベントは、二度処理しない記録も含め、DynamoDB に書き込まない。U6 は受け口の `accepts` を、「`source.type` が `user` で、data が `record.list` か `record.do` の正しい形」の postback に限って足す（NFR4.54、NFR4.55）。1 対 1 のほかの postback と message、グループの会話の量が増えても、書き込みは増えず、費用は Lambda の無料枠に収まる（U3 の NFR3.4 を引き継ぐ） | 単体テストで、記録の操作ではない 1 対 1 の message と postback、形の外れた `record.do` で、イベントの記録の書き込みがなく、返事もないこと |
| NFR3.8 | 1 回の返事の大きさに上限を置く。担当のバブルは `MAX_RECORD_CHOICES`（12 個。1 か所に定数で置く）まで、「未」が 13 件以上のときは先頭の 12 件だけをバブルにして、案内文を添える（BR7.2）。postback の data は約 60 文字で、300 文字を超えない。種類の名前と選べない文字の並びは、LINE の長さの上限（代替テキスト、ボタンの文字）を超えないよう切る。選べない並びの行数は、種類の数まで | 単体テストで、「未」が 12 件・13 件・種類の名前が長い場合に、バブルが 12 個以内で、案内文が 13 件のときだけ付くこと、各文字列が上限内であること。LINE の公式の上限の確かめは Assumptions |
| NFR3.9 | 処理は U1 で決めた同時実行数の上限（NFR1.6、NFR3.6）の中で動く。記録の取引は 3 項目（担当の更新、月の状態の確かめ、種類の確かめ）で、DynamoDB の取引の上限（100 項目）に比べて十分小さい。1 日に複数の子供が同時に押しても、書き込みは担当ごとの項目に分かれ、競合は同じ担当を同時に記録したときだけ起きる（NFR2.35） | CDK のテストで、`line` の同時実行数の設定が U1 の決めた値のままであること。単体テストで、取引の項目数が 3 であること |
| NFR3.10 | U6 は、新しい項目や保存先を増やさない。1 年（約 1,500 件）の担当の記録で、担当の項目に増えるのは `recordedAt`、`recordedBy`、`unitPrice` の 3 つの属性だけ（1 件あたり約 100 バイト） | 単体テストで、書き込みの更新式が機能設計の 6 項目だけを書くこと |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3、FR5.2、FR5.5）
- `construction/u6-recording/functional-design/entities.md`（新しい保存先なし、書く 6 項目）、`rules.md`（BR7.2、BR7.9）、`functional-spec.md`（配備）
- `construction/u1-skeleton-family/nfr-requirements/scalability-requirements.md`（NFR1.1〜NFR1.7、NFR3.1、NFR3.2）
- `construction/u3-notification-group/nfr-requirements/scalability-requirements.md`（NFR1.12、NFR3.4）
- `construction/u5-assignment-calendar/nfr-requirements/scalability-requirements.md`（NFR1.19〜NFR1.22、NFR3.6）
- 既存コード（読むだけ）: `entries/line.ts`（`accepts`）、`repositories/calendarRepository.ts`（索引なし、強い整合性）、`infrastructure/lib/data-stack.ts`、`infrastructure/lib/app-stack.ts`

## Assumptions & Open Questions

- [assumption] 1 回の reply に入れられるメッセージは 5 通まで、LINE の carousel は最大 12 個のバブルまでと仮定しています（機能設計の仮定と同じ）。LINE の公式の資料はこの段階では確かめられていないので、コード生成で確かめ、違えば `MAX_RECORD_CHOICES` と NFR3.8 の件数を直します
- [assumption] 返事のメッセージ数と reply が無料で月 200 通に数えられないことは、LINE の料金の説明に基づく仮定です。NFR1.27 の測定の前後の送信数の比較で、ステージングの公式アカウントで確かめます
- カスタム指標とアラームを U6 で足さないのは、費用 0 円と無料枠の数を守るためです。U6 の失敗をログから見つけられるようにする要件は NFR2.43 にあります
