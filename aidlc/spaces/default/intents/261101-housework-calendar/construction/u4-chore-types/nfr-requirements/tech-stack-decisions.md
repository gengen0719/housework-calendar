# 技術の選び方（Tech Stack Decisions）— U4 お手伝いの種類

U4（`u4-chore-types`）で使う技術です。U1〜U3 で決めたもの（TypeScript、React と MUI と LIFF、Node.js の Lambda、DynamoDB、AWS CDK、Vitest と Gherkin、ESLint と Prettier）をそのまま使い、新しい言語・枠組み・サービス・依存は足しません。

## U4 で決めること

| ID | 決めたこと | 理由 | ほかの案 |
|----|-----------|------|---------|
| NFR8.7 | お手伝いの種類の機能も、先に受け入れ条件（AC2.1.1〜AC2.1.7）から Gherkin の筋書きを書き、それが通るまで作る（BDD）。行カバレッジ 80% 以上を、U4 で足したコードを含めて保つ | `team.md` の Testing Posture | — |
| NFR8.8 | C8 `isChoreTypeAssigned` の仮の窓口は、テストで「使われている」を返すように差し替えられる形（部品の窓口を引数で渡す）にする。AC2.1.6 の断る流れを U4 で確かめるため | 機能設計のレビュー R-07 | U5 まで確かめない |
| NFR9.4 | お手伝いの種類の画面も MUI のテーマ（U1）で、文字と背景の色の差 4.5:1 以上、押す場所 44×44 ピクセル以上にする。「使わない」は色だけでなく文字で出す | NFR9 | — |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR8、NFR9）
- `construction/u1-skeleton-family/nfr-requirements/tech-stack-decisions.md`
- `aidlc/spaces/default/memory/team.md`（Testing Posture）
- `construction/u4-chore-types/functional-design/reviews/review-01.md`（R-07）

## Assumptions & Open Questions

- なし
