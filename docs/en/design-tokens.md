# Where the design tokens came from

The colors in `src/style/tokens.css` were sampled pixel by pixel from the 480x272 screen captures
embedded in the user guide (English, revision D0). None was matched by eye. A value of the simulator's
own, which no figure shows, says so in its row or in "Outside the screen".

## How the values were sampled

The user guide PDF embeds bitmaps of the unit's screen pasted as they are. Some are exactly the
480x272 screen; others sit on a canvas with white margin added around the screen.
`scripts/extract-ug-screens.mjs` extracts them and writes each as `p<3-digit page number>-<n>.png` to
the location in the table below. `<n>` counts, within the page, only the captures that go to the same
directory. The capture IDs in this document and in [screen-inventory.md](screen-inventory.md)
(`p045-1`, `wide/p040-2`, and so on) are the path of that file as seen from `reference/ug-lcd/`.

| Canvas (width x height) | Location | Top-left of the screen |
| --- | --- | --- |
| 480 x 272 | `reference/ug-lcd/` | (0, 0) |
| 480 x 281 | `reference/ug-lcd/` | (0, 0) |
| 480 x 289 | `reference/ug-lcd/` | (0, 8) |
| 686 x 281 | `reference/ug-lcd/wide/` | (0, 0) |
| 685 x 289, 686 x 289 | `reference/ug-lcd/wide/` | (0, 8) |
| 686 x 297 | `reference/ug-lcd/wide/` | (0, 12) |
| 685 x 297 | `reference/ug-lcd/wide/` | (0, 13) |

Coordinates take the top-left of the screen as the origin. When measuring on a padded canvas,
subtract the position in this table.

The guide shows some captures clipped by the PDF. `pdfimages` extracts each image whole, before the
clip, so those files carry pixels the pages do not show. `scripts/ug-visible-ranges.py` walks the PDF's
drawing commands and writes to `reference/ug-lcd/visible.json`, for each capture, the part the pages
show (a rectangle in the capture's own pixel coordinates) and the share of its area that part covers.
Pixels outside that part are not used as the basis for any value. The script needs python3 with pypdf
and cryptography (the PDF is AES-encrypted).

Most of the extracted captures hold only 32 levels of R and B and 64 of G (5-6-5 bits). Some carry the
full 256 (p053-1, p088-2, p094-3 and others). A color read off a capture on that ladder can differ from
the real one by one step — 8 in R and B, 4 in G — so a blend is matched within that much.

Surface colors come from the mode of a pixel histogram over the pixels the guide's pages show in the
screen area (480x272) of the extracted captures, and the colors of individual controls from the mode of a histogram over a
rectangle cropped around that control.

```sh
python3 - <<'PY'
from PIL import Image
from collections import Counter
im = Image.open('reference/ug-lcd/p090-1.png').convert('RGB')
print(Counter(list(im.crop((118, 58, 175, 78)).getdata())).most_common(3))
PY
```

## Physical screen

| Item | Value | Source |
| --- | --- | --- |
| Screen size | 4.3-inch touch screen | User guide, Specifications |
| Screen resolution | 480 x 272 | The screen area of every extracted capture has these dimensions (padded canvases included) |
| Screen width (`--lcd-w`) | `480px` | The horizontal of the 480 x 272 screen resolution. `.lcd` is laid out at this width in screen pixels, and `.lcd-frame` shows it scaled by `--scale` |
| Screen height (`--lcd-h`) | `272px` | The vertical of the 480 x 272 screen resolution. The height of `.lcd`; `.lcd-frame` is this times `--scale`. A dropdown list stops at 4px less than this |

## Surfaces and text

| Token | Value | Where it is used |
| --- | --- | --- |
| `--lcd-bg` | `#000000` | The screen's ground. The most frequent color, 43.6% of the pixels the guide's pages show in the screen area of the captures |
| `--surface` | `#4a515a` | Channel strip and panel faces. The second most frequent color (17.4%). The name on MONITOR's lit [CUE Interrupt] / [MONO] (p068-1) and on SCENE LIST's lit bank (p073-1) |
| `--surface-toolbar` | `#424952` | The toolbar band, push-button faces |
| `--surface-inset` | `#313542` | The inner panel of the channel indicator area |
| `--surface-inset-corner` | `#3a3d4a` | The corner pixels of the inner panel (x10 / y92, x8 / y94, x8 / y158 and x10 / y160 on the indicator block in p045-1) |
| `--surface-raised` | `#5a5d63` | A face one step brighter, such as the MONITOR strip header |
| `--surface-well` | `#292d31` | The well of a value box (the block values in p094-1, HOME's level value) |
| `--surface-dim` | `#3a3d42` | The glyph on a lit side-rail tab (Analog's plug in p059-1); the text on the section heading band (x18..401 / y56..79 in p061-1) and on a source sheet's title (x218..261 / y36..45 in p100-2) |
| `--well-deep` | `#191819` | The value box on the PAN / LEVEL panel |
| `--surface-sunk` | `#31393a` | The panel PAN / LEVEL sit on |
| `--surface-on-sunk` | `#5a656b` | The face of MONITOR's [Source] (x6..95 / y112..151 in p068-1) and of a RECORDER slot's source button (x319..388 / y184..220 in p079-2) |
| `--graph-bg` | `#212021` | The panel the EQ / COMP curve is drawn on |
| `--graph-grid` | `#4a515a` | The rule drawn at 0 dB on that panel (x180 / y86 in p099-1) |
| `--graph-grid-lit` | `#63695a` | That rule where it crosses the fill under the curve (x180 / y150 in p103-1) |
| `--handle-arrow` | `#ce0484` | The triangles on both sides of the way a handle holding the focus moves (x141..147 / y93..100 in p103-1) |
| `--graph-fill` | `#424529` | The fill under the COMP curve (p099-1) |
| `--graph-line` | `#ada24a` | The COMP curve itself (p099-1) |
| `--eq-fill` | `#314529` | The fill under the EQ curve (p106-1) |
| `--eq-line` | `#6baa4a` | The curve on the EQ screen (x60 / y160 in p106-1) |
| `--eq-thumb-line` | `#7bba63` | The lower row of the curve in a channel view's EQ block (y106 in p098-1) |
| `--eq-focus-edge` | `#b5086b` | The upper row of that curve while 1-knob turns EQ (x367 / y105 in p096-4) |
| `--eq-focus-line` | `#bd1884` | Its lower row then (y106 in p096-4) |
| `--eq-focus-fill` | `#4a1831` | The area under it then (x317 / y107 in p096-4) |
| `--eq-badge-curve` | `#219e52` | The curve in a lit EQ box (x254..297 / y8..34 in p106-1) |
| `--shape-box` | `#212421` | The face of the EQ screen's filter shape box (x300..359 / y51 in p106-1) |
| `--shape-box-edge` | `#636973` | The same, its 1px line (y50 / y87 / x376 in p106-1) |
| `--oneknob-band` | `#3a3942` | The bottom 3px of an unlit [1 1-knob] (x470 / y85..87 in p099-1) |
| `--oneknob-lit` | `#4aaa31` | [1 1-knob] while it is on (x430 / y60 in p104-2) |
| `--oneknob-lit-band` | `#317529` | The bottom 3px of a lit [1 1-knob] (x430 / y85..87 in p104-2) |
| `--oneknob-panel` | `#393c42` | The panel behind the 1-knob level and button while it is on (x375 / y50 in p104-2) |
| `--oneknob-link` | `#4aa631` | The line tying the 1-knob level to its button (x373..382 / y68..69 in p104-2) |
| `--oneknob-type` | `#636973` | The face of 1-knob EQ's curve pulldown (x250 / y60 in p106-2) |
| `--handle-face` | `#5a6163` | The face of the G / T / R handles on the curve (p099-1) |
| `--handle-ring` | `#a5aab5` | The same, its 3px rim |
| `--surface-btn` | `#52555a` | The face of a button standing alone on the glass (SEND TO in p094-1) |
| `--surface-disabled` | `#212829` | The face of a button that cannot be used (Store at x5..94 / y230..268 and the Edit tab at x422..479 / y115..163 in p073-1) |
| `--surface-knob` | `#4a4952` | The face of the knob toggle button in the bottom right corner (x432..477 / y238..269 in p045-1) |
| `--scroll-thumb-dim` | `#cecace` | The thumb on a list's scroll bar (x395..402 / y110..124 in p073-1) |
| `--surface-sunken` | `#31313a` | The tray a dropdown list sits on (p079-3), the bands of the bank list |
| `--menu-tray` | `#848284` | The tray SETUP puts the four GENERAL items on (p041-1) |
| `--readout` | `#42454a` | The face of the multifunction knob readout bar (y235..254 in p070-1) |
| `--readout-edge` | `#c5c6ce` | That bar's frame and dividers, and the band the labels sit on (y233..234 / y255..271 in the same) |
| `--readout-label` | `#3a3d42` | The label text on that band (x2..421 / y255..271 in p070-1) |
| `--text` | `#ffffff` | Body text |
| `--text-secondary` | `#c5c6ce` | Captions |
| `--text-muted` | `#6b6d7b` | Labels in the off state |
| `--tab-ink` | `#adaead` | The name and glyph on an unlit side-rail tab (Level, x422..479 / y50..101 in p068-1) |
| `--tab-name-lit` | `#31313a` | The name on a lit side-rail tab (Analog in p059-1, Format in p087-1). p067-1, p068-1 and p073-1 draw the name in the glyph's `#3a3d42` as well; every screen follows the majority of the figures |
| `--caption-pale` | `#cecace` | The caption of the Operation Mode box (x38..88 / y8..15 in p041-1) |
| `--drop-mark` | `#dedbde` | The down mark on a button that drops a list (the bank button's x205..213 / y9..14 and [Sends]'s x468..476 / y65..70 in p047-1) |
| `--field-mark` | `#848a8c` | The copy marks in CH SETTING's fields (x124..133 / y58..67 in p093-2); the rename mark takes `--text-muted` |
| `--knob-card-mark` | `#adaead` | The copy mark on a USER DEFINED KNOBS card (x80..89 / y104..113 in p057-1) |
| `--rec-copy-mark` | `#dedfde` | The copy mark on a RECORDER slot's Source button (x378..387 / y185..194 in p079-2) |
| `--strip-id-other` | `#000000` | On a HOME stereo input's first name line, the number of the channel its screens do not open on (as the operator specified) |
| `--ink-on-lit` | `#3a3d3a` | The name on [USB Storage Mode] while it is lit (p078-1). The name on a chosen option — a language (p055-1), SAMPLING FREQUENCY's rate (p058-1), Peripheral (p061-1 / p062-1), the input and output source sheets (p100-2 / p060-2), the assignment dialog (p040-1), OSCILLATOR's mode (p070-1), PAN / BALANCE (p093-1) and USER DEFINED KNOBS' bank. A lit on/off switch such as [ON] or HDCP's [Enable] keeps black (`--text-inverse`; no figure shows HDCP's [Enable] lit, and the unit was checked) |
| `--test-pass` | `#01ff00` | The grade and the recording lines of a card test (p088-2) |
| `--text-disabled` | `#848284` | The name on a button or side-rail tab that cannot be used (Store at x5..94 / y230..268 and the Edit tab at x422..479 / y115..163 in p073-1) |
| `--menu-text-disabled` | `#7b797b` | The name on a menu entry that cannot be used (Recorder / Save/Load / Tools in p078-1, x82..386 / y99..109) |
| `--text-inverse` | `#000000` | Black names on a light face: the [ON] / [CUE] / [PRE] switches (lit or not), block badges and titles, a lit option (the label of [ON], x19..35 / y182..190 in p047-1) |
| `--dim-disabled` | `0.475` | The share of its own brightness a control that cannot be used keeps. The SAMPLING FREQUENCY row, which keeps its own colours while it follows the USB clock, is dimmed by this with `filter: brightness()`. The Recorder / Save/Load / Tools buttons go from face (74,81,90) to (33,40,41) and name (255,255,255) to (123,121,123) between wide/p076-1 and p078-1, and this factor lands within 3/255 on every channel of both pairs |

## Accents and processing blocks

| Token | Value | Sampled from |
| --- | --- | --- |
| `--accent-on` | `#84e3ff` | [ON] / [CUE] / [PRE] switches lit (the same value on the three screens p045-1 / p090-1 / p116-1), [HPF] and [HI-Z] lit, and the HPF and HI-Z marks on HOME's strip and in the channel view (the marks are the operator's own) |
| `--accent-selected` | `#84dfff` | The selected list row (p073-1), the selected language button (p055-1), USB Storage Mode (p078-1) |
| `--list-selected-mark` | `#3a3d3a` | A mark in a selected row: the ▶ (x12..19 / y124..131) and the factory preset's mark (x344..363 / y118..137) in p073-1, the speaker in p081-1, the file mark in p084-1, the protection padlock in p074-1 |
| `--scene-preset` | `#4adb5a` | The number of a scene the unit ships with (P01 in the scene name box at x19..34 / y18..26, P02 / P03 in the list at x24..41 / y162..170 and y200..208 in p073-1) |
| `--scene-protect` | `#32eb73` | A protected scene's Lock cell (the mean over x329..378 / y112..143 of 01's in p074-1) |
| `--accent-cue` | `#d6ced6` | The [CUE] button in the off state |
| `--accent-udk` | `#5a3984` | USER DEFINED KNOBS: the face of the bar (x2..421 / y235..254 in p038-4) |
| `--accent-udk-label` | `#290c3a` | The same, the label text on that band (x2..421 / y255..271 in p038-4) |
| `--accent-udk-toggle` | `#633984` | The face of the knob toggle button in the bottom right while USER DEFINED KNOBS is on (x430..479 / y235..271 in p038-4) |
| `--accent-udk-toggle-edge` | `#d6b2f7` | The same, its 2px border along the top and the left (x428..479 / y233..234 and x428..429 / y233..271 in p038-4) |
| `--accent-udk-edge` | `#ceaeef` | The same, its border and the band the labels sit on (y233..234 / y255..271 in p038-4) |
| `--accent-menu` | `#ffd74a` | The selected item of the side menu (Level in p067-1) |
| `--accent-band` | `#ade3ff` | The box of the EQ band that is on the knobs (p106-1) |
| `--accent-sends` | `#ce4529` | The [Sends] button, the STEREO strip's rail |
| `--accent-sends-mix` | `#e66d00` | The [Sends] button while MIX 1 / MIX 2 is the destination in view (x422..479 / y50..103 in p157-1). An assigned MIX box on OSCILLATOR's Assign |
| `--accent-sends-fx` | `#5a9aff` | The [Sends] button, the lit row of the destination list and the level rotary's arc while FX 1 / FX 2 is the Sends destination, and an assigned FX box on OSCILLATOR's Assign. No figure shows FX selected |
| `--accent-focus` | `#ff009c` | The TOUCH AND TURN focus ring (the A.Gain value box in p090-1) |
| `--accent-focus-fill` | `#5a284a` | The same, inside the ring |
| `--focus-ring` | `#f2f4f7` | The simulator's own mark for where the keys act (a pale dashed line). Not taken from the unit |
| `--send-off` | `#5a6169` | A send switched off on the SEND TO screen, as a HOME strip shows it: the knob's face and arc. No figure shows it; the simulator's own value |
| `--send-off-ink` | `#8c949c` | The same, its value. No figure shows it; the simulator's own value, 4.5:1 over the value box's well (`--surface-well`) |
| `--accent-bank-in` | `#429a29` | The INPUT channel bank button |
| `--accent-bank-out` | `#de5152` | The OUTPUT channel bank button. No figure the guide's pages show has this button; the same value is the face of a lit destination button in p071-1 (x212..301 / y155..191) |
| `--accent-bank-active` | `#f7f73a` | A lit bank cell |
| `--accent-bank-cell` | `#318221` | The mark of a bank not on display on the INPUT bank button (x181..194 / y21 in p047-1) |
| `--accent-bank-in-bevel` | `#296921` | The 3px band along the bottom of the INPUT channel bank button (x146..218 / y39..41 in p047-1) |
| `--accent-bank-out-bevel` | `#9c393a` | The same band on the OUTPUT channel bank button. No figure the guide's pages show has this button; the value is the band of the lit destination button in p071-1, whose face is the same color (x214..299 / y192..194) |
| `--accent-phantom` | Same as `--accent-sends` | [+48V] lit, and the +48V mark on HOME's strip and in the channel view (the marks are the operator's own). The lit mark on CH4's strip in p047-1 (x368..394 / y100..108); [+48V] lit takes its mark's color |
| `--accent-phase` | Same as `--block-gate` | [Φ] lit, and the Φ mark on HOME's strip and in the channel view (the marks are the operator's own). Likewise the palette's orange |

