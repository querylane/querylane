# Security

## Managed PostgreSQL safety model

Querylane treats every registered PostgreSQL instance as read-only unless its
`allow_mutations` setting is explicitly enabled. The backend evaluates this
policy from the canonical instance record before it opens a target mutation
session. The current managed mutation, materialized-view refresh, also requires
an exact resource-name confirmation and records its start and outcome in the
meta database's mutation audit log.

User-driven statements receive an instance-level timeout (30 seconds by
default). A request can specify a different timeout, but Querylane clamps it to
60 seconds. Query execution and explain requests continue to use PostgreSQL
read-only transactions.

These controls reduce accidents. They are not a PostgreSQL privilege boundary.
In particular:

- PostgreSQL read-only transactions restrict writes to non-temporary tables;
  they do not make arbitrary SQL free of external side effects.
- A superuser or a role with `pg_execute_server_program` can run server-side
  programs, including through `COPY ... PROGRAM`.
- Volatile functions, extensions, foreign data wrappers, database links, and
  user-defined code can cause effects outside the current database.
- A direct PostgreSQL connection bypasses Querylane's read-only policy,
  confirmations, timeouts, and audit log.

Use a dedicated, reduced-privilege PostgreSQL role for Querylane. Do not grant
superuser or `pg_execute_server_program`. Restrict network reachability and
database privileges independently of the application. Querylane reports these
high-risk role capabilities in instance health and startup logs, but does not
revoke them.

## Audit identity and durability

Until application authentication is available, the audit actor is the direct
RPC peer address. Reverse proxies can therefore cause multiple people to share
one actor value. Treat this as connection attribution, not verified user
identity.

Audit-start persistence is fail-closed: if Querylane cannot record an admitted
mutation, it does not run it. A process crash after the target operation starts
can leave an entry in `Running` state because no replica can safely infer the
remote PostgreSQL outcome. Audit result summaries are intentionally redacted.
The server-generated command is stored, but raw user SQL and secrets must never
be copied into this field. Querylane deletes audit entries after 90 days by
default; configure `limits.audit_log.retention` to match the deployment's
retention policy.

## Reporting vulnerabilities

Do not disclose suspected vulnerabilities in a public issue. Contact the
maintainers privately with reproduction steps, affected versions, and impact.
