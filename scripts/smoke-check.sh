#!/usr/bin/env bash
# 反映後の確かめ（cicd-pipeline.md の 4 つ）。
# 使い方: scripts/smoke-check.sh <CloudFront の URL> <api の関数 URL>
#   例: scripts/smoke-check.sh https://dxxxx.cloudfront.net https://xxxx.lambda-url.ap-northeast-1.on.aws/
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "使い方: $0 <CloudFront の URL> <api の関数 URL>" >&2
  exit 2
fi

base="${1%/}"
api_direct="${2%/}"
failed=0

# check <名前> <期待する HTTP ステータス> <curl の引数...>
check() {
  local name="$1" expected="$2"
  shift 2
  local status
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 "$@")" || status="curl-error"
  if [ "$status" = "$expected" ]; then
    echo "OK   ${name}: ${status}"
  else
    echo "FAIL ${name}: 期待 ${expected}、実際 ${status}" >&2
    failed=1
  fi
}

# 1. 画面の配信と振り分け: 200 で HTML
html_status="$(curl --silent --show-error --output /tmp/smoke-index.html --write-out '%{http_code}' --max-time 20 "${base}/")" || html_status="curl-error"
if [ "$html_status" = "200" ] && grep -qi '<html' /tmp/smoke-index.html; then
  echo "OK   GET /: 200 (HTML)"
else
  echo "FAIL GET /: 期待 200 と HTML、実際 ${html_status}" >&2
  failed=1
fi
rm -f /tmp/smoke-index.html

# 2. /v1/* が api に届き、秘密のヘッダーが正しく付いている: セッションなしは 401
check "GET /v1/me (セッションなし)" 401 "${base}/v1/me"

# 3. /line/webhook が line に届き、署名を確かめている: 署名なしは 401
check "POST /line/webhook (署名なし)" 401 -X POST -H 'Content-Type: application/json' --data '{"destination":"smoke","events":[]}' "${base}/line/webhook"

# 4. CloudFront を通さない要求を断っている: 関数 URL を直接呼ぶと 403
check "api の関数 URL を直接呼ぶ" 403 "${api_direct}/v1/me"

if [ "$failed" -ne 0 ]; then
  echo "反映後の確かめに失敗しました" >&2
  exit 1
fi
echo "反映後の確かめがすべて通りました"
