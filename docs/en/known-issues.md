# What this simulator does not build

This simulator exists to walk through the unit's screens and operating procedures; it does not carry
the unit's functions. What follows is what the unit has and this simulator leaves out of its scope,
and what the unit itself lacks and so this simulator lacks as well. The list of screens and what
is built is in [screen-inventory.md](screen-inventory.md).

## Screens

| On the unit | Here | Why |
| --- | --- | --- |
| The Icon picker in CH SETTING | CH SETTING's Icon box carries a square in the channel colour. The picker does not open | The icon drawings are hard to reproduce, so they are not drawn |
| Simple Mode as a whole (Setup Assistant, use-case selection, Simple's HOME and channel view) | Operation Mode still lists the Simple Mode card, drawn as an entry that cannot be chosen | Outside this simulator |
| The screens for the Cubase series (Input settings / Hardware settings / MixKey channel editor) | Not here at all | Outside this simulator |
| Initialize All Memories | Not here at all. [Reset the unit], outside the screen, does the same thing | Outside this simulator |

## Controls

| On the unit | Here | Why |
| --- | --- | --- |
| [AUTO] on the channel view's head amp | Drawn where the unit has it, and cannot be pressed | It runs the auto-gain routine rather than holding a setting, and there is nothing here to run |
| [Auto Gain] on the INPUT screen | The same | The same |
| Japanese and 简体中文 under LANGUAGE | Drawn as entries that cannot be chosen | The screens carry English text only |
| The effect drawings on EFFECT TYPE | Each button carries the effect's name alone | The drawings are hard to reproduce, so they are not drawn |

## What moves but does not do what the unit does

- **There is no audio.** The meters read a synthetic signal that every input source carries of its
  own, taken through the mixer along the unit's own routing and laws (screen-inventory.md, "The signal
  the meters read"). Raised to +44 dB, the A.Gain starts to clip the input, and Clip Safe acts on that
  (screen-inventory.md, "Head amp in the channel view"). A take carries a length and a size and no
  sound.
- **When Clip Safe starts to take the input down.** Clipped by hand claps, the unit took the input down
  from about 2 seconds after the last clip (URX44V, confirmed on the unit on 2026-09-22). The simulator
  takes it down as soon as it has read the clip.
- **M.B.Comp's 1-knob only takes the rows.** Switching it on leaves each band's Threshold, Ratio,
  Gain and Attack, the Release and the two Xovers reading but not turning, and takes [Bypass] off the
  page; Out Gain is the one the operator keeps, as it is on the unit. What it does not do is recompute
  any of them from the 1-knob Level.
- **SSMCS's Morphing and Sweet Spot Data move their own value alone.** On the unit either of them
  recomputes the strip's continuous values (the compressor's Attack, Release, Ratio and Knee, the side
  chain's Q, Freq. and Gain, the three EQ bands' Freq. and Gain with MID's Q, and Out Gain). What that
  computation is is not known, so this simulator leaves those values where they are. It does not draw
  them unusable either — the unit lets the operator turn them after it has computed them. The values
  under `01 Basic` are the ones it knows, and those are what it ships with.
- **The microSD card going in and out, how long a name on it runs, and recording onto it when it is full.**
  The card goes in and out on the screen. The eject button asks the unit's question, and its [OK] brings up the
  unit's `Now you may safely remove the microSD card.`. On
  the unit that dialog closes by itself after a few seconds and [OK] does nothing, since the unit
  detects the card leaving the slot. Here the dialog stays until [OK], and [OK] stands for the card
  being pulled out. On the microSD top with no card, a touch on `Not inserted microSD card` brings up
  a question of the simulator's own, `Simulate inserting the microSD card?` ([Cancel] / [OK]), and
  [OK] stands for the same card going back in.
  On the unit, [Rename] takes about 255 characters and does not save a long name (from what length it stops saving
  one has not been tried on the unit), and [New folder] takes more than 255 characters and makes the
  folder under the name cut short. This simulator stops [Rename] at 255 characters less the extension's (250 for
  `.urxf`, 251 for `.wav`) and [New folder] at 255, and a key typed past that changes nothing.
  What the unit does when a take uses up what the card has left, and when
  [●] is pressed on a card with no room left, has not been tried on the unit. This simulator stops the take, saying
  nothing, at the moment it fills what the card has left, and leaves it on the card within that room. With no room
  for a second of take at the recorder's [Track Count] and frequency, [●] does nothing.
- **COMP's 1-knob only takes the rows too.** While it is on the unit recomputes Threshold, Ratio,
  Gain and Knee from the Level. What that computation is is not known, so this simulator leaves the
  other rows out of reach, as the unit does, and moves no value.
