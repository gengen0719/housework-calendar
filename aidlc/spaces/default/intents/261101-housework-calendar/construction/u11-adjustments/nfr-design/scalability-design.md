# U11 規模と保存の設計

## Storage and Isolation

専用の調整テーブルを環境ごとに追加します。論理所有者はお小遣い。キーはfamilyIdとskで、実体を`M#年月#J#UUID`、ID索引を`JID#UUID`に分けます。索引は年月だけを持ち、削除時も家族付きのキーで取得します。実体と索引を同時に作成・削除するため片方だけが残りません。GSI・Scan・常時サーバー・追加Lambdaは不要です。月を絞ったQueryは全ページを読みます。

作成操作の結果は既存requestRecordsテーブルに保存します。実際の主キーはuserIdとUUIDキーで、operation=addAdjustment、targetはfamilyId・month・child・kind・amount・正規化reasonの順序固定ハッシュです。家族を含めて照合し、別の家族/操作/入力で同じキーを使っても結果を漏らしません。物理キーにfamilyIdが含まれないことを踏まえ、targetの照合を省略しません。

## Integration and Growth

C9は調整全件を先に読み、現在の子供と済の担当の所有者に加えて、調整だけを持つ過去の子供の集合も名前解決・行の組立対象へ含めます。現在の管理者へ紐付く異常行は通常の子供の合計へ混ぜず、編集用一覧では管理者が削除できるようにします。API・通知とも既定の本番差込口を取り付け、テスト用の空差込口が本番で残らないことを検証します。

月1000件の調整を検証し、規模の上限は追加しません。読取中の変更はスナップショットを保証しませんが、保存成功後の新しい強整合読取で反映します。訂正中に古い読取を新しい表示へ適用しません。実際の負荷増加は処理時間・読取量・料金から把握し、分割・キャッシュは実測後に再検討します。

## Cost Boundary

増分は1登録あたり調整2行+操作記録と条件読取、削除2行と条件読取、各月の一覧読取、調整の保存とバックアップです。LINEの追加pushは0通です。既存費用へ加算した二環境合算をインフラ設計で計算し、配備前に無料枠・為替・利用量を再評価します。

## Sources

- `construction/u11-adjustments/nfr-requirements/scalability-requirements.md` NFR1.201・NFR3.201・NFR7.203
- `construction/u11-adjustments/nfr-requirements/reliability-requirements.md` NFR6.204
- `packages/backend/src/services/allowanceService.ts` 既存差込口と過去の子供の名前解決

## Assumptions & Open Questions

- 物理名・IAM・バックアップの構成はインフラ設計で確定する。スキーマの追加に既存データの書換えは不要。
