# 性能の要件 — U10 お知らせ

| ID | 測定できる条件 | 確かめ方 |
|---|---|---|
| NFR7.101 | 外部サービスが正常なとき、予定時刻から60秒以内に最初の送信を試みる。ステージング20回中19回以上。再試行の期限はこの目標とは別に予定時刻から15分未満とする。 | 定時起動と送信開始の時刻差を計測する。冷たい起動も含む。 |
| NFR7.102 | 外部通信・データ取得に無制限の待機を作らない。1回の通信の上限と処理全体の上限を設計で明示し、期限に達した新規送信は0回とする。 | 応答しない依存先・期限直前の時計を差し込む。 |
| NFR7.103 | 既存の画面とLINEの返事の95%が3秒以内という目標を維持する。定時通知処理の起動で利用者向けの処理を同期的に待たせない。 | 既存の回帰とステージングでの同時負荷確認。 |
| NFR11.101 | 日付、予定時刻、再送期限を日本時間で一意に求める。月末、うるう日、年越し、予定時刻直前、15分後ちょうどの判定がすべて正しい。 | 境界ごとの時計固定テスト。 |

負荷の基準は`scalability-requirements.md`。外部サービスの障害は正常時の遅延に混ぜず、`reliability-requirements.md`の失敗として計測する。端末への到達時刻を、配信サービスへの送信時刻や受理時刻から推定して成功とはしない。

## Sources

- `functional-design/functional-spec.md`（F1〜F5）、`functional-design/rules.md`（BR11.1、BR11.8、BR11.9）
- `inception/requirements-analysis/requirements.md`（NFR2、NFR7、NFR11）
- `inception/contract-design/contract-summary.md`（C4、C5）

## Assumptions & Open Questions

None.
