"""Bounded clients. No automatic retries of potentially billable requests."""

import asyncio
import base64
import hashlib
import math
import re
import secrets
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, TypeVar
from urllib.parse import quote, urlsplit

import httpx
from pydantic import ValidationError

from .models import (
    CancelResult,
    Connection,
    ConnectionStarted,
    EventResult,
    Prediction,
    ResponseModel,
    RevokeResult,
    Usage,
)

T = TypeVar("T", bound=ResponseModel)
MAX_RESPONSE_BYTES = 1_048_576


class CloneError(Exception):
    """Safe code and status only. Never contains response text, prompts or credentials."""

    def __init__(self, code: str, status: int = 0, retry_after: float | None = None):
        self.code, self.status, self.retry_after = code, status, retry_after
        super().__init__(code)


@dataclass(frozen=True, repr=False)
class ConnectionFlow:
    request_id: str
    state: str
    code_verifier: str
    redirect_uri: str
    user_id: str


def _decode(response: httpx.Response, data: bytes, model: type[T]) -> T:
    import json

    try:
        body = json.loads(data)
    except (ValueError, UnicodeError):
        body = None
    if not response.is_success:
        detail = body.get("detail") if isinstance(body, dict) else None
        code = detail.get("code") if isinstance(detail, dict) else None
        code = (
            code
            if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,127}", code)
            else "request_failed"
        )
        try:
            retry_after = float(response.headers["Retry-After"])
            if not math.isfinite(retry_after) or retry_after < 0:
                retry_after = None
        except (KeyError, ValueError):
            retry_after = None
        raise CloneError(code, response.status_code, retry_after)
    try:
        return model.model_validate(body)
    except ValidationError:
        raise CloneError("invalid_response", 502) from None


def _identity(result: Prediction, request: Mapping[str, Any]) -> Prediction:
    draft = request.get("draft", {})
    expected = (
        request.get("request_id"),
        request.get("session_id"),
        request.get("connection_id"),
        draft.get("revision"),
        request.get("context_revision"),
    )
    actual = (
        result.request_id,
        result.session_id,
        result.connection_id,
        result.draft_revision,
        result.context_revision,
    )
    if expected != actual:
        raise CloneError("response_identity_mismatch", 502)
    if result.status == "abstained" and (result.completion or result.usage.prediction_units):
        raise CloneError("invalid_response", 502)
    return result


class _Options:
    def __init__(self, api_key: str, base_url: str, timeout: float, max_concurrent_requests: int):
        url = urlsplit(base_url)
        if url.scheme != "https" and not (
            url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
        ):
            raise ValueError("Clone API requires HTTPS; loopback HTTP is for development only")
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("Invalid Clone API URL")
        if not isinstance(api_key, str) or not api_key.startswith("clnp_"):
            raise ValueError("An app-scoped Clone API key is required")
        if isinstance(timeout, bool) or not math.isfinite(timeout) or not 0 < timeout <= 30:
            raise ValueError("timeout must be greater than zero and at most 30 seconds")
        if type(max_concurrent_requests) is not int or not 1 <= max_concurrent_requests <= 1000:
            raise ValueError("max_concurrent_requests must be between 1 and 1000")
        self.base_url, self.timeout, self.limit = base_url.rstrip("/"), timeout, max_concurrent_requests
        self.headers = {"Authorization": "Bearer " + api_key}

    @staticmethod
    def start_flow(user_id: str, redirect_uri: str):
        verifier, state = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        return (
            verifier,
            state,
            {"user_id": user_id, "redirect_uri": redirect_uri, "state": state, "code_challenge": challenge},
        )

    @staticmethod
    def exchange_body(flow: ConnectionFlow, callback: Mapping[str, str], user_id: str):
        if (
            flow.user_id != user_id
            or callback.get("state") != flow.state
            or callback.get("request_id") != flow.request_id
            or not callback.get("code")
        ):
            raise CloneError("invalid_connect_callback", 400)
        return {
            "request_id": flow.request_id,
            "user_id": user_id,
            "redirect_uri": flow.redirect_uri,
            "code_verifier": flow.code_verifier,
            "code": callback["code"],
        }


