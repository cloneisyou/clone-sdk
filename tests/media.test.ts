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
  it('requires a structured report bound to the original native source', async () => {
    const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    const native: CompletionRequest = { ...input, artifact: { kind: 'video', id: 'v', revision: '1', media: [{
      ref: 'native', mime_type: 'video/mp4', data: image.data, sha256, duration_seconds: 4,
    }] } };
    const receipt = [{ ref: 'native', sha256, timestamp_seconds: null }];
    await expect(verifyMediaReview(native, { ...output, media_review: receipt }))
      .rejects.toMatchObject({ code: 'native_media_review_missing' });
    const report: NonNullable<PredictionOutput['artifact_review']> = { sources: receipt,
      judgment: { decision: 'approve' }, provider: 'gemini', model: 'fixture', input_tokens: 1,
      output_tokens: 1, coverage: [], contract_sha256: 'fixture' };
    await expect(verifyMediaReview(native, { ...output, media_review: receipt, artifact_review: report })).resolves.toBeUndefined();
    native.artifact!.media![0]!.sha256 = '0'.repeat(64);
    await expect(verifyMediaReview(native, { ...output, media_review: receipt, artifact_review: report }))
      .rejects.toMatchObject({ code: 'artifact_source_changed' });
  });
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
