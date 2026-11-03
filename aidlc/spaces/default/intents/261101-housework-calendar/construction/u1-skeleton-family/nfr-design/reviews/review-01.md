## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T11:40:23Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Critical | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/security-design.md > セクション「C2 セッションの発行」手順 3 | LINE の ID トークン検証に `@line/bot-sdk` の `validateSignature` を参照しているが、`validateSignature` は Webhook のリクエストボディを HMAC-SHA256 で検証する関数であり、OpenID Connect の JWT 形式である LINE ID トークンの検証には使用できない。契約書 `inception/contract-design/contract-summary.md` の C4 では、ID トークン検証は `POST https://api.line.me/oauth2/v2.1/verify` (`verifyIdToken`) を呼ぶと明記されており、security-design.md はこの C4 契約と直接矛盾している。実装者がこの設計に従うと、NFR4.1「LINE の決まりで確かめる」を達成できず、偽造トークンでのセッション発行を防げない | 手順 3 を、C4 で定義された `verifyIdToken` endpoint（`POST https://api.line.me/oauth2/v2.1/verify`）を呼んでチャネル ID と有効期限を確かめる設計に修正する。`validateSignature` は Webhook 署名検証のままとし、セッション発行フローには登場させない | New |
| R-02 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/security-design.md > セクション「悪いスクリプトを入れさせない（XSS）」> Assumptions & Open Questions | NFR4.11 の要件（`nfr-requirements/security-requirements.md`）は「許す配信元の細かい一覧は NFR の設計の段階で決める」と明示しているが、security-design.md では `https://static.line-scdn.net` を仮の値として示し、「コード生成のときに LINE の最新の案内で確かめます」として設計段階での確定を先送りにしている。要件が求めている成果物（確定した CSP 許可配信元一覧）をこの設計段階で出力していない | security-design.md の CSP 設計セクションで、LIFF SDK・LINE API・LINE ログインに必要なすべての配信元を確定した値として列挙する。LINE Developers の公式ドキュメントを参照し、この設計ステージで完成させる。「コード生成で決める」とした Assumptions を削除する | New |
| R-03 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/reliability-design.md および security-design.md（NFR2.4 に対応する箇所がどちらにもない） | NFR2.4 の要件（`nfr-requirements/reliability-requirements.md`）は「LINE に問い合わせられなかったとき（友だちかどうかの確かめ）は、利用者を断らず、『表示できませんでした。もう一度お試しください』を出して読み込み直せるようにする」と定める。しかし reliability-design.md の一般的なエラー扱いは「思いがけない失敗 → 500 を返す」であり、このフォールバック設計（断らずリトライを促す）がどの設計文書にも記述されていない。traceability.json の NFR2.4 ターゲット「security-design.md LINE の API の時間切れ（5 秒）でエラーハンドラーへ」は NFR7.5 の内容であり、NFR2.4 の本質をカバーしていない | reliability-design.md に NFR2.4 の専用セクションを追加し、LINE 問い合わせ失敗時のフォールバック設計（500 を返さず、画面に向けて特定のエラーコードを返してリトライを誘導するか、または画面側で 500 をこのケースと判断してメッセージを出す、といった具体的な設計）を記述する。traceability.json の NFR2.4 ターゲットをその記述に更新する | New |
| R-04 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/performance-design.md > セクション「Lambda の起動の速さ（コールドスタート）」> テーブル行「メモリの大きさ」 および traceability.json > NFR7.4 の coverage エントリ | performance-design.md のテーブルで「メモリの大きさ（NFR7.4）」として「Lambda のメモリを 256 MB から始める」と記述しているが、NFR7.4 の要件は「Lambda の 1 回の処理の時間切れ 30 秒（それを超えたら止める）」である。256 MB のメモリ設定はコールドスタート対策（NFR7.1〜7.3 に関連）であり、NFR7.4 の内容ではない。traceability.json の NFR7.4 ターゲック「performance-design.md Lambda の時間切れ 30 秒（CDK の設定）」は performance-design.md に存在しない記述を指している | NFR7.4 の誤った紐付けをテーブルから削除し、Lambda タイムアウト 30 秒を CDK で設定する設計を performance-design.md に追加する。traceability.json の NFR7.4 ターゲットをその設計記述に修正する。「メモリの大きさ」行の NFR 参照は NFR7.1〜7.3 に修正する | New |
| R-05 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/traceability.json > NFR4.3 coverage エントリ | NFR4.3 のターゲットは「security-design.md useSession.ts でメモリにだけ持つ」と記述しているが、security-design.md にはこの内容が存在しない（実際は logical-components.md に記述されている） | traceability.json の NFR4.3 ターゲットを「logical-components.md メモリでのセッション保持（NFR4.3）useSession.ts（React のフック）」に修正する | New |
| R-06 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u1-skeleton-family/nfr-design/traceability.json > NFR8.1、NFR8.2、NFR9.1 coverage エントリ | これら 3 件のターゲットは「logical-components.md テストは Vitest + Gherkin...」「logical-components.md Vitest でカバレッジ 80%...」「logical-components.md MUI のテーマで...」と記述しているが、logical-components.md にはこれらの記述が存在しない（実際の内容は tech-stack-decisions.md にある） | traceability.json の NFR8.1、NFR8.2、NFR9.1 のターゲットを、実際に記述のあるファイルと箇所（tech-stack-decisions.md）に修正する | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| （validation tools none） | — | ステージ定義にバリデーションツールの指定なし |

### Summary

Critical 問題が 1 件あるため NOT-READY。LINE の ID トークン検証に Webhook 署名検証用の `validateSignature` を誤って参照しており、契約書 C4 で定義された `verifyIdToken` API と直接矛盾している。このまま実装するとセッション発行の認証が機能しない。加えて、NFR4.11 の CSP 許可配信元の設計段階での未確定、NFR2.4 のフォールバック設計の欠落、NFR7.4 の誤った紐付けという Major 問題が 3 件ある。
