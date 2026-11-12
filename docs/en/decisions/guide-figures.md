# Decisions about the guide's figures

> 日本語版は [../../ja/decisions/guide-figures.md](../../ja/decisions/guide-figures.md) を参照してください.

Closed decisions about what the user guide's screen captures are taken to settle and what they are
not, with what led to them. The rules themselves are in `CLAUDE.md`, "Primary source"; how values
are taken from the figures is in [design-tokens.md](../design-tokens.md), "How the values were
sampled". A figure number is the extracted name in `reference/ug-lcd/`.

## What a figure does not settle

- **Decision**: shapes, dimensions and colours may be measured from a figure. What is listed, how
  many there are and letter case are not settled by a figure alone: they are confirmed on the unit.
- **Reason**: a figure is of the firmware, the model and the state it was captured in, and which
  those were cannot be read from it. What a figure holds within itself, such as the palette and
  the 480x272 size, can be taken from it. What stands in a row and how many depend on a state
  outside the figure, and taking the figure as evidence there goes wrong without a sign.
- **What happened** (the channel banks): the figures disagree on the number of bank cells (three
  and four on the INPUT side, one and three on the OUTPUT side), and some show CH13/14 and CH15/16,
  while the unit's inputs end at 12. On the unit's HOME the INPUT side has three banks (CH 1 - 4,
  CH 5 - 12, FX 1 - 2) and the OUTPUT side one (MIX, ST, STREAMING), and the PAD strip a figure
  shows is not on the third bank. The result is in `src/model/units.ts` and
  [screen-inventory.md](../screen-inventory.md), "Channel bank layout".
- **What happened** (a model that was not confirmed): the rule for the bank names confirmed on a
  URX44V, two lines made of three groups, was applied to a URX22 as it stood, and gave
  `CH 7 - 10, FX 1 - 2` on one line in a button wider than the others.
  [#93](https://github.com/semnil/urx-lcd-sim/pull/93) set it on two lines at the same width
  (2026-10-16).
- **What happened** (a faint element): in p074-1 the selected `02` of SCENE LIST's box is faint,
  (80,80,88), and the title is white. A faint element in a figure may be caught in the middle of a
  blink. On the unit the number alone blinks, the title stays, and nothing blinks while the row
  with the ▶ is the one selected. What blinks or lights is asked one part and one state at a time.

## Figures that are not used as evidence

- **Decision**: p036-1 is not used for HOME's [Sends]. It shows the button unlit; the unit lights
  it in the colour of where the sends go, as p047-1 and p157-1 show.
- **Decision** (2026-09-18): the title plate of p114-1 is not used for the plate's place or
  width (the look of the screen as a whole and the shape of the corners may be consulted). The
  unit keeps the gap the EQ screen has between the plate and the parts on its right. The figures
  can be told apart: the parts on the right of the toolbar start at x384 in every figure, and the
  plate's right edge is at x379, 4px away, in the figures where the plate is 126 wide (p113-1,
  p114-1, p115-1), and at x369, 14px away, where it is 116 wide (p103-1, p099-1, p106-1). The unit
  has the 14px.
- **Decision** (2026-09-18): `Brightness` in p056-1 and `Peripheral` in p061-1, set in mixed case,
  are not used for those titles: the unit shows them in capitals, as p055-1 in the same chapter
  shows `LANGUAGE`. Operation Mode in p042-1 is in mixed case on the unit as well, and its title
  and the heading of its box in SETUP stay as the figure has them. BRIGHTNESS opens with the
  Screen value framed in magenta, having one place to enter a value, as p056-1 shows.
- **What happened**: when figures were counted for and against a lit [Sends], three of those
  counted as unlit did not have the button on the printed page at all. The range the page shows
  is applied before figures are counted.

## Pixels the page does not show

- **Decision**: pixels outside the range printed on the page are not used as evidence. The ranges
  are in `reference/ug-lcd/visible.json`, and the rule is in `CLAUDE.md`, "Primary source". What a
  page hides is restored by laying the part that shows over another figure.
- **Reason**: of the 117 places the guide sets a screen capture, 29 show only a part of it through
  a clip, between 3 and 22% of the image. Extraction takes the whole image as it was before the
  clip, so the rest of it holds what the page does not print: the toolbar of p038-4 carries four
  square icons the unit does not have, and p048-5 has a STREAMING strip at a place that is not
  seen. No capture is retouched by another image laid over a part of it (the 235 drawings of an
  image in the PDF were checked against the list of its images).
- **What happened** (2026-09-14 and 15): a comparison that rested on a part the page hides was
  sent back, and on the next day hidden pixels were counted as grounds twice more: the upper half
  of p093-1 for the Color and Icon marks of CH SETTING, p048-5 and p049-1 for the unlit colour of
  HOME's [Sends], and p048-5 for the frame of the selected strip.

## A colour that changes with a state

- **Decision**: a colour that changes with a state, lit or selected, is taken from a figure only
  where the figure shows that state. Before a colour is taken, the figures are searched for one
  that shows the part lit.
- **Decision** (2026-09-20): the marks on a HOME strip take the colour of their button: INS FX,
  HI-Z and HPF cyan, Φ orange and +48V red.
