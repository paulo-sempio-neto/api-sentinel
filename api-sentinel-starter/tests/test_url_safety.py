"""Safety checks for monitored endpoint URLs."""

import socket

import pytest

from services.url_safety import UnsafeUrlError, assert_safe_monitor_url


def test_allows_public_http_urls_without_dns_resolution() -> None:
    assert_safe_monitor_url("https://example.com/health", resolve=False)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/health",
        "http://127.0.0.1/health",
        "http://[::1]/health",
        "http://10.0.0.10/health",
        "http://172.16.0.10/health",
        "http://192.168.1.10/health",
        "http://169.254.169.254/latest/meta-data",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://internal-api/health",
        "https://user:password@example.com/health",
    ],
)
def test_rejects_unsafe_monitor_urls_without_dns_resolution(url: str) -> None:
    with pytest.raises(UnsafeUrlError):
        assert_safe_monitor_url(url, resolve=False)


def test_rejects_hostname_that_resolves_to_private_address() -> None:
    def private_resolver(*args, **kwargs):
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("10.0.0.12", 443),
            )
        ]

    with pytest.raises(UnsafeUrlError):
        assert_safe_monitor_url(
            "https://public-looking.example.com/health",
            resolver=private_resolver,
        )
