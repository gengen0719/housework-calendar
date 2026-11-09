Feature: 記録の競合と失敗（U6）
  取引の直前に別の書き込みが入る・取引が断られる・フックが投げる、といった
  競合と失敗のときに、reliability-design.md の表のとおりの結果になることを確かめる。

  Scenario: (a) 取引の直前に管理者が担当の子供を変える（version が増える）
    Given 太郎の今日の皿洗い（未・version 1）がある
    And 取引の直前に、その担当が花子に変わる（version 2）
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録されず、太郎の担当はなくなっているので出し直しの返事になり、皿洗いは太郎のものでなくなる

  Scenario: (a') 取引の直前に管理者が担当を「×」にする
    Given 太郎の今日の皿洗い（未・version 1）がある
    And 取引の直前に、その担当が「×」にされる（version 2）
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録されず出し直しの返事になり、担当は「×」のまま

  Scenario: (b) 取引の直前に月が確定する
    Given 太郎の今日の皿洗い（未・version 1）がある
    And 取引の直前に、その月が確定する
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録されず「この月は確定済みです」が返り、担当は「未」のまま

  Scenario: (c) 取引の直前に種類の単価が変わる
    Given 太郎の今日の皿洗い（未・version 1）があり、皿洗いの単価は 100 円
    And 取引の直前に、皿洗いの単価が 120 円に変わる
    When 太郎がその皿洗いを version 1 で記録する
    Then 読み直して新しい単価 120 円で記録され、書き込みは 2 回になる

  Scenario: (d) 同じ本人の 2 つの要求のうち片方だけが成功する
    Given 太郎の今日の皿洗い（未・version 1）がある
    And 1 回目の取引の直前に、別の要求が先に同じ担当を記録する（version 2・太郎）
    When 太郎がその皿洗いを version 1 で記録する
    Then 読み直して二重押しとして成功の返事が返り、記録は 1 件のまま

  Scenario: (d') 取引の直前に管理者が先に「済にする」
    Given 太郎の今日の皿洗い（未・version 1）がある
    And 取引の直前に、その担当がお母さんにより済にされる（version 2）
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録されず「この担当はすでに『済』になっています」が返る

  Scenario: 取引が 2 回続けて断られると INTERNAL（書き込みは 2 回で止まる）
    Given 太郎の今日の皿洗い（未・version 1）があり、取引が 2 回続けて断られる
    When 太郎がその皿洗いを version 1 で記録する
    Then 「うまく記録できませんでした。もう一度お試しください」が返り、書き込みは 2 回で止まる

  Scenario: 思いがけない Code（ThrottlingError）は読み直さずに投げ直す
    Given 太郎の今日の皿洗い（未・version 1）があり、取引が ThrottlingError で断られる
    When 太郎がその皿洗いを version 1 で記録する
    Then 例外が投げ直され、書き込みは 1 回で止まる

  Scenario: 書けたあとに onDutyRecorded が 1 回だけ呼ばれる
    Given 太郎の今日の皿洗い（未・version 1）があり、記録のフックが登録されている
    When 太郎がその皿洗いを version 1 で記録する
    Then フックが担当の情報つきで 1 回だけ呼ばれ、記録は成功する

  Scenario: フックが投げても記録は成功のまま返る
    Given 太郎の今日の皿洗い（未・version 1）があり、投げるフックが登録されている
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録は成功し、担当は status=done になる

  Scenario: 二重押し（alreadyRecorded）ではフックを呼ばない
    Given 太郎の今日の皿洗いが、太郎により済になっている
    And 記録のフックが登録されている
    When 太郎がその皿洗いを version 1 で記録する
    Then 二重押しとして成功の返事が返り、フックは呼ばれない

  Scenario: フックが登録されていなければ何もしない
    Given 太郎の今日の皿洗い（未・version 1）があり、フックは登録されていない
    When 太郎がその皿洗いを version 1 で記録する
    Then 記録は成功し、警告のログは残らない
