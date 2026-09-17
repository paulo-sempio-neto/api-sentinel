"""API Sentinel: an HTTP endpoint monitoring project."""

# AI assistance: ChatGPT was used for guidance and code review.

import sqlite3

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, HttpUrl

from database import get_connection, initialize_database

initialize_database()

app = FastAPI(
    title="API Sentinel",
    description="A service for monitoring HTTP endpoints.",
    version="0.1.0",
)


class EndpointCreate(BaseModel):
    name: str
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