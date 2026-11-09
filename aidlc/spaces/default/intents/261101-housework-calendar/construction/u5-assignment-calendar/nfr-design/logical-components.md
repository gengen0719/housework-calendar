# 論理コンポーネント（Logical Components）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）で足す・変えるコードと構成の部品です。U1〜U4 の構成に足します。カレンダーの部品は、家族とメンバー（C6）とお手伝いの種類（C7）に頼り、逆向きには頼りません（ADR-001）。

## 足す・変える部品

```
packages/
  shared/src/
    jstDate.ts                          # 足す: jstDateOf、parseMonth、shiftMonth、datesOfMonth、weekdayOf、今月と来月の判定（画面と裏側で同じもの。NFR8.10、NFR11.4）
    reasons.ts                          # 変える: INVALID_MONTH、INVALID_ASSIGNMENT、ASSIGNMENT_OVERLAP、OVERWRITE_CONFIRMATION_REQUIRED、MONTH_CONFIRMED、MONTH_NOT_EDITABLE、DUTY_NOT_TODO、PAYLOAD_TOO_LARGE（足りないものだけ）
    messages.ts                         # 変える: 上の理由の文言、「この月の割り当てはまだありません」「担当なし」「確定済み」、保存の 500 の文言（一部はすでに書き換わっていて、確認の一覧が前回より短くなることがある）など（functional-spec.md の C10）
    api-types.ts                        # 変える: Duty（origin、version、recordedByName を足す）、MonthCalendar、AssignmentRule、AssignmentView、OverwriteChange、OverlapItem
  backend/src/
    entries/api.ts                      # 変える: 4 つの操作の追加。REQUEST_END に coldStart と dutyCount。起動時に本物の C8 の窓口を取り付ける（composition root）
    handlers/calendar/{getCalendar,getAssignment,saveAssignment,changeDutyChild}.ts  # 足す: 確かめの順番、zod、本文の遅延した読み込み
    services/calendarService.ts         # 足す: C8（getMonthCalendar、getAssignment、saveAssignment、changeDutyChild、isChoreTypeAssigned）と onDutyReassigned の登録
    services/assignmentPlanner.ts       # 足す: 純粋な関数（行を整える、重なり、作る範囲、いまとの比べ、確かめの一覧、チャンクの分け方）
    services/changesHash.ts             # 足す: computeChangesHash（security-design.md）
    services/calendarPort.ts            # 変える: 仮の窓口は残し、本物は composition root で setCalendarPort する（U4 の choreTypeService → calendarPort → calendarService の輪を作らない）
    repositories/calendarRepository.ts  # 足す: Calendar テーブル（月の Query、割り当て・月の状態の GetItem、担当の引き当て、トランザクションの組み立て、種類の使用の Query）
    lib/dynamoClient.ts                 # 変える: tables.calendar（環境変数 CALENDAR_TABLE）
    lib/logger.ts                       # 変える: setRequestMetrics（dutyCount）の追加。伏せ字と LogData の型は U4 のまま
  frontend/src/
    pages/CalendarPage.tsx              # 足す（U1 のカレンダーの枠を置き換える）: 日ごとの縦の一覧、前後の月、今日の位置、割り当てがない月の表示、読み込み直し
    pages/DayDetail.tsx                 # 足す: 日の詳細（状態、時刻、記録した人、管理者の「担当を変える」）
    pages/AssignmentPage.tsx            # 足す（React.lazy）: 種類ごとの子供と曜日の入力、先月と同じにする、重なりの一覧
    components/OverwriteConfirmDialog.tsx # 足す（React.lazy）: 変化の一覧と「この内容で保存する」
    theme.ts と theme の単体テスト      # 変える: コントラストと押す場所の確かめを全画面に広げる（NFR9.5）
    api/client.ts                       # 変える: 4 つの操作
infrastructure/lib/
  data-stack.ts                         # 変える: Calendar テーブル（索引なし、本番は RETAIN）
  app-stack.ts                          # 変える: 環境変数 CALENDAR_TABLE、api のロールの許可（下）
docs/contract-changes-u5.md             # 足す: 契約への追加の一覧（functional-spec.md の約束）
```

## 部品の分け方と頼り方

