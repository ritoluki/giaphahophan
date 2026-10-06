import { chromium } from "playwright";
import { exportProjectionSchema, type ExportProjection } from "@phan/contracts";
import { buildExportChartPages } from "@phan/domain";
import { designTokens } from "@phan/ui";
import { ExportProcessingError } from "./export-errors";

const MAX_HTML_BYTES = 64 * 1024 * 1024;
const MAX_PDF_BYTES = 96 * 1024 * 1024;
const MAX_RENDER_TEXT_BYTES = 8 * 1024 * 1024;

export function chromiumSandboxEnabled(env: NodeJS.ProcessEnv): boolean {
  // Production/staging must retain Chromium's sandbox; only local synthetic demo work is unsandboxed.
  return !(["development", "test"].includes(env.APP_ENV ?? "") && env.DATA_MODE === "demo");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function dateDescription(value: NonNullable<ExportProjection["people"][number]["facts"][number]["valueDate"]>): string {
  const details = [value.originalText, `độ chính xác: ${value.precision}`, `lịch: ${value.calendar}`];
  if (value.isLeapMonth) details.push("tháng nhuận");
  return details.join(" · ");
}

function renderBookHtml(projection: ExportProjection): string {
  const personAnchors = new Map(projection.people.map((person, index) => [person.id, `person-${index + 1}`]));
  const peopleById = new Map(projection.people.map((person) => [person.id, person]));
  const sourcesById = new Map(projection.sources.map((source) => [source.id, source.title]));
  const citationsByTarget = new Map<string, string[]>();
  for (const citation of projection.citations) {
    const title = sourcesById.get(citation.sourceId);
    if (!title) continue;
    const key = `${citation.targetKind}:${citation.targetId}`;
    const items = citationsByTarget.get(key) ?? [];
    items.push(`<li>${escapeHtml(title)}${citation.locator ? ` — ${escapeHtml(citation.locator)}` : ""}</li>`);
    citationsByTarget.set(key, items);
  }
  const citationLine = (kind: "person" | "fact" | "parent_link" | "union", id: string) => citationsByTarget.get(`${kind}:${id}`)?.join("") ?? "";
  const linksByPerson = new Map<string, ExportProjection["parentLinks"]>();
  for (const link of projection.parentLinks) {
    for (const id of [link.parentId, link.childId]) {
      const current = linksByPerson.get(id) ?? [];
      current.push(link);
      linksByPerson.set(id, current);
    }
  }
  const unionsByPerson = new Map<string, ExportProjection["unions"]>();
  for (const union of projection.unions) {
    for (const id of [...union.partnerIds, ...union.childIds]) {
      const current = unionsByPerson.get(id) ?? [];
      current.push(union);
      unionsByPerson.set(id, current);
    }
  }
  const contents = projection.people.map((person) => `<li><a href="#${personAnchors.get(person.id)}">${escapeHtml(person.code)} · ${escapeHtml(person.displayName)}</a></li>`).join("");
  const people = projection.people.map((person, index) => {
    const facts = person.facts.map((fact) => {
      const date = fact.valueDate ? `<div class="fact-date">${escapeHtml(dateDescription(fact.valueDate))}</div>` : "";
      const value = fact.valueText ? `<div>${escapeHtml(fact.valueText)}</div>` : "";
      const cites = citationLine("fact", fact.id);
      return `<li><strong>${escapeHtml(fact.kind)}</strong>${date}${value}<div class="confidence">Mức ghi nhận: ${escapeHtml(fact.confidence)}</div>${cites ? `<ul class="citations">${cites}</ul>` : ""}</li>`;
    }).join("");
    const links = (linksByPerson.get(person.id) ?? []).map((link) => {
      const parent = peopleById.get(link.parentId)!;
      const child = peopleById.get(link.childId)!;
      const cites = citationLine("parent_link", link.id);
      return `<li>${escapeHtml(parent.code)} ${escapeHtml(parent.displayName)} → ${escapeHtml(child.code)} ${escapeHtml(child.displayName)} · ${escapeHtml(link.kind)} · ${escapeHtml(link.status)}${cites ? `<ul class="citations">${cites}</ul>` : ""}</li>`;
    }).join("");
    const unions = (unionsByPerson.get(person.id) ?? []).map((union) => {
      const ids = [...union.partnerIds, ...union.childIds];
      const participants = ids.map((id) => peopleById.get(id)!).map((item) => `${item.code} ${item.displayName}`).join("; ");
      const cites = citationLine("union", union.id);
      return `<li>${escapeHtml(union.kind)} · ${escapeHtml(union.status)} · ${escapeHtml(participants)}${cites ? `<ul class="citations">${cites}</ul>` : ""}</li>`;
    }).join("");
    const names = person.names.map((name) => `<li>${escapeHtml(name.name)} · ${escapeHtml(name.kind)}</li>`).join("");
    const personCites = citationLine("person", person.id);
    return `<article class="person" id="${personAnchors.get(person.id)}"><h2>${escapeHtml(person.displayName)}</h2><p class="code">Mã hồ sơ: ${escapeHtml(person.code)} · Phiên bản ${person.version}</p>${person.recordedSex ? `<p>Giới tính ghi nhận: ${escapeHtml(person.recordedSex)}</p>` : ""}${person.lifeStatus ? `<p>Tình trạng: ${escapeHtml(person.lifeStatus)}</p>` : ""}${names ? `<h3>Tên khác</h3><ul>${names}</ul>` : ""}${facts ? `<h3>Sự kiện và dữ kiện</h3><ul>${facts}</ul>` : ""}${links ? `<h3>Quan hệ cha mẹ – con</h3><ul>${links}</ul>` : ""}${unions ? `<h3>Nhóm quan hệ</h3><ul>${unions}</ul>` : ""}${personCites ? `<h3>Nguồn trích dẫn hồ sơ</h3><ul class="citations">${personCites}</ul>` : ""}</article>`;
  }).join("");
  const sources = projection.sources.map((source) => `<li>${escapeHtml(source.title)}</li>`).join("");
  const charts = buildExportChartPages(projection).map((item, index) => `<section class="chart-page"><h2>Phả đồ · ${escapeHtml(item.title)}</h2>${item.svg.replace("<svg ", '<svg class="chart" ')}<p class="chart-note">Trang phả đồ ${index + 1}</p></section>`).join("");
  const date = escapeHtml(projection.generatedAt);
  const scope = projection.scope.kind === "personal" ? "Phạm vi cá nhân được duyệt" : projection.scope.kind === "branch" ? "Nhánh được duyệt" : "Phạm vi cây được duyệt";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Sách gia phả</title><style>
@page{size:A4;margin:17mm 16mm 18mm;@top-left{content:"PHAN GIA PHẢ";font:8pt Arial,sans-serif;color:${designTokens.inkMuted}}@top-right{content:"TƯ LIỆU GIA ĐÌNH";font:8pt Arial,sans-serif;color:${designTokens.inkMuted}}@bottom-right{content:counter(page);font:9pt Arial,sans-serif;color:${designTokens.inkMuted}}}@page chart{size:A4 landscape;margin:10mm;@top-left{content:"PHAN GIA PHẢ · PHẢ ĐỒ";font:8pt Arial,sans-serif;color:${designTokens.inkMuted}}}*{box-sizing:border-box}body{font:10pt/1.55 "Noto Sans",Arial,sans-serif;color:${designTokens.ink}}h1,h2,h3{font-family:"Noto Serif",Georgia,serif;color:${designTokens.ink}}h1{font-size:30pt;color:${designTokens.brand}}h2{font-size:19pt;border-bottom:1px solid ${designTokens.border};padding-bottom:5mm}h3{font-size:12pt;color:${designTokens.brand};margin-bottom:2mm}.cover{height:235mm;display:flex;flex-direction:column;justify-content:center}.eyebrow,.code,.confidence,.chart-note{color:${designTokens.inkMuted}}.eyebrow{letter-spacing:.15em;color:${designTokens.accent}}.contents{break-before:page}.contents li{margin:2mm 0}.person{break-before:page}.person ul{padding-left:6mm}.person li{margin:2mm 0}.fact-date,.confidence{font-size:9pt}.citations{color:${designTokens.inkMuted};font-size:9pt}.source-list{break-before:page}.chart-page{page:chart;break-before:page;break-after:page;text-align:center}.chart-page h2{font-size:15pt;margin:0 0 4mm}.chart{width:100%;height:160mm;object-fit:contain}.chart-note{font-size:8pt}.muted{color:${designTokens.inkMuted}}.meta{border-top:1px solid ${designTokens.border};margin-top:12mm;padding-top:4mm}
</style></head><body><section class="cover"><p class="eyebrow">GIA PHẢ · GIA ĐÌNH</p><h1>Sách gia phả</h1><p>${escapeHtml(scope)}</p><p>${projection.people.length} hồ sơ · ${projection.parentLinks.length} quan hệ cha mẹ – con · ${projection.unions.length} nhóm quan hệ</p><p class="meta">Ngày biên soạn: ${date}${projection.isDemo ? " · DỮ LIỆU TỔNG HỢP" : ""}</p></section><section class="contents"><h2>Mục lục</h2><ol>${contents || "<li>Chưa có hồ sơ trong phạm vi xuất</li>"}</ol></section>${people}<section class="source-list"><h2>Nguồn tư liệu trong phạm vi xuất</h2><ul>${sources || "<li>Không có nguồn tư liệu được phép hiển thị.</li>"}</ul><p class="muted">Ngày biên soạn: ${date} · ${escapeHtml(scope)}</p></section>${charts}</body></html>`;
}

export async function renderExportBookPdf(input: unknown): Promise<Uint8Array> {
  const projection = exportProjectionSchema.parse(input);
  let textBytes = Buffer.byteLength(projection.generatedAt, "utf8");
  const addText = (value: string | null | undefined) => {
    if (value) textBytes += Buffer.byteLength(value, "utf8");
  };
  for (const person of projection.people) {
    addText(person.code); addText(person.displayName);
    for (const name of person.names) addText(name.name);
    for (const fact of person.facts) { addText(fact.valueText); addText(fact.valueDate?.originalText); }
    if (textBytes > MAX_RENDER_TEXT_BYTES) throw new ExportProcessingError("EXPORT_RENDER_LIMIT_EXCEEDED");
  }
  for (const source of projection.sources) addText(source.title);
  for (const citation of projection.citations) addText(citation.locator);
  if (textBytes > MAX_RENDER_TEXT_BYTES) throw new ExportProcessingError("EXPORT_RENDER_LIMIT_EXCEEDED");
  const html = renderBookHtml(projection);
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new ExportProcessingError("EXPORT_RENDER_LIMIT_EXCEEDED");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: chromiumSandboxEnabled(process.env) });
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/*", (route) => route.abort("blockedbyclient"));
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    await context.close();
    if (pdf.byteLength > MAX_PDF_BYTES) throw new ExportProcessingError("EXPORT_ARTIFACT_TOO_LARGE");
    return new Uint8Array(pdf);
  } catch (error: unknown) {
    if (error instanceof ExportProcessingError) throw error;
    throw new ExportProcessingError(error instanceof Error && error.message.includes("Executable doesn't exist") ? "EXPORT_RENDERER_UNAVAILABLE" : "EXPORT_RENDER_FAILED");
  } finally {
    await browser?.close();
  }
}
