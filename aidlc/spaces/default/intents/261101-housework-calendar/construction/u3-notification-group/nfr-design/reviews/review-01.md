## Review
**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Iteration:** 1
**Verdict Dictated:** no

### 確認したこと

- DynamoDB のトランザクションの条件（登録、登録し直し、解除）を、同時に起きる場合ごとにたどりました。同じ家族が 2 つのグループを同時に登録する場合は、先の 1 つが成功し、後の 1 つは Families の条件で断られて読み直され、置き換えになります。家族のお知らせ先は 1 つのままで、持ち主のいない記録は残りません。登録し直しと leave が重なる場合は、Families の条件 `notificationGroupId = 前のグループ` と前のグループの Delete の条件があるため、一方だけが成功します。2 つの家族が同じグループを同時に登録する場合は、Put の条件で一方だけが成功します。この部分に Critical はありません。
- 既存コード（`entries/line.ts`、`handlers/line/types.ts`、`services/lineApiService.ts`、`lib/logger.ts`）と突き合わせました。振り分け表に足す形は無理なく入ります。ただし下の R-01、R-03、R-05 は、いまのコードのままでは設計どおりになりません。
- グループの操作の入口は、登録の操作では家族をイベントの値から決めず、利用者の記録から決めています。断る返事は固定の文言だけです。家族の情報が漏れる道は見つかりませんでした。

### 指摘

**R-01（Major）ただの会話でも DynamoDB に 2 回書く。費用 0 円とログの前提が成り立たない**
- 場所: `nfr-design/scalability-design.md` の「読み書きの量の見込み」（ただの会話）、`nfr-requirements/scalability-requirements.md` の NFR3.4、`security-design.md` の「イベントの振り分け」。既存コードは `entries/line.ts` の `processEvent`。
- 内容: `processEvent` は、`handlers` に登録されたイベントでは `lineEventRepository.begin` と `markDone` で DynamoDB に 2 回書きます。U3 で `message` を振り分け表に足すと、家族のグループの会話 1 件ごとに、返事をしない場合でも 2 回の書き込みが起きます。オンデマンドの DynamoDB の読み書きには無料枠がありません。NFR3.4 は Lambda の無料枠しか見ておらず、scalability-design の「月 1 円に満たない」は、会話の量が多いグループでは成り立たない可能性があります。たとえば 1 日 500 件の会話なら月 3 万件、書き込み 6 万回で 5〜6 円ほどになります。ここは試算で確認したものではなく、概算です。
- 直し方: 「登録」にあたらない `message` と `postback` は、`parseGroupCommand` が `null` を返した時点で、二度処理しない記録の前に打ち切ります。`processEvent` の `begin` の前に、イベントの種類ごとの事前の絞り込みを入れる形です。NFR3.4 の確かめ方（会話で書き込みがない）は、この形なら本当に満たせます。あわせて、scalability-design に DynamoDB の書き込みの試算を書き直します。

**R-02（Minor）遅れて届いた leave が、登録し直したあとの登録を消す**
- 場所: `nfr-design/reliability-design.md` の「解除」、機能設計の BR4.9。
- 内容: 解除は、グループの記録の `familyId` と `notificationGroupId` だけを条件にしています。leave を 500 で返して LINE に送り直させる設計なので、公式アカウントを外して招待し直し、管理者が登録し直したあとに、古い leave が再送されることがあります。その場合は、登録し直した直後のお知らせ先が消えます。
- 直し方: leave イベントの `timestamp` が記録の `registeredAt` より前なら、何もしません。比較に使う値を `LineEventSchema` に足すことも書いてください。

**R-03（Minor）グループの名前の 2 秒の時間切れは、いまの `callLine` では渡せない**
- 場所: `nfr-design/performance-design.md` の「工夫」、`logical-components.md` の `lineApiService.ts`。既存コードは `services/lineApiService.ts` の `callLine`。
- 内容: `callLine` は `...init` を広げたあとに `signal: AbortSignal.timeout(LINE_API_TIMEOUT_MS)` を置いています。そのため、呼び出し側が `signal` を渡しても 5 秒で上書きされます。設計の「この呼び出しだけに渡す」は、関数の形を変えないと実現できません。時間切れの 2 秒を守れず、登録の 4 秒以内の目標（NFR7.13）も崩れます。
- 直し方: `callLine` に `timeoutMs` を引数として足す（初期値は 5000）と、設計に明記します。

