# 安全の要件（Security）— U8 代わりにやる

U8（`u8-swap`）の安全の要件です。U1〜U7 の要件（NFR4.1〜NFR4.73、NFR5.1〜NFR5.13）は、そのまま使います。ここでは U8 で足すものを、U7 の番号の続きで書きます。U8 の新しい入口は、LINE のグループだけです。「家事交代」の message と、`swap.offer`・`swap.accept`・`swap.withdraw` の postback（1 対 1 では案内の返事だけ）。画面用 API は足しません。決まっていないことで人に聞くものは、ありませんでした。

## LINE の受け口（署名・形・送り元）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.74 | 「家事交代」の message と `swap.*` の postback も、U1 の LINE 用の受け口の確かめ（秘密のヘッダー `X-Origin-Verify`、`x-line-signature`、同じイベントを二度処理しない）を、そのまま通ってから処理する（U1 の NFR4.7、NFR4.8、NFR4.13、U3 の NFR4.27、U6 の NFR4.53）。署名と秘密のヘッダーの確かめは、イベントの種類や送り元（1 対 1 かグループか）を読む前に行う。U8 はこの順番を変えず、確かめの前にグループの ID や利用者を読まない | 署名のない・書き換えた本文・秘密のヘッダーのない「家事交代」と `swap.accept` が、403 か 401 で断られ、DynamoDB の読み書きも LINE への返事もないこと。正しい署名のものが通ること |
| NFR4.75 | 申し出を始める言葉は、`message.type` が `text` で、長さが 5000 文字以内で、前後の空白（全角の空白を含む。JavaScript の `trim` と同じ）を除いた文字列が「家事交代」と**完全に同じ**ときだけ受け付ける（BR9.1）。大文字小文字・全角半角・濁点・空白の正規化はしない。受け付けない例: 「代わって」「かわって」「家事 交代」「家事交代して」「明日家事交代できる？」「家事交代」の前後に零幅の空白（U+200B）や改行をはさんだもの、同じ文字の見た目だけ似た別の文字。受け付けるかどうかは、二度処理しない記録を書く前に決める（受け口の `accepts`）。受け付けないメッセージは、返事も書き込みもしない（`LINE_EVENT_IGNORED` に `type` だけ書く）。送り元ごとの扱い: `source.type` が `group` → 一覧の操作（NFR4.77 を通る）、`user`（1 対 1）→ 誰が送っても同じ案内の返事だけ（利用者・家族・担当を読まない。BR9.4）、`room` や `groupId` がないもの → 何もしない | 上の受け付けない例を 1 つずつ送り、どれも返事も書き込みもなく、イベントの記録（`ProcessedLineEvents`）も書かれないこと。前後に半角・全角の空白をつけた「家事交代」は通ること。1 対 1 で、子供・管理者・家族外の人・利用者の記録がない人が、同じ案内の文だけを受け取り、`Users`・`Calendar`・`ChoreTypes`・`NotificationGroups` の読み書きが 1 回もないこと。`room` からのものに何も起きないこと |
| NFR4.76 | `swap.*` の postback の data は、生の文字列に対する正規表現で、次の 3 つの形と**ちょうど同じとき**だけ操作として扱う（BR9.16。`URLSearchParams` は使わない。項目の重複・順序・エンコードの違いなど、同じ値に見える違う文字列を通さないため。U6 の NFR4.54 と同じ作り）。(1) `action=swap.offer&dutyId=<UUID>`、(2) `action=swap.accept&dutyId=<UUID>&offerId=<UUID>`、(3) `action=swap.withdraw&dutyId=<UUID>&offerId=<UUID>`。`<UUID>` は小文字の 16 進数の UUID（36 文字）。全体の長さは 300 文字以内（実際の最長は約 110 文字）。さらに、`source.type` が `group` で、`replyToken` があるものだけを受け付ける。知らない `action`、同じ項目が 2 回、順序が違う、余分な項目、大文字の UUID、空の値、URL エンコードで形を変えた値、末尾の `&`、前後の空白は、何もしない（`LINE_EVENT_IGNORED`。二度処理しない記録も書かない）。1 対 1 から届いた `swap.*` も何もしない（返事もしない。BR9.4）。data の中身は秘密の情報を持たず、信じない（権限は NFR4.77 と NFR4.78 で決める） | 上の外れた形を 1 つずつ送り、どれも書き込み・返事・イベントの記録がないこと。1 対 1 と `room` からの正しい形の `swap.accept` が何も起こさないこと。正しい形だけが通ること。ログに data の文字が出ないこと（NFR2.65） |
| NFR4.77 | 申し出の操作はすべて `runGroupOperation`（U3 の入口）を通す（BR9.2、AC1.2.5）。家族は、**グループの登録**（`findFamilyByGroup`）から決め、ボタンの値（`dutyId`・`offerId`）やイベントの中の値からは決めない。登録されていないグループには `GROUP_NOT_REGISTERED` の決まった文、送った人が友だちで、その家族のメンバーでない（利用者の記録がない・ブロック中・ほかの家族・役割がない）ときは `NOT_FAMILY_MEMBER` の決まった文を返し、操作（`Calendar`・`ChoreTypes` の読み書き）を呼ばない。断りの文は決まった文だけで、家族の名前・メンバー・担当を入れない（断りはグループに見える返事になるため）。LINE のプロフィール取得は呼ばない（友だちかどうかは保存してある `friendStatus` で見る）。グループの登録がない家族のグループに、別の家族のメンバーが貼り付けた同じ data のボタンは、この入口で断られる | グループの登録なし、登録のある別の家族のメンバー、ブロック中の人、`source.userId` のないイベントの 4 通りで、返事が決まった文だけであること、`Calendar` と `ChoreTypes` が 1 回も呼ばれないこと、返事に家族の情報が入らないこと。別の家族のグループに、本物の `dutyId` を持つボタンの data を送って、何も変わらないこと |

