#!/usr/bin/env bash
# Run a frontend command in the same Linux Playwright image the visual CI job uses.
# Usage: scripts/playwright-container.sh bun run test:visual [playwright args]
set -euo pipefail

frontend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwright_version="$(bun -e 'console.log(require("playwright/package.json").version)')"
bun_version="$(bun --version)"
image="mcr.microsoft.com/playwright:v${playwright_version}-noble"

# Keep dependencies and build output private: a host build must not replace the
# visual harness while this container's preview server is using it.
docker run --rm --ipc=host \
  --volume "${frontend_dir}:/work" \
  --volume /work/node_modules \
  --volume /work/dist \
  --workdir /work \
  --env CI=1 \
  --env "QUERYLANE_RENDERER=${QUERYLANE_RENDERER:-react}" \
  "${image}" \
  bash -c "npm install --global --silent bun@${bun_version} \
    && bun install --frozen-lockfile --ignore-scripts \
    && $*"
