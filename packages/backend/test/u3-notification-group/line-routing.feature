Feature: グループのイベントの振り分けと打ち切り
  グループの会話のたびに記録を書かないよう、登録の操作にあたるものだけを処理する。
  署名の確かめは U1 のまま、join・leave・postback にも効く。follow・unfollow は U1 と同じに動く。

  Scenario: グループでのただの会話は記録も返事もない
    Given 家族のグループで「今日の夕飯どうする？」と送られる
    When Webhook が届く
    Then 応答は 200 になる
    And 二度処理しない記録は書かれない
    And 返事は送られない
    And イベントは無視されたとログに残る

  Scenario: 「登録」と送ると登録の操作として扱われる
    Given 家族のグループで「 登録 」と送られる
    When Webhook が届く
    Then 応答は 200 になる
    And そのイベントは操作として処理済みの記録になる

  Scenario: 似た文字では登録の操作にならない
    Given 家族のグループで「登録して」と送られる
    When Webhook が届く
    Then 二度処理しない記録は書かれない
    And イベントは無視されたとログに残る

  Scenario: 「とうろく」でも登録の操作にならない
    Given 家族のグループで「とうろく」と送られる
    When Webhook が届く
    Then 二度処理しない記録は書かれない

  Scenario: 知らない postback の data と 300 文字を超える data は何もしない
    Given 家族のグループで知らない data の postback と、300 文字を超える data の postback が届く
    When Webhook が届く
    Then 応答は 200 になる
    And 二度処理しない記録は書かれない
    And 返事は送られない

  Scenario: 決まった data の postback は登録の操作として扱われる
    Given 家族のグループでボタンの postback「action=group.register」が届く
    When Webhook が届く
    Then そのイベントは操作として処理済みの記録になる

  Scenario: 5000 文字を超える文字が届いても本文全体は 400 にならず、そのイベントだけ何もしない
    Given 家族のグループで 5001 文字の文字と「登録」が同じ Webhook に入って届く
    When Webhook が届く
    Then 応答は 200 になる
    And 処理済みの記録は「登録」のイベントの 1 件だけである

  Scenario: 署名のない join・leave・postback は 401 で処理されない
    Given 家族のグループの join と leave と postback が入った Webhook を間違った署名で届ける
    When Webhook が届く
    Then 応答は 401 になる
    And 二度処理しない記録は書かれない

  Scenario: follow と unfollow は U1 と同じに動く
    Given 花子さんの友だち登録とブロックが続けて届く
    When Webhook が届く
    Then 応答は 200 になる
    And 花子さんはブロック中と記録される
    And 二度処理しない記録は 2 件とも処理済みになる

  Scenario: 1 対 1 のトークで「登録」と送ると操作として扱われ、room では扱われない
    Given 1 対 1 のトークの「登録」と、複数人のトーク（room）の「登録」が届く
    When Webhook が届く
    Then 処理済みの記録は 1 対 1 のイベントの 1 件だけである
