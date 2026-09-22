"""API Sentinel application composition root and compatibility adapters."""

# AI assistance: ChatGPT was used for guidance and code review.

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI

from application import create_application
from config import (
    CHECK_TIMEOUT_SECONDS,
    MONITOR_INTERVAL_SECONDS,
    MONITORING_ENABLED,
    PROJECT_DIRECTORY,
    UI_HISTORY_LIMIT,
)
from database import initialize_database
from lifecycle import managed_lifespan
from routes.api import register_api_routes
from routes.ui import register_ui_routes
from schemas import EndpointCreate
from services import checks as check_service
from services import endpoints as endpoint_service
from services import monitoring as monitoring_service

logger = logging.getLogger(__name__)

# Preserve established import and monkeypatch seams while delegating implementation.
create_endpoint = endpoint_service.create_endpoint
list_endpoints = endpoint_service.list_endpoints
update_endpoint = endpoint_service.update_endpoint
delete_endpoint = endpoint_service.delete_endpoint
get_endpoint_record = endpoint_service.get_endpoint_record
get_dashboard_endpoints = endpoint_service.get_dashboard_endpoints


def get_registered_endpoint_ids() -> list[int]:
    """Returns a fresh snapshot of endpoint IDs for one monitoring cycle."""
    return endpoint_service.get_registered_endpoint_ids()


def perform_endpoint_check(
    endpoint_id: int,
) -> dict[str, int | float | str | bool | None]:
    """Executes the service through compatibility-injected runtime dependencies."""
    return check_service.perform_endpoint_check(
        endpoint_id,
        timeout_seconds=CHECK_TIMEOUT_SECONDS,
        http_get=httpx.get,
        now=lambda: datetime.now(timezone.utc),
        timer=time.perf_counter,
    )


async def run_monitoring_cycle() -> None:
    """Runs one automatic cycle through the monitoring service."""
    await monitoring_service.run_monitoring_cycle(
        load_endpoint_ids=get_registered_endpoint_ids,
        perform_check=perform_endpoint_check,
        logger=logger,
    )


async def wait_for_monitoring_interval(stop_event: asyncio.Event) -> bool:
    """Waits for one configured monitoring interval."""
    return await monitoring_service.wait_for_monitoring_interval(
        stop_event, MONITOR_INTERVAL_SECONDS
    )


async def monitor_endpoints(stop_event: asyncio.Event) -> None:
    """Runs automatic monitoring while preserving patchable test seams."""
    await monitoring_service.monitor_endpoints(
        stop_event,
        run_cycle=run_monitoring_cycle,
        wait_for_interval=wait_for_monitoring_interval,
        logger=logger,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Owns database initialization and the monitoring task lifecycle."""
    async with managed_lifespan(
        app,
        initialize_database=initialize_database,
        monitoring_enabled=lambda: MONITORING_ENABLED,
        monitor_endpoints=monitor_endpoints,
    ):
        yield


app, templates = create_application(
    project_directory=PROJECT_DIRECTORY,
    lifespan=lifespan,
)

register_api_routes(
    app,
    create_endpoint=lambda endpoint: create_endpoint(endpoint),
    list_endpoints=lambda: list_endpoints(),
    update_endpoint=lambda endpoint_id, endpoint: update_endpoint(endpoint_id, endpoint),
    delete_endpoint=lambda endpoint_id: delete_endpoint(endpoint_id),
    get_endpoint=lambda endpoint_id: get_endpoint_record(endpoint_id),
    perform_check=lambda endpoint_id: perform_endpoint_check(endpoint_id),
    get_check_history=lambda endpoint_id, limit: endpoint_service.get_check_history(
        endpoint_id, limit
    ),
)
register_ui_routes(
    app,
    templates=templates,
    history_limit=UI_HISTORY_LIMIT,
    create_endpoint=lambda endpoint: create_endpoint(endpoint),
    update_endpoint=lambda endpoint_id, endpoint: update_endpoint(endpoint_id, endpoint),
    delete_endpoint=lambda endpoint_id: delete_endpoint(endpoint_id),
    perform_check=lambda endpoint_id: perform_endpoint_check(endpoint_id),
    get_endpoint=lambda endpoint_id: get_endpoint_record(endpoint_id),
    get_dashboard_endpoints=lambda: get_dashboard_endpoints(),
    get_check_history=lambda endpoint_id, limit: endpoint_service.get_check_history(
        endpoint_id, limit
    ),
)