## 誰が何をできるか（本人だけ・管理者の拒否）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.78 | 権限は、ボタンの値ではなく**読んだ担当と申し出**で決める（BR9.3、BR9.7、BR9.9、BR9.10）。(a) 担当を選ぶ（`offerSwap`）: 担当の子供が押した人であるときだけ進む。管理者・ほかの子供・元の持ち主でない人は `OFFER_OWNER_ONLY`（「この操作は申し出た人だけができます」）で、何も変えない。担当の子供が変わっていて元の持ち主が古い選択ボタンを押したときだけ、`DUTY_CHANGED` の文（BR9.7）。(b) 申し出をやめる（`withdrawSwap`）: 申し出の `offererUserId` が押した人であるときだけ。管理者・ほかの子供は `OFFER_OWNER_ONLY`。(c) 引き受ける（`acceptSwap`）: 押した人が管理者、または申し出た本人なら `CANNOT_ACCEPT_OWN_OFFER`（引き受けられたあとでも同じ。BR9.9 の 3.）、それ以外の子供だけが取引に進む。(d) 「家事交代」の一覧: 管理者には「代わってもらう申し出は子供だけができます」（担当も申し出も読まない）。(e) ほかの家族の `dutyId`・`offerId` は、家族の範囲（`familyId = ctx.familyId`）で探して見つからず、`NOT_FOUND`（選ぶ）か `OFFER_GONE`（引き受ける・やめる）になる。返事から、ほかの家族の担当や申し出があるかどうか、ほかの子供の担当があるかどうかが分からないこと（`NOT_FOUND` と `DUTY_NOT_TODO` は同じ文「この担当は先に変更されました」） | 管理者、ほかの子供、元の持ち主、ほかの家族の `dutyId`、存在しない `dutyId`・`offerId`、形は正しいが別の担当の `offerId` の組み合わせを、選ぶ・引き受ける・やめる のそれぞれで送り、返事が上の表の文だけで、担当・申し出に何も書かれないこと。ほかの家族の ID と存在しない ID の返事が同じ文であること |
| NFR4.79 | 引き受けは**最初に押した 1 人だけ**が成立する（FR7.3、BR9.9）。担当の子供を引き受けた子供に変える書き込みは、担当の条件（`dutyId`・`version`＝申し出の `dutyVersion`・`status`＝todo・`childUserId`＝`offererUserId`）と、申し出の条件（`status`＝open かつ `offerId` が同じ）と、月が確定していない確認を**同じ取引**に入れ、全部成功するか全部書かれないかにする。「担当だけ変わって申し出が開いたまま」「申し出だけ引き受け済みで担当が変わらない」状態を作らない。2 人が同時に押しても、成立するのは 1 人で、もう 1 人は読み直して `OFFER_ALREADY_ACCEPTED` か `OFFER_GONE` を受け取る。引き受けは、押した子供の**自分の担当には触れない**（FR7.3） | 条件つきの書き込みの動きを再現する差し替えで、2 人の `swap.accept` を同時に送り（`Promise.all`）、担当の子供が最初の 1 人になり、`version` が 1 だけ増え、申し出が `accepted`（引き受けた人は 1 人）で、もう 1 人の返事が「この申し出はもう引き受けられています」であること。取引を失敗させる差し替えで、担当も申し出も元のままであること。引き受けた子供の自分の担当の項目が 1 つも書き換わらないこと |
| NFR4.80 | 古いボタンが新しい申し出に当たらない（BR9.12）。ボタンの値に `offerId` を入れ、申し出の項目の `offerId` と同じときだけ引き受け・取り下げを進める。取り下げ・引き受け・自動でなくなったあとに同じ担当が申し出し直されると、項目は新しい `offerId` の `open` に上書きされ、古い申し出のボタンは `OFFER_GONE` になる。申し出が有効かの判断（BR9.8）は、読んだときの担当（`version`・状態・子供・日付・月の確定）と申し出の状態から行い、フックの有無に頼らない | 申し出 → 取り下げ → 同じ担当を申し出し直し → 古いボタンで引き受け、が `OFFER_GONE` になり、新しい申し出が影響を受けないこと。引き受けられた担当を引き受けた子供が申し出し直し、元の申し出のボタンが `OFFER_GONE` になること |

