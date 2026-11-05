import { test, expect } from "bun:test";
import sharp from "sharp";
import { resizedIcon } from "../src/lib/platform-branding-assets.server";

const uploadedLogo = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><rect width="320" height="90" fill="#ffffff"/><path d="M50 25L75 65L100 25" stroke="#C77435" fill="none" stroke-width="8"/></svg>'
);

test("the exact same uploaded logo creates valid 192 and 512 PNG icons", async () => {
  const icon192 = await resizedIcon(uploadedLogo, 192);
  const icon512 = await resizedIcon(uploadedLogo, 512);
  const m192 = await sharp(icon192).metadata();
  const m512 = await sharp(icon512).metadata();
  expect(m192.format).toBe("png");
  expect(m512.format).toBe("png");
  expect([m192.width, m192.height]).toEqual([192, 192]);
  expect([m512.width, m512.height]).toEqual([512, 512]);
});

test("repeated requests reuse cached results without changing image dimensions", async () => {
  const first = await resizedIcon(uploadedLogo, 192);
  const repeated = await resizedIcon(uploadedLogo, 192);
  expect(Buffer.from(repeated).equals(Buffer.from(first))).toBe(true);
});

test("untrusted oversized image dimensions are rejected", async () => {
  const oversized = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="50000" height="50000"><rect width="50000" height="50000"/></svg>'
  );
  await expect(resizedIcon(oversized, 192)).rejects.toThrow();
});
