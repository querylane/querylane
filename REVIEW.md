# Review instructions

Prioritize findings that affect correctness, security, data loss, API compatibility, or user-visible behavior.

Important Querylane context:

- Instance = user-managed PostgreSQL server connection.
- Database = database inside a PostgreSQL instance.
- Schema = schema inside a database.
- Meta database = Querylane's internal PostgreSQL database. It is not a user instance.

High-value review findings:

- Unsafe PostgreSQL behavior, data loss, transaction bugs, or migration risks.
- Confusion between Instance, Database, Schema, and Meta database.
- Security/authentication/authorization issues.
- Broken Google AIP-style pagination or field-mask semantics.
- API/protobuf compatibility problems.
- Missing tests for meaningful backend or frontend behavior.
- Frontend loading, error, empty, accessibility, or state consistency bugs.
- Route module drift: `frontend/src/routes/*.tsx` should stay focused on path/search/load wiring; move substantial rendering to `*-page.tsx` and domain behavior to feature/hook/lib/store modules.

Do not report:

- Generated files under `backend/protogen/`, `frontend/src/protogen/`, or `frontend/src/routeTree.gen.ts`.
- Formatting/lint issues already handled by CI.
- Subjective naming/style preferences unless they hide a real bug.

AIP/protobuf compatibility notes:

- Field behavior annotation-only changes are wire-safe when field numbers, names,
  types, message names, and RPC shapes stay unchanged, but they are visible to
  clients that inspect descriptors. Call out that descriptor-level impact in PRs.
- Canonical resource `name` fields should use `IDENTIFIER` only. Existing
  v1alpha1 resource names may keep `OUTPUT_ONLY + IDENTIFIER` when documented
  as descriptor-compatibility debt.

Generated code rule:

- Never edit `backend/protogen/` or `frontend/src/protogen/` directly. Run `task proto:generate` after proto changes.
