# Day Planner MCP

The MCP server uses the same PostgreSQL and application services as the web
suite. Use `DATABASE_URL` to select the database. The server expects the
schema from the matching Day Planner release. Run `just db-migrate` first
for a fresh workstation database.

## Local clients

Register this stdio command with an MCP-capable client. Replace the path
with the checkout's absolute path. Supply `DATABASE_URL` via the client's
environment if the default local Compose database is unsuitable.

```json
{
  "mcpServers": {
    "day-planner": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/day_planner", "run", "--locked", "--no-default-groups", "-m", "app_planner.mcp_server"]
    }
  }
}
```

| Tool | What it does |
| --- | --- |
| `get_planner_day` | Reads one day's priorities, links, tasks, schedule, and notes. |
| `list_projects` | Lists projects. |
| `get_project_cards` | Reads the cards in one project. |
| `search_graph_nodes` | Finds node IDs and titles using text, labels, and tags. |
| `get_graph_node` | Reads one node and its attachment metadata. |
| `get_graph_connections` | Reads a node's incoming and outgoing relationships. |
| `preview_viewer_document` | Renders Markdown HTML and extracts Mermaid source in memory. |

To opt into writes, set `DAY_PLANNER_MCP_WRITES=1` in the MCP process
environment. It adds `create_project_card` and `assign_card_to_planner`.
Assignment can move a card's existing priority link. Use the client's
tool approval controls for writes.

## HTTP clients and ChatGPT

Run the same tool server over Streamable HTTP on loopback:

```bash
uv run --locked --no-default-groups -m app_planner.mcp_server --http-port 8765
```

The endpoint is `http://127.0.0.1:8765/mcp`. The HTTP listener is local and
trusts processes on that machine. Day Planner's Kubernetes Ingress does
not route MCP. For a ChatGPT workspace with Secure MCP Tunnel support,
connect the tunnel client to this listener and select the tunnel when
adding the custom MCP server. Use a dedicated trusted host for the tunnel
and start with the read-only tools. See the current connection options in
[OpenAI's Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
and [ChatGPT custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server).
A publicly reachable connector would need its own HTTPS and OAuth access
boundary for personal data.

## Graph and Viewer REST APIs

Open the suite's API Reference or `/docs` for the Graph workspace and
attachment operations and the Viewer preview endpoint. Graph saves require
the current revision and return HTTP 409 when another save has superseded
it.

```bash
curl -fsS http://127.0.0.1:8000/api/viewer/preview \
  -H 'Content-Type: application/json' \
  -d '{"source":"# Preview\n\n```mermaid\nflowchart LR\nA-->B\n```"}'
```

The preview returns HTML and an ordered `diagrams` array. Each diagram
placeholder in the HTML uses its zero-based `data-diagram-index`. Set
`"mode":"mermaid"` for standalone Mermaid source. Source is processed in
memory, raw HTML is escaped, and images are excluded. Clients that want
diagram graphics render the returned Mermaid source. The normal Viewer UI
continues to preview documents in the browser.
