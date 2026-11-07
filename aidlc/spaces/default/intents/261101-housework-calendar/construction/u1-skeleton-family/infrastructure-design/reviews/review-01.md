## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-07T13:11:01Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/infrastructure-design/cicd-pipeline.md > 秘密の情報の扱い、および infrastructure-specification.md > Lambda のロールの権限 | CloudFront の秘密のヘッダーの値は `/housework-calendar/<env>/cloudfront/*` にあり、cicd-pipeline.md は「Lambda も新しい値を起動のときに読みます」と書いています。しかし `api` と `line` のロールが読めるのは `jwt/*` と `line/*` だけで、`cloudfront/*` は含まれません。Lambda は `X-Origin-Verify` を比べる値を取れず、NFR4.13 の確かめ（直接呼ぶと 403）が成り立ちません。また、全リクエストが 403 になるか、確かめが外れるおそれがあります。 | Lambda が値をどこから得るかを 1 つに決めます。`cloudfront/*` の読み取りを `api` と `line` のロールに足すか、CDK が反映のときに値を環境変数として渡すかのどちらかです。そのうえで、ロール表と cicd-pipeline.md の記述をそろえます。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/infrastructure-design/cicd-pipeline.md > OIDC のロール（本番用） | 本番用ロールの信頼条件は `environment:production` だけです。`workflow_dispatch` は任意のブランチから動かせるため、環境の設定でデプロイできるブランチを `main` に限らないと、未レビューのコードが本番に反映できます。作り手本人の承認は入りますが、制限はありません。 | 環境 `production` の「デプロイできるブランチ」を `main` に限る設定を、手順として明記します。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/infrastructure-design/infrastructure-specification.md > 計算の形（関数 URL・認証 NONE） | 関数 URL を公開で呼べるようにするには、関数ごとの許可の設定を CDK で明示する必要があります。比較的新しい仕様では、URL を呼ぶ許可と関数を呼ぶ許可の両方が要ります。書かれていないと、反映後の確かめ（401 や 200）が最初に 403 で失敗する可能性があります。 | CDK の仕様に、関数 URL の公開用の許可を明記します。そのうえで、秘密のヘッダーで守ることを説明に残します。 | New |

### Summary

構成は全体として一貫しており、費用、環境の分離、OIDC、戻し方も妥当です。ただし 1 点、Lambda が CloudFront の秘密のヘッダーの値を読む経路が、ロールの権限と矛盾しています。これは実装前に直す必要があります（Major 1 件、READY の条件内）。Minor 2 件は、作り手が実装時に拾える内容です。
