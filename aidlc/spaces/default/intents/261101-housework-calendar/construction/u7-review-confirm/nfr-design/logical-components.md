# 論理コンポーネント（Logical Components）— U7 確認・修正と確定

U7（`u7-review-confirm`）で足す・変えるコードと構成の部品です。U1〜U6 の構成に足します。U7 は新しいテーブル・Lambda・索引・指標・アラームを作らず、`api` の Lambda に状態の変更・確定・取り消しの処理を足します。`api` の権限と環境変数は U4・U5 で足し済みで、U7 は**追加なし**です（Infrastructure Design への引き継ぎ）。カレンダーの部品は、家族とメンバー（C6）とお手伝いの種類（C7）に頼り、逆向きには頼りません（ADR-001）。

## 足す・変える部品

```
packages/
  shared/src/
    reasons.ts                          # 変える: INVALID_TRANSITION・MONTH_CONFIRMED・ADMIN_ONLY・NOT_FOUND・INVALID_MONTH・INVALID_REQUEST・INTERNAL（足りないものだけ。多くは U1〜U6 で既にある）
    messages.ts                         # 変える: 状態の変更の確認・注意・「済にする」の確認・確定の確認・未の件数の注意・確定の取り消しの確認の文言（functional-spec.md の C10）
    api-types.ts                        # 変える: StatusChangeRequest（{ action, version }）、ConfirmationResponse、Duty の応答（更新後）
  backend/src/
    entries/api.ts                      # 変える: POST /v1/duties/:dutyId/status、PUT・DELETE /v1/months/:month/confirmation のルートを足す。onDutyReassigned の登録の口（U8 向け）。composition root は U5 のまま（権限・環境変数の追加なし）
    handlers/calendar/changeDutyStatus.ts   # 足す: requireMembership → requireAdmin → 本文の形（zod。探す前）→ dutyId の形 → changeDutyStatus を呼ぶ
    handlers/calendar/confirmMonth.ts       # 足す: requireMembership → requireAdmin → month の形 → confirmMonth / unconfirmMonth を呼ぶ（PUT と DELETE）
    services/calendarService.ts         # 変える: changeDutyStatus（判定の順番・取引・読み直し）、confirmMonth、unconfirmMonth を足す（既存の findDuty・buildMonthGuard・writeTransaction を使う）
    repositories/calendarRepository.ts  # 変える: buildStatusChangeItems（markDone の 3 項目、ほかの 2 項目）、buildMonthConfirmPut（attribute_not_exists）、buildMonthConfirmUpdate、buildMonthUnconfirmUpdate を足す（既存の buildMonthGuard・buildUnitPriceGuard を使う）
    services/dutyReassignedHook.ts      # 変える: DutyReassignedEvent.kind に 'status-changed' だけを足す（fromChildUserId は必須のまま。月の確定も担当ごとに status-changed の 1 件。reliability-design.md R-01）。実行は notifyDutyReassigned(events)、登録の口は onDutyReassigned（U8 向け。U7 は呼ぶだけ、登録しない）
  frontend/src/
    pages/CalendarPage.tsx、DayDetail.tsx   # 変える: 状態を変えるボタン（取り消す・済にする・やらなかった・外す）、確定・取り消しのボタン、理由の文字、新しい状態の表示
    components/StatusChangeDialog.tsx       # 足す: StatusChangePreview の確認（フォーカスの移動、Esc、aria-busy）
    components/MonthConfirmDialog.tsx       # 足す: MonthConfirmPreview の確認（未の件数の注意。aria-busy）
    api/client.ts                           # 変える: changeDutyStatus、confirmMonth、unconfirmMonth
    theme.ts と theme の単体テスト          # 変える: U7 の画面の色と大きさの確かめ（NFR9.8）
infrastructure/lib/
  app-stack.ts                          # 変えない（U7 は api の権限・環境変数を足さない。下の「Infrastructure Design へ渡すこと」）
  （data-stack.ts は変えない）
infrastructure/test/                    # 変える: api の権限と環境変数が U7 の前後で変わらないこと（NFR4.71）、line が変わらないこと（NFR4.72）、構成の数が変わらないこと（NFR1.31）、Calendar が RETAIN（NFR6.8）を足す
docs/contract-changes-u7.md             # 足す: 契約への追加の一覧（月の状態への 3 属性、状態の変更・確定・取り消しの窓口、onDutyReassigned の kind。functional-spec.md の約束）
README.md                               # 変える: 状態の変更・確定・取り消しの 3 秒の測り方（NFR7.36）
```

