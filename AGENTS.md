# Working on Day Planner

- Read [ARCHITECTURE.md](ARCHITECTURE.md) before proposing major structural
  changes. This is a personal application for one primary user and up to
  five concurrent users on a resource-constrained single-node k3s cluster.
- Prefer changes within existing Planner, Projects, Graph, and Viewer modules.
  Keep the FastAPI modular monolith, psycopg/PostgreSQL, and a shared static
  Nginx image. Justify any new service, dependency, or infrastructure.
- Preserve Compose and single-node k3s compatibility. Prefer standard
  Kubernetes resources and Kustomize. Avoid speculative scaling,
  abstraction, and availability mechanisms.
- Keep schema changes in versioned SQL. Use the migration runner as the
  schema owner. Preserve PVC and Secret identities, off-device backup
  procedures, and a recoverable upgrade path.
- Run Ruff and PostgreSQL-backed pytest for backend changes. Run frontend
  builds, type checking, unit tests, and relevant Playwright smoke tests for
  UI or routing changes. Render and validate HTTP and TLS overlays for
  deployment changes. Use disposable test data.
- Explain significant architectural tradeoffs and update the architecture
  and deployment runbook when boundaries or deployment assumptions change.
