Feature: 状態の変更の取引の組み立てと条件（U7。BR8.4〜BR8.6、BR8.11、BR8.12、NFR4.69）
  リポジトリが組み立てた取引の項目を、偽の DynamoDB で本当に評価して、
  markDone の 3 項目・ほかの 2 項目・条件・属性名の別名・確定／取り消しの書き方を確かめる。

  Scenario: markDone（未→済）は 3 項目で書かれ、記録の 3 項目がそろう
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01、皿洗いの単価 120 円がある
    When markDone の取引（単価 120 円）を書く
    Then 取引は成功し、担当は済・単価 120 円・記録者は管理者・version 3 になる
    And 取引の項目数は 3 である

  Scenario: markDone（×→済）は :from が skipped で、月の確かめは担当の月で行う
    Given 太郎の皿洗い（×・version 2）と、確定していない 2027-01 がある
    When markDone の取引（単価 120 円）を書く
    Then 取引は成功し、担当は済・version 3 になる

  Scenario: markDone は確定した月では断られ、何も書かれない
    Given 太郎の皿洗い（未・version 2）と、確定した 2027-01 がある
    When markDone の取引（単価 120 円）を書く
    Then 取引は競合で断られ、担当は未のまま

  Scenario: markDone は単価が先に変わると断られる（buildUnitPriceGuard）
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01、皿洗いの単価 120 円がある
    When 読んだ単価 120 円で markDone の取引を書くが、書く直前に単価が 150 円に変わる
    Then 取引は競合で断られ、担当は未のまま

  Scenario: cancel（済→未）は 2 項目で、記録の 3 項目が同時に消える
    Given 太郎の皿洗い（済・単価 120 円・記録者は管理者・version 2）と、確定していない 2027-01 がある
    When cancel の取引を書く
    Then 取引は成功し、担当は未になり、recordedAt・recordedBy・unitPrice が 3 つとも消える
    And 取引の項目数は 2 である

  Scenario: markSkipped（済→×）は記録の 3 項目を消し、単価の確かめを付けない
    Given 太郎の皿洗い（済・単価 120 円・記録者は管理者・version 2）と、確定していない 2027-01 がある
    When markSkipped（×へ）の取引を書く
    Then 取引は成功し、担当は×になり、記録の 3 項目が消える

  Scenario: version が先に進むと担当の Update が断られる（見せたあとに変わった担当を上書きしない）
    Given 太郎の皿洗い（済・version 5）と、確定していない 2027-01 がある
    When version 2 として組み立てた cancel の取引を書く
    Then 取引は競合で断られ、担当は済のまま

  Scenario: 確定は行のない月に version=1 の行を作る
    Given 行のない 2027-03 がある
    When 2027-03 に putConfirmedMonthIfAbsent を呼ぶ
    Then written が返り、2027-03 の行は確定・version=1 になる

  Scenario: 確定は行がある月に UpdateItem でそろえる（version を条件にしない）
    Given 確定していない 2027-01（version 4）がある
    When 2027-01 に updateMonthConfirmation（確定）を呼ぶ
    Then written が返り、2027-01 は確定・version=5 になる

  Scenario: 取り消しは行がある月を false にし、行のない月は何もしない
    Given 確定した 2027-01（version 2）と、行のない 2027-03 がある
    When 2027-01 と 2027-03 に updateMonthConfirmation（取り消し）を呼ぶ
    Then 2027-01 は未確定・version=3 になり、2027-03 は行が作られない
