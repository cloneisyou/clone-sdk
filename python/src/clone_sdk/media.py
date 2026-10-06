"""Local artifact preparation. A later explicit prediction uploads selected pixels and original media."""

import base64
import hashlib
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
    return {
        "kind": "image",
        "id": id,
        "revision": revision,
        "summary": summary,
        "images": [{"ref": id, "mime_type": mime, "data": base64.b64encode(raw).decode("ascii")}],
    }


def video_artifact(path: str | Path, *, id: str, revision: str, summary: str = "") -> dict:
    """Prepare the original video/audio and preview frames; a later predict uploads the whole source."""
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
        duration = (
            float(stream.duration * stream.time_base)
            if stream.duration
            else (float(container.duration / av.time_base) if container.duration else 0)
        )
        source_duration = max(
            duration, float(container.duration / av.time_base) if container.duration else duration
        )
        if not math.isfinite(source_duration) or not 0 < source_duration <= 3600:
            raise ValueError("Video requires a known duration of at most one hour")
        for target in [0, duration / 3, duration * 2 / 3, max(0, duration - 0.1)]:
            container.seek(int((target + start) / float(stream.time_base)), stream=stream, backward=True)
            frame = None
            for index, candidate in enumerate(container.decode(stream)):
                if index >= 180 or time.monotonic() > deadline:
                    raise ValueError("Video decoding exceeded its bounded budget")
                if candidate.time is not None:
                    frame = candidate
                if candidate.time is not None and candidate.time - start >= target - 0.0001:
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
                    np.rot90(frame.to_ndarray(format="rgb24"), rotation // 90).copy(), format="rgb24"
                )
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
            images.append(
                {
                    "ref": f"{id}#t={timestamp}",
                    "mime_type": "image/jpeg",
                    "data": base64.b64encode(encoded).decode("ascii"),
                    "timestamp_seconds": timestamp,
                }
            )
    diagnostics = _scan_source(raw)
    mime = {".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}.get(
        source.suffix.lower(), "video/mp4"
    )
    return {
        "kind": "video",
        "id": id,
        "revision": revision,
        "summary": summary,
        "duration_seconds": source_duration,
        "images": images,
        "media": [
            {
                "ref": id,
                "mime_type": mime,
                "data": base64.b64encode(raw).decode("ascii"),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "duration_seconds": source_duration,
                "diagnostics": diagnostics,
            }
        ],
    }


def _scan_source(raw: bytes) -> dict:
    import av

    started = time.monotonic()
    video_frames = audio_frames = 0
    complete = True
    with av.open(io.BytesIO(raw)) as container:
        has_audio = bool(container.streams.audio)
        try:
            for packet in container.demux():
                for frame in packet.decode():
                    if time.monotonic() - started > 25:
                        complete = False
                        break
                    if isinstance(frame, av.VideoFrame):
                        video_frames += 1
                    elif isinstance(frame, av.AudioFrame):
                        audio_frames += 1
                if not complete:
                    break
        except av.FFmpegError:
            complete = False
    return {
        "full_decode": complete,
        "decoded_video_frames": video_frames,
        "decoded_audio_frames": audio_frames,
        "audio_track_present": has_audio,
        "player_verified": False,
    }


def audio_artifact(path: str | Path, *, id: str, revision: str, summary: str = "") -> dict:
    """Prepare a hash-bound original audio source without sending it."""
    try:
        import av
    except ImportError:
        raise RuntimeError("Install clone-sdk[media] to prepare local audio artifacts") from None

    source = Path(path)
    if not 0 < source.stat().st_size <= 100 * 1024 * 1024:
        raise ValueError("Audio must be at most 100 MiB")
    raw = source.read_bytes()
    if len(raw) > 100 * 1024 * 1024:
        raise ValueError("Audio must be at most 100 MiB")
    with av.open(io.BytesIO(raw)) as container:
        stream = next(iter(container.streams.audio), None)
        if stream is None:
            raise ValueError("Audio stream is missing")
        duration = (
            float(stream.duration * stream.time_base)
            if stream.duration
            else float((container.duration or 0) / av.time_base)
        )
    if not math.isfinite(duration) or not 0 < duration <= 3600:
        raise ValueError("Audio duration must be within one hour")
    mime = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm"}.get(
        source.suffix.lower()
    )
    if mime is None:
        raise ValueError("Supported audio containers: wav, mp3, m4a, webm")
    return {
        "kind": "other",
        "id": id,
        "revision": revision,
        "summary": summary,
        "media": [
            {
                "ref": id,
                "mime_type": mime,
                "data": base64.b64encode(raw).decode("ascii"),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "duration_seconds": duration,
                "diagnostics": _scan_source(raw),
            }
        ],
    }
