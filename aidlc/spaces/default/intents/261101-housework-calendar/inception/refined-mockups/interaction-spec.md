# 操作の決まり（Interaction Spec）

画面とトークで共通して使う部品の決まりです。部品ごとの書き方は `.kiro/knowledge/aidlc-design-agent/component-spec-template.md` に合わせています。もとにしたのは `refined-mockups-questions.md` の回答、`ideation/rough-mockups/wireframes.md`、`ideation/rough-mockups/user-flow.md`、`inception/user-stories/stories.md`、`inception/requirements-analysis/requirements.md` です。

## 共通の決まり

- 操作のあとは、画面の下に短い知らせを 4 秒出す（Q4）。「元に戻す」ボタンは付けない。間違えたときは、下の「間違えたときの直し方」のとおり、もう一度操作して直す（承認前の指示: 「元に戻すは母親の操作だけかと思っていたよ、別につけなくてもいいよ」）
- 元に戻しにくい操作（取り消し、やらなかった、確定、確定の取り消し、割り当ての上書き、加算・減額を消す）は、実行の前に確認の小窓を出す。小窓には「何が・誰の・いつの」が変わるかを書く（`requirements.md` の FR6.2・FR6.4・FR6.5、FR3.3）
- 二重に押しても、操作は 1 回だけ行われる。処理中はボタンを押せない状態にする（`requirements.md` の FR5.3）
- 管理者だけができる操作のボタンは、子供の画面には出さない。出さないだけでなく、裏側でも断る（`requirements.md` の NFR4）
- 確定している月では、変更のボタンを出さず、画面の上に「この月は確定済みです」と表示する（`requirements.md` の FR6.5）

## 間違えたときの直し方

「元に戻す」ボタンはありません。間違えたときは、母親（管理者）が要件の状態の表（`requirements.md` の FR6.1）にある操作で直します。子供は自分の記録を取り消せません（FR6.6）。どの間違いも、確定していない月なら期限なく直せます（FR6.5）。

| 間違い | 直し方 | 直せる人 |
|--------|--------|---------|
| 子供が間違って記録した | 「記録を取り消す」で「未」に戻す | 管理者 |
| 記録を間違って取り消した | 「済にする」で「済」に戻す（時刻と単価は操作した時点のもの。FR6.3） | 管理者 |
| 間違って「済にする」を付けた | 「記録を取り消す」で「未」に戻す | 管理者 |
| 間違って「やらなかったにする」を付けた | 「やらなかったを外す」で「未」に戻す、または「済にする」 | 管理者 |
| 間違って「やらなかったを外す」を押した | 「やらなかったにする」をもう一度付ける | 管理者 |
| 間違って確定した | 「確定を取り消す」（FR6.5） | 管理者 |
| 間違って確定を取り消した | もう一度「この月を確定する」 | 管理者 |
| 加算・減額を間違えた | お小遣いの画面（S5）で、その行の「消す」を押し、入れ直す | 管理者 |
| 担当を間違って変えた | 「担当を変える」でもとの子供に戻す | 管理者 |

---

## 下のタブ

| 項目 | 内容 |
|---|---|
| Component | 下のタブ |
| Description | 画面を切り替える |
| Category | navigation |

### States

| State | Description | Trigger |
|---|---|---|
| default | 母親は「カレンダー」「お小遣い」「設定」、子供は「カレンダー」「お小遣い」 | 画面を開く |
| focus | キーボードで選んでいるタブに枠を出す | Tab キー |
| disabled | なし | — |
| loading | なし | — |
| error | なし | — |
| empty | なし | — |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | navigation の中に、リンクとして並べる |
| Keyboard interaction | Tab で移動、Enter で開く |
| Label / aria-label | 「カレンダー」などの見える名前 |
| Contrast ratio | WCAG AA（4.5:1 文字、3:1 部品） |
| Screen reader | 選んでいるタブを「現在のページ」と読み上げる |
| Focus management | 画面を切り替えたら、その画面の見出しにフォーカスを移す |

---

## カレンダー

| 項目 | 内容 |
|---|---|
| Component | カレンダー |
| Description | 月の担当と状態を日ごとに見せる（`stories.md` の US4.1） |
| Category | display |

### States

| State | Description | Trigger |
|---|---|---|
| default | 日ごとに「お手伝い＝担当（状態）」を表示。子供が見るときは、自分の担当を太字と緑の枠で目立たせる（Q5） | 開く |
| focus | キーボードで選んでいる日に枠を出す | Tab キー、矢印キー |
| disabled | なし | — |
| loading | 枠だけの仮の表示 | 読み込み中 |
| error | 「表示できませんでした。もう一度お試しください」と「読み込み直す」 | 読み込みの失敗 |
| empty | 「この月の割り当てはまだありません」。管理者には「割り当てを入力する」ボタンも出す | 割り当てがない月 |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 表示する月 | 年月 | yes | 今月 | 前へ・次へで切り替える |
| 見ている人 | 管理者 / 子供 | yes | — | 子供のときは自分の担当を目立たせる |
| 確定しているか | boolean | yes | false | true なら「確定済み」を表示 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| mobile (<768px) | 週ごとの縦の一覧。今日の週から表示する |
| tablet (768–1024px) | 7 列の表 |
| desktop (>1024px) | 7 列の表で 1 か月を 1 画面に表示（Q3） |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 表（パソコン）または一覧（スマホ） |
| Keyboard interaction | Tab で日付に入り、矢印キーで日を移動、Enter で日の詳細を開く |
| Label / aria-label | 日付のマスに「1月2日 水曜 皿洗い 太郎 済」のような名前を付ける |
| Contrast ratio | WCAG AA |
| Screen reader | 状態は「済」「未」「やらなかった」と文字で読み上げる。自分の担当は「あなたの担当」と読み上げる |
| Focus management | 最初は月の切り替えにフォーカス |

