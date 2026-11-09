# 論理コンポーネント（Logical Components）— U6 記録

U6（`u6-recording`）で足す・変えるコードと構成の部品です。U1〜U5 の構成に足します。U6 は新しいテーブル・Lambda・索引・指標・アラームを作らず、`line` の Lambda に記録の処理と最小の権限を足します。カレンダーの部品は、家族とメンバー（C6）とお手伝いの種類（C7）に頼り、逆向きには頼りません（ADR-001）。

## 足す・変える部品

```
packages/
  shared/src/
    jstDate.ts                          # 変える: jstTimeOf(instant) → 'HH:mm'（日本時間の時と分。Intl.DateTimeFormat はモジュールの先頭で 1 つ）
    reasons.ts                          # 変える: DUTY_CHANGED、DUTY_ALREADY_DONE、NOT_TODAY_DUTY、ADMIN_RECORD_GUIDE、JOIN_FAMILY_FIRST（足りないものだけ）
    messages.ts                         # 変える: 上の理由の文言と、記録の返事・確認の文言（functional-spec.md の C10）
    api-types.ts                        # 変える: RecordDutyRequest（{ version }）、RecordDutyResponse（Duty）
  backend/src/
    lib/promise.ts                      # 足す（U6 で新設）: settle ユーティリティ。Promise を catch 付きで一時保持し、待たずに終わる経路で「未処理の拒否」にならないようにする（reliability-design.md「名前の Query の置き方」）
                                        #   type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }
                                        #   function settle<T>(p: Promise<T>): Promise<Settled<T>>
                                        # packages/backend/src/ に既存の settle の実装はないことを grep で確認済み（Minor 2/3）
    entries/line.ts                     # 変える: postback の accepts に parseRecordCommand を足す。LINE_EVENT_DONE に action を足す。起動時に onDutyRecorded の登録の口を用意（U8 向け）
    entries/api.ts                      # 変える: POST /v1/duties/:dutyId/record の追加。onDutyRecorded の登録の口
    handlers/line/recordCommand.ts      # 足す: parseRecordCommand（厳密な正規表現）、MAX_RECORD_CHOICES = 12
    handlers/line/recordHandler.ts      # 足す: 1 対 1 の入口 → record.list / record.do → reply（返事の組み立て、LINE_REPLY_FAILED）
    handlers/line/postbackHandler.ts    # 変える: 記録の操作なら handleRecord、そうでなければ今までの handleGroupEvent
    handlers/calendar/recordDuty.ts     # 足す: 確かめの順番、dutyId の形、本文の遅延した読み込みと zod
    services/oneToOneGate.ts            # 足す: authorizeChild(lineUserId) → child / admin / outsider
    services/recordingService.ts        # 足す: recordDuty、listTodayRecordableDuties（C8 の記録の窓口。calendarService.ts を import しない）
    services/dutyRecordedHook.ts        # 足す: onDutyRecorded、notifyDutyRecorded（dutyReassignedHook.ts と同じ形）
    services/lineApiService.ts          # 変える: buildTextMessage、buildRecordCarousel（altText 必須。LINE の SDK は入れない）
    repositories/calendarRepository.ts  # 変える: getMonthState、listDutiesOn、buildRecordItems、buildUnitPriceGuard（既存の findDuty、buildMonthGuard、writeTransaction を使う）
    lib/dynamoClient.ts                 # 変える: tables.calendar()、tables.choreTypes() のコメント（line も持つ）。関数の中身は変えない
  frontend/src/
    pages/CalendarPage.tsx、DayDetail.tsx   # 変える: 「やった」ボタン、理由の文字、確認、済の表示
    components/RecordConfirmDialog.tsx      # 足す: 「記録する」「やめる」の確認（フォーカスの移動、Esc、aria-busy）
    api/client.ts                           # 変える: recordDuty
    theme.ts と theme の単体テスト          # 変える: U6 の画面の色と大きさの確かめ（NFR9.7）
scripts/
  setup-rich-menu.ts                    # 足す: リッチメニューの設定・確認・取り消し（--env 必須。トークンは SSM か環境変数。LINE の SDK なし）
infrastructure/lib/
  app-stack.ts                          # 変える: line の環境変数 CALENDAR_TABLE、CHORE_TYPES_TABLE。line のロールに Calendar と ChoreTypes の許可（下）
  （data-stack.ts は変えない）
infrastructure/test/                    # 変える: line の権限の確かめ（NFR4.63、NFR4.64）、U6 の前後で構成が変わらないこと（NFR1.25）
docs/contract-changes-u6.md             # 足す: 契約への追加の一覧（functional-spec.md の約束。options.route はログの印として載せる）
README.md                               # 変える: リッチメニューの設定・確認・取り消し、3 秒の測り方（NFR7.30、NFR10.7）
```

