# Deploy Day Planner to k3s

One Ingress serves the suite. The `daily-planner` Deployment serves Planner,
Projects, Graph at `/graph/`, Viewer at `/viewer/`, and Validation at
`/?view=validation` from one Nginx image.
The Ingress routes `/api/` directly to the `daily-planner-api` Deployment.
PostgreSQL 17 runs in the `postgres` StatefulSet with its existing data claim.
A one-shot Job migrates its schema before each application rollout.

## Publish and configure a release

Push a new `vMAJOR.MINOR.PATCH` tag from a commit on `main`. GitHub Actions
runs CI, publishes the web and API images for AMD64 and ARM64 to GHCR, and
posts their immutable digests in the GitHub release notes. Check out that
same source tag for the manifests and deployment scripts. For a private
registry, arrange pull credentials for both Deployments and the migration Job
in your overlay or namespace. For a private build, the root Dockerfile
supports `docker buildx build --target web` and `--target api`. Use your
registry and the node's platform, then configure the published digest or a
`vMAJOR.MINOR.PATCH` tag in the overlay.

From that checkout, copy the [example overlay](../k3s-overlays/example) once
to `deploy/k3s-overlays/local`. The local overlay is ignored by Git. For each
release, update both image entries with the release image names and digests.
Set `newName` to the full registry path and `digest` to its `sha256:…` value.
Remove `newTag` when using a digest. Set the Ingress rule host to a hostname
that resolves to the k3s ingress. Save a copy of your overlay with its release
tag for rollback and disaster recovery.

Use the example HTTP listener on a trusted private network. For Traefik TLS,
enable `ingress-https.yaml` in the local overlay, match its hostname to the
Ingress rule, and install the named TLS Secret. For access from an untrusted
network, use HTTPS and authentication for the entire suite, including API
and attachment routes, such as an existing Traefik ForwardAuth middleware
or a trusted authenticated proxy. Protect direct access to the ingress if
the proxy is the access boundary.

## Install or upgrade

Use Bash, `kubectl`, Mike Farah `yq` v4, curl, and optionally `just` from the deployment
workstation. The cluster needs an ingress controller and default StorageClass.
Select the intended context with `kubectl config get-contexts`. Set
`K3S_CONTEXT` to that name and `SUITE_URL` to the configured ingress URL.

On first install, `just k3s-init-db "$K3S_CONTEXT"` creates the namespace and
database Secret. On upgrades it reuses the Secret and refuses to generate a
replacement when the PostgreSQL PVC already exists. Keep the namespace,
StatefulSet, data claim, and Secret identities. Before upgrading, review
migration compatibility and take an off-device backup.

```bash
just k3s-init-db "$K3S_CONTEXT"
just k3s-render deploy/k3s-overlays/local
just k3s-preflight "$K3S_CONTEXT"
just k3s-apply "$K3S_CONTEXT"
just k3s-smoke "$SUITE_URL"
```

From the same checkout, run the deployment scripts directly if you use
`kubectl` without Just:

```bash
bash deploy/k3s/setup.sh init-db "$K3S_CONTEXT"
kubectl kustomize deploy/k3s-overlays/local
bash deploy/k3s/setup.sh preflight "$K3S_CONTEXT" deploy/k3s-overlays/local
bash deploy/k3s/setup.sh apply "$K3S_CONTEXT" deploy/k3s-overlays/local
bash deploy/k3s/smoke.sh "$SUITE_URL"
```


The standalone preflight is a preview. Apply repeats preflight using its own
render, checks the selected context and required Secret keys, performs a server
dry run, and applies the PostgreSQL resources. Once PostgreSQL is ready, it
creates a migration Job using the release API image. If the Job fails, the
command prints diagnostics and exits before applying the API and web workloads.
Once the Job succeeds, apply updates the remaining resources and waits for the
Deployments. Run one apply at a time per installation. Use the guarded apply
command for releases so the Job runs before the application rollout.

For the first upgrade from a standalone Viewer Deployment, stop and remove
only the old Viewer Deployment and Service **after** `/viewer/` passes the
suite smoke check. Remove the old Viewer image entry from the local overlay.
Older releases expect both resources and recreate them if you reapply their
manifests.

```bash
kubectl --context "$K3S_CONTEXT" -n daily-planner delete \
  deployment/markdown-viewer service/markdown-viewer --ignore-not-found
```

### Migrations and rollback