## 部品の分け方と頼り方

| 部品 | 頼る先 | 頼らない先 |
|------|-------|-----------|
| `handlers/calendar/changeDutyStatus` | `requireMembership`、`requireAdmin`、`calendarService.changeDutyStatus`、本文の zod、`params`（`dutyId` の形） | — |
| `handlers/calendar/confirmMonth` | `requireMembership`、`requireAdmin`、`calendarService.confirmMonth`・`unconfirmMonth`、`params`（`month` の形） | 本文（確定・取り消しに本文はない） |
| `calendarService`（C8 の状態の変更・確定の窓口） | `calendarRepository`、`choreTypeService.getCurrentUnitPrice`（markDone）、`dutyReassignedHook`、`shared/jstDate` | `userRepository` を直接（窓口を通す。ADR-001） |
| `calendarRepository` | `dynamoClient`（`tables.calendar()`）。単価の確かめの項目だけ `tables.choreTypes()` のキーを知る | `ChoreTypes` の中身を読まない（ConditionCheck の項目を組み立てるだけ） |
| `dutyReassignedHook` | 既存どおり（型の `kind` を広げるだけ） | — |

- U7 の処理は `api` の経路だけ（LINE の経路はない。NFR1.30）。`changeDutyStatus`・`confirmMonth`・`unconfirmMonth` は `calendarService.ts`（U5 の割り当ての保存・`changeDutyChild` と同じファイル）に足す。`api` は U5 の割り当てや U6 の記録を既に読み込んでいるので、`line` のバンドルの大きさには影響しない
- `onDutyReassigned` の登録の口は、`api` の起動の枠（composition root）に用意する。U7 の状態の変更・確定は `api` でだけ起きる。U8 が登録する（U7 は呼ぶだけ）

## 障害の波及範囲と失敗の範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `Calendar` テーブル | 状態の変更・確定・取り消しが使えない（もう一度操作する） | 友だち登録、家族、招待、お知らせ先、種類の一覧・登録・変更 |
| `ChoreTypes` | markDone（済にする）ができない（単価が読めない。書く前に失敗し、何も書かれない）。cancel・markSkipped・unmarkSkipped・確定・取り消しは動く | 単価を読まない操作、`Calendar` の読み取りだけの操作 |
| `api` の Lambda | 画面からの U7 のすべて | LINE の記録（U6。`line` の Lambda） |

- 影響の範囲は 1 つの家族の中（キーが家族）。1 つの家族の問題が別の家族に及ばない
- 状態の変更も確定も 1 つの取引（または 1 回の書き込み）なので、「一部だけ書かれた」状態は残らない（`reliability-design.md`）
- 失敗は「もう一度操作する」で収まる作り。縮退の運転（古い内容で書く）はしない

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 画面用 API の確かめの順番、`requireAdmin`、本文の形（NFR4.65〜NFR4.68） | `handlers/calendar/changeDutyStatus.ts`、`confirmMonth.ts`、`entries/api.ts`（ルート） |
| 家族の範囲で探す（NFR4.66） | `calendarService.ts`（`findDuty` のキーが `ctx.familyId`） |
| 取引の条件で守る、読み直し（NFR4.69、NFR4.70、NFR2.44、NFR2.45） | `calendarRepository.ts`（項目の組み立て、`writeTransaction`）、`calendarService.ts`（判定の順番とやり直し） |
| 確定・取り消しの冪等（NFR2.46） | `calendarRepository.ts`（`attribute_not_exists` の Put、Update）、`calendarService.ts`（行の有無の分岐） |
| 確定した月が変えられない（NFR2.47、NFR2.48） | `calendarRepository.ts`（`buildMonthGuard`。各単位が引く）、`calendarService.ts`（確定行を書く） |
| 失敗の扱い（NFR2.49、BR8.18） | `calendarService.ts`（`INTERNAL`）、`entries/api.ts`（`REQUEST_ERROR`、500） |
| フック（NFR2.50、BR8.15） | `dutyReassignedHook.ts`（`kind` を広げる）、`calendarService.ts`（成功後に 1 回呼ぶ） |
| 日本時間（NFR11.7） | `shared/jstDate.ts`、入口で 1 回だけ取る `now` |
| ログ（NFR2.51〜NFR2.53、NFR7.38） | `calendarService.ts`、`entries/api.ts`（`durationMs`・`path`） |
| 量と費用（NFR1.30、NFR1.31、NFR3.11〜NFR3.13） | `calendarService.ts`、`calendarRepository.ts`（読み方・取引の項目） |
| 速さの測り方（NFR7.33〜NFR7.37） | README の手順書、測定の記録（Build and Test）、`REPORT` の `Init Duration` |
| 筋書きと 80% のカバレッジ（NFR8.13） | `test/u7-review-confirm/*`（前提データで状態・確定・時計・単価を用意） |
| 秘密（NFR5.13） | gitleaks、`<作り物の値>`。U7 は新しい秘密を作らない |
| 色と大きさ・確認（NFR9.8） | `StatusChangeDialog.tsx`、`MonthConfirmDialog.tsx`、`theme` の単体テスト、画面の筋書き |

