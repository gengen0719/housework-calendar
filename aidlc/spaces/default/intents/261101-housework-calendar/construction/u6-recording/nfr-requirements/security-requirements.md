# 安全の要件（Security）— U6 記録

U6（`u6-recording`）の安全の要件です。U1〜U5 の要件（NFR4.1〜NFR4.52、NFR5.1〜NFR5.9）は、そのまま使います。ここでは U6 で足すものを、U5 の番号の続きで書きます。U6 の新しい入口は 2 つです。LINE の 1 対 1 のトークの postback（`action=record.list`、`action=record.do`）と、画面用 API の `POST /v1/duties/{dutyId}/record` です。決まっていないことで人に聞くものは、ありませんでした。

## LINE の 1 対 1 の postback の受け口

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.53 | `record.list` と `record.do` の postback も、U1 の LINE 用の受け口の確かめ（秘密のヘッダー `X-Origin-Verify`、`x-line-signature`、同じイベントを二度処理しない）を、そのまま通ってから処理する（U1 の NFR4.7、NFR4.8、NFR4.13、U3 の NFR4.27）。署名と秘密のヘッダーの確かめは、イベントの種類や送り元（1 対 1 かグループか）を読む前に行う | 署名のない・書き換えた本文・秘密のヘッダーのない `record.do` が、403 か 401 で断られ、DynamoDB の読み書きも LINE への返事もないこと。正しい署名の `record.do` が通ること |
| NFR4.54 | postback の data は、次の 2 つの形とちょうど同じときだけ記録の操作として扱う。(1) `action=record.list`（ほかの項目なし）、(2) `action=record.do&dutyId=<UUID>&v=<整数>`（この 3 項目だけ、この順）。`dutyId` は小文字の 16 進数の UUID（36 文字）、`v` は 0 以上の 10 進の整数（先頭に 0 を付けない。桁数は 9 桁以内）。全体の長さは 300 文字以内（U3 の NFR4.28）。知らない `action`、同じ項目が 2 回、余分な項目、大文字の UUID、符号や小数点や指数のある `v`、空の値、URL エンコードで形を変えた値は、何もしない（`LINE_EVENT_IGNORED`。二度処理しない記録も書かない）。data の中身は秘密の情報を持たず、信じない（権限は NFR4.56 と NFR4.57 で決める） | 上の外れた形を 1 つずつ送り、どれも記録されず、返事もなく、イベントの記録も書かれないこと。正しい形だけが通ること |
| NFR4.55 | 記録の操作として受け付けるのは、`source.type` が `user`（1 対 1 のトーク）の postback だけ。`group` と `room` からの `record.list`、`record.do` は、同じ data でも何もしない（返事もしない）。受け付けるかどうかは、二度処理しない記録を書く前に決める（受け口の `accepts`。U3 の NFR3.4 と同じ） | グループと room から正しい形の `record.do` を送り、記録されず、返事もなく、DynamoDB への書き込みもないこと。1 対 1 以外の `message` で記録が始まらないこと |
| NFR4.56 | 1 対 1 の入口は、記録の操作をする人を、署名つきのイベントの `source.userId` だけから決める。その利用者を `lineUserId-index` で探し（読むだけ。利用者は作らない）、次のとおり分ける（BR7.1）。(a) 友だちで家族に入っている子供だけが記録に進む。(b) 管理者には `ADMIN_RECORD_GUIDE`、(c) 家族に入っていない人・利用者の記録がない人・ブロック中の人・`source.userId` がないイベントには `JOIN_FAMILY_FIRST` を、決まった文だけで返す。(b)(c) では担当・月の状態・種類の読み書きをしない。家族は利用者の記録の `familyId` から決め、イベントや data の中の値からは決めない。返事に、家族の名前・メンバー・担当・種類の名前を入れない。ブロック中かどうかは保存してある `friendStatus` で見て、LINE のプロフィール取得は呼ばない | 子供、管理者、家族に入っていない人、記録がない人、ブロック中の人、`source.userId` のないイベントの 6 通りで、返事が決まった文だけであること、(b)(c) でカレンダーとお手伝いの種類のテーブルが 1 回も呼ばれないこと、返事に家族の情報が入らないこと |
| NFR4.57 | `record.do` の権限は、押した人（`ctx.userId`）の担当かどうかを裏側の `recordDuty` が BR7.4 の順（家族の中で探す → 本人の担当か → …）で確かめて決め、data の `dutyId` と `v` は信じない。ほかの家族の `dutyId` は、家族の範囲（`familyId = ctx.familyId`）で探して見つからず、`NOT_FOUND` になる。同じ家族のほかの子供の担当の `dutyId` は `NOT_OWN_DUTY` になる。この 2 つと `DUTY_CHANGED` などの「担当が変わった」系の印は、LINE の返事ではどれも同じ文「この担当は先に変更されました」と、押した本人の今の選択肢だけにする。返事から、ほかの子供の担当があるかどうか、ほかの家族の担当があるかどうかが分からないこと（BR7.5） | ほかの家族の `dutyId`、ほかの子供の `dutyId`、存在しない `dutyId` の 3 通りで、返事が同じ文と本人の選択肢だけで、何も書かれないこと。画面用 API では、それぞれ 404、403、404 になること。さらに、ほかの子供や家族外の人が、転送や貼り付けで手に入れた同じ data のボタンを押した場合を 1 通り足す: 家族外の人（`JOIN_FAMILY_FIRST` の文だけ）と同じ家族のほかの子供（「この担当は先に変更されました」と押した本人の今の選択肢だけ）のどちらでも、返事が決まった文だけで、担当・カレンダーに何も書かれず、元の持ち主の担当の状態が変わらないこと |
| NFR4.58 | 返事は、そのイベントの reply トークンで、押した本人の 1 対 1 のトークにだけ送る。push、multicast、broadcast は使わず、`to` の宛先を指定する呼び出しをしない。グループへは何も送らない（BR7.9、AC5.1.2）。reply トークンは 1 回しか使わず、ログにも DynamoDB にも残さず、postback の data にも入れない（NFR5.12） | 単体テストで、LINE への呼び出しが `POST /v2/bot/message/reply` だけで、1 イベントにつき 0 回か 1 回であること。`push`、`multicast`、`broadcast` を含む呼び出しが 1 件もないこと。家族のお知らせ先のグループの記録（`NotificationGroups`）を、記録の操作が読まないこと |
| NFR4.59 | 見せたあとに古くなった選択肢のボタンは、書き込みの条件（`dutyId`、`version`、状態が「未」、月が確定していない、単価が読んだ値のまま）で必ず断られる（BR7.6）。管理者が「済」を取り消して「未」に戻した担当の古いボタン（`version` が増えている）、管理者が担当の子供を変えたあとの古いボタン、確定した月の古いボタンは、記録を作らない。すでに自分が「済」にした担当の同じボタンだけは、書かずに最初の結果を返す（BR7.8） | 状態を変えてから古い `v` で押し、記録されず `DUTY_CHANGED` 系の返事になること。同じボタンの 2 回目は、記録が増えず最初の時刻のままであること |

