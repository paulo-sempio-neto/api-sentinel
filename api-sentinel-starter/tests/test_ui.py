"""Browser UI tests using temporary SQLite data and no public network."""

from datetime import datetime
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import app
from database import get_check_history, save_check_result


@pytest.fixture
def endpoint(client: TestClient) -> dict:
    response = client.post(
        "/endpoints",
        json={"name": "Example API", "url": "https://example.com/health"},
    )
    assert response.status_code == 201
    return response.json()


def test_dashboard_loads_as_html(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "API Sentinel" in response.text
    assert "Cadastrar endpoint" in response.text
    assert app.state.monitor_task is None


def test_empty_dashboard_has_clear_message(client: TestClient) -> None:
    response = client.get("/")

    assert "Nenhum endpoint cadastrado." in response.text
    assert "Sem dados" not in response.text


def test_existing_endpoint_without_checks_is_shown(
    client: TestClient, endpoint: dict
) -> None:
    response = client.get("/")

    assert endpoint["name"] in response.text
    assert endpoint["url"] in response.text
    assert "Sem dados" in response.text
    assert "ainda não possui verificações" in response.text


def test_dashboard_shows_only_latest_check(
    client: TestClient, endpoint: dict
) -> None:
    save_check_result(
        endpoint["id"],
        False,
        status_code=503,
        error_message="older-result-marker",
        checked_at=datetime.fromisoformat("2026-01-02T09:00:00+00:00"),
    )
    save_check_result(
        endpoint["id"],
        True,
        status_code=204,
        response_time_ms=12.5,
        checked_at=datetime.fromisoformat("2026-01-02T12:00:00+00:00"),
    )

    response = client.get("/")

    assert "Online" in response.text
    assert "204" in response.text
    assert "12.5 ms" in response.text
    assert "2026-01-02T12:00:00.000000+00:00" in response.text
    assert "older-result-marker" not in response.text


def test_creation_form_creates_endpoint(client: TestClient) -> None:
    response = client.post(
        "/ui/endpoints",
        data={"name": "  Created in browser  ", "url": "https://example.org/api"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "http://testserver/"
    endpoints = client.get("/endpoints").json()
    assert endpoints == [
        {
            "id": endpoints[0]["id"],
            "name": "Created in browser",
            "url": "https://example.org/api",
        }
    ]


@pytest.mark.parametrize(
    "form_data",
    [
        {"name": "   ", "url": "https://example.com/api"},
        {"name": "Invalid URL", "url": "not-a-url"},
    ],
)
def test_invalid_creation_is_rendered_without_writing(
    client: TestClient, form_data: dict[str, str]
) -> None:
    response = client.post("/ui/endpoints", data=form_data)

    assert response.status_code == 422
    assert "Informe um nome e uma URL HTTP/HTTPS válidos." in response.text
    assert client.get("/endpoints").json() == []


def test_manual_check_action_creates_exactly_one_result(
    client: TestClient, endpoint: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    outbound = Mock(return_value=httpx.Response(204))
    monkeypatch.setattr(app_module.httpx, "get", outbound)

    response = client.post(
        f"/ui/endpoints/{endpoint['id']}/check", follow_redirects=False
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith(f"/ui/endpoints/{endpoint['id']}")
    history = get_check_history(endpoint["id"])
    assert len(history) == 1
    assert history[0]["status_code"] == 204
    outbound.assert_called_once()


def test_detail_displays_history_newest_first(
    client: TestClient, endpoint: dict
) -> None:
    save_check_result(
        endpoint["id"],
        False,
        error_message="older-history-marker",
        checked_at=datetime.fromisoformat("2026-01-02T09:00:00+00:00"),
    )
    save_check_result(
        endpoint["id"],
        False,
        error_message="newer-history-marker",
        checked_at=datetime.fromisoformat("2026-01-02T12:00:00+00:00"),
    )

    response = client.get(f"/ui/endpoints/{endpoint['id']}")

    assert response.status_code == 200
    assert endpoint["name"] in response.text
    assert response.text.index("newer-history-marker") < response.text.index(
        "older-history-marker"
    )


def test_missing_endpoint_detail_returns_html_404(client: TestClient) -> None:
    response = client.get("/ui/endpoints/999")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/html")
    assert "Endpoint não encontrado" in response.text


def test_get_pages_do_not_trigger_checks(
    client: TestClient, endpoint: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    forbidden = Mock(side_effect=AssertionError("GET pages must not run checks"))
    monkeypatch.setattr(app_module, "perform_endpoint_check", forbidden)
    monkeypatch.setattr(app_module.httpx, "get", forbidden)

    assert client.get("/").status_code == 200
    assert client.get(f"/ui/endpoints/{endpoint['id']}").status_code == 200
    forbidden.assert_not_called()
    assert get_check_history(endpoint["id"]) == []


def test_endpoint_management_forms_reuse_existing_behavior(
    client: TestClient, endpoint: dict
) -> None:
    updated = client.post(
        f"/ui/endpoints/{endpoint['id']}/edit",
        data={"name": "Updated in browser", "url": "https://example.org/current"},
        follow_redirects=False,
    )
    assert updated.status_code == 303
    assert client.get("/endpoints").json() == [
        {
            "id": endpoint["id"],
            "name": "Updated in browser",
            "url": "https://example.org/current",
        }
    ]

    deleted = client.post(
        f"/ui/endpoints/{endpoint['id']}/delete", follow_redirects=False
    )
    assert deleted.status_code == 303
    assert client.get("/endpoints").json() == []


def test_templates_escape_endpoint_names(client: TestClient) -> None:
    response = client.post(
        "/endpoints",
        json={"name": "<script>alert('x')</script>", "url": "https://example.com"},
    )
    assert response.status_code == 201

    dashboard = client.get("/")

    assert "<script>alert" not in dashboard.text
    assert "&lt;script&gt;alert" in dashboard.text


def test_existing_api_routes_remain_json(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post(
        "/endpoints", json={"name": "JSON API", "url": "https://example.com/api"}
    )
    endpoint_id = created.json()["id"]
    assert created.status_code == 201
    assert created.headers["content-type"].startswith("application/json")
    assert client.get("/endpoints").json() == [created.json()]

    outbound = Mock(return_value=httpx.Response(200))
    monkeypatch.setattr(app_module.httpx, "get", outbound)
    checked = client.post(f"/endpoints/{endpoint_id}/check")
    history = client.get(f"/endpoints/{endpoint_id}/checks")

    assert checked.headers["content-type"].startswith("application/json")
    assert history.headers["content-type"].startswith("application/json")
    assert history.json() == [checked.json()]
    outbound.assert_called_once()
