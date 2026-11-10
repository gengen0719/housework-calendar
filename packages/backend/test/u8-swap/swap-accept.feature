Feature: 申し出を引き受ける
  別の子供が「引き受ける」を押すと、先着 1 人だけが成立し、担当の子供がその子供に変わって origin が swap になる。
  引き受けでは担当を変える通知（フック）は呼ばない。今日は日本時間の 2027-01-08 とする。

  Scenario: 別の子供が引き受けると、担当の子供と origin だけが変わり、申し出は accepted になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 花子が引き受ける
    Then 担当の子供は花子、origin は swap、version は 3 になり、状態・日付・種類は変わらない
    And 申し出は accepted で受け手と時刻が残り、花子の別の担当・ほかの項目は変わらない
    And 担当を変える通知も記録の通知も呼ばれない

  Scenario: なくなった申し出を引き受けると OFFER_GONE になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 申し出なし、ID 違い、withdrawn、cancelled、ほかの家族の担当のそれぞれを花子が引き受ける
    Then すべて OFFER_GONE で、担当は変わらない

  Scenario: 担当が変わった・済・日が過ぎた・月が確定した open の申し出も OFFER_GONE になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 担当の version 違い、済、過ぎた日、確定済みの月のそれぞれを花子が引き受ける
    Then すべて OFFER_GONE で、担当の子供は太郎のままである

  Scenario: 管理者と申し出た本人は CANNOT_ACCEPT_OWN_OFFER になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 管理者と太郎が引き受ける
    And 花子が引き受けたあとで、管理者と太郎がもう一度引き受ける
    Then どれも CANNOT_ACCEPT_OWN_OFFER になる

  Scenario: 引き受けられたあとに押すと OFFER_ALREADY_ACCEPTED になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 花子が引き受けたあとで、次郎と花子がもう一度引き受ける
    Then どちらも OFFER_ALREADY_ACCEPTED で、担当は花子のままである

  Scenario: 同時に押した 2 人のうち先の 1 人だけが成立する
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 花子の書き込みの直前に次郎が先に引き受ける
    Then 花子は OFFER_ALREADY_ACCEPTED で、担当は次郎になり、読み直しが 1 回記録される

  Scenario: 書き込みの直前に取り下げられた・担当が変わった場合は OFFER_GONE になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 書き込みの直前に取り下げられる、管理者が担当を次郎に変えるを別々に起こして花子が引き受ける
    Then どちらも OFFER_GONE になり、読み直しが記録される

  Scenario: 引き受けた担当をさらに申し出て別の子供が引き受けられ、古い申し出の ID は OFFER_GONE になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 花子が引き受け、花子が同じ担当を申し出て、次郎が引き受ける
    Then 担当は次郎・origin は swap・version は 4 で、太郎の古い申し出の ID は OFFER_GONE になる

  Scenario: 読み取りは上限の中で、LINE のプロフィール取得は呼ばれない
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 花子が引き受ける
    Then 読み取りは Get 4 回と Query 1 回までで、取引は 1 回、外部への通信は 0 回である

  Scenario: 2 回続けて断られると INTERNAL になり、何も書かれない
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある
    When 取引を 2 回続けて競合で断らせて花子が引き受ける
    Then INTERNAL で、担当は太郎のまま、申し出は open のままである