## 画面用 API の記録

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.60 | `POST /v1/duties/{dutyId}/record` は、U1 の共通の確かめ（セッション、ブロック中の 403 `NOT_FRIEND`、家族のメンバー）を先に通す。管理者の要求は管理者の確かめ（`requireAdmin`）の対象ではなく、`recordDuty` の本人の担当かの確かめで 403 `NOT_OWN_DUTY` になる（記録の修正は U7）。確かめの順番は U5 の NFR4.52 に合わせる: セッション → 家族のメンバー → パスの `dutyId` の形（小文字の 16 進数の UUID でなければ、DynamoDB を読まずに 404）→ 家族の中での担当の 404 → 本文の 422 → BR7.4 の 2〜9。ほかの家族の `dutyId` には、本文が正しくても誤っていても 404 を返す。本文は `{ version }`（0 以上の整数）だけを zod で読み、64 KB まで。違えば 422 `INVALID_REQUEST` | 認証なし、ほかの家族のメンバー、管理者、ほかの子供、形の違う `dutyId`、本文なし・文字列の `version`・負の数の 7 通りの断られ方と、ほかの家族の ID に誤った本文を送ったときの 404 |
| NFR4.61 | 記録の結果を決める値は、すべて裏側が決める。本文の `status`、`recordedAt`、`recordedBy`、`unitPrice`、`updatedAt`、`childUserId` などの余分な項目は捨てる（`strip`）。記録した時刻は要求の入口で 1 回だけ取る裏側の時計の「今」、記録した人は `ctx.userId`、単価はその時点の `getCurrentUnitPrice` の値だけを使う（BR7.6、BR7.7）。画面の時計や端末の時刻は使わない | 余分な項目（`unitPrice: 99999`、`recordedBy` にほかの子供、`recordedAt` に昔の日時）を付けて送り、書かれた値が裏側の決めた値であること |
| NFR4.62 | 画面では、子供の表示名・種類の名前を HTML として差し込まない（U1 の NFR4.12）。U6 で足す確認の表示（「{月}/{日} {お手伝い}を記録しますか」）、理由の文字、「済 16:42 太郎が記録」の表示も、名前は文字として出す | 画面のテストで、種類の名前の中のタグが文字として出ること。`dangerouslySetInnerHTML` を使わない決まり（ESLint）に反しないこと |

