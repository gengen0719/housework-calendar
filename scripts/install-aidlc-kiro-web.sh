#!/bin/sh
# Install the AI-DLC native runtime inside a Kiro Web (Kiro Cloud) sandbox.
#
# Why this script exists (the official one-liner does not work there):
#   - Network is INTEGRATIONS_ONLY: github.com release downloads (curl) are
#     blocked, but the authenticated `gh api` REST route works.
#   - Sigstore (attestation) endpoints are unreachable, so `gh attestation
#     verify` cannot initialise. The installer's documented fallback is
#     SHA-256 verification against the release checksums.txt.
#   - $HOME/.local is read-only, so the install goes under a writable HOME
#     inside the workspace (outside the git repo).
#
# Usage (from anywhere):
#   sh housework-calendar/scripts/install-aidlc-kiro-web.sh [version]
#   export PATH="/projects/sandbox/.aidlc-home/.local/bin:$PATH"
#
# The version defaults to the frameworkVersion this project was configured
# with, so the runtime never skews from the project files mid-workflow.
set -eu

REPO=awslabs/aidlc-workflows
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
AIDLC_HOME=${AIDLC_KIRO_WEB_HOME:-/projects/sandbox/.aidlc-home}
DL_ROOT=${AIDLC_KIRO_WEB_DL:-/projects/sandbox/.aidlc-dl}

VERSION=${1:-}
if [ -z "$VERSION" ]; then
  VERSION=$(sed -n 's/.*"frameworkVersion":[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$PROJECT_DIR/.kiro/tools/data/aidlc-stamp.json" 2>/dev/null | head -n 1)
fi
[ -n "$VERSION" ] || { echo "FAIL cannot determine AI-DLC version; pass it as an argument" >&2; exit 2; }

BIN="$AIDLC_HOME/.local/bin/aidlc"
if [ -x "$BIN" ] && "$BIN" --version 2>/dev/null | grep -q "aidlc $VERSION "; then
  echo "PASS AI-DLC $VERSION already installed at $BIN"
else
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) echo "FAIL unsupported architecture $(uname -m)" >&2; exit 2 ;;
  esac
  BINARY="aidlc-linux-$ARCH"
  DL="$DL_ROOT/v$VERSION"
  mkdir -p "$DL" "$AIDLC_HOME"

  ASSETS=$(gh api "repos/$REPO/releases/tags/v$VERSION" --jq '.assets[] | "\(.id) \(.name)"')
  for name in version.json checksums.txt aidlc-release.intoto.jsonl install.sh \
    "aidlc-runtime-$VERSION.tar.gz" "$BINARY"; do
    id=$(printf '%s\n' "$ASSETS" | awk -v n="$name" '$2 == n { print $1 }')
    [ -n "$id" ] || { echo "FAIL release v$VERSION has no asset $name" >&2; exit 3; }
    echo "download $name"
    gh api -H "Accept: application/octet-stream" "repos/$REPO/releases/assets/$id" > "$DL/$name"
  done

  (cd "$DL" && sha256sum -c checksums.txt --ignore-missing)

  # AIDLC_GH_BIN=/nonexistent: skip the unreachable Sigstore check; the
  # installer then verifies every asset against checksums.txt (SHA-256).
  (cd "$DL" && HOME="$AIDLC_HOME" AIDLC_GH_BIN=/nonexistent \
    sh ./install.sh --from "$DL" --version "$VERSION" --allow-root --yes)
fi

"$BIN" --version
echo "Run: export PATH=\"$AIDLC_HOME/.local/bin:\$PATH\""
