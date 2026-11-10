# 安全の要件（Security）— U9 お小遣いの額

U9（`u9-allowance`）の安全の要件です。U1〜U8 の要件（NFR4.1〜NFR4.85、NFR5.1〜NFR5.15）は、そのまま使います。ここでは U9 で足すものを、U8 の番号の続きで書きます。U9 の入口は、画面用の `GET /v1/months/{month}/allowances` だけです（読み取り専用）。LINE の入口は足しません（トークで額を返す機能は作らない。BR10.1）。窓口 `getAllowances`（C9）は、U10 が裏側から呼ぶ（HTTP の入口ではない）ものです。決まっていないことで人に聞くものは、ありませんでした。

お小遣いの額は、子供ごとのお金の情報なので、家族の外に見えないことを守ります。家族の中では、**機能設計の決め（BR10.1、Q5）どおり、母親も子供も家族の全員分を見られます**（自分の分だけに絞らない）。

## 入口の確かめ（誰が呼べるか）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.86 | `GET /v1/months/{month}/allowances` は、U1 の共通の確かめを、**セッション → ブロック中 → 家族のメンバー → 月の形（422）**の順で通ってから処理する（BR10.1、BR10.8。U5 の `getCalendar` と同じ順番）。(a) セッションがない・署名が合わない・期限切れ・記録がない: 401。(b) ブロック中: 403 `NOT_FRIEND`。(c) 家族のメンバーでない（家族または役割がない）: 403 `NOT_FAMILY_MEMBER`。額も内訳も返さない（AC1.1.11）。(d) 月の形の確かめは、メンバーの確かめのあとに行い、DynamoDB の読み取り（認証の 1 回を除く）の前に行う。管理者である必要はない（`requireAdmin` は付けない）。この入口は、`role: system` の ctx では呼べない（HTTP の入口は、セッションの利用者の家族と役割だけから ctx を作る）。要求に本文はなく、家族や子供を指す入力もない（家族はセッションから決まる）ので、404 `NOT_FOUND` を起こさない | セッションなし・署名違い・期限切れ・ブロック中の利用者・家族のメンバーでない利用者（家族なし、役割なし）の各ケースで、期待のステータスになり、`Calendar`・`Families`・`ChoreTypes` の読み取りが 0 回であること。ブロック中の利用者に 403 `NOT_FRIEND`、メンバーでなければ 403 `NOT_FAMILY_MEMBER`（月が `2027-13` でも 403 が先）であること。管理者と子供の両方が 200 になること。月の形が違う（`2027-13`）メンバーが 422 `INVALID_MONTH` で、`Calendar` の読み取りが 0 回であること |
| NFR4.87 | **見える範囲は「同じ家族の全員分」で、役割では絞らない**（BR10.1、Q5、AC4.1.3）。管理者も子供も、その家族の子供全員（今いる子供と、その月に「済」がある抜けた子供）の額と内訳を見られる。子供が自分の行だけに絞られることはなく、自分の行の強調は表示（BR10.11）だけで権限ではない。ほかの家族のデータは、一切読まない・返さない（読み取りはいつも `familyId = ctx.familyId` をキーにする。`ctx.familyId` はセッションの利用者の記録から決め、URL・本文・ヘッダーからは決めない）。LINE のトークで額を返す入口は作らない（Q5） | (a) 家族 A の子供と管理者で呼び、どちらも家族 A の子供全員の行を得ること（子供の ID が 3 人分そろうこと）。(b) 家族 B のデータを同時に用意しても、家族 A の応答に家族 B の子供・担当・種類が 1 つも入らないこと。(c) 子供のセッションに `?childUserId=...` や `?familyId=...` を付けても無視され、応答が変わらないこと。(d) U9 のコードに LINE の message／postback を受ける入口がないこと（振り分け表の確認） |
| NFR4.88 | パスの `{month}` は、**`YYYY-MM`（年 2000〜2100、月 01〜12）か、`current` という文字列そのもの**だけを受ける（BR10.8。U5 の `requireMonthParam` と同じ形に、`current` を足す）。`current` は大文字小文字を区別し、`Current`・`CURRENT`・` current`・`current `・`current/`・`2027-1`・`2027-13`・`0050-01`・`2027-01-01`・空は 422 `INVALID_MONTH`。DynamoDB のキー（`M#<month>#`）は**検証したあとの値だけ**から作る（未検証の文字列をキーや条件式に入れない）。クエリ文字列と本文は使わない（あっても無視する）。範囲外の月（`firstMonth` より前、`lastMonth` より先）は、形が正しければ断らず計算して返す（BR10.8。読み取りの安全に関係しないため）。ただし年 2000〜2100 の外は 422 | 断る例を 1 つずつ送り、どれも 422 `INVALID_MONTH` で、`Calendar` の Query が 0 回であること。`current` と今日の月の `YYYY-MM` が同じ答え（`month` の値は実際の月）になること。範囲外の月（`firstMonth` の前、`lastMonth` の先）が 200 で、今いる子供が 0 円の行で返ること |
| NFR4.89 | **U9 は読み取りだけで、保存先も権限も増やさない**（BR10.14）。コードは `Calendar` の `Query`、`Users`・`Families`・`ChoreTypes` の `GetItem`／`Query` だけを呼び、書き込みのコマンドを 1 回も使わない。`api` の Lambda の権限は、コード生成で `infrastructure/lib/app-stack.ts` を読んで確かめる（U5〜U8 で足し済みの読み取りで足りる見込み）。足りない権限があれば、その差分だけを U9 で足し、CDK のテストの期待に入れる。差分がなければ、テストの期待に「U9 で差分がない」ことを入れる。`line` の Lambda の権限と環境変数は U9 では変えない。`scheduled` の Lambda は U10 が足すもので、U9 の時点では存在しない（U10 が `getAllowances` を使うときに、必要な権限を足す） | 単体テストで、書き込みのコマンド（`PutItem`・`UpdateItem`・`DeleteItem`・`TransactWriteItems`・`BatchWriteItem`）の送信が 0 回であること。CDK のテストで、U9 の前後に `api` の権限が「差分なし」（または必要な読み取りだけの追加）であり、`line` の権限と環境変数が変わらず（`scheduled` は U9 の時点で存在しない）、テーブル・索引・Lambda・指標・アラームの数が変わらないこと（NFR1.36） |

