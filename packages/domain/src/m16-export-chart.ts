import { exportProjectionSchema, type ExportProjection } from "@phan/contracts";
import { designTokens } from "@phan/ui";

const PAGE_WIDTH = 1040;
const PAGE_HEIGHT = 740;
const INK = designTokens.ink;
const MUTED = designTokens.inkMuted;
const BRAND = designTokens.brand;
const BORDER = designTokens.border;
const PAPER = designTokens.background;
let invalidXmlCharacterReplaced = false;

export type ExportChartPage = { readonly title: string; readonly svg: string };

function xml(value: string): string {
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, () => {
    invalidXmlCharacterReplaced = true;
    return "\uFFFD";
  });
  return cleaned.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;")
    ;
}

function safeSlice(value: string, maximum: number): string { return Array.from(value).slice(0, maximum).join(""); }

function text(x: number, y: number, value: string, size = 15, color: string = INK, weight = 400): string {
  return `<text x="${x}" y="${y}" font-family="Noto Sans, Arial, sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`;
}

function page(title: string, pageNumber: number, body: string): ExportChartPage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" role="img" aria-label="${xml(title)}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}"><rect width="100%" height="100%" fill="${PAPER}"/><rect x="24" y="24" width="992" height="692" rx="8" fill="#fff" stroke="${BORDER}"/><path d="M48 112H992" stroke="${BORDER}"/><text x="48" y="62" font-family="Noto Serif, Georgia, serif" font-size="13" fill="${BRAND}" letter-spacing="2">PHAN GIA PHẢ · PHẢ ĐỒ</text>${text(48, 94, title, 23, INK, 600)}${body}${text(48, 690, "Tư liệu theo phạm vi đã được cấp quyền · Không suy diễn giới tính hoặc quan hệ", 11, MUTED)}<text x="990" y="690" text-anchor="end" font-family="Noto Sans, Arial, sans-serif" font-size="12" fill="${MUTED}">${pageNumber}</text></svg>`;
  return { title, svg };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

function dateLabel(person: ExportProjection["people"][number], kind: "birth" | "death"): string {
  return person.facts.filter((fact) => fact.kind === kind && fact.valueDate)
    .map((fact) => fact.valueDate!.originalText).join(" · ");
}

export function buildExportChartPages(input: unknown): readonly ExportChartPage[] {
  invalidXmlCharacterReplaced = false;
  const projection = exportProjectionSchema.parse(input);
  const people = [...projection.people].sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const pages: ExportChartPage[] = [];

  for (const [index, batch] of chunks(people, 28).entries()) {
    const body = batch.map((person, row) => {
      const column = row % 2;
      const line = Math.floor(row / 2);
      const x = 48 + column * 480;
      const y = 132 + line * 37;
      const birth = dateLabel(person, "birth");
      const death = dateLabel(person, "death");
      const dates = [birth && `Sinh: ${birth}`, death && `Mất: ${death}`].filter(Boolean).join(" · ");
      return `<rect x="${x}" y="${y}" width="448" height="31" rx="4" fill="#fff" stroke="${BORDER}"/><rect x="${x}" y="${y}" width="5" height="31" rx="2" fill="${BRAND}"/>${text(x + 14, y + 20, person.code, 12, BRAND, 600)}${text(x + 103, y + 20, safeSlice(person.displayName, 40), 13, INK, 500)}${dates ? text(x + 14, y + 30, safeSlice(dates, 90), 7, MUTED) : ""}`;
    }).join("");
    pages.push(page(`Danh mục nhân vật · ${index + 1}`, pages.length + 1, body || text(48, 160, "Chưa có hồ sơ trong phạm vi xuất.")));
  }

  const sortedLinks = [...projection.parentLinks].sort((a, b) => a.parentId.localeCompare(b.parentId) || a.childId.localeCompare(b.childId) || a.id.localeCompare(b.id));
  for (const [index, batch] of chunks(sortedLinks, 12).entries()) {
    const body = batch.map((link, row) => {
      const y = 150 + row * 40;
      const parent = peopleById.get(link.parentId)!;
      const child = peopleById.get(link.childId)!;
      const kind = `${link.kind} · ${link.status}`;
      return `<rect x="48" y="${y}" width="302" height="30" rx="4" fill="#fff" stroke="${BORDER}"/>${text(60, y + 20, `${parent.code} · ${parent.displayName.slice(0, 23)}`, 12, INK, 500)}<path d="M356 ${y + 15}H670" stroke="${BRAND}" stroke-width="2" marker-end="url(#arrow)"/>${text(423, y + 11, kind, 9, BRAND, 600)}<rect x="676" y="${y}" width="316" height="30" rx="4" fill="#fff" stroke="${BORDER}"/>${text(688, y + 20, `${child.code} · ${child.displayName.slice(0, 24)}`, 12, INK, 500)}`;
    }).join("");
    const titledBody = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="${BRAND}"/></marker></defs>${body}`;
    pages.push(page(`Quan hệ cha mẹ – con · ${index + 1}`, pages.length + 1, titledBody || text(48, 160, "Chưa có quan hệ cha mẹ – con trong phạm vi xuất.")));
  }

  const unions = [...projection.unions].sort((a, b) => a.id.localeCompare(b.id));
  for (const [index, batch] of chunks(unions, 12).entries()) {
    const body = batch.map((union, row) => {
      const y = 145 + row * 43;
      const partners = union.partnerIds.map((id) => peopleById.get(id)!.code).join(" · ") || "Không ghi nhận người tham gia";
      const children = union.childIds.map((id) => peopleById.get(id)!.code).join(" · ") || "Không ghi nhận con";
      return `<rect x="48" y="${y}" width="944" height="35" rx="4" fill="#fff" stroke="${BORDER}"/>${text(60, y + 14, `${union.kind} · ${union.status}`, 10, BRAND, 600)}${text(240, y + 14, `Người tham gia: ${partners}`.slice(0, 108), 11, INK)}${text(240, y + 29, `Con được ghi nhận: ${children}`.slice(0, 108), 10, MUTED)}`;
    }).join("");
    pages.push(page(`Nhóm quan hệ · ${index + 1}`, pages.length + 1, body || text(48, 160, "Chưa có nhóm quan hệ trong phạm vi xuất.")));
  }

  if (pages.length === 0) pages.push(page("Phả đồ", 1, text(48, 160, "Chưa có hồ sơ trong phạm vi xuất.")));
  return pages;
}

export function serializeExportSvgChart(input: unknown): {
  readonly content: string;
  readonly warnings: readonly string[];
} {
  const pages = buildExportChartPages(input);
  const width = PAGE_WIDTH * 2 + 48;
  const rows = Math.ceil(pages.length / 2);
  const height = rows * PAGE_HEIGHT + 24;
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Phả đồ gia đình gồm ${pages.length} trang">${pages.map((item, index) => {
    const x = 16 + (index % 2) * (PAGE_WIDTH + 16);
    const y = 12 + Math.floor(index / 2) * PAGE_HEIGHT;
    return `<svg x="${x}" y="${y}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">${item.svg.slice(item.svg.indexOf("><") + 1, item.svg.lastIndexOf("</svg>"))}</svg>`;
  }).join("")}</svg>`;
  return { content, warnings: ["svg_is_paginated_two_sheets_per_row", "relationship_kind_and_status_are_explicit_not_inferred", ...(invalidXmlCharacterReplaced ? ["svg_invalid_xml_controls_replaced_with_unicode_replacement_character"] : [])] };
}
