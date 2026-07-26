# Release process

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
     - a GitHub Release using that version's section from `frontend/CHANGELOG.md`
     - a multi-architecture Docker image
     - self-contained release archives and `checksums.txt`

The archive matrix is:

- macOS: `amd64`, `arm64`
- Linux: `amd64`, `arm64`
- Windows: `amd64`

macOS and Linux use `tar.gz`; Windows uses `zip`. Every binary includes the
compiled frontend.

## What is and is not published

1. This workflow creates GitHub tags, GitHub Releases, release archives, and
   stable Docker images.
2. It does not publish npm packages.
3. It does not deploy to Vercel.

## Version source of truth

`frontend/package.json` and Changesets are the human-facing source of truth.
The release workflow creates `vX.Y.Z` from that version. GoReleaser archives
and stable Docker images derive their version from the tag; development
builds report `dev`.

Do not hardcode release versions in Go or Docker build files.

## Validate locally

Build the frontend assets used by an embedded binary:

```sh
./scripts/build-frontend-for-embed.sh
```

Validate the complete archive matrix without publishing:

```sh
goreleaser release --snapshot --clean
```

Snapshot output is written under `.build/goreleaser/`, so it does not replace
the documentation site in `dist/`.

Plain `go install` is unsupported because it does not run the frontend build
required by the `embed_frontend` build tag.

## Rerun artifact publishing

Run the `_release-artifacts` workflow manually from the default branch with an
existing `vX.Y.Z` tag. Existing assets are replaced, making partial-upload
recovery safe.

If the tag exists but release creation failed:

```sh
gh release create vX.Y.Z --verify-tag --generate-notes
gh workflow run _release-artifacts.yml -f tag=vX.Y.Z
```

The stable Docker publisher has no manual dispatch entry point. If its job
started and failed, rerun the failed jobs in the original Release workflow run.

Artifact reruns are intended for tags created after this pipeline was
introduced; the historical `v0.1.0` source does not contain the required
version-stamping code.
