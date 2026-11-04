---
"@querylane/frontend": patch
---

Refresh frontend dependencies and quality tools, preserving the pinned Bun runtime and happy-dom 21. Use Node 26.13.0 LTS consistently for development, CI, and the canonical Playwright runner.

Review the new React Doctor rule, preserve effect-local cancellation and interaction state under stricter compiler checks, and replace deprecated Lucide aliases without changing their icons. Keep bundle budgets and fatal quality checks unchanged.
