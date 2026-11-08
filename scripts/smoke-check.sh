#!/usr/bin/env bash
# 反映後の確かめ（全 15 件: 1・2・3・4 が各 1 件、3b が U2 の 5 件、3c が U3 の 1 件、3d〜3h が U4 の 5 件）。
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

# 3b. U2 の 5 つの操作がセッションなしで 401（形の合った印を使うので、印の形で 404 になることはない）
smoke_token="AAAAAAAAAAAAAAAAAAAAAA"
json='Content-Type: application/json'
check "GET /v1/family/members (セッションなし)" 401 "${base}/v1/family/members"
check "GET /v1/family/invitation (セッションなし)" 401 "${base}/v1/family/invitation"
check "POST /v1/family/invitations (セッションなし)" 401 -X POST -H "$json" --data '{}' "${base}/v1/family/invitations"
check "GET /v1/invitations/:token (セッションなし)" 401 "${base}/v1/invitations/${smoke_token}"
check "POST /v1/invitations/:token/accept (セッションなし)" 401 -X POST -H "$json" --data '{}' "${base}/v1/invitations/${smoke_token}/accept"

# 3c. U3 のお知らせ先の読み取りがセッションなしで 401
check "GET /v1/family/notification-group (セッションなし)" 401 "${base}/v1/family/notification-group"

# 3d〜3h. U4 のお手伝いの種類の 5 つの操作がセッションなしで 401。
# PUT・PATCH・DELETE は U4 で初めて使うので、CloudFront を通って api まで届く（403・405 にならない）ことも分かる
chore_type_id="00000000-0000-4000-8000-000000000000"
check "GET /v1/chore-types (セッションなし)" 401 "${base}/v1/chore-types"
check "POST /v1/chore-types (セッションなし)" 401 -X POST -H "$json" --data '{}' "${base}/v1/chore-types"
check "PUT /v1/chore-types/:id (セッションなし)" 401 -X PUT -H "$json" --data '{}' "${base}/v1/chore-types/${chore_type_id}"
check "PATCH /v1/chore-types/:id (セッションなし)" 401 -X PATCH -H "$json" --data '{}' "${base}/v1/chore-types/${chore_type_id}"
check "DELETE /v1/chore-types/:id (セッションなし)" 401 -X DELETE "${base}/v1/chore-types/${chore_type_id}"

# 4. CloudFront を通さない要求を断っている: 関数 URL を直接呼ぶと 403
check "api の関数 URL を直接呼ぶ" 403 "${api_direct}/v1/me"

if [ "$failed" -ne 0 ]; then
  echo "反映後の確かめに失敗しました" >&2
  exit 1
fi
echo "反映後の確かめがすべて通りました"
