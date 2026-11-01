# 優先順位つきの作業一覧（Intent Backlog）

最初の版で作る機能を、作業のまとまりに分けて並べたものです。範囲は `scope-document.md` の In Scope のとおりです。もとにしたのは、「意図の整理」（`ideation/intent-capture/intent-statement.md`）、「実現可能性の評価」（`ideation/feasibility/feasibility-assessment.md`）、「制約の一覧」（`ideation/feasibility/constraint-register.md`）です。

優先度は MoSCoW の 4 段階で表します。

- Must: 最初の版に必ず入れる
- Should: 入れたいが、遅れたら外せる
- Could: 余裕があれば入れる
- Won't: 今回は入れない

## 作業のまとまりと優先度

| ID | まとまり | 内容 | 優先度 | 前提となるまとまり | 出典 |
|----|----------|------|--------|--------------------|------|
| IB-1 | 家族のメンバーと LINE ログイン | 家族のメンバー（母親と子供）を登録し、LINE の認証で見分ける。家族以外は使えない | Must | なし | intent-statement、constraint-register の C-T1・C-R1 |
| IB-2 | お手伝いの種類の管理 | 母親が名前・単価・説明を設定・変更する | Must | IB-1 | scope-definition-questions の Q6 |
| IB-3 | 月初の割り当ての入力 | 母親が、日ごと・お手伝いごとの担当者を入力・修正する | Must | IB-1、IB-2 | intent-statement |
| IB-4 | カレンダーの表示 | 全員が、家族全員の担当とお小遣い額を見る | Must | IB-3 | scope-definition-questions の Q5 |
| IB-5 | トークでの実施記録 | 子供がグループのトークで公式アカウントに話しかけて記録し、返事で「記録しました」が届く。記録した時刻を残す | Must | IB-3 | feasibility-assessment、constraint-register の C-T3 |
| IB-6 | 記録の確認と修正 | 母親が記録を取り消す。「やらなかった」を記録する | Must | IB-5 | scope-definition-questions の Q1・Q2 |
| IB-7 | 子供同士の枠の交換 | 子供が交換を申し出て、相手の子供が承諾すると交換される | Must | IB-3 | intent-statement |
| IB-8 | お小遣いの計算 | 単価 × 実施回数を、子供ごと・月ごとに合計する | Must | IB-2、IB-5、IB-6 | intent-statement |
| IB-9 | 任意の加算・減額 | 母親が理由を書いて、任意の額を加算・減額する | Should | IB-8 | scope-definition-questions の Q3・Q7 |
| IB-10 | 毎日のリマインド | 毎日夕方の決まった時刻（例: 16 時）に 1 回、その日の担当をグループ LINE に送る | Must | IB-3 | scope-definition-questions の Q4、constraint-register の C-T4 |
| IB-11 | 月末のまとめ | 月末に、各子供のお小遣い額をグループ LINE に送る | Must | IB-8 | intent-statement |

IB-9 を Should にしたのは、1 月にも間に合いそうにない場合に外してよいのがこの機能だけだからです（Q7）。

## Won't（今回は入れない）

| ID | 内容 | 出典 |
|----|------|------|
| W-1 | お小遣いの実際の支払い（送金や決済） | intent-statement |
| W-2 | 割り当て作業の自動化（前月の割り当てのコピー、自動割り当て） | intent-statement |
| W-3 | 過去の月の履歴をグラフなどで振り返る機能 | intent-statement |
| W-4 | アプリの中で家族が話し合う機能 | intent-statement |
| W-5 | 「やらなかった」の自動判定、決まった条件で自動的に付くボーナス・ペナルティ | scope-definition-questions の Q2・Q3 |

## 作る順番

使う流れの順です（Q8）。前提となるまとまりが先に来るように並べています。

1. IB-1 家族のメンバーと LINE ログイン
2. IB-2 お手伝いの種類の管理
3. IB-3 月初の割り当ての入力
4. IB-4 カレンダーの表示
5. IB-5 トークでの実施記録
6. IB-6 記録の確認と修正
7. IB-7 子供同士の枠の交換
8. IB-8 お小遣いの計算
9. IB-9 任意の加算・減額
10. IB-10 毎日のリマインド
11. IB-11 月末のまとめ

## Assumptions & Open Questions

- [assumption] IB-5 は、グループのトークで話しかけた子供をアプリが見分けられることが前提（raid-log の R-3）。作る順番では 5 番目なので、この確認は IB-5 に取りかかるときに行う
