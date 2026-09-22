"""Settings and structured-log contract tests."""

import json
import logging
from pathlib import Path

import pytest

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
        }
    )

    assert settings.database_path == Path("data/api-sentinel.db")
    assert settings.check_timeout_seconds == 4.5
    assert settings.monitor_interval_seconds == 30.0
    assert settings.monitoring_enabled is False
    assert settings.ui_history_limit == 10
    assert settings.log_level == "DEBUG"


@pytest.mark.parametrize(
    "environment",
    [
        {"API_SENTINEL_CHECK_TIMEOUT_SECONDS": "0"},
        {"API_SENTINEL_MONITORING_ENABLED": "sometimes"},
        {"API_SENTINEL_LOG_LEVEL": "verbose"},
    ],
)
def test_settings_reject_invalid_environment_values(environment: dict[str, str]) -> None:
    with pytest.raises(ValueError):
        Settings.from_environment(environment)


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