## 他の単位との約束

- **U8（代わりにやる）**: `DutyReassignedEvent.kind` に `'status-changed'`（担当が「未」でなくなった）だけを足す（FR7.5。`'month-confirmed'` の月単位の kind は作らず、月の確定も「その月で『未』でなくなった担当ごとに `status-changed` の 1 件」に展開する。`reliability-design.md` R-01）。登録の口は `onDutyReassigned`（U8 が登録）、呼び出す処理は `notifyDutyReassigned(events)`（U5・U6・U7 が成功後に一覧で 1 回呼ぶ。R-02）。U8 が、その担当に出ている申し出を取り下げるために登録する。U8 までは登録がなく、何もしない。U8 は `api` の起動の枠に登録する（U7 の状態の変更・確定は `api` で起きる。記録は U6 で両方の枠に登録するのと同じ考え）。通知は「届けば取り下げる」ためで、最後の守りは U8 の引き受けの条件にある
- **U9（お小遣いの額）**: 「済」の担当の `unitPrice` を種類ごとに足して額を出す。U7 の取り消し・やらなかったで「済」でなくなった担当は `unitPrice` が空になり数から外れる（BR8.5、BR8.7）。確定済みかは月の状態で見る（`isMonthConfirmed`）。U7 は金額や回数を別に保存せず、ログにも金額を残さない（ADR-005）
- **U10（お知らせ・作り手への知らせ）**: 15 分以内の知らせの対象に、次のイベントを入れる: `DUTY_STATUS_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`、`DUTY_REASSIGN_HOOK_FAILED`。名前と形は U10 まで変えない（`observability-design.md`）。U7 は指標とアラームを足さない（NFR1.31、NFR2.53）。月末のまとめ（FR9.2）は確定していてもいなくても送る。16 時のリマインドは確定している月には送らない（`isMonthConfirmed`）。確定を取り消した月は、また 16 時のリマインドを送る
- **U11（加算・減額）**: 確定している月の加算・減額を、月の確かめ（`buildMonthGuard`）で `MONTH_CONFIRMED` に断る（AC8.2.5）。U7 で確かめるのは記録・状態の変更・割り当ての変更までで、加算・減額は U11 で確かめる（NFR2.47）
- **Build and Test**: 3 秒の測定（NFR7.33、NFR7.34）の表を成果物に残す。環境変数や設定を手で書き換えない（NFR6.8）。呼び出しの回数の上限（NFR7.35）は自動のテストで確かめる

## Infrastructure Design へ渡すこと

