#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
SELECT 'CREATE DATABASE stress_shadow_db'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'stress_shadow_db')\gexec

COMMENT ON DATABASE stress_shadow_db IS 'Extra Querylane stress database to exercise database list/detail UI.';
SQL
