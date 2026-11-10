# 技術の選び方（Tech Stack Decisions）— U7 確認・修正と確定

U7（`u7-review-confirm`）で使う技術です。U1〜U6 で決めたもの（TypeScript、React と MUI と LIFF、Node.js 22 の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin（`@amiceli/vitest-cucumber`）、ESLint と Prettier、zod による本文の検証、`Intl.DateTimeFormat` による日本時間の計算、作り物の秘密の値の置き場所）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。U7 は画面用 API だけで、LINE の SDK も追加の道具も要りません。

## U7 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.13 | 確認・修正と確定の機能も、先に受け入れ条件（AC6.1.1〜AC6.1.11）から Gherkin の筋書きを書き、それが通るまで作る（BDD。team.md の Testing Posture）。行カバレッジ 80% 以上を、U7 で足したコードを含めて保つ。DynamoDB は U5・U6 までのテストと同じ差し替えで動かし、取引の競合（NFR2.45）・確定↔取り消しの連打（NFR2.46）・単価の変更（markDone）は、条件つきの書き込みの動きを再現する差し替えで確かめる。時計は差し替えで日本時間の境（NFR11.7）を用意する。`infrastructure` のテストに、`api` の権限と環境変数が U7 の前後で変わらないこと（NFR4.71）、`line` が U7 の前後で変わらないこと（NFR4.72）、構成の数が変わらないこと（NFR1.31）を足す。3 秒の目標（NFR7.33、NFR7.34）は自動のテストに入れず、呼び出しの回数の上限（NFR7.35）だけを自動で確かめる | team.md の Testing Posture、stories.md の INVEST。時間の目標はネットワークに左右され不安定（U6 の NFR8.12 と同じ） | 時間の目標を Vitest に入れる（不安定になる） |
| NFR9.8 | 画面の状態を変えるボタン（取り消す・済にする・やらなかった・外す）、確定・取り消しのボタン、確認（StatusChangePreview・MonthConfirmPreview の表示）、理由の文字も、MUI のテーマ（U1）で、文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上にする（U5 の NFR9.5・U6 の NFR9.7 を U7 の画面に広げる）。確認（「はい」「やめる」）は、開いたとき確認の中にフォーカスが移り、Esc と「やめる」で閉じ、閉じたあと元のボタンにフォーカスが戻るようにする。送信中はボタンを押せなくし、そのことを支援技術にも伝える（`aria-busy` または無効の状態）。状態（済・未・×）と確認の 1 行は、色だけでなく文字で伝える（「済 → 未 に戻します」の文、「確定済み」の文字。NFR9、FR4.1）。種類の名前・子供の表示名は HTML として差し込まない（文字として出す。U1 の NFR4.12・U6 の NFR4.62） | NFR9、team.md の Testing Posture、AC6.1.9 | — |
| NFR10.8 | U7 は新しい環境ごとの設定（公式アカウント・チャネル・SSM パラメータ・リッチメニュー）を足さない。U7 は画面用 API だけで、ステージングと本番の違いは U1〜U6 で決めた `api` の環境変数（テーブル名・SSM の接頭辞・`ENV`）で吸収される。`main` に取り込むとステージングに自動で反映し、本番は作り手が確認してから反映する（team.md の Deployment）。U7 の確認は、ステージングで FR6.1 の 5 とおりと確定・取り消しを画面から行い、`MONTH_CONFIRMED` が各単位で効くことを確かめてから本番に反映する | team.md の Deployment、NFR10。U7 は環境差のある新しい外部の設定を持たない | — |

## U7 で変えないこと（引き継ぎの確認）

- 依存は足さない（NFR1.15 の引き継ぎ）。zod・MUI・`@aws-sdk/*`・Vitest・`@amiceli/vitest-cucumber` は既にある
- 日本時間の計算は U5 の `packages/shared` の関数を使う（NFR8.10、NFR11.7）
- 取引・読み直し・単価の確かめは、既存の `calendarRepository`（`buildMonthGuard`・`buildUnitPriceGuard`・`CHECK_DUTY_UNCHANGED`・`classifyCancellation`・`writeTransaction`）の形に合わせ、U7 は状態の変更用の取引の項目（担当の `UpdateItem` で status と記録の 3 項目を書く/消す）と、月の確定・取り消しの項目を足すだけにする
- 元に戻す手順（確定の取り消し・状態の戻し）は、要件の「元に戻す手順は後の段階で決める」のうち U7 の分で、画面の操作（BR8.12、FR6.1 の表）として用意する

## Sources

- `inception/requirements-analysis/requirements.md`（NFR8、NFR9、NFR10）
- `inception/user-stories/stories.md`（AC6.1.1〜AC6.1.11）
- `construction/u7-review-confirm/functional-design/rules.md`（BR8.3、BR8.8、BR8.9、BR8.13）、`functional-spec.md`（F1〜F4、配備）、`entities.md`（StatusChangePreview・MonthConfirmPreview）
- `construction/u5-assignment-calendar/nfr-requirements/tech-stack-decisions.md`（NFR8.9、NFR8.10、NFR9.5）
- `construction/u6-recording/nfr-requirements/tech-stack-decisions.md`（NFR8.11、NFR8.12、NFR9.7、NFR10.6、NFR10.7。BDD・カバレッジ・アクセシビリティ・環境の形）
- `aidlc/spaces/default/memory/team.md`（Testing Posture（BDD・80%・CI）、Deployment、Code Style）
- 既存コード（読むだけ）: `services/calendarService.ts`（`changeDutyChild` の形）、`repositories/calendarRepository.ts`（取引の項目の組み立て、競合の読み分け）、`entries/api.ts`（ルート表・`requireAuth`）、`package.json`（Vitest・zod・MUI・カバレッジ）

## Assumptions & Open Questions

- [assumption] 確認の中身（StatusChangePreview・MonthConfirmPreview）は画面が出す値で保存しません（entities.md）。アクセシビリティ（NFR9.8）は、確認のダイアログのフォーカス・文字・色を U6 の NFR9.7 と同じ基準で確かめます
- [assumption] U7 は LINE を使わないので、Flex Message・リッチメニュー・LINE の SDK に関わる決定はありません（U6 の NFR1.29・NFR10.6・NFR10.7 は U7 では増えません）
- [assumption] 元に戻す手順の全体（環境ごとの反映後の動作確認を含む）は、要件の Open Questions のとおり運用の段階（U10 以降）で決めます。U7 は、画面からの取り消し・状態の戻しという「データを直すアプリの操作」を用意する分を担います
