# 信頼性の要件（Reliability）— U4 お手伝いの種類

U4（`u4-chore-types`）の信頼性の要件です。U1〜U3 の要件（NFR2.1〜NFR2.23、NFR6.1〜NFR6.4、NFR10.1、NFR10.2、NFR11.1、NFR11.2）をそのまま使います。

## 要件

| ID | 要件 | 確かめ方 |
|----|------|---------|
| NFR2.24 | 名前の一意の印と種類の記録は、1 回のトランザクションで一緒に書く（登録）。名前の変更は、古い名前の印を消す・新しい名前の印を取る・種類を変えるを 1 回のトランザクションで行う。どれかができなければ、どれも残さない（BR5.3） | 途中で失敗させて、印だけ・種類だけが残らないこと。同時に同じ名前で 2 つ登録して、1 つだけが残ること |
| NFR2.25 | 消すときは、先に「使わない」にしてから使われたかを確かめ、使われていなければ種類と名前の印を 1 回のトランザクションで消す（BR5.9） | 使われているときに「使わない」のまま残ること。消したあとに印が残らないこと |
| NFR2.26 | トランザクションが競合で断られたら、U2・U3 と同じく 1 回だけやり直し、ほかの Code は投げ直す（500 `INTERNAL`、画面は「表示できませんでした。もう一度お試しください」） | 競合を作って、その動きになること |
| NFR6.5 | お手伝いの種類のデータは、アプリの操作でだけ変わる。本番のデータを手で書き換えない。本番のテーブルは `RemovalPolicy.RETAIN` | CDK の設定で確かめる |
| NFR11.3 | 種類の createdAt・updatedAt は UTC で残す（U1 の NFR11.1） | 単体テスト |

## Sources

- `inception/requirements-analysis/requirements.md`（NFR2、NFR6、NFR11）
- `construction/u4-chore-types/functional-design/rules.md`（BR5.3、BR5.9）
- `construction/u2-invitation/nfr-requirements/reliability-requirements.md`

## Assumptions & Open Questions

- 「使わない」にしたあと、使われたかの確かめや削除が失敗したときは、種類は「使わない」のまま残ります。管理者は「使う」に戻せるので、受け入れます
