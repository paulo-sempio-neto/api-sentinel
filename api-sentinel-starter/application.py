"""FastAPI application construction without route business logic."""

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


def create_application(
    *,
    project_directory: Path,
    lifespan: Callable[[FastAPI], AbstractAsyncContextManager[None]],
    cors_allowed_origins: tuple[str, ...] = (),
    logger: logging.Logger | None = None,
) -> tuple[FastAPI, Jinja2Templates]:
    """Creates the application and its shared static/template resources."""
    app = FastAPI(
        title="API Sentinel",
        description="A service for monitoring HTTP endpoints.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application_logger = logger or logging.getLogger(__name__)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, error: Exception) -> JSONResponse:
        """Logs internal failures while keeping the public error response safe."""
        application_logger.exception(
            "Unhandled application error.",
            extra={"event": "unhandled_exception", "exception_type": type(error).__name__},
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected server error occurred."},
        )

    if cors_allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(cors_allowed_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Accept", "Content-Type"],
        )
    app.mount(
        "/static",
        StaticFiles(directory=project_directory / "static"),
        name="static",
    )
    return app, Jinja2Templates(directory=project_directory / "templates")
