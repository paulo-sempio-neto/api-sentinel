"""HTTP endpoint-check execution and result classification."""

from collections.abc import Callable
from datetime import datetime

import httpx
from fastapi import HTTPException, status

import repositories


CheckResult = dict[str, int | float | str | bool | None]


def perform_endpoint_check(
    endpoint_id: int,
    *,
    timeout_seconds: float,
    http_get: Callable[..., httpx.Response],
    now: Callable[[], datetime],
    timer: Callable[[], float],
) -> CheckResult:
    """Executes one GET request and persists its result before returning it."""
    endpoint = repositories.get_endpoint_record(endpoint_id)
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )

    checked_at = now()
    status_code = None
    error_message = None
    started_at = timer()
    try:
        response = http_get(
            endpoint["url"],
            timeout=timeout_seconds,
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
    response_time_ms = (timer() - started_at) * 1000
    success = status_code is not None and 200 <= status_code < 300

    check_id = repositories.save_check_result(
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
