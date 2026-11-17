# 安全性の確認

## Local Checks

認証・管理者・家族分離・入力境界・再送・ログ除去は、各単位と全体のNode/jsdom/模擬AWSのテストで確認しています。実ブラウザやCloudFrontの応答、実チャネルの権限は別の確認です。

```sh
npm run secrets:scan
```

この既存スクリプトはGit履歴と未追加ファイルを含む作業ツリーを、redact付きで検査します。現在はgitleaks未導入でexit1です。既存スクリプトが案内する初回環境準備は次のコマンドです。

```sh
brew install gitleaks
```

Homebrewは作業フォルダ外へ書き込むため、その操作の許可を得てから実行します。設定やallowlistを緩めて通しません。導入後は同じnpm run secrets:scanを再実行します。

## Current Evidence

秘密検査はUnverified、GitHub Actionsの実行は次工程ci-pipelineの責任です。実環境・実ブラウザが必要な項目は未確認として保持します。

## Sources

scripts/secrets-scan.sh、全単位security要件/設計、Testing Contract、.github/workflows/ci.yml。

## Assumptions & Open Questions

導入するのは検査用ツールです。実秘密や本物のIDをテストに使用しません。

