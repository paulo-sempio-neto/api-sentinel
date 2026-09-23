"""Manual checks using real HTTPX request handling with an in-memory transport."""

from datetime import datetime, timezone
from itertools import count
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
from database import get_check_history, get_connection


@pytest.fixture
def endpoint_id(client: TestClient) -> int:
    response = client.post(
        "/endpoints", json={"name": "Example API", "url": "https://example.com/api"}
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture(autouse=True)
def deterministic_timer(monkeypatch: pytest.MonkeyPatch) -> None:
    ticks = count(start=10.0, step=0.125)
    # Replace only this module's timer, not the global time module used by libraries.
    monkeypatch.setattr(
        app_module, "time", SimpleNamespace(perf_counter=lambda: next(ticks))
    )


@pytest.fixture
def mock_http(monkeypatch: pytest.MonkeyPatch):
    def install(handler):
        requests = []

        def record_request(request):
            requests.append(request)
            return handler(request)

        def mock_get(url, *, timeout, follow_redirects, trust_env):
            assert trust_env is False
            with httpx.Client(
                transport=httpx.MockTransport(record_request),
                timeout=timeout,
                follow_redirects=follow_redirects,
                trust_env=trust_env,
            ) as outbound_client:
                return outbound_client.get(url)

        monkeypatch.setattr(app_module.httpx, "get", mock_get)
        return requests

    return install


@pytest.mark.parametrize(
    ("status_code", "expected_success"),
    [(200, True), (204, True), (299, True), (300, False),
     (302, False), (404, False), (500, False)],
)
def test_http_response_is_checked_and_persisted(
    client: TestClient, endpoint_id: int, mock_http, status_code: int, expected_success: bool
) -> None:
    requests = mock_http(
        lambda request: httpx.Response(
            status_code, headers={"Location": "https://example.org/redirected"}
        )
    )
    response = client.post(f"/endpoints/{endpoint_id}/check")

    assert response.status_code == 200
    result = response.json()
    assert result["endpoint_id"] == endpoint_id
    assert result["success"] is expected_success
    assert result["status_code"] == status_code
    assert result["response_time_ms"] == pytest.approx(125.0)
    assert result["response_time_ms"] >= 0
    assert result["error_message"] is None
    assert datetime.fromisoformat(result["checked_at"]).tzinfo == timezone.utc
    assert get_check_history(endpoint_id) == [result]
    assert len(requests) == 1  # Includes redirects: no second request is followed.
    assert requests[0].method == "GET"
    assert str(requests[0].url) == "https://example.com/api"
    assert requests[0].extensions["timeout"] == {
        name: app_module.CHECK_TIMEOUT_SECONDS
        for name in ("connect", "read", "write", "pool")
    }
    assert app_module.CHECK_TIMEOUT_SECONDS > 0


@pytest.mark.parametrize(
    ("exception_type", "expected_message"),
    [
        (httpx.ReadTimeout, "Request timed out."),
        (httpx.ConnectTimeout, "Request timed out."),
        (httpx.ConnectError, "Could not connect to endpoint."),
        (httpx.ReadError, "HTTP request failed."),
        (httpx.RemoteProtocolError, "HTTP request failed."),
    ],
)
def test_request_failure_is_a_persisted_result(
    client: TestClient, endpoint_id: int, mock_http, exception_type, expected_message: str
) -> None:
    def fail_request(request):
        raise exception_type("Sensitive low-level diagnostic information", request=request)

    requests = mock_http(fail_request)
    response = client.post(f"/endpoints/{endpoint_id}/check")

    assert response.status_code == 200
    result = response.json()
    assert result["success"] is False
    assert result["status_code"] is None
    assert result["response_time_ms"] == pytest.approx(125.0)
    assert result["error_message"] == expected_message
    assert "Sensitive" not in response.text
    assert get_check_history(endpoint_id) == [result]
    assert len(requests) == 1  # Failed requests are never retried.


def test_missing_endpoint_does_not_request_or_save(
    client: TestClient, mock_http
) -> None:
    def unexpected_request(request):
        pytest.fail("A missing endpoint must not cause an HTTP request")

    requests = mock_http(unexpected_request)
    response = client.post("/endpoints/999/check")
    assert response.status_code == 404
    assert response.json() == {"detail": "Endpoint not found."}
    assert requests == []
    connection = get_connection()
    try:
        assert connection.execute("SELECT COUNT(*) FROM checks").fetchone()[0] == 0
    finally:
        connection.close()


def test_unsafe_stored_endpoint_does_not_request_but_is_persisted(
    client: TestClient, mock_http
) -> None:
    connection = get_connection()
    try:
        cursor = connection.execute(
            "INSERT INTO endpoints (name, url) VALUES (?, ?)",
            ("Unsafe API", "http://127.0.0.1/internal"),
        )
        connection.commit()
        endpoint_id = cursor.lastrowid
    finally:
        connection.close()

    def unexpected_request(request):
        pytest.fail("Unsafe endpoints must not cause an HTTP request")

    requests = mock_http(unexpected_request)
    response = client.post(f"/endpoints/{endpoint_id}/check")

    assert response.status_code == 200
    result = response.json()
    assert result["success"] is False
    assert result["status_code"] is None
    assert result["error_message"] == "Endpoint URL is not allowed."
    assert requests == []
    assert get_check_history(endpoint_id) == [result]


def test_each_manual_call_adds_exactly_one_result(
    client: TestClient, endpoint_id: int, mock_http
) -> None:
    requests = mock_http(lambda request: httpx.Response(200))
    results = []
    for expected_count in (1, 2):
        response = client.post(f"/endpoints/{endpoint_id}/check")
        assert response.status_code == 200
        results.append(response.json())
        assert len(get_check_history(endpoint_id)) == expected_count
        assert len(requests) == expected_count
    assert results[0]["id"] != results[1]["id"]
    assert sorted(get_check_history(endpoint_id), key=lambda row: row["id"]) == results


def test_application_function_uses_updated_endpoint_url(
    client: TestClient, endpoint_id: int, mock_http
) -> None:
    requests = mock_http(lambda request: httpx.Response(204))
    response = client.put(
        f"/endpoints/{endpoint_id}",
        json={"name": "Updated API", "url": "https://example.org/current"},
    )
    assert response.status_code == 200
    result = app_module.perform_endpoint_check(endpoint_id)
    assert result["success"] is True
    assert get_check_history(endpoint_id) == [result]
    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert str(requests[0].url) == "https://example.org/current"
