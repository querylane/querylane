#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <expected-tag> <version> <run-attempt> [created-tag ...]" >&2
  exit 2
fi

expected_tag="$1"
version="$2"
run_attempt="$3"
shift 3
created_tags=("$@")

if [ "$expected_tag" != "v$version" ]; then
  echo "Expected tag $expected_tag does not match version $version." >&2
  exit 1
fi

tag=""
published=false
push_tag=false
publish_latest=false

case "${#created_tags[@]}" in
  0)
    if [ "$run_attempt" -le 1 ]; then
      echo "No new release tags."
    else
      tag="$expected_tag"
      head_commit="$(git rev-parse -q --verify "HEAD^{commit}")"
      if ! tag_commit="$(git rev-parse -q --verify "$tag^{commit}")" ||
        [ "$tag_commit" != "$head_commit" ]; then
        echo "Existing tag $tag does not identify this commit; nothing to resume."
        tag=""
      else
        echo "Resuming release for $tag at $head_commit."
        published=true
      fi
    fi
    ;;
  1)
    tag="${created_tags[0]}"
    if [ "$tag" != "$expected_tag" ]; then
      echo "Changesets created $tag, expected $expected_tag." >&2
      exit 1
    fi
    published=true
    push_tag=true
    ;;
  *)
    echo "Expected one release tag, found ${#created_tags[@]}: ${created_tags[*]}" >&2
    exit 1
    ;;
esac

if [ "$published" = true ]; then
  script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  publish_latest="$(bash "$script_directory/is-latest-release.sh" "$version")"
fi

{
  echo "tag=$tag"
  if [ "$published" = true ]; then
    echo "version=$version"
  else
    echo "version="
  fi
  echo "published=$published"
  echo "push_tag=$push_tag"
  echo "publish_latest=$publish_latest"
} >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"