## 窓口と内部の読み取りの境界

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.90 | 窓口の使われ方を絞る。(a) `getAllowances(ctx, month)` は、家族を引数で受け取らず、`ctx.familyId` だけを使う。呼べるのは、画面の入口（セッションから作った ctx）と、U10 のお知らせ用の裏側の入口（`{ familyId, role: system }`）だけで、HTTP や LINE の入力から `role: system` を作る道はない（BR10.7、BR10.17）。(b) `findDisplayName(ctx, userId)`（C6。BR10.19）は、**表示名だけ**を返し（LINE のユーザー ID・役割・家族 ID・友だち状態・最後に見た時刻などは返さない）、見つからなければ `NOT_FOUND`。**HTTP や LINE の入力から受け取った ID を渡さず**、同じ家族の担当に出てきた子供の ID だけを渡す呼び出しにする（呼び出しは `allowanceService` の 1 か所だけ。呼び出し元を限る）。(c) `getFamilyCreatedAt(ctx)` は、`ctx.familyId` の家族の作成時刻（UTC）だけを返す。(d) `listDoneDuties`・`isMonthConfirmed`（C8）は `ctx.familyId` をキーにして読み、ほかの家族の月は読めない | 単体テストで、(a) 別の家族の `familyId` を引数で渡せない型であること、(b) `findDisplayName` の戻り値が表示名の文字列（または `NOT_FOUND`）だけで、LINE の ID・役割・家族 ID が含まれないこと、`findDisplayName` を呼ぶコードが `allowanceService` の 1 か所だけであること（呼び出し元の確認）、(c)(d) 家族 A の ctx で家族 B の月・作成時刻が読めないこと |
| NFR4.91 | 応答に入れる項目を**許可した項目だけ**に絞る。`AllowanceMonthView` は `month`・`confirmed`・`today`・`firstMonth`・`lastMonth`・`allowances` だけ、`Allowance` は `childUserId`（アプリの `userId`）・`displayName`・`current`・`month`・`lines`・`adjustments`・`total` だけ、`lines` は `choreTypeId`・`choreName`・`unitPrice`・`count`・`amount` だけ、`adjustments` は U11 が項目を決める（U9 の許可リストは「`adjustments` が空であること」だけ。U11 の nfr-requirements で許可リストを確定する。機能設計の entities.md は U11 が項目を足してよいとしている）。担当の項目をそのままコピーして返さない（`recordedBy`・`recordedAt`・`version`・`origin`・`unitPrice` 以外の内部の項目・LINE のユーザー ID・グループ ID を出さない）。管理者の `userId`・表示名は、担当の持ち主として出てきても行にも応答にも入れない（BR10.6、BR10.13 の 3）。0 円の行（単価 0 円の担当）も許可した項目だけ | 作り物の値（`<作り物の値>` の目印）を入れた担当・利用者・種類で呼び、応答の JSON の項目名が上の許可リストと一致すること（余分な項目が 1 つもないこと。`adjustments` は空の配列であること。加算・減額の行の項目の許可は U11 に引き継ぐ）、LINE のユーザー ID・グループ ID・`recordedBy` の目印が応答のどこにも出ないこと、管理者の表示名と `userId` が応答に出ないこと |

