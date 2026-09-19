"""Test fixtures that keep the real project database untouched."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import database
from app import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "test.db")
    # Entering the context runs lifespan and creates this test's database.
    with TestClient(app) as test_client:
        yield test_client
