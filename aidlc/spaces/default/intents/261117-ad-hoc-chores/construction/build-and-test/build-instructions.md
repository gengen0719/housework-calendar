# ビルド手順

既存Node/npmとlockfileの依存を使用。新しいチェックアウトでは `npm ci`。ローカル検証はfake/モックを利用しAWS/LINE認証は不要。

- `npm run build --workspace @housework/frontend`
- `npm run lint`
- `npx tsc --noEmit -p packages/shared`
- `npx tsc --noEmit -p packages/backend`
- `npx tsc --noEmit -p packages/frontend`
- `npx tsc --noEmit -p infrastructure`

部分テスト3コマンドはcode-generation/unit-test-instructions.mdに記載。全体のcoverageは `npm test -- --maxWorkers=4` で測定。既存のworker起動タイムアウトを避けるため並列上限4を指定し、テスト・測定範囲・閾値は変更しない。rootの型検査スクリプトではなく、CIと同じパッケージ別tsconfigを利用する。

出力はpackages/frontend/dist。失敗時は該当コマンドのログを確認し、検査基準を下げず原因を修正する。デプロイは既存CIに任せる。
