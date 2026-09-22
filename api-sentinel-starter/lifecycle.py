"""FastAPI lifespan support for persistence and automatic monitoring."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def managed_lifespan(
    app: FastAPI,
    *,
    initialize_database: Callable[[], None],
    monitoring_enabled: Callable[[], bool],
    monitor_endpoints: Callable[[asyncio.Event], Awaitable[None]],
    logger: logging.Logger,
) -> AsyncIterator[None]:
    """Initializes persistence and owns the in-process monitoring task."""
    initialize_database()
    monitor_task = None
    stop_event = None
    if monitoring_enabled():
        stop_event = asyncio.Event()
        monitor_task = asyncio.create_task(
            monitor_endpoints(stop_event), name="api-sentinel-monitor"
        )
    app.state.monitor_task = monitor_task
    logger.info(
        "API Sentinel application started.",
        extra={
            "event": "application_started",
            "monitoring_enabled": monitor_task is not None,
        },
    )

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
        logger.info("API Sentinel application stopped.", extra={"event": "application_stopped"})
