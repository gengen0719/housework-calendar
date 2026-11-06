# NFR 要件 — U1 最初の形と家族を作る — 質問

U1（`u1-skeleton-family`）の、機能以外の要件（速さ、安全、止まらないこと、記録の残し方）と、使う技術を決めます。U1 は AWS の構成の土台を作るので、ここで決めた技術はあとの単位でもそのまま使います。

すでに決まっていること（もう一度は聞きません）:

- 速さの目安は、画面の表示が 3 秒以内、LINE のトークの返事が 10 秒以内（作る順の計画の Q7）
- 費用は毎月 0 円。AWS の無料枠と LINE の無料プランの範囲で動かす（NFR1）
- 常に動かしておくサーバーは持たない（NFR3）。画面は React、裏側は Lambda 上の Node.js（TypeScript）、データは DynamoDB、配備は AWS CDK（TypeScript）
- 秘密の情報はリポジトリに入れない（NFR5）
- 作り手へのエラーの知らせは U10 でまとめて入れる。U1〜U9 はログを自分で見る（作る順の計画の Q4）
- 整形は Prettier、検査は ESLint、行カバレッジ 80% 以上、取り込み前に GitHub Actions で動かす（`team.md`）

## Q1. [アーキテクト] LINE からのイベントの処理に失敗したときに LINE に返すもの

機能設計のレビューで残った重い指摘です。契約（C3）では「署名を確かめたあとは、処理の結果にかかわらず 200 を返す」としています。ところが LINE は 200 を受け取ったイベントを送り直さないため、処理に失敗したイベント（友だち登録やブロック）は二度と届きません。特にブロックを落とすと、ブロックした人が「友だち」のまま使えてしまいます。

A. 思いがけない失敗（データベースにつながらないなど）のときだけ 500 を返し、LINE に送り直してもらう（LINE の管理画面で再送を有効にする）。業務の決まりで断ったとき（返事で知らせるもの）は 200。契約 C3 をこう直す
B. 200 のままにし、失敗したイベントを自分で記録して、あとで自分でやり直す仕組みを作る
X. Other (please specify)

[Answer]: A

## Q2. [セキュリティ] セッションの期限

画面に渡す署名付きのセッショントークン（契約 C2）の期限です。期限が短いほど、トークンが盗まれたときの害が小さくなります。期限が切れても、画面は LINE の ID トークンから自動で取り直すので、利用者がもう一度ログインする手間はほとんどありません。

A. 1 時間
B. 24 時間
C. 7 日
X. Other (please specify)

[Answer]: A

## Q3. [セキュリティ] 画面がセッショントークンをどこに持つか

画面のスクリプトがトークンを持つので、画面に弱いところがあると読まれるおそれがあります（契約の Assumptions）。

A. 画面のメモリにだけ持つ。画面を開き直すたびに、LINE の ID トークンから取り直す（いちばん安全。開くたびに少し時間がかかる）
B. ブラウザのタブの保存場所（sessionStorage）に持つ。タブを閉じると消える
C. ブラウザの保存場所（localStorage）に持つ。閉じても残る
X. Other (please specify)

[Answer]: A

## Q4. [アーキテクト] 画面と裏側の入口の作り方（費用 0 円）

AWS の API Gateway は、無料なのは最初の 12 か月だけで、そのあとは少し費用がかかります。Lambda の関数 URL と CloudFront は、ずっと続く無料枠の範囲で使えます。

A. 画面の置き場所（S3）と、画面用・LINE 用の Lambda の関数 URL を、CloudFront の 1 つのドメインの下にまとめる（画面は `/`、画面用 API は `/v1/...`、LINE の Webhook は `/line/webhook`）。API Gateway は使わない
B. API Gateway（HTTP API）を使う。12 か月を過ぎたら少し費用がかかる
X. Other (please specify)

[Answer]: A

## Q5. [セキュリティ] 秘密の情報（チャネルのシークレット、署名の鍵）の置き場所

AWS Secrets Manager は 1 つの秘密ごとに毎月費用がかかります。Systems Manager のパラメータストア（標準）は無料で、暗号化して置けます。

A. Systems Manager のパラメータストア（SecureString）に環境ごとに置き、Lambda が起動したときに読む
B. Secrets Manager に置く（毎月少し費用がかかる）
X. Other (please specify)

[Answer]: A

## Q6. [品質] テストの道具

チームの決まりで、先に Given/When/Then の筋書きを書いて作ります（BDD）。筋書きを動かす道具は、まだ決まっていません（`team.md`）。

A. Vitest にまとめる。筋書きは Gherkin（`.feature` ファイル）で書き、Vitest の上で動かす道具（vitest-cucumber など）で動かす。カバレッジも Vitest で測る
B. 筋書きは Cucumber.js、細かいテストとカバレッジは Vitest と、道具を分ける
C. Gherkin のファイルは使わず、Vitest のテストの名前と中身を Given/When/Then の形で書く
X. Other (please specify)

[Answer]: A

## Q7. [アーキテクト] 記録を残す期間と時間切れ

機能設計で、あとで決めることにした値です。

- 処理済みの LINE のイベントの記録を残す期間
- 「家族を作る」などの送り直しを見分ける記録を残す期間
- 「処理中」のままのイベントを、やり直してよいまでの時間
- ログ（CloudWatch Logs）を残す期間

A. おすすめの値にする: イベントの記録 7 日、送り直しの記録 24 時間、やり直してよいまで 2 分（Lambda の時間切れは 30 秒）、ログ 30 日
B. 別の値にする（X に書く）
X. Other (please specify)

[Answer]: A

## Q8. [開発] 画面の部品集

部品の設計で「画面の部品集（どれを使うかは設計で決める）」としていました。見やすさの決まり（文字と背景の差 4.5:1 以上、押す場所 44×44 ピクセル以上。NFR9）を守りやすいかが関わります。

A. 部品集を使わず、自分で CSS を書く（軽い。見やすさは自分で守る）
B. Mantine を使う
C. MUI を使う
D. Chakra UI を使う
X. Other (please specify)

[Answer]: C

## Consolidated Summary Confirmation

回答のまとめ:

- LINE からのイベントの処理で思いがけない失敗が起きたときだけ 500 を返し、LINE に送り直してもらう。LINE の管理画面で再送を有効にする。業務の決まりで断ったときは 200。契約 C3 をこう直す（Q1）
- セッションの期限は 1 時間。切れたら画面が LINE の ID トークンから自動で取り直す（Q2）
- 画面はセッショントークンをメモリにだけ持ち、開き直すたびに取り直す（Q3）
- 画面（S3）と、画面用・LINE 用の Lambda の関数 URL を、CloudFront の 1 つのドメインの下にまとめる（`/`、`/v1/...`、`/line/webhook`）。API Gateway は使わない（Q4）
- 秘密の情報は Systems Manager のパラメータストア（SecureString）に環境ごとに置き、Lambda が起動したときに読む（Q5）
- テストは Vitest にまとめる。筋書きは Gherkin（`.feature`）で書き、Vitest の上で動かす。カバレッジも Vitest で測る（Q6）
- 処理済みのイベントの記録は 7 日、送り直しの記録は 24 時間、「処理中」をやり直してよいまで 2 分（Lambda の時間切れは 30 秒）、ログは 30 日残す（Q7）
- 画面の部品集は MUI を使う（Q8）

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
