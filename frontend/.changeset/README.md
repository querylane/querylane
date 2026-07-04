# Changesets

Use Changesets to describe release-worthy frontend changes in pull requests.

## When to add a changeset

Add a changeset when your PR changes behavior, APIs, UX, or fixes bugs that should appear in release notes.

Do not add a changeset for internal-only changes that should not trigger a release note entry (for example, local refactors with no behavior change).

## How to add one

From `frontend/`, run:

```bash
bunx changeset add
```

Pick the appropriate bump level for `frontend-new` and write a short, user-focused summary.

## Summary quality expectations

Write release notes for readers of the product, not for maintainers.

- Describe what changed and why it matters.
- Prefer clear outcomes over implementation details.
- Keep summaries concise, specific, and in plain language.
