# 結合テスト手順

## Scope and Environment

StandardとしてAPI→認証→service→repositoryの偽、LINE署名/イベント→部品、C9→通知、React→APIの差し替え、CDKテンプレートとLambdaバンドルを対象にします。backend/shared/IaCはNode、画面はjsdom。実ブラウザ/E2E、実DynamoDB、LINE/SNS実送信ではありません。

## Commands

build-instructions.mdに集めた各単位のsteps/結合試験、回帰の複数単位指定と全体コマンドを1回ずつ使います。同じコマンドを別のテスト種別として重ねて数えません。

## Expectations

認証・家族分離・確定との競合・再送・入力境界・集計・独立した訂正経路・通知本文固定・backup-only・全ページを確認します。テスト用固定値と偽の秘密だけを使用し、実アドレス/鍵を置きません。coverage80%は組み上がった全体の1回のcoverageで判定します。

## Sources

全単位のcode-summary.md、unit-test-instructions.md、Testing Contract、U11のfunctional-spec.md。

## Assumptions & Open Questions

ブラウザ固有動作・配備済みAPI・本物のDynamoDB式・メール/料金は別途確認が必要です。

