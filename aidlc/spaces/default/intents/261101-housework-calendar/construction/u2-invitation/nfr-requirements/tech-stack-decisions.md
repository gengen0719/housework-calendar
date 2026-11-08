# 技術の選び方（Tech Stack Decisions）— U2 招待

U2（`u2-invitation`）で使う技術です。U1 で決めたもの（`construction/u1-skeleton-family/nfr-requirements/tech-stack-decisions.md`）をそのまま使い、新しい言語・枠組み・サービスは足しません。

## U1 から引き継ぐもの

| 区分 | 選んだもの |
|------|-----------|
| 言語 | TypeScript |
| 画面 | React、MUI、LIFF の SDK |
| 裏側 | Node.js の AWS Lambda（関数 URL、CloudFront の後ろ） |
| データ | DynamoDB（オンデマンド） |
| 秘密の情報 | Systems Manager のパラメータストア（SecureString） |
| 構成 | AWS CDK（TypeScript） |
| テスト | Vitest と Gherkin の筋書き（BDD）、行カバレッジ 80% 以上 |
| 検査 | ESLint、Prettier、秘密の情報の検査（CI） |

## U2 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.4 | 招待の機能も、先に受け入れ条件（AC1.1.6〜AC1.1.9、AC1.1.13）から Gherkin の筋書きを書き、それが通るまで作る（BDD） | `team.md` の Testing Posture | — |
| NFR8.5 | 行カバレッジ 80% 以上を、U2 で足したコードを含めて保つ。取り込み前の CI で確かめる | `team.md` | — |
| NFR4.24 | 招待の印は Node.js の標準の `crypto.randomBytes(16)` をパディングなしの Base64URL にして作る（22 文字ちょうど、`[A-Za-z0-9_-]` のみ。安全の要件は `security-requirements.md` の NFR4.14）。新しいライブラリは足さない [Q1] | 標準の暗号用の乱数で足りる | `uuid` の v4（122 ビット、形が決まっていて長い） |
| NFR1.11 | 「LINE で送る」は LIFF の SDK の `liff.shareTargetPicker` を使う。`liff.isApiAvailable('shareTargetPicker')` が false のとき（パソコンのブラウザなど）は、LINE のシェアの URL（`https://line.me/R/share?text=...`）を開く [Q4] | アプリの中で送り先を選べる。公式アカウントのメッセージ数を使わない | LINE のシェアの URL だけを使う（設定はいらないが、アプリの外に出る） |
| NFR10.3 | shareTargetPicker は、LINE Developers の管理画面で LIFF アプリごとに有効にする。ステージングと本番の両方の LIFF アプリで有効にする手順を README に書く | 環境ごとに別のチャネル（NFR10.1） | — |
| NFR9.2 | 家族の設定の画面も MUI のテーマで、文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上にする。役割は色だけでなく「管理者」「子供」の文字で出す | NFR9 | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR4、NFR8、NFR9、NFR10）
- `construction/u1-skeleton-family/nfr-requirements/tech-stack-decisions.md`
- `aidlc/spaces/default/memory/team.md`（Testing Posture、Code Style）
- `nfr-requirements-questions.md` の回答 [Q1]、[Q4]
- [LINE Developers: LIFF API リファレンス（liff.shareTargetPicker）](https://developers.line.biz/ja/reference/liff/#share-target-picker)

## Assumptions & Open Questions

- [assumption] shareTargetPicker は LINE の中で開いた LIFF アプリで使え、管理画面で有効にする必要があります。B2 でステージングで確かめます
