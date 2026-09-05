# k3s Deployment

This directory is a kustomize base for running Daily Planner on k3s with:

- one app `Deployment`
- one Postgres `StatefulSet`
- persisted Postgres storage
- a Traefik-compatible `Ingress`
- a nightly `pg_dump` backup `CronJob`

Before applying it, replace these placeholders:

- `registry.example.com/daily-planner:latest` in `kustomization.yaml`
- `planner.example.com` in `ingress.yaml`
- `change-me` values in `secret.yaml`

Build and push the image:

```bash
docker build -t registry.example.com/daily-planner:latest .
docker push registry.example.com/daily-planner:latest
```

Deploy:

```bash
just k3s-render
just k3s-apply
```

Check rollout:

```bash
kubectl -n daily-planner rollout status statefulset/postgres
kubectl -n daily-planner rollout status deployment/daily-planner
just k3s-status
```

The `just` helpers wrap these commands:

```bash
kubectl kustomize deploy/k3s
kubectl apply -k deploy/k3s
kubectl -n daily-planner get ingress,pods,pvc,cronjob
```

Restore a backup:

```bash
kubectl -n daily-planner cp daily-planner.dump postgres-0:/tmp/daily-planner.dump
kubectl -n daily-planner exec -it postgres-0 -- sh -c \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --clean --if-exists --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" /tmp/daily-planner.dump'
```

Monitoring belongs in cluster infrastructure. This app exposes `/api/health` for readiness, liveness, and blackbox checks. Add Prometheus/Grafana/Loki or similar from your k3s infra repo, then point it at the app service or ingress.
