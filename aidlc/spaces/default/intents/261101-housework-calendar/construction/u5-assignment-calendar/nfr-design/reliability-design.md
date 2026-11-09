# 信頼性の設計（Reliability Design）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の信頼性の要件（NFR2.28〜NFR2.31、NFR6.6、NFR11.4）を、どう作るかを書きます。U2〜U4 の作り（条件つきの TransactWriteItems、`CancellationReasons` の読み分け、競合は読み直して 1 回だけやり直し、ほかの Code は投げ直す）をそのまま使います。テーブルの形とキーは `scalability-design.md` にあります。

## 日本時間の日付（NFR11.4）

`packages/shared/src/jstDate.ts` に、日本時間の日付の計算を 1 か所でまとめます。裏側と画面が同じものを使い、新しい日付のライブラリは足しません（NFR8.10）。

```ts
export interface YearMonth { year: number; month: number }
export declare function jstDateOf(instant: Date): string;                 // 日本時間の 'YYYY-MM-DD'
export declare function parseMonth(raw: string): YearMonth | undefined;   // 'YYYY-MM'、年は 2000〜2100、月は 01〜12
export declare function shiftMonth(month: string, delta: number): string; // 12 月の次は翌年 1 月
export declare function datesOfMonth(month: string): string[];            // 1 日から月末まで
export declare function weekdayOf(date: string): number;                // 0（日）〜6（土）
```

- 「いま」から日本時間の日付を取るところだけ `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', ... }).formatToParts()` を使う。書式の文字列を割らず、年・月・日の部品を読む。整形のインスタンスはモジュールの先頭で 1 つだけ作る（コールドスタートと呼び出しのたびの作り直しを避ける）
- 月の日数・曜日・翌月は、日本時間にかかわらない暦の計算（`Date.UTC` と `getUTCDay`、`getUTCDate`）だけで行う。年を 2000〜2100 に絞ってから `Date.UTC` に渡す（`0050-01` のような年を 1950 年と読み替えない。NFR4.46）
- 「今日」は要求の入口で `now = new Date()` を 1 回だけ取り、`jstDateOf(now)` を `today` として下の層に渡す。保存のやり直し、読み直し、フックを含め、1 つの要求の中では同じ `today` を使う。応答の `today` も同じ値（画面は端末の時計を使わない）
- 今月は `today` の先頭 7 文字、来月は `shiftMonth(今月, 1)`。保存できる月は、この 2 つだけ（BR6.2）
- 日時（`createdAt`、`updatedAt`、U6 以降の `recordedAt`）は UTC の ISO 8601。担当の日付だけが日本時間の文字列。画面で時刻を出すときは、`Asia/Tokyo` の時:分にする

確かめ方（単体テスト、NFR11.4）:

- UTC の 15:00（日本時間の翌日 0:00）の前後の 1 ミリ秒で、今日が変わること
- 2028 年の 2 月（うるう年）が 29 日、2027 年の 2 月が 28 日。30 日の月と 31 日の月
- 12 月の次の月が翌年 1 月、1 月の前の月が前年 12 月
- `2027-13`、`2027-1`、`0050-01`、`2101-01`、`1999-12` が `parseMonth` で断られること

## 割り当ての保存の全体の流れ（NFR2.28、NFR2.29、BR6.5〜BR6.8）

保存は「いまの担当と、作るべき担当を比べて、違うところだけを直す」作りです（BR6.18）。何度保存しても、また途中で止まっても、いまの状態に対して同じ結果に収まります。

