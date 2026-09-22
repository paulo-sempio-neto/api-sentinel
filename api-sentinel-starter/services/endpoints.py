"""Endpoint management rules and read models."""

import sqlite3

from fastapi import HTTPException, status

import repositories
from schemas import EndpointCreate


def create_endpoint(endpoint: EndpointCreate) -> dict[str, int | str]:
    """Saves a validated endpoint, preserving the existing conflict response."""
    try:
        endpoint_id = repositories.create_endpoint_record(endpoint.name, str(endpoint.url))
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This URL is already registered.",
        ) from error
    return {"id": endpoint_id, "name": endpoint.name, "url": str(endpoint.url)}


def list_endpoints() -> list[dict[str, int | str]]:
    """Lists all registered endpoints."""
    return repositories.list_endpoint_records()


def update_endpoint(
    endpoint_id: int, endpoint: EndpointCreate
) -> dict[str, int | str]:
    """Updates an endpoint with the existing duplicate and missing-ID semantics."""
    try:
        updated = repositories.update_endpoint_record(
            endpoint_id, endpoint.name, str(endpoint.url)
        )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This URL is already registered.",
        ) from error
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )
    return {"id": endpoint_id, "name": endpoint.name, "url": str(endpoint.url)}


def delete_endpoint(endpoint_id: int) -> dict[str, str]:
    """Deletes an endpoint and its cascaded history."""
    if not repositories.delete_endpoint_record(endpoint_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found.",
        )
    return {"message": "Endpoint deleted."}


def get_endpoint_record(endpoint_id: int) -> dict[str, int | str] | None:
    """Loads one endpoint for API and UI reads."""
    return repositories.get_endpoint_record(endpoint_id)


def get_registered_endpoint_ids() -> list[int]:
    """Loads endpoint IDs for the next automatic monitoring cycle."""
    return repositories.list_endpoint_ids()


def get_dashboard_endpoints() -> list[dict]:
    """Combines endpoints with their latest persisted result for the dashboard."""
    dashboard = []
    for endpoint in list_endpoints():
        history = repositories.get_check_history(endpoint["id"], limit=1)
        dashboard.append({**endpoint, "latest": history[0] if history else None})
    return dashboard


def get_check_history(
    endpoint_id: int, limit: int | None = None
) -> list[dict[str, int | float | str | bool | None]]:
    """Returns an endpoint's persisted checks."""
    return repositories.get_check_history(endpoint_id, limit)