**R-04（Minor）長すぎる入力は「何もしない」と書いてあるが、実際は本文全体が 400 になる**
- 場所: `nfr-requirements/security-requirements.md` の NFR4.28、`security-design.md` の `LineEventSchema` に足す項目（`message.text` 最大 5000 文字、`postback.data` 最大 300 文字）。
- 内容: zod の `max` を `LineEventSchema` に入れると、1 件でも超えたときに `WebhookBodySchema` が失敗し、同じ本文にある別のイベントも含めて 400 になります。NFR4.28 の「何もしない」とは違う動きです。LINE の仕様の上限内なら実際には起きにくいため、重大ではありません。
- 直し方: スキーマでは文字列の長さを制限せず、`parseGroupCommand` で長さを見て `null` にします。

**R-05（Minor）ログの伏せ字は型だけで、実行時の守りがない**
- 場所: `nfr-design/security-design.md` と `observability-design.md` の「書かないもの」。既存コードは `lib/logger.ts` の `LogData` と `REDACTED_KEY`。
- 内容: 設計の守りは `LogData` の型で `groupName`、`text`、`displayName` を禁止することだけです。いまの `LogData` は `Record<string, unknown>` を土台にしているため、変数や展開（`...obj`）経由では型の禁止をすり抜けます。実行時に伏せる `REDACTED_KEY` の正規表現（`secret|token|…|body|cookie`）にも、この 3 つは入っていません。
- 直し方: `REDACTED_KEY` に `groupName|displayName|text` を足します（`text` は部分一致に注意し、境界を付けます）。型の禁止と、実行時に伏せる処理の両方を、設計に書きます。

**R-06（Minor）家族の Update が存在しない家族を作ってしまう**
- 場所: `nfr-design/reliability-design.md` の「登録・登録し直し」の 4（Families の Update）と「解除」の 2。
- 内容: DynamoDB の Update は、対象がなければ項目を新しく作ります。条件が「`notificationGroupId` がない」だけだと、存在しない `familyId` に対しても成功し、中身のない家族の記録ができます。
- 直し方: 登録と解除の Families の Update の条件に `attribute_exists(familyId)` を足すと、設計に書きます。

**R-07（Minor）トレーサビリティの NFR10.4 と NFR10.5 の対応先に、書いてある根拠がない**
- 場所: `nfr-design/traceability.json` の NFR10.4 と NFR10.5。
- 内容: 対応先は `logical-components.md` で、状態は `OK` になっています。ただし、その中には README の手順（公式アカウントのグループ参加の設定、「困ったとき」）を書く記述がありません。「インフラ設計で入れる」という先送りが、どこにも記録されていません。
- 直し方: `logical-components.md` の部品の一覧に `README.md`（変える）を足します。または、状態を、後の段階に引き継ぐ項目として記録し、引き継ぎ先の段階名を書きます。

**R-08（Minor）グループの概要の取得が使えるかの確認が、前提として書かれていない**
- 場所: `nfr-design/security-design.md` の Assumptions & Open Questions、`logical-components.md` の `lineApiService.getGroupSummary`。
- 内容: `GET /v2/bot/group/{groupId}/summary` が、このプロジェクトの公式アカウントの種類（認証済みでないアカウントを含む）で呼べるかは、どこにも確かめるべき前提として書かれていません。使えなくても登録は名前なしで続けられるので影響は小さいものの、画面には常に「登録済み」としか出ません。
- 直し方: B3 のステージングで確かめる前提として、Assumptions に足します。

### まとめ

登録、登録し直し、解除のトランザクションの条件と、グループの操作の入口は、同時に起きる場合でも整合し、実装できる水準です。直すべき点の中心は、R-01（会話のたびの書き込みによる費用）です。R-02 から R-08 は、実装前に設計へ書き足せば足ります。

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |
