import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "api_sentinel.db"


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
    """Stores a supplied result and returns its ID; performs no HTTP request.

    checked_at must include a timezone; omitted timestamps default to now in UTC.
    SQLite raises IntegrityError for a missing endpoint or invalid constraints.
    """
    occurred_at = checked_at if checked_at is not None else datetime.now(timezone.utc)
    if occurred_at.utcoffset() is None:
        raise ValueError("checked_at must include a timezone.")
    timestamp = occurred_at.astimezone(timezone.utc).isoformat(timespec="microseconds")
    connection = get_connection()

    try:
        cursor = connection.execute(
            """
            INSERT INTO checks (
                endpoint_id, checked_at, success, status_code,
                response_time_ms, error_message
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (endpoint_id, timestamp, success, status_code, response_time_ms, error_message),
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def get_check_history(
    endpoint_id: int, limit: int | None = None
) -> list[dict[str, int | float | str | bool | None]]:
    """Returns results newest first, breaking timestamp ties by descending ID.

    Returns an empty list if the endpoint has no history or does not exist.
    Omitting limit returns all results; an explicit limit must be positive.
    """
    if limit is not None and limit < 1:
        raise ValueError("limit must be positive.")
    connection = get_connection()

    try:
        rows = connection.execute(
            """
            SELECT id, endpoint_id, checked_at, success, status_code,
                   response_time_ms, error_message
            FROM checks
            WHERE endpoint_id = ?
            ORDER BY checked_at DESC, id DESC
            LIMIT ?
            """,
            (endpoint_id, -1 if limit is None else limit),
        ).fetchall()
    finally:
        connection.close()

    return [{**dict(row), "success": bool(row["success"])} for row in rows]
