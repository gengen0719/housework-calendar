# 監視設計 — U10 お知らせ

NFR2.107〜NFR2.109、NFR4.105、NFR6.102を対象とする。ログは次の許可項目だけから作る。

| 項目 | 内容 |
|---|---|
| event | NOTIFY_STARTED、NOTIFY_SENT、NOTIFY_SKIPPED、NOTIFY_RETRY、NOTIFY_FAILED、NOTIFY_EXPIRED |
| kind / targetDate | 種類と日本時間の対象日 |
| correlationId / familyRef | 実行の相関識別子、非可逆な運用用家族識別子 |
| attempt / elapsedMs | 試行番号、単調時計による非負の経過時間 |
| reason / count | 許可した失敗分類と集計件数 |

本文・名前・金額・送信先・メール・秘密・外部エラーの生データは出さない。詳細異常ログは実行ごと分類ごと20件までとし、省略分を含む総数を集計する。分散追跡を有効にする場合も本文を属性にしない。

## 15分以内に気づくための経路

1. API・LINE・通知の3入口のエラー、初回配信失敗、キューの滞留を独立した監視へ渡す。通知が最後に失敗するまで待たない。
2. 予定起動の完了信号が5分以内にない場合、起動欠落として知らせる。対象家族0件や通知省略でも完了信号を出す。
3. 検知に5分、監視評価と通知へ5分、メール受信へ5分を最大予算とする。ステージングで受信時刻まで測定し、15分を超えれば配備前に未達として扱う。
4. 受信用アドレスは環境設定で指定し、購読確認が済んだことと受信テストを配備手順で確認する。コード生成時に人のアドレスを仮置きしない。
5. 本文の清掃失敗と期限超過の残留、復旧時の期限違反も監視する。運用メールには分類と調査手順への参照だけを入れる。

SLIは初回試行遅延、成功数、失敗数、正常省略数、重複抑止数、期限切れ数、最古の仕事の待ち時間、メール受信遅延。正常省略を成功送信数に足さず、失敗率にも混ぜない。既存入口のエラー通知も同じ運用経路で確認する。

調査手順は、対象日・種類・運用識別子で状態を読む、外部受理が不明かを確認する、期限とキーを維持した復旧だけを行う、という順にする。送信済みや期限切れを直接書き換えて再送しない。

## Sources

- `nfr-requirements/observability-requirements.md`、`reliability-requirements.md`、`security-requirements.md`、`tech-stack-decisions.md`
- `functional-design/functional-spec.md`（F5）、`inception/contract-design/contract-summary.md`（C4、C5）

## Assumptions & Open Questions

None.