## 部品の分け方と頼り方

| 部品 | 頼る先 | 頼らない先 |
|------|-------|-----------|
| `recordCommand`（`parseRecordCommand`） | `LineEvent` の型、`POSTBACK_DATA_MAX_LENGTH`（`groupCommand.ts`） | DynamoDB、時計（純粋な関数。`accepts` と `postbackHandler` の両方が使う） |
| `postbackHandler` | `recordCommand`、`recordHandler`、`groupEventHandler` | — |
| `recordHandler` | `oneToOneGate`、`recordingService`、`choreTypeService.list`、`lineApiService.reply` と組み立ての関数 | `push`・`multicast`・`broadcast`、`NotificationGroups`、`calendarService` |
| `oneToOneGate` | `familyMemberService.findUserByLineId` | `Calendar`、`ChoreTypes`（利用者の分けだけ） |
| `recordingService`（C8 の記録の窓口） | `calendarRepository`、`choreTypeService.getCurrentUnitPrice`、`dutyRecordedHook`、`shared/jstDate` | `calendarService`（U5 の保存・計画。`line` のバンドルが太るため）、`userRepository` を直接（窓口を通す。ADR-001） |
| `handlers/calendar/recordDuty` | `requireMembership`、`recordingService`、`params`（`requireDutyIdParam`） | `requireAdmin`（付けない。本人の確かめは `recordingService`） |
| `calendarRepository` | `dynamoClient`（`tables.calendar()`）。種類の確かめの項目だけ `tables.choreTypes()` のキーを知る | `ChoreTypes` の中身を読まない（ConditionCheck の項目を組み立てるだけ） |
| `choreTypeService` | 既存どおり | `recordingService`（逆向きには頼らない） |

- `entries/line.ts` は `choreTypeService` の `remove` が使う `calendarPort` を取り付けない（`line` は種類を消さない）。`calendarService` を読み込まないので、U4 の `choreTypeService → calendarPort → calendarService` の輪も起きない

## 障害の波及範囲と失敗の範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `Calendar` テーブル | 「やった」の返事と記録、画面の記録が使えない（`line` の再送か、もう一度押す） | 友だち登録、家族、招待、お知らせ先、種類の一覧・登録・変更、`Users` の読み取り |
| `ChoreTypes` | 記録ができない（単価と名前が読めない。書く前に失敗し、何も書かれない）。管理者・家族外への案内は動く | 案内の返事、`Calendar` の読み取りだけの操作 |
| `Users` の索引（`lineUserId-index`） | 「やった」の返事が出ない（利用者が決められない。再送） | 画面の記録（セッションから決める） |
| `ProcessedLineEvents` | `begin` が失敗すると 500 で何も処理しない（再送）。`markDone` が失敗すると 500（記録は 1 件のまま） | 画面の記録 |
| LINE の API（reply） | 返事が届かない。記録は残る（`LINE_REPLY_FAILED`） | 記録、画面 |
| `line` の Lambda | 「やった」のすべて | 画面用 API（`api` の Lambda）での記録 |
| `api` の Lambda | 画面での記録 | LINE での記録 |

