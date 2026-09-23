"""Small startup and local-asset smoke checks for the finished MVP."""

import sqlite3

from fastapi.testclient import TestClient

import app as app_module


def test_health_endpoint_smoke(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"status": "ok", "service": "api-sentinel"}


def test_ready_endpoint_confirms_database_availability(client: TestClient) -> None:
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "service": "api-sentinel"}


def test_ready_endpoint_hides_database_failure_details(
    client: TestClient, monkeypatch
) -> None:
    def unavailable_database() -> None:
        raise sqlite3.OperationalError("private database path")

    monkeypatch.setattr(app_module, "check_database_connection", unavailable_database)

    response = client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "Service dependencies are unavailable."}


def test_local_stylesheet_is_served(client: TestClient) -> None:
    response = client.get("/static/styles.css")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    assert ".endpoint-card" in response.text
