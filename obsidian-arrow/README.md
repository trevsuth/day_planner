Local Graph Wiki
================

A local-first visual graph and wiki application inspired by arrows.app. It runs
in the browser with React, TypeScript, Vite, and an SVG graph canvas. The
combined project serves Graph at `/graph/` alongside Planner and Projects.
See the [root README](../README.md) for Compose and k3s setup.

Run it
------

```bash
just install
just dev
```

Then open the local URL printed by Vite.

Run with Docker
---------------

From `obsidian-arrow/`, build and serve the standalone app on port `8080`:

```bash
just docker-up-detached
```

Then open `http://localhost:8080`. To expose a different host port:

```bash
ARROWSAPP_PORT=8090 docker compose up --build
```

For LAN access, open `http://<host-machine-ip>:8080` from another machine on the same network.

From the repository root, `just host-start obsidian-arrow` starts the standalone
Compose service on port `8081` by default. Use the same origin where you saved
the graph when recovering browser data.

Backup and migration
--------------------

The browser stores the graph in `localStorage` and attachment bytes in
IndexedDB, scoped to the browser profile and origin. On the old URL, select
**Export backup** to include the graph and its attachment files. On the new URL,
select **Import JSON** to replace the open graph with that backup. **Export JSON**
exports the graph and attachment metadata alone. Graph backups are separate
from the Planner Postgres backups.

Developer shortcuts
-------------------

The `Justfile` in this directory manages standalone Graph development:

```bash
just install
just dev
just build
just docker-up
just docker-down
```

Run `just` to list every available recipe.

From the repository root, use `just graph-dev` for standalone hot reload or
`just graph-build` to build the bundle for the combined `/graph/` route.

Build it
--------

```bash
npm run build
```

Architecture
------------

- `src/types/graph.ts` defines the stable graph document, node, relationship, and attachment model.
- `src/lib/graphOps.ts` contains pure graph operations for creating, updating, moving, connecting, and deleting graph entities.
- `src/lib/storage.ts` owns local save/load plus JSON import/export helpers.
- `src/lib/sqlite.ts` maps the browser JSON document model to SQLite row snapshots.
- `src/lib/tauriStorage.ts` defines a Tauri command-backed storage adapter for SQLite documents and filesystem attachments.
- `src/lib/search.ts` searches node titles, labels, tags, and markdown content.
- `src/components/GraphCanvas.tsx` renders the SVG graph and handles drag/select interactions.
- `src/components/InspectorPanel.tsx` edits selected node or relationship metadata.
- `src/components/MarkdownEditor.tsx` provides a lightweight markdown editor and preview.

Next steps
----------

See [todo.md](todo.md) for planned work.
