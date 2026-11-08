#!/usr/bin/env bash
# push 前の秘密の情報の検査。次の 2 つを調べる。
#   1. Git の履歴（コミット済みの内容。CI の gitleaks と同じ）
#   2. 作業ツリー全体（まだ add していない新しいファイルも含む）
# 使い方: npm run secrets:scan   （初回だけ: brew install gitleaks）
# 検出された値は --redact で伏せて表示する。
# node_modules / dist / cdk.out / coverage は、.gitleaks.toml の allowlist で除く。
set -euo pipefail

MIN_MAJOR=8
MIN_MINOR=19

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks が見つかりません。次のコマンドで 1 回だけ入れてから、もう一度実行してください。" >&2
  echo "  brew install gitleaks" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# `gitleaks version` の出力（例: 8.24.2 や v8.24.2）から版を読み、8.19 以上かを確かめる。
# `git` / `dir` サブコマンドは 8.19 で入った。古い版では動き方が違うので、更新を求めて止まる。
version_output="$(gitleaks version 2>/dev/null || true)"
version="$(printf '%s\n' "$version_output" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
if [ -z "$version" ]; then
  echo "gitleaks の版を読み取れませんでした（gitleaks version の出力: ${version_output:-空}）。" >&2
  echo "8.19 以上が必要です。次のコマンドで更新してください。" >&2
  echo "  brew upgrade gitleaks" >&2
  exit 1
fi
major="${version%%.*}"
rest="${version#*.}"
minor="${rest%%.*}"
if [ "$major" -lt "$MIN_MAJOR" ] || { [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -lt "$MIN_MINOR" ]; }; then
  echo "gitleaks ${version} は古すぎます。${MIN_MAJOR}.${MIN_MINOR} 以上が必要です。次のコマンドで更新してください。" >&2
  echo "  brew upgrade gitleaks" >&2
  exit 1
fi

echo "== 1/2 Git の履歴を検査します（gitleaks ${version}）"
gitleaks git --redact --no-banner -v

echo "== 2/2 作業ツリー（まだ add していない新しいファイルを含む）を検査します"
gitleaks dir . --redact --no-banner -v

echo "秘密の情報は見つかりませんでした。"
