// The submenu (System firmware V1.5): the operations a screen offers, opened by a
// swipe left from the [<] tab at the right edge of the glass (user guide E0,
// "Operations that use the submenu").
//
// The buttons stand in four rows and two columns. The guide draws the submenu
// SEND FROM opens (p039-1, wide). Which other screens carry which buttons, where
// each stands and which cannot be pressed were read on a URX44V.

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import { findStrip } from "../model/types";
import type { SubmenuGlyph } from "../ui/submenu-glyphs";
import { geqSide } from "./geq";
import { selectedStripId } from "./strip-state";

/**
 * What SEND FROM's four buttons do to every send into the bus, each raising
 * `"All Pre" Completed.` and the like with no question first (confirmed on a
 * URX44V): [All Pre] and [All Post] set every send's
 * tap, [All Nominal] every send's level to 0 dB, and [Dup.Stereo] every send's
 * level to the channel's own fader, leaving the sends' ON and pan as they were.
 */
export type SendOp = "allPre" | "allPost" | "allNominal" | "dupStereo";

/** A button of the submenu. */
export interface SubmenuButton {
  /** The words on its face. */
  label: string;
  /** A smaller second line under them. */
  sub?: string;
  /** The mark over the words. */
  glyph: SubmenuGlyph;
  /** Whether it can be pressed. */
  enabled: boolean;
  /** What a press does, where the simulator does it. */
  act?: "copy" | "copyIncoming" | "paste" | "compare" | "default" | "flat" | SendOp;
}

/** What the submenu of a screen carries. */
export interface SubmenuSpec {
  /** The left column, top to bottom: four rows, `null` where the row is empty. */
  left: readonly (SubmenuButton | null)[];
  /** The right column, the same way. */
  right: readonly (SubmenuButton | null)[];
  /** The row whose gap above is wider than the others. */
  wideGapBefore: number;
  /** What [Copy] copies: the kind of screen, which a [Paste] on any channel's
   *  screen of that kind takes, the name the message gives it, the channel and the
   *  blocks of its settings (subtrees under `ch.<channel>`) it takes, and the
   *  message a paste raises where it is not "<name> Parameters Pasted.". */
  copy?: { kind: string; name: string; strip?: string; blocks?: readonly string[]; pasted?: string };
  /** The bus SEND FROM's four buttons act on. */
  sendBus?: string;
  /** What [Gain Flat] asks, and the gains it sets to 0 dB (paths under `ch.<channel>`). */
  flat?: { question: string; gains: RegExp; strip: string };
}

const button = (label: string, glyph: SubmenuGlyph, enabled = true, sub?: string): SubmenuButton =>
  sub === undefined ? { label, glyph, enabled } : { label, glyph, enabled, sub };

/** A channel's own operations: on the channel view and on HOME, for the strip selected. */
function channelMenu(ctx: AppContext, stripId: string | undefined, copied: ReadonlySet<string>): SubmenuSpec {
  const strip = stripId === undefined ? undefined : findStrip(ctx.model, stripId);
  const mix = strip?.kind === "mix";
  // After a copy with the sends into a MIX bus, a MIX bus's [CH Paste] says it pastes them too.
  const withSends = mix && copied.has(INCOMING_COPY);
  return {
    // A copy lights [CH Paste] on every channel (confirmed on a URX44V: CH 1 to CH 2, MIX 1 to MIX 2).
    left: [
      { ...button("CH Copy", "copy"), act: "copy" },
      { ...button("CH Paste", "paste", copied.has(CHANNEL_COPY), withSends ? "Incoming Sends" : undefined), act: "paste" },
      null,
      // Asks "Return to default CH 2 Setting?" and on [OK] says "CH 2 Parameters
      // Initialized." (confirmed on a URX44V).
      { ...button("CH Default", "page"), ...(strip ? { act: "default" as const } : {}) },
    ],
    // A MIX bus copies the sends into it with its settings.
    right: [mix ? { ...button("CH Copy", "copy", true, "Incoming Sends"), act: "copyIncoming" } : null, null, null, null],
    wideGapBefore: 3,
    // "CH 1 Parameters Copied.", and on the channel pasted to "CH 2 Parameter Pasted.";
    // a MIX bus's says "MIX 2 Parameters Pasted." (confirmed on a URX44V).
    ...(strip
      ? {
          copy: {
            kind: CHANNEL_COPY,
            name: strip.label,
            strip: strip.id,
            blocks: mix ? MIX_BLOCKS : CHANNEL_BLOCKS,
            pasted: `${strip.label} ${mix ? "Parameters" : "Parameter"} Pasted.`,
          },
        }
      : {}),
  };
}

/**
 * What [CH Copy] takes of a channel and [CH Paste] gives another. On a URX44V,
 * from CH 1 to CH 2, the paste
 * carried the COMP / EQ choice, GATE, COMP, EQ, SSMCS, the phase, the HPF, the
 * fader, ON, PAN, the sends, the Rec Point and the input stage of the jack the
 * channel reads (A.Gain, Clip Safe, +48V and HI-Z); it left the name, the colour,
 * the input source, the Insert FX, CUE and the Signal Type as they were. Pasted onto
 * one channel of a stereo pair, both take the copy, as any write to one of a pair does.
 */
