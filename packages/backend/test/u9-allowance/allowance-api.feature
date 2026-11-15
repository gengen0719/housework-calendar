Feature: お小遣いの入口（U9 — GET /v1/months/:month/allowances）
  家族のメンバーが、指定した月のお小遣いの一覧を読む。
  確かめの順番はセッション → ブロック中 → 家族のメンバー → 月の形。
  家族はセッションから決まり、クエリや本文を読まない。S20〜S26、S31、S35。

  Scenario: セッションなしは 401
    Given 山田家が初期化されている
    When セッションなしで GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 401 で、DynamoDB の月の読み取りは 0 回

  Scenario: ブロック中（友だち解除）は 403 NOT_FRIEND
    Given 山田家が初期化されている
    When ブロック中の利用者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 403 NOT_FRIEND で、DynamoDB の月の読み取りは 0 回

  Scenario: 家族のメンバーでない人は 403 NOT_FAMILY_MEMBER
    Given 山田家が初期化されている
    When メンバーでない利用者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 403 NOT_FAMILY_MEMBER で、DynamoDB の月の読み取りは 0 回

  Scenario: 月が不正（2027-13）は 422 INVALID_MONTH
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/2027-13/allowances を呼ぶ
    Then 応答は 422 INVALID_MONTH で、DynamoDB の月の読み取りは 0 回

  Scenario: 月が不正（abc）は 422 INVALID_MONTH
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/abc/allowances を呼ぶ
    Then 応答は 422 INVALID_MONTH

  Scenario: 月が不正（2027-1）は 422 INVALID_MONTH（ゼロ埋めなし）
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/2027-1/allowances を呼ぶ
    Then 応答は 422 INVALID_MONTH

  Scenario: 月が不正（Current）は 422 INVALID_MONTH（大文字違い）
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/Current/allowances を呼ぶ
    Then 応答は 422 INVALID_MONTH

  Scenario: 月が不正（current 末尾の空白あり）は 422 INVALID_MONTH
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/current%20/allowances を呼ぶ
    Then 応答は 422 INVALID_MONTH

  Scenario: セッションなしで月が不正でも 401（確かめの順番）
    Given 山田家が初期化されている
    When セッションなしで GET /v1/months/2027-99/allowances を呼ぶ
    Then 応答は 401

  Scenario: 管理者は 200 で家族全員の額が返る（S20・S21）
    Given 山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 8 回・風呂掃除 150 円が 4 回の「済」がある
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 AllowanceMonthView で、太郎の合計は 1400 で次郎の合計は 0 で管理者の行はない

  Scenario: 子供も 200 で家族全員の額が返る（S20）
    Given 山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 8 回・風呂掃除 150 円が 4 回の「済」がある
    When 子供の太郎で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 AllowanceMonthView で、太郎の合計は 1400

  Scenario: month=current は日本時間の今日の月として扱う（S35。UTC 14:59 JST 23:59）
    Given 山田家が初期化されていて、今が UTC 2027-01-31T14:59:59Z
    When 管理者で GET /v1/months/current/allowances を呼ぶ
    Then 応答は 200 で month は 2027-01 で today は 2027-01-31

  Scenario: month=current は日本時間の今日の月として扱う（S35。UTC 15:00 JST 翌日0:00）
    Given 山田家が初期化されていて、今が UTC 2027-01-31T15:00:00Z
    When 管理者で GET /v1/months/current/allowances を呼ぶ
    Then 応答は 200 で month は 2027-02 で today は 2027-02-01

  Scenario: month=current は端末の時計を使わない（now を 1 回取る）
    Given 山田家が初期化されていて、今が UTC 2027-01-20T10:00:00Z
    When 管理者で GET /v1/months/current/allowances を呼ぶ
    Then 応答は 200 で month は 2027-01

  Scenario: 確定している月は confirmed が true（S24）
    Given 山田家が初期化されて、2027-01 が確定している
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 で confirmed は true

  Scenario: 確定していない月は confirmed が false（S25）
    Given 山田家が初期化されて、2027-01 が確定していない
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 で confirmed は false

  Scenario: 月の状態の行がない月は confirmed が false
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 で confirmed は false

  Scenario: 範囲（firstMonth・lastMonth）が答えに入る（S26）
    Given 山田家が初期化されていて家族の作成時刻が UTC 2026-11-01T00:00:00Z で今が UTC 2027-01-20T10:00:00Z
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 で firstMonth は 2026-11 で lastMonth は 2027-02

  Scenario: 成功の 200 に cache-control: no-store が付く（NFR4.92）
    Given 山田家が初期化されている
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 200 でヘッダーに cache-control: no-store が付く

  Scenario: エラーの応答には cache-control が付かない
    Given 山田家が初期化されている
    When セッションなしで GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 401 で cache-control ヘッダーがない

  Scenario: 応答の JSON 項目名が許可した一覧と完全一致（NFR4.91）
    Given 山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 1 回の「済」がある
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答の AllowanceMonthView の項目名が許可した一覧と完全一致する

  Scenario: 読み取りが失敗すると 500 INTERNAL（S31）
    Given 山田家が初期化されて、Calendar の読み取りが失敗する
    When 管理者で GET /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 500 INTERNAL で本文に名前や金額が入らない

  Scenario: PUT allowances は 404（書き込みの入口がない）
    Given 山田家が初期化されている
    When 管理者で PUT /v1/months/2027-01/allowances を呼ぶ
    Then 応答は 404
