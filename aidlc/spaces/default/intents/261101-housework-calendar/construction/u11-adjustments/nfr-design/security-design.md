# U11 安全性の設計

## Authorization and Validation

既存API入口の認証とrequireMembershipを通し、登録・削除と独立した編集用一覧はrequireAdminを必須にします。C9の変更窓口でも管理者を検証します。家族IDは本文で受けず、保存キーに信頼したfamilyIdを常に含めます。登録対象はC6 `isChildOfFamily`の既存相当の公開窓口で検証し、同時変更に備え保存取引にも所有者側が作る子供の所属・役割の条件を入れます。別家族のIDは存在なしと同じNOT_FOUNDです。

月は既存INVALID_MONTHと許可範囲検証、IDはUUID形式、kindはadd/subtract、金額はJSON数値の正のsafe integer、理由はNFC→trim→コードポイント1〜100、改行以外の制御文字拒否です。画面は金額の生文字列を保持し、数字だけのときに数値化します。型の強制変換で小数や指数表記を許しません。理由は通常の文字列として描画します。既存のCORS・HTTPS・セキュリティヘッダを維持し、新たにブラウザ永続保存へトークン・入力理由を書きません。

## Additive Contracts

共有ソース`packages/shared/src/reasons.ts`を確認し、INVALID_INPUTは存在しないため使用しません。種類・本文・ID不正は既存`INVALID_REQUEST`、月不正は`INVALID_MONTH`を使用します。理由の上限などには新規`INVALID_REASON`、合計の安全な範囲外には新規`ALLOWANCE_OUT_OF_RANGE`を追加します。

同じキーで異なる操作・入力は既存`IDEMPOTENCY_KEY_REUSED`（422）です。機能設計の抽象名IDEMPOTENCY_CONFLICT（409）は実装しません。ヘッダ不正は既存400 `IDEMPOTENCY_KEY_REQUIRED`です。これらは未実装U11境界の具体化であり、既存APIの理由や状態コードは変更しません。変更一覧を`docs/contract-changes-u11.md`へ実装時に記載します。

| 新規境界 | 権限・成功 | 備考 |
|---|---|---|
| POST /v1/months/{month}/adjustments | 管理者、201、AdjustmentView | UUID操作キー必須。ViewはID・子供ID・月・kind・正金額・理由・作成時刻 |
| DELETE /v1/adjustments/{adjustmentId} | 管理者、204 | 存在しない場合404、確定なら409 |
| GET /v1/months/{month}/adjustments | 管理者、200、AdjustmentMonthView | 合計と独立。month・confirmed・編集可能範囲・子供の表示名・全調整行。全行を読む |

一覧は家族の過去の子供の調整も落とさず返します。名前が取れなければ既存の不明な子供の表示を使い、行のIDから削除可能にします。新規登録は現在の子供にだけ許可します。通常のお小遣い内訳は既存の符号付きamountとreasonを維持し、家族ID・作成者・操作キー・ハッシュを出しません。

## Data Protection

調整は環境ごとの既存管理方式と同じ暗号化・HTTPS・IAM最小権限で保護する別の保存領域に置きます。APIだけ書込、通知は読取だけ。通知からリクエスト記録や編集用一覧への書込権限を与えません。理由はAPI応答と保存に必要な範囲だけ扱い、ログ・警報には出しません。操作結果記録は保存時の結果を24時間だけ保持し、期限判定は削除タイミングに依存しません。

## Validation

登録・削除・独立一覧それぞれで401/403/404と無変更を検証します。AC1.1.12・AC8.2.4を明記します。入力各境界、HTML、絵文字、空白、同じキーで違うfamilyId、確定後の古い画面、ログの秘密除去を検証します。

## Sources

- `construction/u11-adjustments/nfr-requirements/security-requirements.md` NFR4.201・NFR4.202・NFR5.201・NFR10.201
- `construction/u11-adjustments/nfr-requirements/tech-stack-decisions.md`
- `inception/contract-design/contract-summary.md` C1・C6・C8・C9・C10
- ソース確認: `packages/shared/src/reasons.ts`、`packages/backend/src/repositories/requestRecordRepository.ts`

## Assumptions & Open Questions

- 編集用一覧の追加は読取の追加契約。既存C9利用者の戻り形は変えない。
