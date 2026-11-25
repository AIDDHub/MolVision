import test from "node:test";
import assert from "node:assert/strict";
import { addPngDpi, crc32, EXPORT_DPI } from "../webapp/png.js";

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  )
);

test("crc32 known value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("addPngDpi inserts pHYs chunk", () => {
  const output = addPngDpi(ONE_PIXEL_PNG, EXPORT_DPI);
  const text = new TextDecoder("latin1").decode(output);
  assert.ok(text.includes("pHYs"));
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const ihdrLength = view.getUint32(8);
  const chunkStart = 8 + 4 + 4 + ihdrLength + 4;
  const chunkLength = view.getUint32(chunkStart);
  assert.equal(chunkLength, 9);
  assert.equal(view.getUint32(chunkStart + 8), Math.round(EXPORT_DPI / 0.0254));
});

test("non-PNG input is returned unchanged", () => {
  const input = new Uint8Array([1, 2, 3]);
  assert.deepEqual([...addPngDpi(input)], [1, 2, 3]);
});
