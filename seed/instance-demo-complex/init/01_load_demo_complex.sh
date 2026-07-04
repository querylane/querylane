#!/bin/sh
set -eu

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -f /querylane-demo-complex-sql/01_schema.sql \
  -f /querylane-demo-complex-sql/02_seed.sql \
  -f /querylane-demo-complex-sql/03_catalog_features.sql \
  -f /querylane-demo-complex-sql/99_verify.sql
