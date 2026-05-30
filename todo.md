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

## Next

1. Improve import validation and reporting
   - Show row-level CSV validation failures before import.
   - Keep successful imports atomic so partial files do not leave confusing state.

## Refactoring

1. Continue splitting React project UI components by feature
   - Move project management views into `web/src/projects/views/`.
   - Move card editor, project editor, CSV panel, and shared project controls into `web/src/projects/`.
   - Keep changes mechanical and behavior-preserving.

2. Convert scheduling and card hierarchy domain logic to TypeScript
   - Convert `web/src/domain/cards.js` once tests cover more edge cases.
   - Preserve Node unit tests or convert them alongside the module.
   - Keep React components in JSX until feature modules are smaller.

3. Use server-side issue records more broadly
   - Feed server issue records into issue badges, preview panels, and dependency graph warnings.
   - Keep local issue helpers only as a fallback for optimistic UI updates.
   - Add an API smoke assertion for `/api/projmgmt/projects/{project_id}/issues`.

4. Add service-level tests around API/TUI interoperability
   - Cover TUI-facing project card creation/update service calls.
   - Cover planner assignment behavior after project card deletion.
   - Keep database tests separate from service behavior tests.

5. Consider extracting markdown rendering
   - Move markdown/Mermaid preview helpers out of `main.jsx`.
   - Add focused tests for escaping, headings, lists, and fenced code blocks.

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