## 保存とアプリの権限（最小の権限）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.81 | 申し出の項目（`SWAP#<dutyId>`）の作成・取り下げ・引き受け・フックの掃除は、すべて `UpdateItem`（条件つき）と `TransactWriteItems`（項目ごとの `Update`・`ConditionCheck`）だけで書く（BR9.19）。`PutItem`・`DeleteItem`・`Scan`・`BatchGetItem`・`BatchWriteItem` は使わない。申し出の項目のキーは、`familyId`＝呼び出した家族、`sk`＝`SWAP#` ＋ 小文字の UUID に固定し、ボタンの値から作った文字列をそのままキーに使わない（形の確かめを通ったあとの値だけ）。**フックの掃除の `UpdateItem` は、必ず `status = open` の条件を付ける**。`UpdateItem` は項目がなければ作ってしまうので、条件なしの更新は存在しない担当の申し出の項目を勝手に作ってしまう。条件に合わず断られる（項目がない、`open` でない）ときは何も起きず、その断り（`ConditionalCheckFailedException`）だけを握りつぶす | 単体テストで、`line` と `api` の U8 のコードが `PutItem`・`DeleteItem`・`Scan` を 1 回も発行しないこと。フックを、申し出の項目がない担当・`accepted` の担当・ほかの家族の `dutyId` に対して呼び、`SWAP#` の項目が**作られない**こと、`open` の項目だけが `cancelled` になること。`ConditionalCheckFailedException` 以外の例外は握りつぶさないこと |
| NFR4.82 | **`line` の Lambda の権限は、U8 で足さない**（BR9.19）。`app-stack.ts` を読んで確かめた結果（U8 の前の状態）: `line` は `Calendar` に `dynamodb:GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`、`ChoreTypes` に `GetItem`・`Query`・`ConditionCheckItem`、`NotificationGroups` に `GetItem`・`PutItem`・`DeleteItem`、`Users` に `GetItem`・`PutItem`・`UpdateItem` と `lineUserId-index` の `Query`、`Families` に `GetItem`・`UpdateItem` を持つ。U8 の読み書き（申し出の `GetItem`・条件つき `UpdateItem`、担当の `Update`、月の状態の `ConditionCheck`、種類の `Query`、フックの `UpdateItem`）は、**項目ごとの許可（`UpdateItem`・`ConditionCheckItem`）で足りる**（`TransactWriteItems` 自体の許可はなく、項目ごとの操作で確かめられる）。したがって追加は**ない**。足さないもの: `Calendar` への `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、`ChoreTypes` への書き込み、別のサービスへの許可、`*` の資源。`api` の Lambda にも U8 で足さない（`Calendar` の `UpdateItem` などは U5 で付いたもの）。環境変数は `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` が `line`・`api` にあり、足さない。注意として、`UpdateItem` の許可は項目を作れる（`PutItem` と同じ効果）ので、`line` が書く項目の形は**コードの条件とキーの固定（NFR4.81）で守る**。許可で守れるものではないと承知しておく。もしコード生成で不足が見つかったときは、足す許可をここに戻って書き、理由を残す（現時点では見つかっていない） | CDK のテスト（`infrastructure` のテスト）で、`line` と `api` の IAM ポリシーと環境変数が U8 の前後で**変わらない**こと。`line` に上の「足さないもの」が 1 つも含まれないこと。ステージングの `line` が本番のテーブルの ARN を含まないこと |

## 返事と個人の情報

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.83 | 返事はすべて、そのイベントの reply トークンで、イベントが届いたグループ（または 1 対 1）にだけ送る（BR9.14）。push・multicast・broadcast は使わず、`to` の宛先を指定する呼び出しをしない。reply トークンは 1 回しか使わず、ログにも DynamoDB にも postback の data にも残さない（U6 の NFR5.12）。グループに出る内容（申し出た人の名前、日付、お手伝いの名前）は、そのグループのメンバーに見えてよいものだけで、**金額・単価・記録の時刻・ほかの子供の担当の一覧は入れない** | 単体テストで、LINE への呼び出しが `POST /v2/bot/message/reply` だけで、1 イベントにつき 0 回か 1 回であること。`push`・`multicast`・`broadcast` を含む呼び出しが 1 件もないこと。返事の本文に単価・金額・UUID（`dutyId`・`offerId`）が含まれないこと |
| NFR4.84 | 名前の扱い。返事に入れる子供の表示名は、グループの入口が読んだ利用者の記録から取り（追加の読み取りと LINE のプロフィール取得はしない。BR9.2）、**返事の本文にだけ**使う。申し出の項目・担当の項目・ログには保存しない（BR9.13、BR9.18）。長い名前は 20 文字までに切る（BR9.7）。名前・お手伝いの名前を HTML や LINE の特殊な書式として解釈させる経路を作らない（文字としてメッセージに入れる）。名前が引けなかったときは「だれか」、お手伝いの名前は「お手伝い」と言い換える（書いたあとの返事を止めない。BR9.14） | 作り物の値（`<作り物の値>` の目印を付けた表示名・種類の名前。タグや改行、21 文字以上の長さを含む）で、返事の本文にだけ現れ、`SWAP#` の項目、担当の項目、ログに現れないこと。名前が空・引けない場合の言い換え |
| NFR4.85 | 入口で大きさを制限し、関係のない会話では何も書かない。message の text は 5000 文字以内、postback の data は 300 文字以内（NFR4.75、NFR4.76）。**家事交代の操作にあたらないグループの会話では、二度処理しない記録も含めて DynamoDB に何も書かない**（`accepts` が false。U3 の NFR3.4、U6 の NFR3.7 と同じ）。1 回の webhook に含まれるイベントの数は LINE が決める上限のままにし、U8 で増やさない。1 回の一覧で読む担当は今月と来月だけ（NFR3.14）で、ほかの家族の担当や古い月は読まない | 家事交代にあたらない text（雑談）を大量に送り、書き込みが 0 回であること。11 件以上の担当がある子供の一覧が、ボタン 10 件に絞られること |

