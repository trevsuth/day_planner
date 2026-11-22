Local Graph Wiki
================

A local-first visual graph and wiki application inspired by arrows.app. The first version runs entirely in the browser with React, TypeScript, Vite, an SVG graph canvas, and `localStorage` persistence.

Run it
------

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

Run with Docker
---------------

Build and serve the production app on port `8080`:

```bash
docker compose up --build
```

Then open `http://localhost:8080`. To expose a different host port:

```bash
ARROWSAPP_PORT=8090 docker compose up --build
```

For LAN access, open `http://<host-machine-ip>:8080` from another machine on the same network.

The container serves the static app only. Graph data and attachment bytes are still stored per browser profile using `localStorage` and IndexedDB, so use JSON export/import when moving data between machines until a shared backend is added.

Developer shortcuts
-------------------

This repo includes a `Justfile` for common commands:

```bash
just install
just dev
just build
just docker-up
just docker-down
```

Run `just` to list every available recipe.

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

- Add undo/redo by storing command history or immutable document snapshots.
- Add richer relationship creation affordances, pan/zoom, and canvas fit controls.
- Replace the simple markdown renderer with a parser such as `remark` once dependencies are acceptable.
- Wire `TauriStorageRepository` to Rust commands when adding the Tauri shell.
- Add tests around graph operations, persistence migrations, and SQLite snapshot conversion.
