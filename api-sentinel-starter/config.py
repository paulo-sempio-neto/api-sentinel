"""Environment-backed configuration for the local API Sentinel application."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


ENVIRONMENT_PREFIX = "API_SENTINEL_"
PROJECT_DIRECTORY = Path(__file__).resolve().parent
VALID_LOG_LEVELS = frozenset({"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"})


def _read_positive_float(
    environment: Mapping[str, str], key: str, default: float
) -> float:
    value = environment.get(key)
    if value is None:
        return default
    try:
        parsed = float(value)
    except ValueError as error:
        raise ValueError(f"{key} must be a positive number.") from error
    if parsed <= 0:
        raise ValueError(f"{key} must be a positive number.")
    return parsed


def _read_positive_int(environment: Mapping[str, str], key: str, default: int) -> int:
    value = environment.get(key)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{key} must be a positive integer.") from error
    if parsed <= 0:
        raise ValueError(f"{key} must be a positive integer.")
    return parsed


def _read_bool(environment: Mapping[str, str], key: str, default: bool) -> bool:
    value = environment.get(key)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{key} must be a boolean value.")


def _read_allowed_origins(environment: Mapping[str, str], key: str) -> tuple[str, ...]:
    """Reads a comma-separated, explicit browser-origin allowlist."""
    value = environment.get(key)
    if value is None or not value.strip():
        return ()

    origins: list[str] = []
    for raw_origin in value.split(","):
        origin = raw_origin.strip().rstrip("/")
        parsed = urlparse(origin)
        if (
            not origin
            or parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                f"{key} must be a comma-separated list of HTTP(S) origins without paths."
            )
        if origin not in origins:
            origins.append(origin)
    return tuple(origins)


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded once from `API_SENTINEL_*` environment variables."""

    database_path: Path
    check_timeout_seconds: float
    monitor_interval_seconds: float
    monitoring_enabled: bool
    ui_history_limit: int
    log_level: str
    cors_allowed_origins: tuple[str, ...]

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str] | None = None,
        *,
        project_directory: Path = PROJECT_DIRECTORY,
    ) -> "Settings":
        """Builds validated settings without requiring an additional dependency."""
        source = os.environ if environment is None else environment
        database_value = source.get(f"{ENVIRONMENT_PREFIX}DATABASE_PATH")
        database_path = (
            Path(database_value).expanduser()
            if database_value is not None
            else project_directory / "api_sentinel.db"
        )
        log_level = source.get(f"{ENVIRONMENT_PREFIX}LOG_LEVEL", "INFO").upper()
        if log_level not in VALID_LOG_LEVELS:
            choices = ", ".join(sorted(VALID_LOG_LEVELS))
            raise ValueError(
                f"{ENVIRONMENT_PREFIX}LOG_LEVEL must be one of: {choices}."
            )
        return cls(
            database_path=database_path,
            check_timeout_seconds=_read_positive_float(
                source, f"{ENVIRONMENT_PREFIX}CHECK_TIMEOUT_SECONDS", 10.0
            ),
            monitor_interval_seconds=_read_positive_float(
                source, f"{ENVIRONMENT_PREFIX}MONITOR_INTERVAL_SECONDS", 60.0
            ),
            monitoring_enabled=_read_bool(
                source, f"{ENVIRONMENT_PREFIX}MONITORING_ENABLED", True
            ),
            ui_history_limit=_read_positive_int(
                source, f"{ENVIRONMENT_PREFIX}UI_HISTORY_LIMIT", 25
            ),
            log_level=log_level,
            cors_allowed_origins=_read_allowed_origins(
                source, f"{ENVIRONMENT_PREFIX}CORS_ALLOWED_ORIGINS"
            ),
        )


SETTINGS = Settings.from_environment()

# Stable module-level aliases keep the existing application seams intact.
CHECK_TIMEOUT_SECONDS = SETTINGS.check_timeout_seconds
MONITOR_INTERVAL_SECONDS = SETTINGS.monitor_interval_seconds
MONITORING_ENABLED = SETTINGS.monitoring_enabled
UI_HISTORY_LIMIT = SETTINGS.ui_history_limit
