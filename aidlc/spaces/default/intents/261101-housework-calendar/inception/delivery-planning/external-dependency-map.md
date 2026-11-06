# 外の準備と頼り先（External Dependency Map）

Bolt（作業単位をひととおり作り、動くものができるところまで進める 1 回分の作業）を作るために、外で用意するものと、それを使う Bolt です。一覧は `bolt-plan.md` にあります。どれも作り手が自分で用意します。ほかのチームや会社の承認を待つものはありません。

## 用意するもの

| 用意するもの | 持ち主 | いつまでに | 使う Bolt | 遅れたとき |
|-------------|-------|----------|----------|-----------|
| ステージング用の LINE 公式アカウントと Messaging API のチャネル | 作り手（LINE Developers） | B1 を作り始める前 [Q2] | B1、B3、B6、B8、B10 | B1 が作れない。先に作る |
| ステージング用の LINE ログインのチャネルと LIFF アプリ | 作り手（LINE Developers） | B1 を作り始める前 [Q2] | B1 以降すべて | B1 が作れない。先に作る |
| AWS のアカウントの設定（CDK を使えるようにする、秘密の情報の保管場所） | 作り手 | B1 を作り始める前 [Q2] | B1 以降すべて | B1 が作れない |
| GitHub の公開リポジトリと GitHub Actions の設定（AWS への反映の権限を含む。鍵はリポジトリに置かない） | 作り手 | B1 を作り始める前 [Q2] | B1 以降すべて | 取り込み前の自動テストとステージングへの自動反映ができない |
| 作り手だけのグループ LINE（ステージングの確かめ用） | 作り手 | B3 の前 | B3、B8、B10 | B3 のグループの確かめができない |
| 子供役の LINE アカウント（ステージングの確かめ用） | 作り手 | B2 の前 | B2、B6、B8 | 子供の操作を確かめられない |
| 本番用の LINE 公式アカウントとチャネル（Messaging API、LINE ログイン、LIFF） | 作り手 | 本番に初めて配備する前 [Q2] | 本番 | 使い始められない。2027 年 1 月の月初に延ばす |
| 作り手への知らせの受け取り先（メールなど） | 作り手 | B10 の前 | B10 | エラーの知らせを確かめられない |

## 外のサービスの決まり

| サービス | 決まり | 関わる Bolt |
|---------|-------|-----------|
| LINE 公式アカウントの無料プラン | 返事ではないお知らせは月 200 通まで（NFR1） | B10 |
| AWS の無料枠 | 運用費用 0 円（NFR1） | B1、B10 |
| LINE の Webhook と API の形 | LINE が決める（契約 C3、C4） | B1、B3、B6、B8、B10 |

## Sources

- `bolt-plan.md`
- `inception/contract-design/contract-summary.md`（C3、C4）
- `inception/requirements-analysis/requirements.md`（NFR1、NFR5、NFR10、制約）
- `aidlc/spaces/default/memory/team.md`（GitHub、GitHub Actions、AWS CDK）
- `delivery-planning-questions.md` の回答 [Q2]

## Assumptions & Open Questions

- 作り手への知らせを何で受け取るか（メールなど）は、要件の Open Questions のとおり、あとの段階で決めます
