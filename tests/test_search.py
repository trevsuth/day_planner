from fastapi.testclient import TestClient

from app_planner.api import app


def test_search_and_card_runbook_link(temp_db):
    client = TestClient(app)
    title = "Rotor audit 100%"
    date = "2026-11-24"
    assert (
        client.put(
            f"/api/planner/entries/{date}",
            json={
                "entry_date": date,
                "notes": title,
            },
        ).status_code
        == 200
    )
    project = client.post("/api/projmgmt/projects", json={"name": "Lab"}).json()
    card = client.post(
        "/api/projmgmt/cards",
        json={
            "title": title,
            "project_id": project["id"],
            "card_type": "epic",
            "graph_node_id": "rotor",
        },
    )
    assert card.status_code == 200
    assert card.json()["graph_node_id"] == "rotor"
    url = f"/api/projmgmt/cards/{card.json()['id']}"
    assert (
        client.put(url, json={"title": title, "card_type": "epic"}).json()[
            "graph_node_id"
        ]
        == "rotor"
    )

    response = client.put(
        "/api/graphs/workspace",
        json={
            "revision": 0,
            "document": {
                "schemaVersion": 1,
                "id": "wiki",
                "title": "Lab",
                "createdAt": "",
                "updatedAt": "",
                "relationships": [],
                "nodes": [
                    {
                        "id": "rotor",
                        "title": "Runbook",
                        "x": 0,
                        "y": 0,
                        "labels": [],
                        "tags": [],
                        "attachments": [],
                        "content": {"type": "note", "markdown": title, "updatedAt": ""},
                        "style": {
                            "radius": 40,
                            "fill": "#000",
                            "stroke": "#fff",
                            "textColor": "#fff",
                        },
                    }
                ],
            },
        },
    )
    assert response.status_code == 200
    search = client.get("/api/search", params={"q": "AUDIT 100%"})
    assert search.status_code == 200
    results = {hit["module"]: hit for hit in search.json()}
    assert results["planner"]["id"] == date
    assert results["projects"]["id"] == card.json()["id"]
    assert results["graph"]["id"] == "rotor"
    assert client.get("/api/search", params={"q": "100_"}).json() == []
    assert (
        client.put(
            url,
            json={
                "title": title,
                "card_type": "epic",
                "graph_node_id": None,
            },
        ).json()["graph_node_id"]
        is None
    )
