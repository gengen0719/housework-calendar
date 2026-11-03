# Inception から Construction への確かめ

**判定: PASS**（確かめた日: 2026-11-03）

Inception の段階で作った対応表（`traceability.json`）を読み、要件 → ストーリー → 部品 → 作業単位が漏れなくつながっていることを確かめました。`GAP`（どこにもつながっていない）、`ORPHAN`（元のない項目）、正しくない行き先、抜けている ID はありません。

## 要件 → ストーリー（`inception/user-stories/traceability.json`）

| 結果 | 件数 | 中身 |
|------|-----|------|
| OK | 55 | FR1.1〜FR9.5 の 48 件すべてと、NFR1、NFR2、NFR4、NFR6、NFR7、NFR9、NFR11 |
| Deferred | 3 | NFR3、NFR5、NFR10。NFR の段階（nfr-requirements）で扱う |
| N/A | 1 | NFR8。作り方の決まり（BDD、カバレッジ、CI）で、`team.md` で扱う |
| GAP / ORPHAN | 0 | なし |

Deferred と N/A は、行き先の段階が書かれており、漏れではありません。

## ストーリー → 部品（`inception/domain-design/traceability.json`）

| 結果 | 件数 | 中身 |
|------|-----|------|
| OK | 11 | US1.1〜US9.1 のすべてが 7 つの部品のどれかにつながっている |
| GAP / ORPHAN | 0 | なし |

## ストーリー → 作業単位（`inception/units-generation/traceability.json`）

| 結果 | 件数 | 中身 |
|------|-----|------|
| OK | 11 | US1.1（U1。U2 にもまたがる）、US1.2（U3）、US2.1（U4）、US3.1・US4.1（U5）、US5.1（U6）、US6.1（U7）、US7.1（U8）、US8.1（U9）、US8.2（U11）、US9.1（U10） |
| GAP / ORPHAN | 0 | なし |

U1〜U11 の 11 個の作業単位は、どれも 1 つ以上のストーリーを持っています（`unit-of-work-story-map.md`）。

## 引き継ぐ注意

- 速さの目安を「画面 3 秒以内、LINE の返事 10 秒以内」にした決定（`inception/delivery-planning/delivery-planning-questions.md` の Q7）は、NFR7 と契約 C3 より新しい決定です。NFR の段階で書き直します
- 作業単位の分割と契約の設計のレビューで、受け入れたリスクとして残った指摘があります（各段階の `reviews/`）。各単位の機能設計で扱います