## `line` の Lambda の権限（最小の権限）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.63 | U6 で `line` の Lambda に足す権限は、次の 2 つのテーブルへの、次の操作だけにする。`Calendar`: `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:UpdateItem`、`dynamodb:ConditionCheckItem`。`ChoreTypes`: `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:ConditionCheckItem`。対象は自分の環境のそのテーブルの ARN だけで、`*` は使わない（索引の許可も足さない）。環境変数は `CALENDAR_TABLE` と `CHORE_TYPES_TABLE` だけを足す（秘密の情報は環境変数に入れない。NFR5.10）。`TransactWriteItems` 自体の許可はなく、取引は項目ごとの許可（担当の `UpdateItem`、月の状態と種類の `ConditionCheckItem`）で確かめられる | CDK のテスト（`infrastructure` のテスト）で、`line` の Lambda の IAM ポリシーを取り出し、上の表と一致すること。ステージングの `line` が、本番のテーブルの ARN を含まないこと |
| NFR4.64 | `line` の Lambda に、次は足さない。`Calendar` と `ChoreTypes` への `PutItem`、`DeleteItem`、`BatchGetItem`、`BatchWriteItem`、`Scan`、`dynamodb:*`、テーブル作成や削除。`Users` の `familyId-index` の `Query`（`line` に要らない）。`jwt/*` の SSM パラメータ（セッションの署名の鍵）。SNS・SES・Lambda の呼び出しなど、別のサービスへの許可。既存の `line` の権限（`Users`、`Families`、`ProcessedLineEvents`、`NotificationGroups`、SSM の `line/*` と `cloudfront/*`）は増やさない。`api` の Lambda には、U6 で権限を足さない（`Calendar` と `ChoreTypes` は U4・U5 で付いたもので足りる） | 同じ CDK のテストで、上の許可が 1 つも含まれないこと、U6 の前後で `line` の既存の許可が変わっていないこと、`api` の許可が変わっていないこと |

## 秘密の情報

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR5.10 | U6 で新しい秘密の情報は作らない。LINE の返事に使うチャネルアクセストークンとチャネルシークレットは、U1 の SSM（`line/*`）の値を、これまでどおり Lambda の起動時に読む。リッチメニューを設定する手順（BR7.15）は、そのトークンを環境ごとの SSM から実行のときに読むか、実行する人が環境変数で渡す形にし、スクリプトにも README にも設定ファイルにも値を書かない。例は `<作り物の値>` と書く | リポジトリの秘密の情報の検査（gitleaks。NFR5）が通ること。スクリプトに値が書かれていないこと |
| NFR5.11 | テストとその前提データ（筋書き、画面のテスト、スクリプトの例）に、本物の LINE のユーザー ID、グループ ID、トークン、署名の鍵、表示名を使わない。署名のテストには、テスト用に作った値（`<作り物の値>`）で計算した署名を使う | gitleaks が通り、テストの入力が作り物の値だけであること（レビュー） |
| NFR5.12 | LINE のユーザー ID、表示名、reply トークン、postback の data の全文、返事の本文（Flex Message の中身）は、ログにも DynamoDB にも残さない（記録の項目に入れるのは、`recordedAt`、`recordedBy`（アプリの `userId`）、`unitPrice` など機能設計で決めたものだけ）。二度処理しない記録（`ProcessedLineEvents`）に入れるのは、U1 の決めたイベントの ID と状態だけ（U3 の NFR3.4 と同じ） | 作り物の値を入れたイベントを全部の分かれ道（成功、各断り、失敗）で処理し、ログと書き込まれた項目に作り物の値が出ないこと（NFR2.41） |

