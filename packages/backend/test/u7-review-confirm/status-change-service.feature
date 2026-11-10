Feature: 状態の変更・確定・取り消しのサービス（U7。BR8.2・BR8.4〜BR8.7、BR8.11〜BR8.16、BR8.18、NFR2.44〜NFR2.49）
  changeDutyStatus・confirmMonth・unconfirmMonth の判定の順・競合の差し込み・冪等・フックを、
  偽の DynamoDB で確かめる。外部への通信（fetch）は 1 回も起きない。

  Scenario: 5 とおりの遷移が成功する
    Given 確定していない 2027-01 がある
    When 太郎の担当を 5 とおり（未→済、×→済、済→未、済→×、未→×、×→未）に変える
    Then どれも成功し、担当の状態が操作後の状態になる

  Scenario: 判定の順番（NOT_FOUND → MONTH_CONFIRMED → INVALID_TRANSITION）
    Given ほかの家族の担当・確定した月・表にない組をそれぞれ用意する
    When それぞれに状態の変更を送る
    Then ほかの家族は NOT_FOUND、確定した月は MONTH_CONFIRMED、表にない組は INVALID_TRANSITION

  Scenario: (a) 取引の直前に担当が変わる → 読み直して INVALID_TRANSITION
    Given 太郎の皿洗い（済・version 2）と、確定していない 2027-01 がある
    And 取引の直前に、その担当が先に「未」に戻される（version 3）
    When 管理者が version 2 で cancel（取り消す）を送る
    Then 読み直して INVALID_TRANSITION になり、担当は未のまま

  Scenario: 古い画面の version で送ると書かれず「先に変更された」になる（取り消す・済にする・×→済）
    Given 画面が version 1 の担当を見せたあと、別端末で担当が変わって version 2 になっている
    When 古い version 1 で cancel・markDone・（×の担当への）markDone を送る
    Then どれも INVALID_TRANSITION（409）で、担当は変わらない

  Scenario: (b) 取引の直前に月が確定する → MONTH_CONFIRMED
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And 取引の直前に、その月が確定する
    When 管理者が markDone を送る
    Then 読み直して MONTH_CONFIRMED になり、担当は未のまま

  Scenario: (c) markDone で単価が変わる → 新しい単価で書き直す
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01、単価 120 円がある
    And 取引の直前に、皿洗いの単価が 150 円に変わる
    When 管理者が markDone を送る
    Then 読み直して新しい単価 150 円で済になり、書き込みは 2 回

  Scenario: 2 回続けて断られると INTERNAL（書き込みは 2 回で止まる）
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 があり、取引が 2 回断られる
    When 管理者が markDone を送る
    Then INTERNAL になり、書き込みは 2 回で止まる

  Scenario: 「未」でなくなったときだけフックを 1 回呼ぶ
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01、フックが登録されている
    When 管理者が markDone を送る
    Then 成功し、フックが status-changed で 1 回呼ばれる

  Scenario: cancel・unmarkSkipped（未に戻る）ではフックを呼ばない
    Given 太郎の皿洗い（済・version 2）と、確定していない 2027-01、フックが登録されている
    When 管理者が cancel を送る
    Then 成功し、フックは呼ばれない

  Scenario: confirmMonth は行のない月に version=1 を作り、unconfirmMonth は行のない月で何もしない
    Given 記録のない 2027-03 がある
    When confirmMonth（2027-03）、続けて unconfirmMonth（2027-03）を送る
    Then 確定で version=1 の行ができ、取り消しで未確定になる

  Scenario: 確定・取り消しの連打で最後の操作の結果にそろう（冪等）
    Given 確定していない 2027-01 がある
    When confirmMonth → unconfirmMonth → confirmMonth を続けて送る
    Then 2027-01 は確定済みになる

  Scenario: 状態の変更でも確定でも、外部への通信（fetch）は 1 回も起きない
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 管理者が markDone を送り、2027-01 を確定する
    Then fetch は 1 回も呼ばれない
