#!/usr/bin/env bash
#
# Reset the onboarding sandbox so the backend boots as a brand-new install.
#
# Querylane decides "setup is done?" purely from config presence
# (cfg.Database != nil || cfg.Embedded != nil), and the wizard persists to
# $HOME/.querylane/config.yaml. Embedded PostgreSQL likewise lives in
# $HOME/.querylane/{pgdata,pgruntime}. So instead of deleting anything under
# the real ~/.querylane, we give the backend a throwaway HOME and wipe that.
#
# Usage: scripts/dev-onboarding-reset.sh [fresh|config]
#
#   fresh   (default) No config file at all — the true first-run state a user
#           gets from `docker run` / a bare binary. Backend starts without
#           --config; the wizard writes to <sandbox>/.querylane/config.yaml.
#
#   config  Seeds <sandbox>/.querylane/config.yaml from
#           backend/configs/manual-onboarding.yaml: a config file exists but
#           has no database:/embedded: section. Still the bootstrap stage, but
#           the config file watcher is active — required to exercise the
#           "Configure YAML manually" variant, which waits on file changes.
#
# Env:
#   QUERYLANE_ONBOARDING_HOME  sandbox dir (default <repo>/.dev-onboarding)
#   ONBOARDING_META_DB         meta db recreated for the wizard's Postgres
#                              form (default querylane_onboarding)
set -euo pipefail

MODE="${1:-fresh}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="${QUERYLANE_ONBOARDING_HOME:-$ROOT_DIR/.dev-onboarding}"
QL_HOME="$SANDBOX/.querylane"
META_DB="${ONBOARDING_META_DB:-querylane_onboarding}"

case "$MODE" in
fresh | config) ;;
*)
  echo "usage: $(basename "$0") [fresh|config]" >&2
  exit 2
  ;;
esac

# Guard against a stray QUERYLANE_ONBOARDING_HOME wiping something real.
case "$SANDBOX" in
"" | "/" | "$HOME") echo "refusing to reset sandbox path '$SANDBOX'" >&2 && exit 1 ;;
esac

# 1. Stop an embedded PostgreSQL still running from a previous sandbox run.
#    The manager adopts a live postmaster.pid on start, so a leftover process
#    would make the "embedded" variant look like it reused old state.
pidfile="$QL_HOME/pgdata/postmaster.pid"
if [[ -f $pidfile ]]; then
  pid="$(head -n 1 "$pidfile" 2>/dev/null || true)"
  if [[ $pid =~ ^[0-9]+$ ]] && ps -p "$pid" -o comm= 2>/dev/null | grep -q postgres; then
    echo "🛑 stopping embedded postgres (pid $pid) from previous sandbox run"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      ps -p "$pid" >/dev/null 2>&1 || break
      sleep 0.25
    done
    ps -p "$pid" >/dev/null 2>&1 && kill -9 "$pid" 2>/dev/null || true
  fi
fi

# 2. Wipe the sandbox home: config.yaml, pgdata, pgruntime — everything the
#    backend would treat as "already set up". .embedded-postgres-go is kept:
#    it is only the downloaded PostgreSQL binaries (~100 MB), and re-fetching
#    them on every reset would make the embedded variant painful to test.
mkdir -p "$SANDBOX"
find "$SANDBOX" -mindepth 1 -maxdepth 1 ! -name '.embedded-postgres-go' -exec rm -rf {} +
mkdir -p "$QL_HOME"

if [[ $MODE == "config" ]]; then
  cp "$ROOT_DIR/backend/configs/manual-onboarding.yaml" "$QL_HOME/config.yaml"
fi

# 3. Recreate an empty meta database in the dev Postgres container, so the
#    "Configure via UI" variant runs migrations from scratch. Skipped when the
#    container isn't up (the embedded/manual variants don't need it).
compose=(docker compose --env-file "$ROOT_DIR/.env.development" -f "$ROOT_DIR/docker-compose.yaml")
meta_ready=false
if docker info >/dev/null 2>&1 && [[ -n "$("${compose[@]}" ps -q postgres 2>/dev/null)" ]]; then
  "${compose[@]}" exec -T postgres psql -U querylane -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$META_DB\" WITH (FORCE);" \
    -c "CREATE DATABASE \"$META_DB\";" >/dev/null
  meta_ready=true
fi

echo ""
echo "🧼 Onboarding sandbox reset (mode: $MODE)"
echo "   HOME         $SANDBOX"
echo "   config       $QL_HOME/config.yaml $([[ $MODE == config ]] && echo '(seeded, no database section)' || echo '(absent — true first run)')"
echo "   embedded pg  $QL_HOME/pgdata"
if [[ $meta_ready == true ]]; then
  echo ""
  echo "   Paste into the wizard's PostgreSQL form:"
  echo "     host localhost   port 5432   database $META_DB"
  echo "     user querylane   password querylane   sslmode disable"
  echo "     DSN  postgres://querylane:querylane@localhost:5432/$META_DB?sslmode=disable"
else
  echo ""
  echo "   ⚠️  dev postgres is not running — run 'task dev:db' first if you want"
  echo "      to test the 'Configure via UI' variant against a real server."
fi
echo ""
