"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bold,
  Check,
  CircleAlert,
  File,
  FileText,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  Minus,
  Music2,
  Plus,
  Quote,
  Trash2,
  ShieldCheck,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArticleBody } from "@/components/article-body";
import { blocksToEditor, editorToBlocks, plainTextToBlocks, summarize } from "@/lib/article-body";
import { SCRUBBABLE_TYPES, scrubImage } from "@/lib/scrub-image";
import { bylineName, type PreparedImage, type Visibility } from "@/lib/types";
import { useVera } from "@/lib/vera";

type InsertKind = "image" | "audio" | "video" | "document" | "source" | "quote" | "divider" | "embed";
type UploadKind = "image" | "audio" | "video" | "document" | "source";

type UploadedItem = {
  id: string;
  kind: UploadKind;
  name: string;
  size: string;
  url?: string;
  /** Kept in memory only. Images are re-encoded from it at publish time. */
  file: File;
  alt: string;
};

type InsertOption = {
  kind: InsertKind;
  label: string;
  description: string;
  icon: typeof ImageIcon;
};

type Draft = { title: string; subtitle: string; body: string[]; savedAt: number };

/** Something that stops publishing, and where to send the author to fix it. */
type Problem = { message: string; target: "title" | "body" | { upload: string } };

const INSERT_OPTIONS: InsertOption[] = [
  { kind: "image", label: "Image", description: "JPG, PNG, GIF, or WebP", icon: ImageIcon },
  { kind: "audio", label: "Audio", description: "Add an interview or field recording", icon: Music2 },
  { kind: "video", label: "Video", description: "Add a recorded segment", icon: Video },
  { kind: "document", label: "Document", description: "Attach a reader download", icon: FileText },
  { kind: "source", label: "Source file", description: "Keep reporting material private", icon: ShieldCheck },
  { kind: "quote", label: "Quote", description: "Add a pull quote", icon: Quote },
  { kind: "divider", label: "Divider", description: "Separate sections", icon: Minus },
  { kind: "embed", label: "Embed", description: "Add a verified web link", icon: Link2 },
];

const AUDIENCES: { value: Visibility; label: string; description: string }[] = [
  { value: "media_only", label: "Media organisations", description: "Newsroom accounts on Vera, Vera admins, and you." },
  { value: "members", label: "All members", description: "Everyone with a Vera account, funders included." },
];

/**
 * Vera can only strip metadata from images so far. Audio, video and documents
 * carry their own (recording device, author, edit history), so they stay in
 * the draft but cannot be published.
 */
const UNPUBLISHABLE: UploadKind[] = ["audio", "video", "document"];

// Mirrors the bounds in publish_article() and the articles table.
const TITLE_MAX = 200;
const DEK_MAX = 400;
const ALT_MAX = 300;
const BODY_MAX_BLOCKS = 500;
const BODY_MAX_BYTES = 200000;
const IMAGES_MAX = 20;

const IMAGE_ACCEPT = SCRUBBABLE_TYPES.join(",");
const draftKeyFor = (id: string) => `vera.draft.${id}`;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const initialsOf = (alias: string) =>
  alias.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "?";

