# 技術の選び方（Tech Stack Decisions）— U9 お小遣いの額

U9（`u9-allowance`）で使う技術です。U1〜U8 で決めたもの（TypeScript、React と MUI と LIFF、Node.js 22 の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin（`@amiceli/vitest-cucumber`）、ESLint と Prettier、zod、`Intl.DateTimeFormat` による日本時間の計算、作り物の秘密の値の置き場所）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。U9 は画面（S5）と画面用 API が 1 つで、LINE の入口はありません。

## U9 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.17 | お小遣いの額の機能も、先に受け入れ条件（AC8.1.1〜AC8.1.4、AC5.1.13）から Gherkin の筋書きを書き、それが通るまで作る（BDD。team.md の Testing Posture）。筋書きのもとは、機能設計の候補 S1〜S35（`functional-spec.md`）。行カバレッジ 80% 以上を、U9 で足したコードを含めて保つ。筋書きの道具は Vitest の上の `@amiceli/vitest-cucumber`（U5〜U8 と同じ）。DynamoDB は U5〜U8 までのテストと同じ差し替えで動かし、LINE の API は呼ばない。「済」「未」「×」、抜けた子供、単価の変更、管理者の担当、減額は前提データで用意する。**時計は差し替えで日本時間の境（NFR11.10）を用意する**。加算・減額の差し込み口（BR10.7）は、テスト用の取り付け（S27・S28）と空（S29）の両方で確かめる。作り物の値（`<作り物の値>` の目印）で、ログと応答の許可リストを確かめる（NFR2.76、NFR4.91）。`infrastructure` のテストに、`api` の権限が「差分なし」（または必要な読み取りだけ）であること（NFR4.89）、`line` が変わらないこと（`scheduled` は U10 が足すので対象外）、`RouteResult` の任意の `headers` の追加で既存の入口の応答が変わらないこと、構成の数が変わらないこと（NFR1.36）を足す。3 秒の目標（NFR7.50〜NFR7.52）は自動のテストに入れず、呼び出しの回数の上限（NFR7.55）と並行（NFR7.56）、応答の大きさだけを自動で確かめる。測定は、手順（NFR7.57）を README に書き、結果を Build and Test の成果物に表で残す | team.md の Testing Posture、stories.md の INVEST。時間の目標はネットワークと端末に左右され不安定（U6 の NFR8.12、U8 の NFR8.14 と同じ） | 時間の目標を Vitest に入れる（不安定になる） |
| NFR8.18 | **金額は整数の `number`（円）で持ち、新しい計算の依存を入れない**。単価・回数・小計・合計はすべて整数で、`Number.isSafeInteger` の範囲に収まる（家族 4 人・300 件の量では桁あふれの心配がない）。小数を作る計算（割り算など）を書かない。表示は `Intl.NumberFormat('ja-JP')` で桁区切りにし、「{金額}円」の組み立てと、マイナスの記号つきの表示（「-200円」）は、`packages/shared` の小さな 1 つの関数（金額の表示）にまとめる。画面（S5）、U10 の月末のまとめ（「1,200円」）、U11 の加算・減額の表示が同じ関数を使い、表示が食い違わないようにする。マイナスの記号は半角のハイフン（`-`）で、ICU のバージョンによって別の記号（`−` U+2212 など）にならないことを単体テストで固定する | 依存を増やさない（NFR1.15）。金額の表示を 1 か所にまとめれば、画面・お知らせ・U11 が食い違わない。ADR-005（保存しない）と相性がよい | `decimal.js` などの依存（小数を扱わないので不要）、表示を画面と U10 で別々に書く（食い違う） |
| NFR8.19 | 作りを、読み取りの計算（I/O を持たない関数）と、読み取りの組み立て（窓口）に分ける。(a) `packages/backend/src/services/allowanceService.ts` の中に、「読んだデータ（済の担当、今いる子供、種類、加算・減額の行）から `Allowance[]` を作る」**純粋な関数**（集計・並べ替え・合計・異常の検出）と、読み取りを組み立てる窓口 `getAllowances` を置く。純粋な関数は DynamoDB も時計も呼ばず、前提データだけで単体テストできる。(b) 加算・減額の差し込み口（子供ごとの行を返す関数）は、窓口の引数（既定は空を返す）として受け取る。形（引数・戻り）はコード生成で決め、U11 が「子供ごとの加算・減額の行の配列を返す」だけで取り付けられるようにする（BR10.7、BR10.18）。(c) 型（`AllowanceMonthView`・`Allowance`・内訳の行・加算・減額の行）は `packages/shared/src/api-types.ts` に置き、画面と裏側で同じ型を使う。理由の印・文言（「確定していません」、「今月の記録はまだありません（0 円）」、「お小遣いを表示する子供がまだいません」など）は `messages.ts` に足し、`messages.test.ts` で固定する。(d) 入口は `handlers/allowances/getAllowances.ts` に薄く置き、`entries/api.ts` の振り分け表に 1 行足す（認証 → 月の形 → 窓口の順。NFR4.86）。`Cache-Control: no-store`（NFR4.92）を付けるため、`entries/api.ts` の `RouteResult`（今は `status` と `body` だけ）に**任意の `headers`**（省略可）を足し、`lib/http.ts` の応答の組み立て（`json()` など）が `headers` があるときだけそれを応答に加える。`headers` を持たない既存の入口の応答（ステータス・本文・ヘッダー）は変えない（既存の入口のテストが無修正で通ることで確かめる）。U9 の入口だけが `headers` を返す。(e) 契約の変更は `docs/contract-changes-u9.md` に一覧で残す（`Allowance` の置き換え、`GET .../allowances` の応答の包み直しと `current`、`findDisplayName`・`getFamilyCreatedAt` の追加、`listMembers` の `role: system` への対応（NFR2.73）、`Cache-Control: no-store`（NFR4.92）と、そのための `RouteResult` の任意の `headers` の追加（既存の応答は変えない）） | 計算が I/O から離れれば、境界の場面（S14 の 0 円、S27〜S28 のマイナス、S30 の異常）を速く確かめられる。U5〜U8 の「契約を `docs/contract-changes-u*.md` に残す」形と合わせる | 計算と読み取りを 1 つの関数に混ぜる（テストが DynamoDB の差し替えに頼り、境界の筋書きが重くなる） |
| NFR9.10 | 画面 S5（`AllowancePage`）も MUI のテーマ（U1）で、文字と背景の色の差を 4.5:1 以上、押す場所を 44×44 ピクセル以上にし、状態を色だけで伝えない（NFR9、AC4.1.7）。対象: [<]・[>] の月の移動、「読み込み直す」、「戻る」、S1 の「お小遣い」の入口、子供ごとの行。(a) **自分の行（子供が見るとき）** は、太字と緑の枠に加えて、見出しに「（あなた）」の文字を添える（色だけで伝えない。BR10.11）。緑の枠と背景の色の差は 3:1 以上にする（文字以外の部分の目安。WCAG の非テキストのコントラスト）。(b) 「確定していません」「確定済み」は文字で出す（BR10.9）。(c) 「記録がありません（0 円）」と「0円」は文字で出す（BR10.10）。(d) マイナスは「-200円」と記号つきで出し、色（赤など）だけで伝えない。(e) 無効な [<] [>]（`firstMonth`・`lastMonth` の端）は、押せないだけでなく**無効の状態を支援技術にも伝える**（`disabled` か `aria-disabled="true"`）。(f) 名前・種類の名前は HTML として差し込まない（NFR4.92） | NFR9 と同じ考え。U5 の NFR9.5、U6 の NFR9.7、U7 の NFR9.8 を S5 に広げる | — |
| NFR9.11 | S5 の構造と読み上げ。(a) 見出し: ページの見出し（h1）は「{年}年{月}月のお小遣い」で、[<]・[>] は **読み上げ用の名前**を持つ（`aria-label` 「前の月」「次の月」。表示の記号だけに頼らない）。確定の表示（「確定していません」「確定済み」）は見出しのすぐ下に置く。(b) 子供ごとの行の見出しは h2 で、名前と合計（例 「太郎 1,400円」）を含む。内訳の行は**リスト**（`ul`／`li`）で、見える文字（「皿洗い 100円 x 8回 = 800円」）と読み上げの名前を食い違わせない（見える文字を `aria-label` で別の文に置き換えない）。(c) 読み込み中は `role="status"`（または `aria-live="polite"`）で「読み込み中」を伝え、失敗は `role="alert"` で「表示できませんでした。もう一度お試しください」を伝える。月を移して答えが届いたときは、見出しの更新が読み上げに伝わる（見出しを含む領域を `aria-live="polite"` にする）。(d) キーボードだけで、[<]・[>]・「読み込み直す」・「戻る」が順番に操作でき、フォーカスの表示が見える。月を移したあと、フォーカスは押したボタンに残る（無効になった端のボタンを押した直後にフォーカスが消えないよう、端で無効になるときは、反対側の移動ボタンか見出しにフォーカスを移す）。(e) 長い名前（全角 20 文字）、内訳 20 行、幅 360 ピクセルの端末でも、横スクロールなしで読める（折り返す）。文字を 200% に拡大しても情報が欠けない | NFR9、AC4.1.7。WCAG の達成基準に合わせた書き方だが、合格の判断は自動のテストだけでは足りない（下の NFR9.12 と Open Questions） | — |
| NFR9.12 | S5 のアクセシビリティの確かめ方。(1) テーマの文字と背景の色の組み合わせすべてのコントラスト比を計算する単体テスト（U1 のテーマのテストを S5 の色〔自分の行の緑の枠を含む〕に広げる）。(2) ボタンの押す場所の最小の大きさがテーマで 44 ピクセル以上に決まっていることを確かめる単体テスト。(3) 画面の筋書き（Testing Library の役割での検索）で、h1・h2・リスト・ボタンの名前、端のボタンの無効（`disabled` か `aria-disabled`）、`role="status"`・`role="alert"`、「（あなた）」、確定の文字、マイナスの記号の表示を確かめる。(4) ステージングで、作り手がスマートフォンの読み上げ（iPhone の VoiceOver など）を使い、S5 を開く・月を移す・失敗を起こして「読み込み直す」を押す、を一通り操作し、読み上げが画面と食い違わないことを確かめる。結果を Build and Test の成果物に短く残す | team.md の Testing Posture。アクセシビリティの全体の確認には、支援技術での手の確認が要る | 自動のテストだけで済ませる（読み上げの順番や言い方は自動では確かめきれない） |
| NFR10.11 | U9 は新しい環境ごとの設定（公式アカウント・チャネル・SSM パラメータ・リッチメニュー）を足さない。U9 は画面用 API だけで、LINE に何も送らないので、**LINE の無料のメッセージ数の枠や、環境ごとの公式アカウントの用意とは関係がない**（team.md の Deployment の確かめるべきこと〔環境ごとの公式アカウント〕は、U9 では対象外）。ステージングと本番の違いは、U1 で決めた `api` の環境変数（テーブル名・SSM の接頭辞・`ENV`）で吸収される。`main` に取り込むとステージングに自動で反映し、本番は作り手が確認してから反映する（team.md の Deployment）。U9 の確認は、ステージングで NFR7.50〜NFR7.52 の測定と、AC8.1.1〜AC8.1.4・AC5.1.13 の動き（記録した直後に額が増える、取り消すと戻る）を画面から行ってから本番に反映する | team.md の Deployment、NFR10 | — |
| NFR10.12 | 反映と元に戻し方（U9 の分）。U9 の反映は、通常の流れに従う。元に戻すときは、前の版のコードを通常の流れで再び反映する。**データの移行も削除も要らない**: U9 は何も書かず、新しい保存先もない。前の版に戻すと、S1 の「お小遣い」の入口と S5 の画面、`GET /months/{month}/allowances` が消えるだけで、記録・状態・単価のデータはそのまま残る。応答の形の置き換え（`Allowance[]` から `AllowanceMonthView`）は、まだ誰も使っていない入口なので、元に戻しても使う人への影響がない。U10 が `getAllowances` を使い始めたあとに U9 だけを戻すのは、U10 を先に戻す必要がある（順序の注意） | team.md の Deployment（元に戻す手順は後の段階で決めるとされたものの、U9 の分）。データに破壊的な変更がない | — |