const CHANNEL_BLOCKS: readonly string[] = [
  "compEqOrder", "gate", "comp", "eq", "ssmcs", "phase", "hpf", "level", "on", "pan", "send", "recPoint",
  "gain", "clipSafe", "phantom", "hiZ",
];

/**
 * What a MIX bus's [CH Copy] takes, and [CH Copy Incoming Sends] takes with every
 * send into the bus. On a URX44V, from MIX 1 to MIX 2, the paste carried
 * MIX 2's EQ, GEQ link and send to STEREO, and every send into MIX 2 (level, ON,
 * tap) took MIX 1's. The name, the colour, the Insert FX and CUE are taken to stay,
 * as a channel's do, and so are the bus type and Pan Link, which shape the bus.
 */
const MIX_BLOCKS: readonly string[] = ["on", "level", "eq", "eqType", "geq", "balance", "send"];

/** The kinds a channel's and a SEND FROM's copies go by. */
const CHANNEL_COPY = "channel";
const SEND_FROM_COPY = "sendfrom";
/** Marks a channel copy that holds the sends into a MIX bus. */
export const INCOMING_COPY = "channel.incoming";

/**
 * The name each processing screen's copy goes by in the message, as in "GATE
 * Parameters Copied." (confirmed on a URX44V; INS FX's goes by EFFECT). SSMCS's
 * COMP and Side Chain pages are taken to go by SSMCS as its first and EQ pages do.
 */
const COPY_NAMES: Record<string, string> = {
  "ch.gate": "GATE",
  "ch.comp": "COMP",
  "ch.eq": "EQ",
  "ch.geq": "GEQ",
  "ch.insfx": "EFFECT",
  "ch.ducker": "DUCKER",
  "ch.delay": "DELAY",
  "ch.effect": "EFFECT",
  "ch.ssmcs": "SSMCS",
  "ch.ssmcs.comp": "SSMCS",
  "ch.ssmcs.sc": "SSMCS",
  "ch.ssmcs.eq": "SSMCS",
};

/**
 * The blocks of a channel's settings each processing screen's copy takes: its own
 * block whole (confirmed on a URX44V: GATE's paste carried ON and all five values,
 * COMP's, EQ's, SSMCS's, DUCKER's, DELAY's and GEQ's every value they differed in).
 */
const COPY_BLOCKS: Record<string, readonly string[]> = {
  "ch.gate": ["gate"],
  "ch.comp": ["comp"],
  "ch.eq": ["eq"],
  "ch.insfx": ["insFx"],
  "ch.ducker": ["ducker"],
  "ch.delay": ["delay"],
  "ch.effect": ["effect"],
  "ch.ssmcs": ["ssmcs"],
};

/**
 * What [Gain Flat] does on each screen that carries it. It closes the submenu and
 * asks on a warning dialog, and [OK] sets the gains to 0 dB with no message after
 * (confirmed on a URX44V). On EQ it asks "Reset EQ Gains?" and sets the four bands'
 * gains, leaving their frequencies, Q and the HPF as they were; SSMCS's EQ page is
 * taken to do the same to its bands. On GEQ it asks "Reset GEQ Gains?" and sets the
 * bands of the side up alone: an unlinked other side keeps its own.
 */
const FLAT: Record<string, (ctx: AppContext, strip: string) => { question: string; gains: RegExp } | undefined> = {
  "ch.eq": () => ({ question: "Reset EQ Gains?", gains: /^eq\.[^.]+\.gain$/ }),
  "ch.ssmcs.eq": () => ({ question: "Reset EQ Gains?", gains: /^ssmcs\.eq\.[^.]+\.gain$/ }),
  "ch.geq": (ctx, id) => {
    const strip = findStrip(ctx.model, id);
    return strip ? { question: "Reset GEQ Gains?", gains: new RegExp(`^geq\\.${geqSide(ctx, strip)}\\.band\\.\\d+$`) } : undefined;
  },
};

/**
 * The kind of copy a screen takes: SSMCS's pages share one, and an effect's takes
 * the effect's own (confirmed on a URX44V: a copy of FX 1's effect leaves [Paste]
 * dark on FX 2's, which holds another effect).
 */
function copyKind(ctx: AppContext, screen: string, strip: string | undefined): string {
  if (screen.startsWith("ch.ssmcs")) return "ch.ssmcs";
  if (screen === "ch.effect" && strip !== undefined) return `${screen}:${ctx.store.str(`ch.${strip}.effect.type`, "")}`;
  if (screen === "ch.insfx" && strip !== undefined) return `${screen}:${ctx.store.str(`ch.${strip}.insFx.effect`, "")}`;
  return screen;
}

