# Querylane Helm chart

This chart is an unpublished preview. It installs Querylane with an external
PostgreSQL metadata database and an internal `ClusterIP` Service.

The preview follows the rolling `querylane-dev:edge` image. A published chart
will pin a stable application version instead.

Querylane does not currently include built-in authentication. The chart does
not create an Ingress. Keep the Service private and use an authenticating proxy
before exposing Querylane outside the cluster.

## Prerequisites

- Kubernetes
- Helm 3 or 4
- An external PostgreSQL database for Querylane metadata

Create one stable Kubernetes Secret before installing. Keep both values across
restarts and replicas:

```sh
export QUERYLANE_DATABASE_DSN='postgresql://querylane:replace-me@postgres.example.com/querylane?sslmode=verify-full'
export QUERYLANE_INSTANCE_SECRET_KEY="$(openssl rand -base64 32)"

kubectl create secret generic querylane \
  --from-literal=database-dsn="$QUERYLANE_DATABASE_DSN" \
  --from-literal=instance-secret-key="$QUERYLANE_INSTANCE_SECRET_KEY"
```

Install from the repository checkout:

```sh
helm install querylane ./charts/querylane
kubectl port-forward service/querylane 8080:80
```

Open `http://127.0.0.1:8080`.

## Health checks

`GET /livez` returns `200` while the HTTP server is running and does not depend
on the metadata database. `GET /readyz` returns `200` when the metadata database
is initialized and reachable, and `503` while Querylane is initializing or the
database is unavailable. The chart configures its Kubernetes probes to use
these endpoints.

Use `externalDatabase.existingSecret` and `instanceSecret.existingSecret` when
the two values live in different Secrets. The chart never creates or stores
credential values in Helm values.

## Production settings

Upgrades use the `Recreate` strategy to avoid running different Querylane
versions concurrently while metadata migrations run. Plan for brief downtime.

The preview does not set default resource requests or limits because the right
values depend on the number and size of managed PostgreSQL instances. Set
`resources.requests` and `resources.limits` from observed usage before a
production rollout.

An empty `image.tag` uses the chart's `appVersion`, currently `edge`. When
changing `image.repository`, also set `image.tag` or, preferably,
`image.digest`.

## Scope

The preview deliberately excludes chart publishing, Ingress, bundled
PostgreSQL, autoscaling, and public discovery metadata.
