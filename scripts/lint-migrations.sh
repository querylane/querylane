#!/usr/bin/env bash
set -euo pipefail

# Lint goose SQL migrations with squawk, extracting only the Up section
# from each file so Down section DROPs don't trigger false positives.
#
# Usage: lint-migrations.sh <squawk-binary> <migrations-dir> [files-to-skip...]

SQUAWK="$1"
DIR="$2"
shift 2
SKIP_PATTERNS=("$@")

EXIT_CODE=0

for f in "$DIR"/*.sql; do
  [ -f "$f" ] || continue
  name=$(basename "$f")

  # Check skip patterns
  skip=false
  for pat in "${SKIP_PATTERNS[@]+"${SKIP_PATTERNS[@]}"}"; do
    case "$name" in $pat) skip=true ;; esac
  done
  [ "$skip" = true ] && continue

  # Extract only the Up section (between -- +goose Up and -- +goose Down)
  up_sql=$(sed -n '/^-- +goose Up$/,/^-- +goose Down$/{ /^-- +goose/d; p; }' "$f")
  [ -z "$up_sql" ] && continue

  echo "$up_sql" | "$SQUAWK" --stdin-filepath="$name" || EXIT_CODE=$?
done

exit $EXIT_CODE
