"""Request schemas shared by the JSON API and browser UI."""

from typing import Annotated

from pydantic import BaseModel, Field, HttpUrl, StringConstraints, field_validator

from services.url_safety import UnsafeUrlError, assert_safe_monitor_url


class EndpointCreate(BaseModel):
    """Validated endpoint data used for creation and updates."""

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    url: Annotated[HttpUrl, Field(max_length=2048)]

    @field_validator("url")
    @classmethod
    def reject_unsafe_monitor_url(cls, url: HttpUrl) -> HttpUrl:
        try:
            assert_safe_monitor_url(str(url), resolve=False)
        except UnsafeUrlError as error:
            raise ValueError(str(error)) from error
        return url


class HealthResponse(BaseModel):
    """Stable service-health response for client-side polling."""

    status: str
    service: str


class AboutResponse(BaseModel):
    """Stable project metadata response."""

    project: str
    purpose: str
    stage: str


class EndpointResponse(BaseModel):
    """Endpoint resource returned by the API."""

    id: int
    name: str
    url: str


class CheckResultResponse(BaseModel):
    """Persisted endpoint-check result returned to clients."""

    id: int
    endpoint_id: int
    checked_at: str
    success: bool
    status_code: int | None
    response_time_ms: float | None
    error_message: str | None


class DeleteEndpointResponse(BaseModel):
    """Confirmation returned after deleting an endpoint."""

    message: str


class ErrorResponse(BaseModel):
    """HTTP error body returned for domain-level API failures."""

    detail: str
