# 技術の選び方（Tech Stack Decisions）— U3 お知らせ先

U3（`u3-notification-group`）で使う技術です。U1・U2 で決めたもの（TypeScript、React と MUI と LIFF、Node.js の Lambda、DynamoDB、パラメータストア、AWS CDK、Vitest と Gherkin、ESLint と Prettier）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。

## U3 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.6 | お知らせ先の機能も、先に受け入れ条件（AC1.2.1〜AC1.2.5）から Gherkin の筋書きを書き、それが通るまで作る（BDD）。行カバレッジ 80% 以上を、U3 で足したコードを含めて保つ | `team.md` の Testing Posture | — |
| NFR1.15 | LINE の API は U1 の `lineApiService`（`fetch`、時間切れつき）に、グループの概要の取得（`GET https://api.line.me/v2/bot/group/{groupId}/summary`）を足して使う。新しい SDK は入れない | U1 と同じ作り。依存を増やさない | `@line/bot-sdk`（依存が増える） |
| NFR10.4 | LINE Developers の管理画面で、ステージングと本番の両方の Messaging API のチャネルについて、公式アカウントがグループに参加できる設定（「グループトーク・複数人トークへの参加を許可する」）を有効にする。手順を README に書く | 環境ごとに別のチャネル（U1 の NFR10.1） | — |
| NFR10.5 | README の「困ったとき」に、(1) 同じグループにいる別の家族の管理者が先に登録したときの取り戻し方（先の家族が別のグループを登録する、または公式アカウントをグループから外して招待し直す）、(2) ブロック中の管理者が登録しようとして「管理者だけです」と返ったときは、ブロックを解除してからもう一度、を書く | セキュリティのレビュー R-01、機能設計の rules.md の Assumptions | — |
| NFR9.3 | お知らせ先がないときの表示と、家族の設定のお知らせ先は、MUI のテーマ（U1）で、色だけでなく文字で状態を伝える（「登録されていません」） | NFR9 | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR8、NFR9、NFR10）
- `construction/u1-skeleton-family/nfr-requirements/tech-stack-decisions.md`、`construction/u2-invitation/nfr-requirements/tech-stack-decisions.md`
- `aidlc/spaces/default/memory/team.md`（Testing Posture）
- [LINE Developers: Messaging API リファレンス（グループの概要を取得する）](https://developers.line.biz/ja/reference/messaging-api/#get-group-summary)

## Assumptions & Open Questions

- [assumption] グループの概要の取得は、公式アカウントがそのグループにいるときだけ成功します。登録の操作はグループの中で行うので、問題になりません
