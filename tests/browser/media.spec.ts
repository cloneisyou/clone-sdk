import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { syntheticVideo } from './media-fixture.js';

test('decodes image pixels and video samples from local Blobs without uploading raw files', async ({ page }) => {
  await page.goto('/?fixture=1');
  const result = await page.evaluate(async ({ encoded, modulePath }) => {
    const { prepareImageArtifact, prepareVideoArtifact } = await import(modulePath);
    const source = document.createElement('canvas');
    source.width = 160; source.height = 90;
    source.getContext('2d')!.fillStyle = 'blue';
    source.getContext('2d')!.fillRect(0, 0, 160, 90);
    const blob = await new Promise<Blob>(resolve => source.toBlob(value => resolve(value!), 'image/png'));
    const image = await prepareImageArtifact(blob, { id: 'image', revision: '1' });
    const videoBytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const video = await prepareVideoArtifact(new Blob([videoBytes], { type: 'video/mp4' }), { id: 'video', revision: '1' });
    return { image, video };
  }, { encoded: syntheticVideo, modulePath: '/@fs' + resolve('src/media.ts') });
  expect(result.image.kind).toBe('image');
  expect(result.image.images).toHaveLength(1);
  expect(result.image.images[0].mime_type).toBe('image/jpeg');
  expect(result.video.kind).toBe('video');
  expect(result.video.images).toHaveLength(4);
  expect(result.video.images[0].timestamp_seconds).toBe(0);
  expect(result.video.images.at(-1).timestamp_seconds).toBeGreaterThanOrEqual(3.8);
  expect(result.video.images[0].data).not.toBe(result.video.images.at(-1).data);
  expect(result.video.duration_seconds).toBeCloseTo(4, 1);
});
