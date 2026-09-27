import { createHash } from "node:crypto";
import sharp from "sharp";

export const MEDIA_DERIVATIVE_VARIANTS = [320, 640, 1280, 1920] as const;

export type MediaDerivative = {
  objectPath: string;
  mimeType: "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
};

export async function createImageDerivatives(bytes: Uint8Array, actorId: string, assetId: string) {
  const source = Buffer.from(bytes);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable");

  const entries = await Promise.all(MEDIA_DERIVATIVE_VARIANTS.map(async (variant) => {
    const rendered = await sharp(source)
      .autoOrient()
      .resize({ width: variant, height: variant, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const derivative: MediaDerivative = {
      objectPath: `${actorId}/${assetId}/derivatives/${variant}.webp`,
      mimeType: "image/webp",
      sizeBytes: rendered.data.byteLength,
      width: rendered.info.width,
      height: rendered.info.height,
      sha256: createHash("sha256").update(rendered.data).digest("hex")
    };
    return [String(variant), { data: rendered.data, derivative }] as const;
  }));

  return {
    buffers: new Map(entries.map(([variant, output]) => [variant, output.data] as const)),
    manifest: Object.fromEntries(entries.map(([variant, output]) => [variant, output.derivative]))
  };
}
