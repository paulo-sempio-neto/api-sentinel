"""API Sentinel: an HTTP endpoint monitoring project."""

# AI assistance: ChatGPT was used for guidance and code review.

import asyncio
import logging
import sqlite3
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Query, status
from pydantic import BaseModel, HttpUrl, StringConstraints

from database import (
    get_check_history,
    get_connection,
    initialize_database,
    save_check_result,
)

CHECK_TIMEOUT_SECONDS = 10.0
MONITOR_INTERVAL_SECONDS = 60.0
MONITORING_ENABLED = True

logger = logging.getLogger(__name__)


def get_registered_endpoint_ids() -> list[int]:
    """Returns a fresh snapshot of endpoint IDs for one monitoring cycle."""
    connection = get_connection()
    try:
        rows = connection.execute("SELECT id FROM endpoints ORDER BY id").fetchall()
    finally:
        connection.close()
    return [row["id"] for row in rows]


async def run_monitoring_cycle() -> None:
    """Checks the endpoints in one fresh database snapshot without blocking asyncio."""
    endpoint_ids = await asyncio.to_thread(get_registered_endpoint_ids)
    for endpoint_id in endpoint_ids:
        try:
            await asyncio.to_thread(perform_endpoint_check, endpoint_id)
        except HTTPException as error:
            if error.status_code == status.HTTP_404_NOT_FOUND:
                logger.info(
                    "Endpoint %s was removed before its automatic check.", endpoint_id
                )
            else:
                logger.exception("Automatic check failed for endpoint %s.", endpoint_id)
        except Exception:
            logger.exception("Automatic check failed for endpoint %s.", endpoint_id)


async def wait_for_monitoring_interval(stop_event: asyncio.Event) -> bool:
    """Waits for the next cycle, returning false when shutdown was requested."""
    try:
        await asyncio.wait_for(
            stop_event.wait(), timeout=MONITOR_INTERVAL_SECONDS
        )
    except TimeoutError:
        return True
    return False


async def monitor_endpoints(stop_event: asyncio.Event) -> None:
    """Runs isolated monitoring cycles until application shutdown."""
    try:
        while await wait_for_monitoring_interval(stop_event):
            try:
                await run_monitoring_cycle()
            except Exception:
                logger.exception("Automatic monitoring cycle failed.")
    except asyncio.CancelledError:
        logger.info("Automatic endpoint monitoring was cancelled.")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initializes persistence and owns the in-process monitoring task."""
    initialize_database()
    monitor_task = None
    stop_event = None
    if MONITORING_ENABLED:
        stop_event = asyncio.Event()
        monitor_task = asyncio.create_task(
            monitor_endpoints(stop_event), name="api-sentinel-monitor"
        )
    app.state.monitor_task = monitor_task

    try:
        yield
    finally:
        if monitor_task is not None and stop_event is not None:
            stop_event.set()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
        app.state.monitor_task = None


app = FastAPI(
    title="API Sentinel",
    description="A service for monitoring HTTP endpoints.",
    version="0.1.0",
    lifespan=lifespan,
)


class EndpointCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    url: HttpUrl


@app.get("/health")
def health() -> dict[str, str]:
    """Confirms that the API Sentinel service is running."""
    return {"status": "ok", "service": "api-sentinel"}


@app.get("/about")
def about() -> dict[str, str]:
    """Returns basic information about the project."""
    return {
        "project": "API Sentinel",
        "purpose": "Monitor HTTP endpoints",
        "stage": "CS50 final project",
    }


@app.post("/endpoints", status_code=status.HTTP_201_CREATED)
def create_endpoint(endpoint: EndpointCreate) -> dict[str, int | str]:
    """Saves an HTTP endpoint to be monitored."""
    connection = get_connection()

    try:
        cursor = connection.execute(
            "INSERT INTO endpoints (name, url) VALUES (?, ?)",
            (endpoint.name, str(endpoint.url)),
        )
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This URL is already registered.",
        ) from error
    finally:
        connection.close()

    return {
        "id": cursor.lastrowid,
        "name": endpoint.name,
        "url": str(endpoint.url),
    }


@app.get("/endpoints")
def list_endpoints() -> list[dict[str, int | str]]:
    """Lists all registered endpoints."""
    connection = get_connection()

    try:
        rows = connection.execute(
            "SELECT id, name, url FROM endpoints ORDER BY id"
        ).fetchall()
    finally:
        connection.close()

    return [dict(row) for row in rows]


@app.put("/endpoints/{endpoint_id}")
def update_endpoint(
    endpoint_id: int, endpoint: EndpointCreate
) -> dict[str, int | str]:
    """Updates the name and URL of a registered endpoint."""
    connection = get_connection()

    try:
        cursor = connection.execute(
            "UPDATE endpoints SET name = ?, url = ? WHERE id = ?",
            (endpoint.name, str(endpoint.url), endpoint_id),
        )
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This URL is already registered.",
        ) from error
    finally:
        connection.close()

    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )

    return {
        "id": endpoint_id,
        "name": endpoint.name,
        "url": str(endpoint.url),
    }


def perform_endpoint_check(endpoint_id: int) -> dict[str, int | float | str | bool | None]:
    """Executes one GET request and persists its result before returning it."""
    connection = get_connection()
    try:
        endpoint = connection.execute(
            "SELECT id, url FROM endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    finally:
        connection.close()

    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )

    checked_at = datetime.now(timezone.utc)
    status_code = None
    error_message = None
    started_at = time.perf_counter()
    try:
        response = httpx.get(
            endpoint["url"],
            timeout=CHECK_TIMEOUT_SECONDS,
            follow_redirects=False,
            trust_env=False,
        )
        status_code = response.status_code
    except httpx.TimeoutException:
        error_message = "Request timed out."
    except httpx.ConnectError:
        error_message = "Could not connect to endpoint."
    except httpx.RequestError:
        error_message = "HTTP request failed."
    response_time_ms = (time.perf_counter() - started_at) * 1000
    success = status_code is not None and 200 <= status_code < 300

    check_id = save_check_result(
        endpoint_id,
        success,
        status_code=status_code,
        response_time_ms=response_time_ms,
        error_message=error_message,
        checked_at=checked_at,
    )
    return {
        "id": check_id,
        "endpoint_id": endpoint_id,
        "checked_at": checked_at.isoformat(timespec="microseconds"),
        "success": success,
        "status_code": status_code,
        "response_time_ms": response_time_ms,
        "error_message": error_message,
    }


@app.post("/endpoints/{endpoint_id}/check")
def check_endpoint(endpoint_id: int) -> dict[str, int | float | str | bool | None]:
    """Returns a stored check result, including failures of the monitored service."""
    return perform_endpoint_check(endpoint_id)


@app.get("/endpoints/{endpoint_id}/checks")
def list_endpoint_checks(
    endpoint_id: int,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[dict[str, int | float | str | bool | None]]:
    """Reads persisted check history without executing a new check."""
    connection = get_connection()
    try:
        endpoint = connection.execute(
            "SELECT id FROM endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    finally:
        connection.close()

    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )

    return get_check_history(endpoint_id, limit=limit)


@app.delete("/endpoints/{endpoint_id}")
def delete_endpoint(endpoint_id: int) -> dict[str, str]:
    """Deletes one registered endpoint."""
    connection = get_connection()

    try:
        cursor = connection.execute(
            "DELETE FROM endpoints WHERE id = ?",
            (endpoint_id,),
        )
        connection.commit()
    finally:
        connection.close()

    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )

    return {"message": "Endpoint deleted."}