| 項目 | 内容 |
|------|------|
| 新しいテーブル・Lambda・索引 | なし。`DataStack` は変えない。`AppStack` の props にはすでに `calendar` と `choreTypes` がある（U4、U5） |
| 環境変数（`api` の Lambda） | **追加なし**。`CALENDAR_TABLE`（`props.calendar.tableName`）と `CHORE_TYPES_TABLE`（`props.choreTypes.tableName`）は U4・U5 で `api` に足し済み（`app-stack.ts` を読んで確かめ済み）。`ENV`・`SSM_PREFIX` も既にある。秘密の情報は入れない |
| `Calendar` への許可（`api` のロール） | **追加なし**。U5 で `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem` を足し済み。U7 の `UpdateItem`（担当・月の状態）・`PutItem`（確定行の作成）・`ConditionCheckItem`（月・単価の確かめ）・`GetItem`・`Query` はこの範囲内 |
| `ChoreTypes` への許可（`api` のロール） | **追加なし**。U4 で `GetItem`・`Query`・`PutItem`・`UpdateItem`・`DeleteItem`・`ConditionCheckItem` を足し済み。U7 の `GetItem`（単価の読み）・`ConditionCheckItem`（単価の確かめ）はこの範囲内 |
| `line` の Lambda | **変えない**。U7 は LINE の経路を持たない（NFR4.72）。既存の権限・環境変数を増やさない |
| 足さない許可 | U7 は担当を作らない・消さないので、`PutItem`・`DeleteItem` を担当には使わない（確定行の作成は月の状態の項目への `PutItem`）。別のサービスの許可も足さない |
| CDK のテスト | (1) `api` の `Calendar`・`ChoreTypes` の許可が U7 の前後で同じ、(2) `api` の環境変数が U7 の前後で同じ、(3) `line` の許可と環境変数が U7 の前後で同じ（NFR4.72）、(4) テーブル・Lambda・ログのグループ・指標・アラームの数が U7 の前後で同じ（NFR1.31）、(5) `api` の同時実行数・メモリ・時間切れが U1 のまま（256 MB・30 秒。NFR3.13）、(6) `Calendar` が本番で `RETAIN`（NFR6.8） |
| メモリ・時間切れ | 256 MB、30 秒、ARM64 のまま。測定で 3 秒を超えたときだけ、512 MB への引き上げを検討する（無料枠の中に収まるかを確かめる） |
| 監視 | メトリクスフィルターもアラームも足さない（U10）。ログの保管は 30 日のまま |
| 費用 | 月に数十回の書き込みで 1 円に満たない見込み（`scalability-design.md`）。LINE を呼ばず無料のメッセージ数を使わない。新しい有料のサービスはない。U5 の最初の請求の確認（`Calendar` の行）に、U7 の増分を含めて見る |
| 配備の順番 | `AppStack` の更新だけ（`DataStack` に変更なし。権限・環境変数の追加もなし）。ステージングで FR6.1 の 5 とおりと確定・取り消しを画面から確かめ、`MONTH_CONFIRMED` が各単位で効くことを確かめてから本番へ。**コードが変わる反映は、`api` の冷たい起動を作る機会にもなる**（測定の手順で使う。環境変数や設定を手で書き換えない。NFR10.8） |
| 元に戻す手順 | コードは前の版に戻して再反映する。U7 は権限・環境変数を足さないので、戻しても消えるものはない。記録済みのデータと月の状態は `Calendar` に残り、読み書きしても壊れない（項目の形は U5 のまま。月の状態の追加属性は U5・U6 が読まない）。本番のデータは手で書き換えない（NFR6.8） |

## Sources

- `construction/u7-review-confirm/nfr-requirements/*.md`
- `construction/u7-review-confirm/functional-design/functional-spec.md`、`entities.md`、`rules.md`
- `inception/domain-design/components.md`（ADR-001、ADR-003、ADR-005、Entity Ownership。カレンダーが月の確定と状態を持つ）
- `inception/contract-design/contract-summary.md`（C1、C6、C7、C8、C10）
- `construction/u6-recording/nfr-design/logical-components.md`（形の手本と他の単位との約束）
- 既存コード（読むだけ）: `entries/api.ts`（ルート表、composition root、`requireAuth`）、`services/calendarService.ts`、`services/recordingService.ts`、`repositories/calendarRepository.ts`、`services/dutyReassignedHook.ts`、`middleware/requireAdmin.ts`、`lib/dynamoClient.ts`、`lib/logger.ts`、`infrastructure/lib/app-stack.ts`（`api`・`line` の既存の権限と環境変数）

## Assumptions & Open Questions

- ファイルの分け方は目安で、コード生成の計画で決めます
- [assumption] `api` の権限・環境変数が足り済みであることは、`infrastructure/lib/app-stack.ts` を読んで確かめました（`Calendar` と `ChoreTypes` の 6 操作ずつ、`CALENDAR_TABLE`・`CHORE_TYPES_TABLE` が `api` にある）。U7 は Infrastructure Design に**追加なし**で引き継ぎます。確定行の作成の `PutItem` も U5 の範囲内です
- 渡し方は設計で決めました（`reliability-design.md` R-01・R-02）: `kind` に `'status-changed'` だけを足し（`fromChildUserId` 必須のまま）、月の確定も担当ごとに `status-changed` の 1 件に展開して、登録の口 `onDutyReassigned` と実行の `notifyDutyReassigned(events)` を分け、成功後に一覧で 1 回呼ぶ。U7 は登録せず、U8 まで何もしません
- [assumption] `docs/contract-changes-u7.md` に残す契約の追加の一覧は、コード生成で書きます
- [assumption] `entries/api.ts` の `POST /v1/duties/:dutyId/status`・`PUT`・`DELETE /v1/months/:month/confirmation` のルーティングは、U5 の `router.ts` の `:name` を使う（コード生成で確かめる）
