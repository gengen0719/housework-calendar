Feature: 申し出の掃除と、フックに頼らない有効さの判定
  担当が変わった・「未」でなくなった・記録された・月が確定されたときは、フックで申し出を cancelled にする。
  フックが失敗・遅延・未登録でも、読んだときの判定が「なくなった」と扱う。今日は日本時間の 2027-01-08 とする。

  Scenario: 登録を二重に呼んでも登録は 1 回だけで、記録されると申し出が cancelled になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 画面用の登録を 2 回呼び、その担当が記録されたことを通知する
    Then 申し出は cancelled になり、SWAP_OFFER_CLOSED が 1 件だけ出る

  Scenario: 画面用の登録では、担当の子供の変更・消えた・状態の変更のどれでも申し出が cancelled になる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 画面用の登録を呼び、3 つの種類の通知をそれぞれ別の申し出に対して出す
    Then 3 件とも cancelled になり、SWAP_OFFER_CLOSED が via 付きで 3 件出る

  Scenario: LINE 用の登録では担当を変える通知を登録せず、記録の通知だけで掃除する
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When LINE 用の登録を呼び、担当を変える通知と記録の通知を順に出す
    Then 担当を変える通知では申し出は open のままで、記録の通知で cancelled になる

  Scenario: 申し出がない担当や open でない申し出は、何も書かれずログも出ない
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 画面用の登録を呼び、申し出のない担当と引き受け済みの申し出に通知を出す
    Then 申し出の項目は作られず、引き受け済みは変わらず、SWAP_OFFER_CLOSED は出ない

  Scenario: フックがなくても、5 つの条件のどれかが崩れた申し出は「なくなった」と扱われる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 担当の version 違い、済、担当の子供の変更、過ぎた日、確定済みの月のそれぞれを花子が引き受ける
    Then すべて OFFER_GONE になる

  Scenario: 担当の version が変わっていれば、古い open の項目に新しく申し出し直せる
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 担当の version が 3 に変わった状態で太郎が申し出る
    Then 申し出は新しい ID の open になる

  Scenario: 掃除のフックが投げても、保存の結果は変わらず警告だけが残る
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 画面用の登録を呼び、掃除の書き込みを失敗させて記録の通知を出す
    Then 通知は投げずに終わり、DUTY_RECORDED_HOOK_FAILED の警告が 1 件残り、申し出は open のままである

  Scenario: 月の確定の 300 件のうち 1 件の掃除が失敗しても、残りは続き、残った申し出は引き受けられない
    Given 確定された月に、太郎の「未」の担当 300 件と、それぞれの open の申し出がある
    When 画面用の登録を呼び、300 件の状態の変更を通知し、最初の掃除の書き込みを失敗させる
    Then 299 件が cancelled になり、1 件が open のまま残り、DUTY_HOOK_FAILED が 1 件出る
    And 300 件のどの申し出も、花子が引き受けると OFFER_GONE になる

  Scenario: 確定を取り消すと、掃除できなかった open の申し出だけが有効に戻る
    Given 太郎の皿洗い（未・version 2）に太郎の open の申し出がある
    When 月が確定し、花子が引き受けられず、確定が取り消され、太郎が同じ担当を申し出る
    Then 確定中は OFFER_GONE で、取り消し後は ALREADY_OFFERED になる
