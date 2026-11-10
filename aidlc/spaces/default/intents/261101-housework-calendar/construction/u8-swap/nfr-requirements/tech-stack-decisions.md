# 技術の選び方（Tech Stack Decisions）— U8 代わりにやる

U8（`u8-swap`）で使う技術です。U1〜U7 で決めたもの（TypeScript、Node.js 22 の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin（`@amiceli/vitest-cucumber`）、ESLint と Prettier、zod、`fetch` による LINE の API の呼び出し、`Intl.DateTimeFormat` による日本時間の計算、作り物の秘密の値の置き場所）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。U8 は LINE のグループ経路だけで、画面（React・MUI・LIFF）には何も足しません。

## U8 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR1.35 | 担当を選ぶ一覧（carousel）と、「引き受ける」「申し出をやめる」の 2 ボタンのメッセージは、U1 の `lineApiService`（`fetch`、時間切れつき）に、メッセージを作る関数を足して作る（素のオブジェクト。既存の `buildPostbackButtonMessage` と U6 の carousel の組み立てと同じ形）。LINE の SDK を入れない。メッセージを作る関数は、代替テキスト（`altText`）を必ず付け、文字数・個数の上限は 1 か所の定数にまとめる（NFR8.15）。申し出の知らせのメッセージの形（Flex かボタンのテンプレートか）は、LINE の上限を公式の資料で確かめたうえでコード生成が選ぶ。どちらでも、ボタンの値は BR9.16 の形、返事は reply の 1 回 | U1・U3・U6 と同じ作り。依存を増やさない（NFR1.15） | `@line/bot-sdk`（依存が増える） |
| NFR8.14 | 代わりにやるの機能も、先に受け入れ条件（AC7.1.1〜AC7.1.11、AC1.2.5）から Gherkin の筋書きを書き、それが通るまで作る（BDD。team.md の Testing Posture）。行カバレッジ 80% 以上を、U8 で足したコードを含めて保つ。筋書きの道具は Vitest の上の `@amiceli/vitest-cucumber`。LINE の API は `fetch` の差し替えで、DynamoDB は U5〜U7 までのテストと同じ差し替えで動かす。署名の確かめだけは、作り物の秘密の値で計算した本物の HMAC で通す。「済」「×」、確定、時計は前提データと時計の差し替えで用意する。**競合の筋書き**（同時の引き受け、引き受けと取り下げ、引き受けと担当の子供の変更。NFR2.55）は、条件つきの書き込みの動きを再現する差し替えを `Promise.all` で動かして確かめる。`infrastructure` のテストに、`line` と `api` の権限と環境変数が U8 の前後で変わらないこと（NFR4.82）、構成の数が変わらないこと（NFR1.33）を足す。3 秒の目標（NFR7.39〜NFR7.42、NFR7.46）は自動のテストに入れず、呼び出しの回数の上限（NFR7.44、NFR7.45）と、フックの並行数と件数（NFR3.15）だけを自動で確かめる。測定は、手順（NFR7.48）を README に書き、結果を Build and Test の成果物に表で残す | team.md の Testing Posture、stories.md の INVEST。時間の目標はネットワークと LINE の配送に左右され不安定（U6 の NFR8.12、U7 の NFR8.13 と同じ） | 時間の目標を Vitest に入れる（不安定になる） |
| NFR8.15 | **LINE の上限は仮定で、公式の資料での確認を、コード生成の最初の手順の 1 つにする**（機能設計の仮定の引き継ぎ）。確かめる項目: carousel のバブルの数の上限（仮定 12。U8 は 10 を使う）、1 回の reply で送れるメッセージの通数の上限（仮定 5。U8 は 3 以内）、ボタンのテンプレートの本文の上限（仮定 160 文字）、`altText` の上限（仮定 400 文字）、postback の `data` の上限（300 文字）、そして**ボタンの文字の上限は次の 3 行に分けて、それぞれ確かめる**。(i) **Flex のボタン**（BR9.6 の carousel の担当ボタン。Flex の `button` のアクションのラベル）: 機能設計の仮定は 26 文字。(ii) **テンプレートのボタン**（BR9.7 の「引き受ける」「申し出をやめる」の 2 ボタン。テンプレートのアクションのラベル）: 仮定 20 文字（記憶による。固定の短い文字なので、名前は入らず超えない）。(iii) **carousel の 1 バブル**（Flex のバブルの中の文字。担当の名前・日付を文字で書く部分）: 上限は文字数ではなく、バブルの数（仮定 12。U8 は 10 を使う）と、バブルの大きさ・メッセージ全体の大きさで決まるため、文字の長さは見やすさから短く保つ。**名前を切る長さの計算式「ラベルの上限 − 日付の部分 − 空白 1」が掛かるのは (i) の Flex のボタンの上限だけ**（ボタンの文字は「M/D」＋空白＋お手伝いの名前で、名前が入るのはここだけ）。(ii) と (iii) には掛けない。**注意: ボタンのアクションのラベルの上限は、記憶では 20 文字で、機能設計の 26 文字の仮定と食い違う可能性がある**（未確認）。食い違っても設計は崩れないよう、名前を切る長さを上の式で計算する（Flex のボタンの上限を定数にして、名前の切り方がそれに追従する）。上限の定数、確かめた日、資料の場所をコードのコメントと `docs/contract-changes-u8.md` に残す。違いがあれば BR9.6・BR9.7 の文字数と 10 件の定数を直す | 仮定のまま作ると、LINE が受け付けずに reply が失敗し、返事が出ない。値は 1 か所にまとめれば、確かめた結果で直すだけで済む | 仮定のまま実装して、ステージングで確かめる（失敗の原因が分かりにくい） |
| NFR8.16 | フックの並行数の制限（NFR3.15、NFR7.46）は、新しい依存を入れず、小さな自前の関数（イベントを最大 N 件ずつ並行して処理する）で作る。N は読みやすい名前の 1 つの定数（初期値 4、範囲 2〜5）。`notifyDutyReassigned` の型（イベント、関数）は変えず、1 つのイベントに登録された関数は登録の順に待つ。投げた関数は握りつぶさず警告のログ（`DUTY_HOOK_FAILED`）を残し、ほかのイベントは続ける。`notifyDutyRecorded`（1 件ずつ）は変えない。もう 1 つ、コード生成の最初の手順として、上流の文書（`stories.md` の AC7.1.1〜AC7.1.3、`requirements.md` の FR7.1、`mockups.md`、`contract-summary.md`）の「代わって」と送る、の書き方を「家事交代」に直す（機能設計の引き継ぎ。BDD の筋書きの前）。契約の変更は `docs/contract-changes-u8.md` に一覧で残す（`listSwappableDuties` の形、`offerSwap`・`acceptSwap`・`withdrawSwap` の引数と結果、`runGroupOperation` の第 2 引数、`OFFER_OWNER_ONLY`、`GROUP_COMMAND_REJECTED` から `groupId` を外す変更、`notifyDutyReassigned` の並行数） | 依存を増やさない（NFR1.15）。小さな関数なので自前で足りる | `p-limit` などの依存（増やさない）、`Promise.all` で全件を同時に（毎秒の書き込みが目安を超えうる） |
| NFR9.9 | LINE の返事（一覧の carousel のボタン、「引き受ける」「申し出をやめる」の 2 ボタン）は、状態を色だけで伝えない（担当の名前・日付・申し出の内容を文字で書く）。押すボタンは、押す場所の高さが 44 ピクセル以上になる指定にし、ボタンの文字は LINE の標準の配色を使って、文字と背景の色の差が 4.5:1 以上になるようにする（色を独自に指定する場合は、色の差を計算する単体テストを足す）。代替テキスト（`altText`）に、通知や読み上げでも内容が分かる文を入れる（「代わってほしい担当を選んでください」「{名前}が {M}月{D}日 の{お手伝い}を代わってくれる人を探しています」など）。LINE の Flex Message のボタンの高さの値の対応は、コード生成で公式の資料から確かめる。**これはコード生成の最初の手順（NFR8.15 の公式資料の確認）の項目に含める**: (1) ボタンの高さの指定（`height` の `sm`・`md` など）が 44 ピクセル以上になるか、(2) LINE の標準の配色（ボタンの文字と背景）の色の差が 4.5:1 以上か、を資料と実際の色の値から確かめ、結果を `docs/contract-changes-u8.md` に残す。**満たせない場合の代わりの扱い**: 高さの値を大きいものに変える（または余白で押す場所を広げる）、色を独自に指定して色の差を計算する単体テストで 4.5:1 以上を確かめる。U8 は画面（アプリ）を足さないので、MUI の確認はない | NFR9、U6 の NFR9.6 と同じ考え | — |
| NFR10.9 | U8 は新しい環境ごとの設定（公式アカウント・チャネル・SSM パラメータ・リッチメニュー）を足さない。ステージングと本番の違いは、U1〜U6 で決めた `line` の環境変数（テーブル名・SSM の接頭辞・`ENV`）で吸収される。ステージングの確認（NFR7.48）は、ステージング用の公式アカウントと作り手だけのグループ（NFR10）で、子供の役割のテスト用の利用者を 2 人以上使う。ステージングの公式アカウントを本番のお知らせ先のグループに入れない。本番の確認は、ステージングで確認したあと、作り手が反映してから、本番の作り手だけの範囲で動作を見る | team.md の Deployment、NFR10 | — |
| NFR10.10 | 反映と元に戻し方（U8 の分）。U8 の反映は、通常の流れ（`main` への取り込みでステージングに自動、本番は作り手が確認してから手で）に従う。元に戻すときは、前の版のコードを通常の流れで再び反映する。**データの移行も削除も要らない**: U8 が足す `SWAP#` の項目は、前の版のコードから読まれず（月の Query は `M#` の前置きで引く）、無害で残る。前の版に戻すと、「家事交代」と `swap.*` のボタンは反応しなくなり、すでに引き受けた担当の `childUserId` と `origin` は、画面からの担当の変更と同じ状態として残る。フックの並行数の変更（`notifyDutyReassigned`）を戻しても、保存の結果は変わらない。測定（NFR7.48）は、反映のたびにやり直す必要はなく、U8 の反映後の 1 回と、並行数やフックの形を変えたときにやり直す | team.md の Deployment（元に戻す手順は後の段階で決めるとされたものの、U8 の分）。データに破壊的な変更がない | — |

