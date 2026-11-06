# NFR 設計 — U1 最初の形と家族を作る — 質問

U1（`u1-skeleton-family`）の NFR 要件（`nfr-requirements/`）をどう作るかを決めます。ここで決めるのは仕組みの形です。コードそのものは、次のコード生成で作ります。

すでに決まっていることは NFR 要件（`nfr-requirements/`）のとおりで、ここでは詳しい方針を聞きます。

## Q1. [アーキテクト] DynamoDB のテーブルの形

U1 では 3 種類のデータを DynamoDB に入れます（User、Family、ProcessedLineEvent）。あとの単位でも同じテーブルに項目を追加するか、テーブルを別にするかです。

A. 1 つのテーブルにすべてを入れる（Single-Table Design）。パーティションキーと並べ替えキーの組み合わせで種類を分ける（例: `PK: FAMILY#{familyId}`, `SK: USER#{userId}`）
B. 種類ごとにテーブルを分ける（User 用、Family 用、ProcessedLineEvent 用、など）
X. Other (please specify)

[Answer]: B

## Q2. [セキュリティ] CloudFront の秘密のヘッダーの入れ方（NFR4.13、NFR5.1）

CloudFront が Lambda の関数 URL に付ける秘密のヘッダーは、CloudFront の設定に値をそのまま書く形だと CDK の出力（CloudFormation のテンプレート）に平文で入ります（NFR 要件のレビューで指摘）。どうしますか。

A. Lambda の関数 URL に GitHub Actions から反映するとき（または CDK の `deploy` のとき）に、パラメータストアから値を読んで CloudFront の設定に入れる。CDK のコードにも Git にも値は入らない
B. Lambda の関数 URL を AWS コンソールから手で設定する（CDK の管理外にする）
X. Other (please specify)

[Answer]: A

## Q3. [セキュリティ] セッション JWT の鍵の入れ替え

NFR4.2 で JWT を HMAC-SHA256 で署名すると決めました。鍵が漏れたときや、定期的に入れ替えるときの扱いです。

A. 入れ替えるときは、新しい鍵をパラメータストアに入れ直し、Lambda を再起動する（次の要求から新しい鍵が使われる）。古いセッションは無効になるが、利用者は次に開いたときに自動で取り直す（Q3 の期限 1 時間と合わせて、最大 1 時間で全員が新しい鍵になる）
B. 旧い鍵も一定期間受け付ける（2 つの鍵を同時に持つ）
X. Other (please specify)

[Answer]: A

## Q4. [アーキテクト] Lambda のメモリの大きさ（起動の速さ）

Lambda はメモリを大きくすると、CPU の割り当てが増えて起動が速くなります（コスト 0 円の枠に収まれば費用は変わりません）。画面 3 秒以内、LINE 10 秒以内（NFR7.1〜NFR7.3）に余裕を持たせるためです。

A. 画面用と LINE 用はそれぞれ 256 MB から始め、B1 でステージングで計測して直す
B. 128 MB（Lambda の最小値）から始め、B1 で計測して直す
X. Other (please specify)

[Answer]: A

## Q5. [開発] Lambda の設定の初期化（接続の使い回し）

Lambda は関数の外（グローバルのスコープ）で行った初期化を、同じ実行環境で使い回します。DynamoDB のクライアントやパラメータストアから読んだ値は、Lambda の起動のたびに作り直すのではなく、最初の 1 回だけ作るとよいです。

A. DynamoDB のクライアントはグローバルのスコープで 1 つ作り、要求のたびに使い回す。パラメータストアの値も、起動のときに 1 回だけ読む
B. 要求のたびに作る（最もシンプル。パフォーマンスは少し下がる）
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

回答のまとめ:

- DynamoDB はテーブルを種類ごとに分ける（User 用、Family 用、ProcessedLineEvent 用、など）（Q1）
- CloudFront の秘密のヘッダーの値は、反映のときにパラメータストアから読んで CloudFront の設定に入れる。CDK のコードにも Git にも値は入らない（Q2）
- セッション JWT の鍵の入れ替えは、パラメータストアに入れ直して Lambda を再起動する。古いセッションは無効になり、最大 1 時間で全員が新しい鍵に切り替わる（Q3）
- Lambda のメモリは画面用と LINE 用をそれぞれ 256 MB から始め、B1 でステージングで計測して直す（Q4）
- DynamoDB のクライアントはグローバルのスコープで 1 つ作り使い回す。パラメータストアの値も起動のときに 1 回だけ読む（Q5）

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
