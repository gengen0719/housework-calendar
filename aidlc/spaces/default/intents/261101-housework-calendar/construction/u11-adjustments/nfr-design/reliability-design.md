# U11 信頼性の設計

## Atomic Writes and Ownership

作成は調整実体Put・ID索引Put・操作結果Put・月未確定ConditionCheck・対象子供の所属ConditionCheckを同じTransactWriteで実行します。削除は実体Delete・索引Delete・月未確定ConditionCheckを同じ取引で実行します。実体と索引の存在・ID一致も条件にし、削除の競合はNOT_FOUNDへ読み直します。

月の条件は既存calendarRepository.buildMonthGuardの意味を継承し、カレンダーが公開する限定的な取引用窓口から受け取ります。調整のサービスが他部品の保存行を直接解釈・変更しません。子供の所属の条件も家族とメンバーの公開窓口で構築します。所有者の窓口と型を同じ変更で足し、既存呼出しは維持します。

月の確定の単独更新と取引内の条件確認は、同じ月状態項目で競合します。月状態がない場合の初回確定とも競合する条件を使います。事前のisMonthConfirmedだけに依存しません。DynamoDBの取引と単独書込の分離により、確定に先行する変更か確定後の拒否として扱います。[AWS公式の取引仕様](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

## Retry and Idempotency

要求結果は既存の24時間TTLと論理期限判定を使います。送信入力の正規化後、家族を含むtargetを照合して元の成功結果を返し、その後の確定や削除で復活させません。期限を超えた再送を新規扱いする既存方針を画面と手順に明記し、24時間を超えた結果不明要求を自動で再登録しません。画面は最新一覧で確認するよう案内します。

競合時は強整合で操作結果・対象行・月状態を再読します。同じ要求の勝者があればその結果、異なる入力は既存422、月確定は409、削除済みは404です。再試行は初回を含め最大2回、短いジッタ0〜50ms、既存APIの残り時間内だけ。非競合の障害は再送を隠して成功にせず入口へ投げ、既存の失敗通知へ渡します。SDKの再試行込みの時間は既存の入口期限を越えないよう明示的な中止期限を渡します。

## Recovery and Backup

合計範囲外でもGET調整一覧とDELETEは集計に依存しないため利用可能です。S5のエラー時にも管理者用入口を残します。確定されている場合は既存の確定取消を先に行います。正確な合計計算と表示の範囲判定はperformance-designに従います。

調整の実体とID索引を同じバックアップ対象として追加し、既存の毎日バックアップと7日保存の方針を継承します。requestRecordsの24時間の操作結果と永続調整を混同しません。復元後に過去の操作結果がない場合でも、同じキーで自動再送しない復元手順を明記し、調整・索引の件数と参照先を検証します。復元先は別テーブルを用意する既存手順に従い、本番を手で書き換えません。

## Validation

BDDを先行させ、同一キー10並行、確定対作成/削除、作成/索引/結果の途中失敗、確定後・削除後の再送、TTL境界、過去月・日本時間月境界、範囲外からの訂正を試験します。全体の80%下限と既存の検査を維持し、実メール到達・復元・CI実行の未確認を区別します。

## Sources

- `construction/u11-adjustments/nfr-requirements/reliability-requirements.md` NFR6.201〜NFR6.204・NFR2.201・NFR8.201・NFR11.201
- `construction/u11-adjustments/functional-design/functional-spec.md` 保存・再送・削除
- `inception/contract-design/contract-summary.md` C6・C8・C9
- `packages/backend/src/repositories/calendarRepository.ts` buildMonthGuard、`packages/backend/src/repositories/requestRecordRepository.ts` 24時間と失効判定

## Assumptions & Open Questions

- 実環境での競合・バックアップ復元・15分以内のメール到達は、配備と手動確認まで未検証。
