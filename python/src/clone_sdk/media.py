"""Local artifact preparation. Only selected pixels are uploaded by a later explicit predict call."""

import base64
import io
import math
import time
from pathlib import Path


def image_artifact(path: str | Path, *, id: str, revision: str, summary: str = "") -> dict:
    source = Path(path)
    if not 0 < source.stat().st_size <= 480_000:
        raise ValueError("Image must be a JPEG or PNG of at most 480000 bytes")
    raw = source.read_bytes()
    mime = "image/png" if raw.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg"
    if len(raw) > 480_000 or not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
        raise ValueError("Image must be a JPEG or PNG of at most 480000 bytes")
    return {"kind": "image", "id": id, "revision": revision, "summary": summary,
            "images": [{"ref": id, "mime_type": mime, "data": base64.b64encode(raw).decode("ascii")}]}


def video_artifact(path: str | Path, *, id: str, revision: str, summary: str = "") -> dict:
    """Decode four timestamped frame samples. Intervening frames, motion and audio remain uninspected."""
    try:
        import av
    except ImportError:
        raise RuntimeError("Install clone-sdk[media] to prepare local video artifacts") from None
    source = Path(path)
    if not 0 < source.stat().st_size <= 100 * 1024 * 1024:
        raise ValueError("Video must be at most 100 MiB")
    raw = source.read_bytes()
    if len(raw) > 100 * 1024 * 1024:
        raise ValueError("Video must be at most 100 MiB")
    deadline = time.monotonic() + 8
    images = []
    with av.open(io.BytesIO(raw)) as container:
        stream = next(iter(container.streams.video), None)
        if stream is None or not 0 < stream.width * stream.height <= 25_000_000:
            raise ValueError("No supported video stream")
        start = float((stream.start_time or 0) * stream.time_base)
        duration = float(stream.duration * stream.time_base) if stream.duration else (
            float(container.duration / av.time_base) if container.duration else 0)
        if not math.isfinite(duration) or not 0 < duration <= 3600:
            raise ValueError("Video requires a known duration of at most one hour")
        for target in [0, duration / 3, duration * 2 / 3, max(0, duration - .1)]:
            container.seek(int((target + start) / float(stream.time_base)), stream=stream, backward=True)
            frame = None
            for index, candidate in enumerate(container.decode(stream)):
                if index >= 180 or time.monotonic() > deadline:
                    raise ValueError("Video decoding exceeded its bounded budget")
                if candidate.time is not None and candidate.time - start >= target - .0001:
                    frame = candidate
                    break
            if frame is None:
                raise ValueError("Video frame could not be decoded")
            timestamp = round(float(frame.time) - start, 3)
            if images and timestamp <= images[-1]["timestamp_seconds"]:
                continue
            rotation = int(getattr(frame, "rotation", 0))
            if rotation:
                if rotation % 90:
                    raise ValueError("Unsupported video display matrix")
                import numpy as np
                frame = av.VideoFrame.from_ndarray(
                    np.rot90(frame.to_ndarray(format="rgb24"), rotation // 90).copy(), format="rgb24")
            scale = min(1, 1600 / max(frame.width, frame.height))
            width = max(2, int(frame.width * scale) // 2 * 2)
            height = max(2, int(frame.height * scale) // 2 * 2)
            destination = io.BytesIO()
            with av.open(destination, mode="w", format="mjpeg") as output:
                encoder = output.add_stream("mjpeg", rate=1)
                encoder.width, encoder.height, encoder.pix_fmt = width, height, "yuvj420p"
                for packet in encoder.encode(frame.reformat(width=width, height=height, format="yuvj420p")):
                    output.mux(packet)
                for packet in encoder.encode():
                    output.mux(packet)
            encoded = destination.getvalue()
            if not encoded or len(encoded) > 480_000:
                raise ValueError("Encoded video frame exceeds the image budget")
            images.append({"ref": f"{id}#t={timestamp}", "mime_type": "image/jpeg",
                           "data": base64.b64encode(encoded).decode("ascii"), "timestamp_seconds": timestamp})
    return {"kind": "video", "id": id, "revision": revision, "summary": summary,
            "duration_seconds": duration, "images": images}
