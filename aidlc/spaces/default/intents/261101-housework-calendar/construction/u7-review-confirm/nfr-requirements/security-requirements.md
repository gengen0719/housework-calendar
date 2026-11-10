# 安全の要件（Security）— U7 確認・修正と確定

U7（`u7-review-confirm`）の安全の要件です。U1〜U6 の要件（NFR4.1〜NFR4.64、NFR5.1〜NFR5.12）は、そのまま使います。ここでは U7 で足すものを、U6 の番号の続きで書きます。U7 の新しい入口は 3 つで、すべて画面用 API です。`POST /v1/duties/{dutyId}/status`（状態の変更）、`PUT /v1/months/{month}/confirmation`（確定）、`DELETE /v1/months/{month}/confirmation`（確定の取り消し）。どれも LINE の経路はありません（U7 は画面だけ）。決まっていないことで人に聞くものは、ありませんでした。

## 権限（管理者だけ）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.65 | 3 つの入口は、U1 の共通の確かめ（セッション → ブロック中の 403 `NOT_FRIEND` → 家族のメンバー）を先に通し、続けて管理者の確かめ（C6 `requireAdmin`）を通す。子供の要求は 403 `ADMIN_ONLY` で、担当・月の状態・単価の読み書きを 1 回もしない（BR8.1、FR6.6、AC6.1.10）。家族は、セッションの利用者の `familyId` から裏側が決め、URL や本文の値からは決めない（`contract-summary.md` の `familyScope`、U5 の NFR4.42）。画面は、状態を変えるボタンと確定・取り消しのボタンを管理者にだけ出す（BR8.9、BR8.13）が、できるかの判断は裏側の `requireAdmin` が行う（画面の判断は見た目のため） | 認証なし（401）、ブロック中（403 `NOT_FRIEND`）、家族外（403 `NOT_FAMILY_MEMBER`）、子供（403 `ADMIN_ONLY`）の 4 通りで、3 つの入口がそれぞれ断られ、子供の要求では `Calendar`・`ChoreTypes` が 1 回も呼ばれないこと。確かめの順番が U5 の NFR4.52 と同じ（セッション → 家族 → 管理者 → パスの値の形 → 404 → 本文）であること |
| NFR4.66 | 状態の変更で対象にできるのは、自分の家族の担当だけ。`POST /v1/duties/{dutyId}/status` は、パスの `dutyId` を家族の範囲（`familyId = ctx.familyId`）で `findDuty` が探し、ほかの家族の `dutyId` は見つからず 404 `NOT_FOUND`（ほかの家族のデータがあることも知らせない。NFR4、BR8.4）。`PUT`／`DELETE /v1/months/{month}/confirmation` も、月の状態を `familyId = ctx.familyId` のキーで読み書きし、ほかの家族の月には触れない。URL や本文で家族を指定できない（`familyScope`） | ほかの家族の `dutyId`、ほかの家族の月を、本文が正しくても誤っても指定し、404（担当）または自分の家族の月だけが変わること。別の家族の月の状態が変わらないこと |

