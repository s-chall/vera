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
  Plus,
  Quote,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type InsertKind = "image" | "document" | "source" | "quote" | "divider" | "embed";

type UploadedItem = {
  id: string;
  kind: "image" | "document" | "source";
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

export function ArticleEditor() {
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
      const kind = forcedKind ?? (file.type.startsWith("image/") ? "image" : "document");
      const url = kind === "image" ? URL.createObjectURL(file) : undefined;
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

  const publishArticle = () => {
    setPublishOpen(false);
    setNotice("Article published in this preview. No data was sent.");
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
          <span className="writer-avatar" aria-hidden="true">QC</span>
          <span className="writer-identity-copy">
            <strong className="writer-alias">Quiet Current</strong>
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
                  <span className="writer-upload-icon" aria-hidden="true">{item.kind === "source" ? <ShieldCheck size={20} /> : <File size={20} />}</span>
                )}
                <span className="writer-upload-copy">
                  <strong>{item.name}</strong>
                  <small>{item.kind === "source" ? "Private source — not published" : item.size}</small>
                </span>
                <button className="writer-icon-button" type="button" aria-label={`Remove ${item.name}`} onClick={() => removeUpload(item)}><X aria-hidden="true" size={18} /></button>
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
        <input className="writer-visually-hidden" ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" multiple tabIndex={-1} onChange={handleFileInput("document")} />
        <input className="writer-visually-hidden" ref={sourceInputRef} type="file" multiple tabIndex={-1} onChange={handleFileInput("source")} />

        <p className="writer-status" role="status" aria-live="polite">{notice}</p>
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
              <li><Check aria-hidden="true" size={17} /><span><strong>Alias confirmed</strong><small>Quiet Current appears as the author.</small></span></li>
              <li><Check aria-hidden="true" size={17} /><span><strong>Metadata removed</strong><small>Uploaded media will not expose device details.</small></span></li>
              <li><Check aria-hidden="true" size={17} /><span><strong>Sources separated</strong><small>Private source files will not be published.</small></span></li>
            </ul>
            <div className="writer-dialog-actions">
              <button className="writer-button writer-button--quiet" ref={cancelButtonRef} type="button" onClick={closePublish}>Cancel</button>
              <button className="writer-button writer-button--publish" type="button" onClick={publishArticle}>Publish article</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default ArticleEditor;
