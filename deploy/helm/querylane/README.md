# querylane Helm chart

Deploys [Querylane](https://github.com/querylane/querylane), a self-hosted PostgreSQL admin UI.

```sh
# Evaluation: zero dependencies (single-pod metadata Postgres, no backups)
helm install querylane oci://ghcr.io/querylane/charts/querylane \
  --namespace querylane --create-namespace \
  --set devPostgres.enabled=true

# Production: bring your own metadata PostgreSQL + encryption key
kubectl -n querylane create secret generic querylane \
  --from-literal=dsn='postgres://querylane:***@db.example.com:5432/querylane?sslmode=require' \
  --from-literal=instance-secret-key="$(openssl rand -base64 32)"
helm install querylane oci://ghcr.io/querylane/charts/querylane \
  --namespace querylane --create-namespace \
  --set metadataDatabase.existingSecret.name=querylane \
  --set instanceSecretKey.existingSecret.name=querylane
```

Full documentation, including managing instances as values and the complete
values reference: <https://docs.querylane.net/get-started/install-helm>.

## Layout

| Template | Resource |
| --- | --- |
| `deployment.yaml` | Querylane Deployment (hardened, distroless, uid 65532) |
| `configmap.yaml` | `/etc/querylane/querylane.yaml` rendered from `.Values.config` |
| `secret.yaml` | DSN / encryption key when provided inline or via `devPostgres` |
| `service.yaml`, `ingress.yaml` | Networking |
| `pdb.yaml`, `hpa.yaml` | Availability (opt-in) |
| `dev-postgres.yaml` | Evaluation-only metadata PostgreSQL StatefulSet (opt-in) |

## Development

```sh
helm lint . -f ci/dev-postgres-values.yaml
helm template querylane . -f ci/existing-secret-values.yaml
kind create cluster && helm install querylane . -f ci/dev-postgres-values.yaml --wait
```

`.github/workflows/helm.yml` runs these checks on every PR that touches the
chart and publishes a new `version` from `Chart.yaml` to
`oci://ghcr.io/querylane/charts` on merge to `main`. Bump `version` (and
`appVersion` when the default image changes) with every chart change.
