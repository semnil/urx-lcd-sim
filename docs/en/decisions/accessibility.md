# Accessibility decisions

> 日本語版は [../../ja/decisions/accessibility.md](../../ja/decisions/accessibility.md) を参照してください.

Closed decisions about what the screens tell assistive technology, with what led to them.

## A box redrawn under its open list reads `aria-expanded="false"`

- **What it is**: a box that opens a list or a sheet is built with `aria-expanded="false"` and set
  to `true` when it opens (`dropdown()` in `src/ui/widgets.ts`). When the screen is drawn again
  while the list stands open, the box is built anew and reads `false`; the list stays open.
- **Decision** (2026-10-19): it is left as it is, and is not raised again.
- **Reason**: while a list or a sheet is up, the screen behind it is `inert` (`shutBehind()` in
  `src/app/shell.ts`). The decision rests on an inert part of the page not being offered to
  assistive technology, so the box cannot be read for as long as its value is wrong.
