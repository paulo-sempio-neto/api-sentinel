"""Small startup and local-asset smoke checks for the finished MVP."""

from fastapi.testclient import TestClient


def test_health_endpoint_smoke(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"status": "ok", "service": "api-sentinel"}


def test_local_stylesheet_is_served(client: TestClient) -> None:
    response = client.get("/static/styles.css")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    assert ".endpoint-card" in response.text
