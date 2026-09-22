"""SQLite queries for endpoints and their persisted check results."""

from datetime import datetime, timezone

from database import get_connection


def create_endpoint_record(name: str, url: str) -> int:
    """Inserts an endpoint and returns its generated ID."""
    connection = get_connection()
    try:
        cursor = connection.execute(
            "INSERT INTO endpoints (name, url) VALUES (?, ?)", (name, url)
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def list_endpoint_records() -> list[dict[str, int | str]]:
    """Returns endpoints in their established ID order."""
    connection = get_connection()
    try:
        rows = connection.execute(
            "SELECT id, name, url FROM endpoints ORDER BY id"
        ).fetchall()
    finally:
        connection.close()
    return [dict(row) for row in rows]


def get_endpoint_record(endpoint_id: int) -> dict[str, int | str] | None:
    """Returns one endpoint without changing it."""
    connection = get_connection()
    try:
        row = connection.execute(
            "SELECT id, name, url FROM endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    finally:
        connection.close()
    return dict(row) if row is not None else None


def list_endpoint_ids() -> list[int]:
    """Returns a fresh snapshot of endpoint IDs for one monitoring cycle."""
    connection = get_connection()
    try:
        rows = connection.execute("SELECT id FROM endpoints ORDER BY id").fetchall()
    finally:
        connection.close()
    return [row["id"] for row in rows]


def update_endpoint_record(endpoint_id: int, name: str, url: str) -> bool:
    """Updates an endpoint and reports whether it existed."""
    connection = get_connection()
    try:
        cursor = connection.execute(
            "UPDATE endpoints SET name = ?, url = ? WHERE id = ?",
            (name, url, endpoint_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def delete_endpoint_record(endpoint_id: int) -> bool:
    """Deletes an endpoint and reports whether it existed."""
    connection = get_connection()
    try:
        cursor = connection.execute("DELETE FROM endpoints WHERE id = ?", (endpoint_id,))
        connection.commit()
        return cursor.rowcount > 0
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
    """Stores a supplied result and returns its ID; performs no HTTP request."""
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
    """Returns persisted results newest first, breaking timestamp ties by ID."""
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
