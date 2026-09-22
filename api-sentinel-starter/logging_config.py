"""Structured logging configuration for API Sentinel application events."""

import json
import logging
from datetime import datetime, timezone
from typing import Any


STANDARD_LOG_RECORD_FIELDS = frozenset(logging.makeLogRecord({}).__dict__)


class JsonFormatter(logging.Formatter):
    """Formats application records as line-delimited JSON for log collectors."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in STANDARD_LOG_RECORD_FIELDS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_application_logging(logger_name: str, log_level: str) -> logging.Logger:
    """Configures one idempotent JSON handler while retaining test log capture."""
    logger = logging.getLogger(logger_name)
    logger.setLevel(log_level)
    logger.propagate = True
    if not any(getattr(handler, "_api_sentinel_structured", False) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        handler._api_sentinel_structured = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    return logger
