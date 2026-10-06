# Release process

This repository uses Changesets for Querylane releases. The frontend package version also versions the standalone CLI and container.

## Normal flow

1. Add a changeset file in each release-worthy PR:
   - from `frontend/`, run `bunx @changesets/cli add`
   - commit the generated file under `frontend/.changeset/`
2. Merge PRs into `main`.
3. Workflow `.github/workflows/release.yml` runs on pushes to `main` and:
   - creates or updates a version PR (`changeset-release/main`) when unreleased changesets exist
   - or, after the version PR is merged, publishes the release by creating:
     - a git tag (`vX.Y.Z`)
     - a GitHub Release containing CLI installers, through the CLI publishing job

## What is and is not published

1. This workflow creates GitHub tags and GitHub Releases.
2. It does not publish npm packages.
3. It does not deploy to Vercel.

## CLI and Homebrew distribution

After Changesets pushes a new `vX.Y.Z` tag, `release.yml` directly invokes the
reusable `_cli-build.yml` workflow. Do not rely on a tag-triggered workflow:
tags pushed with `GITHUB_TOKEN` do not trigger other GitHub Actions workflows.

GoReleaser 2.18.2 builds the frontend once and embeds it in six CGO-free
executables: macOS, Linux, and Windows, each for AMD64 and ARM64. Releases
include `.tar.gz` archives (macOS/Linux), `.zip` archives (Windows), Debian and
RPM packages, and `checksums.txt`. The version is injected into both
`querylane --version` and the console API. GoReleaser builds without publishing;
CI downloads those exact archives, verifies their SHA256 checksums, and runs
native checks on all six OS/architecture targets **before** uploading assets.
macOS/Linux cover startup failures, bundled UI assets, SPA routing, onboarding,
and graceful shutdown. Windows checks version, help, and invalid flags only;
Windows server lifecycle and embedded PostgreSQL setup remain unverified.
Publishing never rebuilds the checked bytes. Existing release notes are preserved.

`scripts/homebrew-formula.mjs` generates `querylane.rb` from the four actual
macOS/Linux archive checksums. It rejects prereleases, malformed checksums,
duplicates, and missing targets before overwriting output. The formula is
attached to the GitHub Release, then published to `querylane/homebrew-tap`.

### One-time Homebrew setup

1. Create the public `querylane/homebrew-tap` repository and initialize it with
   a README (the publishing job reads its `HEAD` tree).
2. Create a fine-grained token with **Contents: read and write** on that
   repository only. If required, have the organization approve it.
3. Add the token as the `HOMEBREW_TAP_TOKEN` Actions secret in
   `querylane/querylane`. The default `GITHUB_TOKEN` cannot write to another
   repository. Do not commit the token.
4. Cut a stable release and verify `brew install querylane/tap/querylane`,
   `brew test querylane/tap/querylane`, and `querylane --version`.

Without the tap token, binaries still publish and the formula is attached to
the release, but automatic tap publishing emits an explicit warning. A token
that is present but invalid fails publishing rather than silently succeeding.
Before updating the tap, publishing checks the current version on `main` again.
It also reads the existing formula at the exact blob SHA used for the update,
refusing to replace a newer stable version. This protects against `main` advancing
between the version check and the tap read. A later concurrent write causes a
SHA conflict instead of clobbering the formula. Re-run **CLI release** after a
conflict; it reads fresh state and safely skips a superseded release. Authentication
or malformed-formula failures need correction before retrying.

### Retry an existing release

Run the **CLI release** workflow manually with the current version on `main`, without the
`v` prefix. It checks out that exact tag, verifies the package version, rebuilds
and smoke-tests the artifacts, replaces matching release assets, and retries
the formula update. Older versions are rejected to avoid downgrading the stable
Homebrew formula. It does not create a version bump or a new git tag. Immutable
GitHub Releases cannot have their assets replaced; cut a patch release instead.

### Local verification

```sh
task cli:test
goreleaser check
task cli:snapshot
bun test scripts/homebrew-*.test.ts
python3 scripts/smoke-cli.test.py
```

Pull request workflow `cli-ci.yml` runs the full snapshot packaging path and
uploads artifacts without publishing releases or changing the Homebrew tap.

## Version source of truth

The release version is tracked in:

1. `frontend/package.json`
2. `frontend/CHANGELOG.md`
3. git tags (`vX.Y.Z`)
