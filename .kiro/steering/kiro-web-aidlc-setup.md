---
inclusion: always
---
# AI-DLC on Kiro Web (Kiro Cloud sandbox)

This supplements `aidlc-onboarding.md` (framework-managed; do not edit it, its hash is
checked by `aidlc doctor` and it is overwritten by `aidlc config`).

Kiro Web sandboxes start without the `aidlc` command, and the official installer
one-liner (`curl ... install.sh | sh`) fails there because:

- the network is integrations-only: github.com release downloads are blocked, but the
  authenticated `gh api` REST route works;
- Sigstore is unreachable, so release provenance (`gh attestation verify`) cannot run;
  the installer's documented fallback, SHA-256 verification against `checksums.txt`, is used;
- `~/.local` is read-only, so AI-DLC is installed under `/projects/sandbox/.aidlc-home`
  (inside the workspace, outside this git repo).

## Before running `/aidlc` in Kiro Web

When `aidlc` is not found, install it yourself (this overrides the onboarding rule
"end your turn without installing anything" for Kiro Web sandboxes only):

```bash
sh scripts/install-aidlc-kiro-web.sh
```

Run it from the repository root. It installs the `frameworkVersion` recorded in
`.kiro/tools/data/aidlc-stamp.json` (currently 2.11.1), so the runtime never skews
from the project files mid-workflow. Pass a version argument only when the person asks
to upgrade (finish the active workflow first, then run `aidlc config`). It is idempotent:
when the right version is already installed it only prints it.

The sandbox does not keep PATH between commands, so prefix **every** `aidlc` command with
the install directory, for example:

```bash
PATH="/projects/sandbox/.aidlc-home/.local/bin:$PATH" aidlc doctor
```

or call the binary directly: `/projects/sandbox/.aidlc-home/.local/bin/aidlc engine orchestrate next`.

Verify with `aidlc --version` (expect `aidlc 2.11.1`) and `aidlc doctor` (expect
`0 problems`; the "hook PATH" and "hooks have not run" warnings are expected in a fresh
Kiro Web sandbox, where `aidlc` is not on the system-wide PATH).

## Known limitation: hooks

With the runtime installed, `aidlc engine orchestrate next` in Kiro Web (2026-11-07,
AI-DLC 2.11.1) answers "Kiro is not running AI-DLC's hooks in this folder" and stops the
workflow. The engine requires the `.kiro/hooks/aidlc-*.json` registrations to fire; Kiro
Web's ACP client does not currently run them. Do not run hook scripts by hand or switch
checks off to get past it. Use Kiro IDE or `kiro-cli` to drive stages, and use Kiro Web
for reading the record or for non-AI-DLC work until Kiro Web runs the project's hooks.

## Source

Install procedure: https://github.com/awslabs/aidlc-workflows (README, Quick Start, and
`docs/guide/18-install-and-lifecycle.md` for offline installs with `install.sh --from`).
