# 量と費用の要件（Scalability）— U7 確認・修正と確定

U7（`u7-review-confirm`）の量と費用の要件です。U1〜U6 の要件（NFR1.1〜NFR1.29、NFR3.1〜NFR3.10）をそのまま使います。U7 は画面用 API だけで LINE を呼ばないので、公式アカウントの無料のメッセージ数（月 200 通。NFR1）には 1 通も関わりません。費用 0 円（NFR1）を、新しい課金対象を足さないことと、LINE を使わないことで守ります。

## 量の見込み

管理者 1 人が、1 日に多くても数回、確認・修正（状態の変更）をします。月の確定・取り消しは 1 か月に数回です。1 か月に `POST /v1/duties/{dutyId}/status` が多くて数十回、`PUT`／`DELETE /v1/months/{month}/confirmation` が数回で、`api` の Lambda の無料枠（月 100 万回）のごく一部です。U7 は新しい保存先を作らず、U5 が作った担当の項目と、U5 が持つ月の状態を書き換えるだけなので、保存する量は増えません（月の状態に `confirmedAt`・`confirmedByUserId`・`version` の 3 属性が足りますが、1 家族・1 月に 1 件で、量に数えるほどではありません）。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR1.30 | U7 は LINE を 1 通も呼ばない。状態の変更・確定・取り消しは画面用 API で、`reply`・`push`・`multicast`・`broadcast` を使わない。公式アカウントの無料のメッセージ数（月 200 通。返事ではないお知らせは月 128 通の枠。NFR1）に、U7 の操作は 1 通も足さない。申し出の自動の取り下げ（BR8.15）も、U7 は `onDutyReassigned` を呼ぶ口を用意するだけで、U8 まで登録がなく、何も送らない | 単体テストで、U7 のコード（状態の変更・確定・取り消しのサービスとハンドラー）が `fetch`（LINE の API）を 1 回も呼ばないこと。`onDutyReassigned` の登録がないとき、呼んでも何も起きないこと |
| NFR1.31 | U7 で新しく費用のかかる AWS のサービス、Lambda 関数、DynamoDB のテーブル・索引、CloudWatch のカスタム指標（メトリクスフィルター）、アラームを足さない。処理は U1 の `api` の Lambda に足し、データは U5 の `Calendar` の既存の項目を書き換える。ログは U1 の既存のログ（30 日。NFR2.7）に出す。指標とアラームは U10 で入れる（U10 が U7 の失敗のイベントも対象に入れる。NFR2.53） | CDK のテストで、U7 の前後に、テーブル・Lambda・ログのグループ・指標・アラームの数が変わらず、`api`・`line` の権限と環境変数が変わらないこと（NFR4.71、NFR4.72） |
| NFR3.11 | 状態の変更の取引は 3 項目（担当の `UpdateItem` ＋ 月の `ConditionCheck` ＋ 単価の `ConditionCheck`。cancel・markSkipped・unmarkSkipped は単価の確かめがなく 2 項目）で、DynamoDB の取引の上限（100 項目）に比べて十分小さい。確定・取り消しは 1 項目（月の状態の `PutItem` または `UpdateItem`）。呼び出しの数は、担当の数・種類の数・家族の人数では増えない（NFR7.35）。U7 は読み取りに Scan・BatchGetItem・BatchWriteItem を使わず、担当の探索は家族のキーの `GetItem`（`findDuty` の 3 回）だけ、月の状態は `GetItem` 1 回だけにする | 単体テストで、取引の項目数が markDone で 3・ほかの状態変更で 2・確定/取り消しで 1 であること。読み取りが家族のキーつき・強い整合性で、Scan 系の呼び出しがないこと。担当 1 件・124 件で呼び出し数が同じ上限であること |
| NFR3.12 | U7 は、新しい項目や保存先を増やさない。月の状態（`M#<month>#S`）に足すのは `confirmedAt`・`confirmedByUserId`・`version` の 3 属性だけ（1 家族・1 月に 1 件）。担当には属性を足さず、U6 までの `status`・`recordedAt`・`recordedBy`・`unitPrice`・`updatedAt`・`version` を書き換えるだけ。「未」「×」に戻すときは `recordedAt`・`recordedBy`・`unitPrice` を REMOVE で消す（項目が増えない。BR8.5）。DynamoDB の従量の課金は、月に数十回の書き込みの見込みで 1 円に満たず、AWS の請求額は 0 円のまま（U1〜U6 と同じ前提） | 単体テストで、状態の変更の更新式が機能設計の項目だけを書く（書く/消す）こと。月の状態の書き込みが `confirmed`・`confirmedAt`・`confirmedByUserId`・`version` だけを扱うこと。毎月の請求を作り手が見る（NFR1.5） |
| NFR3.13 | 処理は U1 で決めた同時実行数の上限（NFR1.6、NFR3.6）の中で動く。管理者 1 人の操作なので、同時の書き込みはめったに起きないが、別の端末からの二重操作や、確定↔取り消しの連打でも、書き込みは担当ごと・月ごとの項目に分かれ、取引の条件（状態の変更は `version`、確定・取り消しは目的の値にそろえる）で取り違えない（NFR4.70、BR8.14、BR8.16）。1 回のやり直しで足りる見込み | CDK のテストで、`api` の同時実行数の設定が U1 の決めた値のままであること。単体テストで、競合の差し替えのときに 1 回だけ読み直し、2 回目で `INTERNAL` になること |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR3、FR6.5）
- `construction/u7-review-confirm/functional-design/entities.md`（新しい保存先なし、月の状態に足す 3 属性、担当の書き換え）、`rules.md`（BR8.5、BR8.11、BR8.14、BR8.15、BR8.16）、`functional-spec.md`（配備、U7 で作る画面用 API と LINE の操作）
- `construction/u1-skeleton-family/nfr-requirements/scalability-requirements.md`（NFR1.1〜NFR1.7、NFR3.1、NFR3.2）
- `construction/u5-assignment-calendar/nfr-requirements/scalability-requirements.md`（NFR1.19〜NFR1.22、NFR3.6）
- `construction/u6-recording/nfr-requirements/scalability-requirements.md`（NFR1.23〜NFR1.28、NFR3.7〜NFR3.10。LINE を使わない・課金対象を足さない形）
- 既存コード（読むだけ）: `repositories/calendarRepository.ts`（索引なし・強い整合性・`findDuty` の GetItem 3 回、取引の項目）、`infrastructure/lib/app-stack.ts`（`api` の既存の構成、`line` は U7 で変えない）

## Assumptions & Open Questions

- [assumption] 月の状態に足す `version` は、確定・取り消しの回数の手がかりで、書き込みの条件には使いません（確定・取り消しは目的の値にそろえる。BR8.14）。1 家族・1 月に 1 件なので量には影響しません
- [assumption] カスタム指標とアラームを U7 で足さないのは、費用 0 円と無料枠の数を守るためです。U7 の失敗をログから見つけられるようにする要件は NFR2.53（observability）にあります。U10 がこれらを作り手への知らせの対象に入れます
- [assumption] 確定の確認に出す「未」の件数（BR8.10）は画面が持っているカレンダーから数えるので、U7 の API は件数を数えるための新しい読み取りを足しません（U5 の `getMonthCalendar` の結果を使う）
