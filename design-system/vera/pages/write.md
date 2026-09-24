# Write

## Intent

A distraction-free long-form editor inspired by Ghost. Journalists write directly on a calm paper canvas; security details stay out of the way until they are relevant.

## Structure

- Sticky action bar: back to News, autosave state, Preview, Publish.
- Centered 760px writing canvas with protected publishing alias.
- Borderless title, standfirst, lead image, formatting controls, and article body.
- `+` insertion menu for images, audio segments, video segments, documents, private source files, quotes, dividers, and embeds.
- Publish confirmation dialog containing the identity and metadata protection checks.

## Responsive behavior

- Desktop uses the existing Vera sidebar and keeps the article canvas centered in the remaining viewport.
- Tablet retains the action bar below the adaptive header.
- Mobile compresses action labels, keeps 44px targets, stacks the insertion menu, and presents publishing as a bottom sheet.

## Interaction states

- Editing changes the live status from `Saved` to `Saving…` and back.
- Dragging a file over the body reveals a drop target; every drag action also has a visible button alternative.
- Reader attachments remain visible in the draft. Audio and video use native, non-autoplaying previews; source files are explicitly marked private and unpublished.
- Publish opens progressive protection checks rather than permanently occupying editor space.
