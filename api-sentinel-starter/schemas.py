"""Request schemas shared by the JSON API and browser UI."""

from typing import Annotated

from pydantic import BaseModel, HttpUrl, StringConstraints


class EndpointCreate(BaseModel):
    """Validated endpoint data used for creation and updates."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    url: HttpUrl
