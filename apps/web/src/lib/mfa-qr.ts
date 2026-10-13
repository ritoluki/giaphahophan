/** Normalize the SDK's SVG data URI or a raw SVG without double-wrapping it. */
export function mfaQrImageSource(value: string): string {
  let svg = value.trim();
  const uri = /^data:image\/svg\+xml;(?:utf-?8|charset=utf-8),([\s\S]*)$/i.exec(svg);
  if (uri) {
    svg = uri[1]!;
    if (!svg.trimStart().startsWith("<")) {
      try { svg = decodeURIComponent(svg); } catch { throw new Error("Mã QR chưa hợp lệ. Hãy tạo mã mới."); }
    }
  }
  const root = svg.replace(/^\s*(?:(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE\s+svg\s[^>]*>)\s*)*/i, "");
  if (!/^<svg(?:\s|>)/i.test(root)) throw new Error("Mã QR chưa hợp lệ. Hãy tạo mã mới.");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
