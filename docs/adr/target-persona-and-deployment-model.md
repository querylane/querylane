# ADR: Target persona and deployment model

## Status

Proposed — needs approval from both maintainers (#105).

## Context

The backlog straddles two directions. Local-first: localhost bind and `--open` (#61), the
embedded-Postgres onboarding path, Homebrew/binary distribution (#56, #57). Team/server:
authentication (#129), audit log and safety rails (#77), Helm and PaaS deployment (#132).
Every future priority argument about auth depth, RBAC, multi-user features, audit scope,
and distribution order depends on which persona comes first.

Competitors picked one and it shows in their shape. The tools closest to Querylane's
architecture (pgweb, WhoDB — single Go binary with an embedded web UI) are local-first
and distribute accordingly: binary downloads, Homebrew, `docker run`. The hosted-team
tools (Supabase, Neon, Metabase Cloud) are businesses first and self-hosted second.
The instructive middle case is Drizzle Gateway: a self-hostable studio that ships a
single master-password gate — not RBAC — precisely so that network deployment is safe
without building a user system.

Two facts from the 2026-07 distribution research bound the decision:

- Querylane today has no authentication, binds `0.0.0.0`, and stores credentials for
  users' Postgres instances. Every network-exposed channel is gated on closing that.
- The highest-leverage distribution channels for adoption at this stage (README
  quickstart, binaries, Homebrew, `docker run` on a laptop) serve a single user on
  localhost and need no auth at all.

## Decision

**Primary persona for the next 2–3 milestones: the individual developer or DBA running
Querylane on their own machine against databases they already have credentials for.**
The deployment model we optimize for is single-user localhost: `brew install querylane
&& querylane server start --open` (or the Docker equivalent) to first query in under
five minutes.

**Second ring, explicitly sequenced after the local story is excellent: small-team
shared deployment behind a single-admin gate.** One admin password (#129), not a user
system. This unlocks Helm, homelab catalogs, and one-click PaaS templates (#132) —
deployment surfaces where one person or a small trusted team shares one credential set.
"Team" at this stage means shared access, not per-user identity.

**Explicitly deferred: multi-user accounts, RBAC, SSO/OIDC, per-user audit trails.**
We do not build user tables, roles, or permission models in M1–M3. Features that would
bake in a per-user assumption (e.g. per-user saved-query folders in #137) should be
designed org-wide/instance-wide instead, with a user dimension addable later.

Tie-breaker rule for prioritization disputes: if a feature only makes sense in a
multi-user deployment, it loses to anything that improves the single-user localhost
journey.

## Consequences

- M1 (epic #66) is the whole game until it ships: install → first query with zero
  network exposure. #61 (localhost default) is aligned with this ADR, not in tension
  with #129.
- Auth scope stays deliberately shallow: #129 is a gate, not an identity system. Its
  acceptance criteria should not grow user management.
- The demo instance (#65, demo.querylane.net) represents the product to non-users and
  should default to read-only (#77's read-only mode is the demo's dependency, not a
  team feature).
- Audit log scope in #77 is instance-level ("what happened"), not user-level ("who did
  it") until multi-user exists.
- Distribution order follows the persona: binaries/Homebrew/Docker (#56, #57, #124,
  #127, #128) before Helm/PaaS/catalogs (#132).

## Revisit triggers

Reopen this ADR when any of these holds:

- Repeated user reports of multiple people sharing one Querylane deployment and being
  blocked by the single-admin model (issues asking for users/roles/SSO).
- A homelab/PaaS channel (#131) becomes a top acquisition source and its reviewers or
  users demand per-user auth.
- The maintainers decide to pursue a hosted or commercial offering, which changes the
  persona question entirely.
