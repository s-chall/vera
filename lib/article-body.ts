/**
 * Article bodies are stored as text[], one entry per block:
 *
 *   "> …"    pull quote
 *   "## …"   section heading
 *   "---"    divider
 *   anything else is a paragraph
 *
 * Inside a block, inline formatting is a deliberately tiny tag language:
 * <b>, <i>, <s>, <sup>, <sub> and <a href="https://…">, with &amp; &lt; &gt;
 * &quot; and &#NN; for literal characters. Strikethrough and super/subscript
 * are there because flattening them changes facts: 10<sup>6</sup> is not 106. It is parsed into a tree and rendered as
 * React elements, never handed to innerHTML, so anything else in a stored body,
 * including markup written straight to the API, shows as the text it is.
 *
 * The seeded articles predate the inline tags and are plain text with "> "
 * quotes, which this reads unchanged.
 *
 * No imports, so the Node test runner can load this file directly.
 */

export type MarkTag = "b" | "i" | "s" | "sup" | "sub";

export type Inline =
  | { type: "text"; text: string }
  | { type: MarkTag; children: Inline[] }
  | { type: "a"; href: string | null; children: Inline[] };

export type Block =
  | { type: "p" | "quote" | "h2"; children: Inline[] }
  | { type: "hr" };

/** Only http and https survive, normalised. Everything else is dropped. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ parsing

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const TOKEN = /<(b|i|s|sup|sub)>|<\/(b|i|s|sup|sub|a)>|<a href="([^"<>]*)">|&(amp|lt|gt|quot|#\d{1,7}|#x[0-9a-f]{1,6});/gi;
const MAX_DEPTH = 8;

function decodeEntity(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower in NAMED) return NAMED[lower];
  const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : lower.startsWith("#") ? parseInt(lower.slice(1), 10) : NaN;
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}

function decodeAttribute(value: string) {
  return value.replace(/&(amp|lt|gt|quot|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (whole, name: string) => decodeEntity(name) ?? whole);
}

type Frame = { tag: "root" | MarkTag | "a"; children: Inline[] };

function pushText(children: Inline[], text: string) {
  if (!text) return;
  const last = children[children.length - 1];
  if (last && last.type === "text") last.text += text;
  else children.push({ type: "text", text });
}

/** Parses one block's inline markup. Anything unrecognised is literal text. */
export function parseInline(source: string): Inline[] {
  const root: Frame = { tag: "root", children: [] };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1];
  let cursor = 0;

  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    pushText(top().children, source.slice(cursor, index));
    cursor = index + match[0].length;

    const [whole, open, close, href, entity] = match;
    if (entity) {
      pushText(top().children, decodeEntity(entity) ?? whole);
    } else if (open || href !== undefined) {
      if (stack.length > MAX_DEPTH) {
        pushText(top().children, whole);
        continue;
      }
      const tag = (open ? open.toLowerCase() : "a") as MarkTag | "a";
      const children: Inline[] = [];
      top().children.push(tag === "a"
        ? { type: "a", href: safeHref(decodeAttribute(href ?? "")), children }
        : { type: tag, children });
      stack.push({ tag, children });
    } else if (close) {
      const tag = close.toLowerCase();
      const depth = stack.map((frame) => frame.tag).lastIndexOf(tag as Frame["tag"]);
      // a closing tag with nothing to close is just text
      if (depth <= 0) pushText(top().children, whole);
      else stack.length = depth;
    }
  }
  pushText(top().children, source.slice(cursor));
  return prune(root.children);
}

/** Drops formatting that wraps nothing, so "<b></b>" leaves no trace. */
function prune(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      pushText(out, node.text);
      continue;
    }
    const children = prune(node.children);
    if (children.length) out.push({ ...node, children });
  }
  return out;
}

export function parseBlock(raw: string): Block {
  // The table refuses NULL blocks; this is for anything older than that rule.
  const line = typeof raw === "string" ? raw.trim() : "";
  if (line === "---") return { type: "hr" };
  if (line.startsWith(">")) return { type: "quote", children: parseInline(line.replace(/^>\s*/, "")) };
  if (line.startsWith("## ")) return { type: "h2", children: parseInline(line.slice(3).trim()) };
  return { type: "p", children: parseInline(line) };
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((node) => (node.type === "text" ? node.text : inlineText(node.children))).join("");
}

export function blockText(raw: string): string {
  const block = parseBlock(raw);
  return block.type === "hr" ? "" : inlineText(block.children);
}

/**
 * A standfirst for an article filed without one: the opening prose, cut at a
 * word boundary. Headings and dividers are skipped.
 */
