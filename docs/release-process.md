# Release Process

This repository uses Changesets for frontend releases.

## Normal flow

1. Add a changeset file in each release-worthy PR:
   - from `frontend/`, run `bunx @changesets/cli add`
   - commit the generated file under `frontend/.changeset/`
2. Merge PRs into `main`.
3. Workflow `.github/workflows/release.yml` runs on pushes to `main` and:
   - creates or updates a version PR (`changeset-release/main`) when unreleased changesets exist
   - or, after the version PR is merged, publishes the release by creating:
     - a git tag (`vX.Y.Z`)
     - a GitHub Release generated from `frontend/CHANGELOG.md`

## What is and is not published

1. This workflow creates GitHub tags and GitHub Releases.
2. It does not publish npm packages.
3. It does not deploy to Vercel.

## Version source of truth

The release version is tracked in:

1. `frontend/package.json`
2. `frontend/CHANGELOG.md`
3. git tags (`vX.Y.Z`)
