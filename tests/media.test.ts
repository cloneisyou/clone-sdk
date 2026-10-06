import { describe, expect, it } from 'vitest';
import { artifactImage, verifyMediaReview } from '../src/media.js';
import { CloneClient } from '../src/server.js';
import { createPredictionTransport } from '../src/transport.js';
import type { CompletionRequest, PredictionOutput } from '../src/types.js';

const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const image = artifactImage(bytes, 'image/png', 'frame');
const input: CompletionRequest = { request_id: 'r', session_id: 's', context_revision: '1',
  mode: 'next_prompt', draft: { text: '', revision: 0 },
  artifact: { kind: 'image', id: 'image', revision: '1', images: [image] } };
const output = { status: 'suggested' } as PredictionOutput;

describe('artifact pixel acknowledgement', () => {
  it('requires the exact pixel hash, reference, order and timestamp', async () => {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Buffer.from(hash).toString('hex');
    await expect(verifyMediaReview(input, { ...output,
      media_review: [{ ref: 'frame', sha256, timestamp_seconds: null }] })).resolves.toBeUndefined();
    for (const receipt of [[], [{ ref: 'other', sha256 }], [{ ref: 'frame', sha256: 'changed' }],
      [{ ref: 'frame', sha256, timestamp_seconds: 1 }]]) {
      await expect(verifyMediaReview(input, { ...output, media_review: receipt }))
        .rejects.toMatchObject({ code: 'media_review_not_acknowledged' });
    }
  });
  it('rejects unsupported, mislabeled and oversized bytes before upload', () => {
    expect(() => artifactImage(bytes, 'image/jpeg', 'wrong')).toThrow('invalid_artifact_image');
    expect(() => artifactImage(new Uint8Array(480_001), 'image/png', 'large')).toThrow();
  });
  it('rejects old servers in both browser and server transports', async () => {
    const fetch = async () => Response.json(output);
    const client = new CloneClient({ apiKey: 'clnp_fixture', baseUrl: 'https://example.com', fetch });
    await expect(client.predict('owner', input)).rejects.toMatchObject({ code: 'media_review_not_acknowledged' });
    await expect(createPredictionTransport('/predictions', { fetch })(input, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'media_review_not_acknowledged' });
  });
});
