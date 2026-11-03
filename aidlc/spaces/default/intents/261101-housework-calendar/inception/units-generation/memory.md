<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-02T14:30:27Z — 画面と裏側をまとめた縦切りの単位は、11 個すべて kind を service にした。どの単位も配備する Lambda の処理と画面を両方持ち、ui や library だけの単位がないため（計画の承認で確認）。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-02T14:30:27Z — 一本の列（Q8）と、共有の型を独立した単位にすること（Q7）、加算・減額を外せること（Q4）が食い違ったため、Q9 と Q10 で決め直した。型は U1 に置き、加算・減額は列の最後に置いた。本当に必要な頼り方は dependency の表に残し、あとで並行にするときに使えるようにした。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
