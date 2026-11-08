# 反映の流れ（CI/CD Pipeline）— U3 お知らせ先

U3（`u3-notification-group`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。変えるのは、反映したあとの確かめ（`scripts/smoke-check.sh`）と README だけです。

## ワークフロー

| ワークフロー | U3 での変更 |
|-------------|------------|
| `ci.yml` | 変更なし。U3 のコードも Prettier、ESLint、型の検査、Vitest（行カバレッジ 80% 以上）、gitleaks、`cdk synth` を通す（NFR8.6） |
| `deploy-staging.yml` | 変更なし |
| `deploy-production.yml` | 変更なし |

## 反映したあとの確かめ（`scripts/smoke-check.sh`）

U2 の [Q1] の答え（セッションなしで 401 になる確かめを足し、ログインしての確かめは手で行う）と同じ形で、次の 1 つを U2 の確かめ（3b）のあとに足し、スクリプトの先頭コメントの確かめの数も直します（レビュー R-04）。

| 確かめ | 期待 |
|--------|------|
| `GET /v1/family/notification-group`（セッションなし） | 401 |

LINE の join・登録・leave は、署名のある Webhook が必要なので、スクリプトでは確かめません。U1 の「署名のない Webhook が 401」の確かめが、U3 のイベントも同じ受け口を通ることを示します。

## 反映の順番

1. 作り手が、ステージングの Messaging API のチャネルで「グループトーク・複数人トークへの参加を許可する」を有効にする
2. U3 のプルリクエストを `main` に取り込む → ステージングに自動で反映（Data スタックで `NotificationGroups` ができ、App スタックで権限と環境変数が足される）
3. `smoke-check.sh` が通ることを確かめる
4. 作り手がステージングで手で確かめる: 作り手だけのグループに公式アカウントを招待する → 案内とボタンが届く → ボタンで登録 → 返事が届く → 画面の「家族の設定」にグループの名前が出る → 子供のアカウントで「登録」と送ると断られる → 公式アカウントをグループから外す → 画面に「登録されていません」が出る
5. 本番のチャネルでも同じ設定を有効にしてから、`deploy-production.yml` を手で動かす

## 前の版に戻す

- アプリのコードだけを戻すときは、U1 のとおり `git revert` して `main` に取り込む
- **テーブルまで戻すときは 2 回に分ける（レビュー R-02）:** CDK では Data スタックのテーブルを App スタックに渡すと、Data が書き出し（export）、App が取り込む。1 回の `git revert` だと Data が先に反映され、App がまだ使っている書き出しを消そうとして CloudFormation に断られる。そのため、(1) まず App だけが `NotificationGroups` を使わない形のコミットを取り込んで反映し、(2) そのあとで Data から `NotificationGroups` を外すコミットを取り込む。U2 の `Invitations` を戻すときも同じ手順にする（README に書く）
- `NotificationGroups` は本番では `RETAIN` なので、戻してもスタックから外れるだけで消えない。テーブル名は CDK が作る名前なので、もう一度反映すると新しい空のテーブルができ、前のお知らせ先は引き継がれない。`Families.notificationGroupId` には古い値が残るが、登録し直しは前のグループの記録が実在するときだけ Delete を入れる作り（`nfr-design/reliability-design.md` の登録の 2）なので、管理者がグループで登録し直せば置き換わる（レビュー R-01）
- ステージングは `DESTROY` なので、戻すと `NotificationGroups` は消える。古い `notificationGroupId` が残っても、上と同じく登録し直しで置き換わる（レビュー R-07）

## README に足すこと

- 公式アカウントがグループに参加できるようにする手順（環境ごと）（NFR10.4）。設定は LINE Official Account Manager の「設定」→「応答設定」（または「アカウント設定」）にある「グループ・複数人チャットへの参加を許可する」で行う（レビュー R-03。画面の場所は B3 の反映の前に作り手が実際の画面で確かめ、README の手順をそれに合わせる）
- 設定を忘れると、グループに招待しても公式アカウントが参加せず、案内も届かない（join イベントが来ないので、ログにも何も出ない）。困ったときに「案内が届かないときは、まずこの設定を確かめる」と書く
- お知らせ先の登録の手順（公式アカウントを家族のグループに招待し、届いたボタンを押す。ボタンが見えなければ「登録」と送る）
- 困ったとき（NFR10.5）:
  - 「お知らせ先を登録できるのは管理者だけです」と返ってきた管理者は、公式アカウントのブロックを解除してからもう一度
  - 同じグループにいる別の家族の管理者が先に登録したときは、先の家族が別のグループを登録するか、公式アカウントをグループから外して招待し直す
- ステージングでのログインしての確かめの手順（上の「反映の順番」の 4）

## 秘密の情報

U3 で新しい秘密の情報はありません。パラメータストアのパラメータも GitHub の Variables も足しません。`line` は U1 のとおりチャネルアクセストークンを読み、グループの概要の取得と reply に使います。

## Sources

- `construction/u2-invitation/infrastructure-design/cicd-pipeline.md`（反映後の確かめの [Q1] の答え）
- `scripts/smoke-check.sh`、`.github/workflows/`
- `construction/u3-notification-group/nfr-requirements/tech-stack-decisions.md`（NFR10.4、NFR10.5）

## Assumptions & Open Questions

- LINE のイベントを自動で確かめる仕組み（テスト用のグループとアカウント）は、U2 と同じく選ばない案として残します
