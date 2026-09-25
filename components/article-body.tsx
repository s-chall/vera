import type { ReactNode } from "react";
import { parseBlock, type Inline } from "@/lib/article-body";

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    const children = renderInline(node.children);
    if (node.type === "a") {
      if (!node.href) return <span key={index}>{children}</span>;
      // A reader following a link should not tell the destination they came from Vera.
      return (
        <a key={index} href={node.href} target="_blank" rel="noopener noreferrer nofollow ugc" referrerPolicy="no-referrer">
          {children}
        </a>
      );
    }
    if (node.type === "b") return <strong key={index}>{children}</strong>;
    if (node.type === "i") return <em key={index}>{children}</em>;
    if (node.type === "s") return <s key={index}>{children}</s>;
    if (node.type === "sup") return <sup key={index}>{children}</sup>;
    return <sub key={index}>{children}</sub>;
  });
}

/** Renders stored blocks; see lib/article-body.ts for the format. */
export function ArticleBody({ blocks }: { blocks: string[] }) {
  return (
    <>
      {blocks.map((raw, index) => {
        const block = parseBlock(raw);
        if (block.type === "hr") return <hr key={index} />;
        const children = renderInline(block.children);
        if (block.type === "quote") return <blockquote key={index}>{children}</blockquote>;
        if (block.type === "h2") return <h2 key={index}>{children}</h2>;
        return <p key={index}>{children}</p>;
      })}
    </>
  );
}