## U9 で変えないこと（引き継ぎの確認）

- 依存は足さない（NFR1.15 の引き継ぎ）。zod・MUI・`@aws-sdk/*`・Vitest・`@amiceli/vitest-cucumber` は既にある
- 日本時間の計算は U5 の `packages/shared` の関数を使う（NFR8.10、NFR11.10）
- 読み取りは、既存の `calendarRepository.loadMonth`（強い整合性、続きのページを読む）と、`familyMemberService.listMembers`、`choreTypeService.list` を使い、新しい DynamoDB のコードを足すのは、`findDisplayName`・`getFamilyCreatedAt` に必要な最小の読み取りだけにする（`Families` の項目は 1 回の読み取りで済ませる。`familyMemberService` で `listMembers` の内部を、家族の項目とメンバーを返す `loadFamilyAndMembers` に分け、`listMembers` はメンバーだけを返す薄い関数にして既存の戻りを変えない。`allowanceService` はそれを 1 回呼び、メンバーと家族の作成時刻を同じ結果から取る。`getFamilyCreatedAt` が別に読む形にはしない。NFR7.55）
- 理由の印と文言は `packages/shared` の `messages.ts`・`messages.test.ts` に足す（機能設計の引き継ぎ）
- 画面の月の移動の部品は、次の 1 つの作りに決める（NFR2.72、BR10.12）: ボタンは読み込み中も押せる、押すたびに目標の月だけを更新、250 ms の静まりのあと最新の目標の月だけを要求、要求に連番を付け古い番号の答えを捨てる、同じ月の要求が飛んでいる間は重ねて出さない
- 金額の表示の関数は `packages/shared` にまとめ、U10・U11 が使い回す（NFR8.18）

