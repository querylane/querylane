#!/usr/bin/env bash
set -euo pipefail

before_tags="$(mktemp)"
after_tags="$(mktemp)"
trap 'rm -f "$before_tags" "$after_tags"' EXIT

git tag --list | sort >"$before_tags"

bun run --cwd frontend changeset:tag

if [[ -z "${CHANGESETS_OUTPUT:-}" ]]; then
  exit 0
fi

mkdir -p "$(dirname "$CHANGESETS_OUTPUT")"
: >"$CHANGESETS_OUTPUT"

git tag --list | sort >"$after_tags"

package_name="$(node -e "console.log(require('./frontend/package.json').name)")"

comm -13 "$before_tags" "$after_tags" | while IFS= read -r tag; do
  node -e 'console.log(JSON.stringify({ type: "git-tag", tag: process.argv[1], packageName: process.argv[2] }))' "$tag" "$package_name"
done >>"$CHANGESETS_OUTPUT"
