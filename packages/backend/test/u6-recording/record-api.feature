Feature: 画面用 API で担当を記録する（POST /v1/duties/:dutyId/record）（BR7.4、BR7.10、NFR4.60〜NFR4.62）
  子供本人だけが自分の担当を記録でき、確定していない月なら月をまたいで記録できる。
  確かめの順番は、担当の 404 → 本文（422）→ 本人か（403）の順。結果の値はすべて裏側が決める。

  Scenario: 子供が自分の「未」の担当を記録すると 200 で Duty が返る
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎が POST /record を version 1 で呼ぶ
    Then 200 で status=done・recordedBy=太郎・unitPrice=100 の Duty が返る

  Scenario: 前の月の担当も記録できる（月をまたぐ）
    Given 太郎の前の月の皿洗い（未・version 1）がある
    When 太郎が前の月の担当を POST /record で version 1 で呼ぶ
    Then 200 で status=done が返る

  Scenario: 確定した月の担当は 409 MONTH_CONFIRMED
    Given 太郎の今日の皿洗い（未）があり、その月が確定している
    When 太郎が POST /record を version 1 で呼ぶ
    Then 409 MONTH_CONFIRMED が返る

  Scenario: 明日以降の担当は 422 FUTURE_DUTY
    Given 太郎の明日の皿洗い（未・version 1）がある
    When 太郎が明日の担当を POST /record で version 1 で呼ぶ
    Then 422 FUTURE_DUTY が返る

  Scenario: 「×」の担当は 409 DUTY_SKIPPED_BY_ADMIN
    Given 太郎の今日の皿洗いが「×」になっている
    When 太郎が POST /record を version 1 で呼ぶ
    Then 409 DUTY_SKIPPED_BY_ADMIN が返る

  Scenario: ほかの子供の担当は 403 NOT_OWN_DUTY
    Given 花子の今日の皿洗い（未・version 1）がある
    When 太郎が花子の担当を POST /record で version 1 で呼ぶ
    Then 403 NOT_OWN_DUTY が返る

  Scenario: 管理者のセッションは 403 NOT_OWN_DUTY
    Given 太郎の今日の皿洗い（未・version 1）がある
    When お母さんが POST /record を version 1 で呼ぶ
    Then 403 NOT_OWN_DUTY が返る

  Scenario: 本人の 2 回目は 200（同じ Duty）
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎が POST /record を version 1 で 2 回呼ぶ
    Then どちらも 200 で status=done が返り、記録は 1 件のまま

  Scenario: ほかの家族の dutyId は本文が正しくても 404
    Given 太郎の家族にない dutyId を、正しい本文で呼ぶ
    When 太郎が存在しない dutyId を POST /record で version 1 で呼ぶ
    Then 404 NOT_FOUND が返る

  Scenario: ほかの家族の dutyId は本文が誤っていても 404（本文より先に 404）
    Given 太郎の家族にない dutyId を、誤った本文で呼ぶ
    When 太郎が存在しない dutyId を POST /record で誤った本文で呼ぶ
    Then 404 NOT_FOUND が返る

  Scenario: 形の違う dutyId（大文字 UUID）は DynamoDB を読まずに 404
    Given 太郎が大文字の UUID の dutyId を呼ぶ
    When 太郎がその dutyId を POST /record で version 1 で呼ぶ
    Then 404 NOT_FOUND が返り、Calendar を読まない

  Scenario: 本文なしは 422 INVALID_REQUEST
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎が POST /record を本文なしで呼ぶ
    Then 422 INVALID_REQUEST が返る

  Scenario: version が文字列や負の数は 422 INVALID_REQUEST
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎が POST /record を負の version で呼ぶ
    Then 422 INVALID_REQUEST が返る

  Scenario: 余分な項目を付けても、書かれる値は裏側のもの
    Given 太郎の今日の皿洗い（未・version 1）がある
    When 太郎が POST /record に version と余分な unitPrice・recordedBy を付けて呼ぶ
    Then 200 で unitPrice=100・recordedBy=太郎 が返る（本文の値は無視される）

  Scenario: 取引の直前に「×」にされると読み直して 409 DUTY_SKIPPED_BY_ADMIN
    Given 太郎の今日の皿洗い（未・version 1）があり、取引の直前に「×」にされる
    When 太郎が POST /record を version 1 で呼ぶ
    Then 409 DUTY_SKIPPED_BY_ADMIN が返り、担当は「×」のまま
