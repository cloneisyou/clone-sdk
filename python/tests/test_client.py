import asyncio
import json

import httpx
import pytest

from clone_sdk import AsyncCloneClient, CloneClient, CloneError

KEY = "clnp_fixture"
REQUEST = {
    "request_id": "request-1",
    "session_id": "session-1",
    "context_revision": "1",
    "mode": "complete_draft",
    "draft": {"text": "Draft", "revision": 1},
}


def prediction(**overrides):
    return {
        "request_id": "request-1",
        "prediction_id": "pred_request-1",
        "session_id": "session-1",
        "connection_id": None,
        "draft_revision": 1,
        "context_revision": "1",
        "profile_revision": "",
        "grant_revision": 0,
        "status": "suggested",
        "completion": " a launch announcement.",
        "expires_at": 9999999999,
        "context_truncated": False,
        "usage": {"prediction_units": 1},
        **overrides,
    }


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://u:p@example.com",
        "https://example.com?q=secret",
        "https://example.com/#secret",
        "file:///tmp/sdk",
    ],
)
def test_rejects_unsafe_urls(url):
    with pytest.raises(ValueError):
        CloneClient(KEY, base_url=url)


@pytest.mark.parametrize(
    "options",
    [
        {"timeout": 0},
        {"timeout": float("nan")},
        {"timeout": 31},
        {"max_concurrent_requests": 0},
        {"max_concurrent_requests": True},
    ],
)
def test_invalid_limits(options):
    with pytest.raises(ValueError):
        CloneClient(KEY, **options)


def test_predict_binds_server_subject_and_reuses_exact_body_without_retry():
    requests = []

    def serve(request):
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer " + KEY
        assert json.loads(request.content)["user_id"] == "trusted-subject"
        return httpx.Response(200, json=prediction())

    with CloneClient(KEY, transport=httpx.MockTransport(serve)) as client:
        assert client.predict("trusted-subject", {**REQUEST, "user_id": "attacker"}).completion
    assert len(requests) == 1


@pytest.mark.parametrize(
    "body",
    [
        None,
        [],
        {"completion": "private response"},
        prediction(draft_revision=2),
        prediction(session_id="another-user"),
        prediction(status="abstained"),
    ],
)
def test_invalid_or_mismatched_prediction_never_exposes_response(body):
    with CloneClient(KEY, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))) as client:
        with pytest.raises(CloneError) as error:
            client.predict("subject", REQUEST)
    assert error.value.code in {"invalid_response", "response_identity_mismatch"}
    assert "private" not in str(error.value)


@pytest.mark.parametrize("status", [401, 402, 409, 429, 503])
def test_safe_http_errors_and_retry_after_without_retry(status):
    calls = []

    def serve(request):
        calls.append(request)
        return httpx.Response(status, json={"detail": {"code": "rate_limited"}}, headers={"Retry-After": "2"})

    with CloneClient(KEY, transport=httpx.MockTransport(serve)) as client:
        with pytest.raises(CloneError) as error:
            client.predict("subject", REQUEST)
    assert (error.value.code, error.value.status, error.value.retry_after) == ("rate_limited", status, 2)
    assert len(calls) == 1


def test_html_error_and_redirect_are_sanitized():
    for status in [302, 502]:
        with CloneClient(
            KEY,
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    status, text="private upstream details", headers={"Location": "https://other.example"}
                )
            ),
        ) as client:
            with pytest.raises(CloneError, match="^request_failed$"):
                client.usage()


async def test_total_deadline_covers_hanging_body_and_releases_slot():
    class HangingBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'{"request_id":'
            await asyncio.Event().wait()

    async with AsyncCloneClient(
        KEY,
        timeout=0.02,
        max_concurrent_requests=1,
        transport=httpx.MockTransport(lambda _: httpx.Response(200, stream=HangingBody())),
    ) as client:
        for _ in range(2):
            with pytest.raises(CloneError, match="request_timeout"):
                await client.predict("subject", REQUEST)
        assert client._in_flight == 0


async def test_saturation_and_cancellation_do_not_leak_slots():
    started = asyncio.Event()

    async def serve(_):
        started.set()
        await asyncio.Event().wait()

    async with AsyncCloneClient(
        KEY, max_concurrent_requests=1, transport=httpx.MockTransport(serve)
    ) as client:
        task = asyncio.create_task(client.predict("subject", REQUEST))
        await started.wait()
        with pytest.raises(CloneError, match="client_capacity_exceeded"):
            await client.predict("subject", REQUEST)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert client._in_flight == 0


def test_pkce_flow_binds_state_subject_and_request_before_exchange():
    requests = []

    def serve(request):
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "request_id": "connect-1",
                "expires_at": 9999999999,
                "authorize_url": "https://clone.is/authorize",
            },
        )

    with CloneClient(KEY, transport=httpx.MockTransport(serve)) as client:
        _, flow = client.connect("subject", "https://app.example/callback")
        assert len(requests[0]["code_challenge"]) == 43
        assert flow.code_verifier not in repr(flow)
        callback = {"state": flow.state, "request_id": flow.request_id, "code": "one-time-code"}
        for changed, subject in [({**callback, "state": "wrong"}, "subject"), (callback, "other")]:
            with pytest.raises(CloneError, match="invalid_connect_callback"):
                client.exchange(flow, changed, subject)
        assert len(requests) == 1


@pytest.mark.parametrize("asynchronous", [False, True])
async def test_all_other_app_key_operations(asynchronous):
    calls = []

    def serve(request):
        calls.append(request)
        if request.url.path.endswith("/usage"):
            return httpx.Response(
                200,
                json={
                    "app_id": "app",
                    "month": "2026-10",
                    "plan": "sandbox",
                    "prediction_units": 1,
                    "reserved_units": 0,
                    "paid_prediction_units": 0,
                    "invoice_cents": 0,
                    "monthly_cap_cents": None,
                    "sandbox_remaining": 999,
                    "currency": "USD",
                },
            )
        if request.url.path.endswith("/cancel"):
            return httpx.Response(200, json={"status": "cancelled", "prediction_units": 0})
        if request.url.path.endswith("/revoke"):
            return httpx.Response(200, json={"status": "revoked"})
        return httpx.Response(200, json={"status": "recorded"})

    cls = AsyncCloneClient if asynchronous else CloneClient
    client = cls(KEY, transport=httpx.MockTransport(serve))
    try:
        results = [
            client.usage(),
            client.cancel("subject", "request/1"),
            client.revoke("subject", "connect/1"),
            client.record_event(
                "subject", {"event_id": "event-1", "request_id": "request-1", "kind": "presented"}
            ),
        ]
        if asynchronous:
            results = [await result for result in results]
        assert results[0].sandbox_remaining == 999
        assert len(calls) == 4
        assert all(json.loads(r.content)["user_id"] == "subject" for r in calls[1:])
    finally:
        if asynchronous:
            await client.close()
        else:
            client.close()