- **A tenth of a dB on 1-knob EQ's Intensity.** The unit multiplies the gains it took when 1-knob went on by Level / 50
  and lands them on a tenth of a dB, but for some pairs of gain and Level it gives a tenth of a dB more (a gain of
  +12.3 dB at Level 1, 14, 27 and 38% reads 0.3 / 3.5 / 6.7 / 9.4 dB, whenever it is read and whichever way the Level
  moved there; URX44V, confirmed on the unit on 2026-09-22). Which pairs do so is not known, so this simulator gives
  the product as it is.
- **COMP's Auto Makeup only takes the Gain.** Switching it on leaves the Gain division reading out
  and not turning, and the reading is the one it held before, since what the unit works out is not
  known.
- **Lead's and Drive's Master only silence the amp at the bottom.** On the unit a Master under where it
  ships takes the output down as well, by an amount that follows the input's level and whether it is a tone
  or noise (0 to 10 dB at a quarter of its travel; URX44V, measured on 2026-09-28). This simulator leaves the
  output where the effect's table puts it for every Master value but the bottom.
- **A swipe on HOME steps one bank, however hard it is.** On the unit a gentle swipe across about half the
  screen stepped one bank, while a quick one across the whole screen went from CH 1 - 4 to FX 1 - 2 and back
  (URX44V, read by the operator on 2026-10-04). This simulator steps one bank a swipe, and stops at the INPUT
  side's first and last bank as the unit does.
- **GATE opens and closes at once.** Attack, Hold and Decay are kept as values only: the gate closes to
  RANGE as soon as the input is at or under the threshold and opens as soon as it is over. The middle,
  yellow one of the channel view's GATE lamps, which shows the gate opening or closing, does not light.
- **The clock keeps each city on one offset in every year and SAVE/LOAD's list on the 24-hour clock, as the unit does, but reads its own years outside 2000 to 2099.**
  As on the unit,
  each [Time Zone] city keeps one time ahead of or behind UTC, the same all year and in every year, with no
  summer time (21:15 in Tokyo reads 12:15 in London in September, confirmed on the unit). Samoa reads 13 hours
  ahead of UTC in 2011, when it kept 11 hours behind, as in 2012, and Volgograd 3 hours ahead in 2019, when it
  kept 4 (URX44V, the operator, 2026-10-03). This simulator gives each city the standard time it keeps in
  2026, so while summer time is in force it reads an hour off the clock of a computer in a zone that keeps
  summer time. Past midnight at the end of 31 December 2099, the unit's DATE / TIME screen keeps its date at
  31 December 2099 while the time runs on, and its [Date/Time] dialog opens on 1 January 2100. Shortly into
  1 January 2000, a [Time Zone] further west makes the screen read 1 January 2001 for a while, and then
  31 December 2000. This simulator reads the year the clock has run into on the screen and in the dialog
  alike (1 January 2100, 31 December 1999).
  The user guide's "Date/Time menu" says of the [Display Format] Time
  button "Selects the display format for the time.", but the unit's SAVE/LOAD `Date/Time` column gives the time on
  the 24-hour clock with Time set to 12h, while its date follows the Date format. The simulator gives that column's
  time on the 24-hour clock as well.

## What the unit itself does not do

What the unit lacks, this simulator lacks as well.

- **+48V and HI-Z held apart.** The user guide's description of [+48V] on the INPUT screen says "The
  phantom power supply and HI-Z cannot be turned on at the same time.", but on the unit pressing [HI-Z]
  with [+48V] on, or [+48V] with [HI-Z] on, leaves [+48V] and [HI-Z] on together (URX44V, confirmed on
  the unit on 2026-09-22). The simulator lets the two be on at once as well.
- **Menus held back during USB Storage Mode.** The user guide's NOTE under "USB Storage Mode button" says "You
  cannot access any other menus from this product while USB Storage Mode is on.", but on the unit pressing HOME with
  the mode on goes to the HOME screen, and SETUP, MONITOR and the channel screens open as well (URX44V, confirmed on
  the unit on 2026-09-22). The simulator does not hold them back either. [Recorder], [Save/Load] and [Tools] on the
  microSD screen cannot be used while the mode is on (p078-1).
- **A stereo LEVEL meter on a stereo-linked channel.** The user guide's description of the LEVEL meter on p97
  says "Stereo channels and channels that are stereo-linked are shown with a stereo meter.", but on the unit a
  channel of a stereo-linked pair shows one LEVEL meter in the channel view's main area, and HOME shows one per
  channel as well (URX44V, confirmed on the unit on 2026-09-26). The simulator draws one bar there too.

## Nothing is written to a unit

The simulator carries no device protocol. The table that maps a path to an address on the unit
(`BindingTable`) ships empty, and a write to a path it does not bind is refused. See
"Addressing parameters" in [architecture.md](architecture.md).
