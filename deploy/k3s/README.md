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

## First installation

Use a reachable k3s cluster, a kubectl context with permission to deploy the
suite, a default StorageClass, and a hostname that resolves to the ingress. The
setup commands also use `just`, Bash, OpenSSL, and curl.

1. Download `day-planner-k3s-<version>.tar.gz` and its matching checksum from
   [GitHub Releases](https://github.com/trevsuth/day_planner/releases). From the
   download directory, validate and extract the archive:

   ```bash
   release=vX.Y.Z
   shasum -a 256 -c "day-planner-k3s-$release.tar.gz.sha256"
   tar -xzf "day-planner-k3s-$release.tar.gz"
   cd "day-planner-k3s-$release"
   ```

   Set `release` to the downloaded version. The package includes the
   manifests and the image digests for both AMD64 and ARM64. If the GHCR
   packages are private, configure pull credentials on your cluster.

2. Run `kubectl config get-contexts` and choose the context for this install.
   Copy the release overlay and edit its `kustomization.yaml` to set your host:

   ```bash
   cp -R deploy/k3s-overlays/example deploy/k3s-overlays/local
   ```

   Choose one of the [access configurations](#access-configuration) before
   opening the service to users. Leave the release image digests pinned.

3. Set `K3S_CONTEXT` to the context name you chose and `SUITE_URL` to the
   configured ingress URL. Then initialize, preview, and apply. Initialization
   generates a database password on a fresh install and reuses the existing
   secret on upgrades. Apply performs a server-side dry run before writing.

   ```bash
   just k3s-init-db "$K3S_CONTEXT"
   just k3s-render deploy/k3s-overlays/local
   just k3s-apply "$K3S_CONTEXT"
   just k3s-rollout "$K3S_CONTEXT"
   just k3s-status "$K3S_CONTEXT"
   just k3s-smoke "$SUITE_URL"
   ```

   The smoke check verifies Planner, Graph, Viewer, and database connectivity
   through the same hostname users open. If you require authentication, run
   the check through an authorized access path. If rollout fails, check pod and
   volume status with `just k3s-status "$K3S_CONTEXT"` and API logs with
   `just k3s-logs "$K3S_CONTEXT"`.

## Access configuration

- **Private network.** The example uses Traefik's HTTP entrypoint. Use it on a
  trusted private network or behind a proxy that provides HTTPS and
  authentication. Keep the cluster ingress unreachable from untrusted networks
  if that proxy is the access boundary.
- **Traefik HTTPS.** Create a TLS Secret named `daily-planner-tls` in the
  `daily-planner` namespace, or set the name of an existing Secret. In the
  local overlay, set the same hostname in `ingress-https.yaml` and
  `kustomization.yaml`, then uncomment the HTTPS patch. If deployment
  needs user authentication, also enable the middleware annotation and
  name your existing ForwardAuth middleware. It applies to the entire ingress,
  including the API and Graph attachment downloads. Configure HTTP-to-HTTPS
  redirection on Traefik if you want to accept requests on both ports.
  [Traefik Kubernetes Ingress configuration](https://doc.traefik.io/traefik/routing/providers/kubernetes-ingress/)

## Publish a release

From the source repository, tag a tested commit on `main` with a new
`vMAJOR.MINOR.PATCH` tag. Pushing the tag starts the release workflow. After
CI passes, it publishes the web, API, and Viewer images to GHCR and uploads the
digest-pinned deployment archive and checksum to GitHub Releases. For
anonymous installs, verify that users can pull all three packages without
credentials. For private packages, document how installers obtain their
registry access.

For development builds or a private fork, use
`just k3s-publish IMAGE PLATFORM TARGET` from the source checkout. Set the
three image references in your own overlay.

## Upgrade an existing installation

Keep the namespace, hostname, Postgres volume, and database secret. Take a
database backup to another machine before upgrading. Keep a copy of your
current overlay, then copy the new release's image references into the overlay
for the new package version. Keep your hostname and access settings. Apply the
overlay and rerun the rollout and smoke checks.

To roll back application images, apply the previous release with the previous
image references. If a release changes the database schema incompatibly, follow
its release notes and restore the matching backup to a fresh database before
cutover. Recovering an older backup also discards writes made after that backup.

### Adding a tool

1. Choose a URL prefix and build the tool's assets for that prefix. Viewer
   uses `/viewer/` and the `viewer` target in the root Dockerfile.
2. Add the image and service to Compose. Add a Service, Deployment, image
   reference in your overlay, and a prefix route under `deploy/k3s/`. Add the same proxy route
   to `deploy/nginx/web.conf` for Compose and local port forwarding.
3. Add a navigation link and verify that the tool opens directly and through
   navigation. If it needs persistence, add an API router and keep the database
   connection in the API service.

To release Viewer on its own, publish only the `viewer` target, update its
image tag, and run `just k3s-apply "$K3S_CONTEXT"`. Use `just k3s-logs "$K3S_CONTEXT" markdown-viewer` for its
logs. The web and API image tags can stay pinned.

### Move an existing graph

Open Graph’s **Document** menu to find its import and export actions.

1. If you saved data in the browser at the current hosted URL before the
   storage upgrade, use **Export old browser graph** at that URL and skip to
   step 3. Otherwise, use the [standalone Graph setup](https://github.com/trevsuth/day_planner/blob/main/obsidian-arrow/README.md)
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

## Back up and rehearse recovery

The nightly job stores copies on its backup volume. On a cluster with
node-local storage, keep an additional copy outside the node. From a separate
machine with kubectl access, run:

```bash
just k3s-backup "$K3S_CONTEXT" "daily-planner-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

This streams a complete Postgres archive into a new file on that machine. It
includes the hosted Graph and its attachments. Schedule it from your backup
host if you want regular off-node copies. Protect the archive as you would the
database itself.

For a restore rehearsal, use a disposable cluster or database. For example,
with the Postgres client tools installed and a connection to a disposable
server:

```bash
createdb --maintenance-db="$RESTORE_SERVER_URL" daily_planner_restore
pg_restore --exit-on-error --dbname="$RESTORE_DATABASE_URL" daily-planner.dump
```

Set `RESTORE_DATABASE_URL` to the new `daily_planner_restore` database, then
connect a test instance of the API to it. Open a restored planner entry,
project card, and graph. Download a Graph attachment and verify its contents.
Before going live, rehearse a fresh install, an upgrade, and an application
rollback using a disposable namespace or cluster and sample data.

Use `/api/health` for database readiness and external checks. The API's
liveness endpoint, `/api/livez`, stays available during a temporary database
outage so Kubernetes can pause traffic without restarting the API.
