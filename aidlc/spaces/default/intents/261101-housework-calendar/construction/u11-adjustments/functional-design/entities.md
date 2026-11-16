# U11 加算・減額のエンティティ

## Entity Model

以下のYAMLがデータ形の正本です。所有者は「お小遣い」。金額の合計は保存しません。

```yaml
entities:
  - name: Adjustment
    description: 子供の指定月に対する1件の加算または減額
    owner: お小遣い
    attributes:
      - { name: adjustmentId, type: identifier, required: true, unique: true }
      - { name: familyId, type: identifier, required: true, references: Family }
      - { name: childUserId, type: identifier, required: true, references: Member }
      - { name: month, type: year-month, required: true }
      - { name: kind, type: enum, required: true, allowed: [add, subtract] }
      - { name: amount, type: integer-yen, required: true, min: 1, max: 正確に扱える整数の上限 }
      - { name: reason, type: text, required: true, min: 1, max: 100, constraints: NFC正規化して前後空白除去後のUnicodeコードポイント数 }
      - { name: createdAt, type: instant, required: true }
      - { name: createdBy, type: identifier, required: true, references: Member }
    constraints:
      - childUserIdはfamilyId内の子供。createdByは操作時点の同じ家族の管理者
      - monthは既存カレンダーが受け付ける年月。日付境界は日本時間
      - amountは常に正。表示・集計時にkindで符号を付ける
      - reasonは空白だけ不可。改行は許すがその他の制御文字は断る
      - 存在するか削除済みかだけ。金額・理由の更新操作は設けない
    relationships:
      - { target: Family, cardinality: many-to-one, direction: AdjustmentからFamily }
      - { target: Member, cardinality: many-to-one, direction: Adjustmentから対象の子供 }
      - { target: MonthState, cardinality: many-to-one, direction: Adjustmentから同じ家族と月の確定状態 }
  - name: AdjustmentOperation
    description: 同じ作成要求の送り直しを1回とする既存の操作記録の用途追加
    owner: お小遣い
    attributes:
      - { name: familyId, type: identifier, required: true }
      - { name: userId, type: identifier, required: true }
      - { name: operationKey, type: identifier, required: true }
      - { name: requestFingerprint, type: digest, required: true }
      - { name: adjustmentId, type: identifier, required: true }
      - { name: result, type: original-success-response, required: true }
      - { name: expiresAt, type: instant, required: true }
    constraints:
      - 家族・操作者・操作の種類・キーの組で一意
      - 正規化後の同じ入力の再送には元の成功結果を返し書き足さない
      - 同じキーで異なる入力は競合。保存先障害では成功記録を単独で残さない
      - 保存期間と失効判定は既存の作成操作の方針を継承しNFR設計で固定
    relationships:
      - { target: Adjustment, cardinality: one-to-one, direction: 作成操作から生成した加算減額 }
external_entities:
  - { name: Family, owner: 家族とメンバー }
  - { name: Member, owner: 家族とメンバー }
  - { name: MonthState, owner: カレンダー }
derived_views:
  - name: AllowanceAdjustmentLine
    fields: [adjustmentId, amount, reason]
    note: amountは符号付き円整数。既存C9の読取形を維持する
```

1件の加算・減額は1家族の1人の子供と1か月に属します。家族・メンバー・月の状態の所有者は変えず、公開窓口を通して確認します。削除後も操作記録の存続期間中は同じ作成要求を復活させません。

## Sources

- `inception/domain-design/components.md` Entity Ownership、お小遣い
- `inception/contract-design/contract-summary.md` C6・C8・C9、FR8.1〜FR8.3
- `functional-design-questions.md` Q1: A

## Assumptions & Open Questions

- [assumption] 既存の月変更の排他制御を、加算・減額の保存境界でも利用できる。具体的な保存方式はNFR設計で確認する。
