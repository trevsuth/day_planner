# k3s Deployment

This directory is a kustomize base for hosting the suite on k3s. One ingress
serves a shared hostname with these routes:

| Route | Workload | Docker target |
| --- | --- | --- |
| `/`, `/?view=projects`, `/graph/` | `daily-planner` web Deployment | `web` |
| `/api/` | `daily-planner-api` Deployment | `api` |
| `/viewer/` | `markdown-viewer` Deployment | `viewer` |

Postgres runs in a StatefulSet with its existing persistent volume. The API
connects to it and exposes `/api/health`. The nightly `pg_dump` CronJob uses
the same database and backup volume. Upgrading an existing installation uses
the same namespace, database secret, and Postgres StatefulSet. The existing
`daily-planner` Deployment becomes the web shell. The API and Viewer have their
own Deployments and Services.

Before applying it, replace these placeholders:

- The three image references in `kustomization.yaml`. Use a unique tag when publishing an image.
- `planner.example.com` in `ingress.yaml`
- `change-me` values in `secret.yaml`

Build and push each image from the repository root after authenticating to the
registry. Match the tags in `kustomization.yaml` and the platform to the target
nodes. Use `linux/arm64` for ARM64 nodes or `linux/amd64` for x86-64 nodes.

```bash
just k3s-publish registry.example.com/daily-planner-web:YOUR_RELEASE_TAG linux/arm64 web
just k3s-publish registry.example.com/daily-planner-api:YOUR_RELEASE_TAG linux/arm64 api
just k3s-publish registry.example.com/markdown-viewer:YOUR_RELEASE_TAG linux/arm64 viewer
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

Open `/`, `/graph/`, and `/viewer/` on the configured host after rollout. Use an ingress
reachable only by the intended users through your private network or existing
access controls.

### Adding a tool

1. Choose a URL prefix and build the tool's assets for that prefix. Viewer
   uses `/viewer/` and the `viewer` target in the root Dockerfile.
2. Add the image and service to Compose. Add a Service, Deployment, image
   reference, and prefix route under `deploy/k3s/`. Add the same proxy route
   to `deploy/nginx/web.conf` for Compose and local port forwarding.
3. Add a navigation link and verify that the tool opens directly and through
   navigation. If it needs persistence, add an API router and keep the database
   connection in the API service.

To release Viewer on its own, publish only the `viewer` target, update its
image tag, and run `just k3s-apply`. Use `just k3s-logs markdown-viewer` for its
logs. The web and API image tags can stay pinned.

### Move an existing graph

Open Graph’s **Document** menu to find its import and export actions.

1. If you saved data in the browser at the current hosted URL before the
   storage upgrade, use **Export old browser graph** at that URL and skip to
   step 3. Otherwise, use the [standalone Graph setup](../../obsidian-arrow/README.md)
   and open Graph on its original browser origin using the same protocol,
   hostname, and port where the graph was saved. For the root Compose stack
   this is usually `http://localhost:8081`. If you used the standalone stack
   inside `obsidian-arrow/`, rebuild it there with `just docker-up-detached`.
2. Select **Export backup** to download the graph and its attachment files. If
   the export reports a missing file, recover it from the original copy or use
   **Export JSON** to transfer the graph and attachment metadata alone.
3. Open `/graph/` on the k3s host and select **Import JSON** to load the backup.
   Import replaces the shared graph when it saves. Wait for **Saved**, then
   open the URL in a fresh browser profile and download an attachment to verify
   the migration before retiring the old origin.

The scheduled Postgres dump includes Planner, Projects, the shared Graph, and
attachment bytes. Graph keeps previously saved attachment bytes so undo can
recover references to them. Removing an attachment from the graph does not
reclaim its database storage. Use **Export backup** for an additional portable
copy of the active graph and its files.

Follow app logs with `just k3s-logs`. The render and apply helpers wrap these
commands:

```bash
kubectl kustomize deploy/k3s
kubectl apply -k deploy/k3s
```

To verify a backup, restore into a separate test database first and check the
graph and an attachment. The commands below replace data in the live database:

```bash
kubectl -n daily-planner cp daily-planner.dump postgres-0:/tmp/daily-planner.dump
kubectl -n daily-planner exec -it postgres-0 -- sh -c \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --clean --if-exists --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" /tmp/daily-planner.dump'
```

Monitoring belongs in cluster infrastructure. This app exposes `/api/health` for readiness, liveness, and blackbox checks. Add Prometheus/Grafana/Loki or similar from your k3s infra repo, then point it at the app service or ingress.
