# k3s Deployment

This directory is a kustomize base for running Daily Planner and Obsidian Arrow on k3s with:

- one app `Deployment`
- one Postgres `StatefulSet`
- persisted Postgres storage
- a Traefik-compatible `Ingress`
- a nightly `pg_dump` backup `CronJob`

The root Dockerfile builds both frontends into the same image. The existing
ingress serves Daily Planner at `/`, Obsidian Arrow at `/graph/`, and the
planner API under `/api/`. The deployment waits for `/graph/` at startup and
checks the database-backed `/api/health` endpoint for readiness and liveness.

Before applying it, replace these placeholders:

- `registry.example.com/daily-planner:latest` in `kustomization.yaml`. Use a unique tag for each rollout.
- `planner.example.com` in `ingress.yaml`
- `change-me` values in `secret.yaml`

Build and push the image from the repository root after authenticating to the
registry. Match the tag to `kustomization.yaml` and the platform to the target
nodes. Use `linux/arm64` for ARM64 nodes or `linux/amd64` for x86-64 nodes.

```bash
just k3s-publish registry.example.com/daily-planner:YOUR_RELEASE_TAG linux/arm64
```

Check `kubectl config current-context` before deploying. Then render and apply:

```bash
just k3s-render
just k3s-apply
```

Check rollout:

```bash
just k3s-rollout
just k3s-status
```

Open `/` and `/graph/` on the configured host after rollout. Use an ingress
reachable only by the intended users through your private network or existing
access controls.

### Move an existing graph

1. From the repository root, run `just host-start obsidian-arrow` and open
   Obsidian Arrow on its original browser origin using the same protocol,
   hostname, and port where the graph was saved. For the root Compose stack
   this is usually `http://localhost:8081`. If you used the standalone stack
   inside `obsidian-arrow/`, rebuild it there with `just docker-up-detached`.
2. Select **Export backup** to download the graph and its attachment files. If
   the export reports a missing file, recover it from the original copy or use
   **Export JSON** to transfer the graph and attachment metadata alone.
3. Open `/graph/` on the k3s host and select **Import JSON** to load the backup.
   Import replaces the open graph. Reload the page and download an attachment
   to verify the restore before retiring the old origin.

Graph data remains in the browser profile. The scheduled Postgres dump covers
planner and project data. Use **Export backup** for Graph.

Follow app logs with `just k3s-logs`. The render and apply helpers wrap these
commands:

```bash
kubectl kustomize deploy/k3s
kubectl apply -k deploy/k3s
```

Restore a backup:

```bash
kubectl -n daily-planner cp daily-planner.dump postgres-0:/tmp/daily-planner.dump
kubectl -n daily-planner exec -it postgres-0 -- sh -c \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --clean --if-exists --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" /tmp/daily-planner.dump'
```

Monitoring belongs in cluster infrastructure. This app exposes `/api/health` for readiness, liveness, and blackbox checks. Add Prometheus/Grafana/Loki or similar from your k3s infra repo, then point it at the app service or ingress.