## 秘密の情報

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR5.14 | U8 で新しい秘密の情報は作らない。LINE の返事に使うチャネルアクセストークンとチャネルシークレットは、U1 の SSM（`line/*`）の値を、これまでどおり Lambda の起動時に読む。`api` の署名の鍵（`jwt/*`）は U8 では使わない。スクリプト・README・設定ファイルに秘密の値を書かない。例は `<作り物の値>` と書く | リポジトリの秘密の情報の検査（gitleaks。NFR5）が通ること。U8 で足したコード・テスト・前提データに本物の秘密の値がないこと |
| NFR5.15 | テストとその前提データ（筋書き、前提データ、README の例）に、本物の LINE のユーザー ID、グループ ID、reply トークン、チャネルの秘密、表示名を使わない。署名のテストには、テスト用に作った値（`<作り物の値>`）で計算した本物の HMAC の署名を使う（U6 の NFR5.11 と同じ） | gitleaks が通り、テストの入力が作り物の値だけであること（レビュー） |

## 脅威と備え

| 脅威 | 備え | 扱い |
|------|------|------|
| 偽の Webhook で、ほかの人の名前で申し出る・引き受ける | NFR4.74（署名と秘密のヘッダー） | 備える |
| 子供が postback の data を書き換えて、ほかの子供の担当を申し出る・ほかの人の申し出を取り下げる | NFR4.76、NFR4.78（data は信じず、読んだ担当・申し出で本人かを決める） | 備える |
| ほかの家族の `dutyId`・`offerId` を知って、ほかの家族の担当を引き受ける | NFR4.77、NFR4.78（家族はグループの登録から決める。家族の範囲で探して見つからない） | 備える |
| 管理者が申し出る・引き受ける | NFR4.78（子供だけ。管理者には決まった文） | 備える |
| 転送・貼り付けでグループ外へ持ち出したボタンを押す | NFR4.76、NFR4.77（1 対 1・`room` は何もしない。グループの登録と家族のメンバーを確かめる） | 備える |
| 古い申し出のボタンで、別の申し出・担当を動かす | NFR4.80（`offerId` と `version` の一致） | 備える |
| 2 人が同時に引き受けて、担当が二重に動く・申し出が両方成立する | NFR4.79（同じ取引で、最初の 1 人だけ） | 備える |
| 担当だけが変わる・申し出だけが引き受け済みになる | NFR4.79（3 項目を同じ取引に入れる） | 備える |
| フックが存在しない担当の申し出の項目を作ってしまう | NFR4.81（`status = open` の条件。作らない） | 備える |
| 「家事交代」に似た別の文字列で反応する・雑談で反応する | NFR4.75（完全一致。正規化しない） | 備える |
| 返事が家族以外に届く・お小遣いの情報が見える | NFR4.83（reply だけ。金額を入れない）、NFR4.77（断りは決まった文） | 備える |
| ログから名前・LINE の ID が漏れる | NFR4.84、NFR2.65 | 備える |
| `line` が乗っ取られて、担当・申し出を消す・大量に作る | NFR4.81、NFR4.82（`DeleteItem`・`PutItem` の許可なし。ただし `UpdateItem` は項目を作れるので、コードの条件とキーの固定で守る。完全な防御ではないと承知） | 備える（U6 から引き継ぐ。残る危険は上に明記） |
| 偽の Webhook を大量に送って費用を増やす | 署名の確かめを先に行い、同時実行の上限（U1 の NFR1.6）で受ける。家事交代にあたらないイベントは書き込みもしない（NFR4.85） | 備える（U1 から引き継ぐ） |
| 子供が別の子供になりすまして引き受ける（LINE のアカウントを貸す） | 範囲外。LINE のアカウントの本人確認は LINE が行い、家族内の信頼を前提にする | 備えない（前提） |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR4、NFR5、NFR10、FR7.1〜FR7.5、FR1.7）
- `inception/user-stories/stories.md`（AC7.1.1〜AC7.1.11、AC1.2.5）
- `inception/contract-design/contract-summary.md`（C3 の postback の形、C6 `runGroupOperation`、C8 の申し出の窓口、C10 の理由の印と文言）
- `construction/u8-swap/functional-design/rules.md`（BR9.1〜BR9.4、BR9.7〜BR9.10、BR9.12〜BR9.14、BR9.16、BR9.18、BR9.19）、`functional-spec.md`（F1〜F4、F6、結果の印と返事の対応）、`entities.md`（SwapOffer のキー、SwapButtonData）
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.7、NFR4.8、NFR4.13、NFR5.1〜NFR5.6）
- `construction/u3-notification-group/nfr-requirements/security-requirements.md`（NFR4.27、NFR4.28、NFR3.4）
- `construction/u6-recording/nfr-requirements/security-requirements.md`（NFR4.53〜NFR4.59、NFR4.63、NFR4.64、NFR5.10〜NFR5.12。LINE の経路の要件の書き方）
- `construction/u7-review-confirm/nfr-requirements/security-requirements.md`（NFR4.65〜NFR4.73、NFR5.13。取引の原子性と読み直し）
- 既存コード（読むだけ）: `entries/line.ts`（`accepts`、署名の確かめの順番）、`handlers/line/groupCommand.ts`（登録の言葉の読み方。U8 の読み方は正規表現）、`services/groupCommandGate.ts`（`runGroupOperation`）、`services/oneToOneGate.ts`、`services/lineApiService.ts`、`repositories/calendarRepository.ts`（`findDuty`、`buildMonthGuard`、`writeTransaction`、`classifyCancellation`）、`infrastructure/lib/app-stack.ts`（`line`・`api` の既存の権限と環境変数）、`infrastructure/lib/data-stack.ts`（`lineUserId-index` の射影は ALL）

