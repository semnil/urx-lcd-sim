# Layout and type decisions

> 日本語版は [../../ja/decisions/layout-and-type.md](../../ja/decisions/layout-and-type.md) を参照してください.

Closed decisions about how parts are laid out and how text is sized and placed, with what led to
them. The rules themselves are in `AGENTS.md`, "Checking a change on the screen"; what each screen
looks like now is in [screen-inventory.md](../screen-inventory.md) and
[design-tokens.md](../design-tokens.md).

## A part that comes, goes or changes moves no other part

- **Decision**: the screens are laid out as the unit's are. A part shown, hidden or emptied, or a
  value that changes, neither moves nor resizes another part. What was settled screen by screen is
  in [screen-inventory.md](../screen-inventory.md), "INPUT screen", "Names of on/off buttons",
  "STEREO/CUE meter" and "HOME strip layout".
- **Reason**: the unit's screen has a fixed layout. A flex item shrinks (`flex-shrink: 1`) and
  will not go under the width of its content (`min-width: auto`) unless told otherwise, and an
  empty element takes no room, so a layout left to those defaults moves its neighbours. A test
  over the DOM sees which elements are there and in what order, and passes.
- **What happened** (2026-09-06 and 07, five corrections of one kind in one session):
  - On the INPUT screen the panel of a strip without a head amp was removed whole. The panel now
    stays on every screen and only its content is emptied.
  - The level bar left on that screen was packed into the top left. It keeps the place it has on a
    screen with Gain.
  - The name of an on/off button was set bold only while lit, and a heavier weight is wider. The
    weight is the same on and off.
  - Lighting CUE on HOME added the meter's name and frame to the rail's column and shrank [Sends]
    and the knob mode button with them.
  - HOME's level value box grew by the width of the sign of `-4.00` and pushed the rotary aside.
- **What happened** (2026-09-20, the other way round): OSCILLATOR's `.osc-params` was a flex row
  with an empty `div` meant to keep the first column free, and an empty `div` is 0 wide. Sine
  Wave's Frequency looked right, the row's left edge being at the second column; on Burst Noise
  Width stood in the second column and Interval between the second and the third. The cells now
  stand over the knob divisions at the foot of the screen. The DOM test read the order of the
  children alone and passed.
- **What happened** (2026-09-22, twice):
  - RECORDER's Play tab emptied the elapsed time and the frequency while stopped, the empty row
    became 0 high, and the progress bar rose. The row keeps its height (`min-height: 1lh`), and
    the rectangles of the three states agree.
  - The card screens set the free space as one line centred in its place, 7px higher than the
    figure. The one line of p088-1 stands where the second of two lines stands when the name line
    is empty (y73..81), at the same height as in p089-1 and p092-1, which carry a name. Where
    figures differ in how many rows they show, first measure which row of the other figures the
    fewer rows stand on.

## The browser's own scroll bars

- **Decision**: a box that scrolls hides the browser's own scroll bar, and
  `src/style/columns.test.ts`, "the browser's own scroll bars", fails when a box is left out of
  the rules that hide it. How to check a new box is in `AGENTS.md`, "Checking a change on the
  screen".
- **What happened** (2026-09-13): the TIME ZONE dialog was checked on a capture taken with scroll
  bars hidden and reported as done. In a browser that shows them it had two scroll bars, the
  browser's own inside the drawn one, and scrolled sideways as well. SAVE/LOAD's file list had the
  same defect.

## A text size is chosen by the pixel difference from the figure

- **Decision** (2026-09-14): a text size is chosen by drawing the candidates and taking the least
  pixel difference from the figure, and its place is settled apart from its size, by measuring how
  far the rows and columns of the ink are off. The steps are in `AGENTS.md`, "Checking a change on
  the screen".
- **Reason**: the typeface is not the unit's, so a size whose height matches does not match in
  width or in place. And while a line of text is off its rows, choosing its size by the
  difference of the whole screen favours smaller text, which has less ink: the size takes up an
  error of place.
- **What happened** (2026-09-14): sizes set control by control to the height of the guide's ink
  took the mean difference from the figures from 7.75 to 8.03 (HOME's link state rose by 4.9: a
  14px badge crowded its frame and the strip moved 3px). Sizes chosen by pixel difference, with
  the place set apart, brought it to 7.48.
