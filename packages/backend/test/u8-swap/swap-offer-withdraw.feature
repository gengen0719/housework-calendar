Feature: 担当を選んで申し出る・申し出をやめる
  子供が自分の担当を選ぶと、その担当に申し出が 1 つだけできる。申し出た本人は、引き受けられる前なら取り下げられる。
  今日は日本時間の 2027-01-08 とする。

  Scenario: 子供が自分の「未」の担当を選ぶと、open の申し出が書かれる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 太郎がその担当を選んで申し出る
    Then 申し出の ID が返り、申し出は open で太郎・version 2 を持ち、担当は書き換わらない

  Scenario: 存在しない担当・ほかの家族の担当を選ぶと NOT_FOUND になる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And ほかの家族の担当がある
    When 太郎が存在しない担当とほかの家族の担当をそれぞれ選ぶ
    Then どちらも NOT_FOUND で、申し出は作られない

  Scenario: ほかの子供・管理者が選ぶと OFFER_OWNER_ONLY になり、何も変わらない
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 花子と管理者が太郎の担当を選ぶ
    Then どちらも OFFER_OWNER_ONLY で、申し出は作られない

  Scenario: 確定している月の担当は MONTH_CONFIRMED になる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And 2027-01 が確定している
    When 太郎がその担当を選んで申し出る
    Then 理由の印 MONTH_CONFIRMED が返り、申し出は作られない

  Scenario: 済・×・過ぎた日の担当は DUTY_NOT_TODO になる
    Given 太郎の済の担当、×の担当、過ぎた日の「未」の担当がある
    When 太郎がそれぞれを選んで申し出る
    Then どれも DUTY_NOT_TODO で、申し出は作られない

  Scenario: すでに有効な申し出がある担当は ALREADY_OFFERED になり、二度押しでも申し出は 1 つのまま
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 太郎がその担当を 2 回選んで申し出る
    Then 1 回目は成功し、2 回目は ALREADY_OFFERED で、申し出は 1 つのまま変わらない

  Scenario: 担当が引き受けなどで変わったあとの古い選択ボタンは、元の持ち主だけ DUTY_CHANGED になる
    Given 太郎の皿洗いを花子が引き受けたあとの状態がある
    When 太郎・管理者・次郎が古い選択ボタンで同じ担当を選ぶ
    Then 太郎は DUTY_CHANGED、管理者と次郎は OFFER_OWNER_ONLY になる

  Scenario: 取り下げ・自動でなくなった申し出の担当は、新しい申し出の ID で申し出し直せる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 太郎が申し出て取り下げ、もう一度申し出て、その申し出が掃除で cancelled になり、もう一度申し出る
    Then 申し出の ID はそのつど新しくなり、古い ID の「申し出をやめる」は OFFER_GONE になる

  Scenario: 申し出た本人は、引き受けられる前なら取り下げられる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And 担当の version 2 に出された太郎の open の申し出が残っている
    When 太郎が申し出をやめる
    Then 申し出は withdrawn になり、担当は変わらず、そのあと花子が引き受けると OFFER_GONE になる

  Scenario: 本人以外（管理者を含む）は取り下げられない
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And 担当の version 2 に出された太郎の open の申し出が残っている
    When 花子と管理者が申し出をやめる
    Then どちらも OFFER_OWNER_ONLY で、申し出は open のままである

  Scenario: 引き受け済み・ない・ID が違う・終わった申し出の取り下げは、決まった印で断られる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 引き受け済み、申し出なし、ID 違い、withdrawn、cancelled、担当が変わった open のそれぞれを太郎が取り下げる
    Then 引き受け済みは OFFER_ALREADY_ACCEPTED、ほかはすべて OFFER_GONE になる

  Scenario: 申し出の書き込みの直前に状況が変わると、読み直して決まった印を返す
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 書き込みの直前に担当が済になる、月が確定される、同じ担当に有効な申し出が入るを別々に起こして申し出る
    Then DUTY_NOT_TODO、MONTH_CONFIRMED、ALREADY_OFFERED の順に返り、そのつど読み直しが 1 回記録される

  Scenario: 2 回続けて断られると INTERNAL になり、思いがけない失敗は投げ直される
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    When 取引を 2 回続けて競合で断らせて申し出る
    And 次の取引を ThrottlingError で断らせて申し出る
    Then 1 回目は INTERNAL（書き込みの呼び出しは 2 回）で何も書かれず、2 回目はエラーとして投げ直される

  Scenario: 取り下げと引き受けが競合して引き受けが先なら、取り下げは OFFER_ALREADY_ACCEPTED になる
    Given 太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある
    And 担当の version 2 に出された太郎の open の申し出が残っている
    When 取り下げの書き込みの直前に花子が先に引き受ける
    Then 太郎の取り下げは OFFER_ALREADY_ACCEPTED で、担当は花子のままである
