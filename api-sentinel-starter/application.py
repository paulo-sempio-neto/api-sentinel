"""FastAPI application construction without route business logic."""

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


def create_application(
    *,
    project_directory: Path,
    lifespan: Callable[[FastAPI], AbstractAsyncContextManager[None]],
) -> tuple[FastAPI, Jinja2Templates]:
    """Creates the application and its shared static/template resources."""
    app = FastAPI(
        title="API Sentinel",
        description="A service for monitoring HTTP endpoints.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.mount(
        "/static",
        StaticFiles(directory=project_directory / "static"),
        name="static",
    )
    return app, Jinja2Templates(directory=project_directory / "templates")
