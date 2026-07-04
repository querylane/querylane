#!/bin/sh
set -eu

row_count="${QUERYLANE_STRESS_ROW_COUNT:-50000}"
case "$row_count" in
  ''|*[!0-9]*)
    echo "QUERYLANE_STRESS_ROW_COUNT must be a positive integer; got: $row_count" >&2
    exit 1
    ;;
esac

if [ "$row_count" -lt 1 ]; then
  echo "QUERYLANE_STRESS_ROW_COUNT must be at least 1" >&2
  exit 1
fi

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -c "SET querylane_stress.row_count = '$row_count'" \
  -f /querylane-stress-sql/01_complex_stress.sql
