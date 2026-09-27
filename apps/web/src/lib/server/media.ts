import { createHash } from "node:crypto";
import { mediaAssetSchema } from "@phan/contracts";

export type MediaUploadContext = {
  id: string;
  tree_id: string;
  version: number;
  state: string;
  object_path: string;
  declared_mime: string;
  size_bytes: number;
  expected_sha256: string;
  created_by: string;
};

export function parseMediaAssetRow(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Media response was not an object");
  const value = row as Record<string, unknown>;
  return mediaAssetSchema.parse({
    id: value.id,
    version: value.version,
    state: value.state,
    mimeType: value.mime_type ?? value.mimeType,
    sizeBytes: value.size_bytes ?? value.sizeBytes,
    visibility: value.visibility,
    altText: value.alt_text ?? value.altText ?? null
  });
}

function equalsAt(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function hasAllowedMagic(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return equalsAt(bytes, 0, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return equalsAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/webp") return equalsAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && equalsAt(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
  if (mimeType === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mimeType === "audio/mpeg") {
    return new TextDecoder().decode(bytes.slice(0, 3)) === "ID3" ||
      (bytes.length > 1 && bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/mp4" || mimeType === "video/mp4") return equalsAt(bytes, 4, [0x66, 0x74, 0x79, 0x70]);
  return false;
}

export function inspectMediaBytes(bytes: Uint8Array, mimeType: string, expectedSha256: string, scan = true) {
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (!hasAllowedMagic(bytes, mimeType)) return { ok: false as const, code: "MAGIC_MISMATCH", actualSha256 };
  if (actualSha256 !== expectedSha256) return { ok: false as const, code: "CHECKSUM_MISMATCH", actualSha256 };
  if (!scan) return { ok: true as const, code: "UPLOAD_VERIFIED", actualSha256 };
  const text = new TextDecoder().decode(bytes);
  if (text.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return { ok: false as const, code: "MALWARE_SIGNATURE", actualSha256 };
  }
  return { ok: true as const, code: "SCAN_OK", actualSha256 };
}
