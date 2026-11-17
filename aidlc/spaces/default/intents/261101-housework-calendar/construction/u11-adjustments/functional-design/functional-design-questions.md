# 機能設計 — U11 お小遣いの加算・減額 — 質問

管理者が子供のお小遣いを加算・減額し、その内訳を消せるようにします（US8.2、AC8.2.1〜AC8.2.7、FR8.2）。

## 決定済みの仕様

- 管理者だけが登録・削除でき、子供は内訳を見るだけです。
- 金額は1円以上の整数です。お手伝いの単価と同様、業務上の金額上限は設けず、正確に扱える整数の範囲を検証します（U4のQ2、FR8.2）。
- 加算・減額の理由は必須です。未入力などの誤りでは入力した内容を残します。
- 確定した月への登録・削除は断ります。月の確定と同時に操作された場合も、保存時に再確認します。
- 合計がマイナスでも、そのまま表示します。お小遣い画面と月末のお知らせの両方に反映します。
- 金額・理由の訂正は、削除の確認後に消して入れ直します（S5・S6の既存設計）。
- 同じ登録の送り直しを二重登録にしません（既存のIdempotency-Keyの方針）。

## Q1. [プロダクト] 理由の長さ

必須であることは決まっていますが、入力できる長さは未決定です。前後の空白だけの入力は未入力として扱います。

A. 100文字まで。短い説明向けで、お手伝いの説明欄と同じ長さです（推奨）
B. 500文字まで。事情を詳しく書けるようにします
X. その他（希望する文字数などを記入してください）

[Answer]:A

## Sources

- `inception/units-generation/unit-of-work.md` U11、`unit-of-work-story-map.md` US8.2
- `inception/user-stories/stories.md` AC8.2.1〜AC8.2.7
- `inception/requirements-analysis/requirements.md` FR8.1〜FR8.3、NFR6
- `inception/domain-design/components.md` お小遣い
- `inception/contract-design/contract-summary.md` C9、加算・減額の登録・削除API
- `inception/refined-mockups/mockups.md` S5・S6
- `construction/u4-chore-types/functional-design/functional-design-questions.md` Q2・Q3