| 部品 | 頼る先 | 頼らない先 |
|------|-------|-----------|
| `calendarService`（C8） | `calendarRepository`、`choreTypeService.list`（C7）、`familyMemberService.listMembers`（C6。表示名のため）と C6 の窓口の「利用者 1 人を強い整合性で読む」（`Users` の GetItem。子供の確かめ。なければコード生成で足す）、`assignmentPlanner`、`changesHash`、`shared/jstDate` | `choreTypeRepository` と `userRepository` を直接読まない（窓口を通す。ADR-001） |
| `assignmentPlanner`、`changesHash`、`jstDate` | なし（純粋な関数。DynamoDB にも時計にも触れない。今日は引数） | — |
| `calendarRepository` | `dynamoClient`（`tables.calendar()`）。種類の確かめの項目だけ `tables.choreTypes()` のキーを知る | `ChoreTypes` の中身を読まない（ConditionCheck の項目を組み立てるだけ） |
| `choreTypeService` | `calendarPort`（窓口の形だけ） | `calendarService`（輪になるので直接 import しない） |

## 障害の波及範囲と失敗の範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `Calendar` テーブル | カレンダー・割り当て・日の詳細・担当の変更が使えない。U4 の種類を消す操作は、確かめができないので失敗する（消さない側に倒れる） | 友だち登録、家族、招待、お知らせ先、種類の一覧・登録・変更・使わない |
| `ChoreTypes`（C7） | カレンダーの表示が失敗する（種類の名前がないため）。割り当ての保存も失敗する | 担当の子供の変更（PATCH は種類を読まない） |
| `Users` の索引（C6 のメンバー一覧） | カレンダーの表示と保存が失敗する（子供の名前を応答に入れるため） | 担当の子供の変更 |
| `Users`（GetItem） | 保存と担当の変更が失敗する（子供の確かめ）。カレンダーの表示は動く | 表示、割り当ての画面を開く |
| `api` の Lambda | 画面用 API のすべて | LINE 用の受け口（`line` の Lambda）。U5 は `line` に触れない |

- 影響の範囲は 1 つの家族の中（キーが家族）。1 つの家族の問題がほかの家族の担当に及ぶことはない（家族は 1 つの前提でもキーで分かれている）
- 失敗は「画面に再読み込み」か「もう一度保存」で収まる作り。縮退の運転（古い内容を見せる）はしない（家族が最新の「済」を見るため）

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 確かめの順番と家族の範囲（NFR4.42〜NFR4.45、NFR4.52） | `handlers/calendar/*`、`calendarRepository.ts`（キーに家族） |
| 入力の確かめ（NFR4.46〜NFR4.48） | `handlers/calendar/*` の zod、`shared/jstDate.ts` の `parseMonth`、本文の遅延した読み込み |
| 画面の文字の出し方（NFR4.49） | `CalendarPage.tsx`、`DayDetail.tsx`、`AssignmentPage.tsx`（React の文字） |
| 書き込みの条件（NFR4.50）、チャンク（NFR2.28、NFR2.29） | `assignmentPlanner.ts`（分け方）、`calendarRepository.ts`（トランザクション）、`calendarService.ts`（順番とやり直し） |
| 上書きの確かめの印（NFR4.51） | `changesHash.ts`、`calendarService.ts` |
| 競合の扱い（NFR2.30、NFR2.31） | `calendarRepository.ts`（`CancellationReasons` の読み分け）、`calendarService.ts` |
| ログ（NFR2.32、NFR7.24） | `lib/logger.ts`、`calendarService.ts`、`entries/api.ts` |
| 読み方（NFR1.20〜NFR1.22） | `calendarRepository.ts`（Query、担当を探す GetItem 2 回と月の状態の GetItem、絞り込み付きの Query） |
| テーブルと権限（NFR1.19、NFR3.6、NFR6.6） | `data-stack.ts`、`app-stack.ts` |
| 日本時間（NFR8.10、NFR11.4） | `shared/jstDate.ts`、要求の入口で 1 回だけ取る `now` |
| 速さの測り方（NFR7.20〜NFR7.23） | 手順書と測定のスクリプト（ステージング）、`REQUEST_END` の `coldStart` |
| 筋書きと 80% のカバレッジ（NFR8.9） | `test/u5-assignment-calendar/*`（前提データで「済」「×」・確定・引き受けを用意） |
| 色と大きさの確かめ（NFR9.5） | `theme` の単体テスト、画面の筋書き |

## 他の単位との約束

U6〜U8 が同じテーブルに書くとき、次を守ります（コード生成でも、各単位の設計でも引き継ぐ）。

