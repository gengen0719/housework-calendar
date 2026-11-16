# U11 配備と検証の流れ

## Pipeline

| 段階 | 作業 | 通過条件 |
|---|---|---|
| BDD先行 | AC8.2.1〜AC8.2.7、共通AC1.1.12、NFR20件のシナリオを先に書く | 実装より前の筋書きと対応表 |
| 静的検査 | 既存format・lint・shared/backend/frontend/infrastructureの型検査 | 全成功。`.codex/**`のlint除外を維持 |
| テスト | 保存/再送/競合/全件読取/BigInt/画面/通知結合/CDK | 全成功、既存回帰成功、行80%以上。閾値変更不可 |
| 構成差分 | CDK assertionとstaging/production synth | 調整表2環境・IAM・バックアップ対象以外の予期せぬ増分なし |
| CI | 既存GitHub Actions | 成功前にはmainへ取り込まない |
| ステージング | main取込後の既存自動配備 | DataStack→AppStack。通知は既定無効のまま |
| 手動確認 | 実認証、登録/削除/独立一覧、範囲外訂正、性能、メール、バックアップ復元、費用 | 作り手の結果記録。未実施を合格にしない |
| 本番 | 既存の手動承認とworkflow dispatch | 同じコミット・同じ構成。予算と実アドレスなどの設定を事前確認 |

## Deployment and Rollback

1. 調整表は追加リソースとしてDataStackで作成し、AppStackへ参照を渡す。既存表の置換・移行・データ書換えは行わない。
2. API・通知のコードと環境変数、IAM、バックアップ対象追加を一緒に配備する。編集APIは未配備の段階で画面に公開しない。
3. 不具合時は編集入口を止め、保存済み調整を保持する。U11前の版は調整を0件として計算するため、**そのまま戻すと額が誤る**。調整の存在する環境では、U11の読取を維持する修正版へ戻すか、読取/通知も停止する保守モードにしてから復旧する。
4. CloudFormationの追加参照を維持したまま実行コードだけを安全な版へ切り替える。productionの調整表はRETAIN。削除したデータの復旧は別表へのバックアップ復元と通常の設定変更を使う。
5. 復元時は実体/ID索引・家族分離を検証し、古い要求キーの自動再送を止める。通知は生成済み本文の再送方針を維持し、調整変更を理由に月末まとめを再送しない。

## Secrets and Activation

GitHub Actionsは既存OIDCロールと環境設定を使い、新しい長期鍵や秘密を作らない。ADJUSTMENTS_TABLE/ARNはCDK参照で渡す。実アドレス・LINE秘密は既存保管先から読み、公開リポジトリへ置かない。通知の有効化は既存のメール・手動・予算確認を満たしてから別途行う。今回のコード作成だけでAWSへ配備・LINE/SNS実送信を行わない。

## Validation and Evidence

全体確認コマンドは既存の承認済み `npm run format:check && npm run lint && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/backend && npx tsc --noEmit -p packages/frontend && npx tsc --noEmit -p infrastructure && npm test` を維持します。秘密検査が未導入で動かせない場合はその事実を記録し、成功と書かない。実機性能・CI・配備・復元・メール・費用の結果はローカルテストの結果と分けて記録します。

## Sources

- `construction/u11-adjustments/nfr-design/logical-components.md`、`security-design.md`、`reliability-design.md`
- `construction/u11-adjustments/functional-design/functional-spec.md`
- `inception/contract-design/contract-summary.md`、`inception/domain-design/components.md`
- `infrastructure-specification.md`、`monitoring-design.md`

## Assumptions & Open Questions

- 配備前の見積・環境設定・実機確認が残る。本工程は設計であり配備完了ではない。