Add immutable, zero-padded migration files in `app_planner/migrations/`.
The first file adopts the existing Planner, Projects, and Graph objects
and preserves their data and old migration records. The runner takes a
database advisory lock and records the applied files in
`day_planner_schema_migrations` in the same transaction as the SQL. Use
transactional SQL. The API readiness endpoint verifies that the database
contains the migration versions required by that API image.

Prefer additive changes compatible with the currently running release.
That release may still handle requests during migration. When that
compatibility holds, roll back by reapplying the previous source and pinned
overlay. PostgreSQL keeps newer applied migrations. For an incompatible
change, plan downtime, stop writes before switching schemas, and validate
recovery from a pre-upgrade off-device dump. If recovery is needed, restore
into a fresh database and verify it before cutover. Reconcile writes made
since the dump separately. Use the previous release's runbook if rolling
back to an archive-based release.

### Adding a static tool

Choose a URL prefix, configure the static build for that prefix, and copy its
output to the matching directory in the web image. Update navigation and smoke
checks. Tools that need persistence can add a router to the existing API.

## Move an existing graph

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

## Backups and recovery

The PostgreSQL CronJob runs daily at 03:17 in the controller's default time
zone and prunes completed dumps older than roughly two weeks. The backup
PVC is a quick recovery copy. A node-local PVC shares the laptop's failure
domain, so schedule a second backup on a separate machine with its own
storage, a kubeconfig with the required pod exec access, and PostgreSQL 17
or newer client tools.

Set up a private destination directory and add a daily scheduler entry. For
example, the following crontab uses an absolute checkout path, an explicit
kubeconfig and context, and sends failures to the scheduler's configured mail
destination. Set `PATH` in the crontab to include `kubectl` and `pg_restore`.

```cron
MAILTO=operator@your-domain
30 4 * * * KUBECONFIG=/secure/kubeconfig /bin/bash /srv/day-planner/deploy/k3s/backup-off-node.sh my-k3s-context /srv/backups/day-planner
```

The script exports a full custom archive, checks that `pg_restore` can read
its table of contents, publishes it, and then prunes completed exports older
than roughly 30 days. Use storage and file permissions appropriate for the
database contents. Keep the deployment overlay and a protected copy of the
database Secret separately. For a one-off copy before deployment, run
`just k3s-backup "$K3S_CONTEXT" "daily-planner-$(date -u +%Y%m%dT%H%M%SZ).dump"`
from the separate machine.

Check on-node job freshness with `just k3s-backup-status "$K3S_CONTEXT"`.
It exits nonzero for a failed, missing, suspended, or stale scheduled backup.
Check the off-device scheduler's result and the age of the newest completed
file independently. For example, on the backup machine:

```bash
test -n "$(find /srv/backups/day-planner -maxdepth 1 -type f \
  -name 'daily-planner-????????T??????Z.dump' -mmin -1560 -print)"
```

Rehearse recovery after setting up backups and before upgrades that change
the schema incompatibly. Use a disposable PostgreSQL server, with its own
credentials and volume. Create a fresh database and use an explicit URL for
it. Restoring these application objects as the test database owner avoids
dependencies on the original server's roles.

```bash
createdb --maintenance-db="$RESTORE_SERVER_URL" daily_planner_restore
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
```

Start a test API from the matching release and point it at the restored
database. A dump taken before the migration framework was introduced needs
the release migration command before starting the new API. Check a Planner
entry, a project card, the Graph document, and the contents of a downloaded
attachment. Record the archive and restore date. Repeat against a recent
off-device copy periodically.

## Troubleshooting

```bash
kubectl --context "$K3S_CONTEXT" -n daily-planner get ingress,svc,deploy,sts,pod,pvc,job,cronjob
kubectl --context "$K3S_CONTEXT" -n daily-planner logs deployment/daily-planner-api --since=30m
kubectl --context "$K3S_CONTEXT" -n daily-planner describe pod postgres-0
```

Use `/api/health` for database and schema readiness and `/api/livez` for
process liveness. On failed requests, search the API completion logs using
the `X-Request-ID` response header. Logs include route, status, and timing.
For ingress-level correlation, configure Traefik to include that header in
its access logs. Run smoke checks through the same authorized access path
as users.

Verify storage provisioning, private registry pulls, Ingress and TLS, a
migration Job, and application rollback on a disposable k3s installation
before upgrading the laptop.
