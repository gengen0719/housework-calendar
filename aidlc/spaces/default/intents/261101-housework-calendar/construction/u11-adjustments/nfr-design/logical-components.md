# U11 論理構成と境界

## Components

| 部品 | 責任と所有 | 障害範囲・依存 |
|---|---|---|
| S5・S6・独立した編集一覧 | 入力保持・確認・結果の再取得。合計エラーでも訂正可能 | ブラウザ内の月別状態。変更結果と表示失敗を分離 |
| APIの加算減額入口 | 認証・管理者・入力形・操作キー、理由とHTTP変換 | API Lambda内。通知Lambdaに編集権限はない |
| C9のAdjustment service/repository | 実体と索引、作成結果、全件一覧、取引 | お小遣いが保存を所有。家族と月の条件は各所有者の公開窓口を使う |
| C9の既存allowance service | 現在/過去の子供の集合、正確な小計・合計と調整内訳 | API・通知で同じ既定差込口を使う。通知本文再送は固定 |
| C6の家族/子供の条件窓口 | 保存時の家族と子供の役割を保護 | 他の部品がusers行を解釈しない |
| C8の未確定条件窓口 | 取引内の月未確定確認 | 月状態の所有者はカレンダーのまま |
| 調整テーブル・requestRecords | 調整と索引の永続保存、24時間の再送結果 | 環境別。調整の復元と操作結果の失効を区別 |
| 既存ログ・警報・バックアップ | 秘密を含めない結果・障害通知と復元 | 既存構成へ追加。通知有効化設定は変えない |

## Decisions and Tradeoffs

合計の安全範囲を超えた場合に、主画面と別の編集用一覧を使うため、読取契約を1つ追加します。安全な数値だけを既存応答へ返す互換性と、業務上限なし・画面からの訂正を両立する選択です。独立した計算サーバーや保存済み合計は追加しません。

専用テーブルにより通常の月担当Queryから調整の保存形を分離できますが、IAM・バックアップ対象の追加が必要です。取引と強整合読取は追加料金を含めて見積もります。実環境の3秒や100円を達成済みとは扱いません。

## Sources

`construction/u11-adjustments/nfr-requirements/tech-stack-decisions.md`、同工程の各品質要件、`construction/u11-adjustments/functional-design/functional-spec.md`、`inception/domain-design/components.md`、`inception/contract-design/contract-summary.md`。

## Assumptions & Open Questions

- インフラ設計で物理リソースとIAM・バックアップの増分を確認する。
