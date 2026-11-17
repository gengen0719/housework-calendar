# ビルド手順

既存のNode/npmとインストール済みlockfileの依存を利用。新規環境では `npm ci` を実行する。ローカルの単体・DOMテストにはAWS/LINEの秘密情報や外部サービスは不要。

- `npm run build --workspace @housework/frontend`
- `npm run lint`
- `npx tsc --noEmit -p packages/frontend`

生成先はpackages/frontend/dist。rootのtypecheckスクリプトは既存のjsx/DOM設定不足で利用できないため、CIと同じパッケージ設定を使う。依存がなければnpm ciを行い、認証情報をファイルに書かない。
