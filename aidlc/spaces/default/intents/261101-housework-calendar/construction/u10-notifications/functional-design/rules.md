# 業務の決まり — U10 お知らせ

```yaml
rules:
  - id: BR11.1
    statement: 日本時間の予定時刻と有効期間を検証する。
    category: validation
    applies_to: NotificationTrigger
    trigger: 起動時および各送信試行直前
    logic: IF 日付や種類が不正、月末でないまとめ、予定時刻前、または予定時刻の15分後以降 THEN 外部送信を行わない。
    violation: 不正入力は失敗として記録し作り手へ知らせ、期限切れはexpiredとして記録する。
    source: [NFR11, FR9.5, Q1]
  - id: BR11.2
    statement: 家族の範囲と送信先を内部で決める。
    category: authorization
    applies_to: NotificationDispatch
    trigger: 家族の処理開始
    logic: IF 家族が内部列挙され登録済みの送信先がある THEN その家族のsystem文脈でC6〜C9を呼ぶ。送信先なしならskippedとする。
    violation: 外部入力による家族指定は受け付けず、ほかの家族の内容を混ぜない。
    source: [FR1.5, NFR4]
  - id: BR11.3
    statement: リマインドは未確定の月で担当がある日だけ送る。
    category: policy
    applies_to: dailyReminder
    trigger: 16時の配信準備と送信直前
    logic: IF 月が未確定かつその日の担当が1件以上ある THEN 状態を含む担当一覧を1通にまとめる。未だけに絞らない。
    violation: 確定済みまたは担当なしならskipped。送信済み通知は作り直さない。
    source: [FR9.1]
  - id: BR11.4
    statement: 月末まとめは確定状態にかかわらず最新の計算結果から作る。
    category: calculation
    applies_to: monthlySummary
    trigger: 月末21時の配信準備
    logic: IF 対象月末ならC9のgetAllowancesを呼び各子供の合計を1通へまとめる。0円と負の金額をそのまま表示し加算減額も計算結果に従う。
    violation: 計算失敗や一部データの読込失敗では部分的な金額を送らない。
    source: [FR9.2, FR6.5, FR8.1, FR8.2]
  - id: BR11.5
    statement: 対象の子供がいないまとめは送らない。
    category: policy
    applies_to: monthlySummary
    trigger: 金額計算完了
    logic: IF C9の返す子供の配列が空 THEN skippedとする。全員0円でも子供がいる場合は送る。
    violation: 空のまとめを送らない。
    source: [FR9.2, Q2]
  - id: BR11.6
    statement: 同じ論理通知は1回だけ配信する。
    category: constraint
    applies_to: NotificationDispatch
    trigger: 重複起動、並行実行、再試行
    logic: IF 家族と種類と対象日が同じ THEN 一意な記録と所有権の条件付き取得を使い、既存の終端結果を返す。同じ通知の送信先・本文・再試行キーを変えない。
    violation: 他の所有者が処理中なら送らない。保存に失敗したときは外部送信を始めない。
    source: [FR9.1, FR9.2, FR9.5]
  - id: BR11.7
    statement: 配信受理後の記録失敗でも同じ内容とキーで照合する。
    category: constraint
    applies_to: sending
    trigger: 応答不明または送信後の処理中断
    logic: IF 受理の結果が不明 THEN 所有期限後に同じキーと内容で再試行し、配信サービスの重複受理を確認した場合もsentに進める。別キーで送り直さない。
    violation: 確認できなければ未確認の失敗として作り手へ知らせる。配信受理と利用者への到達は同一とみなさない。
    source: [FR9.5, NFR2]
  - id: BR11.8
    statement: 自動再試行は有効期限と回数の両方で制限する。
    category: policy
    applies_to: NotificationDispatch
    trigger: 一時的な送信失敗
    logic: IF 再試行可能かつ次の試行が予定時刻の15分後より前 THEN 同じ通知を上限回数内で再試行する。入力不正や無効な宛先など回復しない失敗は自動再試行しない。
    violation: 期限に達したらexpired、回数上限または回復しない失敗ならfailed。
    source: [FR9.5, Q1]
  - id: BR11.9
    statement: 送信失敗を15分以内に作り手へ知らせる。
    category: policy
    applies_to: 送信処理全体
    trigger: 読込失敗、保存失敗、外部送信失敗、起動欠落
    logic: IF 失敗や期限内の起動欠落を検知 THEN 家族への通知と独立した経路で作り手へ知らせる。初回失敗時点で検知し再試行終了まで待たない。
    violation: お知らせ先のグループや子供へ運用上の失敗通知をプッシュしない。
    source: [FR9.5, NFR2]
  - id: BR11.10
    statement: 月末まとめは送信後の修正で送り直さない。
    category: policy
    applies_to: sent
    trigger: 記録や加算減額の後日変更
    logic: IF まとめがsent THEN 送信記録を再び配信可能にしない。アプリの金額はC9が読むたびに計算する。
    violation: 変更を理由に再通知しない。
    source: [FR9.3]
  - id: BR11.11
    statement: 自発的な家族への通知を2種類に限定する。
    category: constraint
    applies_to: 配信内容
    trigger: 配信準備
    logic: IF dailyReminderまたはmonthlySummary THEN それぞれを1通とする。家族あたり月最大31通と1通としエラー通知や補足を別通で追加しない。
    violation: 上限に収まらない本文は送信前に拒否して作り手へ知らせる。黙って子供や担当を省略しない。
    source: [FR9.4, NFR1]
  - id: BR11.12
    statement: 配信準備後に送信先が変わった場合は古い先にも新しい先にも自動再送しない。
    category: authorization
    applies_to: preparedとsending
    trigger: 外部送信直前
    logic: IF 保存した送信先が現在の登録と異なるまたは登録が消えた THEN 未送信通知をskippedとし、送信結果が不明の場合はfailedとして作り手へ知らせる。
    violation: 同じ通知を別グループへ複製しない。送信先変更と外部配信の完全な原子性は保証しない。
    source: [FR1.5, FR9.5, NFR4]
```

| 決まり | 要点 |
|---|---|
| BR11.1〜BR11.2 | 日本時間と内部の家族範囲を使う |
| BR11.3〜BR11.5 | リマインドと月末まとめの対象 |
| BR11.6〜BR11.8 | 並行実行・中断・期限内再試行 |
| BR11.9〜BR11.12 | 作り手への知らせ、再通知抑止、通数、宛先変更 |

## Sources

- `inception/units-generation/unit-of-work.md`、`unit-of-work-story-map.md`（U10、US9.1）
- `inception/requirements-analysis/requirements.md`（FR1.5、FR6.5、FR8、FR9、NFR1、NFR2、NFR4、NFR11）
- `inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`（所有権とC4〜C9）
- `functional-design-questions.md`（Q1=A、Q2=A）

## Assumptions & Open Questions

None.