1. 入口の確かめ（`security-design.md` の順番）を通す
2. 読む（強い整合性、同時に）: 月の Query（割り当て・担当・月の状態）、C7 の種類の一覧、C6 のメンバー一覧（子供の表示名を応答に入れるためだけ）、本文に出てくる `childUserId`（重複なし）ごとの `Users` の GetItem
3. 行を整える（同じ種類と子供の行を 1 行にまとめ、曜日の重なりを 1 つにする）。そのあと、次の順に**全行をまとめて**確かめる（BR6.3 の並び。根拠は `security-design.md`）: (a) 種類が C7 の一覧にない行が 1 つでもあれば 404 `NOT_FOUND` → (b) 「使わない」の種類の行が 1 つでもあれば 422 `CHORE_TYPE_INACTIVE` → (c) 子供が `Users` の GetItem で見つからない、`familyId` が違う、`role` が `child` でない行が 1 つでもあれば 404 `NOT_FOUND`。子供は結果整合の索引では確かめない
4. 月の状態が確定していれば 409 `MONTH_CONFIRMED`。今月でも来月でもなければ 422 `MONTH_NOT_EDITABLE`。そのあと重なりを探して 422 `ASSIGNMENT_OVERLAP`（BR6.4。作る範囲に入らない日も含め、その月のすべての日で調べる）
5. 計画を立てる（純粋な関数、`assignmentPlanner`）: 作る範囲 → 作るべき担当 → いまの担当との比べ → 「作る」「子供を変える」「消す」の一覧と、確かめの一覧（`changes`）
6. 確かめの一覧が空でなければ、`changesHash` を作る。`confirmedChangesHash` がなければ、または合わなければ、409 `OVERWRITE_CONFIRMATION_REQUIRED`（一覧と `changesHash`）
7. 書く（下のとおり）。担当の書き込みをまとまり（チャンク）に分けて順に書き、最後に割り当てを書く
8. 書き終わったら、月の Query を読み直し、応答の `MonthCalendar` を作る。応答の `children` は、手順 2 の子供ごとの `Users` の強い整合性の GetItem の結果（`displayName` を含む）を、C6 のメンバー一覧に足して作る（同じ `userId` は GetItem の結果を優先）。読み直した担当にいる `childUserId` は、必ず `children` に含まれる（索引が古くて C6 の一覧に出ていない参加直後の子供も、GetItem の結果で補われる）

### 作る範囲と比べ方（BR6.5、BR6.6）

| 条件 | 作る範囲 |
|------|---------|
| 来月 | 1 日から月末（初めての保存でも保存し直しでも） |
| 今月で、割り当ての項目がまだない（初めて） | `today` から月末 |
| 今月で、割り当ての項目がある（保存し直し） | `today` の翌日から月末（今日が月末なら空） |

| いまの担当 | 作るべき担当 | 書くこと |
|-----------|------------|---------|
| なし | あり | 作る（`status = todo`、`origin = rule`、`version = 1`、新しい `dutyId` と引き当て） |
| 「未」で子供が違う | あり | 子供を変える（`origin = rule`、`version + 1`）。変える前の `origin` が `manual` か `swap` なら、確かめの一覧に入れる |
| 「未」で子供が同じ | あり | 何も書かない（`origin` もそのまま） |
| 「未」 | なし | 消す（引き当ても）。`origin` が `manual` か `swap` なら、確かめの一覧に入れる |
| 「済」「×」 | あり・なし | 何も書かない。その日のその種類に新しい担当も作らない |
| 範囲の外 | — | 何も書かない（過ぎた日と今日の担当は変えない。AC3.1.4） |

### チャンクに分ける（NFR2.28）

TransactWriteItems は 1 回に 100 項目までです。書く項目を、確かめの項目も数えて 100 を超えない組に分けます。**項目数は次の 1 つの式で数えます**（performance・scalability の 2 文書も同じ式）。

| 書く操作 | 書く項目 | 数 |
|---------|---------|----|
| 作る | 担当の Put（条件 `attribute_not_exists(sk)`）、引き当て `DID#` の Put（同じ条件） | 2 |
| 消す | 担当の Delete（条件 `status = todo AND version = :読んだ version AND dutyId = :読んだ dutyId`）、引き当て `DID#<dutyId>` の Delete（条件 `attribute_exists(sk)`。担当の Delete と同じトランザクションなので、成否がそろう） | 2 |
| 子供を変える | 担当の Update（`childUserId`、`origin = rule`、`version = version + 1`、`updatedAt`）。条件 `status = todo AND version = :読んだ version AND dutyId = :読んだ dutyId` | 1 |

- `dutyId` の条件は、読んだあとに保存で担当が消され、同じ日・同じ種類に作り直されたとき、キーは同じで `dutyId` だけ新しいため、別の担当を消したり変えたりしないためのもの（PATCH と同じ。`logical-components.md` の約束と揃える）

