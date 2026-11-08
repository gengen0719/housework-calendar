## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |

### 確かめたこと（問題なし）

- 新しいテーブル（`Invitations`、オンデマンド、PK `token`、TTL `ttl`、`AWS_MANAGED`、本番は `RETAIN`）は、`data-stack.ts` の `common` 設定にそのまま乗り、CDK として実現できます。
- 既存の `Users` に GSI を 1 つ足すのは、CloudFormation の 1 回の更新で可能です。DynamoDB のオンデマンドでは容量の指定もいりません。射影を `INCLUDE` にする書き方も CDK で可能です。
- 新しい有料サービスはなく、費用は 0 円の範囲（DynamoDB の読み書きは従量で月 1 円未満の見込み）に収まります。
- 秘密の情報は新たに増えません。反映の順番（LIFF の設定 → ステージング → 確かめ → 本番）も妥当です。

### Summary

文書全体の方向は妥当で、新しい資源の足し方も CDK で実現できます。ただし、`api` のロールの権限と濫用時の止め方は、いまのコードの作りと食い違った前提で書かれています。R-01 と R-02 を直してからコード生成に進んでください。
