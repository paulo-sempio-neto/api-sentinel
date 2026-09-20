"""Test fixtures that keep the real project database untouched."""

from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
import database
from app import app


@pytest.fixture(autouse=True)
def block_outbound_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail instead of using the real HTTPX transport in any test."""
    def blocked_request(*args, **kwargs):
        pytest.fail("Real outbound HTTP is forbidden in tests; use MockTransport.")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked_request)


@pytest.fixture(autouse=True)
def disable_automatic_monitoring(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keeps unrelated API tests deterministic; monitoring tests opt in."""
    monkeypatch.setattr(app_module, "MONITORING_ENABLED", False)


@pytest.fixture
def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    disable_automatic_monitoring: None,
) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "test.db")
    # Entering the context runs lifespan and creates this test's database.
    with TestClient(app) as test_client:
        yield test_client