- 1 つのチャンクの項目数 = 2 ×（作る + 消す）+ 1 ×（変える）+ **確かめ**
- 各チャンクの確かめ = **1 +（そのチャンクの「作る」「変える」に出てくる種類の数）**。1 は月の状態の ConditionCheck（`M#<month>#S`、条件 `attribute_not_exists(confirmed) OR confirmed = :false`）、種類ごとの 1 は C7 の `ChoreTypes` の ConditionCheck（`familyId`、`sk = TYPE#<choreTypeId>`、条件 `active = :true`）。「消す」だけのチャンクには種類の確かめを付けない（使わない種類の古い担当を消せるようにするため。NFR2.29、NFR4.50）
- 条件: 項目数 ≦ 100

```text
// 並べ方は決まった順（消す → 子供を変える → 作る、日付と種類の順）。同じ入力から同じチャンクになる
for op in ops:
    if chunk is not empty and items(chunk + op) + guards(chunk + op) > 100:
        emit(chunk); chunk = []
    chunk.add(op)
emit(chunk)    // items: 作る・消す 2、変える 1。guards: 1 + 作る・変えるに出る種類の数
```

計算の例（4 種類、1 か月分の 124 件を初めて作る。来月の保存）:

- 日付の順に並べるので、どのチャンクにも 4 種類が出る。確かめは 1 + 4 = 5。1 チャンクに入る担当は ⌊(100 − 5) ÷ 2⌋ = 47 件（94 + 5 = 99 項目）
- 124 ÷ 47 = 2.6 なので、チャンクは **3 つ**（47 件、47 件、30 件。項目数は 99、99、65）。担当と引き当ては 248 項目、確かめは 5 × 3 = 15 項目
- 最後の割り当ての書き込み（次の節）が 6 項目（割り当ての Put 1 + 月の確かめ 1 + 種類 4）で、トランザクションは**全部で 4 回**。書き込みの項目は 248 + 15 + 6 = 269 項目
- 種類が 10 個で約 310 件なら、確かめは 1 + 10 = 11、1 チャンクは ⌊89 ÷ 2⌋ = 44 件なので、チャンクは 8 つ（44 件 × 7 と 2 件）、トランザクションは割り当てを入れて 9 回

### 最後に割り当てを書く（NFR2.28、BR6.8）

すべてのチャンクが書けたあとで、割り当ての項目 `M#<month>#A` を Put します（`rules`、`choreTypeIds`、`updatedAt`、`updatedByUserId`）。同じトランザクションに、月の状態の ConditionCheck と、`rules` に出てくる種類ごとの ConditionCheck（`active = true`）を入れます。入力の確かめで `rules` の種類の数を 90 までにしてある（`security-design.md`）ので、項目数は最大でも 1 + 1 + 90 = 92 で 100 に必ず収まり、種類の確かめは**いつも**割り当ての Put と同じトランザクションに入ります（種類の確かめだけの組を前に書く例外はない）。

割り当てを最後にする理由:

- 割り当ての項目があるかどうかが、次の保存の「初めて」か「保存し直し」かを決める（作る範囲が変わる）
- 先に割り当てを書くと、途中で止まったときに「保存し直し」とみなされ、今日の担当が作られないまま残る。最後に書けば、途中で止まったあとの保存は「初めて」のままで、今日から作り直される
- 担当を先に書いて割り当てがない状態は、次の保存が比べて直す（既存の担当は、「未」なら子供を合わせ、「済」「×」ならそのまま）ので、同じ結果に収まる

### 競合と断られ方（NFR2.29、NFR2.31）

トランザクションが断られたら、`CancellationReasons` の Code を見ます。

| Code | 扱い |
|------|------|
| `ConditionalCheckFailed`、`TransactionConflict` | 競合として扱う（下のやり直し） |
| それ以外（`ValidationError`、`ThrottlingError`、`ProvisionedThroughputExceeded`、`ItemCollectionSizeLimitExceeded` など） | 投げ直す。500 `INTERNAL` |

競合のとき:

