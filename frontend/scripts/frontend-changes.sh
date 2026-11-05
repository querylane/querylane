#!/usr/bin/env bash
set -euo pipefail

frontend=false
while IFS= read -r -d '' path; do
  case "$path" in
    frontend/*|.github/workflows/frontend-*.yml) frontend=true ;;
    */*) ;;
    *) frontend=true ;;
  esac
done
printf 'frontend=%s\n' "$frontend"