/**
 * A processing screen's operations, with Gain Flat where the screen sets EQ gains.
 * [Paste] and [Compare] take a copy from a screen of the same kind, on this channel
 * or another, and stay dark until there is one (confirmed on a URX44V: a copy on
 * CH 1's GATE lights them on CH 1's and CH 2's GATE, not on CH 1's COMP; a copy on
 * any SSMCS page lights them on every SSMCS page, EQ's included).
 */
function screenMenu(ctx: AppContext, screen: string, strip: string | undefined, gainFlat: boolean, copied: ReadonlySet<string>): SubmenuSpec {
  const kind = copyKind(ctx, screen, strip);
  const blocks = COPY_BLOCKS[screen.startsWith("ch.ssmcs") ? "ch.ssmcs" : screen];
  const how = gainFlat && strip !== undefined ? FLAT[screen]?.(ctx, strip) : undefined;
  const flat = how && strip !== undefined ? { ...how, strip } : undefined;
  const has = copied.has(kind);
  return {
    left: [
      { ...button("Copy", "copy"), act: "copy" },
      // "GATE Parameters Pasted.", with no question first (confirmed on a URX44V).
      { ...button("Paste", "paste", has), ...(blocks ? { act: "paste" as const } : {}) },
      // Swaps the copy with what the screen holds, "GATE Parameters Swapped with Copy
      // Buffer.": a second press puts both back (confirmed on a URX44V).
      { ...button("Compare", "compare", has), ...(blocks ? { act: "compare" as const } : {}) },
      // Closes the submenu and asks "Return to default GATE Setting?" on a warning
      // dialog; [OK] puts the screen's settings back to the factory's and says "GATE
      // Parameters Initialized.", [Cancel] leaves all as it was (confirmed on a URX44V).
      { ...button("Default", "page"), ...(blocks ? { act: "default" as const } : {}) },
    ],
    right: [flat ? { ...button("Gain Flat", "gainFlat"), act: "flat" } : gainFlat ? button("Gain Flat", "gainFlat") : null, null, null, null],
    wideGapBefore: 3,
    ...(flat ? { flat } : {}),
    copy: { kind, name: COPY_NAMES[screen] ?? screen, ...(strip !== undefined && blocks ? { strip, blocks } : {}) },
  };
}

/**
 * SEND FROM's operations on the sends into the bus. [Copy] takes every send into it
 * ("MIX 1 Parameters Copied.") and lights [Paste] on every bus's SEND FROM, whose
 * press gives the bus up the same sends, level, ON and tap, with no question first
 * ("MIX 2 Parameters Pasted.", confirmed on a URX44V from MIX 1 to MIX 2).
 */
function sendFromMenu(bus: string, busId: string, copied: ReadonlySet<string>): SubmenuSpec {
  const op = (label: string, act: SendOp): SubmenuButton => ({ ...button(label, act), act });
  return {
    left: [
      { ...button("Copy", "copy"), act: "copyIncoming" },
      { ...button("Paste", "paste", copied.has(SEND_FROM_COPY)), act: "paste" },
      null,
      null,
    ],
    right: [op("All Pre", "allPre"), op("All Post", "allPost"), op("All Nominal", "allNominal"), op("Dup.Stereo", "dupStereo")],
    wideGapBefore: 2,
    copy: { kind: SEND_FROM_COPY, name: bus, strip: busId, blocks: [] },
    sendBus: busId,
  };
}

/**
 * What the submenu of the screen up carries, or nothing where the screen has no
 * submenu. `copied` holds the kinds of screen a copy has been taken from.
 */
export function submenuFor(ctx: AppContext, route: Route, copied: ReadonlySet<string> = new Set()): SubmenuSpec | undefined {
  switch (route.id) {
    case "home":
      return channelMenu(ctx, selectedStripId(ctx), copied);
    case "channel-view":
      return channelMenu(ctx, route.strip ?? selectedStripId(ctx), copied);
    case "ch.insfx":
      // A channel whose insert holds no effect has none (confirmed on a URX44V).
      if (route.strip !== undefined && ctx.store.str(`ch.${route.strip}.insFx.effect`, "No Effect") === "No Effect") return undefined;
      return screenMenu(ctx, route.id, route.strip, false, copied);
    case "ch.gate":
    case "ch.comp":
    case "ch.ducker":
    case "ch.delay":
    case "ch.effect":
    case "ch.ssmcs":
    case "ch.ssmcs.comp":
    case "ch.ssmcs.sc":
      return screenMenu(ctx, route.id, route.strip, false, copied);
    case "ch.eq":
    case "ch.geq":
    case "ch.ssmcs.eq":
      return screenMenu(ctx, route.id, route.strip, true, copied);
    case "ch.sendfrom": {
      // The stereo bus's SEND FROM has none.
      const strip = route.strip === undefined ? undefined : findStrip(ctx.model, route.strip);
      return strip === undefined || strip.kind === "stereo" ? undefined : sendFromMenu(strip.label, strip.id, copied);
    }
    default:
      return undefined;
  }
}
