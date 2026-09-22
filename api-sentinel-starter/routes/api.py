"""JSON API route registration."""

from collections.abc import Callable
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, status

from schemas import EndpointCreate


def register_api_routes(
    app: FastAPI,
    *,
    create_endpoint: Callable[[EndpointCreate], dict[str, int | str]],
    list_endpoints: Callable[[], list[dict[str, int | str]]],
    update_endpoint: Callable[[int, EndpointCreate], dict[str, int | str]],
    delete_endpoint: Callable[[int], dict[str, str]],
    get_endpoint: Callable[[int], dict[str, int | str] | None],
    perform_check: Callable[[int], dict[str, int | float | str | bool | None]],
    get_check_history: Callable[[int, int], list[dict[str, int | float | str | bool | None]]],
) -> None:
    """Registers the stable JSON API contract."""

    @app.get("/health", name="health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "api-sentinel"}

    @app.get("/about", name="about")
    def about() -> dict[str, str]:
        return {
            "project": "API Sentinel",
            "purpose": "Monitor HTTP endpoints",
            "stage": "CS50 final project",
        }

    @app.post(
        "/endpoints", status_code=status.HTTP_201_CREATED, name="create_endpoint"
    )
    def create_endpoint_route(endpoint: EndpointCreate) -> dict[str, int | str]:
        return create_endpoint(endpoint)

    @app.get("/endpoints", name="list_endpoints")
    def list_endpoints_route() -> list[dict[str, int | str]]:
        return list_endpoints()

    @app.put("/endpoints/{endpoint_id}", name="update_endpoint")
    def update_endpoint_route(
        endpoint_id: int, endpoint: EndpointCreate
    ) -> dict[str, int | str]:
        return update_endpoint(endpoint_id, endpoint)

    @app.post("/endpoints/{endpoint_id}/check", name="check_endpoint")
    def check_endpoint_route(
        endpoint_id: int,
    ) -> dict[str, int | float | str | bool | None]:
        return perform_check(endpoint_id)

    @app.get("/endpoints/{endpoint_id}/checks", name="list_endpoint_checks")
    def list_endpoint_checks_route(
        endpoint_id: int,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
    ) -> list[dict[str, int | float | str | bool | None]]:
        if get_endpoint(endpoint_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endpoint not found.",
            )
        return get_check_history(endpoint_id, limit)

    @app.delete("/endpoints/{endpoint_id}", name="delete_endpoint")
    def delete_endpoint_route(endpoint_id: int) -> dict[str, str]:
        return delete_endpoint(endpoint_id)