export function summarize(blocks: string[], max = 280): string {
  const first = blocks.map(parseBlock).find((block) => block.type === "p" || block.type === "quote");
  if (!first || first.type === "hr") return "";
  const text = inlineText(first.children).replace(/\s+/g, " ").trim();
  // by code point, so an emoji or astral character is never cut in half
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > cut.length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Plain text, as pasted: one paragraph per non-blank line. */
export function plainTextToBlocks(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
    .map((line) => line.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => serializeBlock({ type: "p", children: [{ type: "text", text: line }] }));
}

// -------------------------------------------------------------- serializing

const escapeText = (text: string) => text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
const escapeAttribute = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function serializeInline(nodes: Inline[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return escapeText(node.text);
    const inner = serializeInline(node.children);
    if (node.type === "a") return node.href ? `<a href="${escapeAttribute(node.href)}">${inner}</a>` : inner;
    return `<${node.type}>${inner}</${node.type}>`;
  }).join("");
}

export function serializeBlock(block: Block): string {
  if (block.type === "hr") return "---";
  const inner = serializeInline(block.children);
  if (block.type === "quote") return `> ${inner}`;
  if (block.type === "h2") return `## ${inner}`;
  // A paragraph must not read back as something else. A literal ">" is already
  // escaped by escapeText; these are the other two block prefixes.
  if (inner.startsWith("## ") || inner === "##") return `&#35;${inner.slice(1)}`;
  if (inner === "---") return "&#45;--";
  return inner;
}

// ------------------------------------------------ the editor's contentEditable

type Marks = { b: boolean; i: boolean; s: boolean; sup: boolean; sub: boolean; href: string | null };
type Run = Marks & { text: string };

const PLAIN: Marks = { b: false, i: false, s: false, sup: false, sub: false, href: null };
const MARK_ORDER: MarkTag[] = ["b", "i", "s", "sup", "sub"];

const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "IMG", "PICTURE", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED",
  "SVG", "CANVAS", "NOSCRIPT", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "META", "LINK", "HEAD", "TITLE"]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const CONTAINERS = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE", "NAV", "FIGURE",
  "FIGCAPTION", "ADDRESS", "PRE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION", "DL", "DT", "DD",
  "UL", "OL", "CENTER", "DETAILS", "SUMMARY", "BODY", "HTML"]);

/**
 * Content the author cannot see must not be published: a pasted span with
 * display:none can hold a source's name. Only inline styles and attributes are
 * checked, because pastes are parsed into an inert document with no layout.
 */
function isHidden(element: Element) {
  if (element.hasAttribute("hidden")) return true;
  const style = (element as HTMLElement).style;
  if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) return true;
  return /mso-hide\s*:\s*all/i.test(element.getAttribute("style") || "");
}

/** The number a list item shows, honouring <ol start> and <li value>. */
function listNumber(list: Element, item: Element) {
  let next = Number.parseInt(list.getAttribute("start") || "1", 10);
  if (!Number.isFinite(next)) next = 1;
  for (const sibling of Array.from(list.children)) {
    if (sibling.tagName.toUpperCase() !== "LI") continue;
    const value = Number.parseInt(sibling.getAttribute("value") || "", 10);
    if (Number.isFinite(value)) next = value;
    if (sibling === item) return next;
    next += 1;
  }
  return next;
}

/** Groups flat styled runs back into a tree: link outermost, then each mark in order. */
function runsToInline(runs: Run[]): Inline[] {
  const group = <K extends keyof Marks>(items: Run[], key: K, build: (value: Marks[K], inner: Run[]) => Inline[]) => {
    const out: Inline[] = [];
    let start = 0;
    for (let index = 1; index <= items.length; index += 1) {
      if (index === items.length || items[index][key] !== items[start][key]) {
        out.push(...build(items[start][key], items.slice(start, index)));
        start = index;
      }
    }
    return out;
  };
  const nest = (items: Run[], depth: number): Inline[] => {
    if (depth === MARK_ORDER.length) return [{ type: "text", text: items.map((run) => run.text).join("") }];
    const mark = MARK_ORDER[depth];
    return group(items, mark, (on, inner) => (on ? [{ type: mark, children: nest(inner, depth + 1) }] : nest(inner, depth + 1)));
  };
  return group(runs, "href", (href, inner) => (href ? [{ type: "a", href, children: nest(inner, 0) }] : nest(inner, 0)));
}

/**
 * Reads the editor's DOM, or a pasted document, into stored blocks.
 * contentEditable output varies by browser and by whatever was pasted, so this
 * accepts any tree and keeps only what the format can say. A line break ends a
 * paragraph, and so does a newline inside preformatted text.
 */
