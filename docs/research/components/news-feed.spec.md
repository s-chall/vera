# NewsFeed specification

## Overview

- Target file: `components/news-feed.tsx`
- Reference: user-supplied `Screenshot 2026-09-24 at 2.14.31 PM.png`
- Interaction model: native scroll + click-driven filtering + text search

## DOM structure

- Page header with `h1` and labeled search field.
- Two-tab `tablist`: Journalists and Activists.
- Feed region containing repeated `article` elements.
- Each article contains author identity row, short post copy, optional image preview with linked title, and engagement controls.

## Visual specification

- Feed width: 680px maximum; full-width on phones.
- Page background: Vera paper token; cards do not float as separate dashboard tiles.
- Article separation: 1px semantic divider with 28–32px vertical padding.
- Search height: at least 48px; visible label for assistive technology.
- Author avatar: 44px circle; alias 15px/700; date 13px muted.
- Body copy: 17px with roughly 1.55 line height and no more than 70 characters per line.
- Preview media: full feed width, 16:9 or 3:2, 12px radius, reserved aspect ratio.
- Linked preview title: 20–24px Newsreader; supporting label no smaller than 13px.
- Action controls: at least 44px hit area, Lucide outline icons, muted default and ink hover/focus.
- Primary action: compact `Fund` control in the identity row, not `Subscribe`.

## States and behavior

- Default tab: Journalists.
- Active tab: ink text plus orange 2px underline; inactive tabs use muted text.
- Search: case-insensitive filtering; empty results show one concise message.
- Cards may be media or text-only. The first visible result must include a meaningful image.
- Hover: article titles become blue; action icons darken without layout movement.
- Keyboard: tab order follows search → filters → article actions; no custom ordering.

## Content

- Use Vera aliases and original demo reporting text, never Substack publication names or copied post text.
- Journalist examples: Northstar, Red Cedar, Mothlight.
- Activist examples: Riverwatch, Tenant Signal, Borderless Archive.
- Topics should be investigative reporting, public records, environment, housing, and civil liberties.

## Responsive behavior

- Desktop: feed centered within content area beside persistent Vera navigation.
- Tablet: feed under top navigation with 24px gutters.
- Mobile: 16px gutters, bottom navigation, wrapping author metadata, media edge aligned with article content.
