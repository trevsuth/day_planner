# Suite search

Open **Search** from the navigation or press `Ctrl+Shift+K` on Windows and
Linux or `Cmd+Shift+K` on macOS. The keyboard shortcut opens a separate tab
from Graph and Viewer so the current draft stays available.

Enter at least two characters. Search looks for a case-insensitive phrase
across Planner entries, project cards, and hosted Graph notes. Results
show their source and an excerpt. Open a result to jump to its Planner date,
card preview, or selected Graph node.

Planner results include schedules, notes, priorities, and tasks. Project
results include card titles, descriptions, comments, and deliverables.
Graph results include node titles, Markdown, labels, and tags. The search
uses PostgreSQL and returns up to 12 results from each module.

Clients can call `GET /api/search?q=term` or the read-only MCP tool
`search_suite` with a `query` argument. See the [API reference](api.md)
and [MCP guide](mcp.md).
