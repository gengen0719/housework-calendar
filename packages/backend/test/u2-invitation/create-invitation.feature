Feature: 招待用のリンクを作る・見る
  管理者（お母さん）は、家族に子供を招待するリンクを作り、いまのリンクと期限を見られる。
  リンクは作ってから 24 時間使える。作り直すと前のリンクは使えなくなる。子供は作れない。

  Scenario: 管理者が招待を作ると、22 文字の印を含むリンクと 24 時間後の期限が返る
    Given 山田家の管理者のお母さんがいる
    When お母さんが招待用のリンクを作る
    Then 応答は 201 になる
    And リンクは LIFF の URL に 22 文字の印を付けたものである
    And 期限は作った時刻の 24 時間後である

  Scenario: 招待がなければ、いまの招待は null
    Given 山田家の管理者のお母さんがいる
    When お母さんがいまの招待を見る
    Then 応答は 200 で本文は null になる

  Scenario: 管理者がいまの招待を見ると、作ったときと同じリンクと期限が返る
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    When お母さんがいまの招待を見る
    Then 作ったときと同じリンクと期限が返る

  Scenario: 作り直すと、前の招待は使えなくなり、いまの招待は新しいものになる
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    When お母さんが別の Idempotency-Key で招待用のリンクを作り直す
    Then 新しいリンクは前のリンクと違う
    And 前の招待は作り直された状態になり、新しい招待は使える状態になる
    And いまの招待を見ると新しいリンクが返る

  Scenario: 子供が作ろうとすると 403 ADMIN_ONLY で、招待はできない
    Given 山田家の管理者のお母さんと子供の太郎がいる
    When 太郎が招待用のリンクを作ろうとする
    Then 応答は 403 で理由は ADMIN_ONLY になる
    And 招待は 1 つもできていない

  Scenario: 子供がいまの招待を見ようとしても 403 ADMIN_ONLY
    Given 山田家の管理者のお母さんと子供の太郎がいる
    When 太郎がいまの招待を見ようとする
    Then 応答は 403 で理由は ADMIN_ONLY になる

  Scenario: 同じ Idempotency-Key で 2 回送ると、招待は 1 つで、同じリンクが返る
    Given 山田家の管理者のお母さんがいる
    When お母さんが同じ Idempotency-Key で招待用のリンクを 2 回作る
    Then どちらの応答も 201 で同じリンクと期限である
    And 招待は 1 つだけできている

  Scenario: 同じ Idempotency-Key で別の操作の記録があると 422 IDEMPOTENCY_KEY_REUSED
    Given 山田家の管理者のお母さんがいる
    And 同じ Idempotency-Key で別の家族の招待の記録がある
    When お母さんがその Idempotency-Key で招待用のリンクを作る
    Then 応答は 422 で理由は IDEMPOTENCY_KEY_REUSED になる
    And 招待は 1 つもできていない

  Scenario: Idempotency-Key がなければ 400 IDEMPOTENCY_KEY_REQUIRED
    Given 山田家の管理者のお母さんがいる
    When お母さんが Idempotency-Key なしで招待用のリンクを作る
    Then 応答は 400 で理由は IDEMPOTENCY_KEY_REQUIRED になる

  Scenario: 2 つの端末から同時に作り直すと、使える招待は 1 つだけになる
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    And 1 つ目の端末が読んだあとに、2 つ目の端末の作り直しが先に入る
    When 1 つ目の端末が作り直す
    Then 応答は 201 になる
    And 使える招待は 1 つだけである
    And 最後に作った招待がいまの招待である

  Scenario: 作り直しの競合が続いたら 500 INTERNAL で、使える招待は変わらない
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    And 作り直しのたびに別の端末の作り直しが先に入る
    When お母さんが別の Idempotency-Key で招待用のリンクを作り直す
    Then 応答は 500 で理由は INTERNAL になる

  Scenario: 前の招待が TTL で消えたあとでも、作り直せる
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    And 前の招待の項目が TTL で消えている
    When お母さんが別の Idempotency-Key で招待用のリンクを作り直す
    Then 応答は 201 になる
    And いまの招待を見ると新しいリンクが返る

  Scenario: 読んだあとに前の招待が TTL で消えても、やり直して作り直せる
    Given 山田家の管理者のお母さんがいる
    And お母さんが招待用のリンクを作ってある
    And 作り直しの取引の直前に前の招待の項目が TTL で消える
    When お母さんが別の Idempotency-Key で招待用のリンクを作り直す
    Then 応答は 201 になる
    And 使える招待は 1 つだけである

  Scenario: 招待を作ったログに、印の先頭 4 文字だけが出る
    Given 山田家の管理者のお母さんがいる
    When お母さんが招待用のリンクを作る
    Then INVITATION_CREATED のログに印の先頭 4 文字が tokenPrefix として出る
    And どのログの行にも印の全体が含まれない
