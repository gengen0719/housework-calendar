# 論理コンポーネント（Logical Components）— U8 代わりにやる

U8（`u8-swap`）で足す・変えるコードと構成の部品です。U1〜U7 の構成に足します。U8 は新しいテーブル・Lambda・索引・指標・アラームを作らず、`line` の Lambda に「家事交代」と `swap.*` の入口を、`line` と `api` の起動の枠にフックの登録を足します。`line`・`api` の権限と環境変数は U5・U6 で足し済みで、U8 は**追加なし**です（Infrastructure Design への引き継ぎ）。

## 足す・変える部品

ファイルの分け方は目安で、コード生成の計画で決めます。

```
packages/
  shared/src/
    reasons.ts                          # 変える: OFFER_OWNER_ONLY を足す（NO_SWAPPABLE_DUTY・ALREADY_OFFERED・OFFER_GONE・CANNOT_ACCEPT_OWN_OFFER・OFFER_ALREADY_ACCEPTED・DUTY_CHANGED は既存）
    messages.ts / messages.test.ts      # 変える: 一覧の見出し・案内・管理者と 1 対 1 の文・知らせと結果の文・失敗の文
  backend/src/
    entries/line.ts                     # 変える: accepts に「家事交代」と swap.* の形の判定を足す（二度処理しない記録の前）。source.type の振り分け。起動の枠で registerSwapHooks({ recorded }) を 1 回呼ぶ
    entries/api.ts                      # 変える: 起動の枠（composition root）で registerSwapHooks({ reassigned, recorded }) を 1 回呼ぶ
    handlers/line/swapCommand.ts        # 足す: 「家事交代」の完全一致（trim）と swap.* の正規表現（NFR4.75、NFR4.76）。U3 の groupCommand.ts は変えない
    handlers/line/swapHandler.ts        # 足す: runGroupOperation を通して listSwappable・offerSwap・acceptSwap・withdrawSwap を呼び、結果の印を返事に対応させる。管理者・1 対 1 の案内
    services/swapService.ts             # 足す: C8 の listSwappableDuties・offerSwap・acceptSwap・withdrawSwap（判定の順番・読み直し・SWAP_* のログ）。あわせて registerSwapHooks（実行環境ごとに 1 回）と closeOffer（status = open の条件つき UpdateItem）も置く（機能設計 BR9.11「swapService の registerSwapHooks」に合わせる。別ファイル swapHooks.ts は作らない）
    services/dutyReassignedHook.ts      # 変える: notifyDutyReassigned を DUTY_HOOK_CONCURRENCY（4）件ずつ並行に。mapWithConcurrency と DUTY_HOOKS_DONE。型は変えない
    services/groupCommandGate.ts        # 変える: 操作関数に表示名を第 2 引数で渡す。GROUP_COMMAND_REJECTED から groupId を外す
    services/lineApiService.ts          # 変える: 一覧の carousel・「引き受ける」「申し出をやめる」の 2 ボタンのメッセージを作る関数（altText 付き。上限は 1 か所の定数）
    services/calendarService.ts         # 変える: confirmMonth のあとのフック呼び出しは notifyDutyReassigned（既存）。並行数と DUTY_HOOKS_DONE は hook 側
    repositories/swapRepository.ts      # 足す: 申し出の GetItem（強い整合性）、申し出の UpdateItem の組み立て、引き受けの 3 項目の取引。calendarRepository の buildMonthGuard・CHECK_DUTY_UNCHANGED・classifyCancellation・writeTransaction を使う
infrastructure/lib/
  app-stack.ts / data-stack.ts          # 変えない
infrastructure/test/                    # 変える: line と api の権限・環境変数が U8 の前後で変わらない（NFR4.82）、構成の数が変わらない（NFR1.33）、line の同時実行が U1 のまま（NFR3.16）、Calendar が RETAIN（NFR6.9）
docs/contract-changes-u8.md             # 足す: 契約への追加の一覧（functional-spec.md の「契約への追加」、GROUP_COMMAND_REJECTED の変更、notifyDutyReassigned の並行数、LINE の上限の確認結果）
README.md                               # 変える: U8 の 3 秒の測り方（NFR7.48）、フックの測り方（NFR7.46）
```

- 上流の文書（`stories.md` の AC7.1.1〜AC7.1.3、`requirements.md` の FR7.1、`mockups.md`、`contract-summary.md`）の「代わって」と送る、の書き方を「家事交代」に直す更新は、コード生成の最初の手順（BDD の筋書きの前）で行います（NFR8.16）

