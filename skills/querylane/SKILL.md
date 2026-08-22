---
name: querylane
description: Install, configure, deploy, and troubleshoot Querylane (self-hosted PostgreSQL admin UI) with Docker, Docker Compose, Helm, or Kubernetes. Use when the user wants to run Querylane, connect it to PostgreSQL servers, set up its metadata database and secrets, or debug a Querylane deployment.
---

# Querylane

Querylane is a self-hosted PostgreSQL admin UI (Go backend + embedded React UI,
one container, one port). Image: `ghcr.io/querylane/querylane` (`latest`,
`<version>`); rolling dev builds: `ghcr.io/querylane/querylane-dev:edge`.

Authoritative docs: https://docs.querylane.net (plain text:
https://docs.querylane.net/llms.txt, MCP: https://docs.querylane.net/mcp).
Prefer fetching a docs page over guessing when a config key is uncertain.

## Vocabulary (get this right when talking to the user)

- **Instance**: a PostgreSQL server Querylane inspects. Registered in the UI or
  declared in `querylane.yaml` under `instances:`.
- **Metadata database**: Querylane's *own* PostgreSQL database (config,
  encrypted credentials, samples). Never the same thing as an instance. Any
  PostgreSQL works, including managed services. Migrations run at startup.
- **`QUERYLANE_INSTANCE_SECRET_KEY`**: base64 32-byte key encrypting stored
  instance credentials and the token-signing key. Generate once
  (`openssl rand -base64 32`), keep it identical across replicas and
  restarts. Changing it makes stored credentials unreadable; rotation is not
  supported.

## Choose a path

| User wants | Do |
| --- | --- |
| "just try it" | Docker quick start (demo data, one command) |
| evaluate against their own server | `docker run` + register in UI, or quick start with an added instance |
| Kubernetes trial | Helm with `devPostgres.enabled=true` |
| durable / production | Helm or Compose with external metadata PostgreSQL, Secrets, authenticated ingress |

Always tell the user: Querylane has **no built-in authentication**. Never
expose it to the public internet without an authenticating proxy / IAP / VPN.

## Docker quick start

```sh
curl -fsSL https://raw.githubusercontent.com/querylane/querylane/main/deploy/quick-start/compose.yaml | docker compose -f - up
```

Requires Compose v2.23+. Brings up `querylane`, `postgres-meta`,
`postgres-demo` (PG17, `pg_stat_statements`, `ecommerce` + `analytics`), and
`seeder` (seeder-buddy live workload). UI: http://localhost:8080 (override
with `QUERYLANE_PORT`). Teardown: `docker compose -p querylane-quick-start down --volumes`.

The demo instance is declared in the file's `instances:` section, which makes
the UI instance editor read-only. To add the user's server, download the file
and append to that list (use `host.docker.internal` for a DB on the host), or
delete the whole `instances:` section to manage instances in the UI.

## Docker against the user's own PostgreSQL

```sh
docker run --rm --name querylane --publish 127.0.0.1:8080:8080 \
  --env QUERYLANE_DATABASE_DSN="postgres://querylane:***@db.example.com:5432/querylane?sslmode=require" \
  --env QUERYLANE_INSTANCE_SECRET_KEY="<openssl rand -base64 32, persisted>" \
  ghcr.io/querylane/querylane:latest
```

Omit `QUERYLANE_DATABASE_DSN` to get the first-launch wizard (can run an
embedded PostgreSQL — fine for a disposable demo only).

Production Compose shape (pinned digest, read-only FS, secrets from `.env`):
https://docs.querylane.net/get-started/deploy-querylane

## Helm / Kubernetes

Chart: `oci://ghcr.io/querylane/charts/querylane`
(source: `deploy/helm/querylane` in the repo). Docs:
https://docs.querylane.net/get-started/install-helm

Trial, zero dependencies:

```sh
helm install querylane oci://ghcr.io/querylane/charts/querylane \
  --namespace querylane --create-namespace --set devPostgres.enabled=true
kubectl -n querylane port-forward svc/querylane 8080:8080
```

Production:

```sh
kubectl -n querylane create secret generic querylane \
  --from-literal=dsn='postgres://querylane:***@db.example.com:5432/querylane?sslmode=require' \
  --from-literal=instance-secret-key="$(openssl rand -base64 32)"
```

```yaml
# values.yaml
metadataDatabase: { existingSecret: { name: querylane, key: dsn } }
instanceSecretKey: { existingSecret: { name: querylane, key: instance-secret-key } }
replicaCount: 2
podDisruptionBudget: { enabled: true }
ingress:
  enabled: true
  className: nginx
  annotations: {}   # add auth annotations (oauth2-proxy, IAP, ...) here
  hosts: [{ host: querylane.example.com, paths: [{ path: /, pathType: Prefix }] }]
  tls: [{ secretName: querylane-tls, hosts: [querylane.example.com] }]
config:
  http: { host: "0.0.0.0", port: 8080, cors: { allowed_origins: ["https://querylane.example.com"] } }
  instances:
    - id: production
      display_name: Production
      host: db.example.com
      port: 5432
      database: app
      username: querylane_reader
      password_env: PROD_DB_PASSWORD   # keep secrets out of values
      ssl_mode: require
extraEnv:
  - name: PROD_DB_PASSWORD
    valueFrom: { secretKeyRef: { name: prod-db, key: password } }
```

Rules the chart enforces: exactly one of `metadataDatabase.dsn`,
`metadataDatabase.existingSecret`, `devPostgres.enabled`; `devPostgres` is
evaluation-only (single pod, no backups). Everything under `config` is
rendered verbatim to `/etc/querylane/querylane.yaml`; a non-empty
`config.instances` makes the UI instance editor read-only. Pin with
`--version` and `image.digest` for reproducible rollouts.

## Least-privilege instance role

Create a dedicated login per server; start catalog-only, add `SELECT` for
data browsing, `pg_monitor` for activity/stats. No SUPERUSER, no BYPASSRLS.
SQL templates: https://docs.querylane.net/get-started/deploy-querylane#5-configure-least-privilege-instance-access

## Verify a deployment

```sh
curl -s -X POST http://localhost:8080/querylane.console.v1alpha1.ConsoleService/GetConsoleConfig \
  -H 'content-type: application/json' -d '{}'
```

Expect `"databaseStatus":{"state":"STATE_READY"}`. Other states:
`STATE_NOT_CONFIGURED` = no metadata DB (or init failed — read the logs),
`INSTANCE_MANAGEMENT_MODE_CONFIG` = instances come from the file.
`GET /` only proves the HTTP server is up, not that the metadata DB works.

## Troubleshooting

- `'server.Config' has invalid keys: limits` / `instance_targets` → the image
  is 0.1.0, which predates those keys. Remove them or use a newer release.
- `QUERYLANE_INSTANCE_SECRET_KEY must be base64-encoded 32 bytes` → regenerate
  with `openssl rand -base64 32` (raw 32-byte string or `sha256:<passphrase>`
  also accepted).
- Instance test fails with a generic error → by design unless a strict
  `instance_targets.allowed_cidrs` is configured. Check DNS from inside the
  container/pod, `pg_hba.conf`, SSL mode, and that link-local/metadata IPs
  are blocked by default.
- Instance editor is read-only → `instances:` exists in the config file.
- Credentials unreadable after restart → the secret key changed. Restore the
  original key; re-enter credentials otherwise.
- Pod Ready but UI shows setup wizard → readiness only checks `GET /`; check
  `GetConsoleConfig` and the logs for the DB init error.

Config reference (all keys, commented):
https://raw.githubusercontent.com/querylane/querylane/main/docs/reference-config.yaml
