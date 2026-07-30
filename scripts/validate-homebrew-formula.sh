#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="${1:-.build/goreleaser}"
tap_dir="${2:-.context/homebrew-tap}"

if [[ "$dist" != /* ]]; then
	dist="$repo_root/$dist"
fi
if [[ "$tap_dir" != /* ]]; then
	tap_dir="$repo_root/$tap_dir"
fi

if ! command -v brew >/dev/null 2>&1; then
	for brew_candidate in \
		/home/linuxbrew/.linuxbrew/bin/brew \
		/opt/homebrew/bin/brew \
		/usr/local/bin/brew; do
		if [[ -x "$brew_candidate" ]]; then
			eval "$("$brew_candidate" shellenv)"
			break
		fi
	done
fi

for command in brew bun curl git jq python3 ruby; do
	if ! command -v "$command" >/dev/null 2>&1; then
		echo "Required command not found: $command" >&2
		exit 1
	fi
done

tap_dir="$(
	python3 - "$tap_dir" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).resolve())
PY
)"
context_dir="$(
	python3 - "$repo_root/.context" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).resolve())
PY
)"

for artifact in checksums.txt metadata.json; do
	if [[ ! -f "$dist/$artifact" ]]; then
		echo "GoReleaser artifact not found: $dist/$artifact" >&2
		exit 1
	fi
done

if brew tap | grep -qx "querylane/tap"; then
	echo "Refusing to replace existing Homebrew tap querylane/tap" >&2
	exit 1
fi
if brew list --formula | grep -qx "querylane"; then
	echo "Refusing to replace existing Querylane formula installation" >&2
	exit 1
fi

pick_port() {
	python3 - <<'PY'
import socket

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
}

wait_for_url() {
	local url="$1"
	for _ in {1..100}; do
		if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
			return 0
		fi
		sleep 0.1
	done

	echo "Timed out waiting for $url" >&2
	return 1
}

http_pid=""
querylane_pid=""
querylane_home=""
formula_path="$tap_dir/Formula/querylane.rb"
production_formula="$tap_dir/querylane.production.rb"
formula_installed=false
tap_added=false

cleanup() {
	if [[ -n "$querylane_pid" ]]; then
		kill "$querylane_pid" >/dev/null 2>&1 || true
		wait "$querylane_pid" >/dev/null 2>&1 || true
	fi
	if [[ "$formula_installed" == true ]]; then
		HOMEBREW_NO_AUTO_UPDATE=1 brew uninstall --force querylane/tap/querylane >/dev/null || true
	fi
	if [[ "$tap_added" == true ]]; then
		# Homebrew 6 records trust for non-official formulae separately.
		brew untrust --formula querylane/tap/querylane >/dev/null 2>&1 || true
		HOMEBREW_NO_AUTO_UPDATE=1 brew untap --force querylane/tap >/dev/null || true
	fi
	if [[ -n "$http_pid" ]]; then
		kill "$http_pid" >/dev/null 2>&1 || true
		wait "$http_pid" >/dev/null 2>&1 || true
	fi
	if [[ -n "$querylane_home" && -d "$querylane_home" ]]; then
		rm -r -- "$querylane_home"
	fi
	if [[ -f "$production_formula" ]]; then
		mkdir -p "$(dirname "$formula_path")"
		mv -f -- "$production_formula" "$formula_path"
	fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

version="$(jq -er '.version | select(type == "string" and length > 0)' "$dist/metadata.json")"
tag="v$version"
download_port="$(pick_port)"
server_port="$(pick_port)"
while [[ "$server_port" == "$download_port" ]]; do
	server_port="$(pick_port)"
done
download_root="http://127.0.0.1:$download_port"

case "$tap_dir" in
	"$context_dir/"*) ;;
	*)
		echo "Local tap must stay under $context_dir" >&2
		exit 1
		;;
esac

if [[ -e "$tap_dir" && ! -d "$tap_dir/.git" ]]; then
	echo "Refusing to replace non-git directory: $tap_dir" >&2
	exit 1
fi
if [[ -d "$tap_dir/.git" ]]; then
	git -C "$tap_dir" reset --hard --quiet
	git -C "$tap_dir" clean -fdx --quiet
else
	mkdir -p "$tap_dir"
	git -C "$tap_dir" init --quiet
	git -C "$tap_dir" config user.email "release-test@querylane.net"
	git -C "$tap_dir" config user.name "Querylane release test"
	git -C "$tap_dir" config commit.gpgsign false
fi

commit_formula() {
	local message="$1"
	git -C "$tap_dir" add Formula/querylane.rb
	if ! git -C "$tap_dir" diff --cached --quiet; then
		git -C "$tap_dir" commit --quiet -m "$message"
	fi
}

bun "$repo_root/scripts/generate-homebrew-formula.ts" \
	--checksums "$dist/checksums.txt" \
	--version "$version" \
	--tag "$tag" \
	--output "$formula_path"

ruby -c "$formula_path"
commit_formula "test: generate production Querylane formula"

tap_added=true
HOMEBREW_NO_AUTO_UPDATE=1 brew tap querylane/tap "$tap_dir"
brew style querylane/tap/querylane
brew untrust --formula querylane/tap/querylane >/dev/null 2>&1 || true
HOMEBREW_NO_AUTO_UPDATE=1 brew untap --force querylane/tap >/dev/null
tap_added=false

cp -- "$formula_path" "$production_formula"

bun "$repo_root/scripts/generate-homebrew-formula.ts" \
	--checksums "$dist/checksums.txt" \
	--version "$version" \
	--tag "$tag" \
	--output "$formula_path" \
	--download-root "$download_root"

ruby -c "$formula_path"
commit_formula "test: generate local Querylane formula"

python3 -m http.server "$download_port" \
	--bind 127.0.0.1 \
	--directory "$dist" \
	>"$tap_dir/artifact-server.log" 2>&1 &
http_pid="$!"
wait_for_url "$download_root/checksums.txt"

tap_added=true
HOMEBREW_NO_AUTO_UPDATE=1 brew tap querylane/tap "$tap_dir"
brew style querylane/tap/querylane
formula_installed=true
HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 \
	brew install querylane/tap/querylane

formula_prefix="$(brew --prefix querylane/tap/querylane)"
querylane_bin="$formula_prefix/bin/querylane"
actual_version="$("$querylane_bin" --version)"
if [[ "$actual_version" != "$version" ]]; then
	echo "Expected querylane --version to print $version, got $actual_version" >&2
	exit 1
fi

HOMEBREW_NO_AUTO_UPDATE=1 brew test querylane/tap/querylane
HOMEBREW_NO_AUTO_UPDATE=1 \
	brew info querylane/tap/querylane --json=v2 >"$tap_dir/formula-info.json"
brew_prefix="$(brew --prefix)"
jq --exit-status \
	--arg bin "$querylane_bin" \
	--arg error_log "$brew_prefix/var/log/querylane.log" \
	--arg log "$brew_prefix/var/log/querylane.log" \
	--arg working_dir "$brew_prefix/var/querylane" \
	'
		.formulae | length == 1
		and .[0].service.run == [$bin, "server", "start", "--host", "127.0.0.1"]
		and .[0].service.keep_alive.always == true
		and .[0].service.working_dir == $working_dir
		and .[0].service.log_path == $log
		and .[0].service.error_log_path == $error_log
	' \
	"$tap_dir/formula-info.json" >/dev/null

querylane_home="$(mktemp -d)"
HOME="$querylane_home" "$querylane_bin" server start \
	--host 127.0.0.1 \
	--port "$server_port" \
	>"$tap_dir/querylane-server.log" 2>&1 &
querylane_pid="$!"
wait_for_url "http://127.0.0.1:$server_port/"

echo "Validated local Homebrew formula $version at $tap_dir"
