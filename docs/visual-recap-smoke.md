# Visual recap smoke test

This disposable document change verifies that the PR Visual Recap workflow runs
on a normal pull request after the recap workflow was merged.

## Expected workflow behavior

- The gate job should pass because the repo has `PLAN_RECAP_TOKEN`.
- The Claude backend should authenticate with `CLAUDE_CODE_OAUTH_TOKEN`.
- The recap job should not skip on recap-control-file protection because this
  PR changes only a documentation file.
- The agent runtime is capped so the workflow cannot spend an unbounded amount
  of runner time.
- The action should publish or report a bounded failure through the sticky recap
  comment instead of hanging silently.

## Cleanup

Close this pull request after the workflow proves the recap path works. Do not
merge this file into `main`.
