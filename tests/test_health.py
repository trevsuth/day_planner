from fastapi.testclient import TestClient

from app_planner import api


def test_health_checks_database(monkeypatch):
    called = False

    def check_schema():
        nonlocal called
        called = True

    monkeypatch.setattr(api, "check_schema", check_schema)

    response = TestClient(api.app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert called


def test_health_returns_503_when_database_is_unavailable(monkeypatch):
    def check_schema():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(api, "check_schema", check_schema)

    response = TestClient(api.app).get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database connection failed."}


def test_liveness_stays_available_when_database_is_unreachable(monkeypatch):
    def check_schema():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(api, "check_schema", check_schema)

    response = TestClient(api.app).get("/api/livez")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
