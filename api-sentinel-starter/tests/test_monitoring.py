"""Deterministic tests for the in-process automatic monitoring task."""

import logging
import threading
from collections.abc import Callable
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
import database
from app import app
from database import get_check_history, get_connection, initialize_database, save_check_result


class ControlledIntervals:
    """Allows an exact number of cycles, then waits for application shutdown."""

    def __init__(self, cycles: int) -> None:
        self.remaining = cycles
        self.cycles_finished = threading.Event()

    async def __call__(self, stop_event) -> bool:
        if self.remaining > 0:
            self.remaining -= 1
            return True
        self.cycles_finished.set()
        await stop_event.wait()
        return False


@pytest.fixture
def monitoring_client_factory(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    disable_automatic_monitoring: None,
) -> Callable[[int], tuple[TestClient, ControlledIntervals]]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "monitoring.db")
    initialize_database()

    def build(cycles: int) -> tuple[TestClient, ControlledIntervals]:
        intervals = ControlledIntervals(cycles)
        monkeypatch.setattr(app_module, "MONITORING_ENABLED", True)
        monkeypatch.setattr(app_module, "wait_for_monitoring_interval", intervals)
        return TestClient(app), intervals

    return build


def add_endpoint(name: str, url: str) -> int:
    connection = get_connection()
    try:
        cursor = connection.execute(
            "INSERT INTO endpoints (name, url) VALUES (?, ?)", (name, url)
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def delete_endpoint_record(endpoint_id: int) -> None:
    connection = get_connection()
    try:
        connection.execute("DELETE FROM endpoints WHERE id = ?", (endpoint_id,))
        connection.commit()
    finally:
        connection.close()


def wait_for_cycles(intervals: ControlledIntervals) -> None:
    assert intervals.cycles_finished.wait(timeout=2), "Monitoring cycle did not finish"


def test_monitor_task_starts_and_stops_with_lifespan(
    monitoring_client_factory,
) -> None:
    test_client, intervals = monitoring_client_factory(0)
    with test_client:
        wait_for_cycles(intervals)
        monitor_task = app.state.monitor_task
        assert monitor_task is not None
        assert monitor_task.get_name() == "api-sentinel-monitor"
        assert not monitor_task.done()

    assert monitor_task.done()
    assert not monitor_task.cancelled()
    assert app.state.monitor_task is None


def test_automatic_check_persists_history(
    monitoring_client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    endpoint_id = add_endpoint("Healthy API", "https://example.com/health")
    outbound = Mock(return_value=httpx.Response(204))
    monkeypatch.setattr(app_module.httpx, "get", outbound)
    test_client, intervals = monitoring_client_factory(1)

    with test_client:
        wait_for_cycles(intervals)
        history = get_check_history(endpoint_id)

    assert len(history) == 1
    assert history[0]["endpoint_id"] == endpoint_id
    assert history[0]["success"] is True
    assert history[0]["status_code"] == 204
    outbound.assert_called_once()


def test_network_failure_does_not_stop_other_endpoints(
    monitoring_client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    failing_id = add_endpoint("Offline API", "https://offline.example/api")
    healthy_id = add_endpoint("Healthy API", "https://healthy.example/api")

    def request(url, **kwargs):
        if "offline" in str(url):
            raise httpx.ConnectError(
                "test connection failure", request=httpx.Request("GET", url)
            )
        return httpx.Response(200)

    monkeypatch.setattr(app_module.httpx, "get", request)
    test_client, intervals = monitoring_client_factory(1)

    with test_client:
        wait_for_cycles(intervals)

    failing_history = get_check_history(failing_id)
    healthy_history = get_check_history(healthy_id)
    assert len(failing_history) == len(healthy_history) == 1
    assert failing_history[0]["success"] is False
    assert failing_history[0]["error_message"] == "Could not connect to endpoint."
    assert healthy_history[0]["success"] is True


def test_unexpected_endpoint_error_is_logged_and_loop_continues(
    monitoring_client_factory,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    first_id = add_endpoint("First API", "https://first.example/api")
    second_id = add_endpoint("Second API", "https://second.example/api")
    calls = []

    def check(endpoint_id: int) -> dict:
        calls.append(endpoint_id)
        if endpoint_id == first_id and calls.count(first_id) == 1:
            raise RuntimeError("unexpected test failure")
        return {"endpoint_id": endpoint_id}

    monkeypatch.setattr(app_module, "perform_endpoint_check", check)
    test_client, intervals = monitoring_client_factory(2)

    with caplog.at_level(logging.ERROR, logger=app_module.__name__):
        with test_client:
            wait_for_cycles(intervals)

    assert calls == [first_id, second_id, first_id, second_id]
    assert "Automatic check failed" in caplog.text
    assert "unexpected test failure" in caplog.text


def test_new_endpoint_is_loaded_in_a_later_cycle(
    monitoring_client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    first_id = add_endpoint("First API", "https://first.example/api")
    calls = []
    second_id = None

    def check(endpoint_id: int) -> dict:
        nonlocal second_id
        calls.append(endpoint_id)
        if second_id is None:
            second_id = add_endpoint("New API", "https://new.example/api")
        return {"endpoint_id": endpoint_id}

    monkeypatch.setattr(app_module, "perform_endpoint_check", check)
    test_client, intervals = monitoring_client_factory(2)

    with test_client:
        wait_for_cycles(intervals)

    assert second_id is not None
    assert calls == [first_id, first_id, second_id]


def test_deleted_endpoint_is_absent_from_later_cycles(
    monitoring_client_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    first_id = add_endpoint("First API", "https://first.example/api")
    deleted_id = add_endpoint("Deleted API", "https://deleted.example/api")
    calls = []

    def check(endpoint_id: int) -> dict:
        calls.append(endpoint_id)
        if endpoint_id == first_id and calls.count(first_id) == 1:
            delete_endpoint_record(deleted_id)
        return {"endpoint_id": endpoint_id}

    monkeypatch.setattr(app_module, "perform_endpoint_check", check)
    test_client, intervals = monitoring_client_factory(2)

    with test_client:
        wait_for_cycles(intervals)

    assert calls == [first_id, deleted_id, first_id]
    assert calls.count(deleted_id) == 1


def test_manual_route_still_uses_shared_check_function(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    expected = {
        "id": 1,
        "endpoint_id": 7,
        "checked_at": "2026-01-02T12:00:00.000000+00:00",
        "success": True,
        "status_code": 200,
        "response_time_ms": 1.0,
        "error_message": None,
    }
    check = Mock(return_value=expected)
    monkeypatch.setattr(app_module, "perform_endpoint_check", check)

    response = client.post("/endpoints/7/check")

    assert response.status_code == 200
    assert response.json() == expected
    check.assert_called_once_with(7)


def test_history_read_does_not_trigger_automatic_or_manual_check(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    response = client.post(
        "/endpoints", json={"name": "History API", "url": "https://history.example/api"}
    )
    endpoint_id = response.json()["id"]
    save_check_result(endpoint_id, True, status_code=200)
    check = Mock(side_effect=AssertionError("History reads must remain read-only"))
    monkeypatch.setattr(app_module, "perform_endpoint_check", check)

    history = client.get(f"/endpoints/{endpoint_id}/checks")

    assert history.status_code == 200
    assert len(history.json()) == 1
    check.assert_not_called()


def test_production_monitoring_interval_is_sixty_seconds() -> None:
    assert app_module.MONITOR_INTERVAL_SECONDS == 60.0
