# Clone Python SDK

Server-side synchronous and asynchronous clients for Clone predictions, usage,
observation events, cancellation and optional user-approved Clone connections.
Composer UI stays in the JavaScript SDK. This client never submits a user message.

For selected local artifacts, `image_artifact(path, id="draft", revision="1")` prepares a bounded JPEG/PNG.
The media additions below are unreleased and require the corresponding SDK build and matching API deployment.
Install the `media` extra from the matching SDK build and call
`video_artifact(path, id="draft", revision="1")` to prepare the original video/audio and four preview frames, or `audio_artifact(...)` for a selected audio file.
Pass the returned dictionary as the prediction request's `artifact`.
Preparation is local; the subsequent explicit prediction uploads selected pixels and original media.
Both clients reject a media result unless its receipts match the supplied pixels and timestamps.
This requires matching API deployment and image/audiovisual provider configuration.
The separate reviewer returns `artifact_review` with findings, time intervals and coverage before prompt prediction. The server uses OpenAI only, with timestamped video frames (up to 48 uniform frames plus detected changes and an end frame), bounded 5fps reinspection, and actual normalized WAV audio (up to 240 seconds per original). Partial extraction cannot produce approval. Actual player playback and every-frame understanding remain separate evidence. Add `artifact["criteria"]` entries with explicit IDs and text; preferences remain optional taste guidance. See [context mappings](../docs/context-mapping.md).

Python 3.11+. Install `clone-sdk` from [PyPI](https://pypi.org/project/clone-sdk/);
import `clone_sdk`.

```sh
python -m pip install clone-sdk==0.3.0
```

```python
import os
from clone_sdk import CloneClient

with CloneClient(os.environ["CLONE_APP_KEY"]) as client:
    result = client.predict(
        "subject-from-your-authenticated-session",
        {
            "request_id": "prediction-001",
            "session_id": "conversation-001",
            "context_revision": "1",
            "mode": "next_prompt",
            "draft": {"text": "", "revision": 0},
            "messages": [{"role": "user", "content": "Draft a product announcement.", "origin": "human"}],
            "language": "en",
        },
    )
    print(result.status)
```

For FastAPI or other async servers, use `async with AsyncCloneClient(...)` and
`await client.predict(...)`. Reuse a client for the application's lifetime and
close it during shutdown. Media predictions automatically use a 180-second budget. For ordinary requests the async client enforces a total 15-second deadline,
including body reads. The sync client uses 15-second per-I/O timeouts and checks
the elapsed budget between response chunks. Both bound concurrency to 16 by
default, reject saturation without queuing, limit response bodies to 1 MiB, and
never automatically retry potentially billable work. Override `timeout` up to
30 seconds and `max_concurrent_requests` up to 1,000 after measuring your load.

Derive `user_id` from your server session; the client overwrites an untrusted
body's `user_id`. Keep the app key exclusively on your backend. HTTPS is required
except loopback development. Redirects are not followed. Client errors expose
only a safe `code`, HTTP `status` and numeric `retry_after`, never response text.

Keep the same request ID and exact body when reconciling an unknown result.
Hide failed predictions and keep your editor and manual send path independent.
Response identity is checked; the host still owns expiry, rendering, Tab/Undo,
session changes and successful-send acknowledgments.

Optional personalization uses `started, flow = client.connect(user_id, redirect_uri)`
to create a PKCE flow (or `started, flow = await client.connect(...)` for async).
Store the returned flow in a server session, redirect the user to
`started.authorize_url`, then call `exchange(flow, callback, authenticated_user_id)`.
State, request and subject must match. The flow contains a secret verifier and
must not be logged or serialized to browser storage. Basic predictions need no
Clone end-user account.

```python
client.record_event(
    subject,
    {
        "event_id": "event-001",
        "request_id": "prediction-001",
        "kind": "presented",
    },
)
usage = client.usage()
client.cancel(subject, "prediction-001")
```

Only report `submitted` after your host accepts the send. Reuse an event ID on
delivery retries. Behavior receipts and outcomes contain no prompt text and do
not change billing. Explicit evaluations can supply a reason; guidance and edited
successful submissions require `content_opt_in=True` before sending text. Feedback
memory is encrypted, app/user scoped, and expires after 30 days. Call
`client.clear_feedback(subject)` to clear it. See
[feedback](https://clone.is/docs/api-reference#observation-events) for event fields and clearing semantics.
Read the [public API](https://clone.is/docs/api-reference),
[billing](https://clone.is/docs/billing) and
[reliability](https://clone.is/docs/reliability) contracts before production use.

Development: `uv sync`, `uv run pytest`, `uv run ruff check .`, `uv build` and
`uv run twine check dist/*`. All ordinary tests use local or mocked transports;
they do not establish model quality or customer adoption.
