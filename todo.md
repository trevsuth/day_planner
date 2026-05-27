# Todo

## Product Direction

Keep the application lightweight in day-to-day use:

- Prefer fast capture, clear scheduling, and reliable local data over additional views.
- Keep infrequent administration behind compact drawers, panels, or command recipes.
- Add new concepts only when they reduce repeated manual work in both the web app and TUI.
- Do not maintain completed work in this file; completed changes are recorded in git history.

## Immediate

1. Add continuous integration checks
   - Run Python tests and lint checks on each push.
   - Run the focused Playwright smoke tests against isolated databases.
   - Keep the workflow small and fast enough to run routinely.

2. Improve TUI project-card navigation
   - Add quick search or jump-to-card.
   - Make selection and parent-child context clearer.
   - Reduce steps between selecting a card and editing its key fields.

3. Add lightweight capacity warnings
   - Warn when a future day already has all priority slots filled.
   - Surface multiple cards assigned to the same day.
   - Avoid automated scheduling until manual planning behavior is well understood.

## Next

1. Add recurring planner tasks
   - Support daily, weekly, and monthly recurrence with an optional end date.
   - Keep exceptions and skipped occurrences simple and understandable.

2. Add reusable card templates
   - Pre-fill descriptions and deliverables for common card types.
   - Allow optional starter child cards.
   - Keep templates optional and out of the primary creation flow.

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