## Assumptions & Open Questions

- [assumption] `line` の権限が足りているという確認は、`app-stack.ts` の既存の文を読んだ結果です（`Calendar` に `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`）。実際に取引が通ることは、ステージングの反映後の動作確認（NFR7.48）と、コード生成での統合に近いテストで確かめます。取引の中の項目ごとの許可の判定（`Update` は `UpdateItem`、`ConditionCheck` は `ConditionCheckItem`）は、U6 の記録で通った形（担当の `Update` ＋ 月の `ConditionCheck`）と同じなので、不足の見込みは低いと見ます
- [assumption] `UpdateItem` の許可は項目を作れる（`PutItem` と同じ効果）ので、「`PutItem` を足さない」は項目を作らせない保証にはなりません（NFR4.82）。守りはコードの条件（NFR4.81）とキーの固定です。この点を許容し、`line` に `PutItem` を足す代わりの手段（例: 申し出の作成を `api` にだけ置く）は、LINE から申し出る流れに合わないので採りません
- [assumption] 引き受けた子供の自分の担当に触れないことは、取引の項目（担当、申し出、月の状態）に引き受けた子供の担当が含まれないことで確かめます（NFR4.79）。同じ日の同じ種類には 1 家族 1 担当なので、重なりは起きません（entities.md）
- [assumption] 管理者が「引き受ける」を押したときの返事「この申し出には応えられません」は、管理者に申し出の存在を教えない文ではありません（グループの全員にその申し出が見えているため）。ほかの家族の申し出の存在を教えないこと（NFR4.78 の (e)）だけを守ります
- [assumption] LINE のアカウントを貸し借りした「なりすまし」は、家族内の信頼を前提にして備えません（脅威の表）
