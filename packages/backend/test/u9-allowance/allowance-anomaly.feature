Feature: あり得ないデータの扱い
  「済」なのに単価がない、種類が一覧にない、担当の子供が管理者の ID、という担当は、通常の書き込みでは作られない。
  起きたときは画面を止めずに、数えられるものだけを返し、異常をログに残す。単価 0 円は異常ではない。
  異常のログは種類ごとに 20 行まで（先頭は決まった順）で、省いた分も anomalyCount に全数が入る。
  山田家は管理者の母と、太郎・花子・次郎。単価は皿洗い 100 円、洗濯物たたみ 150 円。
  Scenario: 単価の項目がない「済」は数えず ALLOWANCE_DUTY_WITHOUT_PRICE が残り、答えは返る
    Given 太郎の皿洗いの「済」が単価の項目なしで 1 件、正常に 2 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 正常な 2 件だけが数えられ、WITHOUT_PRICE が familyId と dutyId だけで 1 行残る
  Scenario: 単価が null の「済」も数えず同じようにログに残る
    Given 太郎の皿洗いの「済」の単価が null で 1 件、正常に 1 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 正常な 1 件だけが数えられ、WITHOUT_PRICE が 1 行残る
  Scenario: 種類が一覧にない「済」は「不明なお手伝い」で一覧の最後に並び、種類ごとに 1 行ログに残る
    Given 太郎の一覧にない種類の「済」が、同じ種類で 2 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 「不明なお手伝い」の行が 1 行あり、CHORE_TYPE_MISSING は familyId と choreTypeId の 1 行で、anomalyCount は 2 である
  Scenario: 不明なお手伝いの行は使わない種類のあとの最後に並ぶ
    Given 太郎の一覧にない種類、お風呂洗い（使わない）、皿洗いの「済」がある
    When 管理者が 1 月のお小遣いを読む
    Then 内訳は皿洗い、お風呂洗い、不明なお手伝いの順である
  Scenario: 担当の子供が管理者の ID なら行を作らず ALLOWANCE_DUTY_OWNER_NOT_CHILD が残る
    Given 担当の子供が管理者の ID になっている「済」が 1 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 管理者の行はなく、OWNER_NOT_CHILD が familyId と dutyId だけで 1 行残り、答えは返る
  Scenario: 管理者の担当では子供の確かめも名前の読み取りも呼ばれない
    Given 担当の子供が管理者の ID になっている「済」が 1 件ある
    When 子供の確かめと名前の読み取りを見張りながら管理者が 1 月のお小遣いを読む
    Then findFamilyChild も findDisplayName も 0 回である
  Scenario: 管理者でも今いる子供でもない ID は抜けた子供として行が出て異常にならない
    Given 家族を抜けた「ゆうき」の「済」が 1 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 「ゆうき」の行があり、異常のログは 1 行もない
  Scenario: 単価なしが 300 件あっても行は 20 行までで、省いた分も anomalyCount に入る
    Given 単価の項目がない「済」が 300 件ある
    When 管理者が 1 月のお小遣いを読む
    Then WITHOUT_PRICE は 20 行で anomalyCount は 300 で、行は sk の順の先頭 20 件である
  Scenario: 3 種類の異常がそれぞれ多くても各種類 20 行まで、合計 60 行以下である
    Given 単価なし 100 件、一覧にない種類 25 種類 100 件、管理者の担当 100 件の「済」がある
    When 管理者が 1 月のお小遣いを読む
    Then 異常のログは種類ごとに 20 行で合計 60 行以下で、anomalyCount は 300 である
  Scenario: 一覧にない種類のログは種類の ID の昇順で先頭 20 種類になる
    Given 一覧にない種類 25 種類の「済」が 1 件ずつある
    When 管理者が 1 月のお小遣いを読む
    Then CHORE_TYPE_MISSING は種類の ID の昇順の先頭 20 行で、anomalyCount は 25 である
  Scenario: 同じデータを 2 回読むと異常のログの行は毎回同じである
    Given 単価の項目がない「済」が 30 件ある
    When 管理者が 1 月のお小遣いを 2 回読む
    Then 2 回の WITHOUT_PRICE の行は同じ順で同じ内容である
  Scenario: 異常のログは計算のログより先に出て、計算のログは 1 件だけである
    Given 太郎の皿洗いの「済」が単価の項目なしで 1 件、正常に 2 件ある
    When 管理者が 1 月のお小遣いを読む
    Then 異常の行のあとに ALLOWANCE_COMPUTED が 1 件だけあり、anomalyCount は 1 である
  Scenario: 異常のログの項目に名前・金額・利用者の ID が入らない
    Given 3 種類の異常が 1 件ずつあり、名前と単価に目印がついている
    When 管理者が 1 月のお小遣いを読む
    Then 異常の行の項目名は許可した一覧と完全に一致し、目印の文字も数字も全行にない
