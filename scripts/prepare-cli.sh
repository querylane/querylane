#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/frontend"
bun install --frozen-lockfile --ignore-scripts
# A distributable build must use its own origin, not a developer's API URL or
# test harness from the environment. Empty values also override local .env.
PUBLIC_API_BASE_URL="" QUERYLANE_VISUAL_HARNESS=0 bun run build

# Replace the generated directory so removed assets cannot leak into releases.
rm -rf "$root/backend/frontend/dist"
mkdir -p "$root/backend/frontend/dist"
cp -R "$root/frontend/dist/." "$root/backend/frontend/dist/"
