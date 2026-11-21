#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run format:check
npm run lint

for project in packages/shared packages/backend packages/frontend infrastructure; do
  npx --no-install tsc --noEmit -p "$project"
done

npm test
gitleaks git --redact --no-banner

VITE_LIFF_ID=ci-dummy-liff-id VITE_LINE_OA_ID='@ci-dummy' npm run build -w packages/frontend

cd infrastructure
npx --no-install cdk synth --quiet \
  --app 'node --import tsx bin/app.ts' \
  -c originVerifySecret=ci-dummy-origin-verify-secret \
  -c githubOwner=ci-owner \
  -c githubRepo=ci-repo \
  -c budgetEmail=ci@example.com