1. その保存の中のそこまでの書き込みはそのまま残す（書けたチャンクは戻さない）
2. 手順 2（読む）からやり直す。1 回まで（最初を含めて 2 回）
3. やり直しの読み直しの結果で、理由を決める（`today` は同じ値を使う）
   - 月が確定していれば 409 `MONTH_CONFIRMED`（月の確かめで断られたとき）
   - 使う種類が「使わない」になった、または消えていれば 422 `CHORE_TYPE_INACTIVE`
   - 確かめの一覧が変わり、`confirmedChangesHash` が合わなくなっていれば 409 `OVERWRITE_CONFIRMATION_REQUIRED`（新しい一覧と印）。ただし次の**部分集合の規則**を先に当てる
   - どれでもなく（担当が別の要求で変わっただけなど）、計画が立てられれば、そのまま書き直す
4. 2 回目も断られたら、500 `INTERNAL`

**内部のやり直しの部分集合の規則**（`security-design.md` の `changesHash` も参照）:

- 前の試行ですでに書けたチャンクが、手動・引き受けの担当を `origin = rule` に上書きしている。やり直しで作る一覧からは、その担当が消える（`origin` が `rule` になったため）。印を最初の一覧と比べると必ず合わず、人が確かめたのに 409 になってしまう
- そこで、**最初の試行で印が合った（または一覧が空だった）一覧**を、要求の中のメモリに覚える。やり直しで得た一覧が、覚えた一覧の**部分集合**（日付・種類・前の子供・後の子供・`version` の 5 つがすべて同じ行だけでできている。空も部分集合）なら、確かめ済みとして続行する
- 部分集合でなければ（別の人が変えて行の値が変わった、新しい行が増えた）、新しい一覧と印で 409 `OVERWRITE_CONFIRMATION_REQUIRED` を返す。最初の一覧が空で印が要らなかったときは、やり直しの一覧が空のときだけ続行する
- 覚えた一覧は要求の間だけ持ち、保存もログも（個人の行動の量を抑えるため）しない

### 途中で失敗したとき（NFR2.28）

- 500 を返す。画面は「保存できませんでした。もう一度保存してください。一部はすでに書き換わっていることがあり、その場合は確認の一覧が前回より短くなります」と出す（文言は `messages.ts`）。管理者がもう一度保存すれば、同じ結果に収まる
- **手動の再保存では一覧が短くなりうるのは意図した動き**: 前の試行で上書き済みの担当（日ごとに変えた担当、引き受けた担当）は、もう `origin = rule` なので、再保存の確認の一覧に出ない。内部のやり直しの部分集合の規則（上）は同じ要求の中だけで効き、別の要求（人の再保存）は、いまの担当から一覧を作り直す。上書きは前の試行で一覧を見て承認した分なので、見ていない担当が増えることはない（一覧が長くなるのは、別の人が変えたときだけで、その場合は新しい一覧で確かめ直す）
- 1 つ以上のチャンクが書けたあとの失敗は、ログ `ASSIGNMENT_PARTIAL_FAILURE`（書けたチャンクの数、全体の数）を残す。1 つも書けていない失敗は `ASSIGNMENT_REJECTED`（`reason = INTERNAL`）
- 管理者が画面を閉じて保存し直さないと、担当が新旧まざった状態が残る（`ASSIGNMENT_PARTIAL_FAILURE` のログを U10 の知らせの対象にする。それまでは承知のうえで進める）
- 時間の枠: Lambda の時間切れ（30 秒）に近づいたときは、チャンクの途中で止まらないよう、チャンクを書く前に残り時間を見て、5 秒を切っていたら書かずに 500 にする（トランザクションは 1 回ごとに全部か無しか）。1 つのチャンクは約 50 ミリ秒なので、通常は届かない

### U8 のためのフック `onDutyReassigned`（BR6.6）

担当の子供が変わった、または担当が消えたとき、U8 が「代わりにやる」の申し出を取り下げられるよう、U5 は C8 の中に登録の口を用意します。

