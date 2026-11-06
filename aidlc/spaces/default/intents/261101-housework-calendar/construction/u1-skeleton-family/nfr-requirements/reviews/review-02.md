## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T03:14:57Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > 考えられる脅威と備え「画面の弱いところからトークンを読まれる」 | 画面の弱いところ（XSS）への備えが「メモリにだけ持つ」と「期限 1 時間」だけになっています。画面に悪いスクリプトが入れば、メモリのセッショントークンもそのまま読めて使えます。さらに LIFF の ID トークンも画面のスクリプトから取れるので、期限 1 時間を過ぎても新しいセッションを取り直せます。メモリだけにしても防げるのは「あとに残ること」だけで、読まれることは防げません。契約の Assumptions で XSS はこの段階で決めると書かれていますが、悪いスクリプトを入れさせない側の要件（Content-Security-Policy などの応答ヘッダー、画面で HTML をそのまま差し込まない決まり、外部のスクリプトを読み込まない決まり）がありません | 悪いスクリプトを入れさせない要件を NFR4.x として足してください（例: CloudFront の応答ヘッダーで CSP・X-Content-Type-Options・frame-ancestors を付ける。React で `dangerouslySetInnerHTML` を使わない、ESLint で検査する）。脅威の表の備えも、それに合わせて直してください | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > 認証・LINE から届いたことの確かめ（関数 URL の扱いがない） | 入口は Lambda の関数 URL を CloudFront の下にまとめる [Q4] と決めていますが、安全の要件に「関数 URL を CloudFront を通さずに直接呼ばれること」への要件がなく、`tech-stack-decisions.md` の Assumptions で次の段階に回しています。関数 URL を認証なしにすると、CloudFront を通らずに直接呼べます。一方で CloudFront の OAC で関数 URL を守る方法は、POST の要求では呼ぶ側が本文のハッシュ（`x-amz-content-sha256` ヘッダー）を付ける必要があり、LINE の Webhook はそれを付けないので `/line/webhook` では使えません。つまり「CloudFront からだけ呼べるようにする」は、そのままでは成り立たない見込みが高く、安全の決めごととして先に決めておく必要があります | 関数 URL ごとに、直接呼ばれることを受け入れるのか（その場合、アプリの中の認証と署名の確かめだけで守ると明記する）、CloudFront が付ける秘密のヘッダーを Lambda で確かめるのか、画面用 API だけ OAC にして画面がハッシュを付けるのか、を NFR4.x として決めてください。秘密のヘッダーを使うなら、その値を NFR5.1 の秘密の一覧に足してください | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > 秘密の情報（NFR5.1〜NFR5.4） | リポジトリは公開で、GitHub Actions が `main` からステージングへ反映します（`team.md`、`tech-stack-decisions.md`、NFR10.2）。ところが、GitHub Actions が AWS に反映するための権限の持ち方（長く使える鍵を置くのか、OIDC で一時的な権限を受け取るのか）と、公開リポジトリへの他人のプルリクエストからその権限や秘密が使われないようにする決まりがありません。脅威の表も「リポジトリに鍵を入れる」ことしか扱っていません | CI の権限の要件を NFR5.x として足してください（例: GitHub Actions から AWS へは OIDC で `main` のブランチと環境に限った役割を受け取り、長く使える鍵を置かない。他人のフォークからのプルリクエストでは反映の作業と秘密を使わない。役割の権限はステージングの反映に必要なものだけにする）。脅威の表にも足してください | Resolved (reviewer) |
| R-04 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > 考えられる脅威と備え（大量の要求がない） | 費用は毎月 0 円が必須（NFR1）で、入口は誰でも届く CloudFront と関数 URL です。大量の要求を送られると、Lambda・CloudFront・DynamoDB（オンデマンド）の無料枠を超えて費用がかかりますが、脅威の表にこれがなく、`scalability-requirements.md` の NFR3.2 は「U1 で量に合わせた設定はしない」としています。気づく手段も NFR1.5 の「毎月の請求を作り手が見る」だけで、起きてから最大 1 か月気づけません | 大量の要求への備えを決めてください（例: Lambda の同時に動く数の上限を小さく決める、費用のかからない範囲で AWS Budgets の知らせを付ける、受け入れるならその判断と理由を書く）。脅威の表に足し、NFR3.2 と食い違わないようにしてください | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > NFR4.4 | 「ブロック中の人には、セッションを出さず」と書いていますが、BR1.11 では、ブロック中の記録の人も LINE に問い合わせて、友だちなら友だちに戻してセッションを出します。このまま読むと、ブロックを解いた人（友だち登録のイベントを落とした人）を断る要件に見えます | 「LINE に問い合わせても友だちでない人（BR1.11 で確かめたあと）」のように書き直してください | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > NFR4.2 | 契約 C2 の Open Questions は「署名の方式」も U1 で決めるとしていますが、期限と鍵の置き場所だけが決まり、署名の方式（例: HMAC-SHA256 の JWT）と、使ってよい方式を決め打ちにすること（`alg` を受け取った値で選ばない）が書かれていません | 署名の方式と、決めた方式以外は断ることを NFR4.2 に足してください（鍵を替えるときの扱いも一言あるとよいです） | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > NFR4.7 | 署名の確かめを、受け取った本文そのもの（JSON に読み直す前のバイト列。関数 URL では Base64 で届くことがあるので戻してから）で行うことと、比べるときに時間で差が出ない比べ方を使うことが書かれていません。読み直した本文で確かめると、正しい要求も断ってしまいます | NFR4.7 に「本文そのもので確かめる」「時間で差が出ない比べ方を使う」を足し、確かめ方に Base64 で届いた要求のテストを足してください | Unresolved |
| R-08 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > NFR4.9、NFR4.10 | `Idempotency-Key` は利用者が送る値で、裏側の記録の鍵になりますが、形と長さの確かめがありません | `Idempotency-Key` の形（例: UUID）と長さの上限を決め、合わなければ断ることを足してください | Resolved (reviewer) |
| R-09 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > Assumptions & Open Questions（契約 C3 の変更） | 契約 C3 の「確かめたあとは処理の結果にかかわらず 200」を 500 に変えると書いていますが、`contract-summary.md` の C3 は 200 のままで、契約をいつ誰が直すかが書かれていません。あとの単位（U3、U6、U8）が古い契約を読むと、返し方が食い違います | 契約 C3 の `response` を直すこと（U1 が持ち主）を、この段階の後に行う作業として明記してください | Resolved (reviewer) |
| R-10 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/security-requirements.md > NFR4.13 と NFR5.1 | NFR4.13 は秘密のヘッダーの値を「パラメータストアに置く」としていますが、NFR5.1 の秘密の一覧に入っていません。また CloudFront の裏側に付けるヘッダーは配信の設定に値をそのまま書く形で、CloudFormation の `ssm-secure` の参照は CloudFront の設定には使えないため、値が CDK の出力（テンプレート）に平文で入るおそれがあります。値の替え方（漏れたときの入れ替え）もありません | NFR5.1 に CloudFront の秘密のヘッダーを足し、値を CDK の出力やリポジトリに平文で残さない入れ方（反映のときに読む、など）と、入れ替えの手順を NFR の設計で決めることを要件に書く | New |
| R-11 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-requirements/scalability-requirements.md > NFR1.6 | 予約された同時実行数は、アカウントに予約していない同時実行数を 10 以上残す決まりがあります。作ったばかりの AWS アカウントは同時実行数の枠が 10 のことがあり、そのときは例の値（画面用 5、LINE 用 5）でも予約できず反映に失敗します。NFR10.1 はステージングと本番を同じアカウントの別スタックとも読め、その場合は 4 つの関数分の予約が要ります。また上限を超えた要求が断られると、家族の利用も止まること（費用と使えることの引き換え）が書かれていません | アカウントの同時実行数の枠を確かめることと、環境が同じアカウントか別のアカウントかを NFR の設計で値を決める前提として書き、上限に達したときは家族の利用も断られることを受け入れた引き換えとして明記する | New |

