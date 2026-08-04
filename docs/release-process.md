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
4. It does not publish a Homebrew tap or formula. Homebrew publishing remains
   disabled until the tap repository and its scoped credential exist.

## Version source of truth

`frontend/package.json` and Changesets are the human-facing source of truth.
The release workflow creates `vX.Y.Z` from that version. GoReleaser archives
and stable Docker images derive their version from the tag; development
builds report `dev`.

Do not hardcode release versions in Go or Docker build files.

`.tool-versions` intentionally pins only GoReleaser. GoReleaser Action's
`version-file` input requires the asdf/mise format; Go and Bun keep their
existing source-of-truth pins in `backend/go.mod` and the root
`packageManager` field.

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

### Validate the prepared Homebrew formula

After building a snapshot, validate the unpublished formula through a local git
tap:

```sh
bash scripts/validate-homebrew-formula.sh
```

The validator generates `.context/homebrew-tap/Formula/querylane.rb` from
GoReleaser's checksums, serves the archives only on loopback, and checks formula
style, installation, version output, service metadata, and server startup. It
then removes the Homebrew installation and tap while leaving the local
`.context/homebrew-tap` repository for inspection.

The generated formula supports macOS and Linux on AMD64 and ARM64. Its service
binds Querylane to `127.0.0.1` and uses Homebrew-managed working and log
directories. Release artifact CI runs this validation on both macOS and Linux.
No token, remote repository, or publication step is part of this validation.

## Rerun artifact publishing

If a Release workflow run fails after pushing its tag, rerun the failed jobs in
that workflow. On retries, the release job verifies that the expected tag still
points at the workflow commit, restores the exact Changesets notes, and resumes
both artifact and stable Docker publishing. Replaying an older release restores
its versioned image without moving `latest` back from the newest semver tag.

Run the `_release-artifacts` workflow manually from the default branch with an
existing `vX.Y.Z` tag. Existing assets are replaced, making partial-upload
recovery safe when only the downloadable files need rebuilding. The workflow
requires the GitHub Release to exist first so GoReleaser cannot create a release
with a different body.

If the GitHub Release must be created manually, extract the matching Changesets
section rather than generating different notes:

```sh
tag=vX.Y.Z
version="${tag#v}"
notes_file="$(mktemp)"
bun scripts/extract-release-notes.ts "$version" frontend/CHANGELOG.md > "$notes_file"
gh release create "$tag" --verify-tag --title "$tag" --notes-file "$notes_file"
rm "$notes_file"
gh workflow run _release-artifacts.yml -f tag="$tag"
```

The stable Docker publisher has no manual dispatch entry point; recover it by
rerunning the original Release workflow.

Artifact reruns are intended for tags created after this pipeline was
introduced; the historical `v0.1.0` source does not contain the required
version-stamping code.
