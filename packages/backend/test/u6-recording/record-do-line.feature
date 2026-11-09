Feature: LINE で担当を記録する（record.do）（BR7.4〜BR7.9、BR7.12、BR7.17、NFR2.33〜NFR2.35）
  子供が選択肢のボタンを押すと、自分の「未」の今日の担当を「済」にし、本人にだけ返事する。
  二重押し・競合・失敗は、読み直しと取引の条件で正しく分かれる。

  Scenario: 正しい version で押すと記録され、本人に時刻つきの返事が返る
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎がその皿洗いを version 1 で記録する
    Then 「皿洗いを記録しました（16:42）」が本人に reply される
    And 担当が status=done・recordedBy=太郎・unitPrice=100・version=2 になる

  Scenario: 記録後の unitPrice は記録直前の単価と一致する
    Given 太郎の今日の皿洗い（未・version 1）があり、皿洗いの単価は 100 円
    When 太郎がその皿洗いを version 1 で記録する
    Then 担当の unitPrice は 100 である

  Scenario: 本人が 2 回目に同じボタンを押すと最初の時刻の返事が返り、記録は 1 件のまま
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎がその皿洗いを version 1 で 2 回続けて記録する
    Then どちらも「皿洗いを記録しました（16:42）」が返り、書き込みは 1 回だけ

  Scenario: version が違うと「変更されました」と今の選択肢が返る
    Given 太郎の今日の皿洗い（未・version 2）がある
    When 太郎がその皿洗いを version 1 で記録する
    Then 「この担当は先に変更されました」と今の選択肢が返る

  Scenario: すでに管理者が済にしていると「すでに済です」と今の選択肢が返る
    Given 太郎の今日の皿洗いが、お母さんにより済になっている
    When 太郎がその皿洗いを version 1 で記録する
    Then 「この担当はすでに『済』になっています」と今の選択肢が返る

  Scenario: 「×」の担当は「変更されました」と今の選択肢が返る
    Given 太郎の今日の皿洗いが「×」になっている
    When 太郎がその皿洗いを version 1 で記録する
    Then 「この担当は先に変更されました」と今の選択肢が返る

  Scenario: 月が確定していると確定済みの文だけが返る（出し直しなし）
    Given 太郎の今日の皿洗い（未）があり、その月が確定している
    When 太郎がその皿洗いを version 1 で記録する
    Then 「この月は確定済みです」だけが返る

  Scenario: ほかの家族の dutyId は「変更されました」と今の選択肢が返る
    Given 太郎の今日の皿洗い（未）があり、ほかの家族の担当の dutyId を押す
    When 太郎がその dutyId を version 1 で記録する
    Then 「この担当は先に変更されました」と今の選択肢が返る

  Scenario: 取引が 1 回失敗して読み直すと新しい単価で記録される（単価の差し込み）
    Given 太郎の今日の皿洗い（未・version 1）があり、取引の直前に単価が 120 円に変わる
    When 太郎がその皿洗いを version 1 で記録する
    Then 担当の unitPrice は 120 で、記録される

  Scenario: 取引が 2 回続けて失敗すると INTERNAL の文言が返り、担当は「未」のまま
    Given 太郎の今日の皿洗い（未・version 1）があり、取引が 2 回続けて失敗する
    When 太郎がその皿洗いを version 1 で記録する
    Then 「うまく記録できませんでした。もう一度お試しください」が返り、担当は「未」のまま

  Scenario: reply の呼び出しは POST /v2/bot/message/reply だけ・1 回
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎がその皿洗いを version 1 で記録する
    Then LINE への呼び出しは reply が 1 回だけで、push・multicast・broadcast はない

  Scenario: 日本時間の 0 時をまたいで押すと NOT_TODAY_DUTY（出し直し）
    Given 太郎の 1 月 7 日の皿洗い（未・version 1）がある
    When 1 月 8 日 0 時 5 分に太郎がその皿洗いを version 1 で記録する
    Then 「この担当は先に変更されました」が返り、担当は「未」のまま
