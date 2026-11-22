import asyncio

from mcp import Client

from app_planner.mcp_server import server


def test_mcp_discovers_all_domains_and_previews_documents():
    async def check():
        async with Client(server) as client:
            tools = {tool.name: tool for tool in (await client.list_tools()).tools}
            assert set(tools) == {
                "get_planner_day",
                "list_projects",
                "get_project_cards",
                "search_graph_nodes",
                "get_graph_node",
                "get_graph_connections",
                "preview_viewer_document",
            }
            assert all(tool.annotations.read_only_hint for tool in tools.values())
            response = await client.call_tool(
                "preview_viewer_document", {"request": {"source": "# MCP"}}
            )
            assert response.structured_content == {
                "html": "<h1>MCP</h1>\n",
                "diagrams": [],
            }

    asyncio.run(check())