## 表示と通信

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.92 | 画面では、子供の表示名・お手伝いの名前・加算・減額の理由（U11 で入る）を、**HTML として差し込まない**（文字として出す。U1 の NFR4.12、U5 の NFR4.49、U7 の NFR9.8 と同じ）。名前の代わりに出す固定の文言（「名前が分からない子供」「不明なお手伝い」）も同じ。応答は `Cache-Control: no-store` を付け、**端末のブラウザの保存に額が残らない**ようにする（途中の保存は、`/v1/*` が CloudFront の背後にあり、cachePolicy が CACHING_DISABLED のため元から起きない。このヘッダーは端末のブラウザの保存への念のための備え）（月は URL のパスに入るが、額や名前は URL に入らない）。URL に子供の ID・額・名前を入れない（パスは月だけ） | 画面のテストで、名前に `<script>` や `<b>` の文字を入れた作り物の値が、タグとして解釈されず文字として出ること。応答のヘッダーに `Cache-Control: no-store` があること。URL・クエリ文字列に額・名前・子供の ID が出ないこと |
| NFR4.93 | 失敗の返事から、内部の情報が分からないようにする。500 `INTERNAL` の本文は決まった文（コードと一般的なメッセージだけ）で、例外の文・スタック・テーブル名・`familyId`・`dutyId`・金額・名前を入れない（U1 の既存の形）。403・422 の本文も決まった文だけで、ほかの家族の存在や子供の人数が分からない。**異常なデータ（「済」なのに単価がない、種類がない、管理者の担当。BR10.13）は、応答にも画面にも出さず、ログ（NFR2.75）にだけ残す**（画面は止めない）。同じ要求を何度送っても、読み取りだけなので副作用がない（NFR2.67） | 読み取りを失敗させた差し替えで 500 の本文が決まった文だけであること（作り物の値の目印が出ないこと）。異常なデータ（3 種類）を入れたとき、応答に ID・理由・件数の異常が出ないこと。403・422 の本文が家族の情報を含まないこと |

## 秘密の情報

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR5.16 | U9 で新しい秘密の情報は作らない。セッションの署名の秘密（U1 の SSM の値）を、これまでの形で読み、リポジトリ・テスト・ログ・応答に書かない。LINE のチャネルのトークンとシークレットは、U9 は LINE に何も送らないので、**読みも使いもしない**（`line` の Lambda に U9 は何も足さない） | CDK のテストで、U9 の前後に SSM のパラメータ・環境変数・権限が変わらないこと。U9 のコードが LINE の API 呼び出しと LINE の秘密の読み込みを含まないこと（`fetch` が 0 回であること。NFR7.55 と合わせる） |
| NFR5.17 | テストとその前提データ（筋書き、前提データ、README の例、画面のテスト）に、本物の LINE のユーザー ID、グループ ID、チャネルの秘密、トークン、表示名、実際のお小遣いの額を入れない。例の名前（太郎・花子・次郎）と金額は作り物の値で、`<作り物の値>` の目印を付けられるデータで検証する（U8 の NFR5.15 と同じ）。公開リポジトリのため、gitleaks の検査（CI）を通す | CI の gitleaks の検査が通ること。テストの前提データに、本物らしい LINE の ID の形（`U` と 32 文字の 16 進数）や実在の名前が入っていないこと（レビュー） |

## 脅威と備え