## U8 で変えないこと（引き継ぎの確認）

- 依存は足さない（NFR1.15 の引き継ぎ）。zod・`@aws-sdk/*`・Vitest・`@amiceli/vitest-cucumber` は既にある
- 日本時間の計算は U5 の `packages/shared` の関数を使う（NFR8.10、NFR11.8）
- 取引・読み直し・月の確定の確かめは、既存の `calendarRepository`（`buildMonthGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`・`findDuty`）の形に合わせ、U8 は申し出の項目の組み立て（`SWAP#<dutyId>` の `UpdateItem`、引き受けの 3 項目の取引）を足すだけにする
- 理由の印と文言は `packages/shared` の `reasons.ts`・`messages.ts`・`messages.test.ts` に足す（`OFFER_OWNER_ONLY` と LINE の文言。機能設計の引き継ぎ）
- 「家事交代」の読み方は完全一致（`trim` したあと）、`swap.*` の postback の読み方は生の文字列に対する正規表現（U3 の登録の読み方は変えない。NFR4.75、NFR4.76）

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR8、NFR9、NFR10）
- `inception/user-stories/stories.md`（AC7.1.1〜AC7.1.11、AC1.2.5）
- `construction/u8-swap/functional-design/rules.md`（BR9.1、BR9.6、BR9.7、BR9.11、BR9.14、BR9.16、BR9.19）、`functional-spec.md`（契約への追加、次の単位への引き継ぎ）、`entities.md`
- `construction/u3-notification-group/nfr-requirements/tech-stack-decisions.md`（NFR1.15、NFR10.4、NFR10.5）
- `construction/u5-assignment-calendar/nfr-requirements/tech-stack-decisions.md`（NFR8.9、NFR8.10）
- `construction/u6-recording/nfr-requirements/tech-stack-decisions.md`（NFR1.29、NFR8.11、NFR8.12、NFR9.6、NFR10.6、NFR10.7。LINE の返事の組み立ての形）
- `construction/u7-review-confirm/nfr-requirements/tech-stack-decisions.md`（NFR8.13、NFR9.8、NFR10.8）
- `aidlc/spaces/default/memory/team.md`（Testing Posture（BDD・80%・CI）、Deployment、Code Style）
- 既存コード（読むだけ）: `services/lineApiService.ts`（`buildPostbackButtonMessage`、`reply`、時間切れ）、`handlers/line/recordCommand.ts`（`MAX_RECORD_CHOICES = 12`、厳密な読み方）、`services/dutyReassignedHook.ts`（順に待つ呼び出し）、`package.json`（Vitest、`@amiceli/vitest-cucumber`、カバレッジ）

## Assumptions & Open Questions

- [assumption] LINE の各上限の数字（NFR8.15）は、**この段階では公式の資料で確かめられていません**。特にボタンのラベルの上限は、記憶では 20 文字で、機能設計の 26 文字の仮定と食い違う可能性があります。コード生成の最初の手順で確かめ、名前を切る長さを上限から計算する形にしておけば、結果が違っても数字の入れ替えで済みます
- [assumption] 申し出の知らせの形（Flex かボタンのテンプレートか）は、機能設計（BR9.7）が「ボタン 2 つのテンプレートを新しく作る」としています。上限の確認の結果、Flex のほうが扱いやすければ、コード生成で選んで構いません。どちらでも ボタンの値と返事の文は変わりません
- [assumption] 並行数の初期値 4（NFR8.16）は未測定の見積もりです。測定で変えます（NFR7.46 の段階）
- [assumption] 元に戻す手順の全体（環境ごとの反映後の動作確認を含む）は、要件の Open Questions のとおり運用の段階（U10 以降）で決めます。U8 の分（NFR10.10）は、データを壊す変更がないことから、通常の流れで前の版を反映する形で足りると見ています