> R-01 Reviewer note: NFR4.11（CSP、インラインのスクリプトを許さない、nosniff などの応答ヘッダー）と NFR4.12（`dangerouslySetInnerHTML` を ESLint で禁止）が足され、脅威の表も「入れさせない」と「害を小さく」に分けて直されています

> R-02 Reviewer note: NFR4.13 で、CloudFront が付ける秘密のヘッダーを Lambda が確かめ、ない・違う要求を 403 で断る形に決まり、OAC を使わない理由（Webhook の POST）も書かれています。秘密の一覧（NFR5.1）に入っていない点は新しい指摘に分けました

> R-03 Reviewer note: NFR5.5（OIDC、長い鍵を置かない、`main` の push と保護した環境 `production` に限る）と NFR5.6（フォークのプルリクエストに権限も秘密も渡さない）が足され、脅威の表にもあります

> R-04 Reviewer note: `scalability-requirements.md` に NFR1.6（予約された同時実行数の上限）と NFR1.7（Budgets で 1 ドルを超えたら知らせる）が足され、NFR3.2 も NFR1.6 を指す形に直って食い違いがなくなりました。上限の値の決め方は新しい指摘に分けました

> R-05 Reviewer note: NFR4.4 が「記録がない人とブロック中の人は LINE に問い合わせ（BR1.11）、それでも友だちでなければ出さない」となり、`rules.md` の BR1.5・BR1.11 と合っています

> R-06 Reviewer note: NFR4.2 に `HS256` の決め打ちと、`none` を含むほかの `alg` を断ることが足され、確かめ方にも `alg` を変えたトークンがあります

> R-07 Reviewer note: 要件の文（本文のバイト列そのもの、Base64 なら戻す、時間で差が出ない比べ方）は直りました。ただ、確かめ方の列に Base64 で届いた本文での確かめが入っておらず、前回の対応で求めたテストがまだありません

> R-08 Reviewer note: NFR4.10 に UUID（36 文字）の形だけを受け付け、ほかは 400 `IDEMPOTENCY_KEY_REQUIRED` で断ることが足され、確かめ方にもあります

> R-09 Reviewer note: Assumptions & Open Questions に、契約 C3 を U1 のコード生成の計画で直すこと、LINE の管理画面で再送を両方の環境で有効にすることが書かれています（`contract-summary.md` の C3 は今も「処理の結果にかかわらず 200」のままで、持ち主は U1）

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| （なし） | ステージの定義に確かめの道具は挙がっていません | 手で確かめました。`traceability.json` の対象 ID（NFR2.5〜NFR2.8、NFR4.11〜NFR4.13、NFR5.5、NFR5.6、NFR1.6、NFR1.7 など）は、各ファイルに実在することを確かめました |

### Summary

前回の重い指摘 4 件（XSS を入れさせない、関数 URL の直接呼び出し、CI の権限、大量の要求での費用）はすべて要件として足され、脅威の表とも合っています。残るのは、Webhook の Base64 のテスト、秘密のヘッダーの扱い、同時実行数の枠という軽い指摘だけで、NFR の設計に進めます。
