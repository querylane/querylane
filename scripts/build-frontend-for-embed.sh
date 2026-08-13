#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$repo_root/frontend"
bun install --frozen-lockfile --ignore-scripts
bun run build

rm -rf "$repo_root/backend/frontend/dist"
cp -R "$repo_root/frontend/dist" "$repo_root/backend/frontend/dist"