## 入力の検証

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.67 | `POST /v1/duties/{dutyId}/status` の本文は、`{ action, version }` だけを zod で読み、ほかの項目は捨てる（`strip`）。本文は 64 KB まで。`action` は `cancel`・`markDone`・`markSkipped`・`unmarkSkipped` の 4 つのどれか、`version` は 0 以上の整数（先頭に 0 を付けない 10 進。小数・符号・指数・文字列は不可）。どちらかが欠ける・外れると 422 `INVALID_REQUEST` で何も変えない。本文の形の確かめは、担当を探す前に行う（BR8.2 の順: 本文の形 → 表の確かめ）。パスの `dutyId` は小文字の 16 進数の UUID（36 文字）でなければ、DynamoDB を読まずに 404（U5 の NFR4.52 と同じ）。結果を決める値（`status`・`recordedAt`・`recordedBy`・`unitPrice`・`updatedAt`・`childUserId` など）は本文から受け取らず、すべて裏側が決める。記録した時刻は要求の入口で 1 回だけ取る裏側の時計の「今」、「済にする」の記録した人は `ctx.userId`（管理者）、単価はその時点の `getCurrentUnitPrice` の値だけを使う（BR8.6、U6 の NFR4.61） | 知らない `action`、`version` に文字列・負の数・小数・先頭 0、本文なし、`dutyId` の形違い、余分な項目（`unitPrice: 99999`・`recordedBy` にほかの子供・`status` に `done`）の各通りで、422 または 404 になり、書かれた値が裏側の決めた値であること。本文の形の 422 が、担当の探索より先に起きること |
| NFR4.68 | `PUT`／`DELETE /v1/months/{month}/confirmation` のパスの `month` は、日本時間の `YYYY-MM`（例 `2027-01`）の形だけを受け付ける。4 桁の年・`-`・01〜12 の月でなければ、DynamoDB を読まずに 422 `INVALID_MONTH`（`contract-summary.md` の C1）。本文は読まない（確定・取り消しに本文はない。余分な本文は無視する）。確定・取り消しは、同じ `month` を 2 回送られても、目的の値にそろえるだけで結果が同じになる（BR8.14、BR8.16） | `2027-1`・`2027-13`・`2027-00`・`20270-1`・空・記号つきの各通りで 422 `INVALID_MONTH` になり、`Calendar` の書き込みがないこと。正しい `month` を 2 回送って、結果が同じ（確定済み／未確定）であること |

## 取引の原子性と読み直し

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.69 | 状態の変更の書き込みは、1 回の取引（`TransactWriteItems`）で、担当の `UpdateItem`（条件 `status`＝今の状態・`version`・`dutyId`）と、月が確定していないことの `ConditionCheck`（`buildMonthGuard`。担当の `month` で引く）を同時に行う。markDone はさらに、単価が読んだ値のままであることの `ConditionCheck`（`buildUnitPriceGuard`）を足す。取引は全部成功するか全部書かれないかで、「一部だけ書かれた」状態はない（BR8.18）。「済」で記録の 3 項目（`recordedAt`・`recordedBy`・`unitPrice`）のどれかが空の担当や、「未」「×」で記録の項目が残る担当を作らない（BR8.5、BR8.6）。担当を作らない・消さない・`origin` を変えない（U5・U6 の引き継ぎ） | 取引を失敗させる差し替えで、担当が元の状態・`version` のまま変わらないこと。成功したあとの担当で、「済」なら 3 項目がそろい、「未」「×」なら 3 項目が空であること。`PutItem`・`DeleteItem` を担当に発行しないこと |
| NFR4.70 | 取引の条件で断られたら（担当が変わった・`version` が違う・先に確定された・単価が先に変わった）、1 回だけ読み直して BR8.4 の確かめ（1. 探す → 2. 月の確定 → 3. 表）を最初からやり直す。やり直しても断られたら 500 `INTERNAL` で何も書かない。「競合」として扱うのは `ConditionalCheckFailed` と `TransactionConflict` だけで、ほかの Code（`ThrottlingError` など）は投げ直す（U5 の NFR2.31・U6 の NFR2.34 の `classifyCancellation`）。読み直しで分かれ方が変われば、その印（`MONTH_CONFIRMED`・`DUTY_CHANGED` 相当の `INVALID_TRANSITION`・`NOT_FOUND`）を返して何も書かない。確定・取り消し（`confirmMonth`・`unconfirmMonth`）は version を条件にせず、目的の値にそろえる作りなので、読み直しのやり直しは要らない（二度押し・連打でも最後の結果にそろう。BR8.14） | 取引の直前に、(a) 管理者が別の端末で担当を変える（`version` が増える）、(b) 月の確定、(c) 単価の変更（markDone のとき）、(d) 先に同じ担当を変えるの各差し替えで、期待の印になり、単価の変更のあとは新しい単価が書き写されること。2 回続けて断らせたときに 500 `INTERNAL` になり、3 回目の書き込みがないこと。確定・取り消しの連打で、最後の操作の結果にそろうこと |

