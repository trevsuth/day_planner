from fastapi.testclient import TestClient

from app_planner.api import app


def test_preview_escapes_html_and_extracts_diagrams():
    response = TestClient(app).post(
        "/api/viewer/preview",
        json={
            "source": "# Hi\n\n<script>alert(1)</script>\n\n![x](https://example.com/x)\n\n```mermaid\nA --> B\n```"
        },
    )
    assert response.status_code == 200
    preview = response.json()
    assert "<h1>Hi</h1>" in preview["html"]
    assert "<script>" not in preview["html"]
    assert "<img" not in preview["html"]
    assert 'data-diagram-index="0"' in preview["html"]
    assert preview["diagrams"] == ["A --> B\n"]


def test_preview_limits_input_and_accepts_standalone_mermaid():
    client = TestClient(app)
    endpoint = "/api/viewer/preview"
    assert client.post(endpoint, json={"source": "x" * 100_001}).status_code == 422
    assert client.post(
        endpoint, json={"source": "flowchart LR\n A-->B", "mode": "mermaid"}
    ).json()["diagrams"] == ["flowchart LR\n A-->B"]


def test_openapi_includes_graph_and_viewer_contracts():
    spec = TestClient(app).get("/openapi.json").json()
    assert "/api/viewer/preview" in spec["paths"]
    graph = spec["paths"]["/api/graphs/workspace"]["put"]
    document = graph["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]["document"]
    assert document["$ref"] == "#/components/schemas/GraphDocument"
    assert "GraphDocument" in spec["components"]["schemas"]