## Sources

- `inception/requirements-analysis/requirements.md`（NFR1、NFR8、NFR9、NFR10）
- `inception/user-stories/stories.md`（AC8.1.1〜AC8.1.4、AC5.1.13、AC4.1.7、AC8.2.6・AC8.2.7）
- `construction/u9-allowance/functional-design/rules.md`（BR10.5、BR10.7〜BR10.11、BR10.14、BR10.18）、`functional-spec.md`（テストの筋書きの候補、契約への追加、次の単位への引き継ぎ、画面の文言）、`entities.md`
- `construction/u3-notification-group/nfr-requirements/tech-stack-decisions.md`（NFR1.15、NFR10.4、NFR10.5）
- `construction/u5-assignment-calendar/nfr-requirements/tech-stack-decisions.md`（NFR8.9、NFR8.10、NFR9.5）
- `construction/u6-recording/nfr-requirements/tech-stack-decisions.md`（NFR8.11、NFR8.12、NFR9.7、NFR10.6、NFR10.7）
- `construction/u7-review-confirm/nfr-requirements/tech-stack-decisions.md`（NFR8.13、NFR9.8、NFR10.8）
- `construction/u8-swap/nfr-requirements/tech-stack-decisions.md`（NFR8.14〜NFR8.16、NFR9.9、NFR10.9、NFR10.10）
- `aidlc/spaces/default/memory/team.md`（Testing Posture（BDD・80%・CI）、Deployment、Code Style）
- 既存コード（読むだけ）: `package.json`（Vitest、`@amiceli/vitest-cucumber`、カバレッジ）、`services/calendarService.ts`（読み取りの組み立ての形）、`services/familyMemberService.ts`（`listMembers`）、`services/choreTypeService.ts`（`list`）、`entries/api.ts`（振り分け表）、`packages/shared/src/api-types.ts`・`messages.ts`

