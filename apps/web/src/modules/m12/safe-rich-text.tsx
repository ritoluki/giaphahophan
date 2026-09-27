import Image from "next/image";
import type { RichTextBlock, RichTextDocument, RichTextInline } from "@phan/contracts";

export type RichTextMedia = {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
};

function renderInline(inline: RichTextInline, key: string) {
  if (inline.type === "text") return <span key={key}>{inline.text}</span>;
  if (inline.type === "strong") return <strong key={key}>{inline.text}</strong>;
  if (inline.type === "emphasis") return <em key={key}>{inline.text}</em>;
  const external = /^https?:\/\//i.test(inline.href);
  return <a key={key} href={inline.href} rel={external ? "noreferrer noopener" : undefined}>{inline.label}</a>;
}

function renderChildren(children: readonly RichTextInline[]) {
  return children.map((inline, index) => renderInline(inline, String(index)));
}

function renderBlock(block: RichTextBlock, index: number, media: Readonly<Record<string, RichTextMedia>>) {
  const key = String(index);
  if (block.type === "paragraph") return <p key={key}>{renderChildren(block.children)}</p>;
  if (block.type === "heading") {
    return block.level === 2
      ? <h2 key={key}>{renderChildren(block.children)}</h2>
      : <h3 key={key}>{renderChildren(block.children)}</h3>;
  }
  if (block.type === "quote") return <blockquote key={key}>{renderChildren(block.children)}</blockquote>;
  if (block.type === "divider") return <hr key={key} />;
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return <List key={key}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderChildren(item.children)}</li>)}</List>;
  }

  const image = media[block.assetId];
  return (
    <figure className="safe-rich-text-media" key={key}>
      {image ? <Image src={image.src} alt={block.alt} width={image.width ?? 1200} height={image.height ?? 800} unoptimized /> : <div className="safe-rich-text-media-placeholder" role="img" aria-label={block.alt}>Tư liệu được giới hạn</div>}
      {block.caption ? <figcaption>{block.caption}</figcaption> : null}
    </figure>
  );
}

export function SafeRichText({ document, media = {} }: { document: RichTextDocument; media?: Readonly<Record<string, RichTextMedia>> }) {
  if (document.blocks.length === 0) return <p className="safe-rich-text-empty">Chưa có nội dung đã được duyệt.</p>;
  return <article className="safe-rich-text">{document.blocks.map((block, index) => renderBlock(block, index, media))}</article>;
}