## 部品の分け方と頼り方

| 部品 | 頼る先 | 頼らない先 |
|------|-------|-----------|
| `handlers/line/swapCommand` | 正規表現と `trim` だけ（純粋な関数） | DynamoDB、LINE |
| `handlers/line/swapHandler` | `runGroupOperation`、`swapService`、`lineApiService`（返事の組み立てと reply）、`messages` | `calendarRepository` を直接（窓口を通す） |
| `swapService`（C8 の申し出の窓口） | `swapRepository`、`calendarRepository`（`findDuty`・`buildMonthGuard`）、`choreTypeService`（種類の名前・一覧）、`shared/jstDate` | `userRepository` を直接（窓口を通す。ADR-001） |
| `swapRepository` | `dynamoClient`（`tables.calendar()`）。申し出の項目のキーを知る | `ChoreTypes` の中身（取引に含めない） |
| `swapService` のフック部分（`registerSwapHooks`・`closeOffer`） | `dutyReassignedHook`・`dutyRecordedHook` の登録の口、`swapRepository` | 同じファイルの判定の関数の結果（判断はフックに頼らない） |
| `dutyReassignedHook` | `mapWithConcurrency`（同じファイル内の小さな関数） | 新しい依存 |

- 判断（有効か）は `swapService` の判定の関数が読んだ値から行い、同じファイルにある `registerSwapHooks`・`closeOffer` の結果には頼りません（`reliability-design.md`）
- LINE の経路（`line`）と画面の経路（`api`）は、`dutyReassignedHook`・`dutyRecordedHook` の登録の口を共有しますが、実行環境が別なので登録は別々です

## フックの登録の流れ

```text
api  の起動の枠 : registerSwapHooks({ reassigned: true, recorded: true })   # 1 回だけ（registered フラグ）
line の起動の枠 : registerSwapHooks({ reassigned: false, recorded: true })  # 1 回だけ。line に担当の子供を変える書き込みはない
確定 / 割り当て保存 / 状態変更 / 担当の子供の変更 → notifyDutyReassigned(events)（4 並行）→ closeOffer（UpdateItem、status = open の条件）
記録 U6（line）・画面の記録 U6（api）              → notifyDutyRecorded → closeOffer
acceptSwap                                        → どのフックも呼ばない
```

## 障害の波及範囲と失敗の範囲（failure domains / blast radius）

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `Calendar` テーブル | 「家事交代」の一覧・申し出・引き受け・取り下げが使えない（もう一度操作する）。LINE は 500 を返し再送される | 友だち登録、家族、招待、お知らせ先、種類の一覧・登録・変更 |
| `ChoreTypes` | 返事の「お手伝い」の名前が引けず言い換えになる。一覧の carousel の種類名も同様。書き込み自体は止まらない（引き受けの取引は `ChoreTypes` を含まない） | 申し出・引き受けの保存 |
| LINE の API（reply） | 返事が出ない。保存は済んでいる（`LINE_REPLY_FAILED`）。残る危険は `reliability-design.md` | 申し出の保存と有効さの判断 |
| `line` の Lambda | 「家事交代」と `swap.*` のすべて、LINE からの記録（U6） | 画面からの操作、フックによる掃除（`api` の経路） |
| `api` の Lambda | 月の確定・割り当て・状態の変更（とそれに伴うフック） | LINE の経路 |
| フック（掃除） | 古い申し出が `open` のまま残る（無害。読んだときに「なくなった」と判断される） | 保存・確定・記録の結果 |

