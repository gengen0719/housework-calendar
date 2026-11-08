# 安全の要件（Security）— U2 招待

U2（`u2-invitation`）の安全の要件です。U1 の要件（`construction/u1-skeleton-family/nfr-requirements/security-requirements.md` の NFR4.1〜NFR4.13、NFR5.1〜NFR5.6）は、U2 の操作にもそのまま使います。ここでは U2 で足すものを、U1 の番号の続きで書きます。

## 招待の印（token）

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.14 | 招待の印は、暗号用の乱数（Node.js の `crypto.randomBytes(16)`、128 ビット）で作り、パディングなしの Base64URL にする。印は **22 文字ちょうど、文字は `[A-Za-z0-9_-]` のみ** [Q1]。`Math.random` などの暗号用でない乱数は使わない。作り方のライブラリの選び方は `tech-stack-decisions.md` の NFR4.24（BR3.2、BR3.6） | 単体テストで長さと文字の種類を確かめる。ESLint で `Math.random` を禁止する |
| NFR4.15 | 招待の印は、招待の ID や家族の ID から作らない（推測できるものを混ぜない）。招待の ID とは別の値にする（`entities.md`、BR3.6） | 単体テスト |
| NFR4.16 | `GET /v1/invitations/{token}` と `POST /v1/invitations/{token}/accept` は、印の形（22 文字ちょうど、`[A-Za-z0-9_-]` のみ。NFR4.14）を先に確かめ、合わなければ DynamoDB を読まずに 409 `INVITATION_INVALID` で断る。使えない理由（ない、作り直された、期限切れ）は応答で分けない（BR3.6） | 形の違う印、ない印、期限切れの印、作り直された印で、同じ応答になること |
| NFR4.17 | 利用者ごとの回数の制限は付けない。印の強さ（NFR4.14）、24 時間の期限（BR3.2）、友だちのセッションが要ること（NFR4.4）、U1 の Lambda の同時実行数の上限（NFR1.6。U1 の NFR 設計で画面用 5 と決めた値）で、当てられないようにする [Q2]。見積もり: 画面用の Lambda が 5 つ同時に 1 回 50 ミリ秒で休まず試しても、24 時間で約 864 万回（2^23 回）。使える印は家族ごとに 1 つなので、当たる見込みは 2^23 ÷ 2^128 = 2^-105 で、十分に小さい。使えない印の要求が来たことは、ログに残す（NFR2.9）（BR3.6） | ログに残ることを単体テストで確かめる |
| NFR4.25 | 招待の作成（`POST /v1/family/invitations`）の回数の上限は付けない。作れるのは家族の管理者だけで（NFR4.19）、1 回の作成は DynamoDB の書き込み（トランザクションで 3 件）だけのため、何度押されても無料枠と同時実行数の上限（NFR1.6）の中に収まる（BR3.1、BR3.4） | — |
| NFR4.26 | 招待の印は URL のパスとクエリに入るため、要求ごとのログ・かかった時間のログ（U1 の NFR2.6、NFR7.6、U2 の NFR7.11）では、パスを印のない形（`/v1/invitations/{token}`、`/v1/invitations/{token}/accept`）で書く。CloudFront と Lambda の関数 URL のアクセスログは有効にしない（U1 の構成のとおり）（BR3.6） | 単体テストで、要求のログに印の全体が出ないこと |
| NFR4.18 | 招待の印は、管理者に再表示するため取り出せる形で DynamoDB に持つ（ハッシュだけにはしない）。DynamoDB は保存時に暗号化される（AWS の既定の暗号化）。画面は印をメモリにだけ持ち、ブラウザの保存場所（localStorage、sessionStorage、Cookie）に書かない（BR3.12） | CDK の設定と画面のコードで確かめる |