const normalizeUrl = (value: string) => {
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate.match(/^https?:\/\//i) ? candidate : `https://${candidate}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);

function readDraft(key: string): Draft | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title.slice(0, TITLE_MAX) : "",
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle.slice(0, DEK_MAX) : "",
      body: Array.isArray(parsed.body) ? parsed.body.filter((block: unknown) => typeof block === "string") : [],
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function ArticleEditor() {
  const vera = useVera();
  const router = useRouter();
  const alias = vera.me?.alias ?? "Your alias";
  const draftKey = vera.meId ? draftKeyFor(vera.meId) : null;

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [saveState, setSaveState] = useState<"Saved" | "Saving…" | "Not saved">("Saved");
  const [notice, setNoticeText] = useState("Draft ready.");
  const [failed, setFailed] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [leadImage, setLeadImage] = useState<UploadedItem | null>(null);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  /** The blocks being previewed, or null while editing. */
  const [preview, setPreview] = useState<string[] | null>(null);
  const [audience, setAudience] = useState<Visibility>(vera.accountType === "journalist" ? "media_only" : "members");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);

  /** Refusals read as refusals; everything else is plain status. */
  const setNotice = useCallback((message: string, isError = false) => {
    setNoticeText(message);
    setFailed(isError);
  }, []);

  const insertMenuId = useId();
  const publishTitleId = useId();
  const publishDescriptionId = useId();
  const audienceName = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const uploadsRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const leadInputRef = useRef<HTMLInputElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const publishedRef = useRef(false);
  const mountedRef = useRef(true);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  // A draft left on this device comes back. Attachments are not kept: a File
  // cannot be stored, and a source file should not linger in browser storage.
  useEffect(() => {
    if (!draftKey) return;
    const draft = readDraft(draftKey);
    if (!draft || (!draft.title && !draft.subtitle && !draft.body.length)) return;
    setTitle(draft.title);
    setSubtitle(draft.subtitle);
    bodyRef.current?.replaceChildren(blocksToEditor(draft.body, document));
    setNotice("Draft restored from this device. Attachments need adding again.");
  }, [draftKey]);

  useEffect(() => {
    if (publishOpen) cancelButtonRef.current?.focus();
  }, [publishOpen]);

  // aria-modal only describes a modal; inert makes the rest of the page one.
  // Without it, Tab walks out of the dialog into the navigation, and an author
  // could leave /write mid-publish.
  useEffect(() => {
    if (!publishOpen) return;
    const behind = Array.from(document.querySelectorAll<HTMLElement>(
      ".skip-link, .site-header, .mobile-nav, .writer-topbar, .writer-editor"));
    behind.forEach((element) => { element.inert = true; });
    return () => behind.forEach((element) => { element.inert = false; });
  }, [publishOpen]);

  useEffect(() => {
    if (!publishOpen || publishing) return;

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPublishOpen(false);
        requestAnimationFrame(() => publishButtonRef.current?.focus());
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [publishOpen, publishing]);

  const currentBlocks = () => (bodyRef.current ? editorToBlocks(bodyRef.current) : []);

  /** Written on every change, so closing the tab loses nothing. Returns false if storage refused. */
  const saveDraft = useCallback(() => {
    if (!draftKey || publishedRef.current) return true;
    const draft: Draft = {
      title: titleRef.current?.value ?? "",
      subtitle: subtitleRef.current?.value ?? "",
      body: bodyRef.current ? editorToBlocks(bodyRef.current) : [],
      savedAt: Date.now(),
    };
    try {
      if (!draft.title.trim() && !draft.subtitle.trim() && !draft.body.length) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, JSON.stringify(draft));
      return true;
    } catch {
      return false;
    }
  }, [draftKey]);

  const markChanged = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!saveDraft()) {
      setSaveState("Not saved");
      return;
    }
    setSaveState("Saving…");
    saveTimerRef.current = setTimeout(() => setSaveState("Saved"), 650);
  }, [saveDraft]);

  const addFiles = useCallback((files: File[], forcedKind?: UploadKind) => {
    if (!files.length) return;

    const refused: string[] = [];
    const nextItems: UploadedItem[] = [];
    for (const file of files) {
      const kind = forcedKind ?? (
        file.type.startsWith("image/") ? "image" :
        file.type.startsWith("audio/") ? "audio" :
        file.type.startsWith("video/") ? "video" : "document"
      );
      if (kind === "image" && !SCRUBBABLE_TYPES.includes(file.type)) {
        refused.push(file.name);
        continue;
      }
      const url = ["image", "audio", "video"].includes(kind) ? URL.createObjectURL(file) : undefined;
      if (url) objectUrlsRef.current.add(url);
      nextItems.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        kind,
        name: file.name,
        size: formatFileSize(file.size),
        url,
        file,
        alt: "",
      });
    }

    if (nextItems.length) setUploads((current) => [...current, ...nextItems]);
    const added = nextItems.length ? `${plural(nextItems.length, "file")} added to the draft.` : "";
    const skipped = refused.length ? `${refused.join(", ")} could not be added: use JPEG, PNG, GIF or WebP.` : "";
    setNotice([added, skipped].filter(Boolean).join(" "), refused.length > 0);
    if (nextItems.length) markChanged();
  }, [markChanged, setNotice]);

  const chooseLeadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!SCRUBBABLE_TYPES.includes(file.type)) {
      setNotice(`${file.name} could not be used: choose a JPEG, PNG, GIF or WebP image.`, true);
      return;
    }
    if (leadImage?.url) {
      URL.revokeObjectURL(leadImage.url);
      objectUrlsRef.current.delete(leadImage.url);
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    setLeadImage({ id: crypto.randomUUID(), kind: "image", name: file.name, size: formatFileSize(file.size), url, file, alt: "" });
    setNotice("Lead image added.");
    markChanged();
  };

  const handleFileInput = (kind: UploadKind) => (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []), kind);
    event.target.value = "";
  };

  const runCommand = (command: string, value?: string) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    markChanged();
  };

  const addLink = () => {
    const value = window.prompt("Paste the link you want to add:");
    if (value === null) return;
    const url = normalizeUrl(value);
    if (!url) {
      setNotice("That link could not be added. Use a valid http or https address.", true);
      return;
    }
    runCommand("createLink", url);
    setNotice("Link added.");
  };

  const addEmbed = () => {
    const value = window.prompt("Paste the page you want to embed:");
    if (value === null) return;
    const url = normalizeUrl(value);
    if (!url) {
      setNotice("That embed could not be added. Use a valid http or https address.", true);
      return;
    }
    const safeUrl = escapeHtml(url);
    runCommand("insertHTML", `<p><a href="${safeUrl}">${safeUrl}</a></p>`);
    setNotice("Embed link added to the article.");
  };

  const selectInsertOption = (kind: InsertKind) => {
    setInsertOpen(false);
    if (kind === "image") imageInputRef.current?.click();
    if (kind === "audio") audioInputRef.current?.click();
    if (kind === "video") videoInputRef.current?.click();
    if (kind === "document") documentInputRef.current?.click();
    if (kind === "source") sourceInputRef.current?.click();
    if (kind === "quote") toggleBlock("blockquote");
    if (kind === "divider") runCommand("insertHorizontalRule");
    if (kind === "embed") addEmbed();
  };

  const handleInsertKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setInsertOpen(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  /** Inserts stored-format blocks at the caret, built from DOM nodes, never from pasted markup. */
  const insertBlocks = (blocks: string[]) => {
    const holder = document.createElement("div");
    holder.append(blocksToEditor(blocks, document));
    // A single paragraph goes in inline, so pasting a phrase does not split the line.
    const only = holder.children.length === 1 && holder.firstElementChild?.tagName === "DIV" ? holder.firstElementChild : null;
    document.execCommand("insertHTML", false, (only ?? holder).innerHTML);
  };

  // Every paste goes through the stored format before it reaches the editor.
  // The clipboard's HTML is parsed into an inert document, so nothing in it
  // loads: a tracking pixel in pasted mail would otherwise report this
  // browser's address the moment it landed. It also means the editor shows
  // exactly what will be published, and nothing hidden rides along.
  // A pasted screenshot goes to attachments, where it is scrubbed.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      addFiles(files);
      return;
    }
    const html = event.clipboardData.getData("text/html");
    const blocks = html
      ? editorToBlocks(new DOMParser().parseFromString(html, "text/html").body)
      : plainTextToBlocks(event.clipboardData.getData("text/plain"));
    if (!blocks.length) return;
    insertBlocks(blocks);
    markChanged();
  };

  /** The quote or heading the caret is in, if any. */
  const caretBlock = () => {
    let node: Node | null = window.getSelection()?.anchorNode ?? null;
    while (node && node !== bodyRef.current) {
      if (node.nodeType === 1 && ["BLOCKQUOTE", "H2"].includes((node as Element).tagName)) return node as Element;
      node = node.parentNode;
    }
    return null;
  };

  // Quote and Heading switch off again: the same button returns the line to a paragraph.
  const toggleBlock = (tag: "blockquote" | "h2") => {
    bodyRef.current?.focus();
    runCommand("formatBlock", caretBlock()?.tagName === tag.toUpperCase() ? "div" : tag);
  };

  // Enter continues a quote, which is what a multi-line quote needs; Enter on
  // an empty quote line leaves it, as in most editors.
  const handleBodyKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const block = caretBlock();
    if (block?.tagName === "BLOCKQUOTE" && !block.textContent?.trim()) {
      event.preventDefault();
      runCommand("formatBlock", "div");
    }
  };

  const removeUpload = (item: UploadedItem) => {
    if (item.url) {
      URL.revokeObjectURL(item.url);
      objectUrlsRef.current.delete(item.url);
    }
    setUploads((current) => current.filter((upload) => upload.id !== item.id));
    setNotice(`${item.name} removed.`);
    markChanged();
  };

  const removeLeadImage = () => {
    if (leadImage?.url) {
      URL.revokeObjectURL(leadImage.url);
      objectUrlsRef.current.delete(leadImage.url);
    }
    setLeadImage(null);
    setNotice("Lead image removed.");
    markChanged();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".writer-lead-upload")?.focus());
  };

  const describeUpload = (id: string, alt: string) =>
    setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, alt } : upload)));

  const togglePreview = () => {
    if (preview) {
      setPreview(null);
      setNotice("Back to editing.");
      requestAnimationFrame(() => bodyRef.current?.focus());
      return;
    }
    setInsertOpen(false);
    setPreview(currentBlocks());
    setNotice("Showing the article as readers will see it. Private source files are not part of it.");
  };

  // The dialog opens either way. A reason written anywhere else lands below
  // the fold, and Publish would look like it did nothing.
  const openPublish = () => {
    const found: Problem[] = [];
    // mirrors can_publish() in the database, which is the real gate
    if (!vera.canPublish) {
      found.push({
        message: vera.accountType === "journalist"
          ? "Only a verified journalist can publish. Finish verification first."
          : "Only a verified journalist account can publish.",
        target: "title",
      });
    }
    if (!title.trim()) found.push({ message: "Add a title.", target: "title" });
    const blocks = currentBlocks();
    if (!blocks.length) found.push({ message: "Write the story. The body is empty.", target: "body" });
    if (blocks.length > BODY_MAX_BLOCKS || new TextEncoder().encode(blocks.join("")).length > BODY_MAX_BYTES) {
      found.push({ message: `The story is too long: at most ${BODY_MAX_BLOCKS} paragraphs and about 200 KB of text.`, target: "body" });
    }
    const imageTotal = uploads.filter((upload) => upload.kind === "image").length + (leadImage ? 1 : 0);
    if (imageTotal > IMAGES_MAX) {
      const first = uploads.find((upload) => upload.kind === "image");
      found.push({
        message: `Remove ${imageTotal - IMAGES_MAX} of the ${imageTotal} images: an article carries at most ${IMAGES_MAX}.`,
        target: first ? { upload: first.id } : "body",
      });
    }
    for (const item of uploads.filter((upload) => UNPUBLISHABLE.includes(upload.kind))) {
      found.push({
        message: `Remove ${item.name}. Vera can only strip identifying metadata from images so far, so ${item.kind} files can't be published yet.`,
        target: { upload: item.id },
      });
    }
    setProblems(found);
    setPublishError(null);
    setPublishOpen(true);
  };

  /** Closes the dialog on the first thing that needs fixing. */
  const fixFirstProblem = () => {
    const target = problems[0]?.target;
    setPublishOpen(false);
    setPreview(null);
    requestAnimationFrame(() => {
      if (target === "title") titleRef.current?.focus();
      else if (target === "body") bodyRef.current?.focus();
      else if (target) {
        const card = uploadsRef.current?.querySelector<HTMLElement>(`[data-upload-id="${CSS.escape(target.upload)}"]`);
        card?.scrollIntoView({ block: "center" });
        card?.querySelector<HTMLButtonElement>("button")?.focus();
      } else publishButtonRef.current?.focus();
    });
  };

  // Tab wraps inside the dialog rather than walking off the end of the page.
  const keepFocusInDialog = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [href]")).filter((element) => !element.closest("fieldset:disabled"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const closePublish = () => {
    if (publishing) return;
    setPublishOpen(false);
    requestAnimationFrame(() => publishButtonRef.current?.focus());
  };

  const publishArticle = async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const blocks = currentBlocks();
      const prepare = async (item: UploadedItem): Promise<PreparedImage> => {
        const clean = await scrubImage(item.file);
        return { blob: clean.blob, type: clean.type, extension: clean.extension, alt: item.alt.trim() };
      };
      const lead = leadImage ? await prepare(leadImage) : null;
      const images = await Promise.all(uploads.filter((item) => item.kind === "image").map(prepare));

      const article = await vera.publish({
        title: title.trim(),
        dek: subtitle.trim() || summarize(blocks),
        body: blocks,
        visibility: audience,
        leadImage: lead,
        images,
      });

      publishedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      try {
        if (draftKey) window.localStorage.removeItem(draftKey);
      } catch { /* the draft outliving the publish is harmless */ }
      if (mountedRef.current) router.push(`/articles/${article.slug}`);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : String(error));
      setPublishing(false);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  const imageCount = uploads.filter((item) => item.kind === "image").length + (leadImage ? 1 : 0);
  const sourceCount = uploads.filter((item) => item.kind === "source").length;
  const previewDek = preview ? subtitle.trim() || summarize(preview) : "";

  return (
    <main id="main-content" className="writer-shell">
      <header className="writer-topbar">
        <Link className="writer-back" href="/">
          <ArrowLeft aria-hidden="true" size={17} />
          Back to News
        </Link>
        <p className="writer-save-state" aria-live="polite" title="Drafts are kept on this device only">
          <span
            className={`writer-save-dot writer-save-dot--${saveState === "Saved" ? "saved" : saveState === "Saving…" ? "saving" : "unsaved"}`}
            aria-hidden="true"
          />
          {saveState}
        </p>
        <div className="writer-actions">
          <button
            className="writer-button writer-button--quiet"
            type="button"
            onClick={togglePreview}
          >
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            className="writer-button writer-button--publish"
            type="button"
            ref={publishButtonRef}
            onClick={openPublish}
          >
            Publish
          </button>
        </div>
      </header>

      <section className="writer-editor" aria-label="Article editor">
        <div className="writer-identity">
          <span className={`writer-avatar${vera.me ? ` identity-seal ${vera.me.seal}` : ""}`} aria-hidden="true">{initialsOf(alias)}</span>
          <span className="writer-identity-copy">
            {/* what readers will see: the press credential when there is one */}
            <strong className="writer-alias">{vera.me ? bylineName(vera.me) : alias}</strong>
            <span className="writer-protected">
              <ShieldCheck aria-hidden="true" size={14} />
              {vera.me?.credentialName ? "Signed with your press credential" : "Identity protected"}
            </span>
          </span>
        </div>

        {preview ? (
          <article className="writer-preview" aria-label="Preview">
            <h1 className="writer-preview-title">{title.trim() || "Untitled"}</h1>
            {previewDek ? <p className="writer-preview-dek">{previewDek}</p> : null}
            {leadImage?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="writer-preview-lead" src={leadImage.url} alt={leadImage.alt} />
            ) : null}
            <div className="article-body writer-preview-body">
              {preview.length ? <ArticleBody blocks={preview} /> : <p className="writer-preview-empty">Nothing written yet.</p>}
            </div>
            {uploads.filter((item) => item.kind === "image" && item.url).map((item) => (
              <figure className="writer-preview-figure" key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.alt} />
                {item.alt ? <figcaption>{item.alt}</figcaption> : null}
              </figure>
            ))}
          </article>
        ) : null}

        <div hidden={Boolean(preview)}>
          <label className="writer-visually-hidden" htmlFor="writer-title">Article title</label>
          <input
            className="writer-title"
            id="writer-title"
            ref={titleRef}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => { setTitle(event.target.value); markChanged(); }}
            placeholder="Article title"
            autoComplete="off"
          />

          <label className="writer-visually-hidden" htmlFor="writer-subtitle">Article subtitle</label>
          <textarea
            className="writer-subtitle"
            id="writer-subtitle"
            ref={subtitleRef}
            value={subtitle}
            maxLength={DEK_MAX}
            onChange={(event) => { setSubtitle(event.target.value); markChanged(); }}
            placeholder="A concise introduction to the story"
            rows={2}
          />

          <div className="writer-lead">
            {leadImage?.url ? (
              <figure className="writer-lead-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="writer-lead-image" src={leadImage.url} alt={`Lead preview: ${leadImage.name}`} />
                <figcaption className="writer-lead-caption">
                  <span>{leadImage.name}</span>
                  <span className="writer-lead-controls">
                    <button className="writer-icon-button" type="button" aria-label="Replace lead image" onClick={() => leadInputRef.current?.click()}>
                      <Upload aria-hidden="true" size={18} />
                    </button>
                    <button className="writer-icon-button" type="button" aria-label="Remove lead image" onClick={removeLeadImage}>
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </span>
                </figcaption>
                <label className="writer-alt">
                  <span className="writer-visually-hidden">Describe the lead image</span>
                  <input
                    value={leadImage.alt}
                    maxLength={ALT_MAX}
                    placeholder="Describe the image for readers who can't see it"
                    onChange={(event) => setLeadImage((current) => (current ? { ...current, alt: event.target.value } : current))}
                  />
                </label>
              </figure>
            ) : (
              <button className="writer-lead-upload" type="button" onClick={() => leadInputRef.current?.click()}>
                <ImageIcon aria-hidden="true" size={21} />
                <span><strong>Add a lead image</strong><small>Choose a clear image that sets the scene</small></span>
              </button>
            )}
            <input className="writer-visually-hidden" ref={leadInputRef} type="file" accept={IMAGE_ACCEPT} onChange={chooseLeadImage} tabIndex={-1} />
          </div>

          <div className="writer-toolbar" role="toolbar" aria-label="Text formatting">
            <button className="writer-tool" type="button" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}><Bold aria-hidden="true" size={18} /></button>
            <button className="writer-tool" type="button" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}><Italic aria-hidden="true" size={18} /></button>
            <button className="writer-tool" type="button" aria-label="Add link" onMouseDown={(event) => event.preventDefault()} onClick={addLink}><Link2 aria-hidden="true" size={18} /></button>
            <button className="writer-tool" type="button" aria-label="Heading" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleBlock("h2")}><Heading2 aria-hidden="true" size={18} /></button>
            <button className="writer-tool" type="button" aria-label="Quote" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleBlock("blockquote")}><Quote aria-hidden="true" size={18} /></button>
          </div>

          <div
            className={`writer-draft ${dragActive ? "writer-draft--dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
            onDrop={handleDrop}
          >
            <div
              className="writer-body"
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Article body"
              aria-multiline="true"
              data-placeholder="Begin writing your story…"
              onInput={markChanged}
              onPaste={handlePaste}
              onKeyDown={handleBodyKeyDown}
            />
            {dragActive ? <div className="writer-drop-message"><Upload aria-hidden="true" size={20} /> Drop files into the story</div> : null}
          </div>

          {uploads.length ? (
            <div className="writer-uploads" aria-label="Files in this draft" ref={uploadsRef}>
              {uploads.map((item) => (
                <article className={`writer-upload writer-upload--${item.kind}`} key={item.id} data-upload-id={item.id}>
                  {item.kind === "image" && item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="writer-upload-image" src={item.url} alt={`Article preview: ${item.name}`} />
                  ) : (
                    <span className="writer-upload-icon" aria-hidden="true">
                      {item.kind === "source" ? <ShieldCheck size={20} /> : item.kind === "audio" ? <Music2 size={20} /> : item.kind === "video" ? <Video size={20} /> : <File size={20} />}
                    </span>
                  )}
                  <span className="writer-upload-copy">
                    <strong>{item.name}</strong>
                    <small>
                      {item.kind === "source" ? "Private source — stays on this device"
                        : UNPUBLISHABLE.includes(item.kind) ? `${item.size} · Can't be published yet`
                        : item.size}
                    </small>
                  </span>
                  <button className="writer-icon-button" type="button" aria-label={`Remove ${item.name}`} onClick={() => removeUpload(item)}><X aria-hidden="true" size={18} /></button>
                  {item.kind === "image" ? (
                    <label className="writer-alt">
                      <span className="writer-visually-hidden">Describe {item.name}</span>
                      <input
                        value={item.alt}
                        maxLength={ALT_MAX}
                        placeholder="Describe the image for readers who can't see it"
                        onChange={(event) => describeUpload(item.id, event.target.value)}
                      />
                    </label>
                  ) : null}
                  {item.kind === "audio" && item.url ? <audio className="writer-media-preview" controls preload="metadata" src={item.url}>Your browser does not support audio playback.</audio> : null}
                  {item.kind === "video" && item.url ? <video className="writer-media-preview writer-video-preview" controls preload="metadata" src={item.url}>Your browser does not support video playback.</video> : null}
                </article>
              ))}
            </div>
          ) : null}

          <div className="writer-insert" onKeyDown={handleInsertKeyDown}>
            <button
              className="writer-insert-button"
              type="button"
              aria-label="Insert content"
              aria-expanded={insertOpen}
              aria-controls={insertMenuId}
              onClick={() => setInsertOpen((open) => !open)}
            >
              <Plus aria-hidden="true" size={22} />
            </button>
            {insertOpen ? (
              <div className="writer-insert-menu" id={insertMenuId} role="menu" aria-label="Insert into article">
                {INSERT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button className="writer-insert-option" type="button" role="menuitem" key={option.kind} onClick={() => selectInsertOption(option.kind)}>
                      <Icon aria-hidden="true" size={19} />
                      <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <input className="writer-visually-hidden" ref={imageInputRef} type="file" accept={IMAGE_ACCEPT} multiple tabIndex={-1} onChange={handleFileInput("image")} />
        <input className="writer-visually-hidden" ref={audioInputRef} type="file" accept="audio/*" multiple tabIndex={-1} onChange={handleFileInput("audio")} />
        <input className="writer-visually-hidden" ref={videoInputRef} type="file" accept="video/*" multiple tabIndex={-1} onChange={handleFileInput("video")} />
        <input className="writer-visually-hidden" ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" multiple tabIndex={-1} onChange={handleFileInput("document")} />
        <input className="writer-visually-hidden" ref={sourceInputRef} type="file" multiple tabIndex={-1} onChange={handleFileInput("source")} />

        <p className={`writer-status${failed ? " writer-status--error" : ""}`} role="status" aria-live="polite">{notice}</p>
      </section>

      {publishOpen ? (
        <div className="writer-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePublish(); }}>
          <section
            className="writer-dialog"
            tabIndex={-1}
            onKeyDown={keepFocusInDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={publishTitleId}
            aria-describedby={publishDescriptionId}
            aria-busy={publishing}
          >
            <button className="writer-dialog-close" type="button" aria-label="Close publish dialog" disabled={publishing} onClick={closePublish}><X aria-hidden="true" size={20} /></button>
            {problems.length ? (
              <>
                <span className="writer-dialog-mark writer-dialog-mark--warn" aria-hidden="true"><CircleAlert size={24} /></span>
                <h2 className="writer-dialog-title" id={publishTitleId}>Not ready yet</h2>
                <p className="writer-dialog-description" id={publishDescriptionId}>Fix {problems.length === 1 ? "this" : "these"} first, then publish.</p>
                <ul className="writer-checks writer-problems" role="alert">
                  {problems.map((problem) => (
                    <li key={problem.message}><CircleAlert aria-hidden="true" size={17} /><span><strong>{problem.message}</strong></span></li>
                  ))}
                </ul>
                <div className="writer-dialog-actions">
                  <button className="writer-button writer-button--publish" ref={cancelButtonRef} type="button" onClick={fixFirstProblem}>Back to the draft</button>
                </div>
              </>
            ) : (
              <>
              <span className="writer-dialog-mark" aria-hidden="true"><ShieldCheck size={24} /></span>
              <h2 className="writer-dialog-title" id={publishTitleId}>Ready to publish?</h2>
              <p className="writer-dialog-description" id={publishDescriptionId}>Vera checks the details that protect you before the story goes live.</p>
              <ul className="writer-checks">
                <li><Check aria-hidden="true" size={17} /><span><strong>{vera.me?.credentialName ? "Signed with your press credential" : "Alias confirmed"}</strong><small>{bylineName(vera.me)} appears as the author.</small></span></li>
                  <li><Check aria-hidden="true" size={17} /><span><strong>Byline only</strong><small>Your email is never shown beside your work.</small></span></li>
                {imageCount ? (
                  <li><Check aria-hidden="true" size={17} /><span><strong>Image metadata removed</strong><small>Location, camera and device details are stripped from {plural(imageCount, "image")}, and original file names are not uploaded.</small></span></li>
                ) : null}
                <li><Check aria-hidden="true" size={17} /><span><strong>Sources separated</strong><small>{sourceCount ? `${plural(sourceCount, "private source file")} ${sourceCount === 1 ? "stays" : "stay"} on this device and ${sourceCount === 1 ? "is" : "are"} never uploaded.` : "Private source files are never uploaded."}</small></span></li>
              </ul>
              <fieldset className="writer-audience" disabled={publishing}>
                <legend>Who can read it</legend>
                {AUDIENCES.map((option) => (
                  <label className="writer-audience-option" key={option.value}>
                    <input
                      type="radio"
                      name={audienceName}
                      value={option.value}
                      checked={audience === option.value}
                      onChange={() => setAudience(option.value)}
                    />
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  </label>
                ))}
              </fieldset>
              {publishError ? <p className="writer-dialog-error" role="alert" tabIndex={-1} ref={errorRef}>{publishError}</p> : null}
              <div className="writer-dialog-actions">
                <button className="writer-button writer-button--quiet" ref={cancelButtonRef} type="button" disabled={publishing} onClick={closePublish}>Cancel</button>
                <button className="writer-button writer-button--publish" type="button" aria-disabled={publishing} onClick={() => void publishArticle()}>
                  {publishing ? "Publishing…" : "Publish article"}
                </button>
              </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default ArticleEditor;
