"""Settings and structured-log contract tests."""

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from application import create_application
from config import Settings
from logging_config import JsonFormatter


def test_settings_read_supported_environment_values() -> None:
    settings = Settings.from_environment(
        {
            "API_SENTINEL_DATABASE_PATH": "data/api-sentinel.db",
            "API_SENTINEL_CHECK_TIMEOUT_SECONDS": "4.5",
            "API_SENTINEL_MONITOR_INTERVAL_SECONDS": "30",
            "API_SENTINEL_MONITORING_ENABLED": "false",
            "API_SENTINEL_UI_HISTORY_LIMIT": "10",
            "API_SENTINEL_LOG_LEVEL": "debug",
            "API_SENTINEL_CORS_ALLOWED_ORIGINS": (
                "https://dashboard.example.test, http://localhost:5173/"
            ),
        }
    )

    assert settings.database_path == Path("data/api-sentinel.db")
    assert settings.check_timeout_seconds == 4.5
    assert settings.monitor_interval_seconds == 30.0
    assert settings.monitoring_enabled is False
    assert settings.ui_history_limit == 10
    assert settings.log_level == "DEBUG"
    assert settings.cors_allowed_origins == (
        "https://dashboard.example.test",
        "http://localhost:5173",
    )


@pytest.mark.parametrize(
    "environment",
    [
        {"API_SENTINEL_CHECK_TIMEOUT_SECONDS": "0"},
        {"API_SENTINEL_MONITORING_ENABLED": "sometimes"},
        {"API_SENTINEL_LOG_LEVEL": "verbose"},
        {"API_SENTINEL_CORS_ALLOWED_ORIGINS": "https://dashboard.example.test/path"},
    ],
)
def test_settings_reject_invalid_environment_values(environment: dict[str, str]) -> None:
    with pytest.raises(ValueError):
        Settings.from_environment(environment)


def test_application_allows_a_configured_cors_origin() -> None:
    @asynccontextmanager
    async def no_op_lifespan(_: FastAPI):
        yield

    application, _ = create_application(
        project_directory=Path(__file__).resolve().parents[1],
        lifespan=no_op_lifespan,
        cors_allowed_origins=("https://dashboard.example.test",),
    )
    with TestClient(application) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "https://dashboard.example.test",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://dashboard.example.test"
    assert response.headers["access-control-allow-methods"] == (
        "GET, POST, PUT, DELETE, OPTIONS"
    )


def test_application_hides_unexpected_error_details() -> None:
    @asynccontextmanager
    async def no_op_lifespan(_: FastAPI):
        yield

    application, _ = create_application(
        project_directory=Path(__file__).resolve().parents[1],
        lifespan=no_op_lifespan,
    )

    @application.get("/explode")
    def explode() -> None:
        raise RuntimeError("private database path")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/explode")

    assert response.status_code == 500
    assert response.json() == {"detail": "An unexpected server error occurred."}


def test_json_formatter_includes_standard_and_contextual_fields() -> None:
    record = logging.LogRecord(
        "api-sentinel",
        logging.INFO,
        __file__,
        0,
        "Endpoint %s checked.",
        (7,),
        None,
    )
    record.event = "endpoint_checked"
    record.endpoint_id = 7

    payload = json.loads(JsonFormatter().format(record))

    assert payload["level"] == "INFO"
    assert payload["logger"] == "api-sentinel"
    assert payload["message"] == "Endpoint 7 checked."
    assert payload["event"] == "endpoint_checked"
    assert payload["endpoint_id"] == 7
    assert payload["timestamp"].endswith("+00:00")
