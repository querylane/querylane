#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  exit 2
fi

version="$1"
latest_tag="$(
  git tag --list --sort=-v:refname |
    awk '/^v[0-9]+\.[0-9]+\.[0-9]+$/ { print; exit }'
)"

if [ "v$version" = "$latest_tag" ]; then
  echo true
else
  echo false
fi