- 影響の範囲は 1 つの家族の中（キーが家族）。1 つの家族の問題が別の家族に及ぶことはない
- 記録の失敗は「もう一度押す」か「LINE の再送」で収まる作り。縮退の運転（古い内容で記録する）はしない
- 記録は 1 つの取引なので、「一部だけ書かれた」状態は残らない（`reliability-design.md`）

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 受け口の確かめの順番、`accepts`、data の厳密な形（NFR4.53〜NFR4.55） | `entries/line.ts`（順番は変えず `accepts` だけ足す）、`recordCommand.ts` |
| 1 対 1 の利用者の分け（NFR4.56） | `oneToOneGate.ts` |
| 権限は裏側が決める、返事は本人にだけ（NFR4.57〜NFR4.59） | `recordingService.ts`、`recordHandler.ts`、`lineApiService.ts`（`reply` だけ） |
| 画面用 API の確かめの順番（NFR4.60〜NFR4.62） | `handlers/calendar/recordDuty.ts`、`recordingService.ts` |
| `line` の最小権限と環境変数（NFR4.63、NFR4.64、NFR5.10） | `app-stack.ts`、`infrastructure/test` |
| 秘密の扱い（NFR5.10〜NFR5.12） | `scripts/setup-rich-menu.ts`、`logger.ts`、gitleaks |
| 取引、読み直し、二重押し（NFR2.33〜NFR2.36） | `calendarRepository.ts`（項目の組み立て、`writeTransaction`）、`recordingService.ts`（判定の順番とやり直し） |
| 失敗の分け方（NFR2.37、NFR2.38） | `recordHandler.ts`（(a)(b)(c)）、`entries/line.ts`（`release`、`markDone`） |
| フック（NFR2.39） | `dutyRecordedHook.ts` |
| 日本時間（NFR11.5、NFR11.6） | `shared/jstDate.ts`、入口で 1 回だけ取る `now` |
| ログ（NFR2.40〜NFR2.43、NFR7.32） | `recordingService.ts`、`recordHandler.ts`、`entries/line.ts`（`action`） |
| 量と費用（NFR1.23〜NFR1.28、NFR3.7〜NFR3.10） | `recordingService.ts`、`calendarRepository.ts`（読み方）、`lineApiService.ts`（reply だけ）、`recordCommand.ts`（`MAX_RECORD_CHOICES`） |
| 速さの測り方（NFR7.25〜NFR7.31） | README の手順書、測定の記録（Build and Test）、`REPORT` の `Init Duration` |
| 筋書きと 80% のカバレッジ（NFR8.11、NFR8.12） | `test/u6-recording/*`（前提データで「済」「×」・確定・時計・単価を用意） |
| 色と大きさ（NFR9.6、NFR9.7） | `lineApiService.ts` の組み立て、`theme` の単体テスト、画面の筋書き |
| リッチメニュー（NFR10.6、NFR10.7、NFR1.28） | `scripts/setup-rich-menu.ts`、README |

## 他の単位との約束

- **U7（管理者の取り消し・×・確定）**: 担当を書き換えるときの条件（`dutyId` と `version`、必要な状態、月の確定の ConditionCheck）は U6 と同じ。「済」を取り消して「未」に戻すとき、記録の項目（`recordedAt`、`recordedBy`、`unitPrice`）を消すか残すかは U7 が決める。U6 は取り消し後の「未」にもう一度記録できる（更新式は `SET` で 3 項目を必ず書くので、残っていても上書きされる）。管理者が「済にする」ときの単価は、その時点の `getCurrentUnitPrice`（FR6.3）。月の確定は `M#<month>#S` の `confirmed` を変えるだけで、U6 の月の ConditionCheck がそのまま効く
- **U8（引き受け）**: 引き受けで担当が変われば `version` が増えるので、U6 の古い選択肢のボタンは `DUTY_CHANGED` で出し直しになる。U8 は `onDutyRecorded` を**`api` と `line` の両方の起動の枠**で登録する（記録はどちらでも起きる）。通知は「届けば取り下げる」ためで、最後の守りは U8 の引き受けの条件（担当が「未」のまま、`version` が申し出のときのまま）にある
- **U9（お小遣いの額）**: 「済」の担当の `unitPrice` を種類ごとに足して額を出す。月は担当の `date` の月で数え、`recordedAt` の日付では数えない。U6 は金額や回数を別に保存せず、ログにも金額を残さない
- **U10（作り手への知らせ）**: 15 分以内の知らせの対象に、次のイベントを入れる: `DUTY_RECORD_REJECTED`（`reason = INTERNAL`）、`REQUEST_ERROR`（`line`・`api`）、`LINE_REPLY_FAILED`、`DUTY_RECORDED_HOOK_FAILED`、`LINE_EVENT_RELEASE_FAILED`。名前と形は U10 まで変えない（`observability-design.md`）。U6 は指標とアラームを足さない
- **Build and Test**: 3 秒の測定（NFR7.25〜NFR7.30）の表、送信数の前後の比較（NFR1.27）、`line` のバンドルの大きさの前後を、成果物に残す。環境変数や設定を手で書き換えない

## Infrastructure Design へ渡すこと