## `api` の Lambda の権限と環境変数（足し済みの確認）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.71 | U7 は `api` の Lambda に新しい権限も環境変数も足さない。U7 の書き込みに要るのは、`Calendar` への `dynamodb:UpdateItem`（担当・月の状態）・`dynamodb:ConditionCheckItem`（月の状態・単価の確かめ）・`dynamodb:GetItem`・`dynamodb:Query`、`ChoreTypes` への `dynamodb:GetItem`・`dynamodb:ConditionCheckItem`（単価の読みと確かめ）で、これらは U4・U5 で `api` に付与済み（`app-stack.ts` の `api` の `Calendar`・`ChoreTypes` の文に含まれる。`Calendar` は `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`、`ChoreTypes` は `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem`）。環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` も `api` に付与済み。U7 は担当を作らない・消さないので、`PutItem`・`DeleteItem` を担当には使わない（確定行の作成は月の状態の項目への `PutItem` で、U5 で足した `Calendar` の `PutItem` の範囲内） | CDK のテスト（`infrastructure` のテスト）で、U7 の前後に `api` の IAM ポリシーと環境変数が変わらないこと。U7 で新しい IAM の文・環境変数が足されていないこと |
| NFR4.72 | `line` の Lambda には、U7 で権限も環境変数も足さない。U7 は LINE の経路を持たない（画面だけ）ので、`line` のコード・権限・環境変数に U7 由来の変更がない。既存の `line` の権限（`Users`・`Families`・`ProcessedLineEvents`・`NotificationGroups`・`Calendar`・`ChoreTypes`・SSM の `line/*`・`cloudfront/*`）は増やさない | 同じ CDK のテストで、U7 の前後で `line` の権限・環境変数が変わっていないこと。U7 のコードに LINE の API（`reply`・`push` など）の呼び出しがないこと |

## 秘密の情報とログ

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR5.13 | U7 で新しい秘密の情報は作らない。U7 は LINE を呼ばないので、チャネルアクセストークン・チャネルシークレットも使わない。セッションの署名の鍵は U1 の SSM（`jwt/*`）を `api` が起動時に読む、これまでどおり。スクリプト・README・設定ファイルに秘密の値を書かない。例は `<作り物の値>` と書く | リポジトリの秘密の情報の検査（gitleaks。NFR5）が通ること。U7 で足したコード・テスト・前提データに本物の秘密の値がないこと |
| NFR4.73 | ログには操作の事実だけを残し、名前・単価・秘密の情報を残さない（BR8.17）。残すのは `DUTY_STATUS_CHANGED`（`familyId`・`dutyId`・`action`・`fromStatus`・`toStatus`）、`DUTY_STATUS_REJECTED`（理由の印: `ADMIN_ONLY`・`NOT_FOUND`・`MONTH_CONFIRMED`・`INVALID_TRANSITION`・`INVALID_REQUEST`・`INTERNAL`）、`MONTH_CONFIRMED_SET`（`familyId`・`month`・`confirmed` の新しい値）。残さないもの: 子供・管理者の表示名、お手伝いの名前、LINE のユーザー ID、単価と金額、セッショントークン、署名の鍵、秘密のヘッダーの値（U1 の NFR2.8・NFR5.4、U5 の NFR2.32、U6 の NFR2.41 と同じ考え）。利用者は、LINE の ID ではなくアプリの `userId` で残す（`requireAdmin` の対象。ただし表示名は残さない） | 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前・単価）を入れた担当・月で、成功・各断り・`INTERNAL` の全部の分かれ道で処理し、出たログの全行に目印が 1 つも含まれないこと（NFR2.44） |

## 脅威と備え

