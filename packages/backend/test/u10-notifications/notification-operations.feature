Feature: 運用の失敗を家族とは別に知らせる
  Scenario: メールの本文を許可項目だけにする
    Given 内部処理が失敗する
    When 運用通知を送る
    Then 本文や名前をメールへ含めない