## Assumptions & Open Questions

- [assumption] 金額の表示の関数（NFR8.18）を `packages/shared` に置くのは、U10 の月末のまとめと U11 の表示が同じ表示になるためです。置き場所と名前は、コード生成で既存の `messages.ts` の並びに合わせて選びます
- [assumption] 加算・減額の差し込み口の形（引数・戻り）は、機能設計（BR10.7）のとおりコード生成で決めます。U11 の `adjustments` の行の中身（`adjustmentId`・`amount`・`reason`）は機能設計で決まっているので、型は U9 で作り、U11 は取り付けるだけにします
- [assumption] 緑の枠と背景の色の差の 3:1 は、NFR9（文字の 4.5:1、押す場所 44×44 ピクセル）に書かれていない、文字以外の部分への目安です。満たせない色なら、枠の太さか色を変えます。ただし、枠は「（あなた）」の文字と太字に加えた補助で、色だけに頼らない（NFR9.10 の (a)）
- [assumption] アクセシビリティの合格は、自動のテスト（NFR9.12 の (1)〜(3)）と作り手の手の確認（(4)）の範囲です。WCAG への適合の全体の確認には、支援技術での確認と専門家のレビューが要り、このステージでは保証しません
- [assumption] 画面の月の移動で、端のボタンが無効になるときのフォーカスの移し方（NFR9.11 の (d)）は、U5 の月の移動の部品（既存）がすでに同じ問題を解いていれば、それに合わせます。U5 の部品を読んでから、コード生成で選びます
- [assumption] `Intl.NumberFormat('ja-JP')` の出力は、Node.js 22 と対象のブラウザで同じ（半角のハイフンと半角のカンマ）という前提で、単体テストで固定します（NFR8.18）。ブラウザ側の出力が違うことがあれば、自前の整形に切り替えます
