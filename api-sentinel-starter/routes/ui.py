"""Server-rendered browser UI route registration."""

import asyncio
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from schemas import EndpointCreate


async def read_endpoint_form(
    request: Request,
) -> tuple[dict[str, str], EndpointCreate | None]:
    """Parses a URL-encoded form using the JSON API validation model."""
    try:
        fields = parse_qs((await request.body()).decode("utf-8"), keep_blank_values=True)
    except UnicodeDecodeError:
        return {"name": "", "url": ""}, None
    form_values = {
        "name": fields.get("name", [""])[0],
        "url": fields.get("url", [""])[0],
    }
    try:
        return form_values, EndpointCreate(**form_values)
    except ValidationError:
        return form_values, None


def register_ui_routes(
    app: FastAPI,
    *,
    templates: Jinja2Templates,
    history_limit: int,
    create_endpoint: Callable[[EndpointCreate], dict[str, int | str]],
    update_endpoint: Callable[[int, EndpointCreate], dict[str, int | str]],
    delete_endpoint: Callable[[int], dict[str, str]],
    perform_check: Callable[[int], object],
    get_endpoint: Callable[[int], dict[str, int | str] | None],
    get_dashboard_endpoints: Callable[[], list[dict[str, Any]]],
    get_check_history: Callable[[int, int], list[dict[str, Any]]],
) -> None:
    """Registers the existing Jinja dashboard and form actions."""

    def dashboard_context(
        *, form_values: dict[str, str] | None = None, error: str | None = None
    ) -> dict[str, Any]:
        return {
            "endpoints": get_dashboard_endpoints(),
            "form_values": form_values or {"name": "", "url": ""},
            "error": error,
        }

    def detail_context(
        endpoint: dict[str, int | str],
        *,
        form_values: dict[str, str] | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        return {
            "endpoint": endpoint,
            "history": get_check_history(int(endpoint["id"]), history_limit),
            "history_limit": history_limit,
            "form_values": form_values
            or {"name": str(endpoint["name"]), "url": str(endpoint["url"])},
            "error": error,
        }

    def ui_not_found(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="not_found.html",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    @app.get("/", response_class=HTMLResponse, name="dashboard")
    def dashboard(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="dashboard.html",
            context=dashboard_context(),
        )

    @app.post("/ui/endpoints", response_class=HTMLResponse, name="ui_create_endpoint")
    async def ui_create_endpoint(request: Request) -> HTMLResponse:
        form_values, endpoint = await read_endpoint_form(request)
        if endpoint is None:
            return templates.TemplateResponse(
                request=request,
                name="dashboard.html",
                context=dashboard_context(
                    form_values=form_values,
                    error="Informe um nome e uma URL HTTP/HTTPS válidos.",
                ),
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        try:
            await asyncio.to_thread(create_endpoint, endpoint)
        except HTTPException as error:
            return templates.TemplateResponse(
                request=request,
                name="dashboard.html",
                context=dashboard_context(
                    form_values=form_values, error=str(error.detail)
                ),
                status_code=error.status_code,
            )
        return RedirectResponse(
            url=str(request.url_for("dashboard")),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    @app.get(
        "/ui/endpoints/{endpoint_id}",
        response_class=HTMLResponse,
        name="ui_endpoint_detail",
    )
    def ui_endpoint_detail(request: Request, endpoint_id: int) -> HTMLResponse:
        endpoint = get_endpoint(endpoint_id)
        if endpoint is None:
            return ui_not_found(request)
        return templates.TemplateResponse(
            request=request,
            name="endpoint_detail.html",
            context=detail_context(endpoint),
        )

    @app.post(
        "/ui/endpoints/{endpoint_id}/check",
        response_class=HTMLResponse,
        name="ui_check_endpoint",
    )
    async def ui_check_endpoint(request: Request, endpoint_id: int) -> HTMLResponse:
        try:
            await asyncio.to_thread(perform_check, endpoint_id)
        except HTTPException as error:
            if error.status_code == status.HTTP_404_NOT_FOUND:
                return ui_not_found(request)
            raise
        return RedirectResponse(
            url=str(request.url_for("ui_endpoint_detail", endpoint_id=endpoint_id)),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    @app.post(
        "/ui/endpoints/{endpoint_id}/edit",
        response_class=HTMLResponse,
        name="ui_update_endpoint",
    )
    async def ui_update_endpoint(request: Request, endpoint_id: int) -> HTMLResponse:
        current_endpoint = get_endpoint(endpoint_id)
        if current_endpoint is None:
            return ui_not_found(request)
        form_values, endpoint = await read_endpoint_form(request)
        if endpoint is None:
            return templates.TemplateResponse(
                request=request,
                name="endpoint_detail.html",
                context=detail_context(
                    current_endpoint,
                    form_values=form_values,
                    error="Informe um nome e uma URL HTTP/HTTPS válidos.",
                ),
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        try:
            await asyncio.to_thread(update_endpoint, endpoint_id, endpoint)
        except HTTPException as error:
            if error.status_code == status.HTTP_404_NOT_FOUND:
                return ui_not_found(request)
            return templates.TemplateResponse(
                request=request,
                name="endpoint_detail.html",
                context=detail_context(
                    current_endpoint,
                    form_values=form_values,
                    error=str(error.detail),
                ),
                status_code=error.status_code,
            )
        return RedirectResponse(
            url=str(request.url_for("ui_endpoint_detail", endpoint_id=endpoint_id)),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    @app.post(
        "/ui/endpoints/{endpoint_id}/delete",
        response_class=HTMLResponse,
        name="ui_delete_endpoint",
    )
    async def ui_delete_endpoint(request: Request, endpoint_id: int) -> HTMLResponse:
        try:
            await asyncio.to_thread(delete_endpoint, endpoint_id)
        except HTTPException as error:
            if error.status_code == status.HTTP_404_NOT_FOUND:
                return ui_not_found(request)
            raise
        return RedirectResponse(
            url=str(request.url_for("dashboard")),
            status_code=status.HTTP_303_SEE_OTHER,
        )
