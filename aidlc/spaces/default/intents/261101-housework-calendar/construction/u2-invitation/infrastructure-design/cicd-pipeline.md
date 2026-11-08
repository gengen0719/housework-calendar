# 反映の流れ（CI/CD Pipeline）— U2 招待

U2（`u2-invitation`）では、U1 のワークフロー（`ci.yml`、`deploy-staging.yml`、`deploy-production.yml`）を変えずに使います。変えるのは、反映したあとの確かめ（`scripts/smoke-check.sh`）と、README の手順だけです。

## ワークフロー

| ワークフロー | U2 での変更 |
|-------------|------------|
| `ci.yml`（プルリクエストと `main`） | 変更なし。U2 のコードも Prettier、ESLint、型の検査、Vitest（行カバレッジ 80% 以上）、gitleaks、`cdk synth` を通す（NFR8.5） |
| `deploy-staging.yml`（`main` への push） | 変更なし。Data と App のスタックを反映し、`smoke-check.sh` を動かす |
| `deploy-production.yml`（手で実行、`production` の環境） | 変更なし |

## 反映したあとの確かめ（`scripts/smoke-check.sh`）[Q1]

U1 の 4 つの確かめ（画面が出る、`/v1/me` がセッションなしで 401、署名のない Webhook が 401、関数 URL を直接呼ぶと 403）に、次の 5 つを足します。どれもセッションなしで呼び、401 `UNAUTHENTICATED` になることを確かめます。

| 確かめ | 期待 |
|--------|------|
| `GET /v1/family/members`（セッションなし） | 401 |
| `GET /v1/family/invitation`（セッションなし） | 401 |
| `POST /v1/family/invitations`（セッションなし） | 401 |
| `GET /v1/invitations/AAAAAAAAAAAAAAAAAAAAAA`（セッションなし。形だけ正しいでたらめの印） | 401 |
| `POST /v1/invitations/AAAAAAAAAAAAAAAAAAAAAA/accept`（セッションなし） | 401 |

これで、新しい操作が振り分けに入っていること（404 にならない）と、認証の前に処理が進まないことを確かめます。401 だけの確かめでは、ロールの権限の足りなさ（AccessDenied）は見つかりません。権限は CDK のテスト（`infrastructure-specification.md`）と、次の手での確かめで見ます（レビュー R-03）。ログインしての確かめ（招待を作って、別の LINE アカウントで開いて参加する）は、作り手がステージングで手で行います（チェックポイントでの確かめ）。

## 反映の順番

1. 作り手が、ステージングの LIFF アプリで shareTargetPicker を有効にする（LINE Developers の管理画面）
2. U2 のプルリクエストを `main` に取り込む → ステージングに自動で反映（Data スタックで `Invitations` と `familyId-index` ができ、App スタックで権限とメトリクスフィルタが足される）
3. `smoke-check.sh` が通ることを確かめる
4. 作り手がステージングで、招待を作る・LINE で送る・別のアカウントで参加するを手で確かめる
5. 本番の LIFF アプリで shareTargetPicker を有効にしてから、`deploy-production.yml` を手で動かす

## 前の版に戻す

- U1 のとおり `git revert` して `main` に取り込む
- 反映は U1 のとおり Data → App の順です。戻すときも同じ順で反映され、Data の時点で App の Lambda がまだ `Invitations` を参照していても、本番は `RETAIN` なのでテーブルは消えず、スタックの管理から外れるだけです。続く App の反映で参照もなくなります（レビュー R-04）
- テーブル名は U1 と同じく CDK が作る名前（`tableName` を指定しない）にします。そのため、もう一度 U2 を反映すると、残ったテーブルとは別の名前の新しいテーブルができ、名前はぶつかりません。古い招待は引き継がれませんが、招待は 24 時間で使えなくなるので問題になりません。残ったテーブルは、作り手が手順として消します（データを書き換えるのではなく、使わなくなった資源を片付ける）
- ステージングは `DESTROY` なので、戻すと `Invitations` は消えます
- GSI `familyId-index` は、戻すと消える（索引だけで、データは消えない）

## README に足すこと

- shareTargetPicker を有効にする手順（環境ごとの LIFF アプリ）（NFR10.3）
- `InvitationInvalidCount` を週に 1 回 CloudWatch で見る手順（U10 まで）（NFR2.15）
- 濫用されたときに、画面用の Lambda の予約された同時実行数を 0 にして止める手順
- ログイン済みの確かめの手順（招待を作る → 別の LINE アカウントで開く → 参加する → メンバーの一覧に出る）

## 秘密の情報

U2 で新しい秘密の情報はありません。パラメータストアのパラメータも、GitHub の Variables も足しません。

## Sources

- `construction/u1-skeleton-family/infrastructure-design/cicd-pipeline.md`
- `scripts/smoke-check.sh`、`.github/workflows/`
- `construction/u2-invitation/nfr-requirements/tech-stack-decisions.md`（NFR10.3）、`observability-requirements.md`（NFR2.15）
- `infrastructure-design-questions.md` の回答 [Q1]

## Assumptions & Open Questions

- ログイン済みの確かめを自動にする方法（テスト用の LINE アカウント）は、選ばなかった案として残します [Q1]
