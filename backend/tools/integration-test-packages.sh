#!/usr/bin/env bash
set -euo pipefail

test_regex=${1:-'Integration|RPCSuite'}

packages=()
while IFS=$'\t' read -r package dir test_files external_test_files; do
  files="$test_files $external_test_files"
  [[ -z "${files// }" ]] && continue

  if (cd "$dir" && grep -Eq "func Test.*($test_regex)" $files); then
    packages+=("$package")
  fi
done < <(go list -f '{{.ImportPath}}	{{.Dir}}	{{join .TestGoFiles " "}}	{{join .XTestGoFiles " "}}' ./...)

printf '%s\n' "${packages[@]}"
