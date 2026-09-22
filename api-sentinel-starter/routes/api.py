"""Versioned JSON API route registration."""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, FastAPI, HTTPException, Query, status

from schemas import (
    AboutResponse,
    CheckResultResponse,
    DeleteEndpointResponse,
    EndpointCreate,
    EndpointResponse,
    ErrorResponse,
    HealthResponse,
)

CheckHistory = list[dict[str, int | float | str | bool | None]]
EndpointRecord = dict[str, int | str]


def build_api_router(
    *,
    name_prefix: str,
    create_endpoint: Callable[[EndpointCreate], EndpointRecord],
    list_endpoints: Callable[[], list[EndpointRecord]],
    update_endpoint: Callable[[int, EndpointCreate], EndpointRecord],
    delete_endpoint: Callable[[int], dict[str, str]],
    get_endpoint: Callable[[int], EndpointRecord | None],
    perform_check: Callable[[int], dict[str, int | float | str | bool | None]],
    get_check_history: Callable[[int, int], CheckHistory],
) -> APIRouter:
    """Builds one API contract; the same handlers back legacy and v1 routes."""
    router = APIRouter()
    route_name = lambda name: f"{name_prefix}{name}"
    errors = {
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
        status.HTTP_409_CONFLICT: {"model": ErrorResponse},
    }

    @router.get("/health", response_model=HealthResponse, name=route_name("health"))
    def health() -> HealthResponse:
        return HealthResponse(status="ok", service="api-sentinel")

    @router.get("/about", response_model=AboutResponse, name=route_name("about"))
    def about() -> AboutResponse:
        return AboutResponse(
            project="API Sentinel",
            purpose="Monitor HTTP endpoints",
            stage="CS50 final project",
        )

    @router.post(
        "/endpoints",
        status_code=status.HTTP_201_CREATED,
        response_model=EndpointResponse,
        responses={status.HTTP_409_CONFLICT: {"model": ErrorResponse}},
        name=route_name("create_endpoint"),
    )
    def create_endpoint_route(endpoint: EndpointCreate) -> EndpointRecord:
        return create_endpoint(endpoint)

    @router.get(
        "/endpoints", response_model=list[EndpointResponse], name=route_name("list_endpoints")
    )
    def list_endpoints_route() -> list[EndpointRecord]:
        return list_endpoints()

    @router.put(
        "/endpoints/{endpoint_id}",
        response_model=EndpointResponse,
        responses=errors,
        name=route_name("update_endpoint"),
    )
    def update_endpoint_route(endpoint_id: int, endpoint: EndpointCreate) -> EndpointRecord:
        return update_endpoint(endpoint_id, endpoint)

    @router.post(
        "/endpoints/{endpoint_id}/check",
        response_model=CheckResultResponse,
        responses={status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}},
        name=route_name("check_endpoint"),
    )
    def check_endpoint_route(endpoint_id: int) -> dict[str, int | float | str | bool | None]:
        return perform_check(endpoint_id)

    @router.get(
        "/endpoints/{endpoint_id}/checks",
        response_model=list[CheckResultResponse],
        responses={status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}},
        name=route_name("list_endpoint_checks"),
    )
    def list_endpoint_checks_route(
        endpoint_id: int,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
    ) -> CheckHistory:
        if get_endpoint(endpoint_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endpoint not found.",
            )
        return get_check_history(endpoint_id, limit)

    @router.delete(
        "/endpoints/{endpoint_id}",
        response_model=DeleteEndpointResponse,
        responses={status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}},
        name=route_name("delete_endpoint"),
    )
    def delete_endpoint_route(endpoint_id: int) -> dict[str, str]:
        return delete_endpoint(endpoint_id)

    return router


def register_api_routes(
    app: FastAPI,
    *,
    create_endpoint: Callable[[EndpointCreate], EndpointRecord],
    list_endpoints: Callable[[], list[EndpointRecord]],
    update_endpoint: Callable[[int, EndpointCreate], EndpointRecord],
    delete_endpoint: Callable[[int], dict[str, str]],
    get_endpoint: Callable[[int], EndpointRecord | None],
    perform_check: Callable[[int], dict[str, int | float | str | bool | None]],
    get_check_history: Callable[[int, int], CheckHistory],
) -> None:
    """Registers legacy routes and the canonical `/api/v1` frontend contract."""
    dependencies = {
        "create_endpoint": create_endpoint,
        "list_endpoints": list_endpoints,
        "update_endpoint": update_endpoint,
        "delete_endpoint": delete_endpoint,
        "get_endpoint": get_endpoint,
        "perform_check": perform_check,
        "get_check_history": get_check_history,
    }
    app.include_router(build_api_router(name_prefix="", **dependencies))
    app.include_router(
        build_api_router(name_prefix="v1_", **dependencies),
        prefix="/api/v1",
        tags=["API v1"],
    )
