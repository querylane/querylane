# Querylane

Postgres admin UI for managing multiple PostgreSQL servers. Go + React monorepo.

## Terminology

- Instance = user-managed PostgreSQL server connection (host, port, credentials)
- Database = a database inside a PostgreSQL instance (`CREATE DATABASE`)
- Schema = a schema inside a database (`public`, `pg_catalog`, etc.)
- Meta database = querylane's own internal PostgreSQL DB for persistence. NOT a user instance.

## Commands

```
task backend:test             task backend:lint
task backend:test:unit        task backend:fmt
task backend:test:integration task proto:generate
```

## Rules

- NEVER edit `backend/protogen/` or `frontend/src/protogen/` — run `task proto:generate`.
- API follows Google AIP guidelines (AIP-132 pagination, AIP-161 field masks).
- Review guidance lives in `REVIEW.md`.
