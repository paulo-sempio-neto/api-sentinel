"""Frontend-facing API v1 contract tests."""

from fastapi.testclient import TestClient

from app import app


def test_v1_routes_preserve_endpoint_payloads(client: TestClient) -> None:
    created = client.post(
        "/api/v1/endpoints",
        json={"name": "Frontend API", "url": "https://example.com/api"},
    )

    assert created.status_code == 201
    assert created.json() == {
        "id": created.json()["id"],
        "name": "Frontend API",
        "url": "https://example.com/api",
    }
    assert client.get("/api/v1/endpoints").json() == [created.json()]
    assert client.get("/endpoints").json() == [created.json()]


def test_v1_health_matches_the_legacy_contract(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == client.get("/health").json()


def test_openapi_exposes_versioned_typed_responses() -> None:
    schema = app.openapi()
    post_endpoint = schema["paths"]["/api/v1/endpoints"]["post"]

    assert post_endpoint["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/EndpointResponse"
    }
    assert "CheckResultResponse" in schema["components"]["schemas"]
    assert "ErrorResponse" in schema["components"]["schemas"]
