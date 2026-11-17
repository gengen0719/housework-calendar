# 実環境の性能確認

## Setup and Procedure

各単位のNFR7とdocs/manual-check-u*.mdを使います。ステージングの4人家族と必要な担当データを用意し、画面/操作/トークを各20回測り19回以上が目標以内か確認します。U1のトークは承認済みの10秒、以後の該当トークは3秒という個別定義を使い、上書きしません。コールド起動も含めます。U10の初回60秒と障害メール15分は実際の到達で測り、模擬時計を証拠にしません。

## Current Evidence

ローカルは呼出回数・並行数・期限・1,000件等のモデル試験までです。実測は未実施でUnverified。現在の計画では後段performance-validationがSKIPのため、成功した延期にはできません。実データの手修正や無断の実送信は行いません。

## Sources

source-inventory.jsonの全performance/reliability/scalability要件と設計、各単位の手動確認書。

## Assumptions & Open Questions

実環境の準備と作り手の確認が必要です。実行日時・環境・試行数・成功回数・実測値を記録します。