| 脅威 | 備え | 関連 |
|------|------|------|
| 家族の外の人（ほかの家族、ログインしていない人、ブロック中の人）が額を見る | セッション、ブロック中、家族のメンバーの確かめを、月の形の確かめより先に行う。読み取りはいつも `ctx.familyId` をキーにする。家族や子供を指す入力はない | NFR4.86、NFR4.87 |
| 月の指定を細工して、キーの組み立てや別の家族の月を読ませる | 月は厳しい形（`YYYY-MM` か `current`）で検証してからキーを作る。家族はセッションから決める | NFR4.88 |
| 窓口に別の家族の ID や LINE の入力を渡して名前・時刻を読ませる | 窓口は `ctx.familyId` だけを使う。`findDisplayName` は表示名だけを返し、呼び出しは 1 か所で、同じ家族の担当に出てきた ID に限る | NFR4.90 |
| 応答に余分な内部の項目や管理者の情報が混ざる | 許可した項目だけを組み立てて返す（担当の項目をそのまま返さない） | NFR4.91 |
| 名前に仕込んだタグで画面が壊れる・実行される | 文字として出す（HTML として差し込まない） | NFR4.92 |
| 額が端末のブラウザに残る | `Cache-Control: no-store`（CloudFront は CACHING_DISABLED で無効化済み）、URL に額・名前を入れない | NFR4.92 |
| ログから名前・額・LINE の ID が漏れる | ログに名前・額・LINE の ID を書かない（件数と ID だけ） | NFR2.76 |
| 大量の呼び出しで費用や処理が膨らむ | 1 回の読み取りは約 5 回で、担当の数で増えない。`api` の同時実行の上限（U1 の NFR1.6、U5 の NFR3.6）が効く。先読み・自動の読み直しをしない | NFR7.55、NFR1.38、NFR3.18 |
| 書き込みの道が混ざって額が書き換わる | U9 は書き込みのコマンドを 1 回も使わない。額も回数も保存しない | NFR4.89 |
| 異常なデータの原因を探るために、本番のデータを手で書き換える | 手で書き換えない。調べるのはログ、直すのはアプリの操作かコード・手順（NFR6.10） | NFR6.10 |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR4、NFR5、NFR6、FR4.3、FR8.1、FR1.7）
- `inception/user-stories/stories.md`（AC1.1.11、AC4.1.3、US8.1）
- `inception/contract-design/contract-summary.md`（C1、C6〜C9、familyScope）
- `construction/u9-allowance/functional-design/rules.md`（BR10.1、BR10.6〜BR10.8、BR10.13〜BR10.15、BR10.19）、`functional-spec.md`（誰が何を見るか、契約への追加）、`entities.md`
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.1〜NFR4.13。共通の確かめ、NFR4.12 の HTML を差し込まない）
- `construction/u5-assignment-calendar/nfr-requirements/security-requirements.md`（NFR4.42〜NFR4.52。`GET .../calendar` の確かめの順番と月の形の確かめ）
- `construction/u8-swap/nfr-requirements/security-requirements.md`（NFR4.74〜NFR4.85、NFR5.14・NFR5.15。権限を足さない書き方、許可した項目、作り物の値の確かめ）
- 既存コード（読むだけ）: `middleware/requireAuth.ts`（`getUserStatus` と `NOT_FRIEND`）、`middleware/requireMembership.ts`（`FamilyContext`）、`services/familyMemberService.ts`（`listMembers`）、`repositories/calendarRepository.ts`（`loadMonth` のキー）、`handlers/calendar/`（`getCalendar`・`params`）、`entries/api.ts`（振り分け表）。応答ヘッダーに `Cache-Control` を付けているコードは、検索した範囲では見つからなかった

## Assumptions & Open Questions

- [assumption] **見える範囲は機能設計（BR10.1、Q5）どおり「家族の全員が全員分」** で、子供の権限を自分の分に絞りません（AC4.1.3 の文言に合わせた決めです）。子供が兄弟の額を見られることが望ましくない場合は、機能設計の変更になるため、このステージでは触れません。承認の場で人が確かめてください
- [assumption] 応答に `Cache-Control: no-store` を付けることは、機能設計に書かれていない U9 の追加の要件です。既存の入口に同じヘッダーを付けているコードは見つからなかったため、U9 の入口だけに付けます。`/v1/*` は CloudFront の背後にあり、cachePolicy は CACHING_DISABLED（`infrastructure/lib/app-stack.ts`）なので、途中の保存は元から起きません。残るのは端末のブラウザの保存で、念のために明示します。付け方は NFR8.19 の (d)（`RouteResult` の任意のヘッダー）に書きました。ほかの入口にも付けるかは、この単位では決めません
- [assumption] HTTP の入口が `role: system` を受け付けないことは、既存の `requireAuth`／`requireMembership` が `admin`／`child` だけを作る前提で、コード生成のテストで確かめます。U10 が `role: system` を使えるように型を広げるときは、HTTP の入口の ctx の作り方が変わらないことを同じテストで守ってください
- [assumption] `findDisplayName` が同じ家族のデータだけを読むことは、「呼び出し側が、家族の担当に出てきた ID だけを渡す」前提に頼ります（抜けた子供は `Users` の家族の欄が空か別の家族に変わっていることがあり、窓口の中で家族の一致を確かめられないため）。機能設計の BR10.19 と同じ前提です。呼び出し元を 1 か所に限ることで備えます（NFR4.90）
- [assumption] 管理者の表示名・`userId` を応答に出さないのは、機能設計の BR10.6（管理者は行を出さない）の読みです。管理者の ID が担当の持ち主として出てきた異常な場合も、行も名前も出しません
- [assumption] アクセス制御の確かめは、自動のテストで確かめられる範囲です。実際の攻撃への強さを保証するものではありません
