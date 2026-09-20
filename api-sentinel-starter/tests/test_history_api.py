"""Read-only history API tests using the existing temporary SQLite fixture."""

from datetime import datetime
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
from database import get_check_history, get_connection, save_check_result


@pytest.fixture
def endpoint_id(client: TestClient) -> int:
    response = client.post(
        "/endpoints", json={"name": "Example API", "url": "https://example.com/api"}
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture
def many_checks(endpoint_id: int) -> list[int]:
    # Seed more than the API maximum in one transaction to keep boundary tests fast.
    connection = get_connection()
    try:
        ids = []
        for _ in range(103):
            cursor = connection.execute(
                "INSERT INTO checks (endpoint_id, checked_at, success) VALUES (?, ?, ?)",
                (endpoint_id, "2026-01-02T12:00:00.000000+00:00", True),
            )
            ids.append(cursor.lastrowid)
        connection.commit()
    finally:
        connection.close()
    return list(reversed(ids))


def test_existing_endpoint_without_history(client: TestClient, endpoint_id: int) -> None:
    response = client.get(f"/endpoints/{endpoint_id}/checks")
    assert response.status_code == 200
    assert response.json() == []


def test_history_for_missing_endpoint(client: TestClient) -> None:
    response = client.get("/endpoints/999/checks")
    assert response.status_code == 404
    assert response.json() == {"detail": "Endpoint not found."}


@pytest.mark.parametrize("success", [True, False])
def test_history_result_shape(
    client: TestClient, endpoint_id: int, success: bool
) -> None:
    checked_at = datetime.fromisoformat("2026-01-02T12:00:00+00:00")
    status_code = 200 if success else None
    duration = 12.5 if success else None
    error = None if success else "Request timed out."
    check_id = save_check_result(
        endpoint_id, success, status_code=status_code, response_time_ms=duration,
        error_message=error, checked_at=checked_at,
    )
    response = client.get(f"/endpoints/{endpoint_id}/checks")
    assert response.status_code == 200
    assert response.json() == [{
        "id": check_id,
        "endpoint_id": endpoint_id,
        "checked_at": "2026-01-02T12:00:00.000000+00:00",
        "success": success,
        "status_code": status_code,
        "response_time_ms": duration,
        "error_message": error,
    }]
    assert response.json()[0]["success"] is success


def test_history_is_newest_first(client: TestClient, endpoint_id: int) -> None:
    ids = [
        save_check_result(endpoint_id, True, checked_at=datetime.fromisoformat(value))
        for value in [
            "2026-01-02T12:00:00+00:00",
            "2026-01-02T09:00:00+00:00",
            "2026-01-02T12:00:00+00:00",
        ]
    ]
    response = client.get(f"/endpoints/{endpoint_id}/checks")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [ids[2], ids[0], ids[1]]


def test_history_excludes_other_endpoints(client: TestClient, endpoint_id: int) -> None:
    response = client.post(
        "/endpoints", json={"name": "Second API", "url": "https://example.org/api"}
    )
    assert response.status_code == 201
    second_id = response.json()["id"]
    first_check = save_check_result(endpoint_id, True)
    second_check = save_check_result(second_id, False)
    for target_id, expected_id in [(endpoint_id, first_check), (second_id, second_check)]:
        response = client.get(f"/endpoints/{target_id}/checks?limit=1")
        assert response.status_code == 200
        assert [row["id"] for row in response.json()] == [expected_id]
        assert response.json()[0]["endpoint_id"] == target_id


@pytest.mark.parametrize(("limit", "expected_count"), [(None, 50), (1, 1), (10, 10), (100, 100)])
def test_history_limit_boundaries(
    client: TestClient, endpoint_id: int, many_checks: list[int],
    limit: int | None, expected_count: int,
) -> None:
    params = {} if limit is None else {"limit": limit}
    response = client.get(f"/endpoints/{endpoint_id}/checks", params=params)
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == many_checks[:expected_count]
    # The internal default remains unlimited, even above the API's maximum.
    assert len(get_check_history(endpoint_id)) == 103


@pytest.mark.parametrize("limit", ["0", "-1", "101", "abc", "1.5", ""])
def test_history_rejects_invalid_limit(
    client: TestClient, endpoint_id: int, limit: str
) -> None:
    response = client.get(f"/endpoints/{endpoint_id}/checks", params={"limit": limit})
    assert response.status_code == 422
    assert any(error["loc"] == ["query", "limit"] for error in response.json()["detail"])


def test_history_read_does_not_execute_or_create_checks(
    client: TestClient, endpoint_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    save_check_result(endpoint_id, True, status_code=200)
    before = get_check_history(endpoint_id)
    forbidden = Mock(side_effect=AssertionError("History reads must not execute checks"))
    monkeypatch.setattr(app_module, "perform_endpoint_check", forbidden)
    monkeypatch.setattr(app_module.httpx, "get", forbidden)

    for _ in range(2):
        response = client.get(f"/endpoints/{endpoint_id}/checks")
        assert response.status_code == 200
        assert response.json() == before
    forbidden.assert_not_called()
    assert get_check_history(endpoint_id) == before
    connection = get_connection()
    try:
        assert connection.execute("SELECT COUNT(*) FROM checks").fetchone()[0] == 1
    finally:
        connection.close()


def test_manual_check_is_returned_by_history(
    client: TestClient, endpoint_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    outbound = Mock(return_value=httpx.Response(204))
    monkeypatch.setattr(app_module.httpx, "get", outbound)
    checked = client.post(f"/endpoints/{endpoint_id}/check")
    assert checked.status_code == 200

    history = client.get(f"/endpoints/{endpoint_id}/checks")
    assert history.status_code == 200
    assert history.json() == [checked.json()]
    assert get_check_history(endpoint_id) == [checked.json()]
    assert outbound.call_count == 1  # Only the manual POST executes HTTP.
