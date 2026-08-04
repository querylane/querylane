#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="$repo_root/charts/querylane"

helm lint --strict "$chart"

rendered="$(helm template querylane "$chart")"

grep -q '^kind: Deployment$' <<<"$rendered"
grep -q '^kind: Service$' <<<"$rendered"
grep -q 'image: "ghcr.io/querylane/querylane-dev:edge"' <<<"$rendered"
grep -q 'path: /livez' <<<"$rendered"
grep -q 'path: /readyz' <<<"$rendered"
grep -q 'runAsUser: 65532' <<<"$rendered"
grep -q 'readOnlyRootFilesystem: true' <<<"$rendered"

if grep -Eq '^kind: (Ingress|Secret|StatefulSet)$' <<<"$rendered"; then
  echo "default chart must not render ingress, secrets, or bundled PostgreSQL" >&2
  exit 1
fi

custom_secrets="$(
  helm template querylane "$chart" \
    --set-string externalDatabase.existingSecret=metadata-credentials \
    --set-string instanceSecret.existingSecret=instance-credentials
)"
grep -q 'name: "metadata-credentials"' <<<"$custom_secrets"
grep -q 'name: "instance-credentials"' <<<"$custom_secrets"

if helm template querylane "$chart" --set replicaCount=0 >/dev/null 2>&1; then
  echo "replicaCount=0 must fail schema validation" >&2
  exit 1
fi

if helm template querylane "$chart" --set-string externalDatabase.existingSecret=INVALID_NAME >/dev/null 2>&1; then
  echo "invalid Kubernetes Secret names must fail schema validation" >&2
  exit 1
fi

package_dir="$(mktemp -d)"
trap 'rm -rf "$package_dir"' EXIT
helm package "$chart" --destination "$package_dir" >/dev/null
helm show chart "$package_dir/querylane-0.1.0.tgz" | grep -q '^name: querylane$'