class CloneClient(_Options):
    """Synchronous client with connection reuse, per-I/O timeouts and fail-fast concurrency."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.clone.is",
        timeout: float = 15,
        max_concurrent_requests: int = 16,
        transport: httpx.BaseTransport | None = None,
    ):
        super().__init__(api_key, base_url, timeout, max_concurrent_requests)
        self._slots = threading.BoundedSemaphore(self.limit)
        self._client = httpx.Client(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            limits=httpx.Limits(max_connections=self.limit, max_keepalive_connections=self.limit),
        )

    def _call(self, path: str, model: type[T], body: dict | None = None) -> T:
        if not self._slots.acquire(blocking=False):
            raise CloneError("client_capacity_exceeded", 503)
        try:
            start = time.monotonic()
            with self._client.stream(
                "GET" if body is None else "POST",
                self.base_url + "/v1" + path,
                headers=self.headers,
                json=body,
            ) as response:
                data = bytearray()
                for chunk in response.iter_bytes():
                    if time.monotonic() - start > self.timeout:
                        raise CloneError("request_timeout", 504)
                    data.extend(chunk)
                    if len(data) > MAX_RESPONSE_BYTES:
                        raise CloneError("response_too_large", 502)
                return _decode(response, bytes(data), model)
        except httpx.TimeoutException:
            raise CloneError("request_timeout", 504) from None
        except httpx.HTTPError:
            raise CloneError("network_error") from None
        finally:
            self._slots.release()

    def predict(self, user_id: str, request: Mapping[str, Any]) -> Prediction:
        return _identity(self._call("/predictions", Prediction, {**request, "user_id": user_id}), request)

    def record_event(self, user_id: str, event: Mapping[str, Any]) -> EventResult:
        return self._call("/prediction-events", EventResult, {**event, "user_id": user_id})

    def cancel(self, user_id: str, request_id: str) -> CancelResult:
        return self._call(
            f"/predictions/{quote(request_id, safe='')}/cancel", CancelResult, {"user_id": user_id}
        )

    def usage(self) -> Usage:
        return self._call("/usage", Usage)

    def revoke(self, user_id: str, connection_id: str) -> RevokeResult:
        return self._call(
            f"/connections/{quote(connection_id, safe='')}/revoke", RevokeResult, {"user_id": user_id}
        )

    def connect(self, user_id: str, redirect_uri: str) -> tuple[ConnectionStarted, ConnectionFlow]:
        verifier, state, body = self.start_flow(user_id, redirect_uri)
        result = self._call("/connections", ConnectionStarted, body)
        return result, ConnectionFlow(result.request_id, state, verifier, redirect_uri, user_id)

    def exchange(self, flow: ConnectionFlow, callback: Mapping[str, str], user_id: str) -> Connection:
        return self._call("/connections/exchange", Connection, self.exchange_body(flow, callback, user_id))

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class AsyncCloneClient(_Options):
    """Async client with a total deadline including response-body reads, without automatic retries."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.clone.is",
        timeout: float = 15,
        max_concurrent_requests: int = 16,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        super().__init__(api_key, base_url, timeout, max_concurrent_requests)
        self._in_flight = 0
        self._client = httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            limits=httpx.Limits(max_connections=self.limit, max_keepalive_connections=self.limit),
        )

    async def _call(self, path: str, model: type[T], body: dict | None = None) -> T:
        if self._in_flight >= self.limit:
            raise CloneError("client_capacity_exceeded", 503)
        self._in_flight += 1
        try:
            async with asyncio.timeout(self.timeout):
                async with self._client.stream(
                    "GET" if body is None else "POST",
                    self.base_url + "/v1" + path,
                    headers=self.headers,
                    json=body,
                ) as response:
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_RESPONSE_BYTES:
                            raise CloneError("response_too_large", 502)
                    return _decode(response, bytes(data), model)
        except (TimeoutError, httpx.TimeoutException):
            raise CloneError("request_timeout", 504) from None
        except httpx.HTTPError:
            raise CloneError("network_error") from None
        finally:
            self._in_flight -= 1

    async def predict(self, user_id: str, request: Mapping[str, Any]) -> Prediction:
        return _identity(
            await self._call("/predictions", Prediction, {**request, "user_id": user_id}), request
        )

    async def record_event(self, user_id: str, event: Mapping[str, Any]) -> EventResult:
        return await self._call("/prediction-events", EventResult, {**event, "user_id": user_id})

    async def cancel(self, user_id: str, request_id: str) -> CancelResult:
        return await self._call(
            f"/predictions/{quote(request_id, safe='')}/cancel", CancelResult, {"user_id": user_id}
        )

    async def usage(self) -> Usage:
        return await self._call("/usage", Usage)

    async def revoke(self, user_id: str, connection_id: str) -> RevokeResult:
        return await self._call(
            f"/connections/{quote(connection_id, safe='')}/revoke", RevokeResult, {"user_id": user_id}
        )

    async def connect(self, user_id: str, redirect_uri: str) -> tuple[ConnectionStarted, ConnectionFlow]:
        verifier, state, body = self.start_flow(user_id, redirect_uri)
        result = await self._call("/connections", ConnectionStarted, body)
        return result, ConnectionFlow(result.request_id, state, verifier, redirect_uri, user_id)

    async def exchange(self, flow: ConnectionFlow, callback: Mapping[str, str], user_id: str) -> Connection:
        return await self._call(
            "/connections/exchange", Connection, self.exchange_body(flow, callback, user_id)
        )

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()