- **What happened** (2026-09-15): three values chosen by a score that let the window slide did
  worse once captured — the headings of SAVE/LOAD's and RECORDER's lists at 12px bold (the
  heading's region 17 to 48% further from the figure), HOME's link heart 1px lower (54% further),
  and the side rail's tab names at weight 600 (nearer on eight screens, 6.8% further on OSCILLATOR
  and 13.3% on SEND TO).
- **History**: a shape is chosen the same way. On 2026-09-20 a sheet's corner was chosen among
  radii of 5, 6, 7 and 8px, scored in a window for each part (top right, bottom right, bottom
  left, right edge, bottom edge). The total alone hid that the top right got worse while the two
  lower corners got better. The best radius differed above and below, so `border-radius` is set
  apart for the two.

## Text on one row is matched by its ink rows

- **Decision**: text that stands on one row is settled by setting the top and bottom rows of its
  ink beside the figure's, not by the difference in area.
- **What happened** (2026-09-27): SCENE LIST's number, chosen by difference, stood at 11px and 1px
  up, and read as out of line with the title. In p076-1 and p077-1 the number and the title are
  one size and share a baseline (in p077-1, `02` and `01234-56789` both take y162..170); the
  drawing had the number two rows up. [#21](https://github.com/semnil/urx-lcd-sim/pull/21) set it
  to 13px with no shift.
- **What happened** (the same fix): `translate` moves what is seen and adds no width, so a title
  moved left was still cut with `…` in its box (the box's `gap` was narrowed). And a more specific
  rule's `translate: 2px 0px` had been cancelling the vertical 1px of the base rule
  `.scene-title { translate: 0 1px }`, so removing the rule dropped the title 1px. When a rule
  that shifts is removed, capture to see whether a base rule's value comes back.

## A box is read with the band under its face

- **Decision**: the size of a box is read off a figure down one column of pixels, not as the
  bounding box of the colour of its face.
- **Reason**: a part that lays a 3px band under its face (a title plate, a pulldown) comes out
  3px short when it is measured by the face's colour. Read down a column, the edge between the
  face and the band shows (the figure's [Comp]: face y49..83, band y84..86, a box 38 high).
- **What happened** (2026-09-20): five parts were measured by the face — SSMCS's [Comp], [EQ],
  [Mid] and [Side Chain], and the Knee pulldown — and it showed only when the capture was
  compared with the figure after they were built.

## Changing how a row is centred

- **Decision**: when the way a row is centred is changed, the text's place is matched against the
  figure again by its ink rows. A test that checks centring by where a box stands asserts the
  box's height as well.
- **What happened** (2026-09-20): the card screens' path field went from a flex row with
  `align-items: center` to `line-height`, and its ink moved from y67..75 to y66..74 (p089-1 has
  67..75). `line-height: 38px` on the 36px box put it back, and the capture differed from the one
  before the change by 0 pixels. The change was made because a flex item wider than its box is
  always cut at its end; to keep the end in view the box is `direction: rtl` with
  `text-align: left` and the text inside is wrapped in `direction: ltr; unicode-bidi: isolate`
  (the guide's "Folder name display" says the end of the path is what shows).
- **What happened** (2026-10-12, [#70](https://github.com/semnil/urx-lcd-sim/pull/70)): an E2E
  test that a dialog's text is centred on its icon, written on the middle of `.dialog-text`'s
  bounding box, passed on the CSS before the fix as well: the row's default
  `align-items: stretch` stretched the `p` to 44px, so the middle of the box was the middle of the
  icon. Asserting that the box is `18px × the number of lines` high made the test fail
  before the fix.

## A mark the figure draws is drawn as a picture

- **Decision**: a mark is drawn as a picture made from the figure, not set as a character. Where
  one mark is a character on one screen and a picture on another, the picture is looked for first
  and used on both.
- **What happened** (2026-09-22): INPUT's [Φ] and the channel view's Φ were set as the capital
  letter, whose bar is too short. The figure's mark is 10x11, its bar reaching 2px past the ring
  above and below, and only HOME used an SVG of that shape (`Icons.phase`). Six letters (Φ, φ, ϕ,
  ɸ, Ф, ф) at each weight and size were compared by pixel difference, and none came as near the
  figure as the picture.

## What a rule or a token actually paints

- **Decision**: which text a rule or a token moves is counted, not read off the stylesheet: its
  value is replaced by a sentinel (41px, say) and the elements whose computed size changes are
  collected over every screen. A value written in the docs is checked against what is painted.
  `src/style/font-reset.test.ts` finds a declaration that is never painted, on each screen as it
  opens, with a button of each kind pressed, and on the pages the side tabs switch between.
- **Reason**: `.lcd button { font: inherit }` is stronger than a rule of one class, so a size, a
  weight or a line height written for a button or a field by one class is not painted (how a
  button's rule is written is in [design-tokens.md](../design-tokens.md), "Typeface").
- **What happened** (2026-09-21, when the typeface was changed and the sizes measured again; the
  mean difference of all screens went from 5.711 to 5.486):
  - Eighteen rules of size and weight on buttons and fields had never been painted, and the docs
    described those values (the bold of the EQ knobs' names, [Default] at 12px). Each was made to
    take effect and measured; the ones under which no screen did worse were kept ([Default] at
    13px and 600, the bold of the sampling frequency buttons) and the rest removed.
  - The same reset's `color: inherit` cancelled twenty text colours written for buttons. All but
    two were white; the two were a grey and a black, and the unlit names in the six figures that
    show them are white, the colour that had been painted, so the declarations were removed (all
    88 captures unchanged). On 2026-09-22 three more were found inside a sheet and a dropdown,
    which the test did not open then; it now presses one button of each kind on each screen.
  - A candidate size was offered to rules of `font-size: 0` too (marks drawn as pictures). And a
    `translate` on the element that is the box itself (a value box, a button) moves its frame, so
    a place is adjusted only on an element that holds nothing but text.
  - A value measured by laying a rule with `!important` over the stylesheet differed from the same
    value once written into the rule (5.560 against 5.479), since `!important` wins over the more
    specific rule of a state as well. A candidate is measured by rewriting the rule in place.
  - Text whose content differs from the figure's (the body of LICENSE) only gets nearer as it gets
    smaller, so it is given no candidate.
  - Three of the five sample rows in the docs' table of text sizes (`1-knob`, `Monitor`,
    `Post Fader Send for FX`) were not text of the token they stood for, and were replaced.
  - A colour declaration is looked for by scanning the CSS. Read in a browser with the reset's
    `color` taken off, an element with no declaration shows the browser's own black for a button
    or a field, which was misreported as a declared black for the scene name box and for CH
    SETTING's Name.
- **What happened** (2026-10-12): MONITOR's [CUE Interrupt] set its two lines 17px apart where
  p070-1 has 14px. `font: inherit` hands down `line-height` as well, so a one-class
  `line-height` is not painted; it was written with two classes
  ([#71](https://github.com/semnil/urx-lcd-sim/pull/71), which also made the test read
  `line-height` and the side tabs' pages, and removed three declarations it found). To compare
  the pitch of a two-line name with a figure, the ink rows are read box by box and letter by
  letter: read over the whole button, a `/` that reaches lower and the copy mark fall into the
  rows.
- **What happened** (the same day): a `translate` added to SETUP's names moved nothing, and
  neither did the one already there at 5px: the names are inline `span`s, and `translate` is not
  painted on an inline element. A `span` inside a button is moved by the button's `padding-top`,
  or by `position: relative; top`. Before a shift chosen by a score is written in, see that the
  capture taken after it moved.

## A coordinate taken from a padded canvas

- **Decision**: a coordinate taken from a figure of 289 rows is checked by laying the whole
  drawing over the figure and measuring how far it is off vertically. How the padded figures are
  read is in [design-tokens.md](../design-tokens.md), "How the values were sampled".
- **What happened** (2026-09-24): the place of the Track Count list (p084-3, 480x289), y54..233,
  had been written into the docs and the CSS in the canvas's coordinates; on the screen it is
  y46..225, and the list opened 8 rows low. The six other figures of 480x289 that stand for a
  screen matched the drawing with the 8 rows taken off, so this was the one value off.

## Names on the bank list are white

- **Decision** (2026-09-21): the names on the opened channel bank list are white, as on HOME's
  bank button (p048-1). `src/style/columns.test.ts` and the docs hold it. The colour of a screen
  no figure shows is the operator's to decide, and an audit of contrast does not overturn it.
- **History**: no figure shows the opened list. Two candidates were set side by side: the rule of
  the COLOR screen, the one of black and white that contrasts more (black on both the green and
  the red, 5.89:1 and 5.40:1), and the white of HOME's bank button (3.57:1 and 3.89:1, under AA).
  White was chosen.

## WebKit's clip of the main area

- The decision, and why `clip-path` and padding on `.main` were not used, are in
  [#97](https://github.com/semnil/urx-lcd-sim/pull/97).
