"""In-process automatic-monitoring orchestration."""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, status


async def run_monitoring_cycle(
    *,
    load_endpoint_ids: Callable[[], list[int]],
    perform_check: Callable[[int], object],
    logger: logging.Logger,
) -> None:
    """Checks a fresh endpoint snapshot without blocking the event loop."""
    endpoint_ids = await asyncio.to_thread(load_endpoint_ids)
    for endpoint_id in endpoint_ids:
        try:
            await asyncio.to_thread(perform_check, endpoint_id)
        except HTTPException as error:
            if error.status_code == status.HTTP_404_NOT_FOUND:
                logger.info(
                    "Endpoint %s was removed before its automatic check.", endpoint_id
                )
            else:
                logger.exception("Automatic check failed for endpoint %s.", endpoint_id)
        except Exception:
            logger.exception("Automatic check failed for endpoint %s.", endpoint_id)


async def wait_for_monitoring_interval(
    stop_event: asyncio.Event, interval_seconds: float
) -> bool:
    """Waits for the next cycle, returning false when shutdown was requested."""
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
    except TimeoutError:
        return True
    return False


async def monitor_endpoints(
    stop_event: asyncio.Event,
    *,
    run_cycle: Callable[[], Awaitable[None]],
    wait_for_interval: Callable[[asyncio.Event], Awaitable[bool]],
    logger: logging.Logger,
) -> None:
    """Runs isolated monitoring cycles until application shutdown."""
    try:
        while await wait_for_interval(stop_event):
            try:
                await run_cycle()
            except Exception:
                logger.exception("Automatic monitoring cycle failed.")
    except asyncio.CancelledError:
        logger.info("Automatic endpoint monitoring was cancelled.")
        raise