---

## 担当の行

| 項目 | 内容 |
|---|---|
| Component | 担当の行 |
| Description | 日の詳細で、担当 1 件の状態と操作を見せる（`stories.md` の US5.1・US6.1） |
| Category | display |

### States

| State | Description | Trigger |
|---|---|---|
| default | 「皿洗い 担当: 花子 済 16:42 花子が記録」。あとから記録した場合は「（あとから）」と付ける | 開く |
| focus | 操作のボタンに枠を出す | Tab キー |
| disabled | 確定している月、または操作できない人のときは、ボタンを出さない | 確定・権限 |
| loading | 操作中はボタンを押せない状態にし、「処理中」と表示 | 操作中 |
| error | 「記録できませんでした。もう一度お試しください」を行の下に出す | 操作の失敗 |
| empty | なし | — |

### 状態ごとに出すボタン

| 状態 | 子供（担当本人、今日まで） | 管理者 |
|------|---------------------------|--------|
| 未 | 記録する | 済にする、やらなかったにする、担当を変える |
| 済 | なし | 記録を取り消す、やらなかったにする |
| × | なし（「お母さんが『やらなかった』にしています」と表示） | 済にする、やらなかったを外す |

明日以降の担当には、子供の「記録する」は出さない（`requirements.md` の FR5.5）。

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 一覧の項目。ボタンは button |
| Keyboard interaction | Tab で各ボタン、Enter / Space で押す |
| Label / aria-label | 「1月5日 皿洗いを記録する」のように、何に対する操作かを名前に入れる |
| Contrast ratio | WCAG AA |
| Screen reader | 状態が変わったら知らせとして読み上げる |
| Focus management | 操作のあと、同じ行にフォーカスを残す |

---

## 確認の小窓

| 項目 | 内容 |
|---|---|
| Component | 確認の小窓 |
| Description | 元に戻しにくい操作の前に、何が変わるかを見せる |
| Category | feedback |

### States

| State | Description | Trigger |
|---|---|---|
| default | 見出し（「この記録を取り消しますか？」）、変わる内容（お手伝い・子供・日付）、「やめる」と実行のボタン | 対象の操作を押す |
| focus | 開いたら「やめる」にフォーカス | 開く |
| disabled | 実行中は実行のボタンを押せない | 実行中 |
| loading | 「処理中」 | 実行中 |
| error | 小窓の中に失敗の理由を出し、閉じない | 実行の失敗 |
| empty | なし | — |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | dialog |
| Keyboard interaction | Esc で閉じる（やめるのと同じ）、フォーカスは小窓の中だけを回る |
| Label / aria-label | 見出しを小窓の名前にする |
| Contrast ratio | WCAG AA |
| Screen reader | 開いたら見出しと内容を読み上げる |
| Focus management | 閉じたら、押したボタンにフォーカスを戻す |

---

## 短い知らせ

| 項目 | 内容 |
|---|---|
| Component | 短い知らせ |
| Description | 操作がうまくいったことを、画面の下に 4 秒出す（Q4） |
| Category | feedback |

### States

| State | Description | Trigger |
|---|---|---|
| default | 「1月5日の皿洗いを記録しました」のように、何をしたかを 1 文で出す。ボタンは付けない | 操作の成功 |
| focus | なし（押すものがないため） | — |
| disabled | なし | — |
| loading | なし | — |
| error | 失敗したときは短い知らせではなく、操作した場所の近くに失敗の理由を出す | 操作の失敗 |
| empty | なし | — |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | status（aria-live="polite"） |
| Keyboard interaction | なし（読むだけで、操作は含まない） |
| Label / aria-label | 知らせの文をそのまま名前にする |
| Contrast ratio | WCAG AA |
| Screen reader | 出たときに読み上げる |
| Focus management | 知らせが出てもフォーカスは動かさない。知らせが消えても、変わった結果は画面の表示（担当の状態など）に残る |

---

## トークのボタン（公式アカウントの返事）

| 項目 | 内容 |
|---|---|
| Component | トークのボタン |
| Description | 公式アカウントの返事に付けるボタン（担当の選択、引き受ける、申し出をやめる）（`stories.md` の US5.1・US7.1） |
| Category | input |

### States

| State | Description | Trigger |
|---|---|---|
| default | ボタンの文字は「1/8 皿洗い」「引き受ける」など、何を押すかがわかる短い言葉 | 返事が届く |
| focus | LINE の画面の決まりに従う | — |
| disabled | トークのボタンは押せなくすることができないため、押されたときに断りの返事をする | — |
| loading | なし（3 秒以内に返事する。`requirements.md` の NFR7） | — |
| error | 「この月は確定済みです」「この申し出はもうありません」など、理由を返事する | 押した時点で受け付けられない |
| empty | 選べる担当がないときは、ボタンを出さずに理由を返事する | — |

ボタンは、押した時点の状態で受け付けるかどうかを決める。ボタンが出たあとに月が確定された、担当が変わったなどの場合は、受け付けずに理由を返事する（`requirements.md` の FR5.4・FR7.5）。

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | LINE のボタンの決まりに従う |
| Keyboard interaction | LINE の画面の決まりに従う |
| Label / aria-label | ボタンの文字そのもの。日付と内容を必ず入れる |
| Contrast ratio | LINE の表示に従う |
| Screen reader | ボタンの文字が読み上げられるので、絵文字だけのボタンにしない |
| Focus management | LINE の画面の決まりに従う |
