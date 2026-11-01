# 調べたこと（Evidence）— 下書き

> **下書き（聞き取り前）**: 進め方の下書きを作るときに調べたことと、聞き取りで決める必要があることをまとめます。
> 今回は進め役（aidlc-pipeline-deploy-agent）だけで進めており、ほかの担当によるレビューはありません。

## 調べたもの

| 対象 | 結果 |
|------|------|
| `git status --short` | 追跡されていないものは `.gitignore`、`.kiro/`、`AGENTS.md`、`aidlc/` だけ。アプリのコードはまだない |
| `git log` / `git rev-parse --short HEAD` | ブランチ `main` にコミットがまだ 1 つもない。そのため、ブランチの使い方や配備の頻度を履歴から読み取ることはできない |
| CI・配備の設定 | 作業場所の一覧（セッション開始時点）に、`.github/workflows/`、`buildspec.yml`、CDK や SAM の設定などは見当たらない。新しいプロジェクトなので想定どおり |
| `aidlc/spaces/default/memory/org.md` | `## Way of Working`、`## Walking Skeleton`、`## Testing Posture`、`## Deployment`、`## Code Style` の 5 つを読み、おすすめの初期値として使った |
| `aidlc/spaces/default/memory/team.md` | 5 つの項目すべてが、例を書いたコメントだけで中身がない。チームとして決めた内容はまだないので、やり直しではない |
| `.kiro/scopes/aidlc-mvp.md` | `skeleton: on`。最初に端から端まで通る小さい形を作る、という初期値の根拠 |
| `ideation/feasibility/constraint-register.md` | 作り手は 1 人（C-O1）、ほぼ常に使える状態（C-O2）、毎月の運用費用 0 円（C-F1）、使い始めは 2026 年 12 月の月初が目標（C-O3）。初期値が合うかどうかを聞き取りで確かめる理由 |
| `ideation/scope-definition/scope-document.md` | 作る順番は使う流れの順（Q8）。最初の小さい形の中身を決めるときに関係する |

参考にした進め役の知識: `.kiro/knowledge/aidlc-pipeline-deploy-agent/branching-strategies.md`、`cicd-patterns.md`、`deployment-strategies.md`、`.kiro/knowledge/aidlc-shared/rules-reading.md`。
`aidlc/spaces/default/knowledge/` には、チームの資料はまだ置かれていない。

## 下書きでの判断

- 5 つの項目は、`org.md` の初期値を、確定した事実ではなく「おすすめ」として書いた。
- `## Testing Posture` は、テストの進め方が決まっていないため `test-after` とし、範囲 `mvp` の下限（行カバレッジ 80% 以上、取り込み前の CI での実行）を追加の項目として書いた。
- 決まり（`discovered-rules.md`）は、人がはっきり述べた制約がまだないため、`## Mandated` と `## Forbidden` のどちらも `None.` とした。
- 記録の時刻は `aidlc engine now` から取り、コミットはまだないので `at commit none` とした。

## 聞き取りで決めること

1. **ブランチの使い方**: trunk-based のままでよいか。1 人で作るので、プルリクエストを作るか、`main` に直接取り込むか。リポジトリをどこに置くか。
2. **最初の小さい形**: 最初に端から端まで通る小さい形を作るか。作る場合、どこまでつなぐか（LINE のログイン、LIFF の画面、Lambda の API、データの保存、公式アカウントの返事）。
3. **テストの進め方**: test-after のままか、TDD などにするか。テストの道具。カバレッジ 80% の下限で無理がないか。
4. **配備**: 費用 0 円のままステージングと本番の 2 つの環境を持つか。配備の道具と、配備をどこから動かすか。元に戻す方法。
5. **コードの書き方**: Prettier と ESLint を使うか。ほかに決めておきたい書き方があるか。
6. **必ず守ること・決してしないこと**: 上の答えの中で、人がはっきり述べた制約があれば、`discovered-rules.md` に書く。

## まだはっきりしないこと

- CI を無料枠の中で動かせるかは、リポジトリを置く場所（公開か非公開か）によって変わる。聞き取りの答えを待つ。
- 履歴がないため、ブランチや配備のやり方は、すべて人の答えで決めることになる。
