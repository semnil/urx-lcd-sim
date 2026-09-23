# Screen inventory

The LCD screens shown in the URX44V/44/22 user guide (English, revision D0), and their implementation
status in the simulator. The "Ref." column is the user guide page number. IDs such as `p045-1` and
`wide/p040-2` in the text are the files of captures extracted from that page; where they are and how
they are named is in [the "How the values were sampled" section of design-tokens.md](design-tokens.md#how-the-values-were-sampled)
(`reference/` is gitignored; to regenerate, `node scripts/extract-ug-screens.mjs --pdf <user guide PDF>`).

"Screen ID" is the identifier registered in `ScreenRegistry`, and `buildRegistry()` in
`src/screens/index.ts` is the only place a screen is registered.

Which screen leads to which is drawn in [screen-map.md](screen-map.md).

## Standard Mode

### HOME / SCENE

| Screen | Screen ID | Ref. | Status |
| --- | --- | --- | --- |
| HOME (Overview) | `home` | p45-51 | Built |
| Channel bank list | `bank-select` | p47 | Built |
| Sends destination picker | `sends-select` | p51 | Built. A sheet over HOME's main area; the side rail stays HOME's |
| SCENE (menu) | `scene` | p72 | Built. Opened from the scene name at HOME's top left |
| SCENE LIST | `scene.list` | p72-75 | Built (Store/Recall and Edit) |
| Title entry | `scene.title` | — | Built. Opened from [Title] on SCENE LIST's Edit tab and from [Store] on a number with nothing stored. [Save as], [New folder] and [Rename] on SAVE/LOAD, [Rename] on RECORDER and [Format microSD] on TOOLS open the same screen as `microsd.name` ([Format microSD] titles it `Volume Label`, takes up to 11 characters and lets [OK] go on with the field empty). The guide has no figure of it |

### SETUP

| Screen | Screen ID | Ref. | Status |
| --- | --- | --- | --- |
| SETUP GENERAL (top menu) | `setup` | p52 | Built |
| Operation Mode | `setup.mode` | p41-42, p117 | Built (the screens after choosing Simple are left out) |
| Version | `setup.version` | p53 | Built (Total Version and the simulator's own APP Version) |
| License | `setup.license` | p54 | Built (the text is read from the unit) |
| Language | `setup.language` | p55 | Built (English only; Japanese and Chinese cannot be chosen) |
| Brightness | `setup.brightness` | p56 | Built |
| User Defined Knobs | `setup.udk` | p57, p152 | Built |
| Sampling Frequency | `setup.rate` | p58 | Built |
| Output Patch | `setup.patch` | p59-60 | Built (Analog / USB tabs, output source picker sheet) |
| Peripheral | `setup.peripheral` | p61-62 | Built (Main / HDMI tabs) |
| Power Management | `setup.power` | p63 | Built |
| Date/Time | `setup.datetime` | p64 | Built (popups for the date and time and for the time zone; the guide has no figure of them) |
| Software Integration | `setup.integration` | p65 | Built |

### MONITOR

| Screen | Screen ID | Ref. | Status |
| --- | --- | --- | --- |
| MONITOR top menu | `monitor` | p66 | Built |
| Monitor (Level / Setting) | `monitor.level` | p67-68 | Built |
| Phones | `monitor.phones` | p69 | Built |
| Oscillator (OSC / Assign) | `monitor.osc` | p70-71 | Built |

### microSD (URX44V, URX44)

| Screen | Screen ID | Ref. | Status |
| --- | --- | --- | --- |
| microSD top menu | `microsd` | p76-77 | Built. USB Storage Mode is on the toolbar |
| USB Storage Mode | (no screen) | p78 | A button on the microSD top menu shows a confirmation dialog, and [OK] switches the mode |
| RECORDER | `microsd.recorder` | p79-83 | Built (Record assigns tracks; Play/Edit list the card) |
| Source picker for a recording track | (no screen) | p79 | RECORDER's Source button lays a sheet over the screen, in the layout of p100-2 |
| SAVE/LOAD | `microsd.saveload` | p84-86 | Built (Save/Load and Edit list the card, and write and read settings files) |
| TOOLS | `microsd.tools` | p87-89 | Built (Format empties the card, Test reports) |

### Channel screens

| Screen | Screen ID | Ref. | Status |
| --- | --- | --- | --- |
| Channel view | `channel-view` | p90-98 | Built |
| CH SETTING | `ch.setting` | p92-93 | Built (the Icon picker is left out) |
| INPUT | `ch.input` | p100-102 | Built |
| Input source picker | `ch.source` | p100 | Built (p100's figures are a mono pair's sheet; the bus sheet has no figure) |
| GATE | `ch.gate` | p103 | Built |
| COMP | `ch.comp` | p99, p104-105 | Built |
| EQ | `ch.eq` | p106-107 | Built (parameters of the 4 bands; the curve is simplified) |
| SSMCS main | `ch.ssmcs` | p108-109 | Built |
| SSMCS COMP | `ch.ssmcs.comp` | p110 | Built |
| SSMCS COMP Side Chain | `ch.ssmcs.sc` | p111 | Built |
| SSMCS EQ | `ch.ssmcs.eq` | p112 | Built (3 bands) |
| INS FX | `ch.insfx` | p113 | Built (effect picker sheet, and the settings of the effect taken; the guide has no figure of it) |
| Parameter settings | `ch.effect` | — | Built (an FX channel opens it from its panel on the channel view; an insert is set on the INS FX screen itself; the guide has no figure of it) |
| DUCKER | `ch.ducker` | p114 | Built |
| DELAY | `ch.delay` | p115 | Built |
| SEND TO | `ch.sendto` | p116 | Built |

## What this simulator does not build

In the user guide, left out of the simulator.

Two controls: [AUTO] on the channel view's head amp and [Auto Gain] on the INPUT screen. Neither is
a setting that is on or off — both run the auto-gain routine, and there is nothing here to run. They
are drawn where the unit has them, so the screens keep its layout, and take the face, name and band
of Operation Mode's unusable Simple Mode card (`--surface-disabled` / `--menu-text-disabled` /
`--btn-bevel-disabled`). These two draw their band through the corner map (`--pb-band`), so it is
named there as well: a band left lighter than the face stops the thing reading as a button. Each
takes the touch itself (`pointer-events: auto`) where the shared rule for an unusable button lets it
through: the cell behind [AUTO] opens the INPUT screen, so letting it through would change the screen
under a touch meant for the button. Their
corner turns in the steps the measured unlit family turns in (18% / 65% / 94% across the top, 0 /
60% / 90% at the foot) taken between this face and the panel. They hold no value, so the store
carries none.

| Screen | Ref. | Why |
| --- | --- | --- |
| Icon picker in CH SETTING | p92 | The icon drawings are hard to reproduce, so they are not drawn |
| Simple Mode as a whole (Setup Assistant, use-case selection, Simple's HOME and channel view) | p117-132 | Outside this simulator |
| Screens for the Cubase series (Input settings / Hardware settings / MixKey channel editor) | p159-168 | Outside this simulator |
| Initialize All Memories (reset to the factory state) | p169 | Outside this simulator |

## Displays no image confirms

What the captures extracted from the user guide do not show. What is listed here is drawn from
instructions and inference, not from pictures of the unit. Where the drawing was later compared with
the unit, its row says so with the result and the date.

### Built, with no image at all

| Screen | Screen ID | What the images show |
| --- | --- | --- |
| Channel bank list | `bank-select` | Only HOME's bank button (p045-1 and others). No image shows the opened list. The band titles, names, arrangement, and face and name colours match the unit, and HOME showing through darkened around the list follows it (URX44V, 2026-09-22; the operator accepted small differences in position) |
| Confirmation dialog of USB Storage Mode | (no screen) | Only the button on the microSD top menu (p078-1, wide/p076-1). The guide does not show the dialog itself. The entering dialog's wording, line breaks, mark and [Cancel] / [OK], and the leaving dialog's wording and line breaks (three lines), match the unit (URX44V, 2026-09-22) |
| Source picker for a recording track | (no screen) | Only RECORDER's Source button (p079-2). The Track Count list is in p079-3. The title, names, arrangement and back button match the unit (URX44V, 2026-09-22) |
| Parameter settings | `ch.effect` | Nothing. p113-1 is [No Effect], and the middle the controls stand in is black. Rev-X Hall's rows, the readout bar's order, the value framed on opening and the value boxes without units follow the unit (URX44V, 2026-09-22) |
| An FX channel's panel and the EFFECT TYPE screen | `ch.effect` | Only the FX strip on HOME (p048-3). The arrangement follows what the unit shows |
| MONITOR's Source sheet | `monitor.level` | Only the Source button (p068-1). The guide does not show the sheet itself. The title, names, arrangement and back button match the unit (URX44V, 2026-09-22) |
| The STREAMING input source sheet | `ch.source` | Nothing. The title, names, arrangement and back button follow the unit (URX44V, 2026-09-22) |

### The screen exists, but no default state draws it

- microSD card not inserted — the captures (p081-1, p083-1, p084-1, p085-1, p087-1, p088-1) all have
  a card in, showing a file list and the free space. None shows an empty list or "No card mounted.".
  The simulator likewise starts with a card in the slot. The microSD top screen with no card follows
  the unit (URX44V, the operator, 2026-09-22): it draws no [Recorder], [Save/Load] or [Tools], writes
  `Not inserted microSD card` in white on the row they stood on, and keeps only the `microSD` title
  and the HOME button on the toolbar. The line is set at 11.5px, a size under the names [Recorder]
  and the rest carry. RECORDER, SAVE/LOAD, TOOLS, and the name entry [Save as] opens on SAVE/LOAD,
  turn into this state of the microSD top when the card goes. The name entry [New folder] and
  [Rename] open, and recording mode, do the same here. How the card goes back in is under "What moves
  but does not do what the unit does" in [known-issues.md](known-issues.md).
- What TOOLS' Format and Test do once pressed — there is no figure. They follow the unit (URX44V, the
  operator, 2026-09-22): [Format microSD] opens the keyboard screen under the title `Volume Label`,
  with the card's volume label in the field. A volume label takes up to 11 characters, and [OK] goes on
  with the field empty too; a card formatted so reads as `Untitled` on a Mac, and the unit's field reads
  `Untitled` the next time. That [OK] brings up a warning in a yellow frame with a triangle "!" mark,
  over three lines (`Formatting will erase ALL data on this card.` /
  `Formatting time depends on card capacity.` / `(Approx. 3 minutes for 128GB)`) and [Cancel] / [OK].
  The warning's [Cancel] returns to the Format screen, and its [OK] holds up a modal with the turning
  ring and `Formatting in progress...`, then returns to the Format screen. [Test microSD] starts
  without asking, holds up a modal with the turning ring and `Testing in progress...`, and shows the
  result a few seconds later.
- RECORDER's Play tab stopped or paused — the only figure is p081-1, playing. It follows the unit
  (URX44V, the operator, 2026-09-22): before a file is started and after [■], neither the counter nor
  the frequency shows, the progress bar is grey throughout, and the button left of the bar greys its
  mark. Paused, the counter and the frequency show, the bar is blue as far as the file has played, the
  file keeps the speaker, and that button's mark is white, a touch on it bringing the cursor back to
  the file. [Play/Pause] carries the green triangle in both, and the eject button can be used in both.
  The triangle follows the picture in the guide's description.
- The channel view of the STEREO bus — the channel view figures are of input channels (p090-1, p098-1
  and others) and of STREAMING (p098-2). None has the STEREO bus open. The channel selector
  (`STEREO L` / `ST`), the blocks (EQ, INS FX, BALANCE, LEVEL, CUE, ON and the meter), the left panel
  and the four cells along the foot match the unit (URX44V, the operator, 2026-09-22).
- HOME with the right-hand channel of a stereo-linked pair selected — p047-1 has the left-hand one
  selected, but no figure has the right-hand one selected. With the right-hand one selected its frame
  runs round the heart mark on its left side, as on the unit (URX44V, the operator, 2026-09-22).
- A stereo channel's INPUT screen — p100-1 is a mono channel, and p100-2 and p100-3 are the source
  sheet laid over it. CH 5/6 fed from `AUX IN`, `MIC/LINE 1/2` and `None` match the unit (URX44V,
  the operator, 2026-09-22).
- A channel with its polarity inverted — no figure shows a lit Φ, on the channel view, on HOME or on
  INPUT. The lit colour (orange), and a stereo channel's HOME mark lighting for the side it shows,
  match the unit (URX44V, the operator, 2026-09-22).

### Models

HOME's captures have three INPUT bank marks, that is, they are of a model with 10 inputs. None shows
a URX22 with two marks, and no display specific to the URX22 / URX44 is confirmed by an image.

## Head amp in the channel view

The analog head amp (`A.Gain` -8..+70 dB, -8..+40 dB with HI-Z on; [+48V], [HI-Z], [Clip Safe]) belongs to the MIC/LINE
connector, not to a channel. A channel whose input source is MIC/LINE shows that connector's head amp:
a mono channel the connector at its own place in its pair (with CH 1/2 on MIC/LINE 3/4, CH 1 is on 3
and CH 2 on 4), a stereo channel the connector of the side in view. Two channels on one connector show
the same values, and turning or switching them on either moves both. The values are kept under the
mono channel of the connector's number. A.Gain, +48V, HI-Z and Clip Safe were checked on the unit: with
CH 1 and CH 3 on the same connector, a change on one shows on the other (URX44V; A.Gain and HI-Z on
2026-09-21, +48V and Clip Safe on 2026-09-22).

On any other source a channel shows that source's `D.Gain` (-24..+24 dB). The D.Gain belongs to the
input source, not to a channel. Channels on one source, mono or stereo, show the same D.Gain, and
turning it on any of them moves it for all (so the two channels of a mono pair cannot differ, even on
`MONO x 2`). A source keeps its value while no channel is on it, and going back to it brings the value
back. As shipped, USB MAIN A / B / C and USB SUB are at -14 and every other source at 0; where the
values are kept and what they ship at is `src/model/source-gain.ts`. While the source is `None` no gain
is shown (the INPUT screen's left panel carries the level bar alone). The A.Gain stays where it was
while the source goes back and forth. What belongs to the analog head amp — the +48V
and HI-Z cells of the status panel, AUTO / SAFE, the INPUT screen's [+48V], [HI-Z], [Clip Safe] and
[Auto Gain], and the +48V mark on HOME's strip — goes away for that time too (the NOTE in the user
guide's "INPUT screen" and the description of each button). The channel view's [SAFE] is the
connector's Clip Safe, the same switch as the INPUT screen's [Clip Safe]. The decision is made in one
place, `micLineConnector()` in `src/screens/head-amp.ts`.

The head amp moves in 1 dB steps; the value is rounded to an integer and gets a `+` only when it is
above 0 (`+14` / `0` / `-8`; the readout bar shows `+14dB`). Faders keep two decimal places.

Dynamics threshold and range are integer dB (`-33dB` / `-20dB`, p099-1 / p103-1), and makeup gain
has one decimal place (`18.0dB`). A time is spelled differently for the same value: `34.58m` in the
panel's value box and `34.58ms` on the readout bar (p099-1 / p103-1). A time that can go past one
second switches to seconds from 1000 ms (`4.8s`, p114-1). No space goes before the unit. Frequency
has one decimal place and switches to kHz from 1 kHz, and a value box that has a caption shows no
unit (`80.0` and `80.0Hz`, p100-1).

HI-Z belongs to the input jack, not to every MIC/LINE connector: MIC/LINE 3 and 4 on the URX44 and
URX44V, MIC/LINE 2 on the URX22. On a channel that is not on one of those, that cell of the head amp
status panel is empty, and the INPUT screen shows no button for it. While HI-Z is on, that connector's
A.Gain runs -8..+40 dB. An A.Gain above +40 dB comes down to +40 dB when HI-Z is switched on, and stays
at +40 dB when HI-Z is switched off again (checked on a URX44V, 2026-09-22). The push-down is
`hiZWriteRule()` in `src/screens/head-amp.ts`. The knob's direction is in [the "Strip rotary" section
of design-tokens.md](design-tokens.md#strip-rotary).

When the input of a connector with Clip Safe on clips, the unit takes the input about 23 dB down and
brings it back after about 5 seconds, and the A.Gain value and knob do not come down (checked on a
URX44V, 2026-09-22). In the simulator, a reading that finds the input at 0 dB, where the meter's clip mark
lights, still shows the clip; after it the input is held 23 dB down, and let back up 5 seconds after the
last clip. A clip read while it is held down counts again, and one read as soon as it is let back up
holds it down again at once. While it is engaged, INPUT's [Clip Safe] and the channel view's [SAFE] turn
from the lit cyan to the orange of a lit GATE switch. The orange, its showing while Clip Safe is engaged,
and Clip Safe staying engaged while the clipping goes on are the operator's own. It is `clipSafe()` in
`src/screens/meters.ts`.

In the synthetic signal, a MIC/LINE connector's input rises by as much as its A.Gain does, and its peaks
start to reach 0 dB at an A.Gain of +44 dB (at the factory -8 dB it averages -58 dB). Channels on one
connector read the same input. INPUT's two meters and the meter in the channel view's input area read
before the fader, and the fader and [ON] do not move them (the Input meter in the user guide's "INPUT
screen").

The figures disagree on a space before the unit (p114-1 has `-69 dB`, p099-1 and p104-1 have
`-33dB`). The unit has no space, consistently.

## Stereo link (Signal Type)

`Signal Type` in CH SETTING is held not by one channel but by a pair of adjacent mono channels
(CH 1 and CH 2, CH 3 and CH 4), and is chosen from `STEREO` (stereo link) and `MONO x 2` (two
independent channels). Switching it on either channel's screen writes to both. The decision and the
write are in one place, `src/screens/stereo-link.ts`.

- HOME draws a heart mark in the gap between the two strips, between the pair's PAN sliders. The
  mark is drawn by the right-hand channel of the pair, and only in a bank where its partner stands
  next to it (the NOTE on p48 of the user guide; the capture is p045-1). The mark is a black circle
  (16px diameter) with a white heart (10x10px), standing where the center of the gap and the center
  of the PAN slider meet.
- At the height where the selected strip's frame reaches the mark, the frame does not break but goes
  around the mark's circumference in an arc (the capture is p047-1). The arc appears on the selected
  side and not on the other, and is drawn out to the outer edge of the straight frame (half the gap −
  the frame's width), a position that covers what the notch cuts out of the frame. The arc sits on
  the edge the way the straight frame does, so its band straddles the edge of the notch (sticking out
  by half its own width). The heart shrinks by the arc's width. For the frame itself see
  [HOME strip layout](#home-strip-layout).
- Paired or not, the meters stay one per channel, on HOME and in the channel view alike. The user
  guide's description of the LEVEL meter on p97 says a stereo-linked channel has a stereo meter, but
  the unit has one per channel.
- `PAN` / `BAL` buttons appear under Signal Type in CH SETTING while `STEREO` is chosen, and not
  otherwise (the capture is p093-1). Choosing `BAL` changes `PAN` in the channel view to `BALANCE`,
  and HOME's slider points at the same value. This choice is also written to both of the pair. The
  pair has one BALANCE, held by the lower-numbered channel (`ch.ch1.balance` for CH 1 and CH 2), and
  the two screens show the same value. With `PAN`, each channel holds its own `pan`.
- A pair set to `STEREO` comes up on `BAL` (p093-1). Each of the three transitions — into `STEREO`,
  between `PAN` and `BAL`, and out of `STEREO` — places both channels again. `PAN` puts the
  lower-numbered channel hard left (L63) and the other hard right (R63); `BAL` and unlinking put both
  in the centre (C). What is placed is the channel's own position and the position of each of its
  sends.
- A linked pair holds one set of values. A write to either channel reaches the other, and linking
  copies the lower-numbered channel's values onto the other. Unlinking puts nothing back. What each
  member keeps its own of is the head amp (A.Gain, Clip Safe, Φ, +48V, Hi-Z), the input source, the
  name, the colour, CUE, and the position outside `BAL`. Signal Type and `PAN` / `BAL` are the pair's
  and are written to both; the insert and the BALANCE stay held by the lower-numbered channel.

`src/screens/stereo-link.test.ts` pins the behavior, and "the stereo-link mark between two strips" in
`src/style/columns.test.ts` pins the mark's position.

## A MIX bus's BUS Type and Pan Link

A MIX bus's CH SETTING carries two more rows under Color / Icon / Name (p093-2). `BUS Type` is a
136px pulldown on the third row, the row Signal Type takes (the box is x77..212 / y157..196 in
p093-2), and `Pan Link` is an 86px button on the fourth, where `PAN` / `BAL` stand (x317..402 /
y209..248). The second row is empty. No other bus and no channel carries either.

- `BUS Type` is `VARI` (a level per send) or `FIXED` (one fixed level), and ships on `VARI`. Its list
  opens under the box, with `FIXED`'s face meeting the foot of the glass.
- Taking a type resets every send into that bus — the level to the bottom of its fader, and the
  switch to the side the type taken decides (`FIXED` off, `VARI` on). Taking the type back resets it
  again rather than putting back what was there.
- A send into a `FIXED` bus loses [PRE], the pan slider and `Bal` from its SEND TO cell, and its knob
  is bound to nothing. HOME's readout keeps its reading and stops turning. What goes keeps its room,
  so nothing else on the cell moves.
- `Pan Link` makes each send into that bus follow the position of its own source channel. While it is
  on the row is named `PAN` instead of `Bal` and reads the source's value, turning no more; the
  send's own placing is still held and comes back when Pan Link goes off.
- `Pan Link` works on a `VARI` bus. While the bus is `FIXED` the button keeps its place and cannot be
  taken, and its value is kept.

The decision is in one place, `src/screens/mix-bus.ts`, and `src/screens/mix-bus.test.ts` pins it.

## Knob readout bar

The bar at the bottom of the screen reaches 420px, from the same left edge as the main area (x2) to
the left edge of the side rail (measured on p113-1 / p115-1). Its three dividers stand in the gaps
between neighboring strips (x105-106 / x211-212 / x317-318), so selecting a strip lines its white
frame up vertically with the dividers. The middle two cells are one strip + one gap wide (98 + 8), and
the end cells run from there to the ends of the bar.

The bar and the knob toggle button at the right end are the same height (39px) with their tops
aligned, and the main area ends at that top. The button is 52px wide, and the knob glyph inside it is
20px and sits slightly below the button's center. The text on the label band is a dark color drawn
toward the bar's color (`--readout-label` / `--accent-udk-label`), not black.

In USER DEFINED KNOBS mode each cell shows the value of the assigned parameter and its short name
(p038-4: `-4.00` / `Monitor 1`, `-14.0dB` / `OSC Level`). The short names, the three rows of the card
and the parameter a knob moves are held by the table in `src/model/udk.ts`. A knob with no assignment
shows `---` where the value goes (confirmed on the unit). As the unit ships, bank 1 has A = Phones 1 Level and
B = Phones 2 Level, bank 2 has A = Brightness Screen and D = Oscillator Level, bank 3 has A = Monitor 1 Level
and B = Monitor 2 Level, and the other knobs and bank 4 carry no assignment; bank 1 is the one shown.
The page number circle (26px diameter) straddles the top edge of the bar and stands over the middle divider. The page-turn chevrons at the
two ends are the same purple as the bar's face, and take a larger font size because the glyph is
small for its em. On a screen with more than four parameters, the page step is a solid 8x12 chevron
(x408..415 / y258..269 in p103-1).

## Names of on/off buttons

A button that switches on and off keeps its weight whichever way it is set; the face color alone shows
the state. The switches set their names in the regular weight: [ON] / [CUE] / [PRE] (ON and CUE in p047-1),
AUTO / SAFE, the INPUT flags, the bank options and the block name boxes that switch their block. [1-knob]
sets its name one step lighter than bold, at 600 (p099-1, p104-1, p106-1), and the sample-rate buttons set
theirs bold. The block name boxes that switch nothing (INPUT, CH SETTING, SEND TO, FX1 / FX2) and the
indicator badges on HOME's strip are bold.

A name on a lit cyan face takes one of three colors. An on/off switch such as [ON] / [CUE] / [PRE] or
HDCP's [Enable] takes `--text-inverse`, a chosen option takes `--ink-on-lit`, and MONITOR's
[CUE Interrupt] / [MONO] and SCENE LIST's lit bank take `--surface`. Which face belongs to which is on
each token's row in [design-tokens.md](design-tokens.md).

## [ON] / [CUE] / [PRE] switches

The three are the same control, drawn at the same dimensions on HOME's strips, in the channel view, in
SEND TO and on OSCILLATOR: 40x40, corner radius 3px, the bottom 4px a band, the label 13px centered on
the face above the band. Lit is `--accent-on` over `--switch-band-lit`; unlit is the pale `--accent-cue`
over the opaque `--switch-band` (156,150,156) for ON, CUE and PRE alike (y204..207 under CUE in p047-1).
`btn-switch` holds the dimensions, and `btn-on` / `btn-cue` / `btn-pre` the colors. OSCILLATOR's [ON]
stands on its output's sunk panel at x350..389 / y99..138 and turns its corners over that panel (p070-1).

## Operating the knob readout bar

On the unit the bar is a readout, and values are turned by the physical knobs below it. There are no
physical knobs here, so a cell holding a value is itself the knob (drag, wheel, arrow keys). An empty
cell turns nothing.

There are four cells, so when a screen passes five or more parameters they are shown four at a time,
and `‹` / `›` appears at the end of the label band on the side where more follow (COMP in p099-1).
Pressing it swaps in the next four. Changing screens returns to the first page.

## Head amp column in the channel view

The column (x2..101, y50..227) holds, from the top: the name, the value box and knob, the input meter
to their right, the head amp status panel, and AUTO / SAFE. Measured on p094-1: value box x12..55 /
y77..98, knob 38x38 / y103..140, meter x71..74 / y78..133, status panel x6..97 / y141..186, AUTO and
SAFE 44x24 at y194. AUTO and SAFE take no side padding and centre their names on the face (AUTO at
x11..43 in p090-1).

The input meter stands in the same place on channel and bus strips alike. Buses with no head amp (FX,
MIX, STEREO, STREAMING) have no name, value, knob, status panel or AUTO / SAFE, and keep the meter
(p098-2). Touching this column opens the INPUT screen. STREAMING is the one bus it opens for; the
other buses have no input source. The name's line and the value and knob column keep their room empty, so a bus's meter also
stands at x71..74 / y78..133 (p098-2). A channel whose input source is `None` does the same, and its
status panel stays at y141.

The status panel is 2 columns by 2 rows: +48V, Φ / HPF, HI-Z for a mono channel. When the input
source is not MIC/LINE, the +48V and HI-Z cells are empty. The text is 13px, the same as
captions. A lit mark takes the colour of that item's own button: red for +48V, orange for Φ and cyan
for HPF and HI-Z. HOME's strip does the same — red for +48V, orange for Φ, cyan for HPF, and its
button's cyan for the INS FX mark.

Φ is drawn as a 10x11 mark rather than a letter, the same drawing on HOME's strip, the channel view and
INPUT's [Φ] button: a bar 2 wide runs through a ring 7 high and out of it by 2px at each end (p047-1,
y151..161 in p090-1, y113..123 in p100-1; the operator on a URX44V, 2026-09-22).

On any source other than MIC/LINE, a stereo channel's status panel carries the Φ alone, in the right
cell of the top row, with the left cell and the whole second row empty (x69..79 / y152..161 in p094-7,
x69..78 / y151..161 in p098-1). While it is on a MIC/LINE connector the +48V takes the left cell of the
top row, and on a connector with HI-Z the HI-Z takes the right cell of the second row; the left cell of
the second row stays empty (p094-5, p094-6). A
stereo channel inverts its two sides separately and the screens carry one side at a time. The Φ mark
is lit while that side is inverted, and the side is the one `‹` `›` and HOME's name area select.
HOME's strip shows the same side (x31..40 / y98..108 in p048-2, with the right half of the row
empty).

The processing block names (GATE / COMP / EQ / INS FX / DUCKER / DELAY) are switches, not labels:
pressing one switches that block on or off (60x20, the bottom 3px a shadow band, 7px from the top of
the block). A switch rounds its corners over four pixels, its top corners in three shades of its face
and its bottom corners in three shades over its band. The band's colour goes with the face: unlit
`--badge-band-off`, GATE and DUCKER `--badge-band-gate`, COMP `--badge-band-comp`, EQ `--badge-band-eq`,
DELAY and INS FX `--badge-band-fx` (p090-1, p098-1, p098-2). A switch stands 14px in from its block's left
edge, GATE's and DUCKER's 13px (the same figures). Unlit is the pale `--badge-off`, lit is the block's color, and the name is black on the
face (white for COMP). A block with a value the knob turns takes the focus at the first touch on the rest of the block and
opens that block's screen at the next: GATE, COMP and DUCKER turn their threshold, DELAY its time, and COMP and EQ their
depth while 1-knob is on. EQ with 1-knob off and INS FX open the screen at the first touch.
The touch that only brings the focus does not sink the panel, which gains its frame alone; the touch that opens the
screen sinks it.

Under the value box (44x22) a block holds: for GATE and DUCKER three 14px lamps (5px apart), for COMP two 68x4
bars (input level and reduction) with a white vertical line at the threshold, for EQ a 78x42 panel
with three vertical rules, one horizontal rule and the curve (a line two rows deep reaching both sides
of the frame, its upper row `--eq-line` and its lower row `--eq-thumb-line`, y105..106 / x302..379 in p098-1), and for INS FX the effect name. DELAY's value box is 60x22 and stands at the height of the lamp row
(x405..464 / y92..113 in p098-2). COMP's value box stands 2px right of the middle and its bars 1px, both a pixel higher than
GATE's (x227..270 / y82..103, bars y110..113 / y119..122 in p090-1), and the threshold line reaches 3px past both bars (y107..125).

While 1-knob is on, COMP's value box reads the depth in percent with a circled 1 to its left and no threshold line on the
bars (x209..224 / y86..100 in p096-2), and keeps `--accent-focus-fill` whether or not it holds the focus, and EQ carries a circled 1 at the top left of its panel and the depth at the top right
(x305..320 / y87..101 and x350..376 / y89..98 in p096-4), its curve and the area under it in `--eq-focus-edge`,
`--eq-focus-line` and `--eq-focus-fill` whether or not the block holds the focus.

The GATE lamps light by comparing the input level with the threshold (p95): the middle one yellow
while the level is below it, the right one green when above, and the left one red when the gain
reduction has reached RANGE and the gate is fully closed. No lamp lights while GATE is off.

A DUCKER can listen to every input channel, mono and stereo alike, and to the STEREO, MIX 1 and MIX 2
buses. The list names a channel by its numbers alone (`1`, `5/6`), the stereo bus `ST`, and a MIX bus
by its own name; the box over it carries the channel's own name (`CH 1`). The list is not a sheet: it
is a panel three rows by eight that opens under the box, with the mono channels along the first row,
the stereo ones along the second, `ST` at that row's far end (column 8), and the mixes on the third.
The DUCKER lamps light by comparing the level of the channel chosen as Ducker Source with the
threshold (p98): the right one green while it is at or below the threshold (not ducking), the middle
one yellow once it is above (ducking part of the way), and the left one red once it is RANGE's width
or more above (ducked all the way to RANGE). No lamp lights while DUCKER is off.

SEND TO's button is 86x38, with face `--surface-btn` and a 3px shadow band at the bottom.

## Channel screen toolbar

`‹ / channel name / ›` sits at the left end (measured on p099-1). The arrows are 40x40 (37px face + a
3px shadow band at the bottom), their chevrons reaching the edges of a 7x12 box (x19..25 / y15..26 in
p090-1), and the name's first line is in the regular weight (p098-2). The buttons are 4px apart, with face `--surface`. The name box has the channel's color
in its bottom 3px, and the same `--surface` face.

The icon row's band has a 2px rule (`--toolbar-edge`) on its left and bottom, and its bottom-left corner
is drawn in the unit's own pixels (`--toolbar-corner-*`). SETUP's gear, microSD's SD card and MONITOR's headphones are drawn pixel by pixel, each pixel at one of four
coverages in quarter steps (in p047-1 the gear at x308..329 / y10..31, the card at x353..372 / y10..31, the headphones at x398..415 / y11..30). The band's width follows the icons on it: on HOME
and the channel views it spans x295..479 and the divider before HOME is the 1px `--toolbar-sep-home`; on
the screens with a back arrow it spans x384..479 and the divider is the 2px `--toolbar-sep` with the
`--toolbar-sep-end` row above and below it; on the screens that carry HOME alone (MONITOR, SCENE, SETUP,
microSD) it spans x432..479 and its left rule stands where the divider stands. A sheet's back button draws
its bottom-left corner the same way, in the `--sheet-back-corner-*` colors.

The box's width depends on the screen: 132px in the channel view, 53px on the screens further below
it (COMP, GATE, INPUT and so on). The icon is fixed 15px from the box's left edge, and in the narrow
box the name overlaps it.

The copy mark (10x10, `--chip-mark`) stands at the top right of the name, 5px in from the box's
corner. It appears on channel and bus detail screens but not on the screens further below them (COMP,
EQ and so on) nor on CH SETTING (p092-1, p093-2). STREAMING's detail screen carries the copy mark too; the
pencil in a square that p098-6 draws in its place is not what the unit shows (confirmed by the operator).
CH SETTING's Icon box carries the chip's single-colour square in place of the icon (x221..234 / y69..82).

The channel color sits behind the name. In the narrow box the name overlaps it. A name that does not
fit in the box is clipped by the box; it does not spill over the neighboring button.

`‹` and `›` step the channel one at a time and leave the screen as it is. They step from the channel the screen is
drawing, and wrap to the other end at either end of the list. A mono input is one channel and every other strip is two, so a URX44V steps
CH 1 … CH 12, FX 1 L, FX 1 R, FX 2 L, FX 2 R, MIX 1 L, MIX 1 R, MIX 2 L, MIX 2 R, STEREO L, STEREO R, STREAMING L, STREAMING R.
The name's first line is the channel in view: a single number such as `CH 6` on a stereo input, L / R on the others. The narrow
box writes STEREO as `ST` and STREAMING as `STR`. The second line is the name set on the strip, the same on either channel. A
two-channel strip meters the channel in view alone in its gain column. The name box opens CH SETTING, but
opens nothing while CH SETTING is showing.

The screen name does not wrap.

The block name (COMP / GATE / EQ / DUCKER / DELAY / INS FX) stands in the middle of the toolbar, in
a box 116 wide and 40 high from x254 (37px face + a 3px shadow band at the bottom; p103-1, p099-1,
p106-1). Its right edge stands 14px short of x384, where the bar's right-hand group begins.
It is at a fixed position, not at the screen's center; unlit is `--badge-title-off` and lit is the
block's color. Pressing it switches the block
on or off. Each corner turns over four pixels: the top in three shades of the face with one more just
inside the turn, the foot in three shades over the band. The shades go with the colour it lights in.
The name is centered on the face excluding the shadow band, not on the box, and its text
has a size of its own for this box (`--fs-2xl`). A lit EQ box carries a curve at its
left in `--eq-badge-curve`: five 8px dots joined by a 2px line (x254..297 / y8..34 in p106-1, the first
dot cut by the box's edge). On an unlit EQ box the curve is drawn in the graph grips' ring colour, `--handle-ring`.

Channel screens that switch nothing (CH SETTING, INPUT, SEND TO) show their own name in a box of the
same height, 116px from x254. Even the longest of the names, CH SETTING, is 112px of ink and leaves
2px inside the box on each side (x256..367 in p092-1). The face is `--surface-sunken` and the text white, with no shadow band, and it cannot be pressed
(p092-1 / p100-1 / p116-1). The screens of the line opened from the toolbar icons (SETUP, MONITOR,
microSD and below) have no box and put just the text in the center (p056-1 to p078-1).

p099-1 does not draw the copy mark because the mark does not appear one level below a detail screen.
In p094-1 it is there, though hard to see where it overlaps other lines.

## The three dynamics screens (GATE / COMP / DUCKER)

The three screens share one frame (measured on p099-1 / p103-1 / p114-1). On the left is the curve
panel (x21..220 / y51..223, face `--graph-bg`, a 1px `--surface` border), to its right a 6px gain
reduction bar (x228..233 / y118..225), and at the right end the IN / OUT meters (x430..473; bars
6px, 4px apart within a meter, 12px between meters, a 6x6 clip indicator, 3px between clip and bar,
the bar body y127..225, three rows of the unit's corner shades at each end of a bar). The bar dimensions
are shared with HOME's STEREO/CUE meter. A meter draws as many bars as the strip has channels.

The reduction bar reads what the screen's own block is holding down. GATE reads its RANGE while the
signal is at or under the threshold (38 dB from the bar's top to its bottom); COMP reads how far the
curve it is drawing sits under unity (54 dB, the threshold's own range); DUCKER compares the level of
the strip named as Ducker Source against the threshold and stops at the RANGE. The OUT meter reads
that far below IN, less what the block adds back after it (COMP's makeup) — where the makeup is
deeper than the reduction, OUT reads above IN. A block that holds nothing down (DELAY, INS FX on
[No Effect]) meters IN and OUT alike. The bar and the OUT offset are worked out again by the ticker
that keeps the meters moving without redrawing the screen.

The settings panels (x250..418 / 36px high / 8px apart) stack up from the bottom of the screen. The
bottom one is level with the foot of the curve panel: DUCKER has one (Threshold), COMP two (Attack /
Release), GATE three (Attack / Hold / Decay). Value boxes are 52x22, 7px in from the right edge.

The handles (G / T / R / A / D) are 32px in diameter (face `--handle-face`, a 3px `--handle-ring`
rim), pulled in from the left and right ends of the panel by their radius. The handle touched takes the focus,
and that one alone has its rim in `--accent-focus` and `--handle-arrow` triangles on both sides of the way its value
moves (left and right for GATE's T, COMP's T and DUCKER's A and D; above and below for GATE's R, COMP's G and R and
DUCKER's R). The triangles fade out and back in over two seconds. No handle holds the focus when a screen opens.
Each handle is the control for its value and turns by a drag, the wheel and the arrow keys (b under "GATE screen" and
"COMP screen" and a under "DUCKER screen" in the user guide): GATE's T turns the threshold and R the range, COMP's T the
threshold, G the gain and R the ratio, and DUCKER's R the range, A the attack and D the decay. A drag runs the way the
triangles point, and COMP's R raises the ratio the further it is pulled down (a higher ratio takes the curve's right end
down; URX44V, the operator, 2026-09-22). While COMP's 1-knob is on no handle turns, G, T and R go to half-size rings without letters (a thin pale line
over a faint magenta face) and the curve turns magenta, the way the EQ draws its own (URX44V, the operator,
2026-09-23); while Auto Makeup is on G does not turn.
A handle held by a press carries this rim and these triangles alone, without the browser's focus ring (which shows only
when the keys move the focus there). The triangles are drawn over every handle, so no handle nearby covers them.
A handle keeps its whole disc on the graph where its value would take it over the top or under the floor, the
edge of the disc on the frame (GATE's factory -50 / -56 puts R's rim at y221..222 and the frame at y223). A
handle on the frame shows no triangle on the frame's far side.

- GATE: transfer curve. Above the threshold the level passes as is, and below it the level is lowered
  by RANGE, so two parallel lines step at the threshold. T is the threshold, R the RANGE below it.
- COMP: transfer curve. `out = in + Gain`, bent at the threshold and laid down by the ratio. The bend is rounded
  over the Knee width (Soft 52 dB, Medium 16 dB, Hard 0 dB). G and R are at the panel's left and right ends, T stands
  on the rounded curve at the threshold. Ratio takes the stops listed under "The four SSMCS screens", and only the
  reading differs: from 100:1 up it keeps a decimal place (`100.0:1`, `500.0:1`; URX44V, the operator, 2026-09-23).
  At the top stop, INF:1, the curve runs flat above the threshold (the operator, the same day).
- DUCKER: envelope. A trapezoid that goes down to RANGE while the key sounds and comes back when it
  stops. R is the height of RANGE, A and D the corners going down and up.

The transfer curve panels are -80..+20 dB on both axes, with one vertical and one horizontal rule at
0 dB. Where a rule crosses the fill under the curve it is drawn in `--graph-grid-lit` (x180 in p103-1). Each rule
covers one whole column or row of pixels (x180 and y86 in p103-1 and p099-1). The envelope panel is -100..+20 dB vertically, with a horizontal rule at the RANGE height and
vertical rules at A and D.

The reduction bar grows from the top down. COMP takes the threshold's travel (54 dB) as its full
length. GATE grows by RANGE while the input is at or under the threshold, on a 38 dB full length
(RANGE -20 dB reaches y118..174 in p103-1), and GATE's OUT meter reads that much lower than IN.

COMP and EQ have a [1 1-knob] button at the top right (x386..477 / y50..87, face `--surface-btn`, an
18px round mark with its 1 cut out in the button's face, its band `--oneknob-band` while off, its name 14.5px at weight 600
three pixels left and two low). COMP has the Auto Makeup dropdown to its left (x306..375 / y49..88) and Knee below
(x294..417 / y96..135). DUCKER has the Ducker Source caption and dropdown in the top row
(x352..418 / y52..91).

While 1-knob is on, the row stands on a panel `--oneknob-panel` reaching the right edge (y47..90): the level, framed (55x30,
x315..369 / y54..83), a line `--oneknob-link` (x373..382 / y68..69), and the button lit `--oneknob-lit` with its band
`--oneknob-lit-band` (p104-2, p106-2). On COMP the panel starts at x311 and Auto Makeup gives way to it; Knee keeps its
look and does not open. On EQ the panel starts at x179 and carries the kind
of curve first (Intensity / Vocal / Loudness, a 124x38 pill `--oneknob-type` ending at x306) in place of the band's shape,
and each grip is a ring of about half the size, without its name, drawn in the pale `--accent-cue` and hollow on the
graph's ground `--graph-bg`, that picks nothing. The curve's line turns from the green `--eq-line` to the magenta
`--accent-focus`.

1-knob's Level rewrites the EQ's four bands ("How 1-knob EQ works" in the user guide). It takes the four gains as they
stand when 1-knob goes on, or when Intensity is chosen while it is on, and Intensity's Level sets each gain to that gain
times Level / 50 (as set at 50, flat at 0, twice at 100). Choosing Loudness sets LOW to Bell, Q 0.56, 90 Hz, L-MID to
Q 1.00, 400 Hz, H-MID to Q 1.00, 2 kHz and HIGH to H.Shelf, Q 1.00, 6 kHz with no gain, and its Level gives each percent
+0.20 dB to LOW, −0.20 dB to L-MID, +0.02 dB to H-MID and +0.10 dB to HIGH. Choosing Vocal sets LOW to HPF, 80 Hz, L-MID
to 335 Hz, H-MID to 3 kHz and HIGH to Bell, 8 kHz (Q 0.71 on all four) with no gain, and switches LOW off. Its Level
follows a table a percent at a time: LOW comes on and its corner climbs from 80 Hz to 140 Hz, L-MID falls to −6.0 dB,
H-MID rises to +2.0 dB, and HIGH rises to +2.0 dB at 77% and is back at 0 by 93%. Every gain lands on a tenth of a dB
(an exact half toward +) and stops at ±18.0 dB. Switching 1-knob off leaves the bands where the Level put them.

The figures disagree on the number of IN / OUT meters on the dynamics screens. For the same mono
channel, p099-1 and p106-1 draw two, and p103-1 and p113-1 draw one. The unit draws one for a mono
channel, so the count follows the strip's channel count. An FX channel is the one block whose two
sides differ — one bar in and two out — because it is fed by one bus and returns a stereo pair.

## The effect screens

INS FX and an FX channel's effect are chosen with the effect-name button and set on that same screen.
The INS FX screen is the effect's settings screen, ready to turn the moment it opens (URX44V, the
operator, 2026-09-23). Steps 3 and 4 of the guide's "Operating the insert from the HOME screen
(Overview)" have an effect area that opens the parameter settings screen; the unit takes no such step.

An FX channel has no INS FX screen in between. Its panel on the channel view is three lines — the
channel's name (FX1 / FX2), a blank one, and the effect it is running — and the name is a label
rather than a switch, set in white across the middle of the panel (URX44V, the operator,
2026-09-22). Touching the panel opens the parameter settings screen, whose toolbar carries
the effect-name button (with the popup mark) and the channel's name between the channel arrows and
the back button. The screen the effect is chosen on is headed `EFFECT TYPE`. The HOME strip does not
name the effect.

When the sampling frequency puts every effect an FX channel offers past its ceiling (FX 2 at
176.4 / 192 kHz), that strip keeps **the first line of its name row** and nothing else: no colour
mark, no second line, and none of the indicators, meter, [ON] / [CUE], rotary or level reading under
them. The strip's own face stays, and the rail along its foot is drawn dark grey in place of the
channel's colour. The strip can still be selected, and touching it no longer opens the channel view.

The guide carries no figure of either, so **the arrangement is this project's own**. What the guide
does fix is that the controls stand in the middle of the screen (the middle of p113-1 is what
[No Effect] leaves empty) and that the input/output meters stand at the right.

The parameter settings screen holds eight controls to a page, four across and two down. The cells are
the 86x82 the DELAY screen uses, at x12..412 / y53..225 on an 8px row gutter, the second row starting
at y143. The columns follow the rule the oscillator's boxes follow: each one stands over the division
of the knob readout bar that reads it (x12, 116, 222 and 326, each within 0.5px of its division's
middle). A cell carries a 15px caption over its control, and a value that moves continuously
carries the 38px knob that turns it under the control. A value box is the 60x22 box the DELAY
screen's cells use, corners and all; a pulldown and an on/off switch take a 78x22 box. Each page
fills in fours from the lower row up: a page of four or fewer stands in the lower row (the second
page of Rev-X Hall, HPF and LPF), and a page of five to eight puts its first four in the upper row
and the rest in the lower one. The knob readout bar reads a row at a time, the lower row first, then the
upper one, each value in the division under its own panel: a division under a panel with nothing to turn
stays empty, and a row with nothing to turn takes no page of the knobs. The divisions follow the panels
as they do on every other screen (the operator's instruction, the same day). A page frames the first value
the bar reads as it opens or is stepped to. On Rev-X Hall this matches the unit (URX44V, the operator,
2026-09-22). M.B.Comp does not use these panels at all: it is drawn in the frame the channel's own COMP
takes (see "M.B.Comp's four pages"). Clean is laid out as the unit lays it out (the operator,
the same day): the first page's upper row is Volume / Distortion / Blend / Output and its lower row Treble /
Middle / Bass / Presence, the second page's upper row Cho, Off and Vib / Gate / SP Type and its lower row Speed /
Depth / Gate Level / Mic Position. Cho, Off and Vib take the upper row's first two places (the two tracks and the
gap between them, 190px), three buttons side by side with no caption, the one taken lit in the cyan
`--accent-selected` (the third reads `Vib`; the operator, the same day). Gate has no caption and carries `Gate` on its
own button, the dark button Cho, Off and Vib use, rounded on its left end as on its right since it is not one of a row, and as wide as a panel, 86px (the operator's instruction, the same day). Cho, Off and Vib, Gate, SP Type and Mic Position stand on the glass with no panel under them, their buttons and
lists 36px high, nine tenths of the toolbar's 40px effect name. SP Type and Mic Position set their caption in the
dark grey `--text-muted` 4px apart over the list, stand caption and list at the foot of their place, and run their
list the width of the readout bar's division under it (x317..420 under the last column). The upper row's SP Type comes
down until its list ends 8px over the lower row's
Mic Position caption, and the upper row's Cho, Off and Vib and Gate end where that list begins (the operator's own
instruction, the same day). Gate lights cyan when on, as Cho, Off and Vib do (the operator, the same day). The 4px
between a foot list and its caption and the 4px under a foot list are the simulator's own, there being no figure.
Crunch, Lead and Drive are laid out as the unit lays them out too (the operator, the same day): the first page's
upper row is Type (Amp Type on Drive) / Gain / Master (empty on Crunch) / Output and its lower row Clean's Treble /
Middle / Bass / Presence. The second page leaves Clean's Cho, Off and Vib, Speed and Depth empty and stands Gate,
Gate Level, SP Type and Mic Position where Clean does, drawn as Clean draws them. Type and Amp Type are not lists but
a value box over a knob, and turning the knob steps from one name to the next (the operator, the same day).
Mono Delay's layout is the unit's too (the operator, the same day): page one carries HPF / LPF / empty / empty in the
upper row and Delay / FB.Gain / Hi.Ratio / empty in the lower, page two Sync / empty / empty / BPM in the upper row
and three empty places and Note in the lower. The readout bar reads Delay / FB.Gain / Hi.Ratio / empty on page one
and HPF / LPF / empty / empty on the page stepped to from there, and three empty divisions and BPM on page two. Sync,
as Gate does, has no caption and carries `Sync` on its own button. Note is a list with no panel under it, as wide as
a panel, 86px, its caption and list standing at the foot of its place with the 4px between them and the 4px under
the list SP Type and Mic Position take (all the operator's own instruction, the same day). Sync stands at the height
Gate does, and Note's caption is the dark grey SP Type's is (the operator, the same day). Ping Pong takes Mono
Delay's layout too (the operator, the same day). Rev.R3 stands as the unit stands it as well (URX44V, the operator,
2026-09-23, read on Hall; the three faces are built the same): page one Density / FB.Gain / E/R Delay / E/R Bal. in the
upper row and Rev.Time / Ini.Delay / Hi.Ratio / Diffusion in the lower, page two HPF / LPF in the lower row.
A pulldown with six options or more opens on a sheet rather than under its box. Note opens no sheet: its list opens
to the left of its box, three rows of five (the operator's instruction, the same day; its place confirmed by the
operator the same day), over as little as it can:
2px clear of the Note box (x326..412) and of the readout bar (y233), at x60..324 / y107..231. The list is 264px wide,
wider than the room left of the box (from Sync's right end at x98 to the box), so its left end lies over the foot of
Sync (x60..98 / y107..122).
Every control but Cho, Off and Vib takes one place, and a list value whose name does not fit its panel (Pitch Fix's `Harmonic Minor` and the like)
ends in `…`, as every other name too long for its box does; the whole of it is on the sheet. The
block's own input and output meters stand at the right (x430..473), in the place and at the size the
dynamics screens give them.

A value box and a reading print the number alone, with no unit (Hz, kHz, s, ms, dB, %), and the knob
readout bar under the screen keeps the unit, both as the unit does (URX44V, the operator, 2026-09-22). FB.Gain
and Pitch Fix's Coarse, Fine and Formant carry no `+` over zero and a `-` below it, in the box and on the bar
alike (the operator, the same day).

An effect with more than eight controls takes further pages, stepped by the round 36px page buttons
SSMCS uses, in the place SSMCS puts them (x4 and x386 / y117), where they lie over the corner of the
panel at that end. The end with nothing beyond it draws no button. The page goes back to the first when the effect is chosen again and when the screen is opened
from the channel view's panel (INS FX or an FX channel).

### Pitch Fix's three pages

Pitch Fix stands on three pages too (URX44V, the operator, 2026-09-23). [Correction] stands in the top
right corner of each (x390..476 / y50..78, where COMP's [1 1-knob] stands). A page that carries a name
writes it on a strip two panels wide (x12..202 / y106..130, the readout bar's own face and ink), over the
panels the name covers.

Page one carries Coarse / Fine / Formant in the lower row's first three places, under the `Pitch` strip.
Coarse is in semitones and Fine in cents, and the unit prints neither unit, in the box or on the bar; the
bar alone spells the first row `Coarce`.

Page two uses no panels: MIDI Control / Key / Scale stand down the left as a caption over a pulldown
(100 wide, 36 high, at y5, y67 and y128), and an octave of a keyboard stands beside them (x141..420 /
y90..219, seven white keys and five black). All twelve notes carry a 26px circle with the note's name,
drawn in [1 1-knob]'s lit face where the correction takes the note and in the face of the pulldowns
beside it where it does not. Touching a circle turns that note over and takes the Scale to `Custom`.
Choosing a named scale fills the twelve in, and so does changing the Key while one is named. While the
Scale reads `Custom`, neither choosing `Custom` again nor changing the Key moves them, and nothing takes
the Scale back out of `Custom` on its own (URX44V, the operator, 2026-09-23).
The readout bar is empty.

Page three carries Limit Low / Limit High / Speed / Tolerance in the lower row under the
`Note Limit Low/High` strip, and Mix in the upper row's third place. The readout bar reads the lower row
first and Mix in the third division of its second row.

### M.B.Comp's four pages

M.B.Comp sets out no panels: like the companders it is drawn in the frame the channel's own COMP takes
(URX44V, the operator, 2026-09-23). It has four pages, stepped through by the same round
arrows the other effects use.

The first page carries the bands themselves. The plot runs frequency across it (20 Hz to 20 kHz,
logarithmic) and band gain up it. Each band is filled from the crossover beside it to the next, as high as
its gain: Low in the transfer curve's own line colour, Mid and High in theirs. Five grips stand on it — L,
M and H at the middle of their band, moved up and down for its gain, and LM and MH where two bands meet,
moved across for the crossover. Out Gain stands to the right on a panel of its own (caption, value box and
the picture of a knob). The readout bar reads Low Gain / Mid Gain / High Gain / Out Gain.

Pages two to four are LOW, MID and HIGH, a band each. The plot is that band's transfer curve, its line and
fill the band's colour, with T (threshold) and R (ratio) on it. Down the right stand the band's name, its
[Bypass] button and the Attack and Release rows, where Release is the whole effect's. The readout bar reads
Threshold / Ratio / Attack / Release.

The measures come from the unit's own screens (URX44V, 2026-09-23). The curve's plot stands further left
than the other dynamics screens put theirs, from x4, and keeps the same 200px width; only the first page's
graph is wider, at 265px. Three reduction bars, 6px wide and 6px apart, stand with `GR` and `L M H` set
above them, their feet level with the plot's foot, in the middle of the gap between the plot and whatever
stands to its right (x211 on a band's page, x280.5 on the first). The open band's bar carries a white frame,
1px, a pixel clear of the bar and following its rounded ends. The Out Gain panel stands 68px from the right
edge.

The readout bar reads Low Gain / Mid Gain / High Gain / Out Gain on the first page, and L-M Xover /
M-H Xover on its second row (Release is not there). A band's page reads Threshold / Ratio / Attack /
Release, with that band's own Gain at the left of its second row. Every page frames the value it sets out in
a box: Out Gain on the first, Attack on a band's.

Switching 1-knob on hands the bands, Release, L-M Xover and M-H Xover to the unit: the boxes keep their
readings and take no touch, [Bypass] leaves the page, and the knob strip carries its Level alone. The grips
on the plot go to half-size rings without letters, drawn in a thin pale line, their face and the curve's fill
a faint magenta and the curve's line magenta, as the EQ's do under its own knob. The channel's own COMP
draws G, T and R the same way while its 1-knob is on. A grip, its rim included, stays inside the plot's
frame.

Clean's Speed and Depth look and turn the same whichever of Cho / Off / Vib is chosen (the "Not available when "Cho"
is On." of "CLEAN Only" in the Effect Reference Guide is about the sound; URX44V, confirmed by the operator on
2026-09-22). While Sync is on, Mono Delay and
Ping Pong set Delay (Delay Time on Ping Pong) to the Note's value counted at the BPM (a quarter note is 60000 / BPM ms),
worked out again when Sync goes on and whenever Note or BPM moves, and stopping at the ends of the delay's range
(0.1..2700.0 ms on Mono Delay, 1.0..1350.0 ms on Ping Pong) ("Delay Section" in the Effect Reference Guide). The Delay
row keeps its usual face and still turns under Sync; turning it leaves Sync on, and the next move of Note or BPM takes
it back to the note's length. Switching Sync off leaves the time where it is. Sync changes nothing about what the
Note box shows or what its list offers, and at 60 BPM no note value in the Note list is out of reach (URX44V,
confirmed by the operator on 2026-09-22). With Sync off a move of the Note leaves the time alone (the Note is the
value "when tempo sync is enabled"). The Note box and its list draw note values as notes: the list carries 15, row by row from the top left three rows of
five, `---` at the top left in words and the other 14 as the seven-row pixel glyphs of the note under the Mono Delay
table in the Effect Reference Guide (URX44V, confirmed by the operator on 2026-09-22). Drawing a glyph pixel as two
screen pixels, and each of the list's options at the 48x36 of the Ducker Source list's, are the simulator's own sizes,
there being no figure (`NOTE_PIXELS` in `src/ui/icons.ts`).

Compander-H and Compander-S are the two effects that are not laid out in panels: they take the frame
the channel's own COMP takes. The curve fills the left, the reduction meter stands beside it, then
Attack, Release and Ratio, and the block's own input and output meters at the far right. This layout and the
two pages of the readout bar under it were held against the unit and match (URX44V, the operator, 2026-09-23). Those boxes
are narrow, so they print the millisecond as `m`, as the channel's own COMP does; the readout bar
keeps `ms`. The values
go on the readout bar four at a time, over two pages: Threshold, Ratio, Width and Gain on the first,
Attack and Release on the second.

The curve carries three grips. (T) stands on the threshold's corner and moves it left and right. (W)
stands at the foot of the band (Threshold − Width) and **widens the band when it is dragged left**,
since it stands where the value's mirror is (URX44V, the operator, 2026-09-22). (G) stands at the top right of the plot, a ring's width in
from the right frame, and moves Gain up and down. Each takes the pink border when it is touched, and
turns by a drag, the wheel or the arrow keys.

To keep the discs readable, (W) stops half a disc short of (T) — its value goes on, its grip does not —
and stays a radius in from the left frame. (G) keeps its place: the threshold at its ceiling still
leaves more than half a disc between them. They are drawn (W), (T), (G), so (G) is the one on top where
they meet.

A compander's settings fit one screen. As with every effect, the INS FX screen is that screen: the
grips, the value boxes and the readout bar all work there.

The curve holds the output at **the crossing of the rules** (0.0dB in, 0.0dB out). Gain's ceiling is
0.0dB, and there the line runs flat along the rule across the plot from the crossing to the right edge;
lowering Gain takes that flat top, and the whole line with it, down by the same amount. From the
crossing down to (T), Ratio lays the slope down; between (T) and (W) — the band, as wide as Width — it
is 1.0:1; and below (W) it falls harder still, at a slope that belongs to the effect: **5:1 for
Compander-H and 1.5:1 for Compander-S** (measured; neither Width nor Ratio moves it).

### Choosing an effect

The band across the sheet reads `EFFECT TYPE` whatever channel it was opened from. On an insert's
sheet [No Effect] stands alone on the first row and the effects start at the left of the row under it,
four to a row. An FX channel has no [No Effect] and its list runs three to a row, so the three reverbs
fill the first row and Mono Delay and Ping Pong the second.

What a channel can take is the guide's "Effect list". What it cannot take is still on the sheet,
drawn on a face that does nothing when touched. Three things put an effect out of reach:

| Why | Which |
| --- | --- |
| The sampling frequency is past its ceiling | Pitch Fix to 48kHz; the guitar amps, the companders and M.B.Comp to 96kHz; FX 2's effects to 96kHz |
| The channel is carrying one stereo signal | The four guitar amps and Pitch Fix |
| Another channel is holding the same one | One holder for the four guitar amps, one for Pitch Fix, one for the two companders, and one shared by M.B.Comp and the two companders across the outputs |

An input channel's compander and a bus's M.B.Comp hold different slots, so the two run at once, and while one bus runs
M.B.Comp the other buses can take nothing (URX44V, the operator, 2026-09-22).

Taking an effect switches the block on and fills the effect with the unit's own settings; taking the
same one again puts them back. While the channel reads [No Effect] the INS FX switch does nothing.

Raising the sampling frequency past an effect's ceiling takes the insert off the channel, which then
reads [No Effect], and lowering the frequency again does not put it back. An FX channel has no
[No Effect] to fall to, so the effect it is running stays, and while the frequency is past the
ceiling nothing on its sheet can be picked. Moving Signal Type takes the insert off both channels of
the pair whichever way it moves. A stereo-linked pair shares one insert, held on the lower-numbered
channel.

## DELAY screen

Frame rate offers 24 / 25 / 29.97D / 29.97 / 30D / 30 / 60 / 120, on a sheet two across and four down.
`D` is drop frame, and the number in a rate's own name is what converts a time into frames. The time
itself does not change.

Measured on p115-1. The top row has the Frame rate caption (x15..76), the dropdown (x100..166 /
y48..87, its value 20px in from the left and its ▼ a 9x6 `--drop-mark` at x151..159 / y64..69) and `Frame / s` (from x178). Below it is the `Delay Time` band (x12..411 / y110..133, face `--dialog-sheet`). Four
86x84 cells are spaced evenly across the band's width (x12..411 / y144..227), each holding a unit
name, a 60x22 value box (y163..184) and a 38 knob stacked vertically. One time is shown four ways, in ms / frame /
meter / feet, and turning any of them moves the same value (sound travels 0.343 m = 1.125 feet in one
millisecond).

## EQ screen

Measured on p106-1. At the top left is the box of the selected band (x2..56 / y49..86, face
`--accent-band`, its name 14px bold on one line, centred, HIGH at x12..45 / y62..71; the middle bands read L-MID and H-MID), in the middle the filter shape box
(x283..376 / y50..87, its ends half circles of 19px radius, face `--shape-box` inside a 1px
`--shape-box-edge` line, no shadow band, its ▼ 9x8 at x356..364 / y66..73), and [1 1-knob] on the right. The shape box names the shape with a
30x20 outline rather than a word (Bell is a lens in the middle of a flat line, x310..339 / y60..79 in
p106-1). LOW picks from Bell, L.Shelf and HPF, HIGH from Bell, H.Shelf and LPF, and LOW MID and HIGH MID keep Bell (their box keeps
Bell and its ▼, dimmed to an opacity of 0.5, and a press opens nothing). On a width of 30, L.Shelf brings its upper and lower lines together from x11 into one at x18, and HPF
climbs from the bottom left to x13 and runs flat from there; H.Shelf and LPF are their mirror images. A press on the box opens a
column of buttons the size of the box, 94x38, each carrying an outline alone, the chosen shape cyan and the others the list's
`--surface`. Below them is the 416x138 graph (x2..417 / y93..230): the horizontal axis
is 20 Hz..20 kHz logarithmic, the vertical axis ±20 dB. The rules are at 100 Hz / 1 kHz / 10 kHz and
±10 dB / 0 dB. The handles of the four bands stand at their own frequency and gain, and pressing one
puts that band on the knobs. Dragging one moves its frequency across the graph and its gain up it, and puts that
band on the knobs too (e under "EQ screen" in the user guide). A handle's name is 13.5px in the regular weight in the middle of its ring (p106-1). The handle of the band on
the knobs carries a 6x8 triangle on either side, 3px outside its ring and level with its middle (y130..137 in p106-1).
The triangles fade out and back in over two seconds.
The knob readout names a band as the band box does (`L-MID Q`, `H-MID Gain` and so on). The rules are 1px on whole rows, and the curve's line is `--eq-line`.

A press on the band box at the top left switches the band on the knobs on and off (b under "EQ screen" in the user
guide). The box of a band that is on has the `--accent-band` face; the box of a band that is off has the pale face of a
strip's unlit [ON], `--accent-cue` with `--text-inverse` over `--switch-band`. A band that is off keeps its values and
adds nothing to the curve, and its handle stands where its values put it on the graph's own ground, `--graph-bg`, its
name in its ring's colour, `--handle-ring` (both `--accent-focus` while the band is held). The channel view's EQ
thumbnail leaves it out too. While 1-knob is on the box is not drawn.

## The four SSMCS screens

A MONO IN channel whose COMP / EQ type is SSMCS has them. The channel view puts one SSMCS area where
the COMP and EQ areas stand (`ch.<id>.compEqOrder` reads `SSMCS`). A stereo, FX or bus channel has no
type, so nothing is swapped.

The two types are separate banks inside the unit and are not kept across a switch. Taking a type
**loads that bank's factory values whole** — entering SSMCS switches COMP and EQ on and puts every
SSMCS value back, and entering COMP -> EQ puts the compressor, the four-band EQ and the EQ 1-knob
back. **The bank being left keeps its own** until it is entered again. GATE does not depend on the
type and does not move. Taking the type it already holds does nothing. The four screens are stepped through by the round arrows that lie over
the sides of the glass; a press replaces the screen rather than stacking on it, so one back arrow
leaves for the channel view. An arrow is a 36x36 disc (face `--page-arrow`, white at an opacity of
0.48, at x2 and x384, y67) carrying an 8x12 chevron in `--lcd-bg`. The first screen has no arrow
back and the last none forward.

Main (measured on p108-1). Two blocks across the top (face `--surface`, corner `--radius-lg`): COMP
165x90 at x0/y0 and EQ 237x90 at x173/y1. A block's switch is the small 60x20 box the channel view
puts on its blocks, COMP's at x4/y7 and EQ's at x7/y7. The thumbnails inside stand on `--graph-bg`,
COMP's 81x73 at x69/y7 and EQ's 159x75 at x73/y7. Each thumbnail is drawn in a coordinate space its
own size and carries its own rules: the compressor's at 0.8 across and 0.2 down, the EQ's at 100 Hz /
1 kHz / 10 kHz and +10 / 0 / -10 dB. At the right edge of the COMP block is a 4x56 gain
reduction meter (x155/y14). Two panels below (face `--surface-sunk`, corner `--radius-lg`): Comp
Drive 86x84 at x10/y94 and Morphing 300x84 at x114/y94. The name, the value and the knob line up on
the 86px column at the panel's left: the name 13px, two pixels left of centre (y2), the value box 52x22 (x17/y19), the
knob at x20/y46. The Morphing panel carries the Sweet Spot Data button beside them (202x37, x198/y117,
face `--surface-on-sunk`, its copy mark 11x11 4px from the right and 5px from the top). A press drops
a sheet of the 34 names, two to a row.

COMP (measured on p110-1). The [Comp] title box at the top left (93x38, x0/y-1: 35 rows of face over
a 3-row band). The curve stands in a 200x132 frame (x19/y40, 198x130 inside it) and is drawn in a
198x130 coordinate space of its own, -80..+20 dB both ways: GATE and COMP draw the same axes in
198x171, and stretching one into the other would put the rules between pixels. Its rules are 1px, the
vertical at 0.8 across and the horizontal at 0.2 down. At its left is a meter of the signal the side
chain listens to (6x106, x5/y69) and at its right the gain reduction meter. Down the right are the
Knee pulldown (124x37, x292/y46) and the Attack and Release rows (169x36, x248/y94 and x248/y138).
Two handles, D and R, stand on the curve. D turns Comp Drive and R the ratio: D raises its value the further it is
pulled left and R the further it is pulled down (more drive takes the corner left, a higher ratio takes the curve's
right end down; URX44V, the operator, 2026-09-22).

COMP Side Chain (measured on p111-1). The same frame, with the [Side Chain] switch at the top right
(167x40, x249/y0, `--block-fx` over a `--badge-title-band-fx` band when on) over three rows (x248 at
y49 / y94 / y138). The rows read Q, Frequency and Gain; the knob readout bar reads SC-Q, SC-Freq. and
SC-Gain. The curve is the compressor's own, not the filter's, and carries no handles: c under "COMP
Side Chain screen" in the user guide displays it, where c under "COMP screen" sets the compressor by
operating it directly.

EQ (measured on p112-1). The [EQ] title box at the top left (93x38, x0/y-1) and the band button
beside it (93x38, x105/y-1, the title box's own lit face and band). The graph is the same 416x138
frame the EQ screen uses, and the bands are the three L, M and H. LOW and HIGH are shelves, MID a
bell. Dragging a handle moves its frequency across the graph and its gain up it (c under the SSMCS EQ screen in
the user guide).

The ranges: Comp Drive 0.00..10.00 in steps of 0.05, Morphing 0..120, Out Gain ±18.0 dB in 0.1,
Ratio 1.00:1..INF:1 (sixty stops of 0.05 from 1.00:1 to 4.00:1; from there 4.00..4.90 in 0.1, 5.00..6.80 in 0.2, 7.00..9.50 in 0.5,
10.0..20.0 in 1 and 22.0..38.0 in 2, then 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 80.0, 90.0, 100, 150, 200, 300,
500 and INF; every stop URX44V, the operator, 2026-09-22 and 23; read to three figures: two places under 10, one under
100, whole from 100, and the top carries its `:1` too, `INF:1`), Attack 0.092..80.000 ms, Release 9.3..999.0 ms, Knee Soft / Medium / Hard, Q
0.50..16.00, frequency 20 Hz..20 kHz in twelfths of an octave (LOW to 1002 Hz, HIGH from 501 Hz), and
gain ±18.0 dB.

The compressor makes up no gain. Under the corner the curve runs at the height of the input, and Out
Gain is the only thing that lifts the whole of it (p110-1 reads -76.9 dB out for -76 dB in and
-13.8 dB out for -0.2 dB in, which is the straight pair of a corner at -19.8 dB and a ratio of
3.30:1). The knee reaches further over the corner than under it: Soft 26.3 dB up and 24.3 dB down,
Medium 10.0 and 8.5, Hard nothing either way. The MID bell takes the width of a biquad whose Q is
0.696 of the Q shown, which fits p112-1 (at Q 1.12 and a gain of +7.0 dB the largest difference over
the figure's 18 points is 0.72 dB).

The user guide names the channel view's SSMCS area but shows no figure of it. It is one block over
the two columns COMP and EQ had, carrying the same two curves the main screen draws, at the same
proportions (81:73 and 159:75), on the same ground and the same rules.

## INPUT screen

Measured on p100-1. The top row has the Input Source caption and the source box (x96..231 / y53..92,
with a copy mark). Below are two 203x128 panels (x2..204 and x209..411, y101..228, face
`--surface-sunken`). The left panel holds +48V and HI-Z (60x20, HI-Z at x112..169), the A.Gain caption, a 44x22 value box
and a 38 knob, with Clip Safe and Auto Gain (68x24) to the right. The right panel holds Φ and HPF (x326..383),
and the same three pieces for HPF Freq. The unlit arc of these knobs is `--meter-track-input`. An unlit button is `--badge-off`, its bottom 3px is the same
shadow band as on other buttons, and its name is centered on the face excluding that band. The lit
color is red for +48V (`--accent-phantom`), orange for Φ (`--accent-phase`), and `--accent-on` for
the rest.

The two input level bars (6px, x187..192 and x394..399) stand in the same place whether or not the
panels have content.

What the screen shows depends on the strip.

| Strip | What it shows |
| --- | --- |
| Mono channel (source MIC/LINE) | Everything |
| Mono channel (a source other than MIC/LINE and None) | Input Source, Φ, HPF, D.Gain, HPF Freq., level bars |
| Mono channel (source None) | Input Source, Φ, HPF, HPF Freq., level bars |
| Stereo channel (source MIC/LINE) | Input Source, +48V, HI-Z (on a connector with it), A.Gain, Clip Safe, Auto Gain, Φ, level bars |
| Stereo channel (a source other than MIC/LINE and None) | Input Source, Φ, D.Gain, level bars |
| Stereo channel (source None) | Input Source, Φ, level bars |
| STREAMING | Input Source, level bars |
| FX / MIX / STEREO | Level bars |

The two panels are shown for each strip in the table. On a strip with no head amp their contents are
empty, and the bars stay where they are.

A stereo channel's [Φ] stands in the left slot of the right panel, where a mono channel's [Φ] stands
(x232..291 in p100-1), and inverts the side the screen's header names. No capture shows a stereo
channel's INPUT screen.

The Input Source box breaks a source's name where the source sheet's button breaks it: `MIC/LINE 1/2`
over the two lines `MIC/LINE` and `1/2` (p100-1). `AUX IN`, `USB MAIN A`, `USB SUB` and `HDMI` on one
line and `USB DAW 1/2` and `microSD Playback` over two match the unit too (URX44V, the operator,
2026-09-22).

STREAMING's Input Source box drops not the channel input list but the buses it can be fed from inside
the mixer — STEREO at the left end of the first row, MIX 1 / MIX 2 on the second. Unlike the list
MONITOR's Source button drops, it has no None. The
channel list's name band carries the mono pair; the bus list's carries the strip.

## Panel knobs

A knob is 38x38 on any screen; the outer arc is 3px thick with its outer diameter touching the knob's
edge. The face is 24px in diameter. PAN and BALANCE light from the center of the travel and carry a 3x3
cross over the top of their ring (x246..248 / y190..192 in p098-1). Head amps and faders light from the
bottom (D.Gain lights from the bottom though it runs -24..+24, p098-1). A LEVEL knob's face is
(181,190,206) and the other knobs' (189,194,214) (p090-1, p094-1, p098-1, and p047-1 for HOME's strips).
The pointer starts 8% of the face's diameter in from its edge and is 37% of the diameter long.

The PAN / LEVEL panel (86x84) has, on the sunken face `--surface-sunk`, a 13px caption, a 52x22 value
box (`--well-deep`) and a 38 knob, in that order.

## Two rows of the channel view

The main area is cut into two 84px rows, 10px apart, and the lower row ends 5px above the knob readout
bar (measured on p090-1: upper row y50..133, lower row y144..227, top of the bar 233). It is not a
layout that fills the remainder, so the margin above the bar does not collapse.

## SEND TO destination tabs

STEREO / MIX 1-2 / FX 1-2 are stacked on the rail at the right of the screen, the selected one in
`--accent-menu` and the others in `--surface-toolbar` (p116-1: x422..479, each 54px high, 6px apart).
The destinations of the group the tab chose line up as cells. The rail shows only the groups that
strip has a send into: a channel has STEREO, MIX 1-2 and FX 1-2, an FX return has STEREO and MIX 1-2, and a MIX bus
reaches the stereo bus alone and so shows no tabs (the table under the side menu in the user guide's
"SEND TO screen"). A strip that has no send into the group last picked shows its own first group and
leaves the pick alone.

A send's tap (PRE / POST) is taken against the stereo bus's own fader, so a send into the stereo bus
is that reference and carries no tap: [PRE] goes from its cell, keeping its room. The placing stays.

A cell is a column like a HOME strip, 98px wide and 181px high: under a 36px `--surface-raised` band
naming the destination come [ON], [PRE], the send's own pan slider, and `Bal` with its value (measured
on p116-1: ON y95, PRE y146, slider y197, value y207..228). The send level is not in the cell; the knob
and its readout bar hold it.

Tabs on the rail are 57px high and 3px apart for SEND TO, and 52px high and 7px apart for the menu
screens (MONITOR, SCENE, OSCILLATOR, Software Integration). The SEND TO tabs and the menu tabs have a
3px shadow band at the bottom. A SEND TO name on two lines leads 21px, and a name stands a pixel above
the middle of its tab, two on two lines (STEREO at y73..82, MIX 1-2 at y122..131 and y143..152 in p116-1).

Sends ship **open** with nothing going through them: the switch on, the level at the bottom of the fader, the tap after the fader, the pan centred.
When the level is at the bottom the value is written `-∞`, with no unit (it is not a dB number).

## OSCILLATOR's OSC

A mode's 86x84 parameter cells stand over the division of the knob readout bar that turns them. A mode's
parameters end on the second division, so Burst Noise's Width stands over the first (x12..97) and Interval,
like Sine Wave's Frequency, over the second (x116..201), the cells at y144..227. The output panel
(x326..411) stands over Level in the fourth division (p070-1, p070-2).

## OSCILLATOR's Assign

The eight destinations stand as 90x40 boxes in four columns and two rows: the columns start at x16 at a
98px pitch (a 90px box and an 8px gutter), the top row at y57 holds MIX 1 L / 1 R / 2 L / 2 R and the
bottom row at y155 holds FX 1 / FX 2 / STEREO L / STEREO R. [Clear All] stands under the last column at
x310 / y225 in the same 90x40. An assigned STEREO box carries the face `--accent-bank-out` over the band
`--accent-bank-out-bevel`, with its name in white (p071-1). An assigned MIX or FX box takes the colour HOME's [Sends]
tab takes for that destination (`--accent-sends-mix` for MIX, `--accent-sends-fx` for FX), over the same darker cast
of its own face as the tab (URX44V, confirmed by the operator on 2026-09-22). The unassigned boxes and [Clear All] take the face,
band and corners of a button standing on the glass (74,81,90). Out of the box only STEREO L and STEREO R
are assigned. While the sampling frequency is 176.4 or 192 kHz FX 2 cannot be assigned (the NOTE under Assign in
"Oscillator menu" in the user guide): the FX 2 box leaves the screen and its place stays empty, the other boxes where
they are. The assignment is kept, and the box comes back as it was once the frequency is 96 kHz or lower (URX44V,
confirmed by the operator on 2026-09-22).

## MONITOR's Setting buttons

[CUE Interrupt] and [MONO] stand one under the other below [Source]. [CUE Interrupt] is 90px wide
(x6..95 and x112..201, y163..199) and [MONO] is 4px narrower at 86px on the same centre (x8..93 and
x114..199, y214..250). Off, they take the pale face `--mon-toggle-off` with the name in
`--mon-toggle-off-ink`; lit, the cyan face with the name in `--surface` (p068-1).

## Sheets over the screen

A picker sheet (input source, output source, recording source, MONITOR's Source, INS FX, Color) drops a
shadow to its right and below: the first pixel outside the sheet is darkened by 0.82 and the second by
0.35, and nothing to its left or above (`--sheet-shadow-near` and `--sheet-shadow-far`). Of its corners,
the two on the ground turn in 6px and the two on the toolbar in 5px. The top right corner is drawn by
the way out: the panel leaves that corner square, the button turns it in three pixels
(`--sheet-back-top-corner-*`), and the pixel at the corner itself is left to the screen behind
(p100-2, p060-2).

The Sends destination sheet lies over HOME's main area and darkens what it does not cover (toolbar,
side rail, meters) with `--scrim`. The [Sends] button that opened the sheet stays bright (measured on
p051-1: the toolbar face (66,73,82) becomes (8,12,16), while [Sends] stays (206,69,41)). It is
declared with `dimsBehind` on `ScreenDef`, and the screen marks what stays bright with `is-lit`. A
dialog (wide/p040-2) does not darken what is behind it.

[Sends] on HOME's rail is always lit in the colour of the destination in view (STEREO red in p047-1, MIX 1 orange in
p157-1), the same as the unit shows. p036-1 draws it unlit, and that figure is treated as wrong.

## Top of the side rail

The rail starts at a different height depending on the screen. On HOME, MONITOR (Level / Setting),
SEND TO and the Sends sheet it starts right below the toolbar (y50); on the others (OSCILLATOR, SCENE
LIST, Output Patch, Peripheral, Software Integration, RECORDER, SAVE/LOAD, TOOLS) it starts 6px lower
(y56). The rule cannot be derived from the captures, so each screen declares it with `sideAtTop` on
`ScreenDef`.

A tab's name is 14.5px at weight 600, and OSCILLATOR's and SEND TO's tabs set theirs in the regular weight (p067-1, p079-2, p084-1, p087-1,
p059-1, p073-1; OSCILLATOR in p070-1, SEND TO in p116-1).

How high a tab sets its name depends on the screen. Below is the distance from a tab's top to the bottom
of its name's ink, leaving out the tails of y and g.

- The first tab of RECORDER and TOOLS (Record, Format) is 44px, and the tabs after the first on
  RECORDER, SAVE/LOAD and TOOLS are 3px higher at 41px (p079-2, p081-1, p083-1, p084-1, p085-1, p087-1,
  p088-1).
- SCENE LIST's Edit and MONITOR's Level and Setting are a pixel higher at 43px (p073-1, p067-1, p068-1).
- OSCILLATOR's OSC and Assign are 44px, with Assign's glyph a pixel higher (p070-1, p071-1).
- Of the names on two lines, SAVE/LOAD's Save/Load leads 16px (ink ending at y88 and y104, p084-1) and
  SCENE LIST's Store/Recall 12px (y89 and y101, p073-1).

Output Patch's two tabs stand a pixel closer than the others, the second starting at y114 (p059-1,
p060-2).

## Meter color zones

A meter's bar is green over its lower half and yellow over its upper half, and the bar itself carries
no red. What lights red is the clip dot above the bar, when the level reaches the top of that meter.
The boundary sits at the middle of the bar (on a bar an odd number of rows tall the middle row is
yellow) and does not move with the meter's length or min/max. Only the part below the level is lit and
the boundary stays at the middle of the bar itself, so the zones do not move as the level moves and the
unlit part carries none of their color. The level is taken to a whole row.

The ends of the bars and clip dots are drawn pixel by pixel in the shades the unit draws its corners in.
A 4px part colors the end row's two corner pixels and the sides of the next row; a 6px part colors the
end row's two corner pixels (the pixels outside them take the ground) and the sides of the next two
rows. The colors for each meter ground are the `--meter-*-outer` / `--meter-*-inner` tokens in
`design-tokens.md`. The corners of a bar lit to its top take the values of the figures that show one,
p079-2 (4px wide) and p106-1 (6px wide), for the meters of that width, and a lit clip dot's corners take
p106-1's values at either width. COMP's gain reduction bar is drawn the same way, its top end in
`--gain-reduction-outer` / `--gain-reduction-inner`.
Where the lit part stops short of the bar's top, the row it starts on and the sides of the rows under it
are drawn the same way (on a 6px part the pixels outside the end row's corners keep the bar's unlit
color), and each row takes the shades of the yellow or the green it is lit in. The colors are the
`--meter-*level-*` tokens.

The figures disagree on where the meter's color zones are. The figures that light yellow above
green with the boundary at the middle of the bar are p036-1, p037-1, p045-1, p047-1, p048-5, p048-6,
p067-1, p081-1, p090-1, p094-1, p098-1, p098-2, p099-1, p103-1, p104-1, p106-1, p108-1, p110-1,
p111-1, p112-1 and p115-1. The figures whose green runs past the middle are p048-1, p049-1, p051-2,
p051-3, p094-2, p094-5, p113-1 and p114-1; of these, p051-3 also lights yellow, and turns yellow at
69% of the bar on its STEREO/CUE meter (bar y149..219). In p106-1 the OUT meter is lit yellow up to
the top of its bar, with the clip dot above it red. The implementation follows the middle (the
"Meter color zones" section).

## STEREO/CUE meter

It stands below [Sends] on the rail. The box is x422..475 / y113..227, and the outline of the frame
that appears when CUE is raised (2px, `--accent-on`) is exactly the box's outline. The frame is drawn
inside the box, so it changes neither the box's size nor the positions inside it. The box has two
rows, a 27px name band and an 80px bar, and the band keeps its height even when no name shows. So
lighting or clearing CUE moves none of the rail's other controls ([Sends], the knob mode button). On
the unit, too, the bar stands at the same x441..456 / y140..219 for STEREO (p045-1) and CUE (p051-3).

The name `CUE` sits at the bottom of the band (`--fs-md`; x437..460 / y125..135 against the unit's ink
at x437..459 / y126..134). The plate of the trash can (CLEAR CUE) hangs over the top right corner at
18x18 and cuts the frame under it (on the unit the top edge breaks right of x458 and the right edge at
y113..128). The name is drawn over this plate, so the plate does not hide the text.

The trash can glyph is pushed to the plate's top right and drawn at 12x14. It is a filled glyph of its
own, sized so its edges land on whole pixels (shrinking a 24-unit line drawing makes it half as dense
overall and misses the unit's face (132,227,255)). On the unit: handle x466..469 / y112, lid
x462..473 / y113..114, body x463..472 / y115..125.

The bar is the same "wide meter" as the IN / OUT meters on the dynamics screens: 6px per bar, 4px apart
within a meter, a 6x6 round clip indicator, 3px between clip and bar, the ends of the bars and
the clip indicator drawn in the unit's corner shades, ground `--meter-track-wide`.
The two places share one rule.

What sits on the rail does not shrink when its neighbors push it (`flex-shrink: 0` on `.side > *`).
Fixing the height of the part that grows is not enough while another part can shrink, since the whole
rail moves.

## Toolbar icon row

HOME's icon row (SETUP / microSD / MONITOR / HOME) stays on the screens one level from HOME. Those are
the channel view (p090-1) and the Sends destination sheet (p051-1), declared with `toolbar: "home"` on
`ScreenDef`. The channel bank button belongs to a separate declaration (`bankButton`), and HOME and the
bank list show it.

The row reaches the right edge of the screen, lays out 40px cells 4px apart, and has a 1px divider
before HOME (the box is x297..479; the glyph centers are 318.5 / 362.5 / 406.5 / 455.5). The title is
centered on the screen, not on the remaining width. When a screen shows something left of the icon
row, it returns it as `headerRight` in `ScreenBody` (microSD's card eject button, x329..374 / y2..38).

The BRIGHTNESS and PERIPHERAL titles are upper case throughout. p056-1 and p061-1 draw them as `Brightness` and
`Peripheral`, but the unit shows upper case for both, and those two figures are treated as wrong (p055-1, in the same
chapter, draws `LANGUAGE` in upper case). Operation Mode's title and the SETUP box caption are mixed case as p042-1
and p041-1 draw them, matching the unit.

## Toolbar back arrow

The back arrow is for going back to the screen beneath, and does not appear on a screen that has only
HOME beneath it. SETUP, microSD and MONITOR opened from the toolbar icons, SCENE opened from the scene
name, and the channel view one level from there show just the HOME icon (wide/p072-1, p078-1, p066-1,
p090-1). Screens two or more levels down (VERSION, SCENE LIST, CH SETTING, INPUT and so on) show the
arrow and a divider (p053-1, p073-1, p092-1, p100-1). The decision is by stack depth, not a per-screen
declaration, and `Escape` goes back on every screen.

## SETUP screen

Measured on p041-1. `SETUP` sits at the center of the toolbar with the section name `GENERAL` below it,
14px in the regular weight and a pixel left of the screen's center, their tops at y13 and y38. At the left end is the
Operation Mode box (x7..130 / y2..41, face `--surface`, a 3px shadow at the bottom, the `Operation Mode`
line and the mode name line centered). The `Operation Mode` caption is 9px at weight 500 in `--caption-pale`, and
the mode name is in the regular weight (p041-1).

The four GENERAL items sit on a tray of their own (x31..448 / y54..107, face `--menu-tray`), as 100x46
buttons 3px apart. The rest are stacked in three 120px columns (13px apart) from x47, 46px high at
y112 / y166 / y220. A name on two lines leads 18px (the left column of the second row in wide/p052-1, its ink
starting at y120 and y138). A name on one line, in the middle column of the third row, has its ink at
y236..245 on a face (without the band) of y222..260 (wide/p052-1).

The Operation Mode screen spaces its toolbar title 0.05em apart and sets it a pixel higher than other screens do
(x184..294 / y16..29 in p042-1).

Over the mode options stand two frames for each mode's HOME drawn small (x31..230 on the left and x250..448 on the right, both
y54..166 in p042-1). Standard Mode's frame on the right holds a still of the current HOME at 0.4146 times its size, and Simple
Mode's frame on the left is a 1px `--surface` line alone (Simple Mode's HOME is left out). The still is a copy of a shell drawn
from the same store and then let go; it carries no ids, is hidden from assistive technology and holds no Tab stop. Simple Mode is left out, so its
option is disabled for good, drawn as an entry out of reach (face `--surface-disabled`, ink `--menu-text-disabled`, band
`--btn-bevel-disabled`), where p042-1 shows it chosen.

LICENSE takes the text's first line as its heading, 15px bold over a 1px `--text` rule (x31..372 / y79 in p054-1), and sets
the rest as paragraphs at 12px leading 17px, a line's worth apart. The text starts at x32 (p054-1). The words are the
simulator's own terms.

POWER MANAGEMENT turns Time with the fourth knob (p063-1). [Enable] sets its name at 13.5px and, unlit, takes the face
`--surface-btn` and band `--btn-bevel-plain` HDMI's [Enable] takes (x18..103 / y101..140 in p063-1). A value card's knob at the bottom of its range keeps a lit dot at
the start of its track (x357..359 / y223..225 in p063-1); a channel screen's knob shows no such dot at the bottom (p115-1).

DATE / TIME sets the date and the time on [Date/Time] at 12px, the city on [Time Zone] at 13.5px in the middle of its box,
and the format lists' values at 12.5px, and stands the `Date` / `Time` headings over the two lists at 13px, 2px above
them (p064-1).

The clock keeps a moment that runs with the computer's clock and shows it in the time zone [Time Zone] is set to,
so a new zone moves the date and time on the button; a unit as it ships is on Tokyo. A zone keeps its standard
time all year, with no summer time, as the unit does ([known-issues.md](known-issues.md)). [OK] on the
[Date/Time] dialog sets the clock to the start of the minute the dialog holds, in that zone, and it runs on from
there. The dialog's Day stops at the last day of the month its Year and Month hold (28 in February 2026), and a
Day past it comes down to that day as the Year or Month turns (both confirmed on the unit). The clock keeps
running through a reload, and a settings file does not carry it (it carries the time zone and the display
formats).

SOFTWARE INTEGRATION sets `Post Fader Send for FX` at 13px in the middle of the band's width (x18..401) and `for FX1` /
`for FX2` at 12.5px from x136, both in `--peripheral-text`, and sets its toolbar title at 12.5px (p065-1).

LANGUAGE sets a button's name as two 13px lines, 日本語 over Japanese, and the chosen language's button
carries its name in `--ink-on-lit` (p055-1).

## VERSION screen

VERSION lists two rows, departing from p053-1 by decision: Total Version, the firmware version of the unit
the simulator stands for (V1.3.1.0), and APP Version, the simulator's own version read from
`package.json` behind a lower-case v that sets it apart from the firmware version. They stand where p053-1 sets its left column's first two rows: names from
x28, colons at x124 and values from x129, the rows 36px apart with the ink of the Total Version row starting
at y73. Names and values are the same 13px in the regular weight.

## USER DEFINED KNOBS and LANGUAGE screens

Under each USER DEFINED KNOBS column stands a 55x54 picture of the knob, left edges at x26 / 130 / 238 / 342
and y208..261 (p057-1). Its rim runs from `--udk-dial-rim-top` down to `--udk-dial-rim-bottom`, and the face
inset 9px inside it from `--udk-dial-face-top` through `--udk-dial-face-mid` and `--udk-dial-face-low` to
`--udk-dial-face-bottom`, edged 1px in `--udk-dial-edge`. The picture is drawn on the screen, so it is not
the unit's physical knob; it turns nothing.

LANGUAGE offers only English: the simulator's messages are in English, so [Japanese] and [Chinese,
Simplified] are disabled for good, drawn as an entry out of reach (face `--surface-disabled`, name
`--menu-text-disabled`, band `--btn-bevel-disabled`), where p055-1 draws them usable.

## Section bands

A section heading stands on a pale, square-cornered band `--dialog-sheet` in the dark ink `--surface-dim`,
13.5px in the regular weight. OUTPUT PATCH (ANALOG / USB), Peripheral (USB Main / HDMI), POWER MANAGEMENT
and SOFTWARE INTEGRATION set it at x18..401 / y56..79 (p059-1, p061-1, p063-1, p065-1), and DELAY sets
`Delay Time` over its cells at x12..411 / y110..133 (p115-1).

On OUTPUT PATCH the output captions are 13px in `--text` over their buttons, and [Default] is an
86x40 button at x314..399 / y225..264 with its name 13px at weight 600 (p059-1). [Default] asks first ([Cancel] /
[OK]), and [OK] takes the outputs on its own tab alone back to the sources they ship on (b under "Output Patch menu"
in the user guide); [Cancel] changes nothing. The dialog carries the i mark and `Reset to Default?`, the same on
either tab (URX44V, confirmed by the operator on 2026-09-22). On Peripheral's USB Main
the caption stands at x63 / y94..106 and the note at x66 / y165..177, both in `--peripheral-text`, the
caption 13px at weight 600 (p061-1). On HDMI the HDCP caption stands at x45 / y87..95 over an 86x40
[Enable] at x18..103 / y101..140, drawn on the plain face `--surface-btn` with the band `--btn-bevel-plain`
while off, and Input Audio Channels stands at x63 / y157..169 over its pair at x62..359 / y178..217 (p062-1).

## Button shadows

A button's bottom 3px is a shadow band, and its name is centered on the face excluding that band. This
holds for menu items, language and Operation Mode options, dropdowns and plain buttons (measured on
p041-1 / p078-1).

The band's colour follows the face. Under a (74,81,90) face it is `--btn-bevel`, (49,57,58). A button that cannot be
used takes `--btn-bevel-disabled`, a source button on the sunk face `--btn-bevel-sunk`, and [Follow USB] and a USER
DEFINED KNOBS knob card `--btn-bevel-plain`. An unlit block button's (214,206,214) face stands on a band 27% darker,
(156,150,156). CH SETTING's Color options and the channel bank list's items (the bank on display included) stand on
their face taken down by `--px-band-cast` (31%).

A control with a band (a button, or a panel such as a channel view block or a UDK card) sinks while a pointer holds it,
and while Enter or Space is held down on it with the focus: the band goes, and the face above it slides down the band's
depth (3px, 4px for [ON] / [CUE] / [PRE]) over 30ms to cover where the band was, the ground showing over it. The cut
runs along the control's own edges: pixel-drawn corners draw the face's top corners again at its sunk foot, and a part
rounded by the browser has the cut rounded at its four corners as the face is. While a key holds it down, the focus ring
stays where the control stands. When the screen is drawn again while the key is down, the control the focus comes back to sinks in
its place. When the focus moves elsewhere while the control the key went down on is still on the screen (a dialog the
key opened taking the focus to its [OK], say), that control comes back up and the one the focus moved to does not sink.
The shell reads which control has a band from its computed `box-shadow` at the moment it is pressed
(`src/ui/press.ts`), so a control given a band sinks with nothing more to do. A control out of reach does not sink.
Under `prefers-reduced-motion` the slide is not animated.

microSD's [USB Storage Mode] has the same face as other buttons, and turns `--accent-selected` while
the mode is on (p078-1 shows the mode on). While the mode is on the toolbar's HOME keeps its usual look and goes HOME,
and the other screens open (URX44V, confirmed by the operator on 2026-09-22; how the user guide differs is under "What
the unit itself does not do" in [known-issues.md](known-issues.md)).

## RECORDER

A Record tab slot's meter shows the level of the slot's source whether or not a take is recording (c under Record
in the user guide's "RECORDER menu"). A pair is metered channel by channel, a bus in stereo. p079-2 is not
recording: the meter of the slot set to STEREO is lit, and the slots set to CH pairs stay dark. The toolbar's
[Track Count] stands at x7..130 / y2..38, its name near the left and its ▼ against the right (p079-2).
Its list prints all eight in two columns of four (p079-3). How many tracks the recorder carries is set
by the sampling frequency — 16 at 44.1 / 48 kHz, 8 at 88.2 / 96 kHz and 2 at 176.4 / 192 kHz. The
counts it cannot carry stay in the list, drawn on a face that takes nothing. **Raising the frequency
lowers the count to that ceiling, and lowering the frequency again does not raise it back.** The drop
happens when the frequency moves, and three paths move it — the SAMPLING FREQUENCY screen, a settings
file being loaded, and a unit coming back from storage. This [Track Count] is the only way back up. The copy mark on a slot's Source button is drawn in 1.5px lines of
`--rec-copy-mark`, 1px in from the button's top right (x378..387 / y185..194 in p079-2). A take
moves through four states in turn. When the screen opens it is stopped, and the middle transport button carries the
green triangle, which does nothing when pressed. A press on [●] arms the recorder, and the ● fades out and back in over
two seconds (half the pace of a held EQ band's triangles). A press on the middle triangle while armed starts the take,
and the ● stops lit. While a take records, the sampling frequency (x15..59) and the running time (x187..233) stand over
the progress bar at y235..244, and the middle button carries the pause's two white bars instead of the green triangle
(x320..331 / y243..256 in p079-1). The running time moves on every second while the take records, rewritten in place
without rebuilding the screen. A press on the bars pauses the take; while paused the running time stands still and the
bars are the ●'s red, `--transport-rec`, and a press on the red bars records again, the running time going on from
where it stood. A press on [■] ends recording and returns the screen to the state it opened in. A second press on [●]
while armed does the same as [■], and [●] does nothing while a take records or is paused.

Armed, recording or paused, the recorder is in recording mode. [Track Count] and the eject button keep what they show
on the face of a button that cannot be used (`--surface-disabled`, their name and mark `--menu-text-disabled`) and do
nothing when pressed, and the Record / Play / Edit tabs and the slots' Source buttons look as they did and do nothing when
pressed. Recording mode goes on off the RECORDER screen, and a 14px dot of `--transport-rec` stands at the lower right of
the microSD icon on the HOME and channel view toolbars (x364..377 / y22..35) and left of the name on the microSD menu's
[Recorder] (x62..75, 4px from the name). On the microSD menu everything but [Recorder] ([Save/Load], [Tools], [USB Storage Mode] and the eject
button) takes the face of a button that cannot be used and does nothing when pressed.

TOOLS carries the card-eject button on its toolbar as well (p087-1). [Format microSD] on the Format tab opens the
same keyboard screen the title entry uses, under the title `Volume Label`, with the card's volume label in the
field; it takes up to 11 characters, and [OK] goes on with the field empty too (the volume label is then
`Untitled`). [OK] brings up a warning with the dialog's frame and mark in `--dialog-caution`, and the warning's
[OK] holds up `Formatting in progress...` for 5 seconds, then empties the card and makes what is typed its volume
label. [Test microSD] on the Test tab holds up the modal `Loading...` uses, reading `Testing in progress...`, for
3 seconds. Once the test has run, `Result : A` stands
right of the button, and below it Card specs, BUS Interface, UHS Speed Class, Speed Class, 2 Tracks Recording and
Multi Tracks Recording, one line every 25px, the grade and the two recording lines in `--test-pass` (p088-2). The
report's values are the ones the guide's figure shows.

[Play/Pause] plays the file selected in the list; pressed while it plays, it pauses, and pressed again it goes back to
playing that file. Another file plays once [■] has stopped this one (the NOTE under Play in the user guide's "RECORDER
menu"). What plays is a two-track file on a card in the slot; with a folder or a file of four tracks or more selected,
the button does nothing (the NOTE under Record in the same section).

[Play/Pause] keeps its (74,81,90) face whether a file plays or not, and changes its mark. While a file plays the mark
is the pause's two white bars (x320..331 / y243..256 in p081-1); while nothing plays it is a green triangle. The
triangle follows the picture in the guide's description, the same image as the Record tab's play button.

The counter and the sampling frequency show over the progress bar only while playback holds a file, playing or
paused. Their line keeps its height while they do not show, so the bar stays where it is (URX44V, the operator,
2026-09-22). The button left of the bar (three lines and a ▶) carries a white mark while a file is held, and a touch on
it brings the cursor to that file (f under Play in the user guide's "RECORDER menu"). With no file held it stays on
the plain face with its mark greyed, as [↑] does, and a touch on it does nothing.

While a file plays, the card-eject button cannot be used (a dimmed face in p081-1, the plain face in p083-1). The
Play tab lists folders and the files that play, and leaves a file of four tracks or more off; its marks are a folder,
a file that plays, and the file playing or paused (a speaker). The Edit tab lists a file of four tracks or more as well, marked
`4tr` to `16tr` (List icons under Play and Edit in the user guide's "RECORDER menu"). Neither tab lists a file recorded
at another sampling frequency than the unit is running (the NOTE under Play in the user guide; on a URX44V a 48 kHz
take was on neither tab at 44.1 kHz and back at 48 kHz, the operator, 2026-09-22). Changing the frequency lets go of
a paused file too (checked on SETUP's Sampling Frequency the same day); a settings file that brings another frequency
does the same here. SAVE/LOAD marks a file with a
page, its corner folded down, carrying two lines (p084-1).

## What is on the card

The card carries three kinds of entry (`src/model/card.ts`): folders, the takes the recorder writes
(`.wav`) and the settings files SAVE/LOAD writes (`.urxf`). Folders stand first, and each group by
name. The simulator ships with a card named `test` in the slot and nothing on it.

[■] leaves the take on the card. Its name comes from the unit's clock as `YYYYMMDD_HHMMSS.wav`, its
length from the counter, its track count from [Track Count] and its place from the folder the card
browser is open on; a name the card already carries takes the next second that is free, and a take
shorter than a second leaves nothing. RECORDER's `Time` column is the take's length, and
SAVE/LOAD's `Date/Time` column is when the file was written.

The free space is the card's capacity less what is on it. The capacity is the 125,000,000,000 bytes a
formatted 128 GB card leaves; a take costs its seconds × 48,000 × 3 bytes × its tracks (the guide's
specifications give the microSD card slot as WAV, 24-bit), and a settings file 50,668 bytes, which is
the size every settings file takes. It is printed over 1024³ to one decimal, as `116.4GB Free` (p083-1, p087-1).
The card's name, the volume label it was formatted under, stands on a line above it, the two lines top right and
set left from x313 (x313..387 / y58..81). Every card screen puts them in the same place (URX44V, the operator,
2026-09-22): SAVE/LOAD's p084-1 and TOOLS' p087-1 show both lines, and RECORDER's p081-1 and p083-1 show the name
line empty. With no card none of these screens
is open: the microSD top takes their place. A touch on the eject button brings up the unit's dialog,
`Now you may safely remove the microSD card.` with [OK] alone: the text on one line, the circled i
mark to its left and [OK] at the lower right (URX44V, the operator, 2026-09-22). [OK] stands for the
card being pulled out (see [known-issues.md](known-issues.md)).

The first touch on a folder brings the cursor to it, and a touch on the folder the cursor stands on
opens it; the list then carries what is in it (the guide's "File list" under the RECORDER menu).
[↑] climbs one level and stands out of reach at the root. The path field shows where the browser
stands from the root, and a path too long for it is shown from its end (the same section's "Folder
name display"). A new folder and a [Save as] settings file are made in the folder that is open.

On the Edit tab, [Delete] asks `Delete the selected file?` before it takes the entry off, and
[Rename] and [New folder] open the same sheet SCENE's title opens. TOOLS' [Format] leaves the card
with nothing on it. On SAVE/LOAD, [Save] writes the unit's settings over the selected settings file,
[Save as] writes them under the name that is typed with `.urxf` after it, and [Load] puts a file
back on the unit. Writing over a file that is already there asks `File alerady exists. Replace it?`
first; loading asks nothing. [Save] and [Load] stand out of reach until a settings file is under the
cursor. A settings file carries every value but the screen's own state (`ui.`) and the card itself
(`sd.`).

A playback runs against the take's length, writing the counter and the bar in place once a second.
At the end of the file the counter goes back to the start and stops there, the file still held.

## The SCENE LIST list

The Standard and Simple tabs are one grouped button rounded at its two ends only, like SAMPLING FREQUENCY's frequencies.
The Standard tab lists 00 Initial Data and the numbers 01 to 63, and the Simple tab the factory presets P01 to P03 followed by the
numbers Standard holds no scene under (Scene list and its NOTE in the user guide's "SCENE screen"). A number with
nothing stored under it reads `No Scene`. The bar's thumb draws no shorter than 15px (y110..124 in both p073-1 and
p074-1). The HOME box names the recalled scene by the list's rules, `00 Initial Data` on a factory unit.

The ▶ of the last recalled scene stands left of its number on the Store/Recall tab (x12..19 / y124..131 in p073-1).
The Edit tab (p074-1) does not draw it on the same row. The number starts at x23 with or without the ▶. The Lock cell
of a scene the unit ships with (00 and P01 to P03) carries a factory: a sawtooth roof, a chimney and three windows
(x344..363 / y118..137 in p073-1). A scene the unit ships with cannot be stored over or edited.
The heading `Title` starts at x122 rather than over the middle of its column, and `No.` and `Lock` stand over the
middle of their cells.

[Store] opens the title entry sheet on the last recalled scene's title for a number with nothing stored, and on [OK]
stores the scene and makes it the recalled one. On a stored number it asks `Store to "Scene Memory #05"?` (the number is
the picked scene's) with [Cancel] / [OK], and on [OK] stores over it and makes it the recalled one.

The Edit tab (p074-1) sets glyph-only buttons [Protect], [Delete] and [Title] along the foot in place of [Store] /
[Recall] (faces at x6..95, x149..238 and x291..380; glyphs a padlock 16x21, a bin 16x18 and a rename mark 20x20).

- [Protect] turns a stored scene's protection on and off. A protected scene's Lock cell takes the `--scene-protect`
  face under a `--list-selected-mark` padlock (01 in p074-1, the cell at x327..380 / y110..145, the padlock at
  x346..361 / y117..137). While a scene is protected, [Delete], [Title] and [Store] on the Store/Recall tab cannot be used.
- [Delete] asks `Delete "Scene Memory #05"?` (the number is the picked scene's) with [Cancel] / [OK], and deletes the
  scene on [OK].
- [Title] opens the title entry sheet.
- On a number with nothing stored and on a scene the unit ships with, [Protect], [Delete] and [Title] cannot be used.
- While Operation Mode is Standard Mode, the Simple tab's list can be recalled from only; [Store] and the Edit tab
  cannot be used (the NOTE under Edit in the user guide's "SCENE screen").

## The title entry sheet

The sheet that [Title], and [Store] on a number with nothing stored, open covers the glass with the `--dialog-sheet` face. [Cancel] stands at the top left and [OK] at
the top right (the buttons of the DATE / TIME dialog), a black field under the gap between them (x124..361 / y49..89,
the title in 15px bold, a clear button at its right end), and the keyboard across the foot. The keys stand in four rows
(y96..135, y137..176, y178..217, y219..257) on forty columns, four to a key (x7..470, 2px between keys, 15px type).

| Layout | Row 1 | Row 2 | Row 3 |
|---|---|---|---|
| Letters | `qwertyuiop` | `asdfghjkl` from half a key in | [Shift], `zxcvbnm`, backspace (two keys wide) |
| Numbers | `1234567890` | `-/:;()\&` from the second key | [#+-], `.,?!'` from the third key, backspace |
| Symbols | `[]{}#%^*+=` | `_\|~<>$\"` from the second key | [123], `.,?!'` from the third key, backspace |

Row 4 runs the same in the letters, numbers and symbols layouts: the lead key ([123] or [ABC], one and a half keys
wide), space (three keys wide), `@`, `.`, and `<` and `>` (one and three quarter keys wide). [123] turns to the numbers,
[#+-] to the symbols and [ABC] to the letters.

[Shift] turns on and off at each tap; while on, its face is `--accent-selected` and the letter keys draw and type
capitals. A title takes up to 16 characters, and a key typed past that changes nothing. `<` and `>` move the cursor a character at a time, and typing and backspace act at the cursor. The clear
button empties the field. The sheet opens on the letters with Shift off, and [OK] writes the title. [OK] does nothing
while the field is empty, and [Cancel] writes nothing.

## The focus frame

Of the controls the unit's knob turns, only the one touched holds the focus, shown in magenta (`--accent-focus`). None
holds it when a screen opens or after moving to another screen, with three exceptions: EQ opens holding the band picked
last (LOW at first), one band shared by every channel's EQ, until the power goes off (a reload); the COMP and EQ
screens with 1-knob on open with the focus pinned on the level (below); and BRIGHTNESS, whose only turnable value is
Screen, opens holding it.

- Value boxes: a frame and a fill (`--accent-focus-fill`). A popup's values (DATE / TIME's date and time), HOME's strip
  levels and the knob readout along the bottom of the screen take none.
- Scroll bars: touching the list or text, or the bar, turns the rim magenta. SCENE LIST, microSD's lists, LICENSE, the
  input source sheet, DATE / TIME's TIME ZONE and USER DEFINED KNOBS' assignment columns (only the column touched).
  A pulldown's option list and the pulldown box take none.
- The dynamics handles and EQ's band rings: the rim, and triangles blinking on both sides of the way the value moves
  (left and right for LOW and HIGH, above and below for LOW MID and HIGH MID).
- The channel view's blocks: the value box, framed as a value box is (DELAY's included, x405..464 / y92..113 in p098-2). EQ
  under 1-knob takes a frame a pixel clear of its panel (x300..381 / y83..128 in p096-4). Touching another value moves the
  focus away, and no more than one frame stands on the screen.
- The level on the COMP and EQ screens while 1-knob is on: framed from the moment the screen opens until it changes.
  Touching another control moves nothing, and no other value turns, the knobs along the bottom included.

## Button corners

A button's corners are drawn as fixed pixels, not as the browser's curve. A radius of 4 takes three pixels out of the
button and lets the ground through the two beside them, `--px-cut-out` (40%) and `--px-cut-in` (8%). Nothing is painted
there, so a light face gets no dark rim and a sunk button shows no colour of its own at the corners; while it is sunk the
cut at the foot rises with the face, so the outline is the one it has at rest. A band is the face taken down by
`--px-band-cast` (31%), and the step where the face meets the band turns on the same two shares. The three come from the
figures (a face of 74,81,90 bands at 49,57,58 and one of 132,223,255 at 90,158,181; the corners were fitted over both a
sheet ground and a black one). The radius of 3 on [ON] / [CUE] / [PRE] is three shades over four rows, fixed for each
pairing of face, band and ground, so each set is a group of tokens (`--corner-*` in `design-tokens.md`). The bank buttons of USER DEFINED KNOBS and the
frequencies of SAMPLING FREQUENCY and CH SETTING's PAN and BAL join into one row, rounded at its two ends only (p057-1, p058-1,
p093-1). The ends of RECORDER's
progress bars, and of their played part, are 12-row half-rounds drawn a pixel at a time too (p079-2, p081-1).

The switch (`--pb-*`) and the title badge (`--pt-*`) draw their corners in the same 46 places, each from shades of its own.
The list of 46 layers stands in two rules because one rule can hold only one order of layers, and reordering either one moves
pixels on the rounded controls beside it (measured: 21 pixels on ch.eq, one step per channel, and 3 pixels on ch.comp with
1-knob lit). That the two agree on the places is guarded by "the two corner maps" in `src/style/columns.test.ts`.

A box's corners are drawn the same way, in a shape set by the kind of box.

- A sunk cell (the parameter cells, OSC's output, the channel view's PAN / LEVEL cells, DELAY's cells) and a channel view block
  round each corner over five pixels, in the ground and three shades. A block's bottom corners are drawn twice: the foot where
  the band meets the ground, and the step where the face turns onto the band (p056-1, p090-1). INPUT's panels take the same shape
  in two shades of their own (p100-1).
- A value box and a well (RECORDER's slots, SCENE LIST's box, a box that only names its screen) round over three
  pixels, a well with one more shade inside the corner (p090-1, p067-1, p079-2). INPUT's value boxes carry no shade and
  turn in two steps of the panel alone (p100-1).
- A focused value box runs its 1px frame round the corner, turning in the frame's shades over the ground and over the fill
  (p090-1, p100-1).
- The frames of the EQ, GATE, COMP and DUCKER graphs round each corner over three pixels, in the ground and two shades laid
  over the frame (p106-1, p099-1, p114-1).
- The card's path field (SAVE/LOAD, RECORDER's Play and Edit) rounds its two right corners over three pixels and marks its two left
  corners with one shade where it meets the well beside it (p084-1, p081-1, p083-1). SETUP's GENERAL tray rounds each corner over
  five pixels in the ground and four shades (p041-1).
- The knob toggle's top left corner and the knob readout bar's two top corners draw their 2px edge thickening round the turn
  (p045-1, p056-1, p038-4).
- A sheet's way out draws its bottom left corner in the `--sheet-back-corner-*` shades and its top right corner in the
  `--sheet-back-top-corner-*` ones (p100-2; see "Sheets over the screen").
- A HOME strip that is not selected turns its name panel's top corners in the raised face's shades and its bottom corners
  in its rail's colour: the foot mixes the rail over the glass at 36% / 74% / 80%, and the step climbing the side mixes it
  over the face at 100% / 92% / 60% / 23% / 18% (the same ratios on three strips in p047-1). The selected strip keeps a
  rounded box, since its frame runs round a curve. A MONITOR strip draws its head's top corners and its banded bottom
  corners the same way (p067-1).

The colours are `--corner-sunk-*`, `--corner-block-*`, `--corner-well-*`, `--corner-focus-*`, `--corner-toggle-*` and
`--corner-readout-*`, `--corner-raised-*`, `--corner-mon-*`, `--corner-panel-*`, `--corner-plot-*`, `--corner-path-*` and `--corner-tray-*` in `design-tokens.md`.

## The three screens opened from toolbar icons

SETUP, microSD and MONITOR, the three screens the icons at the toolbar's top right open, do not show
the USER DEFINED KNOBS toggle at the bottom right (captures: p078-1 for microSD, p066-1 for MONITOR).
The screens hanging below them (VERSION, RECORDER, MONITOR's Level and so on) show it. Each screen
declares it with `knobToggle: false` on `ScreenDef`, and the shell draws accordingly. The channel bank
list hides it with the same declaration.

## Dropdowns

A box that picks a value (Signal Type / Rec Point / COMP and EQ in CH SETTING, SETUP's User Defined
Knobs and the Date/Time format, Software Integration's destination, COMP's Knee, DUCKER's Ducker
Source, DELAY's Frame rate) opens a list of options on the screen when tapped, and closes when one is
picked. It is not a control that sends one value per tap. The glass holds five options; a longer list
opens on the sheet the unit opens a long list on (DUCKER's Ducker Source and DELAY's Frame rate).

A list's panel sets its choices 4px inside it on every edge, with 4px between them (measured on
p079-3: the panel runs y54..233, its first tile starts at y58 and its last ends at y229).

The box has face `--surface`, a 3px shadow band at the bottom and 12px padding on the left. A white 9x8
downward triangle stands 6px in from the right edge, its tip a pixel wide (measured on p092-1 and p099-1).
COMP's Knee sets it 10px in from the right edge (x399..407).

The boxes and marks that differ by screen:

- DELAY's Frame rate: a 9x6 `--drop-mark` (p115-1).
- The Date/Time formats: a 10x6 `--drop-mark`, 12px (date) and 13px (time) in from the right edge
  (x246..255 and x344..353 / y209..214 in p064-1). The box has a 4px band, and the date box spans x144..267.
- Software Integration's destinations: a white 10x6 mark 11px in from the right edge (x265..274 in p065-1).
  The box is 40px high, the two rows are 11px apart, and the value starts 16px in.

The list opens directly below the box, and is pulled inward where it would cross the edge of the
screen. A list taller than the screen scrolls. It closes on a tap on an item, a tap outside the list,
or `Escape`, and also when the screen changes. It is implemented in one place, `openOptions()` in
`src/ui/widgets.ts`, shared by `pulldown()` (a box showing a value) and `dropdown()` (a box showing a
setting name).

## The send knob on a HOME strip

The knob at the foot of a strip turns the send to the destination the [Sends] tab is showing (g under
"Channel area" in the user guide). The channel's own fader is what feeds the stereo bus, so the fader
stands there instead (p047-1 reads the factory fader's `0.00`, p157-1 the send's `-inf` under MIX 1).
The tab names the stereo bus short, `ST`, and a numbered bus with the space, `MIX 1` (p047-1, p157-1).

While that send is switched off on the SEND TO screen, the knob's face and its lit arc take
`--send-off` and the value `--send-off-ink`. The knob still turns, and what it sets does not leave the
channel. The value alone stays light because it has to be read: 4.5:1 over the well it stands in (`--surface-well`).

## HOME strip layout

The selected strip's frame stands 2px **outside** the box (measured on p047-1). It takes the near 2px
of the 8px gap between unselected strips, and for a strip at the edge of the screen it also appears in
the 2px margin outside the main area (left x0-1, top y48-49, bottom y270-271). `.main` lets it
overflow by that much (`overflow: clip` + `overflow-clip-margin`). The strip itself has no border;
`padding` makes the inner margin.

A strip that is not selected draws its corners in the pixels of [Button corners](#button-corners). The selected
strip keeps a rounded box on a radius of its own (`--radius-strip`: fitting a circle to the unit's corner gives
5.98px, so 6px), since its frame runs round a curve.

The color rail at the bottom of a strip reaches the box's edges and meets the outer frame with no gap
(measured on p045-1 / p047-1). Its thickness is 4.0px at the middle of the strip (measured), and at the
two ends it turns upward along the corners. On a strip that is not selected, the turn is drawn in pixels
of the rail's colour mixed over the face and the glass, with the rail itself on the layer below. On the
selected strip it is drawn as "the strip's outline raised by the rail's thickness" (`box-shadow: inset 0
-4px` inside a frame with rounded corners). The rail's color is the strip's channel color, passed in the
`--rail` custom property.

The heights and gaps of a strip's contents also follow the unit's measured values. One strip's 220px
(the main area's height) breaks down as follows, with 6px margins left and right.

| Row | Height | Gap before |
| --- | --- | --- |
| Name panel (a `--surface-raised` band reaching the strip's edges) | 36 | — |
| Indicators and meter | 69 | 6 |
| ON / CUE (40 square each, 6 apart) | 40 | 7 |
| PAN slider | 4 | 9 |
| Level (38 square rotary and a 38x22 readout) | 36 | 5 |
| Bottom margin (the rail overlaps the bottom 4px) | 8 | — |

The indicator row is spread across the block, not packed to the left, and the row carrying GATE stands
a pixel lower (HPF / GATE at y115..123 in p047-1). The name panel's two lines end at x94 (p047-1). The block and the meter are 4px
apart, and the meter takes room for two lanes (8px) even for mono, so the block is 74px.

A stereo input's first name line reads `CH 5/6` with both numbers, the one its channel screens do not open on drawn in
`--strip-id-other` (the second line does not change). A tap on the name area swaps the channel they open on and leaves the
selection alone, and a channel stepped to with `‹` `›` on those screens stays on HOME too. FX, MIX, STEREO and STREAMING have no
such choice, and HOME opens them on L. A tap on the indicator rows selects the strip, and opens the channel view on a strip already
selected.

The STREAMING strip has no [ON], PAN slider or level, and keeps [CUE] alone in the right half
(p048-5). No multi-function knob is assigned to the STREAMING position either.

ON / CUE have a dark shadow of their own color in the bottom 4px (on the unit CUE's face is
(214,206,214) and its shadow (156,150,156), which is 27% black laid over it). It is drawn as an inner
shadow, not a border. The level readout is centered in a box with a 4px corner radius; on the unit,
too, the margins left and right of the value are even.

The value box is exactly the width the rotary leaves, and does not change with the number of
characters. Checking the captures of HOME where the box is in the part the user guide shows (four
strips in p036-1, p045-1, p047-1 and p051-4, the first strip in p048-1, p048-2, p048-4, p048-5 and
p049-1, and the second strip in p048-3), the box is the 38px at x56..93 in each (106px further right
for each following strip), with `0.00` and `-5.20` in the same box (p045-1). 6px inner margin + rotary
38 + 10 + box 38 + 6px makes the strip's 98px.

Faders show one decimal place at -10 dB and below (`-10.0` / `-25.6` / `-96.0`). The top is `10.00` and
the bottom `-∞`, and any value the travel stops at fits in 5 characters, so the box does not need to
change width with the character count.

The name's second line, ON / CUE and the level value are `--fs-lg`, the name's first line (the channel number) is 12.5px, and the
indicator badges are 12.5px (on the unit they stand at about 9px and one step below that).

"the rows a HOME strip is cut into" in `src/style/columns.test.ts` pins the height breakdown and the
text sizes.

## Channel bank layout

Confirmed on the unit's HOME (URX44V, 2026-09-04). The toolbar's INPUT / OUTPUT buttons open the bank
list, and the bank to show is picked from the list. There is no path by which one tap of the button
advances one bank. The user guide's p47 says only that the bank changes when you touch the bank select
button on the toolbar.

| Side | Bank | Strips |
| --- | --- | --- |
| INPUT | 1 | CH 1, CH 2, CH 3, CH 4 |
| INPUT | 2 | CH 5/6, CH 7/8, CH 9/10, CH 11/12 |
| INPUT | 3 | FX1, FX2 |
| OUTPUT | 1 | MIX 1, MIX 2, STEREO, STREAMING |

The bank list names a bank by the range of numbers in it, `CH 1 - 4`, `CH 5 - 12` and `FX 1 - 2` (a URX22's are `CH 1 - 6` and
`CH 7 - 10, FX 1 - 2`). The output side reads `MIX, ST` over `STREAMING`.

The marks inside a bank button are one per bank, and the mark of the bank on display is wider than the
others (25px against 14px, 6px apart, 15 rows high; on the INPUT side a bank not on display is
`--accent-bank-cell`, p047-1). The down mark right of the name is a 9x6 triangle drawn a row at a time
(`--drop-mark`), and [Sends] carries the same mark. On a side with two banks, though (the URX22's INPUT has two, CH 1, CH 2, CH 3/4, CH 5/6 and CH 7/8,
CH 9/10, FX1, FX2), the two marks are the same width and split the row in half. On a side of one bank (OUTPUT)
the mark stands 24px from both edges of the button.

The strip list in `src/model/units.ts` and `STRIPS_PER_BANK = 4` produce this arrangement.
"lays the URX44V banks out the way the unit does" in `src/model/units.test.ts` pins it.

The list is split in two by `INPUT` and `OUTPUT` bands, and item names are built from the bank's
contents (`bankName`). On the URX44V they are `CH 1 - 4` / `CH 5 - 12` / `FX 1 - 2` and `MIX, ST` +
`STREAMING` split over two lines, four items. Item names are white, as on HOME's bank button (p047-1), and
only the bank on display takes black. Around the list, HOME (the scene name box, the toolbar's icons
and the side rail) shows through darkened, as it does around the [Sends] list, and only the bank button
that opened the list stays lit. Nothing under the dark answers a touch, and the list closes on a second
tap on the bank button, a tap on the item of the bank on display, or a tap on the dark around it
(`Escape` goes back, as on any screen). How the outside looks and that a tap on the dark closes the
list were checked on the unit (URX44V, the operator, 2026-09-22).

The user guide shows only part of each p48 figure (p048-1 to p048-6): x0..101 / y49..271 of p048-1,
p048-2, p048-4 and p048-5 (the first strip), and x106..207 / y49..271 of p048-3 and p048-6 (the second
strip), without the toolbar above y49. Outside those ranges the extracted files also hold the toolbar
and the other strips, and the toolbars of p048-1, p048-2, p048-3, p048-4 and p048-6 carry an icon at
x265..284 / y11..30 that is not in HOME's icon row (SETUP / microSD / MONITOR / HOME). The pixels
outside those ranges are not used as a basis for the implementation.

The user guide's "Channel view variations" figure (p048-3) shows one strip, FX1, at
x106..207 / y49..271, and no PAD strip. The extracted file p048-3 holds a PAD strip outside that range
(its name's ink at x74..95 / y56..80). The unit's third bank is FX 1 and FX 2, and PAD does not appear
among HOME's strips.

The URX44 has the same input strips as the URX44V and so the same three banks; the URX22 has two fewer
mono channels and so two banks. This is derived from the confirmed "four strips per bank"; of the
three models, the URX44V is the one whose arrangement was read on the unit.
