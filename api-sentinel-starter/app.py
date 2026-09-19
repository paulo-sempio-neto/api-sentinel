"""API Sentinel: an HTTP endpoint monitoring project."""

# AI assistance: ChatGPT was used for guidance and code review.

import sqlite3
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, HttpUrl, StringConstraints

from database import get_connection, initialize_database


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initializes the database when the application starts."""
    initialize_database()
    yield


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
