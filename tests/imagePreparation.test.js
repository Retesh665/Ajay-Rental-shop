import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImageForUpload, UPLOAD_TARGET_BYTES} from '../src/lib/imagePreparation.js';
test('small supported images are passed through unchanged', async () => {
  const file = { type: 'image/jpeg', size: 2000 };
  assert.equal(await prepareImageForUpload(file), file);
});
test('source images are not rejected by an arbitrary 4MB input cap', async () => {
  assert.equal(UPLOAD_TARGET_BYTES < 4_000_000, true);
  await assert.rejects(() => prepareImageForUpload({type:'image/jpeg',size:8_000_000}), /browser cannot prepare/i);
});
test('rejects non-image content', async () => {
  await assert.rejects(() => prepareImageForUpload({type:'application/pdf',size:500}), /Choose an image/);
});