```ts
export type DutyOrigin = 'rule' | 'manual' | 'swap';

export interface DutyReassignedEvent {
  familyId: string;
  dutyId: string;
  date: string; // 日本時間の YYYY-MM-DD
  choreTypeId: string;
  kind: 'child-changed' | 'deleted';
  fromChildUserId: string;
  toChildUserId?: string; // kind が child-changed のときだけ
  newOrigin?: DutyOrigin; // kind が child-changed のときだけ（rule か manual）
}

export type DutyReassignedHook = (event: DutyReassignedEvent) => Promise<void>;
export declare function onDutyReassigned(hook: DutyReassignedHook): void;
```

- 呼ぶのは、その担当を含むチャンク（または PATCH）が**書けたあと**。担当ごとに順に `await` する
- フックが投げても保存の結果は変えない。`DUTY_HOOK_FAILED`（警告、`dutyId`、`error`）を残す。U8 が入るまでは何も登録されず、何もしない
- フックは「届けば取り下げる」ための通知で、正しさの最後の守りは U8 側にある（書き込みのあとフックの前に落ちると通知が届かない）。U8 は引き受けるときに、担当の `childUserId` と `version` が申し出のときのままかを条件にする（U8 の NFR で決める）
- `origin` の持ち主: `rule` は割り当ての保存が付ける（作る・子供を変える）、`manual` は PATCH が付ける、`swap` は U8 の引き受けが付ける（U8 の書き込みはフックを呼ばない）

## 日ごとの担当の変更（NFR2.30、BR6.9）

1. 管理者・`dutyId` の形（違えば 404）の確かめのあと、`DID#<dutyId>` と担当を GetItem（強い整合性）。ない、または担当の `dutyId` が違えば 404 `NOT_FOUND`。月の確定の判断のために、担当の `month` から `M#<month>#S` も GetItem する（強い整合性。`Calendar` の GetItem は合計 3 回、`Users` の GetItem 1 回は手順 2）
2. 本文を読む（422 `INVALID_REQUEST`）。子供を `Users` の GetItem（強い整合性）で確かめ、その家族の `role = child` でなければ 404
3. 月が確定していれば 409 `MONTH_CONFIRMED`。状態が「未」でなければ 409 `DUTY_NOT_TODO`
4. 同じ子供なら何も書かず、いまの担当をそのまま返す（`version` も増やさない）。手順 3 を先に評価するので、確定した月では同じ子供でも 409 `MONTH_CONFIRMED` を返す（「未」でない担当なら 409 `DUTY_NOT_TODO`）
5. TransactWriteItems（2 項目）: 担当の Update（`childUserId = :c`、`origin = manual`、`version = version + 1`、`updatedAt`）、条件 **`status = todo AND version = :読んだ version AND dutyId = :呼ばれた dutyId`**（`status` は予約語なので名前の置き換えを使う）。月の状態の ConditionCheck（確定していない）。`version` の条件は、GetItem のあとに別の書き込み（U8 の引き受けなど）が入ったときに、その結果を知らずに上書きしないため。`dutyId` の条件は、GetItem のあとに保存で担当が消され、同じ日・同じ種類に作り直されたとき（キーは同じで `dutyId` だけ新しい）、別の担当を変えないため
6. 断られたら、手順 1 からの読み取り（`DID#` と担当の GetItem、強い整合性）をやり直して理由を決める。評価の順は次のとおり:
   - 引き当てか担当がない、または担当の `dutyId` が呼ばれた ID と違う（消えた、または消されて作り直された）→ 404 `NOT_FOUND`
   - 月が確定している → 409 `MONTH_CONFIRMED`
   - 状態が「未」でない → 409 `DUTY_NOT_TODO`
   - どれでもなく、`version` だけが違う（競合）→ 読み直した担当の `version` で手順 4（同じ子供か）から**1 回だけ**やり直す。読み直した担当が、すでに呼ばれた子供なら、書かずにいまの担当を返す。それでも断られたら 500 `INTERNAL`
   - `CancellationReasons` の Code が `ConditionalCheckFailed`、`TransactionConflict` 以外なら、読み直さず投げ直す（500）
7. 書けたら `onDutyReassigned`（`child-changed`、`fromChildUserId` は**書いた直前に読んだ担当の子供**、`newOrigin = manual`）を呼び、`DUTY_CHILD_CHANGED` を残す

