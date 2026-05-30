# Todo

## Product Direction

Keep the application lightweight in day-to-day use:

- Prefer fast capture, clear scheduling, and reliable local data over additional views.
- Keep infrequent administration behind compact drawers, panels, or command recipes.
- Add new concepts only when they reduce repeated manual work in both the web app and TUI.
- Do not maintain completed work in this file; completed changes are recorded in git history.

## Immediate

1. Add recurring planner tasks
   - Support daily, weekly, and monthly recurrence with an optional end date.
   - Keep exceptions and skipped occurrences simple and understandable.
   - Make recurrence visible in both the web planner and TUI without cluttering daily capture.

2. Add reusable card templates
   - Pre-fill descriptions and deliverables for common card types.
   - Allow optional starter child cards.
   - Keep templates optional and out of the primary creation flow.

3. Add a compact keyboard-shortcut reference
   - Show web and TUI shortcuts from a small help panel.
   - Keep it discoverable without adding persistent screen weight.
   - Include project navigation, card editing, planner navigation, and assignment actions.

## Next

1. Improve import validation and reporting
   - Show row-level CSV validation failures before import.
   - Keep successful imports atomic so partial files do not leave confusing state.

## Refactoring

1. Continue splitting React UI components by feature
   - Move planner components into `web/src/planner/`.
   - Move project management views and card editor components into `web/src/projects/`.
   - Keep API reference and app shell separate from feature-level state.

2. Expand frontend domain tests
   - Cover CSV parsing/import validation and planner-entry normalization.
   - Add tests when extracted domain functions gain new behavior.
   - Keep Playwright focused on workflow smoke coverage rather than every rule.

3. Expand the Python service layer
   - Move remaining shared planner save/load behavior into service calls where useful.
   - Add service-level tests for project hierarchy and planner assignment behavior.
   - Keep database modules focused on persistence.

4. Use server-side issue results in the web UI
   - Fetch `/api/projmgmt/projects/{project_id}/issues` alongside cards.
   - Reconcile server issue records with the existing local issue badges.
   - Keep local domain helpers for responsive previews, but avoid divergent warning behavior.

5. Convert extracted frontend domain modules to TypeScript incrementally
   - Start with `web/src/domain/planner.js` and `web/src/domain/csv.js`.
   - Convert scheduling and card hierarchy logic after unit coverage is broad enough.
   - Keep React components in JSX until feature modules are smaller.

## Later

1. Add a reference-notes repository for projects and cards
   - Start with linked notes rather than a full wiki or document-management system.

2. Add structured application settings
   - Configure CORS and frontend hostnames only when non-local deployments require it.
   - Keep SQLite and per-machine local storage as the default.

3. Evaluate an external database option
   - Consider Postgres only if multi-user hosting or concurrency becomes a real need.

4. Evaluate an MCP server
   - Expose planner and project actions only after data contracts and backup behavior are stable.
