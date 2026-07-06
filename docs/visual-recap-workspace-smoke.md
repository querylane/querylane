# Visual recap workspace smoke test

This file exists only on a disposable smoke branch. It gives the visual recap
workflow enough harmless repository diff to exercise the publish path after the
PLAN_RECAP_TOKEN secret was rotated.

## Intended outcome

- The PR Visual Recap gate sees PLAN_RECAP_TOKEN.
- The Claude backend uses the existing CLAUDE_CODE_OAUTH_TOKEN secret.
- The recap publisher creates a Plan recap URL.
- The GitHub sticky comment links to the recap.
- The recap is owned by the Plan workspace that minted the token.

## Business-facing change summary fixture

The smoke branch pretends to document an operational setup change. A business
reviewer should understand that the change is a validation-only update, not a
product feature. The recap should communicate low risk and no customer-visible
runtime behavior change.

## Verification notes

- No application code changes.
- No backend migrations.
- No frontend bundle impact.
- No database behavior impact.
- Safe to close after the workflow posts a recap.

## Cleanup

Close this pull request without merging after verification. The branch can be
deleted once the workflow evidence is captured.
