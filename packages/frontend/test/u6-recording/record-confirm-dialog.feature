Feature: 記録の確認ダイアログ（U6）
  記録の前に「{月}/{日} {お手伝い}を記録しますか」と確認し、
  Esc キーや「やめる」で閉じられ、開いたときフォーカスが「記録する」に移る（アクセシビリティ）。

  Scenario: 問いかけと 2 つのボタンが出る
    Given 確認ダイアログを 1月5日の皿洗いで開く
    Then 「1/5 皿洗いを記録しますか」と「記録する」「やめる」が出る

  Scenario: 開いたときフォーカスが「記録する」に移る
    Given 確認ダイアログを 1月5日の皿洗いで開く
    Then フォーカスが「記録する」に移る

  Scenario: 「やめる」で閉じる
    Given 確認ダイアログを 1月5日の皿洗いで開く
    When 「やめる」を押す
    Then onCancel が呼ばれる

  Scenario: Esc キーで閉じる
    Given 確認ダイアログを 1月5日の皿洗いで開く
    When Esc キーを押す
    Then onCancel が呼ばれる

  Scenario: 「記録する」を押すと onConfirm が呼ばれる
    Given 確認ダイアログを 1月5日の皿洗いで開く
    When 「記録する」を押す
    Then onConfirm が呼ばれる

  Scenario: 送信中はボタンが押せない
    Given 確認ダイアログを送信中の状態で開く
    Then 「記録する」が aria-busy で押せない
