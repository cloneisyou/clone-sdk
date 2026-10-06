import base64
import hashlib

import pytest

from clone_sdk import CloneError, image_artifact, video_artifact
from clone_sdk.client import _identity
from clone_sdk.models import Prediction


def test_image_preparation_and_missing_or_changed_receipts_fail_closed(tmp_path):
    pixels = b"\x89PNG\r\n\x1a\nfixture"
    path = tmp_path / "draft.png"
    path.write_bytes(pixels)
    artifact = image_artifact(path, id="draft", revision="1")
    assert base64.b64decode(artifact["images"][0]["data"]) == pixels
    request = {"request_id": "r", "session_id": "s", "context_revision": "1", "draft": {"revision": 1},
               "artifact": artifact}
    body = {"request_id": "r", "prediction_id": "p", "session_id": "s", "connection_id": None,
            "draft_revision": 1, "context_revision": "1", "profile_revision": "", "grant_revision": 0,
            "status": "suggested", "completion": "Fix the draft.", "expires_at": 123,
            "context_truncated": False, "usage": {"prediction_units": 1}}
    with pytest.raises(CloneError, match="media_review_not_acknowledged"):
        _identity(Prediction.model_validate(body), request)
    body["media_review"] = [{"ref": "draft", "sha256": hashlib.sha256(pixels).hexdigest()}]
    assert _identity(Prediction.model_validate(body), request).media_review
    body["media_review"][0]["sha256"] = "changed"
    with pytest.raises(CloneError, match="media_review_not_acknowledged"):
        _identity(Prediction.model_validate(body), request)


def test_video_preparation_samples_actual_opening_and_ending_pixels(tmp_path):
    av = pytest.importorskip("av")
    np = pytest.importorskip("numpy")
    path = tmp_path / "draft.mp4"
    with av.open(str(path), mode="w") as output:
        stream = output.add_stream("mpeg4", rate=10)
        stream.width, stream.height, stream.pix_fmt = 160, 90, "yuv420p"
        for index in range(40):
            pixels = np.zeros((90, 160, 3), dtype=np.uint8)
            pixels[:, :, 0 if index < 20 else 2] = 255
            frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
            for packet in stream.encode(frame):
                output.mux(packet)
        for packet in stream.encode():
            output.mux(packet)
    artifact = video_artifact(path, id="draft", revision="1")
    assert artifact["duration_seconds"] == 4
    assert len(artifact["images"]) == 4
    assert artifact["images"][0]["timestamp_seconds"] == 0
    assert artifact["images"][-1]["timestamp_seconds"] >= 3.8
    assert artifact["images"][0]["data"] != artifact["images"][-1]["data"]
