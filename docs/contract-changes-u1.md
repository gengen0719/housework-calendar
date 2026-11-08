# U1 で足した契約の一覧

U1（`u1-skeleton-family`）のコード生成で、契約（`inception/contract-design/contract-summary.md`）に足したものです。項目・操作・理由の印を足すのは契約の決まりで自由です。`contract-summary.md` への反映を待つ一覧として、ここに残します。

## C1 画面用 API

| 操作                | 足したもの | 中身                                                                                                                                            |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/families` | 本文       | `{ "name": string }`。前後の空白を除いて 1〜20 文字                                                                                             |
| `POST /v1/families` | ヘッダー   | `Idempotency-Key`（必須、UUID）。送り直しのときは同じ値を送る。同じ利用者の同じ値がすでに成功していれば、前と同じ 201 を返し、家族は 1 つのまま |
| `POST /v1/families` | 201        | 本文は `MeFamily`（`familyId`、`name`、`role`）。作った人なので `role` は常に `admin`。`GET /v1/me` の `family` と同じ形                        |
| `POST /v1/families` | 400        | `IDEMPOTENCY_KEY_REQUIRED`（ヘッダーがない、または UUID でない）                                                                                |
| `POST /v1/families` | 409        | `ALREADY_IN_FAMILY`（すでに家族に入っている）                                                                                                   |
| `POST /v1/families` | 422        | `INVALID_FAMILY_NAME`（空、空白だけ、21 文字以上）                                                                                              |
| すべての操作        | 403        | `NOT_FRIEND`（セッションを持つ人があとでブロックしたとき）                                                                                      |
| `GET /v1/me`        | 応答       | `family` は家族に入っていなければ `null`                                                                                                        |

## C2 セッション（`POST /v1/sessions`）

| 足したもの | 中身                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 403        | `NOT_FRIEND`。記録がない人、またはブロック中の人で、LINE に問い合わせても友だちでないとき。セッションは出さない |
| 503        | `SERVICE_TEMPORARILY_UNAVAILABLE`。LINE に問い合わせられないとき                                                |

## C3 LINE の受け口（`POST /line/webhook`）

| 足したもの       | 中身                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| 思いがけない失敗 | 500 を返す。このとき「処理中」の記録を消し、LINE の再送で処理し直せるようにする                     |
| 署名             | 署名がない・合わない場合は 401。何も記録しない                                                      |
| 秘密のヘッダー   | CloudFront が付ける `X-Origin-Verify` がない・合わない場合は 403（CloudFront を通さない要求を断る） |
| unfollow         | `家族とメンバー.markBlocked` を呼ぶ                                                                 |

## C6 家族とメンバーの窓口

| 窓口                                              | 中身                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markBlocked(lineUserId)`                         | 利用者を「ブロック中」にする。記録は消さない                                                                                                                                                  |
| `findUserByLineId(lineUserId)`                    | `User` または `NOT_FOUND`                                                                                                                                                                     |
| `getUserStatus(userId)`                           | `{ friendStatus, familyId, role }`                                                                                                                                                            |
| `resolveSessionUser(...)`                         | セッションの利用者を決める（友だちかどうかも確かめる）                                                                                                                                        |
| `createFamily(userId, name, idempotencyKey, now)` | `Family` または `ALREADY_IN_FAMILY` / `INVALID_FAMILY_NAME`。家族の作成と利用者の更新は、両方できるか両方できないか（`TransactWriteItems`）。結果を `RequestRecords`（24 時間で消える）に残す |

## C10 理由の印と文言

| 印                                | 文言                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `NOT_FRIEND`                      | このアプリを使うには、公式アカウントを友だち追加してください |
| `INVALID_FAMILY_NAME`             | 家族の名前を 1〜20 文字で入力してください                    |
| `IDEMPOTENCY_KEY_REQUIRED`        | 操作の識別子が正しくありません。もう一度お試しください       |
| `SERVICE_TEMPORARILY_UNAVAILABLE` | 表示できませんでした。もう一度お試しください                 |

## 配信の設定（契約ではなく決めごと）

- 応答ヘッダーの CSP の `style-src` に `'unsafe-inline'` を許しています。MUI（emotion）が内側のスタイルを使うためで、承認済みの逸脱です。`script-src 'self'` は厳しいままです。
- CSP 全体: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.line.me https://access.line.me; img-src 'self' data: https://profile.line-scdn.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
