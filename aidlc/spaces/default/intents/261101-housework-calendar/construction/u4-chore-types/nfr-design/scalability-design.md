# 量と費用の設計（Scalability Design）— U4 お手伝いの種類

U4（`u4-chore-types`）の量と費用の要件（NFR1.16〜NFR1.18、NFR3.5）を、どう作るかを書きます。U4 は U1〜U3 の作りを使うだけで、決まっていないことがないため、この段階では人に聞くことはありませんでした。テーブルの形は、下の比べた案のうちから選びました。

## テーブルの形

| テーブル | キー | 項目 | TTL |
|---------|------|------|-----|
| `ChoreTypes`（新しく作る） | パーティションキー `familyId`、ソートキー `sk` | 種類: `sk = TYPE#<choreTypeId>`、`choreTypeId`、`name`、`unitPrice`、`description`、`active`、`createdAt`、`updatedAt`。名前の印: `sk = NAME#<NFC に正規化した名前>`、`choreTypeId` | なし |

- 家族の種類の一覧は `familyId = :f AND begins_with(sk, 'TYPE#')` の Query 1 回（続きがあれば最後まで読む。NFR1.17）。並び（BR5.11）はコードで `active`・`createdAt`・`choreTypeId` の順に並べる
- 種類を 1 つ読む（変更、使わない、消す、C7 `getCurrentUnitPrice`）は `familyId = ctx.familyId, sk = TYPE#<id>` の GetItem。キーに家族が入るので、ほかの家族の種類は読めず、そのまま 404 になる（NFR4.36。家族の範囲が作りで守られる）
- 名前の重なりは、名前の印の項目（`NAME#…`）を種類と同じトランザクションで Put し、条件 `attribute_not_exists(sk)` で守る（NFR2.24）
- オンデマンド。保存は数十件で、無料枠（25 GB）の中

### 比べた案

| 案 | よいところ | よくないところ | 選んだか |
|----|----------|--------------|---------|
| A. 1 つのテーブルに種類と名前の印を入れ、家族をパーティションキーにする（上の形） | 家族の範囲がキーで守られる。一覧が Query 1 回。名前の印を同じテーブルで同じトランザクションにできる | 種類と印の 2 種類の項目を `sk` の先頭で見分ける必要がある | 選んだ |
| B. 種類のテーブル（キー `choreTypeId`）と、家族の索引（GSI）と、名前の印のテーブルを分ける（U2・U3 と同じく用途ごとのテーブル） | 項目の形が 1 種類 | GSI は結果整合なので登録の直後の一覧に出ないことがある。家族の確かめをコードで毎回しないといけない。テーブルが 2 つ増える | 選ばない |

## 読み書きの量の見込み

| 操作 | 読み書き |
|------|---------|
| 一覧 | Query 1 回 |
| 登録 | TransactWriteItems 2 件（種類、名前の印）+ 送り直しの記録（U1） |
| 名前を変えない変更 | GetItem 1 回 + UpdateItem 1 回 |
| 名前を変える変更 | GetItem 1 回 + TransactWriteItems 3 件（種類、古い印の Delete、新しい印の Put） |
| 使わない・使う | UpdateItem 1 回 |
| 消す | UpdateItem 1 回（使わない）+ C8 の確かめ + TransactWriteItems 2 件（種類と印の Delete） |

## Lambda

- U4 の処理は U1 の画面用の Lambda（`api`）に足す。新しい Lambda は作らない（NFR1.16、NFR3.5）

## Sources

- `construction/u4-chore-types/nfr-requirements/scalability-requirements.md`
- `construction/u4-chore-types/functional-design/entities.md`、`rules.md`
- `construction/u2-invitation/nfr-design/scalability-design.md`、`construction/u3-notification-group/nfr-design/scalability-design.md`

## Assumptions & Open Questions

- U5 のカレンダーは、種類を C7 の窓口（同じ `api` の Lambda の中のコード）を通して読みます。テーブルを直接読みません
