"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bold,
  Check,
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
  ShieldCheck,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVera } from "@/lib/vera";

type InsertKind = "image" | "audio" | "video" | "document" | "source" | "quote" | "divider" | "embed";

type UploadedItem = {
  id: string;
  kind: "image" | "audio" | "video" | "document" | "source";
  name: string;
  size: string;
  url?: string;
};

type InsertOption = {
  kind: InsertKind;
  label: string;
  description: string;
  icon: typeof ImageIcon;
};

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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

const initials = (alias: string) =>
  alias.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

/** contentEditable gives us markup; the store wants one paragraph per line. */
function readBody(node: HTMLElement | null) {
  if (!node) return "";
  const blocks = node.querySelectorAll<HTMLElement>("p, div, li, blockquote");
  const lines = blocks.length
    ? [...blocks].map((el) => el.innerText.trim())
    : node.innerText.split("\n").map((line) => line.trim());
  return lines.filter(Boolean).join("\n");
}

export function ArticleEditor() {
  const vera = useVera();
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [saveState, setSaveState] = useState<"Saved" | "Saving…">("Saved");
  const [notice, setNotice] = useState("Draft ready.");
  const [insertOpen, setInsertOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [leadImage, setLeadImage] = useState<UploadedItem | null>(null);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const insertMenuId = useId();
  const publishTitleId = useId();
  const publishDescriptionId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!publishOpen) return;
    cancelButtonRef.current?.focus();

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPublishOpen(false);
        requestAnimationFrame(() => publishButtonRef.current?.focus());
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [publishOpen]);

  const markChanged = useCallback(() => {
    setSaveState("Saving…");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveState("Saved"), 650);
  }, []);

  const addFiles = useCallback((files: File[], forcedKind?: UploadedItem["kind"]) => {
    if (!files.length) return;

    const nextItems = files.map((file) => {
      const kind = forcedKind ?? (
        file.type.startsWith("image/") ? "image" :
        file.type.startsWith("audio/") ? "audio" :
        file.type.startsWith("video/") ? "video" : "document"
      );
      const url = ["image", "audio", "video"].includes(kind) ? URL.createObjectURL(file) : undefined;
      if (url) objectUrlsRef.current.add(url);
      return {
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        kind,
        name: file.name,
        size: formatFileSize(file.size),
        url,
      } satisfies UploadedItem;
    });

    setUploads((current) => [...current, ...nextItems]);
    setNotice(`${files.length} ${files.length === 1 ? "file" : "files"} added to the draft.`);
    markChanged();
  }, [markChanged]);

  const chooseLeadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (leadImage?.url) {
      URL.revokeObjectURL(leadImage.url);
      objectUrlsRef.current.delete(leadImage.url);
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    setLeadImage({ id: crypto.randomUUID(), kind: "image", name: file.name, size: formatFileSize(file.size), url });
    setNotice("Lead image added.");
    markChanged();
    event.target.value = "";
  };

  const handleFileInput = (kind: UploadedItem["kind"]) => (event: ChangeEvent<HTMLInputElement>) => {
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
      setNotice("That link could not be added. Use a valid http or https address.");
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
      setNotice("That embed could not be added. Use a valid http or https address.");
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
    if (kind === "quote") runCommand("formatBlock", "blockquote");
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

  const removeUpload = (item: UploadedItem) => {
    if (item.url) {
      URL.revokeObjectURL(item.url);
      objectUrlsRef.current.delete(item.url);
    }
    setUploads((current) => current.filter((upload) => upload.id !== item.id));
    setNotice(`${item.name} removed.`);
    markChanged();
  };

  const closePublish = () => {
    setPublishOpen(false);
    requestAnimationFrame(() => publishButtonRef.current?.focus());
  };

  const publishArticle = async () => {
    if (publishing) return;
    if (!vera.canPublish) {
      setPublishOpen(false);
      setFailed(true);
      setNotice("Only a verified journalist account can publish.");
      return;
    }
    const body = readBody(bodyRef.current);

    if (!title.trim()) {
      setPublishOpen(false);
      setFailed(true);
      setNotice("Add a title before publishing.");
      return;
    }
    if (!body) {
      setPublishOpen(false);
      setFailed(true);
      setNotice("Write something before publishing.");
      return;
    }

    setPublishing(true);
    setFailed(false);
    setNotice("Publishing…");
    try {
      const article = await vera.publish({ title: title.trim(), body, dek: subtitle });
      setPublishOpen(false);
      if (article) {
        router.push(`/articles/${article.slug}`);
        return;
      }
      setNotice("Published.");
    } catch (error) {
      setPublishOpen(false);
      setFailed(true);
      setNotice(error instanceof Error ? error.message : String(error));
      return;
    } finally {
      setPublishing(false);
    }
    setSaveState("Saved");
    requestAnimationFrame(() => publishButtonRef.current?.focus());
  };

  return (
    <main id="main-content" className="writer-shell">
      <header className="writer-topbar">
        <Link className="writer-back" href="/">
          <ArrowLeft aria-hidden="true" size={17} />
          Back to News
        </Link>
        <p className="writer-save-state" aria-live="polite">
          <span className={`writer-save-dot writer-save-dot--${saveState === "Saved" ? "saved" : "saving"}`} aria-hidden="true" />
          {saveState}
        </p>
        <div className="writer-actions">
          <button
            className="writer-button writer-button--quiet"
            type="button"
            onClick={() => setNotice("Preview prepared. Your draft remains private.")}
          >
            Preview
          </button>
          <button
            className="writer-button writer-button--publish"
            type="button"
            ref={publishButtonRef}
            onClick={() => setPublishOpen(true)}
          >
            Publish
          </button>
        </div>
      </header>

      <section className="writer-editor" aria-label="Article editor">
        <div className="writer-identity">
          <span className={`writer-avatar${vera.me ? ` identity-seal ${vera.me.seal}` : ""}`} aria-hidden="true">
            {vera.me ? initials(vera.me.alias) : "··"}
          </span>
          <span className="writer-identity-copy">
            <strong className="writer-alias">{vera.me?.alias ?? "…"}</strong>
            <span className="writer-protected"><ShieldCheck aria-hidden="true" size={14} /> Identity protected</span>
          </span>
        </div>

        <label className="writer-visually-hidden" htmlFor="writer-title">Article title</label>
        <input
          className="writer-title"
          id="writer-title"
          value={title}
          onChange={(event) => { setTitle(event.target.value); markChanged(); }}
          placeholder="Article title"
          autoComplete="off"
        />

        <label className="writer-visually-hidden" htmlFor="writer-subtitle">Article subtitle</label>
        <textarea
          className="writer-subtitle"
          id="writer-subtitle"
          value={subtitle}
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
                <button className="writer-icon-button" type="button" aria-label="Replace lead image" onClick={() => leadInputRef.current?.click()}>
                  <Upload aria-hidden="true" size={18} />
                </button>
              </figcaption>
            </figure>
          ) : (
            <button className="writer-lead-upload" type="button" onClick={() => leadInputRef.current?.click()}>
              <ImageIcon aria-hidden="true" size={21} />
              <span><strong>Add a lead image</strong><small>Choose a clear image that sets the scene</small></span>
            </button>
          )}
          <input className="writer-visually-hidden" ref={leadInputRef} type="file" accept="image/*" onChange={chooseLeadImage} tabIndex={-1} />
        </div>

        <div className="writer-toolbar" role="toolbar" aria-label="Text formatting">
          <button className="writer-tool" type="button" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}><Bold aria-hidden="true" size={18} /></button>
          <button className="writer-tool" type="button" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}><Italic aria-hidden="true" size={18} /></button>
          <button className="writer-tool" type="button" aria-label="Add link" onMouseDown={(event) => event.preventDefault()} onClick={addLink}><Link2 aria-hidden="true" size={18} /></button>
          <button className="writer-tool" type="button" aria-label="Heading" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "h2")}><Heading2 aria-hidden="true" size={18} /></button>
          <button className="writer-tool" type="button" aria-label="Quote" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "blockquote")}><Quote aria-hidden="true" size={18} /></button>
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
          />
          {dragActive ? <div className="writer-drop-message"><Upload aria-hidden="true" size={20} /> Drop files into the story</div> : null}
        </div>

        {uploads.length ? (
          <div className="writer-uploads" aria-label="Files in this draft">
            {uploads.map((item) => (
              <article className={`writer-upload writer-upload--${item.kind}`} key={item.id}>
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
                  <small>{item.kind === "source" ? "Private source — not published" : item.size}</small>
                </span>
                <button className="writer-icon-button" type="button" aria-label={`Remove ${item.name}`} onClick={() => removeUpload(item)}><X aria-hidden="true" size={18} /></button>
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

        <input className="writer-visually-hidden" ref={imageInputRef} type="file" accept="image/*" multiple tabIndex={-1} onChange={handleFileInput("image")} />
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
            role="dialog"
            aria-modal="true"
            aria-labelledby={publishTitleId}
            aria-describedby={publishDescriptionId}
          >
            <button className="writer-dialog-close" type="button" aria-label="Close publish dialog" onClick={closePublish}><X aria-hidden="true" size={20} /></button>
            <span className="writer-dialog-mark" aria-hidden="true"><ShieldCheck size={24} /></span>
            <h2 className="writer-dialog-title" id={publishTitleId}>Ready to publish?</h2>
            <p className="writer-dialog-description" id={publishDescriptionId}>Vera checks the details that protect you before the story goes live.</p>
            <ul className="writer-checks">
              <li><Check aria-hidden="true" size={17} /><span><strong>Alias confirmed</strong><small>{vera.me?.alias ?? "Your alias"} appears as the author.</small></span></li>
              <li><Check aria-hidden="true" size={17} /><span><strong>Byline only</strong><small>Your email is never shown beside your work.</small></span></li>
              <li><Check aria-hidden="true" size={17} /><span><strong>Text only</strong><small>Images are not uploaded yet, so no file metadata is published.</small></span></li>
            </ul>
            <div className="writer-dialog-actions">
              <button className="writer-button writer-button--quiet" ref={cancelButtonRef} type="button" onClick={closePublish}>Cancel</button>
              <button className="writer-button writer-button--publish" type="button" disabled={publishing} onClick={() => void publishArticle()}>{publishing ? "Publishing…" : "Publish article"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default ArticleEditor;
