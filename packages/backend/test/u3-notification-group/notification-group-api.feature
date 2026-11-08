Feature: お知らせ先を画面に見せる API
  家族のメンバーは、お知らせ先のグループの名前と登録した時刻を見られる。グループ ID は返さない。

  Scenario: お知らせ先があれば、グループの名前と登録した時刻が返りグループ ID は返らない
    Given 山田家はグループ「山田家のグループ」をお知らせ先にしている
    When 管理者のお母さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で、グループの名前と登録した時刻だけが返る
    And グループ ID は応答のどこにもない

  Scenario: 子供も同じ内容を見られる
    Given 山田家はグループ「山田家のグループ」をお知らせ先にしている
    And 山田家には子供の太郎さんがいる
    When 子供の太郎さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で、グループの名前と登録した時刻だけが返る

  Scenario: グループの名前を受け取れていなければ名前は null で返る
    Given 山田家は名前のないグループをお知らせ先にしている
    When 管理者のお母さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で、名前は null で登録した時刻が返る

  Scenario: お知らせ先がなければ null が返る
    Given 山田家にはお知らせ先がない
    When 管理者のお母さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で本文は null になる

  Scenario: 家族のお知らせ先の記録がテーブルにないときも null が返る
    Given 山田家は記録のないグループ「C_old」を指している
    When 管理者のお母さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で本文は null になる

  Scenario: 家族に入っていない人は 403
    Given 山田家はグループ「山田家のグループ」をお知らせ先にしている
    And 家族に入っていない花子さんがいる
    When 花子さんが GET /v1/family/notification-group を呼ぶ
    Then 403 で理由は NOT_FAMILY_MEMBER になり、グループの情報は返らない

  Scenario: セッションがなければ 401
    Given 山田家はグループ「山田家のグループ」をお知らせ先にしている
    When セッションなしで GET /v1/family/notification-group を呼ぶ
    Then 401 になる

  Scenario: ほかの家族のお知らせ先は見えない
    Given 山田家にはお知らせ先がない
    And 佐藤家はグループ「佐藤家のグループ」をお知らせ先にしている
    When 管理者のお母さんが GET /v1/family/notification-group を呼ぶ
    Then 200 で本文は null になる

  Scenario: getNotificationGroup は U10 のためにグループ ID を返す
    Given 山田家はグループ「山田家のグループ」をお知らせ先にしている
    When 山田家の文脈で getNotificationGroup を呼ぶ
    Then グループ ID が返る
    And お知らせ先がない家族では NOTIFICATION_GROUP_NOT_REGISTERED が返る
