"""Persistence tests with supplied results, not real HTTP checks."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import database
from app import app
from database import get_check_history, initialize_database, save_check_result


@pytest.fixture
def endpoint_id(client: TestClient) -> int:
    response = client.post(
        "/endpoints", json={"name": "Example API", "url": "https://example.com/api"}
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_save_and_retrieve_successful_check(endpoint_id: int) -> None:
    before = datetime.now(timezone.utc)
    check_id = save_check_result(
        endpoint_id, True, status_code=200, response_time_ms=123.45
    )
    after = datetime.now(timezone.utc)

    history = get_check_history(endpoint_id)
    assert len(history) == 1
    result = history[0]
    assert result == {
        "id": check_id,
        "endpoint_id": endpoint_id,
        "checked_at": result["checked_at"],
        "success": True,
        "status_code": 200,
        "response_time_ms": 123.45,
        "error_message": None,
    }
    assert result["success"] is True
    assert before <= datetime.fromisoformat(result["checked_at"]) <= after
    assert result["checked_at"].endswith("+00:00")


def test_save_network_error_with_nullable_fields(endpoint_id: int) -> None:
    check_id = save_check_result(endpoint_id, False, error_message="Connection timed out")

    result = get_check_history(endpoint_id)[0]
    assert result["id"] == check_id
    assert result["success"] is False
    assert result["status_code"] is None
    assert result["response_time_ms"] is None
    assert result["error_message"] == "Connection timed out"


def test_history_orders_by_occurrence_then_id(endpoint_id: int) -> None:
    # Insert out of time order, including another timezone and an exact time tie.
    timestamps = [
        "2026-01-02T12:00:00+00:00",
        "2026-01-02T09:00:00+00:00",
        "2026-01-02T08:00:00-03:00",
        "2026-01-02T12:00:00+00:00",
    ]
    check_ids = [
        save_check_result(endpoint_id, True, checked_at=datetime.fromisoformat(value))
        for value in timestamps
    ]

    history = get_check_history(endpoint_id)
    assert len(set(check_ids)) == 4
    assert [result["id"] for result in history] == [
        check_ids[3], check_ids[0], check_ids[2], check_ids[1]
    ]
    assert history[2]["checked_at"] == "2026-01-02T11:00:00.000000+00:00"


def test_histories_are_isolated(client: TestClient, endpoint_id: int) -> None:
    response = client.post(
        "/endpoints", json={"name": "Second API", "url": "https://example.org/api"}
    )
    assert response.status_code == 201
    second_id = response.json()["id"]
    first_check = save_check_result(endpoint_id, True, status_code=200)
    second_check = save_check_result(second_id, False, status_code=503)

    assert [row["id"] for row in get_check_history(endpoint_id)] == [first_check]
    assert [row["id"] for row in get_check_history(second_id)] == [second_check]


def test_missing_endpoint_is_rejected(endpoint_id: int) -> None:
    with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY constraint failed"):
        save_check_result(endpoint_id + 1, True, status_code=200)
    assert get_check_history(endpoint_id + 1) == []
    assert get_check_history(endpoint_id) == []
    # A rejected insert must not leave a lock or prevent later writes.
    check_id = save_check_result(endpoint_id, True, status_code=200)
    assert get_check_history(endpoint_id)[0]["id"] == check_id


def test_empty_history(endpoint_id: int) -> None:
    assert get_check_history(endpoint_id) == []
    assert get_check_history(endpoint_id + 1) == []


def test_delete_cascades_only_its_own_history(client: TestClient, endpoint_id: int) -> None:
    response = client.post(
        "/endpoints", json={"name": "Second API", "url": "https://example.org/api"}
    )
    assert response.status_code == 201
    second_id = response.json()["id"]
    save_check_result(endpoint_id, True, status_code=200)
    second_check = save_check_result(second_id, True, status_code=204)

    response = client.delete(f"/endpoints/{endpoint_id}")
    assert response.status_code == 200
    assert response.json() == {"message": "Endpoint deleted."}
    assert get_check_history(endpoint_id) == []
    assert [row["id"] for row in get_check_history(second_id)] == [second_check]
    with pytest.raises(sqlite3.IntegrityError):
        save_check_result(endpoint_id, False)


def test_update_and_reinitialization_preserve_history(
    client: TestClient, endpoint_id: int
) -> None:
    save_check_result(endpoint_id, True, status_code=200)
    original_history = get_check_history(endpoint_id)
    response = client.put(
        f"/endpoints/{endpoint_id}",
        json={"name": "Updated API", "url": "https://example.org/updated"},
    )
    assert response.status_code == 200
    initialize_database()
    initialize_database()
    assert get_check_history(endpoint_id) == original_history
    assert client.get("/endpoints").json() == [response.json()]


def test_startup_extends_existing_database(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing_path = tmp_path / "existing.db"
    monkeypatch.setattr(database, "DATABASE_PATH", existing_path)
    # Reproduce the Stage 2 schema with an existing endpoint, before startup.
    connection = sqlite3.connect(existing_path)
    try:
        connection.execute(
            """
            CREATE TABLE endpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            "INSERT INTO endpoints (name, url) VALUES (?, ?)",
            ("Existing API", "https://example.com/api"),
        )
        connection.commit()
    finally:
        connection.close()

    with TestClient(app) as client:
        existing = client.get("/endpoints").json()
        assert existing == [{"id": 1, "name": "Existing API", "url": "https://example.com/api"}]
        check_id = save_check_result(1, True, status_code=200)
    # A fresh startup can still retrieve the previously committed result.
    with TestClient(app) as client:
        assert client.get("/endpoints").json() == existing
        assert get_check_history(1)[0]["id"] == check_id


def test_reject_timestamp_without_timezone(endpoint_id: int) -> None:
    with pytest.raises(ValueError, match="checked_at must include a timezone"):
        save_check_result(endpoint_id, True, checked_at=datetime(2026, 1, 2))
    assert get_check_history(endpoint_id) == []


def test_reject_negative_response_time(endpoint_id: int) -> None:
    with pytest.raises(sqlite3.IntegrityError, match="CHECK constraint failed"):
        save_check_result(endpoint_id, True, response_time_ms=-1)
    assert get_check_history(endpoint_id) == []
