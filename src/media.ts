import type { components } from './generated/api-types.js';
import type { CompletionRequest, PredictionOutput } from './types.js';
import { ClonePredictionError } from './http.js';

export type ArtifactContext = components['schemas']['ArtifactContext'];
export type ArtifactImage = components['schemas']['ArtifactImage'];
export type MediaReceipt = components['schemas']['MediaReceipt'];
type ArtifactIdentity = Pick<ArtifactContext, 'id' | 'revision' | 'summary' | 'selection'>;

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(text);
}

/** Server/browser helper for already bounded JPEG or PNG pixels. */
export function artifactImage(bytes: Uint8Array, mimeType: ArtifactImage['mime_type'], ref: string,
  timestampSeconds?: number): ArtifactImage {
  const signature = mimeType === 'image/jpeg' ? [255, 216, 255] : [137, 80, 78, 71, 13, 10, 26, 10];
  if (!bytes.length || bytes.length > 480_000 || !signature.every((value, index) => bytes[index] === value)) {
    throw new ClonePredictionError('invalid_artifact_image', 422);
  }
  return { ref, mime_type: mimeType, data: base64(bytes),
    ...(timestampSeconds === undefined ? {} : { timestamp_seconds: timestampSeconds }) };
}

/** Refuse a candidate from a server that did not inspect these exact pixels. */
export async function verifyMediaReview(request: CompletionRequest, output: PredictionOutput): Promise<void> {
  const images = request.artifact?.images ?? [];
  if (!images.length) return;
  const expected = await Promise.all(images.map(async image => {
    const bytes = Uint8Array.from(atob(image.data), value => value.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    return [image.ref, sha256, image.timestamp_seconds ?? null];
  }));
  const actual = (output.media_review ?? []).map(item => [item.ref, item.sha256, item.timestamp_seconds ?? null]);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new ClonePredictionError('media_review_not_acknowledged', 502);
  }
}

async function canvasImage(canvas: HTMLCanvasElement, ref: string, time?: number): Promise<ArtifactImage> {
  for (const quality of [.8, .6, .4]) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1]!;
    if (data.length <= 640_000) return { ref, mime_type: 'image/jpeg', data,
      ...(time === undefined ? {} : { timestamp_seconds: time }) };
  }
  throw new ClonePredictionError('artifact_image_too_large', 413);
}

function canvas(width: number, height: number): HTMLCanvasElement {
  if (!width || !height || width * height > 25_000_000) throw new ClonePredictionError('invalid_media_dimensions', 422);
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const result = document.createElement('canvas');
  result.width = Math.max(2, Math.round(width * scale));
  result.height = Math.max(2, Math.round(height * scale));
  return result;
}

/** Decode a local image Blob and prepare actual pixels for artifact review. */
export async function prepareImageArtifact(file: Blob, identity: ArtifactIdentity): Promise<ArtifactContext> {
  if (file.size > 12 * 1024 * 1024) throw new ClonePredictionError('artifact_source_too_large', 413);
  const bitmap = await createImageBitmap(file);
  try {
    const surface = canvas(bitmap.width, bitmap.height);
    surface.getContext('2d')!.drawImage(bitmap, 0, 0, surface.width, surface.height);
    return { ...identity, kind: 'image', images: [await canvasImage(surface, identity.id)] };
  } finally { bitmap.close(); }
}

function mediaEvent(video: HTMLVideoElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new ClonePredictionError('artifact_decode_failed', 422)); };
    const aborted = () => { cleanup(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new ClonePredictionError('artifact_decode_timeout', 408)); }, 10_000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

/** Decode a local video Blob into four timestamped frame samples. Audio and intervening frames are not reviewed. */
export async function prepareVideoArtifact(file: Blob, identity: ArtifactIdentity,
  options: { signal?: AbortSignal } = {}): Promise<ArtifactContext> {
  if (file.size > 100 * 1024 * 1024) throw new ClonePredictionError('artifact_source_too_large', 413);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  try {
    const loaded = mediaEvent(video, 'loadeddata', options.signal);
    video.src = url;
    await loaded;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
      throw new ClonePredictionError('invalid_video_duration', 422);
    }
    const surface = canvas(video.videoWidth, video.videoHeight);
    const images: ArtifactImage[] = [];
    for (const time of [0, duration / 3, duration * 2 / 3, Math.max(0, duration - .1)]) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (Math.abs(video.currentTime - time) > .001) {
        const sought = mediaEvent(video, 'seeked', options.signal);
        video.currentTime = time;
        await sought;
      }
      const timestamp = Math.round(video.currentTime * 1000) / 1000;
      if (images.length && timestamp <= images.at(-1)!.timestamp_seconds!) continue;
      surface.getContext('2d')!.drawImage(video, 0, 0, surface.width, surface.height);
      images.push(await canvasImage(surface, identity.id + '#t=' + timestamp, timestamp));
    }
    return { ...identity, kind: 'video', duration_seconds: duration, images };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
