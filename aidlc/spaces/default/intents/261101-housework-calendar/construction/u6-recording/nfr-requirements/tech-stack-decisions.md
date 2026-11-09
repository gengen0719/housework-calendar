# 技術の選び方（Tech Stack Decisions）— U6 記録

U6（`u6-recording`）で使う技術です。U1〜U5 で決めたもの（TypeScript、React と MUI と LIFF、Node.js 22 の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin（`@amiceli/vitest-cucumber`）、ESLint と Prettier、`fetch` による LINE の API の呼び出し、`Intl.DateTimeFormat` による日本時間の計算、作り物の秘密の値の置き場所）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。

## U6 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR1.29 | 選択肢の Flex Message（carousel）と、本人にだけ返す文は、U1 の `lineApiService`（`fetch`、時間切れつき）に、メッセージを作る関数を足して作る（既存の `buildPostbackButtonMessage` と同じ形の素のオブジェクト）。リッチメニューの設定は、作り手が実行する小さなスクリプトで、同じく `fetch` を使い、LINE の SDK を入れない。メッセージを作る関数は、代替テキスト（`altText`）を必ず付ける | U1・U3 と同じ作り。依存を増やさない（NFR1.15） | `@line/bot-sdk`（依存が増える） |
| NFR8.11 | 記録の機能も、先に受け入れ条件（AC5.1.1〜AC5.1.15）から Gherkin の筋書きを書き、それが通るまで作る（BDD）。行カバレッジ 80% 以上を、U6 で足したコードを含めて保つ。筋書きの道具は Vitest の上の `@amiceli/vitest-cucumber`。LINE の API は `fetch` の差し替えで、DynamoDB は U5 までのテストと同じ差し替えで動かす。署名の確かめだけは、作り物の秘密の値で計算した本物の HMAC で通す。「済」「×」、確定、時計は前提データと時計の差し替えで用意する。`infrastructure` のテストに、`line` の権限の確かめ（NFR4.63、NFR4.64）と、U6 の前後で構成が変わらないこと（NFR1.25）を足す。同時の 2 回押し（NFR2.35）は、条件つきの書き込みの動きを再現する差し替えで確かめる | `team.md` の Testing Posture、`stories.md` の INVEST | — |
| NFR8.12 | 3 秒の目標（AC5.1.15。NFR7.25〜NFR7.29）の測定は、手順（NFR7.30）を README に書き、結果を Build and Test の成果物に表で残す: 日時、環境、端末、20 回それぞれの時間と冷たい起動かどうか、サーバー側の `durationMs`、送信数の前後の比較（NFR1.27）、合格かどうか。自動のテストに時間の目標を入れない（ネットワークと LINE の配送に左右され、不安定になるため）。自動のテストで確かめるのは、呼び出しの回数の上限（NFR7.28）と、サーバー側の処理の大きさの目安だけ | 3 秒は LINE の配送を含む人の測定でしか確かめられない。呼び出しの回数は自動で確かめられる | 時間の目標を Vitest に入れる（不安定になる） |
| NFR9.6 | LINE の返事（選択肢の carousel、選べない文字の並び）は、状態を色だけで伝えない（「済 16:42」「×」の文字を付ける）。押すボタンは、押す場所の高さが 44 ピクセル以上になる指定にし、ボタンの文字は LINE の標準の配色を使って、文字と背景の色の差が 4.5:1 以上になるようにする（色を独自に指定する場合は、色の差を計算する単体テストを足す）。代替テキスト（`altText`）に、通知や読み上げでも内容が分かる文を入れる（「どのお手伝いを記録しますか」など）。LINE の Flex Message のボタンの高さの値の対応は、コード生成で公式の資料から確かめる | NFR9、AC4.1.7 と同じ考え | — |
| NFR9.7 | 画面の「やった」ボタン、確認、理由の文字も、MUI のテーマ（U1）で、文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上にする。確認（「記録する」「やめる」）は、開いたとき確認の中にフォーカスが移り、Esc と「やめる」で閉じ、閉じたあと元のボタンにフォーカスが戻るようにする。送信中はボタンを押せなくし、そのことを支援技術にも伝える（`aria-busy` または無効の状態）。記録できない担当は、ボタンの代わりに理由の文字を出し、状態を色だけで伝えない（BR7.10）。確かめ方: (1) テーマの色の組み合わせのコントラスト比の単体テスト（U5 の NFR9.5 を U6 の画面に広げる）、(2) ボタンの最小の大きさの単体テスト、(3) 理由の文字・「済」の文字・確認の動きの画面の筋書き | NFR9、`team.md` の Testing Posture | — |
| NFR10.6 | リッチメニューは、ステージングと本番の公式アカウント（U1 の NFR10.1 の別のチャネル）に、それぞれ別に設定する。設定のスクリプトは、環境を必ず指定して実行し（指定がなければ何もしない）、既定で本番を選ばない。トークンは環境ごとの SSM から読む（NFR5.10）。メニューは「やった」のボタン 1 つで、全員に同じものを出す（BR7.15）。ステージングで動作を確かめてから、本番に設定する | NFR10。ステージングの操作が本番のメニューに影響しないこと | 1 つのメニューを両方の公式アカウントに共有する（できない） |
| NFR10.7 | README に、リッチメニューの設定・確認・取り消しの手順を書く: (1) 設定のスクリプトの実行（環境の指定、`<作り物の値>` を使った例）、(2) 設定できたかの確認（1 対 1 のトークでメニューが出ること、「やった」で選択肢が出ること）、(3) 取り消し（設定したメニューの削除と、前のメニューへの戻し方）、(4) 「LINE の管理画面で Webhook の再送が有効なこと」（NFR2.37）の確認、(5) 1 対 1 のトークの postback を受け取るために必要な設定の確認 | `team.md` の Deployment（元に戻す手順は後の段階で決めるとされたものの、U6 の分） | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR8、NFR9、NFR10）
- `inception/user-stories/stories.md`（AC5.1.1〜AC5.1.15）
- `construction/u6-recording/functional-design/rules.md`（BR7.2、BR7.10、BR7.15）、`functional-spec.md`（配備）
- `construction/u3-notification-group/nfr-requirements/tech-stack-decisions.md`（NFR1.15、NFR10.4、NFR10.5）
- `construction/u5-assignment-calendar/nfr-requirements/tech-stack-decisions.md`（NFR8.9、NFR8.10、NFR9.5）
- `aidlc/spaces/default/memory/team.md`（Testing Posture、Deployment、Code Style）
- 既存コード（読むだけ）: `services/lineApiService.ts`（`buildPostbackButtonMessage`、`reply`）、`package.json`（Vitest、`@amiceli/vitest-cucumber`、カバレッジ）、`scripts/`（既存のスクリプトの置き場）

## Assumptions & Open Questions

- [assumption] Flex Message のボタンの高さと、リッチメニューの設定の項目（画像の大きさなど）は、LINE の公式の資料で、コード生成のときに確かめます。違えば NFR9.6 と NFR10.7 の手順を直します
- リッチメニューの画像（デザイン）は、秘密の情報を含まない素材として、コード生成の段階で作ります
- Provisioned Concurrency など、費用のかかる仕組みは、速さの目標が足りなくても使いません（NFR7.30 の 7.）
