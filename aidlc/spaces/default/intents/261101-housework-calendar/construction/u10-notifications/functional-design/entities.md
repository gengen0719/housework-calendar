# エンティティ — U10 お知らせ

通知の送信記録は「お知らせ」の部品だけが所有します。担当・家族・金額は、それぞれの持ち主の窓口を通して読みます。

```yaml
entities:
  - name: NotificationTrigger
    description: C5の起動入力。利用者からの要求ではなく信頼する定時処理から受け取る。
    attributes:
      - { name: kind, type: enum, required: true, allowed: [dailyReminder, monthlySummary] }
      - { name: targetDate, type: date, required: true, constraints: 日本時間の実在する日付 }
    constraints:
      - monthlySummaryのtargetDateは月の最終日であること
      - 対象家族は入力から選ばず家族部品の内部列挙から決める
  - name: NotificationDispatch
    description: 家族・通知種類・対象日ごとの論理的な通知と配信状態。
    attributes:
      - { name: familyId, type: opaque-id, required: true, references: Family }
      - { name: kind, type: enum, required: true, allowed: [dailyReminder, monthlySummary] }
      - { name: targetDate, type: date, required: true }
      - { name: scheduledAt, type: instant, required: true }
      - { name: expiresAt, type: instant, required: true, constraints: scheduledAtの15分後 }
      - { name: state, type: enum, required: true, allowed: [prepared, sending, sent, skipped, failed, expired] }
      - { name: destination, type: opaque-id, required: false, constraints: prepared以後は固定しログへ出さない }
      - { name: retryKey, type: opaque-id, required: false, constraints: 同じ通知の再試行で不変 }
      - { name: messageSnapshot, type: text, required: false, constraints: 初回配信準備で固定し再試行では変更しない }
      - { name: leaseOwner, type: opaque-id, required: false }
      - { name: leaseUntil, type: instant, required: false }
      - { name: attempts, type: integer, required: true, default: 0, min: 0 }
      - { name: nextAttemptAt, type: instant, required: false }
      - { name: firstFailureAt, type: instant, required: false }
      - { name: failureReason, type: enum, required: false, constraints: 個人情報を含まない理由の分類 }
      - { name: acceptedAt, type: instant, required: false }
      - { name: providerRequestId, type: opaque-id, required: false, constraints: 配信サービスが受理した要求の識別子 }
    constraints:
      - familyIdとkindとtargetDateの組が一意。月末通知は必ず実在する月末日に正規化する。
      - sentとskippedとfailedとexpiredは終端。定時処理の再起動でpreparedへ戻さない。
      - 有効な所有者だけが条件付きで配信状態を更新する。
      - 保存した本文は通知用の一時的な送信スナップショットであり金額の正本ではない。
  - name: DispatchOutcome
    description: 家族単位の実行結果。永続化する送信記録と実行全体の集計を区別する。
    attributes:
      - { name: outcome, type: enum, required: true, allowed: [sent, skipped, duplicate, retryScheduled, failed, expired] }
      - { name: reason, type: enum, required: false }
relationships:
  - { from: Family, to: NotificationDispatch, cardinality: one-to-many, direction: 家族から送信記録 }
  - { from: NotificationTrigger, to: NotificationDispatch, cardinality: one-to-many, direction: 起動から内部列挙した家族の処理 }
```

家族・メンバー・担当・お小遣いの型の所有権は変更しません。送信記録の保持期間、保存時の保護、索引と再実行の仕組みは後続の設計で具体化します。保持期間を過ぎた古い起動も時刻検証で拒否するため、記録の削除を再送の許可には使いません。

## Sources

- `inception/units-generation/unit-of-work.md`（U10）、`unit-of-work-story-map.md`（US9.1）
- `inception/requirements-analysis/requirements.md`（FR9、NFR2、NFR4、NFR5、NFR11）
- `inception/domain-design/components.md`（送信記録の所有権）
- `inception/contract-design/contract-summary.md`（C4〜C9）
- `functional-design-questions.md`（Q1=A、Q2=A）

## Assumptions & Open Questions

None.
