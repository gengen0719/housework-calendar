## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-15T23:54:19Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261101-housework-calendar/construction/u11-adjustments/functional-design/functional-spec.md > 登録・読み取りと月末まとめ・削除訂正 | 各金額は正確に扱える整数の上限まで登録できる一方、BR12.5は合計が範囲外なら読取全体を失敗させる。例えば既存小計が正の子供に上限額を加算すると、入力として有効な登録が保存された後にS5の読取が失敗する。削除操作はS5の読めた内訳行からしか始められないため、通常画面からその登録を消して訂正する経路がない。月末まとめも同じ計算失敗になる。 | 保存境界で集計範囲を超える変更を原子的に拒否するか、合計の読取失敗に依存しない調整行の取得・削除画面を用意する。正常な小計に上限額を加える例、複数の同時登録で初めて範囲を超える例を含め、失敗後も画面から訂正できることを定める。 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u11-adjustments/functional-design/traceability.json > upstream_ids・coverage | 共有の管理者権限条件AC1.1.12が対応表にない。共有のstory-mapは加算・減額をU11の検証対象とし、本文のシナリオも同じACを挙げている。BR12.1で振る舞い自体は記述済みだが、対応表はUS8.2の7件だけになっている。 | AC1.1.12を上流IDとcoverageへ追加し、U11が担当する加算・減額の認証と権限拒否をBR12.1へ対応させる。他単位の操作はその持ち主の担当であることを補足する。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261101-housework-calendar/construction/u11-adjustments/functional-design/functional-spec.md > Boundary Contracts直後の理由コード | 種類・月・ID不正で「既存INVALID_INPUT」を使うと記載するが、渡された共有契約C10のreasons一覧にINVALID_INPUTはない。追加が許される契約なので導入自体は禁止されないが、既存の共通コードをそのまま再利用できるという裏付けがない。 | 共通で使用できる理由コードと文言を確認して明記する。INVALID_INPUTを新設するなら追加として扱い、INVALID_REASONや操作キー競合と合わせて共有型・応答・画面の対応を揃える。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 既存js-yamlによるentities/rulesの解析とJSONのBR参照検査 | エンティティ2件・BR8件・coverage7件を解析し、全BR参照が解決した。共有AC1.1.12の宣言はfalse。 | 正本の構文と宣言済み参照は正常。共有条件の対応表不足は上記のとおり。 |
| Mermaid ER構文の確認 | erDiagram、4本の関係演算子、識別子・ラベルを目視で構文照合。標準ER表記として問題は見つからなかった。リポジトリ内のMermaidパーサーは未導入で、パーサーによる実行検証はしていない。 | 図の内容はエンティティと整合し、削除後の操作履歴についてテキスト代替で補足している。 |
| 共有要件・ストーリー・所有境界・C1/C6/C8/C9の照合 | 管理者のみ、同じ家族の子供、理由必須、正の登録金額と符号付き読取、確定との同時操作、共通計算窓口、削除確認、同一要求の再送抑止、送信済みまとめの不変を確認。 | 主要な機能は上流と整合する。合計の範囲外からの画面上の復旧と共通理由コードの扱いは補足が必要。 |
| 回答と画面設計の照合 | Q1=Aの100文字、NFC正規化・コードポイント数、入力保持、結果不明時の同じ入力とキーの維持、古い応答の排除、フォーカス・読み上げを確認。 | 回答との矛盾や、更新と削除の取り違えは見つからなかった。物理的な保存方式と排他制御は後続設計の対象として明記されている。 |

### Summary

主要な登録・削除・権限・確定保護と画面操作は設計されている。集計範囲外になった後の訂正経路は未定義であり、NFR6の画面による復旧を満たしたとは扱わない。Criticalなし・Major1件としてREADYだが、この残項目と対応表・理由コードの補足を明示して後続の設計へ引き継ぐ必要がある。