- 担当を書き換えるときは、`version = version + 1` と、条件 `version = :読んだ値`（必要な状態の条件を足す）を使う
- **担当を変えるときは `dutyId` と `version` を条件にする**（`dutyId = :呼ばれた dutyId AND version = :読んだ値`）。担当のキーは日付と種類なので、消されて作り直されても同じキーになる。`dutyId` を条件にしないと、GetItem のあとに作り直された別の担当を変えてしまう
- 同じトランザクションに、月の状態の ConditionCheck（`M#<month>#S` が確定していない）を入れる
- 担当の状態の変更（記録、取り消し、×）は `origin` を変えない。U8 の引き受けは `origin = swap` と `childUserId` を変える。U5 の `onDutyReassigned` は呼ばない
- 担当を新しく作る・消すのは U5 だけ。作る・消すときは引き当て（`DID#<dutyId>`）を同じトランザクションで作る・消す
- `isMonthConfirmed`、`listDoneDuties`、`listDutiesOn` は、`M#<month>#` の Query から作る（`listDutiesOn(date)` は `begins_with(sk, 'M#<month>#D#<date>#')`）。LINE 用の Lambda が読むときは、その単位が許可を足す

## Infrastructure Design へ渡すこと

| 項目 | 内容 |
|------|------|
| 新しいテーブル | `Calendar`。パーティションキー `familyId`（文字列）、ソートキー `sk`（文字列）。オンデマンド、AWS 管理の暗号化、TTL なし、**GSI も LSI も作らない**、本番は `RemovalPolicy.RETAIN`（開発・ステージングは DESTROY）。`DataStack` の `calendar` として公開し、`AppStack` の props に `calendar: dynamodb.ITable` を足す |
| 環境変数 | `api` の Lambda に `CALENDAR_TABLE`（`props.calendar.tableName`）。`line` の Lambda には足さない |
| `Calendar` への許可（`api` のロール） | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:PutItem`、`dynamodb:UpdateItem`、`dynamodb:DeleteItem`、`dynamodb:ConditionCheckItem`。リソースはテーブルの ARN だけ（索引の ARN は不要） |
| `ChoreTypes` への許可の追加（`api` のロール） | **`dynamodb:ConditionCheckItem`**（U4 では「U5 で足す」と書いてある。割り当てのトランザクションが種類の `active = true` を確かめる）。U4 の許可（`GetItem`、`Query`、`PutItem`、`UpdateItem`、`DeleteItem`）はそのまま |
| `Users` への許可（`api` のロール） | **追加なし**。子供の確かめ（`userId` ごとの強い整合性の `GetItem`）に使う許可は、`app-stack.ts` の `api` のロールにすでにある（`GetItem`、`PutItem`、`UpdateItem` がテーブルの ARN に付いている）。索引（`familyId-index`）は確かめに使わない |
| 足さない許可 | `Scan`、`BatchGetItem`、`BatchWriteItem`、`line` のロールへの `Calendar` の許可 |
| 新しい Lambda・サービス | なし。`api` の Lambda に足す（同時実行数の上限 5 の中。NFR3.6）。メモリは 256 MB のまま（測定で 3 秒を超えたときだけ見直す） |
| 監視 | メトリクスフィルターもアラームも足さない（U10）。ログの保管は 30 日のまま |
| 費用 | 月約 0.3 円（約 0.002 ドル）で、月 1 円に満たない見込み（`scalability-design.md`）。ConditionCheck も書き込みユニットに数えて見積もり直した。新しい有料のサービスはない。PITR は有効にしない |
| **最初の請求で確かめる** | オンデマンドの読み書きは無料枠の対象外なので、U5 は毎月約 0.002 ドルかかる。「請求額 0 円」が成り立つのは、端数の丸めで 0.00 ドルになる前提のとき。**U5 を配備した後の最初の月次の請求で、`Calendar` の読み書きの行が 0.00 ドルか、載っても 0.01 ドル程度かを確かめる**（Infrastructure Design で確かめ方と、超えたときの扱いを決める） |
| 配備の順番 | `DataStack`（`Calendar` を作る）→ `AppStack`（環境変数と許可）。1 回の更新で足すテーブルは 1 つなので、CloudFormation の制約には当たらない |

## Sources

- `construction/u5-assignment-calendar/nfr-requirements/*.md`
- `construction/u5-assignment-calendar/functional-design/functional-spec.md`、`entities.md`、`rules.md`
- `inception/domain-design/components.md`（ADR-001、Entity Ownership）
- `inception/contract-design/contract-summary.md`（C1、C8、C10）
- `construction/u4-chore-types/nfr-design/logical-components.md`（形の手本と U5 への引き継ぎ）
- `packages/backend/src/services/calendarPort.ts`、`choreTypeService.ts`、`infrastructure/lib/data-stack.ts`、`app-stack.ts`

## Assumptions & Open Questions

- ファイルの分け方は目安で、コード生成の計画で決めます
- [assumption] `calendarPort.ts` の仮の窓口は、U4 のテストが引き続き使えるよう残します。本物は `entries/api.ts` の起動時に取り付け、テストは `setCalendarPort` で差し替えます
- `docs/contract-changes-u5.md` に残す契約の追加の一覧は、コード生成で書きます