## Dialogs and button edges

| Token | Value | Sampled from |
| --- | --- | --- |
| `--dialog-sheet` | `#bdbebd` | The dialog's face (wide/p040-2), and the section bands (x18..401 / y56..79 in p061-1) |
| `--peripheral-text` | `#bdbebd` | Peripheral's captions and note (x63..309 / y94..106 and x66..351 / y165..177 in p061-1) |
| `--dialog-edge` | `#5a9aff` | The same, its 4px outer frame and the ring of the info mark |
| `--dialog-caution` | `#f7f73a` | The frame and the triangle mark of a dialog that warns (TOOLS' Format). No figure has it; the operator chose the value of `--accent-bank-active` (2026-09-22) |
| `--dialog-ink` | `#31393a` | The same, the question text on the face |
| `--dialog-mark-face` | `#101010` | The circle of the info mark |
| `--btn-bevel` | `#31393a` | A button's bottom 3px by default: menu items, dialog buttons and the scene name box (y118..120 in p066-1), and the buttons with a (74,81,90) face (Stop in p081-1, [Save] in p084-1, [Recall] in p073-1 and more) |
| `--btn-bevel-disabled` | `#191c19` | The bottom 3px of a menu entry that cannot be used (x60 / y127 in p078-1) |
| `--btn-bevel-sunk` | `#42494a` | The bottom 3px of a source button on the sunk face: a RECORDER slot's source button (p079-2) and MONITOR's [Source] (p068-1) |
| `--btn-bevel-plain` | `#3a3d42` | The bottom 3px of [Follow USB] and of a USER DEFINED KNOBS knob card (the cards in p057-1, y178..180) |
| `--udk-dial-rim-top` | `#524d52` | The rim of a USER DEFINED KNOBS knob picture at its top (x53 / y209 in p057-1) |
| `--udk-dial-rim-bottom` | `#191c19` | The same at its foot (x53 / y261 in p057-1) |
| `--udk-dial-face-top` | `#312d31` | The face inside the rim at its top (x53 / y217 in p057-1) |
| `--udk-dial-face-mid` | `#3a393a` | The same a little above its middle (x53 / y233 in p057-1) |
| `--udk-dial-face-low` | `#4a494a` | The same a little above its foot (x53 / y246 in p057-1) |
| `--udk-dial-face-bottom` | `#524d52` | The same at its foot (x53 / y251 in p057-1) |
| `--udk-dial-edge` | `#424142` | The line where the face meets the rim (x73 / y234 in p057-1) |
| `--tab-band` | `#42454a` | The bottom 3px of an unlit side-rail tab (Level, x422..479 / y99..101 in p068-1) |
| `--tab-band-lit` | `#9c8642` | The same on a lit tab (Setting, x422..479 / y158..160 in p068-1) |
| `--tab-band-disabled` | `#191c19` | The same on a tab that cannot be used (Edit, x422..479 / y164..166 in p073-1) |
| `--tab-corner-outer` | `#293131` | The outer pixels of the top-left corner of an unlit side-rail tab (x424 / y115 and x422 / y117 on the second tab in p061-1) |
| `--tab-corner-inner` | `#424952` | The inner pixel of the same corner (x423 / y116 on the second tab in p061-1) |
| `--tab-corner-band-top` | `#424952` | At the bottom-left corner, the pixel one row above the band (x424 / y163 on the second tab in p061-1) |
| `--tab-corner-band-outer` | `#292829` | The outer pixels of the bottom-left corner (x422 / y164 and x424 / y166 on the second tab in p061-1) |
| `--tab-corner-band-inner` | `#3a3d42` | The inner pixel of the bottom-left corner (x423 / y165 on the second tab in p061-1) |
| `--tab-corner-outer-lit` | `#9c8629` | The same pixels on a lit tab (x424 / y56 and x422 / y58 on the first tab in p061-1) |
| `--tab-corner-inner-lit` | `#efc642` | The same (x423 / y57 on the first tab in p061-1) |
| `--tab-corner-band-top-lit` | `#d6b642` | The same (x424 / y104 on the first tab in p061-1) |
| `--tab-corner-band-outer-lit` | `#5a5129` | The same (x422 / y105 and x424 / y107 on the first tab in p061-1) |
| `--tab-corner-band-inner-lit` | `#8c793a` | The same (x423 / y106 on the first tab in p061-1) |
| `--tab-corner-outer-disabled` | `#101819` | The same pixels on a tab that cannot be used (x424 / y115 and x422 / y117 on Edit in p073-1) |
| `--tab-corner-inner-disabled` | `#192421` | The same (x423 / y116 on Edit in p073-1) |
| `--tab-corner-band-top-disabled` | `#192021` | The same (x424 / y163 on Edit in p073-1) |
| `--tab-corner-band-outer-disabled` | `#081008` | The same (x422 / y164 and x424 / y166 on Edit in p073-1) |
| `--tab-corner-band-inner-disabled` | `#101810` | The same (x423 / y165 on Edit in p073-1) |
| `--corner-sunk-a` | `#101410` | A sunk cell's corner shade on the glass, the first from the outside (the parameter cell at x116..201 / y144..227 in p056-1, the PAN and LEVEL cells in p090-1). The same where a channel view block's band meets the glass |
| `--corner-sunk-b` | `#212829` | A sunk cell's corner shade on the glass, the second from the outside (the parameter cell at x116..201 / y144..227 in p056-1, the PAN and LEVEL cells in p090-1). The same where a channel view block's band meets the glass |
| `--corner-sunk-c` | `#212d29` | A sunk cell's corner shade on the glass, the diagonal pixel from the outside (the parameter cell at x116..201 / y144..227 in p056-1, the PAN and LEVEL cells in p090-1). The same where a channel view block's band meets the glass |
| `--corner-block-a` | `#191c21` | A channel view block's corner shade: the first of its top corner from the outside, or of the step onto its band (x110..195 / y50..133 in p090-1) |
| `--corner-block-b` | `#313d42` | A channel view block's corner shade: the second of its top corner from the outside, or of the step onto its band (x110..195 / y50..133 in p090-1) |
| `--corner-block-c` | `#3a4142` | A channel view block's corner shade: the diagonal pixel of its top corner from the outside, or of the step onto its band (x110..195 / y50..133 in p090-1) |
| `--corner-block-band-top` | `#3a454a` | A channel view block's corner shade: the pixel right above the band of its top corner from the outside, or of the step onto its band (x110..195 / y50..133 in p090-1) |
| `--corner-block-band-inner` | `#424952` | A channel view block's corner shade: the inside of the step of its top corner from the outside, or of the step onto its band (x110..195 / y50..133 in p090-1) |
| `--corner-well-on-sunk` | `#191c19` | A value box's or a well's corner shade: a value box on a sunk cell (PAN's value box in p090-1, the level value box in p067-1, the slots in p079-2, a block's value in p090-1, the level readout in p047-1) |
| `--corner-well-on-surface` | `#191c21` | A value box's or a well's corner shade: a value box on a panel and a well on the glass (PAN's value box in p090-1, the level value box in p067-1, the slots in p079-2, a block's value in p090-1, the level readout in p047-1) |
| `--corner-well-inner` | `#292d31` | A value box's or a well's corner shade: the pixel inside a well's corner (PAN's value box in p090-1, the level value box in p067-1, the slots in p079-2, a block's value in p090-1, the level readout in p047-1) |
| `--corner-panel-a` | `#101010` | A corner shade of INPUT's panels: the outer pixel of the edge row (the panel at x2..204 / y101..228 in p100-1) |
| `--corner-panel-b` | `#212429` | A corner shade of INPUT's panels: the second pixel from the outside and the diagonal pixel (p100-1) |
| `--corner-plot-a` | `#31393a` | A corner shade of a graph's frame: the pixel where the frame turns (the EQ graph at x2..417 / y93..230 in p106-1, the graphs in p099-1 and p114-1) |
| `--corner-plot-b` | `#424d52` | A corner shade of a graph's frame: the pixel inside the turn (p106-1, p099-1, p114-1) |
| `--corner-path-left` | `#31393a` | The pixel at a left corner of the card's path field (x62 / y53 of the field at x62..285 / y53..88 in p084-1) |
| `--corner-path-a` | `#3a454a` | A shade of the path field's right corners: the third pixel of the edge row from the outside (x283 / y53 in p084-1) |
| `--corner-path-b` | `#424952` | The same, the pixel inside the turn (x284 / y54 in p084-1) |
| `--corner-path-c` | `#293131` | The same, the third pixel of the side from the outside (x285 / y55 in p084-1) |
| `--corner-tray-a` | `#313131` | A shade of SETUP's GENERAL tray corners: the fourth pixel from the outside on the edge row and the side (x34 / y54 of the tray at x31..448 / y54..107 in p041-1) |
| `--corner-tray-b` | `#636163` | The same, the fifth pixel from the outside (x35 / y54 in p041-1) |
| `--corner-tray-c` | `#080808` | The same, the second pixel from the outside on the second row (x32 / y55 in p041-1) |
| `--corner-tray-d` | `#6b696b` | The same, the two pixels inside the turn (x33 / y55 and x32 / y56 in p041-1) |
| `--corner-block-well` | `#293131` | A value box's or a well's corner shade: a value on a channel view block's face (a block's value in p090-1) |
| `--corner-level-well` | `#31393a` | A value box's or a well's corner shade: the level readout on a HOME strip (the level readout in p047-1) |
| `--corner-focus-on-sunk` | `#b51073` | A focused value box's corner: the frame's outer shade on a sunk cell (ms at x27 / y163 in p115-1) |
| `--corner-focus-on-sunken` | `#b50c73` | The same on INPUT's darker panel (A.Gain at x35 / y161 in p100-1) |
| `--corner-focus-on-surface` | `#bd107b` | The same on a (74,81,90) panel (A.Gain at x14 / y77 in p090-1) |
| `--corner-focus-b` | `#ef0094` | The same, the pixel inside the frame's turn (x13 / y78 in p090-1) |
| `--corner-focus-c` | `#ad1473` | The same, the frame's shade against the fill (x14 / y78 in p090-1) |
| `--corner-focus-d` | `#63244a` | The same, the fill's shade inside the frame (x15 / y78 in p090-1) |
| `--corner-raised-a` | `#212021` | A raised panel's top corner shade (a HOME strip's name, MONITOR's head), the first from the outside (x108..112 / y50..54 in p047-1, p067-1) |
| `--corner-raised-b` | `#42454a` | The same, the second |
| `--corner-raised-c` | `#42494a` | The same, the diagonal pixel |
| `--corner-oneknob-panel-a` | `#101418` | The 1-knob panel's corner on the glass, the outer shade (x314 / y47 in p104-2) |
| `--corner-oneknob-panel-b` | `#292c31` | The same, the shade after it (x315 / y47 in p104-2) |
| `--corner-oneknob-panel-c` | `#293031` | The same, the diagonal pixel (x313 / y48 in p104-2) |
| `--corner-source-step-a` | `#4a595a` | MONITOR's [Source], the shade at each end of the step from its face onto its band (x8 / y148 and x6 / y146 in p068-1) |
| `--corner-source-step-b` | `#526163` | The same, the shade in the step's middle row (x7 / y147 in p068-1) |
| `--corner-data-a` | `#3a494a` | SSMCS's Sweet Spot Data button, the outer shade of its top corner (x203 / y167 in p108-1) |
| `--corner-data-b` | `#4a595a` | The same, the shade after it, and the face's last pixel above the step (x204 / y167 and x200 / y199 in p108-1) |
| `--corner-data-c` | `#52595a` | The same, the diagonal pixel (x202 / y168 in p108-1) |
| `--corner-data-foot-a` | `#313d3a` | The same button's band foot, the outer shade (x202 / y206 in p108-1) |
| `--corner-data-foot-b` | `#3a4142` | The same, the shade inside it (x203 / y206 in p108-1) |
| `--corner-data-step-a` | `#4a5152` | The same button's face where it meets the band's step (x203 / y203 in p108-1) |
| `--corner-data-step-b` | `#525d63` | The same, the face's shade along the step (x204 / y203 in p108-1) |
| `--corner-data-step-c` | `#424d4a` | The same, the face's pixel over the step's top (x200 / y200 in p108-1) |
| `--corner-mon-foot-a` | `#101419` | A MONITOR strip's corner where its band meets the glass, the first shade from the outside (x2..6 / y264..268 in p067-1) |
| `--corner-mon-foot-b` | `#212831` | The same, the second |
| `--corner-mon-foot-c` | `#212d31` | The same, the diagonal pixel |
| `--corner-mon-band-top` | `#4a4d52` | The same, the face's pixel left on the side just above the band |
| `--corner-mon-band-mid` | `#3a494a` | The same, the face's shade along the step onto the band |
| `--corner-badge-off-a` | `#63656b` | an unlit block switch: top corner, the outer shade (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-off-b` | `#a5aaad` | an unlit block switch: top corner, the second shade (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-off-c` | `#cecace` | an unlit block switch: top corner, the third shade (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-off-d` | `#4a4d52` | an unlit block switch: bottom corner over the band, the outer shade (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-off-e` | `#7b7d7b` | an unlit block switch: bottom corner over the band, the second shade (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-off-f` | `#949694` | an unlit block switch: bottom corner over the band, the third shade (p090-1 at INS FX x406..465 / y57..76) |
| `--badge-band-off` | `#9c9e9c` | an unlit block switch: its 3px band (p090-1 at INS FX x406..465 / y57..76) |
| `--corner-badge-gate-a` | `#6b594a` | a lit GATE or DUCKER switch: top corner, the outer shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-gate-b` | `#c57131` | a lit GATE or DUCKER switch: top corner, the second shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-gate-c` | `#f78229` | a lit GATE or DUCKER switch: top corner, the third shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-gate-d` | `#52413a` | a lit GATE or DUCKER switch: bottom corner over the band, the outer shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-gate-e` | `#945529` | a lit GATE or DUCKER switch: bottom corner over the band, the second shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-gate-f` | `#b55d21` | a lit GATE or DUCKER switch: bottom corner over the band, the third shade (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--badge-band-gate` | `#c56121` | a lit GATE or DUCKER switch: its 3px band (p090-1 at GATE x123..182, p098-1 at DUCKER) |
| `--corner-badge-comp-a` | `#634d52` | a lit COMP switch: top corner, the outer shade (p090-1 at x218..277) |
| `--corner-badge-comp-b` | `#a54d3a` | a lit COMP switch: top corner, the second shade (p090-1 at x218..277) |
| `--corner-badge-comp-c` | `#c54931` | a lit COMP switch: top corner, the third shade (p090-1 at x218..277) |
| `--corner-badge-comp-d` | `#4a393a` | a lit COMP switch: bottom corner over the band, the outer shade (p090-1 at x218..277) |
| `--corner-badge-comp-e` | `#7b3529` | a lit COMP switch: bottom corner over the band, the second shade (p090-1 at x218..277) |
| `--corner-badge-comp-f` | `#943529` | a lit COMP switch: bottom corner over the band, the third shade (p090-1 at x218..277) |
| `--badge-band-comp` | `#9c3929` | a lit COMP switch: its 3px band (p090-1 at x218..277) |
| `--corner-badge-eq-a` | `#42655a` | a lit EQ switch: top corner, the outer shade (p090-1 at x312..371) |
| `--corner-badge-eq-b` | `#319e63` | a lit EQ switch: top corner, the second shade (p090-1 at x312..371) |
| `--corner-badge-eq-c` | `#29be63` | a lit EQ switch: top corner, the third shade (p090-1 at x312..371) |
| `--corner-badge-eq-d` | `#314d42` | a lit EQ switch: bottom corner over the band, the outer shade (p090-1 at x312..371) |
| `--corner-badge-eq-e` | `#21794a` | a lit EQ switch: bottom corner over the band, the second shade (p090-1 at x312..371) |
| `--corner-badge-eq-f` | `#218e52` | a lit EQ switch: bottom corner over the band, the third shade (p090-1 at x312..371) |
| `--badge-band-eq` | `#219252` | a lit EQ switch: its 3px band (p090-1 at x312..371) |
| `--corner-badge-fx-a` | `#526973` | a lit DELAY or INS FX switch: top corner, the outer shade (p098-2 at DELAY x406..465) |
| `--corner-badge-fx-b` | `#6baac5` | a lit DELAY or INS FX switch: top corner, the second shade (p098-2 at DELAY x406..465) |
| `--corner-badge-fx-c` | `#7bcef7` | a lit DELAY or INS FX switch: top corner, the third shade (p098-2 at DELAY x406..465) |
| `--corner-badge-fx-d` | `#3a4d5a` | a lit DELAY or INS FX switch: bottom corner over the band, the outer shade (p098-2 at DELAY x406..465) |
| `--corner-badge-fx-e` | `#52829c` | a lit DELAY or INS FX switch: bottom corner over the band, the second shade (p098-2 at DELAY x406..465) |
| `--corner-badge-fx-f` | `#5a9abd` | a lit DELAY or INS FX switch: bottom corner over the band, the third shade (p098-2 at DELAY x406..465) |
| `--badge-band-fx` | `#63a2c5` | a lit DELAY or INS FX switch: its 3px band (p098-2 at DELAY x406..465) |
| `--corner-sendto-a` | `#080c10` | the channel view's [SEND TO]: top corner, the outer shade (p090-1 at x110..195 / y144..181) |
| `--corner-sendto-b` | `#31393a` | the channel view's [SEND TO]: top corner, the second shade (p090-1 at x110..195 / y144..181) |
| `--corner-sendto-c` | `#4a5152` | the channel view's [SEND TO]: top corner, the third shade (p090-1 at x110..195 / y144..181) |
| `--corner-sendto-d` | `#080808` | the channel view's [SEND TO]: bottom corner over the band, the outer shade (p090-1 at x110..195 / y144..181) |
| `--corner-sendto-e` | `#212829` | the channel view's [SEND TO]: bottom corner over the band, the second shade (p090-1 at x110..195 / y144..181) |
| `--corner-sendto-f` | `#31353a` | the channel view's [SEND TO]: bottom corner over the band, the third shade (p090-1 at x110..195 / y144..181) |
| `--corner-flag-a` | `#4a4d52` | INPUT's flags: top corner, the outer shade (p100-1 at x107..174 / y147..170) |
| `--corner-flag-b` | `#9c9ea5` | INPUT's flags: top corner, the second shade (p100-1 at x107..174 / y147..170) |
| `--corner-flag-c` | `#cec6ce` | INPUT's flags: top corner, the third shade (p100-1 at x107..174 / y147..170) |
| `--corner-flag-d` | `#3a3942` | INPUT's flags: bottom corner over the band, the outer shade (p100-1 at x107..174 / y147..170) |
| `--corner-flag-e` | `#737573` | INPUT's flags: bottom corner over the band, the second shade (p100-1 at x107..174 / y147..170) |
| `--corner-flag-f` | `#949694` | INPUT's flags: bottom corner over the band, the third shade (p100-1 at x107..174 / y147..170) |
| `--band-sends` | `#8c3119` | HOME's [Sends] tab: its 3px band (p045-1 at x422..479 / y50..106) |
| `--band-wizard` | `#a6a6a6` | the band under the mode wizard's buttons |
| `--corner-eq-band-a` | `#213131` | an EQ band's box: top corner, the outer shade (p106-1 at x2..56 / y49..86) |
| `--corner-eq-band-b` | `#8cbace` | an EQ band's box: top corner, the second shade (p106-1 at x2..56 / y49..86) |
| `--corner-eq-band-d` | `#192021` | an EQ band's box: bottom corner over the band, the outer shade (p106-1 at x2..56 / y49..86) |
| `--corner-eq-band-e` | `#638294` | an EQ band's box: bottom corner over the band, the second shade (p106-1 at x2..56 / y49..86) |
| `--band-eq-band` | `#7ba2b5` | an EQ band's box: its 3px band (p106-1 at x2..56 / y49..86) |
| `--corner-oneknob-a` | `#080c10` | [1-knob] while it is off: top corner, the outer shade (p099-1 at x386..477 / y50..87) |
| `--corner-oneknob-b` | `#31353a` | [1-knob] while it is off: top corner, the second shade (p099-1 at x386..477 / y50..87) |
| `--corner-oneknob-c` | `#4a4d52` | [1-knob] while it is off: top corner, the third shade (p099-1 at x386..477 / y50..87) |
| `--corner-oneknob-in` | `#4a5152` | [1-knob] while it is off: the pixel inside the top turn (p099-1 at x386..477 / y50..87) |
| `--corner-title-off-a1` | `#212421` | an unlit title badge: top corner, the outer shade (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-a2` | `#848284` | an unlit title badge: top corner, the second shade (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-a3` | `#bdbabd` | an unlit title badge: top corner, the third shade (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-in` | `#c5c2c5` | an unlit title badge: the pixel inside the top turn (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-d1` | `#101410` | an unlit title badge: bottom corner over the band, the outer shade (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-d2` | `#424542` | an unlit title badge: bottom corner over the band, the second shade (p113-1 at x254..379 / y2..41) |
| `--corner-title-off-d3` | `#636563` | an unlit title badge: bottom corner over the band, the third shade (p113-1 at x254..379 / y2..41) |
| `--badge-title-band-off` | `#6b696b` | an unlit title badge: its 3px band (p113-1 at x254..379 / y2..41) |
| `--corner-title-gate-a1` | `#291800` | a lit GATE or DUCKER title badge: top corner, the outer shade (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-a2` | `#a55519` | a lit GATE or DUCKER title badge: top corner, the second shade (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-a3` | `#ef7921` | a lit GATE or DUCKER title badge: top corner, the third shade (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-in` | `#f77d21` | a lit GATE or DUCKER title badge: the pixel inside the top turn (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-d1` | `#191008` | a lit GATE or DUCKER title badge: bottom corner over the band, the outer shade (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-d2` | `#522d10` | a lit GATE or DUCKER title badge: bottom corner over the band, the second shade (p114-1 at x254..379 / y2..41) |
| `--corner-title-gate-d3` | `#7b4110` | a lit GATE or DUCKER title badge: bottom corner over the band, the third shade (p114-1 at x254..379 / y2..41) |
| `--badge-title-band-gate` | `#844519` | a lit GATE or DUCKER title badge: its 3px band (p114-1 at x254..379 / y2..41) |
| `--corner-title-comp-a1` | `#3a1408` | a lit COMP title badge: top corner, the outer shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-a2` | `#8c3121` | a lit COMP title badge: top corner, the second shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-a3` | `#c54529` | a lit COMP title badge: top corner, the third shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-in` | `#c54529` | a lit COMP title badge: the pixel inside the top turn, which the figure has no pixel for: the nearest shade in the same figure (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-d1` | `#190c08` | a lit COMP title badge: bottom corner over the band, the outer shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-d2` | `#4a1c10` | a lit COMP title badge: bottom corner over the band, the second shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-d3` | `#6b2819` | a lit COMP title badge: bottom corner over the band, the third shade (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-fin` | `#6b2821` | a lit COMP title badge: the pixel inside the foot turn (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-b1` | `#311008` | a lit COMP title badge: the first shade down the side (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-e2` | `#4a1810` | a lit COMP title badge: the second up the side (p099-1 at x254..369 / y2..41) |
| `--corner-title-comp-e3` | `#632419` | a lit COMP title badge: the third up the side (p099-1 at x254..369 / y2..41) |
| `--badge-title-band-comp` | `#6b2821` | a lit COMP title badge: its 3px band (p099-1 at x254..369 / y2..41) |
| `--corner-title-eq-a1` | `#000400` | a lit EQ title badge: top corner, the outer shade (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-a2` | `#106d3a` | a lit EQ title badge: top corner, the second shade (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-a3` | `#21b663` | a lit EQ title badge: top corner, the third shade (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-in` | `#21b663` | a lit EQ title badge: the pixel inside the top turn (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-d1` | `#000400` | a lit EQ title badge: bottom corner over the band, the outer shade, which the figure has no pixel for: the nearest shade in the same figure (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-d2` | `#105529` | a lit EQ title badge: bottom corner over the band, the second shade, which the figure has no pixel for: the nearest shade in the same figure (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-d3` | `#106d3a` | a lit EQ title badge: bottom corner over the band, the third shade, which the figure has no pixel for: the nearest shade in the same figure (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-b2` | `#105529` | a lit EQ title badge: the second down the side (p106-1 at x254..369 / y2..41) |
| `--corner-title-eq-b3` | `#21aa5a` | a lit EQ title badge: the third down the side (p106-1 at x254..369 / y2..41) |
| `--badge-title-band-eq` | `#317529` | a lit EQ title badge: its 3px band (p106-1 at x254..369 / y2..41) |
| `--corner-title-fx-a1` | `#192429` | a lit DELAY, INS FX or SSMCS title badge: top corner, the outer shade (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-a2` | `#528aa5` | a lit DELAY, INS FX or SSMCS title badge: top corner, the second shade (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-a3` | `#7bc6ef` | a lit DELAY, INS FX or SSMCS title badge: top corner, the third shade (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-in` | `#7bcef7` | a lit DELAY, INS FX or SSMCS title badge: the pixel inside the top turn (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-d1` | `#081419` | a lit DELAY, INS FX or SSMCS title badge: bottom corner over the band, the outer shade (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-d2` | `#294952` | a lit DELAY, INS FX or SSMCS title badge: bottom corner over the band, the second shade (p115-1 at x254..379 / y2..41) |
| `--corner-title-fx-d3` | `#3a697b` | a lit DELAY, INS FX or SSMCS title badge: bottom corner over the band, the third shade (p115-1 at x254..379 / y2..41) |
| `--badge-title-band-fx` | `#426d84` | a lit DELAY, INS FX or SSMCS title badge: its 3px band (p115-1 at x254..379 / y2..41) |
| `--ssmcs-switch-eq` | `#4aaa31` | a lit [EQ] on the SSMCS screens: its face, darker than the EQ block's lit colour (p112-1 at x2..94 / y49..86) |
| `--ssmcs-switch-eq-band` | `#295519` | a lit [EQ] on the SSMCS screens: its 3px band (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-a1` | `#081c08` | a lit [EQ] on the SSMCS screens: top corner, the outer shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-a2` | `#296921` | a lit [EQ] on the SSMCS screens: top corner, the second shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-a3` | `#429e29` | a lit [EQ] on the SSMCS screens: top corner, the third shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-in` | `#42a229` | a lit [EQ] on the SSMCS screens: the pixel inside the top turn (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-d1` | `#081000` | a lit [EQ] on the SSMCS screens: bottom corner over the band, the outer shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-d2` | `#193510` | a lit [EQ] on the SSMCS screens: bottom corner over the band, the second shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-d3` | `#194d10` | a lit [EQ] on the SSMCS screens: bottom corner over the band, the third shade (p112-1 at x2..94 / y49..86) |
| `--corner-ssmcs-eq-fin` | `#214d10` | a lit [EQ] on the SSMCS screens: the pixel inside the foot turn (p112-1 at x2..94 / y49..86) |
| `--ssmcs-switch-comp-band` | `#6b2419` | a lit [Comp] on the SSMCS screens: its 3px band (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-a1` | `#210c08` | a lit [Comp] on the SSMCS screens: top corner, the outer shade (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-a2` | `#842d19` | a lit [Comp] on the SSMCS screens: top corner, the second shade (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-a3` | `#bd4129` | a lit [Comp] on the SSMCS screens: top corner, the third shade (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-in` | `#c54529` | a lit [Comp] on the SSMCS screens: the pixel inside the top turn (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-d1` | `#100400` | a lit [Comp] on the SSMCS screens: bottom corner over the band, the outer shade (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-d2` | `#421408` | a lit [Comp] on the SSMCS screens: bottom corner over the band, the second shade (p110-1 at x2..94 / y49..86) |
| `--corner-ssmcs-comp-d3` | `#5a2010` | a lit [Comp] on the SSMCS screens: bottom corner over the band, the third shade (p110-1 at x2..94 / y49..86) |
| `--corner-toggle-1` | `#293131` | The knob toggle's top left corner shade 1; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-2` | `#525563` | The knob toggle's top left corner shade 2; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-3` | `#101819` | The knob toggle's top left corner shade 3; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-4` | `#5a5d6b` | The knob toggle's top left corner shade 4; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-5` | `#636973` | The knob toggle's top left corner shade 5; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-6` | `#4a4d52` | The knob toggle's top left corner shade 6; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-1` | `#524563` | The knob toggle's top left corner shade lit-1; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-2` | `#9c82b5` | The knob toggle's top left corner shade lit-2; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-3` | `#ceaaef` | The knob toggle's top left corner shade lit-3; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-4` | `#211c31` | The knob toggle's top left corner shade lit-4; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-5` | `#ad8ece` | The knob toggle's top left corner shade lit-5; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-6` | `#c5a2e6` | The knob toggle's top left corner shade lit-6; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-7` | `#8461ad` | The knob toggle's top left corner shade lit-7; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-8` | `#734994` | The knob toggle's top left corner shade lit-8; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-toggle-lit-9` | `#6b418c` | The knob toggle's top left corner shade lit-9; lit while USER DEFINED KNOBS is on (x428..433 / y233..238 in p045-1, p038-4) |
| `--corner-readout-0` | `#080c08` | The knob readout bar's top corner shade 0; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-1` | `#4a494a` | The knob readout bar's top corner shade 1; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-2` | `#949294` | The knob readout bar's top corner shade 2; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-3` | `#9c9ea5` | The knob readout bar's top corner shade 3; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-4` | `#73757b` | The knob readout bar's top corner shade 4; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-5` | `#4a4d52` | The knob readout bar's top corner shade 5; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-0` | `#525563` | The knob readout bar's top corner shade udk-0; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-1` | `#7b718c` | The knob readout bar's top corner shade udk-1; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-2` | `#ad96c5` | The knob readout bar's top corner shade udk-2; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-3` | `#b59ace` | The knob readout bar's top corner shade udk-3; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-4` | `#8461a5` | The knob readout bar's top corner shade udk-4; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-5` | `#5a3d84` | The knob readout bar's top corner shade udk-5; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-right-0` | `#080808` | The knob readout bar's top corner shade right-0; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-right-1` | `#4a4152` | The knob readout bar's top corner shade right-1; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-right-3` | `#a58abd` | The knob readout bar's top corner shade right-3; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-readout-udk-right-4` | `#9482ad` | The knob readout bar's top corner shade right-4; udk on the USER DEFINED KNOBS bar, right for its right corner (x2..6 / y233..237 in p056-1, p038-4) |
| `--corner-switch-a` | `#73757b` | The first step of a top corner of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-b` | `#b5b6b5` | Its second step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-c` | `#cecece` | Its third step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-band` | `#9c969c` | The band's colour of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-band-a` | `#a5a2a5` | The first step where the face meets the band of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-band-b` | `#c5bec5` | Its second step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-band-c` | `#cecece` | Its third step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-foot-a` | `#525d63` | The first step where the band meets the ground of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-foot-b` | `#7b7d84` | Its second step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-foot-c` | `#949294` | Its third step of an unlit [ON] / [CUE] / [PRE] standing on a (74,81,90) face (p047-1) |
| `--corner-switch-glass-a` | `#424142` | The first step of a top corner of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-glass-b` | `#adaead` | Its second step of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-glass-c` | `#cecece` | Its third step of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-glass-foot-a` | `#191c19` | The first step where the band meets the ground of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-glass-foot-b` | `#6b656b` | Its second step of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-glass-foot-c` | `#948e94` | Its third step of an unlit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-a` | `#52798c` | The first step of a top corner of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-b` | `#73c6e6` | Its second step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-c` | `#84dfff` | Its third step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-band-a` | `#6bb2ce` | The first step where the face meets the band of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-band-b` | `#7bceef` | Its second step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-band-c` | `#84dfff` | Its third step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-foot-a` | `#4a5d6b` | The first step where the band meets the ground of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-foot-b` | `#5a8a9c` | Its second step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-foot-c` | `#63a2b5` | Its third step of a lit switch standing on a (74,81,90) face (p047-1) |
| `--corner-switch-lit-glass-a` | `#294952` | The first step of a top corner of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-glass-b` | `#6bbede` | Its second step of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-glass-c` | `#84dfff` | Its third step of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-glass-foot-a` | `#101c21` | The first step where the band meets the ground of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-glass-foot-b` | `#42717b` | Its second step of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-lit-glass-foot-c` | `#639eb5` | Its third step of a lit switch standing on the glass (the channel view in p090-1) |
| `--corner-switch-sunk-a` | `#606366` | The first step of an unlit switch's top corner on OSCILLATOR's sunk panel, carried over from `--corner-switch-a` by how much of the pixel the face covers |
| `--corner-switch-sunk-b` | `#b0acb2` | Its second step, carried over the same way |
| `--corner-switch-sunk-c` | `#cfc8d0` | Its third step, carried over the same way |
| `--corner-switch-sunk-foot-a` | `#404647` | The first step of its foot corner, carried over the same way |
| `--corner-switch-sunk-foot-b` | `#747377` | Its second step, carried over the same way |
| `--corner-switch-sunk-foot-c` | `#928d93` | Its third step, carried over the same way |
| `--corner-switch-lit-sunk-a` | `#4a6d73` | The first step of a lit switch's top corner on OSCILLATOR's sunk panel (x351 / y99 in p070-1) |
| `--corner-switch-lit-sunk-b` | `#73c2de` | Its second step (x352 / y99 in p070-1) |
| `--corner-switch-lit-sunk-c` | `#84dfff` | Its third step (x353 / y99 in p070-1) |
| `--corner-switch-lit-sunk-foot-a` | `#3a4d52` | The first step of its foot corner (x351 / y138 in p070-1) |
| `--corner-switch-lit-sunk-foot-b` | `#528294` | Its second step (x352 / y138 in p070-1) |
| `--corner-switch-lit-sunk-foot-c` | `#63a2b5` | Its third step (x353 / y138 in p070-1) |
| `--corner-track-dark` | `#101010` | The darkest pixel of the half-round of the ends of RECORDER's progress bars (p079-2, p081-1) |
| `--corner-track-mid` | `#212429` | A middle pixel of the half-round of the ends of RECORDER's progress bars (p079-2, p081-1) |
| `--corner-played-dark` | `#101819` | The darkest pixel of the half-round of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-mid` | `#21557b` | A middle pixel of the half-round of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-inner` | `#215d94` | An inner pixel of the half-round of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-end-light` | `#2179c5` | The light pixel of the right end, against the tray of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-end-dark` | `#29557b` | Its dark pixel of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-end-inner` | `#2182ce` | Its inner pixel of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--corner-played-end-track` | `#293542` | Its pixel beside the tray of the ends of the played part of RECORDER's progress bar (p081-1) |
| `--strip-bevel` | `#313942` | The bottom 3px of a MONITOR bus card (x5..96 / y266..268 in p067-1) |
| `--switch-band` | `#9c969c` | The bottom 4px of an unlit [ON] / [CUE] / [PRE] switch (CUE at x73 / y204..207 in p047-1) |
| `--switch-band-lit` | `#6ba6bd` | The bottom 4px of a lit [ON] / [CUE] / [PRE] switch (x20 / y204..207 in p036-1 and p047-1; x50 / y210..213 in p067-1) |
| `--mon-toggle-off` | `#cecace` | MONITOR's [CUE Interrupt] / [MONO] while off: the face (MONO of bus 2, x126..176 / y214..250 in p068-1) |
| `--mon-toggle-off-band` | `#948e94` | The same, its bottom 3px (x126..176 / y251..253 in p068-1) |
| `--mon-toggle-off-ink` | `#3a3d3a` | The same, its name (x139..175 / y228..236 in p068-1) |
| `--toggle-band-lit` | `#5a9eb5` | The bottom 3px of a lit toggle (`.btn-toggle`) and of a lit language button (MONO of MONITOR bus 1, x20..70 / y251..253 in p068-1; x80 / y81..83 in p057-1, x100 / y151..153 in p058-1 and p061-1, x200 / y155..157 in p055-1) |
| `--toolbar-sep` | `#5a5d6b` | The 2px line between the back arrow and HOME (x431..432 / y10..31 in p067-1) |
| `--chip-mark` | `#848a8c` | The copy mark at the top right of a channel name (p094-1) |
| `--toolbar-edge` | `#6b6d7b` | The 2px rule along the left and bottom of the icon row's band (x384..385 / y40..41 in p099-1) |
| `--toolbar-sep-home` | `#737584` | The 1px line before HOME on the icon row of HOME and the channel views (x431 / y10..31 in p045-1 and p047-1) |
| `--toolbar-sep-end` | `#52515a` | The row above and the row below the `--toolbar-sep` line (x431..432 / y9 and y32 in p067-1) |
| `--toolbar-corner-outer` | `#525563` | At the bottom-left corner of the icon row's band, the pixels just outside the bend of the rule (x295 / y37 and x299 / y41 in p047-1) |
| `--toolbar-corner-fade` | `#293131` | The pixels further out (x295 / y38 and x298 / y41 in p047-1) |
| `--toolbar-corner-step` | `#5a5d6b` | The step of the bend (x296 / y39 and x297 / y40 in p047-1) |
| `--toolbar-corner-dark` | `#101819` | The pixel outside the step (x296 / y40 in p047-1) |
| `--toolbar-corner-inner` | `#52555a` | The pixels inside the rule, against the face (x297 / y37 and x299 / y39 in p047-1) |
| `--toolbar-corner-inner-fade` | `#4a4d52` | The pixels further in (x297 / y36 and x300 / y39 in p047-1) |
| `--sheet-back-corner-outer` | `#848a8c` | At the bottom-left corner of a sheet's back button, the outside pixels against the sheet's ground (x389 / y54 and x392 / y57 in p100-2) |
| `--sheet-back-corner-step` | `#636973` | The step of the bend (x391 / y54, x390 / y55, x392 / y55 and x391 / y56 in p100-2) |
| `--sheet-back-corner-light` | `#a5a6a5` | The pixel outside the step (x390 / y56 in p100-2) |
| `--sheet-back-corner-inner` | `#52555a` | The pixels inside the rule, against the face (x391 / y53 and x393 / y55 in p100-2) |
| `--sheet-back-corner-inner-fade` | `#4a4952` | The pixels further in (x391 / y52 and x392 / y54 in p100-2) |
| `--sheet-back-corner-inner-soft` | `#4a4d52` | The inner end of the step (x394 / y55 in p100-2) |
| `--sheet-back-top-corner-inner` | `#3a454a` | At the top-right corner of a sheet's back button, the pixels next to the face (x444 / y16 and x446 / y18 in p100-2) |
| `--sheet-back-top-corner-outer` | `#212d31` | The same corner, the outer pixels (x445 / y16 and x446 / y17 in p100-2). The pixel at the corner itself (x446 / y16) belongs to the screen behind |
| `--radius-sm` | `2px` | The corner of small parts such as the cells of the toolbar's bank button (the top-left of the lit cell at x150 / y20 in p045-1; fitting a quarter circle to the coverage missing row by row gives radius 2). HOME's indicator block draws its corners in pixels instead (`--surface-inset-corner`) |
| `--radius-md` | `4px` | The rounded corner of buttons, dropdowns and the scene name box (the top-left of the COMP box at x254 / y2 and the Off dropdown at x306 / y49 in p099-1, and of the scene name box at x2 / y2 and the [Sends] button at x422 / y50 in p045-1; a quarter circle fitted to each gives radius 4). Value boxes, wells and sunk cells draw their corners in pixels instead (Button corners in screen-inventory.md) |
| `--radius-strip` | `6px` | The corner of the selected HOME strip, which keeps a rounded box since its frame runs round a curve (the top-right of strip 3 at x311 / y50 in p045-1; a quarter circle fitted to it gives radius 6). A strip that is not selected draws its corners in pixels |
| `--radius-lg` | `6px` | The corner of a band along the screen's edge: the bottom-left of the toolbar icon row's band (x384 / y41 in p099-1, x295 / y41 in p045-1). A quarter circle fitted to it gives radius 6. The knob readout bar and the channel view's panels draw their corners in pixels |
| `--scrim` | `#000000ce` | The shade a sheet over the screen casts on the screen below, in a browser without backdrop-filter. A browser with backdrop-filter darkens the pixels below with an SVG filter (`src/ui/scrim.ts`) that scales R by 0.204, G by 0.202 and B by 0.192 and rounds R and B to 32 steps and G to 64. The factors are fitted to the darkened pixels of p100-2, p060-2 and p051-1 |
| `--sheet-shadow-near` | `#000000b8` | The first pixel outside the shadow a sheet drops to its right and below, which the 2px offset darkens further, to 0.82 in all (p100-2, p060-2) |
| `--sheet-shadow-far` | `#00000059` | The second pixel out, darkened by 0.35. Nothing is darkened to the sheet's left or above it |
| `--page-arrow` | `#ffffff7a` | The face of the discs that step between the SSMCS screens, which the screen below shows through (x386..421 / y117..152 in p108-1: white at an opacity of 0.48, reading 123 over black, 140 over `--graph-bg` and 165 over `--surface`) |
| `--block-gate` | `#ff8629` | GATE badge (p090-1). [Clip Safe] and [SAFE] while Clip Safe is engaged take a lit GATE switch's face, corners and band as well (the operator's own) |
| `--block-comp` | `#ce4931` | COMP badge (p090-1) |
| `--block-eq` | `#29c26b` | EQ badge (p090-1) |
| `--block-ducker` | `#ff8629` | DUCKER badge (x405..464 / y57..73 in p098-1), the [DUCKER] button on the DUCKER screen (x254..379 / y2..38 in p114-1) |
| `--block-delay` | `#84dfff` | The lit DELAY name in HOME's indicator row. No figure shows it lit |
| `--block-fx` | `#84d7ff` | Lit INS FX / DELAY buttons (DELAY at x406..465 / y57..73 in p098-2), the SSMCS title badge (p108-1) and SSMCS's [Side Chain] (x251..417 / y50..89 in p111-1) and EQ band button (x107..199 / y49..86 in p112-1), and the INS FX mark on HOME's strip (the operator's own; p090-1 draws that mark pale grey, and the unit gives it the button's colour). No figure shows a lit INS FX button in the channel view |
| `--badge-off` | `#d6ced6` | Unlit block buttons (INS FX at x406..465 / y57..73 in p090-1 and p094-1) |
| `--badge-title-off` | `#cecace` | The name box in the toolbar while its block is off (INS FX in p113-1, x255..378 / y3..38) |
| `--lamp-on` | `#42d763` | The GATE / DUCKER lamp while the block leaves the signal alone (GATE in p094-1) |
| `--lamp-hold` | `#f7f73a` | The GATE / DUCKER lamp while the block holds the signal part of the way (DUCKER in p098-1) |
| `--lamp-shut` | `#de5152` | The GATE / DUCKER lamp once the block holds the signal all the way down to RANGE (p95 / p98) |
| `--meter-green` | `#3aeb73` | The meter's green zone |
| `--meter-yellow` | `#fffb42` | The upper half of a meter's bar |
| `--meter-red` | `#de5152` | The HOME strip's lit clip lamp and the reduction readout in the channel view's COMP block |
| `--transport-rec` | `#ff696b` | The dot on the recorder's [●] (x383..392 / y246..255 in p079-1), the pause's two bars while a take is paused, and the dot recording mode puts on the microSD icon and the microSD menu's [Recorder] |
| `--transport-play` | `#31eb73` | The triangle on the recorder's play (x322..332 / y243..256 in p079-2), the colour of the [Play/Pause] picture in the guide's description as well |
| `--progress-played` | `#2196f7` | The part of the progress bar on RECORDER's Play tab already played (p081-1) |
| `--meter-track` | `#292d31` | The unlit part of a meter and the clip indicator (x87 / y99..128 in p036-1) |
| `--meter-track-wide` | `#4a4d5a` | The unlit part of a wide meter. IN / OUT and the reduction bar on the dynamics screens (p099-1), HOME's STEREO/CUE meter (p045-1) |
| `--meter-track-input` | `#101010` | The unlit part of the head amp meter on the INPUT screen (p100-1) |
| `--meter-end-outer` | `#3a454a` | The corner pixels of the end row of the unlit part of a meter on the panel (x86 / y98 in p036-1) |
| `--meter-end-inner` | `#293131` | The pixels inside them and the sides of the next row (x87 / y98 and x86 / y99 in p036-1) |
| `--meter-lit-outer` | `#31514a` | The corner pixels of the end row at the foot of a bar lit green (x86 / y160 in p036-1) |
| `--meter-lit-inner` | `#31ce7b` | The pixels inside them and the sides of the row above (x87 / y160 and x86 / y159 in p036-1) |
| `--meter-top-outer` | `#313129` | The corner pixels of the end row of a 4px bar lit to its top. No figure shows a meter on the panel lit that far; the value is RECORDER's (x394 / y175 in p079-2) |
| `--meter-top-inner` | `#c5d752` | The pixels inside them and the sides of the next row (x395 / y175 and x397 / y176 in p079-2) |
| `--meter-wide-end-outer` | `#212429` | The corner pixels of the end row of the unlit part of a 6px meter on black, and the sides of the next row (x442 / y149 and x441 / y150 in p047-1) |
| `--meter-wide-end-inner` | `#424552` | The pixels inside them and the sides of the row after (x443 / y149 and x441 / y151 in p047-1) |
| `--meter-wide-lit-outer` | `#215d4a` | The corner pixels of the foot row of a 6px bar lit green, and the sides of the row above (x442 / y219 and x441 / y218 in p047-1) |
| `--meter-wide-lit-inner` | `#31db7b` | The pixels inside them and the sides of the row above that (x443 / y219 and x441 / y217 in p047-1) |
| `--meter-wide-top-outer` | `#526142` | The corner pixels of the end row of a 6px bar lit to its top, and the sides of the next row (x459 / y127 and x458 / y128 in p106-1) |
| `--meter-wide-top-inner` | `#deeb52` | The pixels inside them and the sides of the row after (x460 / y127 and x458 / y129 in p106-1) |
| `--meter-card-end-outer` | `#212021` | The corner pixels of the end row of the unlit part of a meter on `--surface-sunken` (RECORDER and INPUT) (x88 / y85 in p079-2, x188 / y152 in p100-1) |
| `--meter-card-end-inner` | `#000400` | On RECORDER's meter, the pixels inside them and the sides of the next row (x89 / y85 and x88 / y86 in p079-2) |
| `--meter-card-lit-outer` | `#213121` | The corner pixels of the foot row of a RECORDER bar lit green (x394 / y223 in p079-2) |
| `--meter-card-lit-inner` | `#29ca7b` | The pixels inside them and the sides of the row above (x395 / y223 and x394 / y222 in p079-2) |
| `--meter-input-lit-outer` | `#215942` | The corner pixels of the foot row of an INPUT bar lit green, and the sides of the row above (x188 / y222 and x187 / y221 in p100-1) |
| `--meter-sunk-end-outer` | `#293131` | The corner pixels of the end row of the unlit part of the OSC meter (on `--surface-sunk`), and the sides of the next row (x407 / y153 and x406 / y154 in p070-1) |
| `--meter-sunk-lit-outer` | `#21614a` | The left corner pixel of the foot row of the OSC bar lit green (x407 / y227 in p070-1) |
| `--meter-sunk-lit-side` | `#216552` | The left side of the row above (x406 / y226 in p070-1) |
| `--meter-sunk-lit-right` | `#195542` | The right corner pixel of the foot row and the right side of the row above; the panel's black corner is beside them (x410 / y227 and x411 / y226 in p070-1) |
| `--meter-level-outer` | `#63825a` | On a meter on the panel, the corner pixels of the row a bar's lit part starts on below the bar's top, on a row lit yellow (x86 / y116 in p047-1). RECORDER's meter takes this value too |
| `--meter-level-inner` | `#deeb52` | The pixels inside them and the sides of the next row (x87 / y116 and x86 / y117 in p047-1). RECORDER's meter takes this value too; no figure shows a RECORDER row where the yellow starts |
| `--meter-level-green-outer` | `#217d6b` | The same on a row lit green (x192 / y130 in p036-1). RECORDER's meter takes this value too |
| `--meter-level-green-inner` | `#31db7b` | The pixels inside them and the sides of the next row (x193 / y130 and x192 / y131 in p036-1). RECORDER's meter takes this value too; no figure shows a RECORDER row where the green starts |
| `--meter-wide-level-outer` | `#94b673` | On a 6px meter on black, the corner pixels of the row the lit part starts on and the sides of the next row, on a row lit yellow (x431 / y156 and x430 / y157 in p099-1). The pixels outside the corners keep the bar's unlit color (x430 / y156 in p099-1) |
| `--meter-wide-level-inner` | `#eff34a` | The pixels inside them and the sides of the row after (x432 / y156 and x430 / y158 in p099-1). INPUT's meter takes the same value (x189 / y157 and x187 / y159 in p100-1) |
| `--meter-wide-level-green-outer` | `#31ae8c` | The same on a row lit green (x8 / y182 and x7 / y183 in p037-1) |
| `--meter-wide-level-green-inner` | `#31e373` | The pixels inside them and the sides of the row after (x9 / y182 and x7 / y184 in p037-1). The OSC meter takes the same value (x408 / y171 and x406 / y173 in p070-1) |
| `--meter-input-level-outer` | `#8ca663` | On INPUT's meter, the corner pixels of the row the lit part starts on and the sides of the next row, on a row lit yellow (x188 / y157 and x187 / y158 in p100-1) |
| `--meter-input-level-green-outer` | `#299e7c` | The same on a row lit green. No figure shows one; the value is `--meter-wide-level-green-outer` moved by the difference between INPUT and the 6px meter on black on a row lit yellow (-8,-16,-16) |
| `--meter-sunk-level-outer` | `#8cae6b` | On the OSC meter, the corner pixels of the row the lit part starts on and the sides of the next row, on a row lit yellow. No figure shows one; the value is `--meter-wide-level-outer` moved by the difference between the OSC meter and the 6px meter on black on a row lit green (-8,-8,-8) |
| `--meter-sunk-level-green-outer` | `#29a684` | The same on a row lit green (x407 / y171 and x406 / y172 in p070-1) |
| `--meter-clip-lit` | `#f73d3a` | The face of a lit clip dot (x460 / y120 in p106-1) |
| `--meter-clip-outer` | `#7b1c19` | Its corner pixels; a 4px clip dot takes the same value (x459 / y118 in p106-1) |
| `--meter-clip-inner` | `#e63931` | The pixels inside them (x460 / y118 in p106-1) |
| `--gain-reduction` | `#ff8229` | The face of the gain reduction bar on a dynamics screen (x230 / y121 in p099-1) |
| `--gain-reduction-outer` | `#3a2d29` | The corner pixels of its top row and the sides of the next row (x229 / y118 and x228 / y119 in p099-1) |
| `--gain-reduction-inner` | `#d67529` | The pixels inside them and the sides of the row after (x230 / y118 and x228 / y120 in p099-1) |

## Channel colors

The channel colors that can be changed in CH SETTING. The colors themselves were taken from the rail
at the bottom of the strips in p045-1 and p048-4. At the factory every input — mono, stereo and FX —
is blue, MIX and STREAMING are orange and STEREO is red; the rest are candidates to choose in
CH SETTING.

| Color | Value | Factory assignment |
| --- | --- | --- |
| blue | `#1965ff` | Every input channel, FX 1-2 |
| orange | `#ff8200` | MIX 1-2, STREAMING |
| red | `#ce4529` | STEREO |
| yellow | `#e6e710` | (candidate only) |
| pink | `#ff499c` | (candidate only) |

The rail of a channel that cannot be used runs dark grey in place of a colour: `--strip-rail-shut`
`#393a3e`. It was taken from the ratio between the rail and the face in one picture rather than from
the colour itself, since a picture of the screen carries a display profile and its absolute values do
not line up.

## Strip rotary

The arc track that shows the value runs its centre line 1.75px inside half the graphic (17.25px on a 38px graphic), and the
dial is a circle 62% of the graphic (`inset: 19%`). The pointer turns about a point 1px below the dial's centre.

The track and the pointer turn 150 degrees either side of 12 o'clock, leaving a 60-degree gap at the bottom. The figures at
a minimum (PHONES 0.0 in p069-1, Time 2 in p063-1, A.Gain -8 in p094-6) point at -150 degrees, and the one at a maximum
(Brightness 10 in p056-1) at +150 degrees. The delay time's knobs (the four in ms, frame and the other units) turn 135 degrees
either side, their track the same length, 1 ms at -135 degrees and 1000 ms at +135 degrees (p115-1).

How a value maps to the direction:

| Knob | Mapping |
| --- | --- |
| Fader (channel, MONITOR and Sends levels) | -40 dB at 9 o'clock, 0.00 dB at 3 o'clock. The scale runs 40 steps, coarse at the bottom and fine around 0 dB, plus one step of OFF (-∞), so turning it fully down lands exactly on -∞ |
| A.Gain | A straight line through +8 dB at 9 o'clock and +55 dB at 3 o'clock |
| A.Gain (HI-Z on) | A straight line joining -8 dB at the start and +40 dB at the end (the end is the operator's own) |
| D.Gain | A straight line through -14 dB at 9 o'clock and +15 dB at 3 o'clock |
| PHONES | A straight line through 2.0 at 9 o'clock and 8.0 at 3 o'clock |
| OSCILLATOR Level | Straight runs joining -96 dB at the start, -50 dB at 9 o'clock, -8 dB at 3 o'clock and 0 dB at the end |
| Frequencies (HPF, EQ, OSCILLATOR Frequency) | Logarithmic from min to max |
| Threshold, EQ gain, PAN, Brightness, the delay time and others | Linear from min to max |

## Outside the screen

`--frame` (`#1c1f24`) and `--frame-edge` (`#2b2f36`) are the colors of the frame the screen sits in.
They are not taken from the unit; they are the simulator's own values, chosen against the page ground
(`#14161a`). The unit's chassis and knobs are not reproduced.

`--scale` (`2`) sets how many times its screen-pixel size the screen is drawn at. It is the simulator's own value, not taken from the unit. The width and height of `.lcd-frame`, the `transform: scale()` on `.lcd`, and the width of the simulator's own rows above and below the screen (`.chrome` / `.chrome-foot`) use it, and `src/style/tokens.css` is the only place that holds the value. `--zoom`, supplied by the display-scale selector and `?zoom=`, multiplies `--scale` in the `transform: scale()` on `.lcd` and in the width and height of `.lcd-frame`, and does not change the value of `--scale` ("Coordinate system" in [architecture.md](architecture.md)).

## Typeface

The unit uses a small humanist sans-serif whose capital I carries serifs. `--font` puts the bundled IBM Plex Sans
(SIL Open Font License 1.1, `public/fonts/`), whose capital I carries serifs too, first, and draws in each platform's
sans-serif (`-apple-system`, `Segoe UI`, `Meiryo`, `system-ui`) where it cannot be loaded. Each weight is drawn with
a lighter face than its name (400 and 500 with the Regular face, 600 and 700 with the Medium face). Past the serifs
on the capital I, the letterforms do not match the unit.

The font size tokens, with the ink height of the letters (the vertical extent of the pixels that differ
from the ground by more than 90 on some channel) compared between the guide and the simulator.

| Token | Used for | Ink in the guide | Ink in the simulator |
| --- | --- | --- | --- |
| `--fs-2xl` (18.5px) | The name box in the middle of the toolbar | 14px (`COMP` in p099-1, y15..28), 14px (`CH SETTING` in p092-1, y15..28) | 14px (y15..28), 14px (y15..28) |
| `--fs-xl` (15px) | EQ's type list beside [1-knob] while 1-knob is on | — | — |
| `--fs-lg` (13px) | The HOME strip's names, [ON] / [CUE] / [PRE] and level value, value boxes, knob captions, SETUP's menu entries, the channel view's marks, and more | 9px ([ON] in p047-1, y182..190) | 9px (y182..190) |
| `--fs-md` (11px) | The screen's default text (`.lcd`), the scene number, the channel view's block switches, effect type names, microSD's lists, and more | 9px (the scene number `00` in p047-1, y18..26) | 8px (y18..25) |
| `--fs-sm` (11.5px) | The +48V mark on HOME's strip, an effect's list values, and the captions of an effect whose captions carry a band's name | 9px (CH4's lit `+48V` in p047-1, y100..108) | 8px (y101..108, with CH4's +48V on) |

The token sizes and the face each weight is drawn with are chosen by the mean difference in pixels between the
captures of the compared screens and the guide's figures.

The text of a control that no token covers takes a size written straight into its rule in `lcd.css`, in half-pixel
steps, chosen by the difference in pixels between the capture of its screen and the guide's figure (the sum over
both screens when two screens share the rule). Text whose row or column differs from the guide is moved there
with `translate`.
