# 反映の流れ（CI/CD Pipeline）— U4 お手伝いの種類

U4（`u4-chore-types`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。変えるのは、反映したあとの確かめ（`scripts/smoke-check.sh`）と README だけです。

## ワークフロー

| ワークフロー | U4 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U4 のコードも Prettier、ESLint、型の検査、Vitest（行カバレッジ 80% 以上）、gitleaks、`cdk synth` を通す（NFR8.7） |
| `deploy-staging.yml` | 変更なし |
| `deploy-production.yml` | 変更なし |

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

U2 の [Q1] の答え（セッションなしで 401 になる確かめを足し、ログインしての確かめは手で行う）と同じ形で、U3 の確かめのあとに次の 5 つを足し、先頭コメントの確かめの数も直します。PUT・PATCH・DELETE は U4 で初めて使うメソッドなので、CloudFront を通って Lambda まで届く（403・405 ではなく 401 になる）ことも、この確かめで分かります。

| 番号 | 確かめ | curl の引数 | 期待 |
|------|--------|------------|------|
| 3d | `GET /v1/chore-types`（セッションなし） | なし | 401 |
| 3e | `POST /v1/chore-types`（セッションなし） | `-X POST -H 'Content-Type: application/json' --data '{}'` | 401 |
| 3f | `PUT /v1/chore-types/00000000-0000-4000-8000-000000000000`（セッションなし） | `-X PUT -H 'Content-Type: application/json' --data '{}'` | 401 |
| 3g | `PATCH /v1/chore-types/00000000-0000-4000-8000-000000000000`（セッションなし） | `-X PATCH -H 'Content-Type: application/json' --data '{}'` | 401 |
| 3h | `DELETE /v1/chore-types/00000000-0000-4000-8000-000000000000`（セッションなし） | `-X DELETE` | 401 |

- 確かめは全部で 15 件になります（U1 が 4 件、U2 が 5 件、U3 が 1 件、U4 が 5 件）。スクリプトの先頭コメントを「全 15 件」に直し、いまの `3b` の番号の重なりも直します（U4 は `3d`〜`3h`）（レビュー R-03）
- 画面用 API の入口は、振り分け（パスの型）→ 秘密のヘッダー → 認証（401）→ 本文の確かめの順に動きます（U2 の `entries/api.ts`）。そのため、本文が空でも認証の前に 400・415 にはならず、401 になります（レビュー R-01）
- 401 は、CloudFront を通って api に届き、パスの型に合ったことを示します（型に合わなければ 404）。ただし操作が正しく登録されているか（POST が create に届くか、など）は、Vitest の振り分けの筋書きで確かめます（レビュー R-02）

## 反映の順番

1. U4 のプルリクエストを `main` に取り込む → ステージングに自動で反映（Data スタックで `ChoreTypes` ができ、App スタックで権限と環境変数が足される。テーブルを足す向きは、CDK が Data → App の順に自動で並べるので 1 回で反映できる。取り外すときだけ 2 回に分ける。レビュー R-07）
2. `smoke-check.sh` が通ることを確かめる
3. 作り手がステージングで手で確かめる: 管理者で「家族の設定」→「お手伝いの種類」を開く → 「皿洗い 100 円」を登録 → 同じ名前でもう一度登録して断られ、「皿洗い（追加分）」の案内が出る → 単価に -1 を入れて断られ、入力が残る → 単価を 120 円に変える → 「使わない」にする → 「使う」に戻す → 消す → 子供のアカウントで一覧が見え、ボタンが出ない
4. `deploy-production.yml` を手で動かす

## 前の版に戻す

- アプリのコードだけを戻すときは、U1 のとおり `git revert` して `main` に取り込む
- テーブルまで戻すときは、U3 の README のとおり 2 回に分ける（先に App が `ChoreTypes` を使わない形を反映し、そのあとで Data から外す）
- `ChoreTypes` は本番では `RETAIN` なので、戻してもスタックから外れるだけで消えない。もう一度反映すると新しい空のテーブルができ、登録した種類は引き継がれない。U5 以降の割り当てや記録ができたあとに戻すと、記録が指す種類が新しいテーブルにない状態になる。また U5 のコードは `AppStackProps.choreTypes` と種類の窓口に頼るので、U4 のコミットを `git revert` すると U5 の組み立ても壊れる。そのため、U5 を反映したあとは `ChoreTypes` も U4 のアプリのコードも戻さず、不具合は前に進んで直す（修正のコミットを足す）。2 回に分ける戻し方も、U5 以降は使えない（README に同じ言葉で書く。レビュー R-04）
- ステージングは `DESTROY` なので、戻すと `ChoreTypes` は消える

## README に足すこと

- お手伝いの種類の画面の使い方（登録、変更、使わない・使う、消す。1 日に何回もあるお手伝いは「皿洗い（追加分）」のように分けて登録する）
- ステージングでの手の確かめの手順（上の「反映の順番」の 3）
- U5 を反映したあとは `ChoreTypes` のテーブルを戻さないこと

## 秘密の情報

U4 で新しい秘密の情報はありません。パラメータストアのパラメータも GitHub の Variables も足しません。

## Sources

- `construction/u3-notification-group/infrastructure-design/cicd-pipeline.md`（反映後の確かめ、テーブルを 2 回に分けて戻す）
- `construction/u2-invitation/infrastructure-design/cicd-pipeline.md`（反映後の確かめの [Q1] の答え）
- `construction/u4-chore-types/functional-design/functional-spec.md`
- `scripts/smoke-check.sh`、`.github/workflows/`

## Assumptions & Open Questions

- なし