## 脅威と備え

| 脅威 | 備え | 扱い |
|------|------|------|
| 偽の Webhook で、ほかの人の名前で記録させる | NFR4.53（署名と秘密のヘッダー） | 備える |
| 子供が postback の data を書き換えて、ほかの子供の担当、ほかの家族の担当を記録する | NFR4.54、NFR4.57（data は信じず、裏側で本人と家族を確かめる） | 備える |
| 古い選択肢のボタンを再び押して、取り消された担当、確定した月、変えられた担当を記録する | NFR4.59（書き込みの条件） | 備える |
| グループや room に貼られたボタンから記録する | NFR4.55 | 備える |
| 家族に入っていない人が、リッチメニュー（全員に同じメニューが見える）から家族の情報を知る | NFR4.56（決まった文だけ。家族の情報を入れない） | 備える |
| 記録の返事が家族のグループに届いて、お小遣いの内容が見える | NFR4.58（reply だけ、push なし） | 備える |
| 子供が画面用 API に、単価や記録した人を直接書いて金額を増やす | NFR4.61 | 備える |
| 同じイベントの再送、同時の 2 回押しで二重に記録される | NFR2.35（書き込みの条件と二度処理しない記録） | 備える |
| `line` の Lambda が乗っ取られて、種類や担当を消す・作る | NFR4.63、NFR4.64（書き込みは担当の更新だけ。作る・消す権限なし） | 備える |
| 偽の Webhook を大量に送って費用を増やす | 署名の確かめを先に行い、同時実行の上限（U1 の NFR1.6）で受ける。記録の操作でないイベントは書き込みもしない（NFR3.7） | 備える（U1 から引き継ぐ） |
| LINE の署名の鍵が漏れる | 環境ごとの SSM の保管と、リポジトリの検査（NFR5.1〜NFR5.3、NFR5.10） | 備える（U1 から引き継ぐ） |
| 子供が自分で「済」を取り消して、記録を書き換える | 取り消す入口を作らない（BR7.13）。管理者の取り消しは U7 | U6 では作らない |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR4、NFR5、NFR10、FR5.1〜FR5.7、FR1.7）
- `construction/u6-recording/functional-design/rules.md`（BR7.1、BR7.3〜BR7.9、BR7.15、BR7.16）、`functional-spec.md`（F1〜F3、記録の結果の印と返事の対応、次の単位への引き継ぎの「配備」）
- `inception/contract-design/contract-summary.md`（C1、C3、C4、C6、C8、C10、familyScope）
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.7、NFR4.8、NFR4.13、NFR5.1〜NFR5.6）
- `construction/u3-notification-group/nfr-requirements/security-requirements.md`（NFR4.27、NFR4.28、NFR4.31）
- `construction/u5-assignment-calendar/nfr-requirements/security-requirements.md`（NFR4.42〜NFR4.52）
- 既存コード（読むだけ）: `entries/line.ts`（受け口の確かめの順、`accepts`）、`services/groupCommandGate.ts`（利用者の確かめ、決まった文の断り）、`services/lineApiService.ts`（`reply`、時間切れ）、`repositories/calendarRepository.ts`（家族の範囲のキー、`classifyCancellation`）、`infrastructure/lib/app-stack.ts`（`line` の既存の権限）

## Assumptions & Open Questions

- [assumption] 1 対 1 の入口を `groupCommandGate` に足すか、別の小さな入口として作るかは、機能設計のとおりコード生成で決めます。どちらでも NFR4.56 の 6 通りの分かれ方を満たします
- [assumption] LINE の postback の data の長さの上限（300 文字）は、U3 の NFR4.28 と同じ値を使います。U6 の data は約 60 文字で収まります
- [assumption] リッチメニューを設定するスクリプトの置き場所と実行のしかたは、設計とコード生成で決めます。ここでは、秘密の情報の扱い（NFR5.10）と、環境ごとに別に行うこと（NFR10.6）だけを要件にします
- 管理者がグループや画面から子供の担当を代わりに記録する経路は、U6 にはありません（管理者の修正は U7）
