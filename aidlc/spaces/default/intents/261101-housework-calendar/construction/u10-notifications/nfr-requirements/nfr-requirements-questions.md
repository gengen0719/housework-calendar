# 品質・運用の質問 — U10 お知らせ

## 引き継ぐ条件

- 自動再送は予定時刻から15分以内だけ。対象の子供がいない月末は送らない（機能設計Q1=A、Q2=A）。
- 通知の送信失敗と裏側のエラーは、15分以内に作り手へ知らせる（FR9.5、NFR2、`inception/delivery-planning/bolt-plan.md`のB10）。
- 家族へのLINE通知とは別に、作り手が受け取れる経路を使う。
- 受け取り方法は要件と外部依存の計画で未決のまま残っているため、ここで決める。実際のメールアドレスや秘密のURLをこのファイルに記載する必要はない。

## Q1 作り手への障害通知を何で受け取るか

- A. メール（推奨）。家族へのLINE配信とは独立した経路にする。配備時に受信用アドレスを環境設定へ登録し、購読の確認と受信テストを行う。
- B. Slack。配備時に作り手が管理する通知先を環境設定へ登録し、受信テストを行う。連携用の秘密情報はリポジトリへ保存しない。
- X. Other (please specify)

[Answer]:A

## Sources

- `inception/requirements-analysis/requirements.md`（FR9.5、NFR2、Open Questions）
- `inception/delivery-planning/bolt-plan.md`（B10）
- `inception/delivery-planning/external-dependency-map.md`（作り手への知らせの受け取り先）
- `construction/u10-notifications/functional-design/functional-design-questions.md`、`functional-spec.md`、`rules.md`