| 項目 | 内容 |
|------|------|
| 新しいテーブル・Lambda・索引 | なし。`DataStack` は変えない。`AppStack` の props にはすでに `calendar` と `choreTypes` がある（U4、U5） |
| 環境変数（`line` の Lambda） | **`CALENDAR_TABLE`**（`props.calendar.tableName`）、**`CHORE_TYPES_TABLE`**（`props.choreTypes.tableName`）の 2 つだけ。秘密の情報は入れない。`api` の環境変数は変えない |
| `Calendar` への許可（`line` のロール） | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:UpdateItem`、`dynamodb:ConditionCheckItem`。リソースはテーブルの ARN だけ（索引の ARN は足さない） |
| `ChoreTypes` への許可（`line` のロール） | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:ConditionCheckItem`。リソースはテーブルの ARN だけ |
| 足さない許可 | `Calendar` と `ChoreTypes` への `PutItem`、`DeleteItem`、`BatchGetItem`、`BatchWriteItem`、`Scan`、`dynamodb:*`。`Users` の `familyId-index` の Query。`jwt/*` の SSM パラメータ。別のサービスの許可。`line` の既存の許可は増やさない。`api` のロールは変えない |
| `TransactWriteItems` | 許可の名前はない。項目ごとの許可（`Calendar` の `UpdateItem`、`Calendar` と `ChoreTypes` の `ConditionCheckItem`）で確かめられる |
| CDK のテスト | (1) `line` の `Calendar` と `ChoreTypes` の許可が上の表と一致、(2) 足さない許可が含まれない、(3) 既存の `line` の許可と `api` の許可が U6 の前後で同じ、(4) 環境変数のキーが期待どおり、(5) ステージングの `line` が本番のテーブルの ARN を含まない、(6) テーブル・Lambda・ログのグループ・指標・アラームの数が U6 の前後で同じ、(7) `line` の同時実行数・メモリ・時間切れが U1 のまま、(8) `Calendar` が本番で `RETAIN` |
| メモリ・時間切れ | 256 MB、30 秒、ARM64 のまま。測定で 3 秒を超えたときだけ、512 MB への引き上げを検討する（無料枠の中に収まるかを確かめる） |
| 監視 | メトリクスフィルターもアラームも足さない（U10）。ログの保管は 30 日のまま |
| 費用 | 月約 0.003 ドル（約 0.5 円）で、月 1 円に満たない見込み（`scalability-design.md`）。reply のみで LINE の無料のメッセージ数を使わない。新しい有料のサービスはない。U5 の最初の請求の確認（`Calendar` の行）に、U6 の増分を含めて見る |
| リッチメニュー | 環境ごとの公式アカウントに別々に設定する（`--env staging` / `--env production` の指定が必須。既定で本番を選ばない）。メニューは「やった」のボタン 1 つで、押すと postback `action=record.list` を送る。トークンは環境ごとの SSM（`line/channel-access-token`）か、実行する人の環境変数。値はスクリプトにも README にも書かない（例は `<作り物の値>`）。ステージングで動作を確かめてから本番に設定する。設定・確認・取り消し・Webhook の再送が有効なことの確認を README に書く（NFR10.7） |
| 配備の順番 | `AppStack` の更新だけ（`DataStack` に変更なし）。ステージングで確かめてから本番へ。**コードが変わる反映は、`line` と `api` の冷たい起動を作る機会にもなる**（測定の手順で使う。環境変数や設定を手で書き換えない） |
| 元に戻す手順 | コードと権限は前の版に戻して再反映する（追加した環境変数・許可が消える）。記録済みのデータは `Calendar` に残り、読み書きしても壊れない（項目の形は U5 のまま）。リッチメニューは README の取り消しの手順で外す |

## Sources

- `construction/u6-recording/nfr-requirements/*.md`
- `construction/u6-recording/functional-design/functional-spec.md`、`entities.md`、`rules.md`
- `inception/domain-design/components.md`（ADR-001、Entity Ownership）
- `inception/contract-design/contract-summary.md`（C1、C3、C6、C7、C8、C10）
- `construction/u5-assignment-calendar/nfr-design/logical-components.md`（形の手本と他の単位との約束）
- 既存コード（読むだけ）: `entries/line.ts`、`handlers/line/postbackHandler.ts`、`groupCommand.ts`、`services/groupCommandGate.ts`、`calendarService.ts`、`choreTypeService.ts`、`repositories/calendarRepository.ts`、`lib/dynamoClient.ts`、`lib/logger.ts`、`infrastructure/lib/app-stack.ts`、`scripts/`（既存のスクリプトの置き場）

## Assumptions & Open Questions

- ファイルの分け方は目安で、コード生成の計画で決めます
- [assumption] `scripts/setup-rich-menu.ts` の置き場所と実行のしかた（`npx tsx` など）は、既存の `scripts/`（シェルのスクリプトだけ）に合わせてコード生成で決めます。LINE の SDK と新しい依存は足しません
- [assumption] リッチメニューの画像（デザイン）は、秘密の情報を含まない素材として、コード生成の段階で作ります。画像の大きさなどの LINE の仕様は公式の資料で確かめます
- [assumption] `docs/contract-changes-u6.md` に残す契約の追加の一覧は、コード生成で書きます
- [assumption] `entries/api.ts` の `POST /v1/duties/:dutyId/record` のルーティングは、U5 の `router.ts` の `:name` を使う（コード生成で確かめる）
- 家族 4 人の量では `line` の同時実行の上限（U1）で足ります。上限に当たった場合の扱いは U1 のまま（LINE の再送）です
