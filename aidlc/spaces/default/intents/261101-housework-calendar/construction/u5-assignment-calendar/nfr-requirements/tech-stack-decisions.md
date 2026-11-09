# 技術の選び方（Tech Stack Decisions）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）で使う技術です。U1〜U4 で決めたもの（TypeScript、React と MUI と LIFF、Node.js の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin、ESLint と Prettier、作り物の秘密の値の置き場所）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。

## U5 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.9 | 割り当てとカレンダーの機能も、先に受け入れ条件（AC3.1.1〜AC3.1.8、AC4.1.1〜AC4.1.7）から Gherkin の筋書きを書き、それが通るまで作る（BDD）。行カバレッジ 80% 以上を、U5 で足したコードを含めて保つ。「済」「×」、確定、引き受けた担当は前提データで用意する | `team.md` の Testing Posture、`stories.md` の INVEST | — |
| NFR8.10 | 日本時間の日付の計算（今日、曜日、月の日数、今月と来月）は、Node.js と画面の標準の `Intl.DateTimeFormat`（`timeZone: 'Asia/Tokyo'`）で行う。新しい日付のライブラリは足さない。日付の計算は `packages/shared` に 1 か所でまとめ、裏側と画面で同じものを使う | 依存を増やさない。日本時間はサマータイムがないので、標準の機能で足りる | date-fns-tz、Luxon（依存が増える） |
| NFR9.5 | カレンダー、日の詳細、割り当ての画面も MUI のテーマ（U1）で、文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上にし、状態は「済」「未」「×」の文字でも出す（AC4.1.7）。確かめ方: (1) テーマの文字と背景の色の組み合わせすべてのコントラスト比を計算する単体テスト（U1 のテーマのテストを広げる）、(2) ボタンとリストの押す場所の最小の大きさがテーマで 44 ピクセル以上に決まっていることを確かめる単体テスト、(3) 状態の文字が出ることを確かめる画面の筋書き。対象の画面: 家族を作る・参加する、家族の設定、お手伝いの種類、カレンダー、日の詳細、割り当て、上書きの確かめ（レビュー） | NFR9、AC4.1.7 | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR8、NFR9、NFR11）
- `inception/user-stories/stories.md`（AC4.1.7）
- `construction/u4-chore-types/nfr-requirements/tech-stack-decisions.md`
- `aidlc/spaces/default/memory/team.md`（Testing Posture）

## Assumptions & Open Questions

- なし
