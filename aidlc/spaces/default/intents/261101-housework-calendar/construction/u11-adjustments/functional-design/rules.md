# U11 加算・減額の業務ルール

## Rules

以下のYAMLがルールの正本です。

```yaml
rules:
  - id: BR12.1
    statement: 登録・削除は同じ家族の管理者だけ。対象は同じ家族の子供だけ
    category: authorization
    applies_to: [addAdjustment, deleteAdjustment]
    trigger: すべての変更要求
    logic: IF 認証と家族の所属と管理者の確認が通る THEN 家族を含む条件で対象を探す。登録時は家族とメンバーの窓口で子供を確認する
    violation: 未認証はUNAUTHENTICATED、家族なしはNOT_FAMILY_MEMBER、子供の操作はADMIN_ONLY。他家族や管理者を対象の子供に指定した場合はNOT_FOUND。保存しない
    source: [FR1.7, FR8.2, NFR4]
  - id: BR12.2
    statement: 登録は種類addまたはsubtractと1円以上の整数を受け付ける
    category: validation
    applies_to: Adjustment
    trigger: 登録前
    logic: IF amountが正確に扱える正の整数でkindが許可値 THEN 種類と正の金額を保存し、減額は読取時に負にする。業務上の上限は追加しない
    violation: 金額の空欄・0・負数・小数・文字列・範囲外はINVALID_AMOUNT「金額は1円以上の整数で入力してください」。種類不正はINVALID_INPUT。入力を残し保存しない
    source: [FR8.2, FR8.3]
  - id: BR12.3
    statement: 理由は前後空白を除いて1〜100文字で必須
    category: validation
    applies_to: Adjustment.reason
    trigger: 登録前
    logic: NFC正規化後に前後空白を除去しUnicodeコードポイントで数える。改行以外の制御文字を含まず1〜100文字なら保存する
    violation: 空または空白だけはREASON_REQUIRED「理由を入力してください」。文字列以外・100文字超過・不正な制御文字はINVALID_REASON「理由は100文字以内で入力してください」。入力を残し保存しない
    source: [FR8.2, NFR9, Q1]
  - id: BR12.4
    statement: 確定月の加算・減額は登録も削除もできない
    category: constraint
    applies_to: [addAdjustment, deleteAdjustment]
    trigger: 保存の直前と保存境界
    logic: IF 対象月が未確定のまま変更を確定できる THEN 保存する。確定操作と同時なら一方だけが先に成立する。確定が先なら変更を断り、変更が先ならその変更を含む月を確定する
    violation: MONTH_CONFIRMED「この月は確定済みです」。途中保存は残さない。画面は月状態を再取得して操作を止める
    source: [FR6.5, FR8.2]
  - id: BR12.5
    statement: 合計と内訳と月末まとめに同じ加算・減額を含める
    category: calculation
    applies_to: [getAllowances, monthlySummary]
    trigger: 読取時
    logic: 同じ家族・月の子供ごとに、既存のお手伝い小計の和へ加算のamountを足し減額のamountを引く。理由と符号付き金額とIDを内訳に返す。合計は保存しない。月末まとめも同じ計算窓口を使う。0円未満でも丸めない
    violation: 読取失敗や正確な整数範囲外を0円や一部の合計で置き換えず失敗として返す
    source: [FR8.1, FR8.2, FR8.3, FR9.3]
  - id: BR12.6
    statement: 管理者は未確定月の内訳を確認して削除し、必要なら入れ直せる
    category: policy
    applies_to: [S5, S6, deleteAdjustment]
    trigger: 削除と訂正
    logic: S5の各行で子供・符号付き金額・理由を示す確認後だけ削除する。成功後に合計を再取得する。直接の更新は作らない。IDは同じ家族の保存済み行から月を決める
    violation: 存在しない・他家族・すでに消えた行はNOT_FOUND。画面は再取得して消えたことを案内する。確定済みはBR12.4
    source: [FR8.2, NFR6, NFR9]
  - id: BR12.7
    statement: 同じ作成の再送は二重登録しない
    category: constraint
    applies_to: addAdjustment
    trigger: 保存と再試行
    logic: 操作キーと正規化後の入力を既存の方針で照合し、同じなら元の成功結果だけ返す。保存・操作記録・月の未確定確認が一体で成立する。別キーなら同じ内容でも別の意図的な登録とする
    violation: 同じキーで異なる入力はIDEMPOTENCY_CONFLICT。応答不明なら画面は同じキーと入力で再試行する。削除済みでも同じ作成の再送で復活させない
    source: [FR8.2, NFR6]
  - id: BR12.8
    statement: 画面は入力を残し、結果の確定後にだけ完了を表示する
    category: policy
    applies_to: [S5, S6]
    trigger: 入力から保存・削除完了まで
    logic: 管理者と未確定月にだけ変更操作を出す。保存中は多重押下を止め、失敗時は理由を欄または操作の近くに表示する。成功時はS5の同じ月へ戻り再取得する。月を切り替えた後の古い応答は新しい月の表示を書き換えない
    violation: 未認証では再ログイン、権限変更では変更操作を止める。通信失敗では入力と操作キーを維持する
    source: [FR8.2, NFR6, NFR9]
```

## Rules Summary

| ルール | 内容 |
|---|---|
| BR12.1 | 管理者・家族・対象の子供を確認 |
| BR12.2 | 正の整数と加算・減額の種類 |
| BR12.3 | 理由は必須、100文字まで |
| BR12.4 | 月の確定と変更を同時に成立させない |
| BR12.5 | 内訳・合計・月末まとめに同じ計算を使用 |
| BR12.6 | 確認して削除し、訂正は入れ直す |
| BR12.7 | 同じ作成要求の再送を二重登録にしない |
| BR12.8 | 入力保持と古い応答の排除 |

## Sources

- `inception/requirements-analysis/requirements.md` FR1.7・FR6.5・FR8.1〜FR8.3・FR9.3、NFR4・NFR6・NFR9
- `inception/user-stories/stories.md` US8.2（AC8.2.1〜AC8.2.7）
- `inception/refined-mockups/mockups.md` S5・S6
- `functional-design-questions.md` Q1: A

## Assumptions & Open Questions

- [assumption] 操作キーの保存期限・月の変更の排他方式は既存の共通機構に合わせ、NFR設計で具体化する。
