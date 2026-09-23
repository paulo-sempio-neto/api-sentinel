"""Endpoint management tests with no external HTTP requests."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def endpoint(client: TestClient) -> dict:
    response = client.post(
        "/endpoints", json={"name": "Original API", "url": "https://example.com/api"}
    )
    assert response.status_code == 201
    return response.json()


def test_list_starts_empty(client: TestClient) -> None:
    response = client.get("/endpoints")
    assert response.status_code == 200
    assert response.json() == []


def test_create_endpoint(client: TestClient) -> None:
    response = client.post(
        "/endpoints", json={"name": "  Example API  ", "url": "https://example.com/api"}
    )
    assert response.status_code == 201
    created = response.json()
    assert isinstance(created["id"], int)
    assert created["name"] == "Example API"
    assert created["url"] == "https://example.com/api"
    assert client.get("/endpoints").json() == [created]


@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
@pytest.mark.parametrize("method", ["POST", "PUT"])
def test_reject_blank_name(
    client: TestClient, endpoint: dict, name: str, method: str
) -> None:
    path = "/endpoints" if method == "POST" else f"/endpoints/{endpoint['id']}"
    response = client.request(
        method, path, json={"name": name, "url": "https://example.com/other"}
    )
    assert response.status_code == 422
    assert any(error["loc"] == ["body", "name"] for error in response.json()["detail"])
    assert client.get("/endpoints").json() == [endpoint]


def test_reject_duplicate_url(client: TestClient, endpoint: dict) -> None:
    response = client.post(
        "/endpoints", json={"name": "Duplicate", "url": endpoint["url"]}
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "This URL is already registered."}
    assert client.get("/endpoints").json() == [endpoint]


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000/health",
        "http://127.0.0.1/health",
        "http://10.0.0.1/health",
        "http://172.16.0.1/health",
        "http://192.168.1.1/health",
        "http://169.254.169.254/latest/meta-data",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://internal-service/health",
    ],
)
@pytest.mark.parametrize("method", ["POST", "PUT"])
def test_reject_unsafe_monitor_urls(
    client: TestClient, endpoint: dict, url: str, method: str
) -> None:
    path = "/endpoints" if method == "POST" else f"/endpoints/{endpoint['id']}"
    response = client.request(method, path, json={"name": "Unsafe API", "url": url})

    assert response.status_code == 422
    assert any(error["loc"] == ["body", "url"] for error in response.json()["detail"])
    assert client.get("/endpoints").json() == [endpoint]


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"name": "A" * 101, "url": "https://example.com/api"}, "name"),
        ({"name": "Long URL", "url": f"https://example.com/{'a' * 2048}"}, "url"),
    ],
)
def test_reject_oversized_endpoint_fields(
    client: TestClient, payload: dict[str, str], field: str
) -> None:
    response = client.post("/endpoints", json=payload)

    assert response.status_code == 422
    assert any(error["loc"] == ["body", field] for error in response.json()["detail"])


def test_update_endpoint(client: TestClient, endpoint: dict) -> None:
    response = client.put(
        f"/endpoints/{endpoint['id']}",
        json={"name": "  Updated API  ", "url": "https://example.org/updated"},
    )
    expected = {
        "id": endpoint["id"],
        "name": "Updated API",
        "url": "https://example.org/updated",
    }
    assert response.status_code == 200
    assert response.json() == expected
    assert client.get("/endpoints").json() == [expected]


def test_update_allows_keeping_own_url(client: TestClient, endpoint: dict) -> None:
    response = client.put(
        f"/endpoints/{endpoint['id']}",
        json={"name": "Renamed API", "url": endpoint["url"]},
    )
    assert response.status_code == 200
    assert response.json() == {**endpoint, "name": "Renamed API"}
    assert client.get("/endpoints").json() == [response.json()]


def test_update_rejects_duplicate_url(client: TestClient, endpoint: dict) -> None:
    response = client.post(
        "/endpoints", json={"name": "Second API", "url": "https://example.org/api"}
    )
    assert response.status_code == 201
    second_endpoint = response.json()
    response = client.put(
        f"/endpoints/{second_endpoint['id']}",
        json={"name": "Conflicting update", "url": endpoint["url"]},
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "This URL is already registered."}
    assert client.get("/endpoints").json() == [endpoint, second_endpoint]


def test_delete_endpoint(client: TestClient, endpoint: dict) -> None:
    response = client.delete(f"/endpoints/{endpoint['id']}")
    assert response.status_code == 200
    assert response.json() == {"message": "Endpoint deleted."}
    assert client.get("/endpoints").json() == []


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_missing_endpoint_returns_404(
    client: TestClient, endpoint: dict, method: str
) -> None:
    path = f"/endpoints/{endpoint['id'] + 1}"
    # A missing ID remains 404 even if its requested URL belongs to another ID.
    if method == "PUT":
        response = client.put(path, json={"name": "Missing", "url": endpoint["url"]})
    else:
        response = client.delete(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Endpoint not found."}
    assert client.get("/endpoints").json() == [endpoint]