- **What happened**: the INS FX mark was drawn in the pale grey of p090-1 (`#d6ced6`), a figure
  that shows the mark unlit only; the grey may have been the unlit side.
- **What happened** (2026-09-21): the docs said no image shows +48V lit and gave it another red of
  the palette, while CH 4 in p047-1 shows it lit (its core is (206,69,41), `#ce4529`). It was
  found by a scan that counts the pixels of exactly that colour in every figure, after a search by
  eye had missed it. The colour is in [design-tokens.md](../design-tokens.md).

## An icon is not chosen by pixel difference alone

- **Decision**: an icon's shape is compared by what can be read of it, such as the number of
  teeth and the depth of a notch, as well as by pixel difference (`CLAUDE.md`, "Primary source").
- **What happened**: SETUP's gear was drawn with eight teeth, and the unit's has six
  (`src/ui/icons.ts`). On 2026-09-13 the same mistake came back on MONITOR's [Setting] tab: fitted
  by pixel difference (XOR) alone, a gear of eight teeth with shallow valleys scores best.

## What the guide's text settles

- **Decision**: a point no figure settles is looked up in the guide's text before it is raised
  (`CLAUDE.md`, "Primary source").
- **What happened** (2026-09-20): four points about the microSD card that were about to be raised
  were settled by the text: the specification table gives the microSD Card Slot as WAV 24-bit
  (which the size of a recording is computed from), File list shows "the selected folder and one
  level under it", [↑] goes one level up, and Folder name display shows the end of a path that
  does not fit.
- **History**: the text differs from the unit in places too. Those found are listed in
  [known-issues.md](../known-issues.md), "What the unit itself does not do", and in
  [screen-inventory.md](../screen-inventory.md) where the screen is described.

## When two figures of one part disagree

- **Decision**: where two figures of one part disagree, the pixel difference is taken against
  both, and the operator chooses.
- **What happened** (2026-10-12, [#72](https://github.com/semnil/urx-lcd-sim/pull/72)): the two
  lines of a name on a picker sheet are 14px apart in wide/p059-1 and 16px in p100-2, and which
  did better by pixel difference was the other way round from one sheet to the next. Both were
  set out with enlargements of before and after and a table of the differences, and 14px was
  chosen for every sheet (a box on p100-1 stays at 16px). The result is in
  [screen-inventory.md](../screen-inventory.md), "Sheets over the screen".

## A question the unit can answer is answered on the unit

- **Decision** (2026-10-02): where what the unit does is not confirmed, the answer is to observe
  the unit and follow it. A question that sets "follow the unit" beside a choice made without
  looking at it is not asked; the point goes to be confirmed. What is asked is what the unit has
  no answer to: the form of what is saved, where a dialog's focus starts, whether the docs or the
  code is right.
- **History**: the points a quality audit left to be decided were asked four at a time with
  "follow the unit" among the answers. That answer was chosen fifteen times running, and was then
  given for the points still to come. On 2026-10-03 a question asked after a change, whether to
  keep a rounding of DELAY or take it out, was answered by asking whether the unit had been
  measured.

## A reading off the LCD is fitted, not copied

- **Decision** (2026-09-26): a length read off the unit's LCD is not used as it was read. One
  scale that every reading fits is looked for, and the test holds the readings and the tolerance,
  0.9 mm (`src/model/dynamics.test.ts`).
- **Reason**: a value read off the screen carries a large error, so what is built is a value that
  can be computed.
- **Decision**: before a formula is fixed, every record is put through it, those at both ends and
  those that fall on a midpoint included, and the simulator's own rounding is not taken for
  granted. Where candidates cannot be told apart (the order of a computation, `Math.round` or
  `toFixed`), one more reading is taken that separates them.
- **What happened** (2026-10-03): the speed of sound behind DELAY's four cells was corrected twice,
  343.6 to 343.589 to 343.59. The first range was worked out without the stops at both ends, and
  the second fit assumed the simulator's own nudge of a midpoint upward.
- **History**: a change of scale moves the defaults that were set from the lit rows of a figure
  (RECORDER's OUT at -15.6 and -13.5 dB, rows 54 and 60 of p081-1), and they are worked out from
  the rows again. And what the screen draws need not be the response of the sound: the bell of
  SSMCS's MID is drawn with its Q times 0.696, fitted to p112-1 (`SSMCS_BELL_Q_SCALE`), while the
  four-band EQ's bell at half its Q fits p106-1 best.

## The small button pictures in the guide's text

- **Decision**: the small pictures of buttons in the guide's running text are pixels of the LCD
  too, and the look of a state no capture shows is looked for among them. They are embedded
  images of 52x31 and 42x31 whose colours equal the captures' (a face of (74,81,90), a green
  triangle of (49,235,115)). `pdfimages -f <page> -l <page> -png` takes them out; the page is the
  three digits of a figure number.
- **Reason for care**: one image is used on more than one page (the play button in the text about
  the Play tab is the one in the text about the Record tab), so a picture is not always of the
  screen its text is about. That is said where one is used.
- **History** (2026-09-14): the mark RECORDER's [Play/Pause] carries while stopped was settled
  from one.
