Feature: 振り分けとログで招待の印を伏せる
  招待の印はパスの中にある。画面用 API は、パスをパスの型（/v1/invitations/:token）に直してから
  ログを書き、印の全体はどのログの行にも出さない。

  Scenario: 招待のパスはパスの型に振り分けられる
    Given 招待の印が入ったパスを受ける窓口がある
    When 画面が /v1/invitations/ に招待の印を付けた要求を送る
    Then 窓口は印を受け取って応答する
    And 要求のログの path はパスの型 /v1/invitations/:token である

  Scenario: 要求のログに招待の印の全体が出ない
    Given 招待の印が入ったパスを受ける窓口がある
    When 画面が /v1/invitations/ に招待の印を付けた要求を送る
    Then 要求のログは開始と終了の行がある
    And どのログの行にも招待の印の全体が含まれない

  Scenario: 断った要求のログにも招待の印が出ない
    Given 招待の印が入ったパスを受ける窓口がある
    When 画面が秘密のヘッダーなしで招待の印を付けた要求を送る
    Then 応答は 403 になる
    And 断ったログの path はパスの型である
    And どのログの行にも招待の印の全体が含まれない

  Scenario: 型に合わないパスは 404 で、ログの path は unmatched
    When 画面が型に合わない招待の印入りのパスを送る
    Then 応答は 404 で理由は NOT_FOUND になる
    And ログの path は unmatched である
    And どのログの行にも招待の印の全体が含まれない

  Scenario: 思いがけない失敗が起きても REQUEST_ERROR に招待の印が出ない
    Given 招待の印が入ったパスを受けるが失敗する窓口がある
    When 画面が /v1/invitations/ に招待の印を付けた要求を送る
    Then 応答は 500 で理由は INTERNAL になる
    And REQUEST_ERROR のログがある
    And どのログの行にも招待の印の全体が含まれない

  Scenario: U1 の操作は前と同じに振り分けられる
    Given 家族に入っていない友だちの花子さんが記録されている
    When 画面が U1 の操作を順に送る
    Then セッションは 200、自分の情報は 200、家族を作るは 201 になる
    And ログの path はそれぞれ U1 のパスのままである