- 影響の範囲は 1 つの家族の中（キーが家族）。1 つの家族の問題が別の家族に及ばない
- 引き受けは 1 つの取引、取り下げ・掃除は 1 回の `UpdateItem` なので、「一部だけ書かれた」状態は残らない
- 失敗は「もう一度操作する」で収まる作り。縮退の運転（古い内容で書く）はしない
- 共有資源: `Calendar` の同じ家族のパーティション（月の確定の 300 件の書き込みと LINE の操作が同じキーの範囲を使う）。並行数 4 で毎秒の書き込みを 1 パーティションの目安に収めます

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 受け口の順番・「家事交代」の完全一致・正規表現（NFR4.74〜NFR4.76、NFR4.85） | `entries/line.ts`（`accepts`）、`handlers/line/swapCommand.ts` |
| グループの入口・家族の決め方（NFR4.77） | `services/groupCommandGate.ts`（`runGroupOperation`） |
| 誰が何をできるか・先着・古いボタン（NFR4.78〜NFR4.80、NFR2.54〜NFR2.57） | `services/swapService.ts`、`repositories/swapRepository.ts` |
| 申し出の項目の書き方・権限の固定（NFR4.81、NFR4.82） | `repositories/swapRepository.ts`、`services/swapService.ts`、CDK のテスト |
| 返事と名前の扱い（NFR4.83、NFR4.84、NFR1.32、NFR3.16） | `handlers/line/swapHandler.ts`、`services/lineApiService.ts` |
| フックの登録・掃除・並行数（NFR2.58、NFR2.59、NFR3.15、NFR7.46、NFR8.16） | `services/swapService.ts`（`registerSwapHooks`・`closeOffer`）、`services/dutyReassignedHook.ts`、`entries/api.ts`・`entries/line.ts` |
| LINE の失敗の分け方（NFR2.60〜NFR2.62） | `entries/line.ts`（`begin`／`release`／`markDone`）、`handlers/line/swapHandler.ts` |
| 日本時間（NFR11.8、NFR11.9） | 入口で 1 回取る `now`、`shared/jstDate.ts` |
| ログ（NFR2.63〜NFR2.66、NFR7.49） | `services/swapService.ts`（`SWAP_OFFER_CLOSED` も含む）、`services/dutyReassignedHook.ts`、`services/groupCommandGate.ts`（U8 の経路の `GROUP_COMMAND_REJECTED` から `groupId` を外す） |
| 呼び出しの回数（NFR7.44、NFR7.45） | 単体テスト（クライアントの差し替えで数える） |
| 量と費用（NFR1.33、NFR1.34、NFR3.14） | 構成を足さない、`GetItem` と `begins_with` の `Query` だけ、CDK のテスト |
| 速さの測り方（NFR7.39〜NFR7.43、NFR7.46〜NFR7.48） | README の手順書、測定の記録（Build and Test）、`REPORT` の `Init Duration` |
| 筋書きと 80% のカバレッジ（NFR8.14）、LINE の上限の確認（NFR8.15）、アクセシビリティ（NFR9.9） | `test/u8-swap/*`、`docs/contract-changes-u8.md`、`lineApiService.ts` の定数 |
| 秘密（NFR5.14、NFR5.15） | gitleaks、`<作り物の値>`。U8 は新しい秘密を作らない |
| データ・元に戻す（NFR6.9、NFR10.9、NFR10.10） | CDK のテスト（`Calendar` が `RETAIN`）、通常の反映の流れ |

## 他の単位との約束

- **U5・U6・U7 のフック**: U8 が `onDutyReassigned`（`child-changed`・`deleted`・`status-changed`）と `onDutyRecorded` に登録します。関数の型・イベントの型は変えません。変えるのは `notifyDutyReassigned` の実行の形（4 並行）だけで、保存・確定・記録の結果は変わりません
- **U7（確認・修正と確定）**: 月の確定が担当ごとに渡す `status-changed` を掃除に使います。月単位のイベントは足しません（段階 3 に進むときだけ人の判断で契約を変える）
- **U9（お小遣い）**: U8 は状態・記録・単価を書き換えません。引き受けても金額は変わらず、担当が「済」になったときに、その時点の担当の子供の記録として数えます。引き継ぎはありません
- **U10（お知らせ・作り手への知らせ）**: 16 時のリマインドは担当の子供を読むので、引き受けた担当は引き受けた子供の分として届きます。U8 の返事は reply なので月 200 通の無料枠に数えません。15 分以内の知らせの対象に入れるイベント（`observability-design.md` の「失敗の見つけ方」の一覧）の引き継ぎを、`functional-spec.md` の「次の単位への引き継ぎ」の U10 の行と `construction/u8-swap/` の引き継ぎの記録に書きます
- **U11（加算・減額）**: 引き継ぎはありません
- **Build and Test**: 3 秒の測定（NFR7.39〜NFR7.42）、確定とフックの測定（NFR7.46）、U8 の反映後の測り直し（NFR7.22・NFR7.25・NFR7.33。NFR7.48 の 8.）の表を成果物に残します。環境変数や設定を手で書き換えません

## Infrastructure Design へ渡すこと

