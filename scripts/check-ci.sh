#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

npm run format:check
npm run lint

for project in packages/shared packages/backend packages/frontend infrastructure; do
  npx --no-install tsc --noEmit -p "$project"
done

npm test
gitleaks git --redact --no-banner

output_dir=$(mktemp -d "${TMPDIR:-/tmp}/housework-check.XXXXXXXX")
trap 'rm -rf -- "$output_dir"' EXIT

VITE_LIFF_ID=ci-dummy-liff-id VITE_LINE_OA_ID='@ci-dummy' \
  npm run build -w packages/frontend -- --outDir "$output_dir/frontend"

cd infrastructure
npx --no-install cdk synth --quiet \
  --app 'node --import tsx bin/app.ts' \
  --output "$output_dir/cdk.out" \
  -c "frontendDistPath=$output_dir/frontend" \
  -c originVerifySecret=ci-dummy-origin-verify-secret \
  -c githubOwner=ci-owner \
  -c githubRepo=ci-repo \
  -c budgetEmail=ci@example.com
