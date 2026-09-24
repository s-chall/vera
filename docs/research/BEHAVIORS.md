# Vera News behavior reference

- The primary interaction model is native vertical scrolling.
- Search is immediate and local for the demo; it matches alias, title, summary, and topic.
- Tabs are click-driven. They update `aria-selected` and the visible article set.
- Article links use standard browser navigation so back behavior and deep linking remain predictable.
- Engagement controls are demo controls with accessible names; counts remain stable until backend wiring.
- Desktop retains the fixed navigation rail. At tablet sizes it becomes a top bar. At phone sizes it becomes the existing bottom bar.
- No automatic motion, carousel, nested scrolling, or hover-only action is used.
