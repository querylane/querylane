# PostgreSQL error classification

Date: 2026-07-13

## Decision

Querylane classifies PostgreSQL SQLSTATEs once in `backend/postgreserrors`. The classifier is transport-neutral and every engine, storage, and Connect RPC adapter consumes its normalized code, class, canonical condition name, and kind.

Callers select one of two explicit profiles:

- `default` applies resource-oriented API semantics.
- `sql_console` applies statement-oriented semantics only to ExecuteQuery, ExplainQuery, and their nested helpers.

Profiles are never inferred from operation strings.

## SQLSTATE handling

SQLSTATE input is trimmed, uppercased, and accepted only when it contains five ASCII letters or digits. Valid unknown codes preserve their code and class and use a class fallback when one exists. Malformed codes remain internal and omit code, class, and condition from client metadata.

Condition names come from `pgerrcode.Name` plus a compatibility override map for documented PostgreSQL conditions that the pinned dependency omits or names differently.

## Client visibility

Errors from user-managed PostgreSQL instances expose the valid SQLSTATE in the primary message and typed detail. The typed detail may also expose bounded `message`, `detail`, `hint`, `severity`, `position`, `schema_name`, `table_name`, `column_name`, `data_type_name`, and `constraint_name` fields.

These values are untrusted user-visible text. They must not be rendered as HTML or copied into ErrorInfo metadata, logs, or telemetry. PostgreSQL internal context and source fields such as `where`, `internal_query`, `file`, `line`, and `routine` are never exposed.

Errors from Querylane's meta database expose only SQLSTATE, class, canonical condition, mapped status, and operation. Raw server text and identifiers remain redacted because they describe Querylane internals rather than the user's PostgreSQL instance.

## Storage overrides

Storage repositories consume the shared default classification, then apply only their domain mappings: unique violations, foreign-key and restrict violations, other class 23 violations, and class 40 concurrency failures.