## 認可

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.19 | `POST /v1/family/invitations` と `GET /v1/family/invitation` は、C6 の requireAdmin で管理者かを確かめる。子供は 403 `ADMIN_ONLY`（BR3.1、AC1.1.13）。画面は子供にボタンを出さない | 子供のセッションで 403 になり、招待ができないこと。子供の画面にボタンが出ないこと |
| NFR4.20 | 招待で入る家族は、DynamoDB の招待の記録の familyId だけで決める。URL・本文・クエリの家族の指定は受け取らない（契約の家族の範囲の決まり、BR3.8） | 本文に別の家族の ID を入れても、招待の家族に入ること |
| NFR4.21 | `GET /v1/family/members` は、セッションの利用者の家族のメンバーだけを返す。返す項目は userId、表示名、役割だけで、LINE のユーザー ID は返さない（BR3.11） | ほかの家族のメンバーが含まれないこと。応答に lineUserId がないこと |

## 送り直しと入力

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR4.22 | 招待を作る・参加する操作は `Idempotency-Key`（UUID の形）を必須にする（U1 の NFR4.10）。記録は利用者・印・操作・対象の組で持ち、同じ印で操作か対象が違えば 422 `IDEMPOTENCY_KEY_REUSED`（BR3.5） | 同じ印で別の招待に参加しようとして断られること |
| NFR4.23 | 招待のリンクを開いた画面は、URL のクエリの印を、形を確かめてから使う。印を読んだらすぐに `history.replaceState` で URL から外し、メモリにだけ持つ（参加・無効のどちらの結果でも履歴に残さない）。家族の名前は HTML として差し込まない（U1 の NFR4.12）。U1 の Referrer-Policy（NFR4.11）で、ほかのサイトに URL を渡さない（BR3.9） | 画面のテストで、印を読んだあと URL から消えていること |

## ログ

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR5.7 | 招待の印そのものはログに書かない。どのリンクかを見分けるために、印の先頭 4 文字だけを書いてよい [Q5]。先頭 4 文字は 24 ビットぶんで、残りの 104 ビットで当てられない強さを保つ。パスのログは NFR4.26 のとおり印を伏せる | ログの出し方の単体テストで、できごとのログと要求のログのどちらにも印の全体が出ないこと |

## 脅威と備え

| 脅威 | 備え | 扱い |
|------|------|------|
| 印を総当たりで当てる | NFR4.14、NFR4.16、NFR4.17、NFR4.4 | 備える |
| 印がログや URL の履歴から漏れる | NFR4.23、NFR4.26、NFR5.7 | 備える |
| 子供が招待を作る | NFR4.19 | 備える |
| 別の家族に入るよう、家族を指定して送る | NFR4.20 | 備える |
| 作り直しと参加が重なり、古い招待で参加する | NFR2.10、NFR2.11 | 備える |
| 転送されたリンクで家族以外の人が参加する | 24 時間の期限（BR3.2）、作り直しで前のリンクを使えなくする（BR3.4）、参加前の確認（BR3.9）、メンバーの一覧（BR3.11）、参加のログ（NFR2.9） | 受け入れる（最初の版はメンバーを外す手段を持たない） |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR4、NFR5）
- `construction/u2-invitation/functional-design/rules.md`（BR3.1〜BR3.12）、`functional-spec.md`（F1〜F6、契約への追加）
- `inception/contract-design/contract-summary.md`（C1、C6、家族の範囲の決まり）
- `construction/u1-skeleton-family/nfr-requirements/security-requirements.md`（NFR4.1〜NFR4.13、NFR5.1〜NFR5.6）
- `nfr-requirements-questions.md` の回答 [Q1]〜[Q5]
- `tech-stack-decisions.md`（NFR4.24 の印の作り方）、`observability-requirements.md`（NFR2.9）、`reliability-requirements.md`（NFR2.10、NFR2.11）
- `construction/u1-skeleton-family/nfr-design/scalability-design.md`（同時実行数の上限の値）

## Assumptions & Open Questions

- [assumption] DynamoDB の保存時の暗号化は、U1 と同じ AWS 管理の KMS 鍵（`AWS_MANAGED`）です。鍵の月額はかからず、KMS への要求は無料枠の中に収まる見込みです
- 受け入れるリスク（`functional-design/rules.md` の Assumptions）: 転送されたリンクで家族以外の人が参加しうること。最初の版はメンバーを外す手段を持ちません