手順 1〜3 の判断は、404 → 422 → 404（子供）→ 409 の順に評価する。子供の確かめは `Users` の強い整合性の GetItem 1 回（`familyId` と `role`）。読み取り（担当・メンバー）は同時に行ってよいが、評価の順は変えない（ほかの家族の `dutyId` に対して、本文が誤っていても 404 を返すため。NFR4.52）。

## 読み取りの整合性

- `Calendar` の読み取りは、すべて強い整合性（`ConsistentRead: true`）。表のどの読み取りも GSI を使わない
- 保存の直後に開いたカレンダーが古く見えないのは、書いたあと同じ Query を強い整合性で読むため
- 保存と担当の変更の**子供の確かめ**は、`Users` テーブルの `userId` ごとの強い整合性の GetItem（`familyId` と `role = child` を見る）。結果整合の索引（`familyId-index`）は確かめに使わない
- 範囲の外: C6 のメンバー一覧（Users の GSI を使い、U2 の作りで本人を補う）は、カレンダーの応答に子供の表示名を入れるためだけに使い、結果整合のままで構わない（確かめの根拠にしない）。C7 の一覧は C7 の作りのまま使う

## データと時刻（NFR6.6）

- `Calendar` は本番では `RemovalPolicy.RETAIN`（開発・ステージングは DESTROY）。他のテーブルと同じ `common` の設定（オンデマンド、AWS 管理の暗号化）に揃える
- 割り当て・担当・月の状態はアプリの操作でだけ変わる。本番のデータを手で書き換えない。直す必要があるときは、コードや手順として用意し、通常の流れで反映する
- 時点復旧（PITR）は U1〜U4 と同じく有効にしない（費用 0 円の条件）。データの喪失は RETAIN と、書き込みの条件つきの作りで守る

## 障害のときの振る舞い

| 失敗 | 利用者に見えること | データへの影響 |
|------|-------------------|--------------|
| カレンダーの読み取りが失敗 | 「表示できませんでした。もう一度お試しください」と「読み込み直す」（BR6.16） | なし |
| 保存の途中で失敗 | 500。「保存できませんでした。もう一度保存してください」 | 担当が新旧まざる（もう一度保存して収まる） |
| 保存と記録・引き受け・確定・種類を消すが重なる | 条件で断られ、読み直して理由を返す（409・422）か、1 回やり直して収まる | 「済」の担当、確定した月、引き受けた担当は変わらない |
| フックが失敗 | 画面には見えない | 取り下げ漏れは U8 の引き受けの条件で守る |
| 同じ日に 2 回続けて保存 | 同じ内容なら 2 回目は書くものがなく同じ結果（BR6.18） | なし |

## 筋書きにする競合と失敗（NFR8.9）

