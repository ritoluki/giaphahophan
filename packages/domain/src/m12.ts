import {
  richTextDocumentSchema,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextInline,
} from "@phan/contracts";

const MAX_BLOCKS = 200;
const MAX_INLINE_CHILDREN = 100;
const MAX_LIST_ITEMS = 50;
const MAX_NODES = 500;
const MAX_TEXT = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type RichTextSanitizationResult = {
  readonly document: RichTextDocument;
  readonly warnings: readonly string[];
};

type SanitizerState = {
  nodeCount: number;
  textCount: number;
  readonly warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addWarning(state: SanitizerState, code: string): void {
  if (!state.warnings.includes(code)) state.warnings.push(code);
}

function consumeNode(state: SanitizerState): boolean {
  state.nodeCount += 1;
  if (state.nodeCount <= MAX_NODES) return true;
  addWarning(state, "node_limit_exceeded");
  return false;
}

function cleanText(value: unknown, state: SanitizerState, maxLength: number): string | null {
  if (typeof value !== "string") {
    addWarning(state, "text_not_string");
    return null;
  }
  const cleaned = value.replace(CONTROL_CHARACTERS, "");
  if (cleaned.length === 0 || cleaned.length > maxLength || state.textCount + cleaned.length > MAX_TEXT) {
    addWarning(state, cleaned.length > maxLength || state.textCount + cleaned.length > MAX_TEXT ? "text_limit_exceeded" : "empty_text");
    return null;
  }
  state.textCount += cleaned.length;
  return cleaned;
}

function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href.length === 0 || href.length > 2_048 || /[\u0000-\u001F\u007F\s<>]/.test(href)) return null;
  if (href === "/" || (href.startsWith("/") && !href.startsWith("//"))) return href;
  try {
    const url = new URL(href);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function inlineChildren(value: unknown, state: SanitizerState): RichTextInline[] {
  if (!Array.isArray(value)) {
    addWarning(state, "children_not_array");
    return [];
  }
  return value.slice(0, MAX_INLINE_CHILDREN).flatMap((entry) => {
    const inline = sanitizeInline(entry, state);
    return inline === null ? [] : [inline];
  });
}

function sanitizeInline(value: unknown, state: SanitizerState): RichTextInline | null {
  if (!consumeNode(state) || !isRecord(value) || typeof value.type !== "string") {
    addWarning(state, "unsupported_inline");
    return null;
  }

  if (value.type === "text" || value.type === "strong" || value.type === "emphasis") {
    const text = cleanText(value.text, state, 10_000);
    if (text === null) return null;
    return { type: value.type, text } as RichTextInline;
  }

  if (value.type === "link") {
    const label = cleanText(value.label, state, 10_000);
    const href = safeHref(value.href);
    if (label === null) return null;
    if (href === null) {
      addWarning(state, "unsafe_link_removed");
      return { type: "text", text: label };
    }
    return { type: "link", href, label };
  }

  addWarning(state, "unsupported_inline");
  return null;
}

function sanitizeBlock(value: unknown, state: SanitizerState): RichTextBlock | null {
  if (!consumeNode(state) || !isRecord(value) || typeof value.type !== "string") {
    addWarning(state, "unsupported_block");
    return null;
  }

  if (value.type === "paragraph") {
    return { type: "paragraph", children: inlineChildren(value.children, state) };
  }

  if (value.type === "heading") {
    const level = value.level === 2 || value.level === 3 ? value.level : null;
    const children = inlineChildren(value.children, state);
    if (level === null) {
      addWarning(state, "invalid_heading_level");
      return null;
    }
    return { type: "heading", level, children };
  }

  if (value.type === "list") {
    if (typeof value.ordered !== "boolean" || !Array.isArray(value.items)) {
      addWarning(state, "invalid_list");
      return null;
    }
    const items = value.items.slice(0, MAX_LIST_ITEMS).flatMap((entry) => {
      if (!isRecord(entry) || entry.type !== "list_item") {
        addWarning(state, "invalid_list_item");
        return [];
      }
      const children = inlineChildren(entry.children, state);
      return [{ type: "list_item" as const, children }];
    });
    return { type: "list", ordered: value.ordered, items };
  }

  if (value.type === "quote") {
    return { type: "quote", children: inlineChildren(value.children, state) };
  }

  if (value.type === "divider") return { type: "divider" };

  if (value.type === "image") {
    if (typeof value.assetId !== "string" || !UUID_PATTERN.test(value.assetId)) {
      addWarning(state, "invalid_media_asset");
      return null;
    }
    const alt = cleanText(value.alt, state, 300);
    if (alt === null) {
      addWarning(state, "invalid_media_alt");
      return null;
    }
    const caption = value.caption === undefined ? undefined : cleanText(value.caption, state, 1_000);
    return caption === undefined
      ? { type: "image", assetId: value.assetId, alt }
      : { type: "image", assetId: value.assetId, alt, caption: caption ?? "" };
  }

  addWarning(state, "unsupported_block");
  return null;
}

export function sanitizeRichTextDocument(input: unknown): RichTextSanitizationResult {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.blocks)) {
    throw new RangeError("rich_text_document_invalid");
  }

  const state: SanitizerState = { nodeCount: 0, textCount: 0, warnings: [] };
  const blocks = input.blocks.slice(0, MAX_BLOCKS).flatMap((entry) => {
    const block = sanitizeBlock(entry, state);
    return block === null ? [] : [block];
  });
  if (input.blocks.length > MAX_BLOCKS) addWarning(state, "block_limit_exceeded");

  const document = richTextDocumentSchema.parse({ version: 1, blocks });
  return { document, warnings: state.warnings };
}

export function sanitizeRichTextForStorage(input: unknown): RichTextDocument {
  return sanitizeRichTextDocument(input).document;
}
