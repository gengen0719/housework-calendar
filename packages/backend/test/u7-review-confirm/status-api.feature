Feature: 管理者が画面から担当の状態を直し、月を確定・取り消しする（画面用 API）

  Scenario: 管理者が「未」を済にすると 200 で記録の 3 項目がそろう
    Given 太郎の皿洗い（未・version 1）がある
    When お母さんが markDone を version 1 で送る
    Then 200 で status=done・recordedBy=お母さん・unitPrice=120・recordedByName=お母さん が返る

  Scenario: 管理者が「済」を取り消すと 200 で記録が消える
    Given 太郎の皿洗い（済・version 2）がある
    When お母さんが cancel を version 2 で送る
    Then 200 で status=todo で、記録の 3 項目が空になる

  Scenario: 管理者が「済」を「やらなかった」にすると 200
    Given 太郎の皿洗い（済・version 2）がある
    When お母さんが markSkipped を version 2 で送る
    Then 200 で status=skipped で、記録の 3 項目が空になる

  Scenario: 管理者が「未」を「やらなかった」にすると 200
    Given 太郎の皿洗い（未・version 1）がある
    When お母さんが markSkipped を version 1 で送る
    Then 200 で status=skipped が返る

  Scenario: 管理者が「×」を外すと 200 で「未」に戻る
    Given 太郎の皿洗い（×・version 2）がある
    When お母さんが unmarkSkipped を version 2 で送る
    Then 200 で status=todo が返る

  Scenario: 管理者が「×」を済にすると 200
    Given 太郎の皿洗い（×・version 2）がある
    When お母さんが markDone を version 2 で送る
    Then 200 で status=done・unitPrice=120 が返る

  Scenario: セッションがなければ 401
    Given 太郎の皿洗い（未・version 1）がある
    When セッションなしで status を送る
    Then 401 が返り、担当は変わらない

  Scenario: 家族に入っていない人は 403 NOT_FAMILY_MEMBER
    Given 家族に入っていない人がいる
    When その人が status を送る
    Then 403 NOT_FAMILY_MEMBER が返り、Calendar を読まない

  Scenario: 子供は 403 ADMIN_ONLY で Calendar も ChoreTypes も読まれない
    Given 太郎の皿洗い（未・version 1）がある
    When 太郎が markDone を version 1 で送る
    Then 403 ADMIN_ONLY が返り、Calendar と ChoreTypes を 1 回も読まず担当は変わらない

  Scenario: 本文の形が外れると担当を探す前に 422 INVALID_REQUEST
    Given 家族にない dutyId がある
    When お母さんが action が不正な本文でその dutyId に送る
    Then 422 INVALID_REQUEST が返り、Calendar を読まない

  Scenario: version が欠ける・文字列・負・小数は 422 INVALID_REQUEST
    Given 太郎の皿洗い（未・version 1）がある
    When お母さんが version が不正な本文を 4 とおり送る
    Then すべて 422 INVALID_REQUEST で担当は変わらない

  Scenario: dutyId の形が違うと DynamoDB を読まずに 404
    Given 大文字の UUID の dutyId がある
    When お母さんがその dutyId に正しい本文で送る
    Then 404 NOT_FOUND が返り、Calendar を読まない

  Scenario: ほかの家族の dutyId は 404
    Given ほかの家族の担当がある
    When お母さんがその dutyId に正しい本文で送る
    Then 404 NOT_FOUND が返り、その担当は変わらない

  Scenario: 確定した月の担当は 409 MONTH_CONFIRMED
    Given 太郎の皿洗い（済・version 2）があり、その月が確定している
    When お母さんが cancel を version 2 で送る
    Then 409 MONTH_CONFIRMED が返り、担当は変わらない

  Scenario: 表にない組は 409 INVALID_TRANSITION
    Given 太郎の皿洗い（未・version 1）がある
    When お母さんが cancel を version 1 で送る
    Then 409 INVALID_TRANSITION が返り、担当は変わらない

  Scenario: 古い version で送ると 409 INVALID_TRANSITION で担当は変わらない
    Given 太郎の皿洗い（未・version 2）がある
    When お母さんが markDone を古い version 1 で送る
    Then 409 INVALID_TRANSITION が返り、担当は未・version 2 のまま

  Scenario: 余分な項目を付けても、書かれる値は裏側のもの
    Given 太郎の皿洗い（未・version 1）がある
    When お母さんが markDone に unitPrice・recordedBy・status を付けて送る
    Then 200 で unitPrice=120・recordedBy=お母さん で、書かれた値も同じ

  Scenario: 取引の直前に単価が変わると新しい単価で書き直す
    Given 太郎の皿洗い（未・version 1）があり、取引の直前に単価が 150 円になる
    When お母さんが markDone を version 1 で送る
    Then 200 で unitPrice=150 が返る

  Scenario: 競合が 2 回続くと 500 INTERNAL
    Given 太郎の皿洗い（未・version 1）があり、取引が 2 回続けて競合で断られる
    When お母さんが markDone を version 1 で送る
    Then 500 INTERNAL が返り、担当は変わらない

  Scenario: 管理者が月を確定すると 200 で確定行ができる
    Given 2027-01 に担当があり、確定していない
    When お母さんが PUT confirmation を送る
    Then 200 で月の状態が confirmed=true・confirmedByUserId=お母さん になる

  Scenario: 記録のない月の確定でも 200 で version 1 の確定行ができる
    Given 記録のない月がある
    When お母さんが記録のない月に PUT confirmation を送る
    Then 200 で version=1 の確定行ができる

  Scenario: すでに確定済みの月の確定も 200（冪等）
    Given 2027-01 は確定済みである
    When お母さんが PUT confirmation を 2 回送る
    Then どちらも 200 で確定したまま

  Scenario: 子供は確定できず 403 ADMIN_ONLY
    Given 2027-01 に担当があり、確定していない
    When 太郎が PUT confirmation を送る
    Then 403 ADMIN_ONLY が返り、Calendar を読まず確定しない

  Scenario: 家族外と認証なしの PUT confirmation
    Given 家族に入っていない人がいる
    When その人とセッションなしで PUT confirmation を送る
    Then 403 NOT_FAMILY_MEMBER と 401 が返る

  Scenario: month の形が外れると DynamoDB を読まずに 422 INVALID_MONTH
    Given 何も置かない
    When お母さんが不正な月に PUT confirmation を送る
    Then 3 とおりすべて 422 INVALID_MONTH で、Calendar を読まない

  Scenario: 確定はほかの家族の月に触れない
    Given ほかの家族の 2027-01 は確定していない
    When お母さんが PUT confirmation を送る
    Then 自分の家族の月だけが確定し、ほかの家族の月は変わらない

  Scenario: 管理者が確定を取り消すと 200
    Given 2027-01 は確定済みである
    When お母さんが DELETE confirmation を送る
    Then 200 で confirmed=false になり、confirmedAt と confirmedByUserId が消える

  Scenario: 確定していない月の取り消しも 200（冪等）
    Given 2027-01 は確定していない行がある
    When お母さんが DELETE confirmation を送る
    Then 200 で confirmed=false のまま

  Scenario: 記録のない月の取り消しは行を作らず 200
    Given 記録のない月がある
    When お母さんが記録のない月に DELETE confirmation を送る
    Then 200 で月の状態の行は作られない

  Scenario: 子供は取り消せず、month の形が外れると 422
    Given 2027-01 は確定済みである
    When 太郎が DELETE confirmation を送り、お母さんが不正な月に送る
    Then 403 ADMIN_ONLY と 422 INVALID_MONTH が返り、確定は変わらない