- 初めての保存で、今日から月末までの担当ができる。来月は 1 日からできる
- 保存し直しで、過ぎた日と今日と「済」「×」は変わらず、明日以降の「未」だけが作り直される
- 保存し直しで、日ごとに変えた担当と引き受けた担当を上書きするとき、一覧と印が返り、印を付けて送り直すと保存される
- 印を付けて送り直す前に担当が変わると、印が合わず、新しい一覧がもう一度出る
- チャンクの途中で失敗させたあと、もう一度保存すると、担当と割り当てが正しい状態になる（初めての保存でも保存し直しでも）
- 書き込みの直前に記録（「済」）を入れる差し替えで、その担当は変わらず、1 回だけやり直して収まる
- 書き込みの直前に月の確定を入れる差し替えで、409 `MONTH_CONFIRMED` になり、確定した月の担当は変わらない
- 書き込みの直前に種類を「使わない」にすると、422 `CHORE_TYPE_INACTIVE`
- 124 件の初めての保存が 3 チャンク（47、47、30 件）+ 割り当ての 4 回になる（項目数 99、99、65、6）
- 同じ日の同じ種類への担当を 2 つの保存が同時に作ろうとすると、片方の条件で断られ、やり直して収まる（二重にできない）
- PATCH: 書き込みの直前に記録が入ると 409 `DUTY_NOT_TODO`、確定が入ると 409 `MONTH_CONFIRMED`。同じ子供では `version` が変わらない。確定した月に同じ子供を指定しても 409 `MONTH_CONFIRMED`（書き込みなし）
- 応答の `children` に、担当にいるすべての `childUserId` が含まれる。C6 の一覧（索引）がまだ参加直後の子供を返さなくても、`Users` の GetItem の結果で補われて表示名が出る
- PUT: 担当の読んだあとに保存で担当が消され、同じ日・同じ種類に作り直されると、「消す」「子供を変える」は `dutyId` の条件で断られ、作り直された別の担当は変わらない
- コード生成の単体テスト: 条件式・更新式に出る属性名（`status` など）がすべて `ExpressionAttributeNames` で置き換えられていること（決まりは `security-design.md` の「書き込みの条件で守る」）
- PATCH: GetItem のあとに U8 の引き受け（`version` が増え、`origin = swap`、「未」のまま）が入ると、`version` の条件で断られ、読み直して 1 回だけやり直し、読み直した `version` で書ける（引き受けを知らずに上書きしない。`fromChildUserId` は読み直した子供）
- PATCH: GetItem のあとに保存で担当が消され、同じ日・同じ種類に作り直されると、`dutyId` の条件で断られ、読み直しで引き当てがない（または `dutyId` が違う）ので 404 `NOT_FOUND`。作り直された別の担当は変わらない
- PUT の確かめの順番: 1 行目が「使わない」の種類で 2 行目がほかの家族の種類なら 404、1 行目が「使わない」の種類で 2 行目がほかの家族の子供なら 422 `CHORE_TYPE_INACTIVE`。行を入れ替えても同じ応答になる
- PUT: 子供の確かめは強い整合性の GetItem。参加した直後の子供は割り当てられ、ほかの家族の子供と管理者は 404（索引が古くても結果が変わらない）
- PUT: 種類が 91 個になる本文は 422 `INVALID_ASSIGNMENT`。種類が 90 個の保存でも、割り当ての書き込みが 1 回のトランザクションに収まる
- 内部のやり直しで、前の試行が上書きした担当が一覧から消えても、部分集合なので続行して保存できる（409 にならない）。やり直しの間に別の人が担当を変えて行の値が違うときは 409 `OVERWRITE_CONFIRMATION_REQUIRED`
- 途中で 500 になったあとの手動の再保存で、確認の一覧が前回より短くなる（上書き済みの担当が出ない）。意図した動きとして、短い一覧で保存できる
- トランザクションが思いがけない Code で断られると 500（`ThrottlingError` を差し替えて）
- 日本時間の 0 時の前後、うるう年の 2 月、12 月の来月が翌年 1 月

## Sources

- `construction/u5-assignment-calendar/nfr-requirements/reliability-requirements.md`、`security-requirements.md`（NFR4.50、NFR4.51）
- `construction/u5-assignment-calendar/functional-design/rules.md`（BR6.5〜BR6.9、BR6.18）、`functional-spec.md`
- `construction/u4-chore-types/nfr-design/reliability-design.md`（トランザクションの作り、U5 への引き継ぎ）
- `packages/backend/src/services/choreTypeService.ts`（競合の扱いと再試行の形）

## Assumptions & Open Questions

- [assumption] 項目数の式（作る・消す 2、変える 1、各チャンクの確かめ 1 + 種類の数）で、124 件は 3 チャンク + 割り当て 1 回の 4 回、310 件は 8 チャンク + 割り当て 1 回の 9 回です。ConditionCheck も書き込みユニットとして数えます（`scalability-design.md`）
- [assumption] 1 つのチャンクのトランザクションは約 50 ミリ秒です。測定（`performance-design.md`）で違えば、チャンクの大きさと並べ方を見直します
- [assumption] DynamoDB のトランザクションの項目は、同じトランザクションの中で別のテーブル（`Calendar` と `ChoreTypes`）をまたげます
- 保存の途中の失敗を作り手に知らせる仕組みは U10 で入れます。`ASSIGNMENT_PARTIAL_FAILURE` のログの形はそれまで変えません
- 重なった保存（2 つの画面）では、担当が混ざることがあり、次の保存で収まります（チャンクごとに条件で守るため、あとから保存したほうが丸ごと残るとは限りません）。家族に管理者は 1 人なので受け入れます（`rules.md`）
