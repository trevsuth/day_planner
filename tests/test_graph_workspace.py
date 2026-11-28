from base64 import b64encode

import pytest
from fastapi.testclient import TestClient

from app_planner.api import app

WORKSPACE = "/api/graphs/workspace"


def document(title, size=3):
    return {
        "schemaVersion": 1,
        "id": "workspace",
        "title": title,
        "createdAt": "",
        "updatedAt": "",
        "relationships": [],
        "nodes": [
            {
                "id": "node",
                "title": "Notes",
                "x": 0,
                "y": 0,
                "labels": [],
                "tags": [],
                "style": {
                    "radius": 40,
                    "fill": "#000",
                    "stroke": "#fff",
                    "textColor": "#fff",
                },
                "content": {"type": "note", "markdown": "", "updatedAt": ""},
                "attachments": [
                    {
                        "id": "file",
                        "storageKey": "notes",
                        "name": "notes.txt",
                        "mimeType": "text/plain",
                        "sizeBytes": size,
                        "createdAt": "",
                    }
                ],
            }
        ],
    }


def test_saves_and_downloads_graph_files_without_overwriting_stale_revisions(temp_db):
    client = TestClient(app)
    attachment = f"{WORKSPACE}/attachments/notes"
    assert client.get(WORKSPACE).json() == {"revision": 0, "document": None}
    assert client.get(attachment).status_code == 404
    files = {"notes": b64encode(b"abc").decode()}

    created = client.put(
        WORKSPACE,
        json={"revision": 0, "document": document("Original"), "files": files},
    )
    assert created.json() == {"revision": 1}
    response = client.get(attachment)
    assert response.content == b"abc"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"

    repeated = client.put(
        WORKSPACE, json={"revision": 1, "document": document("Renamed"), "files": files}
    )
    assert repeated.json() == {"revision": 2}
    stale = client.put(
        WORKSPACE, json={"revision": 1, "document": document("Stale browser")}
    )
    assert stale.status_code == 409
    workspace = client.get(WORKSPACE).json()
    assert workspace["revision"] == 2
    assert workspace["document"]["title"] == "Renamed"


@pytest.mark.parametrize(
    ("files", "message"),
    [
        ({}, "referenced attachment is missing"),
        ({"other": "YWJj"}, "must belong to the graph"),
        ({"notes": "%%%%"}, "invalid file data"),
        ({"notes": "YQ=="}, "match their declared size"),
    ],
)
def test_invalid_graph_attachments_keep_the_original_revision(temp_db, files, message):
    client = TestClient(app)
    response = client.put(
        WORKSPACE,
        json={"revision": 0, "document": document("Rejected update"), "files": files},
    )
    assert response.status_code == 422
    assert message in response.json()["detail"]
    assert client.get(WORKSPACE).json() == {"revision": 0, "document": None}


def test_rejects_replacing_bytes_for_an_existing_attachment_key(temp_db):
    client = TestClient(app)
    previous = client.put(
        WORKSPACE,
        json={
            "revision": 0,
            "document": document("Original"),
            "files": {"notes": "YWJj"},
        },
    )
    assert previous.status_code == 200
    rejected = client.put(
        WORKSPACE,
        json={
            "revision": 1,
            "document": document("Changed"),
            "files": {"notes": "ZGVm"},
        },
    )
    assert rejected.status_code == 422
    assert "different file" in rejected.json()["detail"]
    workspace = client.get(WORKSPACE).json()
    assert workspace["revision"] == 1
    assert workspace["document"]["title"] == "Original"
    assert client.get(f"{WORKSPACE}/attachments/notes").content == b"abc"
