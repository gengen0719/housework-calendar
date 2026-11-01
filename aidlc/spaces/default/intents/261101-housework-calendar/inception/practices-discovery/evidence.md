# 調べたこと（Evidence）

> 今回は進め役（aidlc-pipeline-deploy-agent）だけで進めました。ほかの担当によるレビューはなく、寄稿ファイルもありません。

## 調べたもの

| 対象 | 結果 |
|------|------|
| `git status --short`（下書きの時点） | 追跡されていないものは `.gitignore`、`.kiro/`、`AGENTS.md`、`aidlc/` だけ。アプリのコードはまだない |
| `git rev-parse --short HEAD` | 下書きの時点ではコミットがなかった。最後のまとめの時点では `5ac14b0`。履歴が短いため、ブランチの使い方や配備の頻度は履歴から読み取れない |
| CI・配備の設定 | `.github/workflows/`、`buildspec.yml`、CDK や SAM の設定などは見当たらない。新しいプロジェクトなので想定どおり |
| `aidlc/spaces/default/memory/org.md` | 5 つの項目を読み、聞き取りの「おすすめの初期値」として使った |
| `aidlc/spaces/default/memory/team.md` | 5 つの項目すべてが例のコメントだけで、中身がない。やり直しではない |
| `.kiro/scopes/aidlc-mvp.md` | `skeleton: on`。最初に端から端まで通る小さい形を作る、という初期値の根拠 |
| `ideation/feasibility/constraint-register.md` | 作り手は 1 人（C-O1）、毎月の運用費用 0 円（C-F1）などの条件 |
| `ideation/scope-definition/scope-document.md` | 作る順番は使う流れの順。最初の形のあとに機能を足す順番の根拠 |
| `practices-discovery-questions.md` | 聞き取りの Q1〜Q9 と、まとめの確認（「Looks correct」） |

参考にした進め役の知識: `.kiro/knowledge/aidlc-pipeline-deploy-agent/branching-strategies.md`、`cicd-patterns.md`、`deployment-strategies.md`、`.kiro/knowledge/aidlc-shared/rules-reading.md`。
`aidlc/spaces/default/knowledge/` には、チームの資料はまだない。

## 聞き取りで決まったこと

| 質問 | 答え | 反映先 |
|------|------|--------|
| Q1 コードを置く場所 | B. GitHub の公開リポジトリ。GitHub Actions で CI を動かす。秘密の情報は置かない | Way of Working |
| Q2 変更の取り込み方 | A. 作業ごとの短いブランチ、プルリクエスト、CI が通ってから `main` に 1 つのコミットとして squash-merge | Way of Working |
| Q3 最初に細い通り道を作るか | A. はい。LINE ログイン、画面、裏側の処理、データ保存、公式アカウントの返事までの最小限の形を作り、確かめて承認してから、使う流れの順に機能を足す | Walking Skeleton |
| Q4 テストを書く順番 | C. BDD。先に利用者目線の Given/When/Then の筋書きを書き、それを満たすように作る | Testing Posture（`Methodology: bdd`） |
| Q5 テストでどこまで確かめるか | A. 行カバレッジ 80% 以上、取り込み前に CI でテストを実行 | Testing Posture |
| Q6 環境の数と公開のしかた | A. ステージングと本番の 2 つ。`main` に取り込んだらステージングに自動反映、本番は本人が確認してから手で反映 | Deployment |
| Q7 反映に使う道具 | A. AWS CDK（TypeScript） | Deployment |
| Q8 コードの書き方 | A. Prettier と ESLint。それ以外の特別な決まりは作らない | Code Style |
| Q9 必ず守ること・決してしないこと | B. 秘密の情報をリポジトリに入れない。本番のデータを手で書き換えない | `discovered-rules.md` の `## Forbidden` |

## まとめでの判断

- テストの進め方は、Q4 の答えがシナリオを先に書く一つの進め方だけなので、`custom` ではなく `bdd` とした。
- Q9 の 2 つは「しないこと」なので、`## Forbidden` に `NEVER` の形で書いた。人が述べた内容をそのまま書き、`## Mandated` は `None.` とした。
- Way of Working は、`main` を元と取り込み先にし、プルリクエストと squash-merge を使う形（trunk-based に近い GitHub Flow）として書いた。

## まだはっきりしないこと

- **LINE の公式アカウントとチャネル**: ステージングと本番で、公式アカウントとチャネルを環境ごとに別に用意する必要があると考えられる。公式アカウントごとに無料で送れるメッセージ数の枠があるため、要件の段階で確かめる。決まったことではない。
- **費用 0 円と 2 つの環境**: AWS の無料枠が 2 つの環境を合わせて足りるかは、まだ確かめていない。
- **テストの道具**: シナリオを動かす道具やテストの実行環境は決まっていない。
- **元に戻す方法と反映後の確認**: 本番で問題があったときに前の版に戻す手順と、反映後の動作確認の内容は決まっていない。
- **本番への反映の動かし方**: 本番への手での反映を、手元のパソコンから行うか、GitHub Actions の手動実行で行うかは決まっていない。