| 脅威 | 備え | 扱い |
|------|------|------|
| 子供が API を直接呼んで、担当の状態を変える・月を確定する・取り消す | NFR4.65（`requireAdmin` で 403 `ADMIN_ONLY`。読み書きしない） | 備える |
| 家族外の人・ほかの家族の管理者が、ほかの家族の担当や月を変える | NFR4.65、NFR4.66（家族の範囲で探す。404。URL・本文で家族を指定できない） | 備える |
| 本文に `unitPrice` や `recordedBy` を書いて、金額や記録した人を偽る | NFR4.67（本文は `action`・`version` だけ読み、結果の値は裏側が決める） | 備える |
| 不正な `action`・`version`・`month` で、思わぬ書き込みや例外を起こす | NFR4.67、NFR4.68（zod で形を確かめ、外れたら 422 で何も書かない） | 備える |
| 見せたあとに古くなった担当のボタンで、取り消し済み・確定済み・変えられた担当を変える | NFR4.69、NFR4.70（`version`・今の状態・月の確定を同じ取引で確かめ、断られたら読み直す） | 備える |
| 二度押し・確定↔取り消しの連打で、状態が取り違えられる | NFR4.70、BR8.16（状態の変更は `version` と表で、確定・取り消しは目的の値にそろえる） | 備える |
| 確定済みの月が、別の経路（記録・割り当て・加算・減額）で変わる | 各単位の月の確かめ（`buildMonthGuard` の `ConditionCheck`）で `MONTH_CONFIRMED`（U5・U6・U9・U11。U7 は確定を書くだけ） | 備える（各単位で引き継ぐ） |
| ログに単価や名前が残り、家族のお小遣いの情報が漏れる | NFR4.73、NFR5.13（操作の事実だけ。名前・単価・秘密を残さない） | 備える |
| `api` が乗っ取られて、担当を消す・作る | NFR4.71（U7 は担当を作らない・消さない。`PutItem`・`DeleteItem` を担当に使わない） | 備える（U5 の権限の範囲） |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR4、NFR5、NFR6、FR6.1〜FR6.6）
- `inception/user-stories/stories.md`（AC6.1.1〜AC6.1.11）
- `inception/contract-design/contract-summary.md`（C1、C6 `requireAdmin`、C7 `getCurrentUnitPrice`、C8、C10、`familyScope`、画面用 API の失敗の形）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.1〜BR8.6、BR8.9、BR8.11、BR8.13、BR8.14、BR8.16、BR8.17、BR8.18）、`functional-spec.md`（F1〜F4、状態の変更の印と返事の対応、配備）、`entities.md`
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.7、NFR4.8、NFR5.1〜NFR5.6）
- `construction/u5-assignment-calendar/nfr-requirements/security-requirements.md`（NFR4.42〜NFR4.52）
- `construction/u6-recording/nfr-requirements/security-requirements.md`（NFR4.60〜NFR4.64、NFR5.10〜NFR5.12）
- 既存コード（読むだけ）: `entries/api.ts`（`requireAuth`、ルート表、`verifyOriginHeader`、`REQUEST_REJECTED`／`REQUEST_ERROR`）、`services/calendarService.ts`（`changeDutyChild` の権限・404・読み直しの形）、`repositories/calendarRepository.ts`（`findDuty` の家族の範囲、`buildMonthGuard`・`buildUnitPriceGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`）、`infrastructure/lib/app-stack.ts`（`api`・`line` の既存の権限と環境変数）

## Assumptions & Open Questions

- [assumption] `POST /v1/duties/{dutyId}/status` の権限は、U6 の記録（本人の担当か）と違い「管理者か」で決まるので、`requireAdmin` を家族の確かめのあとに重ねます。子供が直接 API を呼んだときだけ 403 `ADMIN_ONLY` になります（画面は管理者にしかボタンを出さない。BR8.1、BR8.9）
- [assumption] 月の確定・取り消しは本文を持たないので、`PUT`／`DELETE` の本文は読まず、余分な本文があっても無視します（契約の「受け取る側は知らない項目を無視する」）。`month` の形の確かめ（NFR4.68）は、DynamoDB を読む前に行います
- [assumption] 確定行の作成（行がまだ無い月への初回の確定。BR8.11）は `Calendar` への `PutItem`（`attribute_not_exists` 条件）で、U5 が `api` に足した `Calendar` の `PutItem` の範囲内です。U7 で新しい権限は要りません
- [assumption] ログの `DUTY_STATUS_CHANGED` に `action`・`fromStatus`・`toStatus` を残すのは操作の調べもののためで、単価・名前は残しません（NFR4.73、BR8.17）。調べものには `familyId` と `dutyId` で足ります
