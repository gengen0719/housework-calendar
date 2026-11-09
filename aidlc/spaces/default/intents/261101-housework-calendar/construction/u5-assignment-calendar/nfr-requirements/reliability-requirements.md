# 信頼性の要件（Reliability）— U5 割り当てとカレンダー

U5（`u5-assignment-calendar`）の信頼性の要件です。U1〜U4 の要件（NFR2.1〜NFR2.27、NFR6.1〜NFR6.5、NFR10.1、NFR10.2、NFR11.1〜NFR11.3）をそのまま使います。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.28 | 割り当ての保存は、担当の書き込みをまとまり（1 回の操作に入る数）に分けて先に行い、最後に割り当ての記録を書く。途中で失敗したら 500 を返し、もう一度保存すれば同じ結果に収まる（BR6.8、BR6.18） | まとまりの途中で失敗させ、もう一度保存して、担当と割り当てが正しい状態になること |
| NFR2.29 | 担当のまとまりの書き込みは、それぞれの担当の条件（「未」で version が同じ、なければ新しく作る）、種類が「使う」、月が確定していない、を条件にする。条件で断られたら、そこで止めて、読み直してから作り直しを最初からもう一度行う（1 回まで）。読み直しで理由を決める: 月が確定していれば 409 `MONTH_CONFIRMED`、種類が「使わない」か消えていれば 422 `CHORE_TYPE_INACTIVE`、上書きの確かめの印が合わなくなっていれば 409 `OVERWRITE_CONFIRMATION_REQUIRED`（新しい一覧と印つき。ただし、前の試行が書き換えた分で一覧が短くなっただけで、確かめた一覧の部分集合なら続行する）。やり直しても断られたら 500 `INTERNAL`（レビュー R-01 の Major、Minor） | 条件を外す差し替えで、それぞれの結果になること |
| NFR2.30 | 担当の変更（PATCH）は、「未」で、読んだ version のままで、呼ばれた dutyId の担当で、月が確定していないことを条件にした 1 回の書き込みで行い、version を 1 増やす。同じ子供への変更は書き込まず、version も増やさない（BR6.9）。条件で断られたら担当を読み直し、消えている（または dutyId が違う）なら 404、月が確定していれば 409 `MONTH_CONFIRMED`、「未」でなければ 409 `DUTY_NOT_TODO` にする。version だけが違うときは読み直した version で 1 回だけやり直す | 書き込みの直前に記録を入れて 409 `DUTY_NOT_TODO`、確定を入れて 409 `MONTH_CONFIRMED`、U8 の引き受け（version が増える）を入れて 1 回のやり直しで書けること、保存で消して作り直して 404 になること。同じ子供で version が変わらないこと |
| NFR2.31 | トランザクションの取り消しは、U2〜U4 と同じく `ConditionalCheckFailed` と `TransactionConflict` だけを競合として扱い、ほかの Code は投げ直す | 単体テスト |
| NFR6.6 | 割り当て・担当・月の状態のデータは、アプリの操作でだけ変わる。本番のデータを手で書き換えない。本番のテーブルは `RemovalPolicy.RETAIN` | CDK の設定で確かめる |
| NFR11.4 | 「今日」「今月」「来月」「曜日」は、裏側の時刻を日本時間（`Asia/Tokyo`）にして決める。画面は応答の `today` を使い、端末の時計を使わない。担当の日付は日本時間の日付の文字列（`YYYY-MM-DD`）で持つ（BR6.5、BR6.6、NFR11） | 日本時間の 0 時の前後（UTC の 15 時）を差し替えた時刻で、今日と作る範囲が正しいこと。うるう年の 2 月、30 日と 31 日の月、12 月の「来月」が翌年 1 月になること（レビュー） |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR6、NFR11）
- `construction/u5-assignment-calendar/functional-design/rules.md`（BR6.5〜BR6.9、BR6.18）
- `construction/u4-chore-types/nfr-requirements/reliability-requirements.md`

## Assumptions & Open Questions

- 保存の途中で失敗したあとは、管理者がもう一度保存するまで、担当が新旧まざった状態になることがあります。画面は 500 のとき「保存できませんでした。もう一度保存してください」と出します。管理者が画面を閉じてしまったときに作り手が気づく仕組み（15 分以内の知らせ。NFR2）は U10 で入れ、`ASSIGNMENT_PARTIAL_FAILURE` のログをその知らせの対象に入れます。U10 までの間は、この穴を承知のうえで進めます（レビュー）
