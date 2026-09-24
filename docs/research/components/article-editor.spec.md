# ArticleEditor specification

## Overview

- Target file: `components/article-editor.tsx`
- Reference: Ghost’s visual editor and dynamic card menu, adapted to Vera’s private publishing workflow.
- Interaction model: direct writing, selection formatting, click/keyboard block insertion, drag-and-drop upload.

## DOM structure

1. Compact editor top bar
   - Back-to-news link.
   - Autosave status.
   - Preview and Publish actions.
2. Centered writing canvas
   - Visible publishing alias and identity protection state.
   - Borderless title input.
   - Borderless subtitle/standfirst textarea.
   - Optional lead-image upload area.
   - Rich article body area.
3. Insertion controls
   - A 44px `+` button beside the active body region.
   - Click-driven menu with Image, Document, Source file, Quote, Divider, and Embed.
4. Upload cards
   - Show selected filename, type, and whether it will publish or remain private.
5. Publishing sheet/dialog
   - Protection checks appear only after Publish is selected.
   - Preview remains a lightweight status action for this prototype.

## Visual specification

- Canvas maximum width: 760px.
- Outer page uses Vera paper background; writing canvas is not a dashboard card.
- Interface font: DM Sans. Article title/body: Newsreader.
- Title: clamp 44–72px, borderless, minimum two-line capacity.
- Subtitle: 20–24px with muted ink and 1.45 line height.
- Body: 19–21px with 1.7 line height and 65–72 character measure.
- Toolbar and insertion menu use 1px semantic borders, 8–10px radius, and no decorative shadows except the menu/dialog.
- All controls have at least 44px hit areas and visible focus.

## States and behavior

- Autosave: editing changes `Saved` → `Saving…` → `Saved`; no blocking spinner.
- Formatting: Bold, Italic, Link, Heading, and Quote buttons apply to selected editor text.
- Insert menu: toggled by `+`, closes with Escape or after choosing an option.
- Upload: accept click selection and drag/drop. Image files create an inline image preview; documents create file cards.
- Source file is visibly marked `Private source — not published`.
- Publish dialog: confirms alias, metadata removal, and source separation; provides Cancel and Publish article.
- No real upload or publishing request is made in this UI-only iteration.

## Responsive behavior

- Desktop: compact top bar and 760px centered canvas.
- Tablet: 32px gutters, actions remain in top bar.
- Mobile: 16px gutters, labels shorten where needed, Preview becomes secondary, insertion menu remains within viewport, publishing dialog becomes bottom sheet-like.

## Accessibility

- Labels for title/subtitle and the editable body.
- `aria-live=polite` autosave and result status.
- Insert button announces expanded state and controls the menu.
- Menu items are native buttons with text labels.
- Dialog uses `role=dialog`, `aria-modal=true`, a labeled heading, Escape handling, and restored focus.
- Decorative Lucide icons use `aria-hidden=true`.
