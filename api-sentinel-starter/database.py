import sqlite3
from datetime import datetime

from config import SETTINGS

DATABASE_PATH = SETTINGS.database_path


def get_connection() -> sqlite3.Connection:
    """Opens a connection to the SQLite database."""
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    """Creates the database tables and history index if they do not exist."""
    connection = get_connection()

    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS endpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id INTEGER NOT NULL,
                checked_at TEXT NOT NULL,
                success INTEGER NOT NULL CHECK (success IN (0, 1)),
                status_code INTEGER,
                response_time_ms REAL CHECK (response_time_ms >= 0),
                error_message TEXT,
                FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_checks_endpoint_checked_at
            ON checks (endpoint_id, checked_at DESC, id DESC)
            """
        )
        connection.commit()
    finally:
        connection.close()


def save_check_result(
    endpoint_id: int,
    success: bool,
    *,
    status_code: int | None = None,
    response_time_ms: float | None = None,
    error_message: str | None = None,
    checked_at: datetime | None = None,
) -> int:
    """Compatibility wrapper for the check-result repository."""
    from repositories import save_check_result as save_result

    return save_result(
        endpoint_id,
        success,
        status_code=status_code,
        response_time_ms=response_time_ms,
        error_message=error_message,
        checked_at=checked_at,
    )


def get_check_history(
    endpoint_id: int, limit: int | None = None
) -> list[dict[str, int | float | str | bool | None]]:
    """Compatibility wrapper for the check-history repository."""
    from repositories import get_check_history as load_history

    return load_history(endpoint_id, limit)
