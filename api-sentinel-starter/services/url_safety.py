"""Validation helpers for URLs that API Sentinel may request."""

import ipaddress
import socket
from collections.abc import Callable
from urllib.parse import urlparse


class UnsafeUrlError(ValueError):
    """Raised when a monitored URL would target a non-public network location."""


Resolver = Callable[..., list[tuple]]

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata",
    "metadata.google.internal",
}

BLOCKED_METADATA_IPS = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("169.254.170.2"),
}


def _normalized_host(host: str) -> str:
    return host.strip().rstrip(".").lower()


def _validate_ip_address(host: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False

    if address in BLOCKED_METADATA_IPS or not address.is_global:
        raise UnsafeUrlError("Endpoint URL must resolve to a public internet address.")
    return True


def _validate_hostname(host: str) -> None:
    normalized = _normalized_host(host)
    if not normalized:
        raise UnsafeUrlError("Endpoint URL must include a hostname.")
    if normalized in BLOCKED_HOSTNAMES or normalized.endswith(".localhost"):
        raise UnsafeUrlError("Endpoint URL cannot target localhost or metadata services.")
    if "." not in normalized:
        raise UnsafeUrlError("Endpoint URL must use a public hostname.")


def assert_safe_monitor_url(
    url: str,
    *,
    resolve: bool = True,
    resolver: Resolver = socket.getaddrinfo,
) -> None:
    """Rejects URLs that can target local, private, link-local, or metadata hosts."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Endpoint URL must use HTTP or HTTPS.")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("Endpoint URL cannot include credentials.")

    try:
        host = parsed.hostname
    except ValueError as error:
        raise UnsafeUrlError("Endpoint URL host is not valid.") from error
    if host is None:
        raise UnsafeUrlError("Endpoint URL must include a hostname.")

    if _validate_ip_address(host):
        return

    _validate_hostname(host)
    if not resolve:
        return

    try:
        addresses = resolver(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return

    for address_info in addresses:
        resolved_host = address_info[4][0]
        try:
            address = ipaddress.ip_address(resolved_host)
        except ValueError:
            continue
        if address in BLOCKED_METADATA_IPS or not address.is_global:
            raise UnsafeUrlError("Endpoint URL must resolve to a public internet address.")