| 項目 | 内容 |
|------|------|
| 新しいテーブル・Lambda・索引・TTL | なし。`DataStack` は変えない |
| 環境変数 | **追加なし**。`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` は `line`・`api` にある（`app-stack.ts` を読んで確かめ済み）。秘密は入れない |
| `Calendar` への許可 | **追加なし**。`line` は `GetItem`・`Query`・`UpdateItem`・`ConditionCheckItem`、`api` は 6 操作（U5）。U8 の読み書きはこの範囲内 |
| `ChoreTypes` への許可 | **追加なし**。`line` は `GetItem`・`Query`・`ConditionCheckItem`、`api` は 6 操作（U4） |
| 足さない許可 | `line` への `Calendar` の `PutItem`・`DeleteItem`・`BatchGetItem`・`BatchWriteItem`・`Scan`、`dynamodb:*`、`ChoreTypes` への書き込み、別のサービス、`*` の資源 |
| CDK のテスト | (1) `line` と `api` の IAM ポリシー・環境変数が U8 の前後で同じ、(2) `line` に足さないものが 1 つもない、(3) ステージングの `line` が本番のテーブルの ARN を含まない、(4) テーブル・索引・Lambda・ログのグループ・指標・アラームの数が同じ、(5) `line` の同時実行が U1 のまま、(6) `Calendar` が本番で `RETAIN` |
| メモリ・時間切れ | 256 MB、30 秒のまま。測定で 3 秒を超えたときだけ 512 MB を検討する（NFR7.48 の 7.。無料枠に収まるかを確かめる）。Provisioned Concurrency は使わない |
| 監視 | メトリクスフィルターもアラームも足さない（U10）。ログの保管は 30 日のまま |
| 費用 | 月に 1 円に満たない見込み（`scalability-design.md`）。reply だけで push を使わない。新しい有料のサービスはない |
| 新しい環境ごとの設定（NFR10.9） | 公式アカウント・チャネル・SSM パラメータ・リッチメニューを足さない。ステージングの確認は、ステージング用の公式アカウントと作り手だけのグループで、子供の役割のテスト用の利用者を 2 人以上使う。ステージングの公式アカウントを本番のお知らせ先のグループに入れない |
| 配備の順番 | `AppStack` の更新だけ。通常の流れ（`main` への取り込みでステージングに自動、本番は作り手が確認してから手で）に従う。コードが変わる反映は冷たい起動を作る機会にもなる（環境変数や設定を手で書き換えない） |
| 元に戻す手順（NFR10.10） | 前の版のコードを通常の流れで再び反映する。データの移行も削除も要らない。`SWAP#` の項目は前の版から読まれず無害で残る。前の版に戻すと「家事交代」と `swap.*` のボタンは反応しなくなり、引き受けた担当の `childUserId`・`origin` は画面からの担当の変更と同じ状態として残る。並行数の変更を戻しても保存の結果は変わらない |

## Sources

- `construction/u8-swap/nfr-requirements/*.md`
- `construction/u8-swap/functional-design/functional-spec.md`、`entities.md`、`rules.md`
- `inception/contract-design/contract-summary.md`（C3、C6、C8、C10）
- `inception/domain-design/components.md`（ADR-001。カレンダーが申し出の窓口を持つ）
- `construction/u7-review-confirm/nfr-design/logical-components.md`（形の手本と他の単位との約束）
- 既存コード（読むだけ）: `entries/line.ts`、`entries/api.ts`、`handlers/line/`、`services/groupCommandGate.ts`、`services/dutyReassignedHook.ts`、`services/dutyRecordedHook.ts`、`services/lineApiService.ts`、`repositories/calendarRepository.ts`、`infrastructure/lib/app-stack.ts`

## Assumptions & Open Questions

- ファイルの分け方（`swapService.ts`・`swapRepository.ts` など。`registerSwapHooks` は BR9.11 どおり `swapService.ts` に置く）は目安で、コード生成の計画で決めます
- [assumption] `line`・`api` の権限・環境変数が足り済みであることは、NFR 要件の確認（`app-stack.ts` の読み取り）を引き継ぎます。コード生成の最初に再度読んで確かめ、不足があれば `security-design.md` に戻って理由とともに足します
- [assumption] `registerSwapHooks` を起動の枠で呼ぶ位置（モジュールの読み込み時か、ハンドラーの初期化か）は、コード生成で既存の `entries/api.ts`・`entries/line.ts` の形に合わせて決めます。1 回だけ呼ぶ、という決まりは変わりません
- [assumption] LINE の上限（NFR8.15）の確認の結果、carousel の個数やラベルの文字数が違えば、`lineApiService.ts` の定数と BR9.6・BR9.7 の文字数を直します
- 承認の場で人が決めること（`reliability-design.md` の「残る危険」）: 「担当を選ぶ」の reply 失敗の扱い (1) 許容か (2) ボタンを添えるか