export function editorToBlocks(root: Node): string[] {
  const blocks: Block[] = [];
  let runs: Run[] = [];
  // a list marker waits for the item's first text, which may sit inside a <p>
  let listPrefix: string | null = null;

  const flush = (type: "p" | "quote" | "h2") => {
    const cleaned: Run[] = [];
    for (const run of runs) {
      let text = run.text.replace(/[\s ]+/g, " ");
      const previous = cleaned[cleaned.length - 1];
      if (text.startsWith(" ") && (!previous || previous.text.endsWith(" "))) text = text.slice(1);
      if (text) cleaned.push({ ...run, text });
    }
    const last = cleaned[cleaned.length - 1];
    if (last) last.text = last.text.replace(/ $/, "");
    runs = [];
    const children = prune(runsToInline(cleaned.filter((run) => run.text)));
    if (!inlineText(children).trim()) return;
    if (listPrefix) {
      children.unshift({ type: "text", text: listPrefix });
      listPrefix = null;
    }
    blocks.push({ type, children: prune(children) });
  };

  const walk = (node: Node, type: "p" | "quote" | "h2", marks: Marks, pre: boolean) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? "";
      if (!pre) {
        runs.push({ ...marks, text });
        return;
      }
      text.split(/\r\n|\r|\n/).forEach((line, index) => {
        if (index > 0) flush(type);
        runs.push({ ...marks, text: line });
      });
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    const element = node as Element;
    const tag = node.nodeType === 11 ? "DIV" : element.tagName.toUpperCase();
    if (SKIP.has(tag) || (node.nodeType === 1 && isHidden(element))) return;

    const style = node.nodeType === 1 ? (element as HTMLElement).style : undefined;
    const whiteSpace = style?.whiteSpace ?? "";
    const keepLines = pre || tag === "PRE" || whiteSpace.startsWith("pre") || whiteSpace === "break-spaces";
    const children = (inner: "p" | "quote" | "h2" = type, innerMarks: Marks = marks) =>
      node.childNodes.forEach((child) => walk(child, inner, innerMarks, keepLines));

    if (tag === "BR") return flush(type);
    if (tag === "HR") {
      flush(type);
      blocks.push({ type: "hr" });
      return;
    }
    if (HEADINGS.has(tag) || tag === "BLOCKQUOTE") {
      flush(type);
      const inner = tag === "BLOCKQUOTE" || type === "quote" ? "quote" : "h2";
      children(inner);
      return flush(inner);
    }
    if (tag === "LI") {
      flush(type);
      const list = element.parentElement;
      listPrefix = list?.tagName.toUpperCase() === "OL" ? `${listNumber(list, element)}. ` : "• ";
      children();
      flush(type);
      listPrefix = null;
      return;
    }
    if (CONTAINERS.has(tag)) {
      flush(type);
      children();
      return flush(type);
    }

    // inline: carry formatting down
    const next = { ...marks };
    if (tag === "B" || tag === "STRONG") next.b = true;
    if (tag === "I" || tag === "EM") next.i = true;
    if (tag === "S" || tag === "DEL" || tag === "STRIKE") next.s = true;
    if (tag === "SUP") next.sup = true;
    if (tag === "SUB") next.sub = true;
    if (tag === "A") next.href = safeHref(element.getAttribute("href")) ?? marks.href;
    if (style) {
      // Google Docs wraps a whole paste in <b style="font-weight:normal">
      const weight = style.fontWeight;
      if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) next.b = true;
      else if (weight === "normal" || weight === "lighter" || (Number(weight) > 0 && Number(weight) < 600)) next.b = false;
      if (style.fontStyle === "italic" || style.fontStyle === "oblique") next.i = true;
      else if (style.fontStyle === "normal") next.i = false;
      if (`${style.textDecoration} ${style.textDecorationLine}`.includes("line-through")) next.s = true;
      if (style.verticalAlign === "super") next.sup = true;
      if (style.verticalAlign === "sub") next.sub = true;
    }
    children(type, next);
  };

  walk(root, "p", PLAIN, false);
  flush("p");
  return blocks.map(serializeBlock);
}

/**
 * The reverse, for restoring a saved draft into the editor. Built from DOM
 * nodes rather than an HTML string, so a stored draft cannot inject markup.
 */
export function blocksToEditor(blocks: string[], doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const inline = (parent: Node, nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        parent.appendChild(doc.createTextNode(node.text));
        continue;
      }
      if (node.type === "a" && !node.href) {
        inline(parent, node.children);
        continue;
      }
      const element = doc.createElement(node.type);
      if (node.type === "a" && node.href) element.setAttribute("href", node.href);
      inline(element, node.children);
      parent.appendChild(element);
    }
  };
  for (const raw of blocks) {
    const block = parseBlock(raw);
    if (block.type === "hr") {
      fragment.appendChild(doc.createElement("hr"));
      continue;
    }
    const element = doc.createElement(block.type === "quote" ? "blockquote" : block.type === "h2" ? "h2" : "div");
    inline(element, block.children);
    fragment.appendChild(element);
  }
  return fragment;
}
