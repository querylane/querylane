# Querylane business-impact lens

For Querylane pull requests, lead with the business-facing change, not the
implementation mechanism. Explain which PostgreSQL administration workflow,
reviewer decision, release risk, or operator outcome changed and why it matters.
Prefer concrete product language such as "database operators can spot unsafe
state sooner", "reviewers can see the migration blast radius", or "this reduces
setup friction" over framework or file-name summaries. If the diff is internal
only, say so plainly and connect it to maintainability, reliability, security,
or delivery speed only when that connection is visible in the diff.

Do not invent customer impact. Separate confirmed user-visible behavior from
inferred business value, and call out the strongest remaining review risk when a
change could affect data access, permissions, connection handling, migrations,
or destructive database actions.
