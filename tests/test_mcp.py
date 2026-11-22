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
                "validate_document",
                "inspect_invisible_characters",
                "find_python_regex_matches",
            }
            assert all(tool.annotations.read_only_hint for tool in tools.values())
            response = await client.call_tool(
                "preview_viewer_document", {"request": {"source": "# MCP"}}
            )
            assert response.structured_content == {
                "html": "<h1>MCP</h1>\n",
                "diagrams": [],
            }

            validation = await client.call_tool(
                "validate_document",
                {"request": {"format": "json", "source": '{"name":1}', "pretty": True}},
            )
            assert validation.structured_content["formatted"] == '{\n  "name": 1\n}\n'
            characters = await client.call_tool(
                "inspect_invisible_characters",
                {"request": {"source": "a\u200b", "remove_offsets": [1]}},
            )
            assert characters.structured_content["cleaned"] == "a"
            regex = await client.call_tool(
                "find_python_regex_matches",
                {"request": {"pattern": "(?P<letter>a)", "source": "ba"}},
            )
            assert regex.structured_content["group_names"] == {"letter": 1}
            assert regex.structured_content["matches"][0]["start"] == 1

    asyncio.run(check())
