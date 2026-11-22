import json
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app_planner import api, observability, routes
from app_planner.models import PlannerEntry


def test_request_id_correlates_response_and_redacted_route_log(monkeypatch):
    log = Mock()
    monkeypatch.setattr(observability.logger, "log", log)
    monkeypatch.setattr(
        routes, "get_planner_entry", lambda day: PlannerEntry(entry_date=day)
    )

    response = TestClient(api.app).get(
        "/api/planner/entries/2031-02-05?private=sample",
        headers={"X-Request-ID": "test-request_1"},
    )

    assert response.headers["X-Request-ID"] == "test-request_1"
    entry = json.loads(log.call_args.args[1])
    assert entry["request_id"] == "test-request_1"
    assert entry["route"] == "/api/planner/entries/{entry_date}"
    assert entry["status"] == 200
    assert entry["duration_ms"] >= 0
    assert "sample" not in log.call_args.args[1]
    assert "2031-02-05" not in log.call_args.args[1]


def test_unhandled_error_keeps_request_id_without_logging_exception_text(monkeypatch):
    log = Mock()
    monkeypatch.setattr(observability.logger, "log", log)

    def broken_entry(day):
        raise RuntimeError("private details")

    monkeypatch.setattr(routes, "get_planner_entry", broken_entry)
    response = TestClient(api.app).get(
        "/api/planner/entries/2031-02-05",
        headers={"X-Request-ID": "invalid id"},
    )

    assert response.status_code == 500
    request_id = response.headers["X-Request-ID"]
    assert len(request_id) == 32
    entry = json.loads(log.call_args.args[1])
    assert entry["request_id"] == request_id
    assert entry["error_type"] == "RuntimeError"
    assert "private details" not in log.call_args.args[1]
