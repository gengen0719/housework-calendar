<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations

- 2026-11-15T23:54:41Z U11: Q1のA回答に従い理由を100文字までとした。金額の業務上限なし・訂正は削除と入れ直しを既存決定から引き継ぎ、再質問していない。月確定との保存競合と作成再送の重複防止を保存境界の要件として明示し、具体方式はNFR設計へ渡す。

- 2026-11-15T06:57:45Z [unit u10-notifications] — Q1=A、Q2=Aを記録。再送の有効区間は予定時刻以上・15分後未満とし、対象の子供が空なら月末まとめを省略する。全員0円のケースとは区別する。
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
