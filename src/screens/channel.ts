// Channel view and the dedicated channel screens (user guide, "Channel view"
// and "Dedicated channel screen").

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore, WriteRule } from "../device/store";
import { clamp } from "../device/store";
import { COMP_DEFAULTS, DUCKER_SOURCE_DEFAULT, GATE_DEFAULTS, compEqBankDefaults, ssmcsBankDefaults } from "../model/defaults";
import { COMP_GR_METER_DB, COMP_KNEE_WIDTH, GR_METER_DB, compResponse } from "../model/dynamics";
import type { Strip } from "../model/types";
import { findStrip, sendsTo } from "../model/types";
import { CH_COLOR_NONE, CH_COLOR_OFF, CH_COLOR_PALETTE } from "../model/units";
import { el, makeTappable, setPressed } from "../ui/dom";
import { inkOn } from "../ui/color";
import { Icons } from "../ui/icons";
import type { NumericSpec } from "../ui/param-spec";
import { compRatioSpec, dbSpec, faderSpec, formatValue, freqSpec, intSpec, logFreqSpec, msSpec, panSpec } from "../ui/param-spec";
import { attachDrag, attachSpin, followFocus, knobControl, markFocus, meter, panSlider, pickerSheet, pulldown, sideTab, toggle, unbuilt, valueBox } from "../ui/widgets";
import { type GrSpec, blockNetDb, blockReduction, inputMeterId, markClipSafe, markReduction, meterLevels, simulatedInput, simulatedLevel } from "./meters";
import { PAN_BAL, SIGNAL_TYPES, setPanBal, setSignalType, signalType, stripPosition } from "./stereo-link";
import { BUS_TYPES, busType, panLinkOn, sendLocks, sendPanPath, setBusType, setPanLink } from "./mix-bus";
import { homeSide, sceneBox } from "./home";
import { headAmp, headAmpSwitch } from "./head-amp";
import { inputSourceSheet, sourceBoxLabel } from "./input-source";
import { NO_EFFECT, insertBase } from "./insert-fx";
import { effectSettingsScreen, insFxScreen, openEffectParams } from "./effect-params";
import { ssmcsArea } from "./ssmcs";
import { channelLabel, phasePath, selectStrip, selectedStripId, sendsTarget, stepChannel, stripColor, stripLane, stripLanes } from "./strip-state";
import type { ScreenBody, ScreenDef } from "./types";

/** What a channel screen shows when the route names no channel. */
export function noChannel(): ScreenBody {
  return { main: el("div", { class: "screen-missing", text: "No channel selected" }) };
}

/**
 * What the SEND TO tabs choose between, in the order the unit stacks them. The
 * tabs a strip shows are the groups it has a send into: a channel shows all
 * three, an FX return shows STEREO and MIX 1-2, and a MIX bus reaches the
 * stereo bus alone, so it is given no chooser.
 */
const SEND_GROUPS = [
  { key: "ST", label: "STEREO" },
  { key: "MIX", label: "MIX\n1-2" },
  { key: "FX", label: "FX\n1-2" },
] as const;

function sendTargets(ctx: AppContext, from: Strip, group: string): Strip[] {
  const pool =
    group === "MIX"
      ? ctx.model.outputs.filter((o) => o.kind === "mix")
      : group === "FX"
        ? ctx.model.inputs.filter((s) => s.kind === "fx")
        : ctx.model.outputs.filter((o) => o.kind === "stereo");
  return pool.filter((to) => sendsTo(from, to));
}

function sendGroups(ctx: AppContext, from: Strip): (typeof SEND_GROUPS)[number][] {
  return SEND_GROUPS.filter((g) => sendTargets(ctx, from, g.key).length > 0);
}

/** Where the microSD recorder taps a channel, in the order the pulldown lists. */
/**
 * Where the recording and the direct out tap the channel. The stages are those
 * of the fixed strip order (Φ → HPF → GATE → COMP → EQ → INS FX → fader); a
 * stereo input carries only an EQ, so it offers the two stages that survive it.
 */
const REC_POINTS = [
  { label: "PRE GATE", stereo: false },
  { label: "PRE COMP", stereo: false },
  { label: "PRE EQ", stereo: true },
  { label: "PRE INS FX", stereo: false },
  { label: "PRE FADER", stereo: true },
];

const REC_POINT_DEFAULT = "PRE FADER";

/** What the channel's COMP and EQ are used as, per the guide's CH SETTING. */
const COMP_EQ_SSMCS = "SSMCS";
const COMP_EQ_ORDERS = ["COMP->EQ", COMP_EQ_SSMCS];

/**
 * The tap stages a strip offers. The morphing channel strip has no discrete EQ
 * stage to tap ahead of, so PRE EQ leaves the list while it is in use.
 */
function recPoints(ctx: AppContext, strip: Strip): string[] {
  const mono = strip.kind === "monoIn";
  const ssmcs = mono && ctx.store.str(`ch.${strip.id}.compEqOrder`, "COMP->EQ") === COMP_EQ_SSMCS;
  return REC_POINTS.filter((p) => (mono || p.stereo) && !(ssmcs && p.label === "PRE EQ")).map((p) => p.label);
}

/**
 * Switch the channel between COMP → EQ and the morphing strip. A tap standing on
 * PRE EQ has no stage to read once the morphing strip is in, so it moves back to
 * the stage before it.
 */
function setCompEq(ctx: AppContext, strip: Strip, value: string): void {
  const base = `ch.${strip.id}`;
  if (ctx.store.str(`${base}.compEqOrder`, "COMP->EQ") === value) return;
  void ctx.store.set(`${base}.compEqOrder`, value);
  if (value === COMP_EQ_SSMCS && ctx.store.str(`${base}.recPoint`, REC_POINT_DEFAULT) === "PRE EQ") {
    void ctx.store.set(`${base}.recPoint`, "PRE COMP");
  }
  // The two banks are separate on the unit: taking a type loads that bank's
  // factory values, and the bank being left keeps its own until it is entered
  // again. GATE is the same either way and stays where it is.
  if (value === COMP_EQ_SSMCS) {
    for (const [suffix, v] of ssmcsBankDefaults()) void ctx.store.set(`${base}.${suffix}`, v);
    void ctx.store.set(`${base}.comp.on`, true);
    void ctx.store.set(`${base}.eq.on`, true);
  } else {
    for (const [suffix, v] of compEqBankDefaults()) void ctx.store.set(`${base}.${suffix}`, v);
  }
}

/** The three COMP knee curves. */
const COMP_KNEES = ["Soft", "Medium", "Hard"];

export function routeStrip(ctx: AppContext, route: Route): Strip | undefined {
  return findStrip(ctx.model, route.strip ?? selectedStripId(ctx));
}

/** The block's name in the middle of the toolbar, which is also its switch. */
export function titleBadge(label: string, kind: string, on: boolean, onTap: () => void): HTMLElement {
  const node = el("button", { class: `badge badge-${kind} badge-title`, text: label, onTap });
  if (kind === "eq") node.prepend(Icons.eqBadgeCurve());
  setPressed(node, on);
  return node;
}

/** The same box for a channel screen that names itself without switching anything. */
export function titleBox(label: string, extraClass = ""): HTMLElement {
  return el("div", { class: `badge badge-title badge-plain ${extraClass}`.trim(), text: label });
}

/** The "‹ CH 1 ›" selector every channel screen carries in its toolbar. */
export function channelSelector(ctx: AppContext, strip: Strip, route: Route, narrow = false): HTMLElement {
  const move = (delta: number): void => {
    const next = stepChannel(ctx, delta, strip);
    ctx.nav.replace({ ...route, strip: next.id });
  };
  return el("div", {
    class: "ch-selector",
    children: [
      el("button", { class: "ch-arrow", children: [Icons.chevronLeft()], onTap: () => move(-1), attrs: { "aria-label": "Previous channel" } }),
      el("button", {
        class: `ch-chip${narrow ? " is-narrow" : ""}`,
        style: { "--rail": stripColor(ctx, strip) },
        // The name opens the screen that sets it, except where that is the
        // screen already up.
        onTap: () => {
          if (route.id !== "ch.setting") ctx.nav.push({ id: "ch.setting", strip: strip.id });
        },
        children: [
          el("span", { class: "ch-chip-icon", style: { background: stripColor(ctx, strip) } }),
          el("span", {
            class: "ch-chip-labels",
            children: [
              el("span", { class: "ch-chip-id", text: channelLabel(strip, stripLane(ctx, strip), narrow) }),
              el("span", { class: "ch-chip-name", text: ctx.store.str(`ch.${strip.id}.name`, "") }),
            ],
          }),
          // The copy mark stands beside the name on the screen a channel opens
          // on, and not on the screens under it nor on CH SETTING.
          narrow || route.id === "ch.setting" ? null : el("span", { class: "ch-chip-copy", children: [Icons.copy()] }),
        ],
      }),
      el("button", { class: "ch-arrow", children: [Icons.chevronRight()], onTap: () => move(1), attrs: { "aria-label": "Next channel" } }),
    ],
  });
}

/**
 * One processing block. Its name is the switch that turns the block on and off.
 * A block with a value the knob turns takes the focus at the first touch, framing
 * `knob.frame`, and opens the screen that sets it at the next; a block with none
 * opens the screen at once.
 */
export function block(
  ctx: AppContext,
  title: string,
  kind: string,
  onPath: string,
  fallback: boolean,
  body: HTMLElement,
  onTap: () => void,
  knob?: { spec: NumericSpec; frame: Element },
  inert = false,
): HTMLElement {
  const on = ctx.store.bool(onPath, fallback);
  const badge = el("button", {
    class: `badge badge-${kind} badge-switch`,
    text: title,
    onTap: () => {
      if (!inert) void ctx.store.set(onPath, !on);
    },
  });
  setPressed(badge, on);
  const key = knob ? (knob.spec.focusKey ?? knob.spec.path) : "";
  const node = el("div", {
    class: `cv-block cv-block-${kind}`,
    onTap: () => (knob && !ctx.focus.holds(key) ? ctx.focus.take(knob.spec) : onTap()),
    attrs: { "aria-label": title },
    children: [badge, body],
  });
  // A block with a value on the knobs takes two touches: the first brings the
  // focus to it and the second opens its screen. The first one does not sink the
  // panel, so it only gains its frame.
  if (knob) {
    followFocus(ctx, node, () => {
      if (ctx.focus.holds(key)) node.removeAttribute("data-press");
      else node.setAttribute("data-press", "none");
    });
  }
  if (knob) {
    markFocus(ctx, knob.frame, key);
    attachSpin(ctx, node, knob.spec, () => ctx.focus.take(knob.spec), false);
  }
  return node;
}

/**
 * A tiny EQ curve over the grid the unit rules the panel with: three lines down
 * it and one across the middle, with the curve drawn from the four band gains.
 * A band switched off adds nothing.
 */
function eqThumb(ctx: AppContext, stripId: string): HTMLElement {
  const W = 78;
  const H = 42;
  const gains = EQ_BANDS.map((b) => (eqBandOn(ctx, `ch.${stripId}`, b.key) ? ctx.store.num(`ch.${stripId}.eq.${b.key}.gain`, 0) : 0));
  const pts = gains.map((g, i) => {
    const x = (i * W) / (EQ_BANDS.length - 1);
    const y = H / 2 - (g / 18) * (H / 2 - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "eq-thumb");
  svg.setAttribute("aria-hidden", "true");
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const l = document.createElementNS(ns, "line");
    for (const [k, v] of [["x1", x1], ["y1", y1], ["x2", x2], ["y2", y2]] as const) l.setAttribute(k, String(v));
    l.setAttribute("class", "eq-grid");
    svg.appendChild(l);
  };
  for (const x of [18, 44, 70]) line(x + 0.5, 0, x + 0.5, H);
  line(0, H / 2 + 0.5, W, H / 2 + 0.5);
  // The unit fills the space between the curve and the 0 dB line, so the area
  // is drawn as a polygon closed on that line with the curve stroked over it.
  const area = document.createElementNS(ns, "polygon");
  area.setAttribute("points", [`0,${H / 2}`, ...pts, `${W},${H / 2}`].join(" "));
  area.setAttribute("class", "eq-area");
  svg.appendChild(area);
  // The curve is two pixels deep: the upper row in the EQ screen's green, the lower a shade lighter.
  const curve = (points: string[], width: number, cls: string): void => {
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", points.join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke-width", String(width));
    poly.setAttribute("class", cls);
    svg.appendChild(poly);
  };
  curve(pts, 2, "eq-thumb-edge");
  curve(pts.map((p) => { const [x, y] = p.split(","); return `${x},${(Number(y) + 0.5).toFixed(1)}`; }), 1, "eq-thumb-core");
  return svg as unknown as HTMLElement;
}

/**
 * The three lamps under a dynamics block's value (user guide, "Channel view >
 * Main area"): red on the left once the block holds the signal right down to its
 * range, amber in the middle while it holds it part of the way, green on the
 * right while it leaves it alone. A block that is off lights none of them.
 */
function blockLamps(lit: "shut" | "holding" | "open" | "off"): HTMLElement {
  const lamps = ["shut", "holding", "open"].map((name) => {
    if (name !== lit) return "";
    return name === "open" ? " is-on" : ` is-${name}`;
  });
  return el("div", {
    class: "block-lamps",
    children: lamps.map((cls) => el("span", { class: `block-lamp${cls}` })),
  });
}

/** GATE opens for a signal over the threshold and shuts once it is a range under. */
function gateLamps(ctx: AppContext, strip: Strip, base: string): HTMLElement {
  const level = simulatedLevel(ctx, strip, false)[0] ?? -96;
  const threshold = ctx.store.num(`${base}.gate.threshold`, GATE_DEFAULTS.threshold);
  const range = ctx.store.num(`${base}.gate.range`, GATE_DEFAULTS.range);
  if (!ctx.store.bool(`${base}.gate.on`, false)) return blockLamps("off");
  return blockLamps(level > threshold ? "open" : level <= threshold + range ? "shut" : "holding");
}

/** How many names the ducker's key list sets across. */
const DUCKER_SOURCE_COLUMNS = 8;

/**
 * What a ducker can listen to, in the order the unit lists them: the input
 * channels, then the stereo bus and the two mix buses. The list names a channel
 * by its numbers alone (`1`, `5/6`) and the stereo bus `ST`; the box over it
 * carries the channel's own name.
 */
function duckerSources(ctx: AppContext): { label: string; boxed: string; strip: Strip }[] {
  const channels = ctx.model.inputs
    .filter((s) => s.kind === "monoIn" || s.kind === "stIn")
    .map((s) => ({ label: s.channels.join("/"), boxed: s.label, strip: s }));
  const stereo = ctx.model.outputs
    .filter((s) => s.kind === "stereo")
    .map((s) => ({ label: "ST", boxed: "ST", strip: s }));
  const mixes = ctx.model.outputs.filter((s) => s.kind === "mix").map((s) => ({ label: s.label, boxed: s.label, strip: s }));
  return [...channels, ...stereo, ...mixes];
}

/**
 * DUCKER holds its channel down while the ducker source is over the threshold,
 * and right down to the range once the source is a range over it.
 */
function duckerLamps(ctx: AppContext, base: string): HTMLElement {
  const source = ctx.store.str(`${base}.ducker.source`, DUCKER_SOURCE_DEFAULT);
  const key = duckerSources(ctx).find((s) => s.label === source)?.strip;
  const level = simulatedLevel(ctx, key, false)[0] ?? -96;
  const threshold = ctx.store.num(`${base}.ducker.threshold`, -40);
  const range = ctx.store.num(`${base}.ducker.range`, -24);
  if (!ctx.store.bool(`${base}.ducker.on`, false)) return blockLamps("off");
  return blockLamps(level <= threshold ? "open" : level >= threshold - range ? "shut" : "holding");
}

/**
 * What COMP shows under its value: the level going in over the reduction
 * coming out, with the threshold marked across both unless 1-knob turns COMP.
 */
function compMeters(ctx: AppContext, strip: Strip, base: string, marked: boolean): HTMLElement {
  const spec = compThreshold(base);
  const at = (db: number): number => clampFraction((db - spec.min) / (spec.max - spec.min));
  const level = simulatedLevel(ctx, strip, false)[0] ?? -96;
  const bar = (extra: string, fraction: number): HTMLElement =>
    el("div", { class: `comp-bar ${extra}`.trim(), children: [el("i", { style: { width: `${fraction * 100}%` } })] });
  return el("div", {
    class: "comp-meters",
    children: [
      bar("", at(level)),
      bar(
        "comp-reduce",
        blockReduction(ctx.store, { kind: "comp", base, level: strip.id, scale: COMP_GR_METER_DB, makeup: ctx.store.num(`${base}.comp.gain`, COMP_DEFAULTS.gain) }) /
          COMP_GR_METER_DB,
      ),
      ...(marked ? [el("div", { class: "comp-thresh", style: { left: `${at(ctx.store.num(spec.path, spec.fallback)) * 100}%` } })] : []),
    ],
  });
}

const clampFraction = (v: number): number => Math.min(1, Math.max(0, v));

/** The values a block's knob turns, the same on the channel view as on the block's own screen. */
const gateThreshold = (b: string): NumericSpec => dbSpec(`${b}.gate.threshold`, "Threshold", -72, 0, GATE_DEFAULTS.threshold, 1, 0);
const compThreshold = (b: string): NumericSpec => dbSpec(`${b}.comp.threshold`, "Threshold", COMP_THRESHOLD_MIN, 0, COMP_DEFAULTS.threshold, 1, 0);
const duckerThreshold = (b: string): NumericSpec => dbSpec(`${b}.ducker.threshold`, "Threshold", -60, 0, -40, 1, 0);
const delayTime = (b: string): NumericSpec => ({ ...msSpec(`${b}.delay.ms`, "ms", 1, 1000, 1), step: 0.01, unit: "", boxUnit: "", sweep: DELAY_SWEEP_DEG });
/** How deep [1-knob] works COMP or EQ, in percent. */
const oneKnobDepth = (path: string): NumericSpec => intSpec(path, "1-knob", 0, 100, 0, "%");

/** The channel view's [SAFE], which turns the Clip Safe kept at `path`. */
function safeToggle(ctx: AppContext, path: ParamPath): HTMLElement {
  return toggle("SAFE", ctx.store.bool(path, false), () => void ctx.store.set(path, !ctx.store.bool(path, false)));
}

/** The circled 1 that marks a block turned by 1-knob. */
const oneKnobMark = (): HTMLElement => el("span", { class: "cv-oneknob-mark", text: "1" });

export const channelViewScreen: ScreenDef = {
  id: "channel-view",
  // The unit leaves the icon row up here: the view is one step off HOME, and
  // the screens the icons open are still one tap away.
  toolbar: "home",
  // A bus assigns no knob and still carries the readout strip, empty.
  knobStrip: true,
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    selectStrip(ctx, strip.id);
    const base = `ch.${strip.id}`;
    const mono = strip.kind === "monoIn";
    const { spec: gainSpec, connector } = headAmp(ctx, strip);
    const position = stripPosition(ctx, strip);
    const panParam = { ...panSpec(position.path, position.caption) };
    const levelSpec = faderSpec(`${base}.level`, "LEVEL");
    // Only an input channel has a head amp. A bus shows its level down that
    // column instead, with nothing to set there.
    const inputChannel = mono || strip.kind === "stIn";
    // An input channel's meter there reads its level as it arrives, before the fader.
    const gainMeterId = inputChannel ? inputMeterId(strip.id) : strip.id;
    const gainMeter = (stereo: boolean): number[] => meterLevels(ctx.store, gainMeterId, stereo ? 2 : 1);

    // The streaming bus has no position, no level and no on/off — it is fed,
    // and it is heard.
    const streaming = strip.kind === "streaming";
    ctx.setKnobs([gainSpec ?? null, null, streaming ? null : panParam, streaming ? null : levelSpec]);
    // The head amp column. Every strip carries the input meter in the same
    // place; what stands beside it is the channel's, and a bus has none of it.
    const mark = (text: string, lit: boolean, kind = ""): HTMLElement =>
      el("span", { class: `flag${kind ? ` ${kind}` : ""}${lit ? " is-on" : ""}`, text });
    const flag = (text: string, key: string, kind = ""): HTMLElement => mark(text, ctx.store.bool(`${base}.${key}`, false), kind);
    // The analog head amp's marks are blank off a MIC/LINE connector.
    const ampFlag = (text: string, key: "phantom" | "hiZ", shown: boolean, kind = ""): HTMLElement =>
      connector && shown ? mark(text, ctx.store.bool(headAmpSwitch(connector, key), false), kind) : mark("", false, kind);
    // A stereo input inverts its two sides separately; this view carries one
    // side at a time, and the mark is that side's.
    const phaseFlag = el("span", {
      class: `flag is-phase${ctx.store.bool(phasePath(ctx, strip), false) ? " is-on" : ""}`,
      attrs: { role: "img", "aria-label": "Φ" },
      children: [Icons.phase()],
    });
    // A bus keeps the caption's line and the stack's column empty, so its meter
    // stands where a channel's does.
    // The streaming bus is fed from inside the mixer, so its column opens the
    // same INPUT screen with nothing but the source on it.
    const opensInput = inputChannel || streaming;
    const gainCell = el("div", {
      class: "cv-gain",
      ...(opensInput ? { onTap: () => ctx.nav.push({ id: "ch.input", strip: strip.id }) } : {}),
      ...(streaming ? { attrs: { "aria-label": `${strip.label} input` } } : {}),
      children: [
        el("span", { class: "cv-caption", text: gainSpec?.label ?? "" }),
        el("div", {
          class: "cv-gain-row",
          children: [
            el("div", {
              class: "cv-gain-stack",
              children: gainSpec ? [valueBox(ctx, gainSpec), knobControl(ctx, gainSpec, 38)] : [],
            }),
            // A two-channel strip meters the channel in view alone.
            stripLanes(strip) === 2
              ? meter({ levels: [gainMeter(true)[stripLane(ctx, strip)] ?? -96], source: gainMeterId, lane: stripLane(ctx, strip) })
              : meter({ levels: gainMeter(false), source: gainMeterId }),
          ],
        }),
        ...(inputChannel
          ? [
              el("div", {
                class: "cv-gain-flags",
                children: [
                  ampFlag("+48V", "phantom", true, "is-phantom"),
                  phaseFlag,
                  ...(mono
                    ? [flag("HPF", "hpf.on"), ampFlag("HI-Z", "hiZ", !!connector?.hiZ)]
                    : connector?.hiZ
                      ? [el("span"), ampFlag("HI-Z", "hiZ", true)]
                      : []),
                ],
              }),
              // [AUTO] and [SAFE] belong to the analogue head amp: the guide
              // draws them on every A.Gain figure and on no D.Gain one, ST IN
              // included. [AUTO] runs the auto-gain routine rather than holding
              // a setting, and this simulator does not run it. [SAFE] is the
              // connector's Clip Safe, the switch INPUT names in full.
              ...(connector
                ? [
                    el("div", {
                      class: "cv-gain-buttons",
                      children: [unbuilt("AUTO"), markClipSafe(ctx.store, safeToggle(ctx, headAmpSwitch(connector, "clipSafe")), connector)],
                    }),
                  ]
                : []),
            ]
          : []),
      ],
    });

    // While 1-knob turns EQ, the knob sets its depth, printed over the curve.
    const eqBlock = (): HTMLElement => {
      const open = (): void => ctx.nav.push({ id: "ch.eq", strip: strip.id });
      if (!ctx.store.bool(`${base}.eq.oneKnob.on`, false)) return block(ctx, "EQ", "eq", `${base}.eq.on`, true, eqThumb(ctx, strip.id), open);
      const depth = oneKnobDepth(`${base}.eq.oneKnob.level`);
      const graph = el("div", {
        class: "cv-eq-oneknob",
        children: [eqThumb(ctx, strip.id), oneKnobMark(), el("span", { class: "cv-eq-depth", text: `${depth.format(ctx.store.num(depth.path, depth.fallback))}%` })],
      });
      return block(ctx, "EQ", "eq", `${base}.eq.on`, true, graph, open, { spec: depth, frame: graph });
    };
    const insFxBlock = (): HTMLElement => {
      const insert = insertBase(ctx, strip);
      const effect = ctx.store.str(`${insert}.effect`, NO_EFFECT);
      return block(ctx, "INS FX", "insfx", `${insert}.on`, false,
        el("div", { class: "cv-block-value cv-block-text", text: effect }),
        () => openEffectParams(ctx, strip, true),
        undefined,
        effect === NO_EFFECT,
      );
    };

    // An FX channel is an effect rather than a channel carrying one: its panel
    // names the channel, leaves a line, and names the effect it is running.
    const fxBlock = (): HTMLElement =>
      el("div", {
        class: "cv-block cv-block-fx",
        onTap: () => openEffectParams(ctx, strip),
        attrs: { "aria-label": `${strip.label} effect` },
        children: [
          el("span", { class: "badge badge-plain cv-fx-name", text: strip.label }),
          el("div", { class: "cv-block-value cv-block-text cv-fx-effect", text: ctx.store.str(`${base}.effect.type`, "") }),
        ],
      });

    // What a channel puts in its processing row. GATE and COMP are the mono
    // channel's; DUCKER the stereo input's; DELAY the streaming bus's. An EQ
    // belongs to the input channels, the mixes and the stereo bus; an insert to
    // the mono channels, the mixes and the stereo bus.
    const blocks: HTMLElement[] = [];
    const readout = (spec: NumericSpec, extra = "", suffix = ""): HTMLElement =>
      el("div", { class: `cv-block-value ${extra}`.trim(), text: spec.format(ctx.store.num(spec.path, spec.fallback)) + suffix });
    if (mono) {
      const gate = gateThreshold(base);
      const gateValue = readout(gate);
      // While 1-knob turns COMP, the knob sets its depth instead of the threshold.
      const ssmcs = ctx.store.str(`${base}.compEqOrder`, "COMP->EQ") === COMP_EQ_SSMCS;
      const compOneKnob = ctx.store.bool(`${base}.comp.oneKnob.on`, false);
      const comp = compOneKnob ? oneKnobDepth(`${base}.comp.oneKnob.level`) : compThreshold(base);
      const compValue = readout(comp, "", compOneKnob ? "%" : "");
      blocks.push(
        block(ctx, "GATE", "gate", `${base}.gate.on`, false,
          el("div", { class: "cv-block-body", children: [gateValue, gateLamps(ctx, strip, base)] }),
          () => ctx.nav.push({ id: "ch.gate", strip: strip.id }),
          { spec: gate, frame: gateValue },
        ),
        ssmcs
          ? ssmcsArea(ctx, strip)
          : block(ctx, "COMP", "comp", `${base}.comp.on`, false,
              el("div", {
                class: "cv-block-body",
                children: [
                  compOneKnob ? el("div", { class: "cv-oneknob", children: [oneKnobMark(), compValue] }) : compValue,
                  compMeters(ctx, strip, base, !compOneKnob),
                ],
              }),
              () => ctx.nav.push({ id: "ch.comp", strip: strip.id }),
              { spec: comp, frame: compValue },
            ),
      );
      blocks.push(...(ssmcs ? [] : [eqBlock()]), insFxBlock());
    } else if (strip.kind === "stIn") {
      const ducker = duckerThreshold(base);
      const duckerValue = readout(ducker);
      blocks.push(
        eqBlock(),
        block(ctx, "DUCKER", "ducker", `${base}.ducker.on`, false,
          el("div", { class: "cv-block-body", children: [duckerValue, duckerLamps(ctx, base)] }),
          () => ctx.nav.push({ id: "ch.ducker", strip: strip.id }),
          { spec: ducker, frame: duckerValue },
        ),
      );
    } else if (strip.kind === "streaming") {
      const delay = delayTime(base);
      const delayValue = readout({ ...delay, format: (v) => v.toFixed(2) }, "cv-delay-value");
      blocks.push(
        block(ctx, "DELAY", "delay", `${base}.delay.on`, false, delayValue, () => ctx.nav.push({ id: "ch.delay", strip: strip.id }), {
          spec: delay,
          frame: delayValue,
        }),
      );
    } else if (strip.kind === "mix" || strip.kind === "stereo") {
      blocks.push(eqBlock(), insFxBlock());
    } else if (strip.kind === "fx") {
      blocks.push(fxBlock());
    }

    const sendTo = el("button", {
      class: "cv-sendto",
      onTap: () => ctx.nav.push({ id: "ch.sendto", strip: strip.id }),
      children: [el("span", { class: "cv-sendto-icon", children: [Icons.sendTo()] }), el("span", { text: "SEND TO" })],
    });

    const panCell = el("div", {
      class: "cv-param cv-pan",
      children: [
        el("span", { class: "cv-caption", text: panParam.label }),
        valueBox(ctx, panParam),
        knobControl(ctx, panParam),
      ],
    });
    const levelCell = el("div", {
      class: "cv-param cv-level",
      children: [
        el("span", { class: "cv-caption", text: "LEVEL" }),
        valueBox(ctx, levelSpec),
        knobControl(ctx, levelSpec),
      ],
    });

    const onOff = el("div", {
      class: "cv-onoff",
      children: [
        toggle("CUE", ctx.store.bool(`${base}.cue`, false), () => void ctx.store.set(`${base}.cue`, !ctx.store.bool(`${base}.cue`, false)), "btn-switch btn-cue"),
        ...(streaming
          ? []
          : [toggle("ON", ctx.store.bool(`${base}.on`, true), () => void ctx.store.set(`${base}.on`, !ctx.store.bool(`${base}.on`, true)), "btn-switch btn-on")]),
        meter({ levels: simulatedLevel(ctx, strip, !mono), height: 80, source: strip.id }),
      ],
    });

    // What a channel routes decides what it can set: only a strip that sends to
    // STEREO has a SEND TO.
    const sendsToStereo = inputChannel || strip.kind === "fx" || strip.kind === "mix";
    return {
      main: el("div", {
        class: "cv-main",
        children: [
          gainCell,
          el("div", { class: "cv-blocks", children: blocks }),
          ...(sendsToStereo ? [sendTo] : []),
          ...(streaming ? [] : [panCell, levelCell]),
          onOff,
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route),
    };
  },
};

/**
 * Picking a channel's colour. The unit keeps a fixed palette and a channel can
 * also carry none, which leaves its rail and the mark beside its name bare. The
 * sheet is the one the input source is picked on.
 */
function colorSheet(ctx: AppContext, strip: Strip): void {
  const path = `ch.${strip.id}.color`;
  pickerSheet(ctx, {
    title: "COLOR",
    label: `${strip.label} colour`,
    sheetClass: "color-sheet",
    build: (close) => {
      // Each button is painted in the colour it stands for, over a band of the
      // same colour taken down towards black, and names itself in whichever of
      // black or white reads on it.
      const swatch = (name: string, hex: string, face: string, ink = inkOn(face)): HTMLElement =>
        el("button", {
          class: "btn color-swatch",
          text: name,
          style: { background: face, color: ink },
          onTap: () => {
            void ctx.store.set(path, hex);
            close();
            ctx.repaint();
          },
        });
      return el("div", {
        class: "color-grid",
        children: [
          ...CH_COLOR_PALETTE.map((c) => swatch(c.name, c.hex, c.hex)),
          // The unit leaves a place between the palette and the one that takes
          // the colour away.
          el("div", { class: "color-gap" }),
          // That one names itself in the grey the unit writes a secondary line
          // in, not in the white the rest use.
          swatch(CH_COLOR_OFF, CH_COLOR_OFF, CH_COLOR_NONE, "var(--text-secondary)"),
        ],
      });
    },
  });
}

export const chSettingScreen: ScreenDef = {
  id: "ch.setting",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return { main: el("div", { class: "screen-missing", text: "No channel selected" }) };
    const base = `ch.${strip.id}`;
    const field = (caption: string, slot: string, node: HTMLElement): HTMLElement =>
      el("div", { class: `chs-field chs-${slot}-field`, children: [el("span", { class: "chs-caption", text: caption }), node] });
    // What touching the field does: the two a stereo pair shares are copied to
    // the partner, the name is typed.
    const box = (slot: string, mark: "copy" | "edit", children: (HTMLElement | null)[] = []): HTMLElement =>
      el("div", {
        class: `chs-box chs-${slot}-box`,
        children: [
          ...children,
          el("span", { class: `chs-mark chs-mark-${mark}`, children: [mark === "copy" ? Icons.copy() : Icons.rename()] }),
        ],
      });

    const nameInput = el("input", {
      class: "chs-name",
      attrs: { type: "text", maxlength: "8", "aria-label": "Channel name" },
    }) as HTMLInputElement;
    nameInput.value = ctx.store.str(`${base}.name`, "");
    // Committing on change rather than on every keystroke keeps an IME
    // composition from writing half-formed text to the device.
    nameInput.addEventListener("change", () => void ctx.store.set(`${base}.name`, nameInput.value));

    const colorBox = box("color", "copy", [el("span", { class: "chs-color", style: { background: stripColor(ctx, strip) } })]);
    makeTappable(colorBox, () => colorSheet(ctx, strip));

    const children = [
      field("Color", "color", colorBox),
      // The box previews the channel's icon with the same stand-in the toolbar's chip carries.
      field("Icon", "icon", box("icon", "copy", [el("span", { class: "chs-icon", style: { background: stripColor(ctx, strip) } })])),
      field("Name", "name", box("name", "edit", [nameInput])),
    ];
    // Every input channel taps somewhere; only a mono one carries the stages the
    // COMP / EQ and Signal Type rows set.
    if (strip.kind === "monoIn" || strip.kind === "stIn") {
      children.push(
        field(
          "Rec Point",
          "rec",
          pulldown(ctx, ctx.store.str(`${base}.recPoint`, REC_POINT_DEFAULT), recPoints(ctx, strip), (v) =>
            void ctx.store.set(`${base}.recPoint`, v),
          ),
        ),
      );
    }
    if (strip.kind === "monoIn") {
      children.push(
        field("COMP / EQ", "comp", pulldown(ctx, ctx.store.str(`${base}.compEqOrder`, "COMP->EQ"), COMP_EQ_ORDERS, (v) => setCompEq(ctx, strip, v))),
        field("Signal Type", "signal", pulldown(ctx, signalType(ctx, strip), SIGNAL_TYPES, (v) => setSignalType(ctx, strip, v))),
      );
      // A stereo pair is placed either by one PAN per channel or by the pair's
      // balance, so it offers the choice under the Signal Type.
      if (signalType(ctx, strip) === "STEREO") {
        const current = ctx.store.str(`${base}.panBal`, "PAN");
        children.push(
          el("div", {
            class: "chs-panbal",
            children: PAN_BAL.map((v) => toggle(v, v === current, () => setPanBal(ctx, strip, v), "panbal-btn")),
          }),
        );
      }
    }
    // A MIX bus carries what its sends are given: the type they are taken at,
    // and whether they are placed by their source channel.
    if (strip.kind === "mix") {
      const fixed = busType(ctx, strip) === "FIXED";
      const linked = panLinkOn(ctx, strip);
      const panLink = toggle("Pan Link", linked, () => {
        if (!fixed) setPanLink(ctx, strip, !linked);
      }, "panlink-btn");
      // Pan Link works on a bus taking variable send levels, so a FIXED bus
      // keeps the button in place and out of reach.
      if (fixed) panLink.setAttribute("aria-disabled", "true");
      children.push(
        field(
          "BUS Type",
          "bustype",
          pulldown(ctx, busType(ctx, strip), BUS_TYPES, (v) => setBusType(ctx, strip, v), {
            label: "BUS Type",
            listClass: "chs-bustype-list",
          }),
        ),
        el("div", { class: `chs-panlink${fixed ? " is-locked" : ""}`, children: [panLink] }),
      );
    }
    return {
      main: el("div", { class: "chs-main", children }),
      // The screen a channel's name opens carries the name in full, not the
      // short chip the screens under it carry.
      headerLeft: channelSelector(ctx, strip, route),
      headerCenter: titleBox("CH SETTING", "badge-setting"),
    };
  },
};

export const inputScreen: ScreenDef = {
  id: "ch.input",
  toolbar: "sub",
  // A strip with no head amp assigns no knob and still carries the readout
  // strip, empty.
  knobStrip: true,
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const base = `ch.${strip.id}`;
    const mono = strip.kind === "monoIn";
    // A head amp belongs to a channel. A bus is fed from inside the mixer, so
    // its INPUT screen carries only the level arriving on it; STREAMING keeps
    // the source it is fed from.
    const headAmped = mono || strip.kind === "stIn";
    const { spec: gainSpec, connector } = headAmp(ctx, strip);
    const hpfSpec = freqSpec(`${base}.hpf.freq`, "HPF Freq.", 40, 120, 80, 20);
    ctx.setKnobs(headAmped ? [gainSpec ?? null, null, null, ...(mono ? [hpfSpec] : [])] : []);
    const flagAt = (label: string, p: ParamPath, cls: string): HTMLElement => {
      const on = ctx.store.bool(p, false);
      return toggle(label, on, () => void ctx.store.set(p, !on), `input-flag ${cls}`);
    };
    const flag = (label: string, key: string, cls: string): HTMLElement => flagAt(label, `${base}.${key}`, cls);
    // The analog head amp's buttons stand on a MIC/LINE connector alone.
    const ampFlag = (label: string, key: "phantom" | "hiZ" | "clipSafe", cls: string): HTMLElement[] =>
      connector ? [flagAt(label, headAmpSwitch(connector, key), cls)] : [];
    // A column of the panel: what the value is, the value, and the knob for it.
    const column = (spec: NumericSpec, cls: string): HTMLElement =>
      el("div", {
        class: `input-col ${cls}`,
        children: [
          el("span", { class: "input-col-caption", text: spec.label }),
          valueBox(ctx, spec),
          knobControl(ctx, spec),
        ],
      });
    const levelBar = (cls: string): HTMLElement =>
      el("div", {
        class: `input-meter ${cls}`,
        children: [meter({ levels: simulatedInput(ctx, strip, false), source: inputMeterId(strip.id) })],
      });

    return {
      main: el("div", {
        class: "input-screen",
        children: [
          ...(headAmped || strip.kind === "streaming"
            ? [
                el("span", { class: "input-caption", text: "Input Source" }),
                el("button", {
                  class: "input-source-btn",
                  onTap: () => void inputSourceSheet(ctx, strip),
                  children: [
                    el("span", { text: sourceBoxLabel(ctx, ctx.store.str(`${base}.source`, "MIC/LINE")) }),
                    el("span", { class: "ch-chip-copy", children: [Icons.copy()] }),
                  ],
                }),
              ]
            : []),
          el("div", {
            class: "input-panel input-panel-a",
            children: headAmped
              ? [
                  ...ampFlag("+48V", "phantom", "if-left is-phantom"),
                  ...(connector?.hiZ ? ampFlag("HI-Z", "hiZ", "if-right is-hiz") : []),
                  ...(gainSpec ? [column(gainSpec, "input-col-a")] : []),
                  ...(connector ? [markClipSafe(ctx.store, flagAt("Clip Safe", headAmpSwitch(connector, "clipSafe"), "if-clip"), connector)] : []),
                  ...(connector ? [unbuilt("Auto Gain", "input-flag if-auto")] : []),
                ]
              : [],
          }),
          el("div", {
            class: "input-panel input-panel-b",
            children: headAmped
              ? [
                  // A stereo input inverts its two sides separately; this
                  // screen carries one side at a time, and the button is that
                  // side's. Its name is the mark HOME draws, not a letter.
                  (() => {
                    const node = flagAt("Φ", phasePath(ctx, strip), "if-left is-phase");
                    node.replaceChildren(Icons.phase());
                    node.setAttribute("aria-label", "Φ");
                    return node;
                  })(),
                  ...(mono ? [flag("HPF", "hpf.on", "if-right is-hpf"), column(hpfSpec, "input-col-b")] : []),
                ]
              : [],
          }),
          levelBar("input-meter-a"),
          levelBar("input-meter-b"),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBox("INPUT", "badge-input"),
    };
  },
};

// The panel the dynamics screens draw on, inside a 1px frame, with both axes
// running the same -80..+20 dB.
export const PLOT_W = 198;
export const PLOT_H = 171;
export const PLOT_MIN = -80;
export const PLOT_MAX = 20;
export const PLOT_SPAN = PLOT_MAX - PLOT_MIN;
export const NS = "http://www.w3.org/2000/svg";

export const plotX = (db: number, w = PLOT_W): number => ((db - PLOT_MIN) / PLOT_SPAN) * w;
export const plotY = (db: number, h = PLOT_H): number => h - ((db - PLOT_MIN) / PLOT_SPAN) * h;

export { COMP_KNEE_WIDTH, compResponse } from "../model/dynamics";

/** The svg a plot is drawn into, wrapped in the panel it stands on. */
export function plotPanel(draw: (svg: SVGSVGElement) => void): HTMLElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${PLOT_W} ${PLOT_H}`);
  svg.setAttribute("class", "dyn-curve");
  svg.setAttribute("aria-hidden", "true");
  draw(svg);
  return el("div", { class: "dyn-plot", children: [svg as unknown as HTMLElement] });
}

/** The rules the unit lays across a plot, given as fractions of each axis. */
export function plotRules(svg: SVGSVGElement, verticals: number[], horizontals: number[], w = PLOT_W, h = PLOT_H): void {
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const node = document.createElementNS(NS, "line");
    node.setAttribute("x1", x1.toFixed(1));
    node.setAttribute("y1", y1.toFixed(1));
    node.setAttribute("x2", x2.toFixed(1));
    node.setAttribute("y2", y2.toFixed(1));
    node.setAttribute("class", "dyn-grid");
    svg.appendChild(node);
  };
  // Each rule covers one whole column or row of pixels.
  for (const f of verticals) line(Math.round(f * w) + 0.5, 0, Math.round(f * w) + 0.5, h);
  for (const f of horizontals) line(0, Math.round(f * h) + 0.5, w, Math.round(f * h) + 0.5);
}

/** The area under a curve and the curve itself, from points in plot coordinates. */
export function plotCurve(svg: SVGSVGElement, points: readonly (readonly [number, number])[], w = PLOT_W, h = PLOT_H): void {
  const pts = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = document.createElementNS(NS, "polygon");
  area.setAttribute("points", `${points[0]?.[0] ?? 0},${h} ${pts} ${points.at(-1)?.[0] ?? w},${h}`);
  area.setAttribute("class", "dyn-curve-fill");
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("points", pts);
  line.setAttribute("class", "dyn-curve-line");
  // The rules laid before the curve run on over its fill a shade lighter.
  const rules = [...svg.querySelectorAll("line.dyn-grid")];
  if (rules.length === 0) {
    svg.append(area, line);
    return;
  }
  const id = `dyn-fill-${++plotClipCount}`;
  const clip = document.createElementNS(NS, "clipPath");
  clip.setAttribute("id", id);
  clip.appendChild(area.cloneNode());
  const lit = document.createElementNS(NS, "g");
  lit.setAttribute("clip-path", `url(#${id})`);
  lit.setAttribute("class", "dyn-grid-lit");
  for (const rule of rules) lit.appendChild(rule.cloneNode());
  svg.append(area, clip, lit, line);
}

/** Each plot's fill clip needs an id of its own in the document. */
let plotClipCount = 0;

/** A handle's radius on a plot, and the width of the ring drawn on it. */
export const HANDLE_R = 14.5;
export const HANDLE_RING = 3;

/**
 * A grip on a plot: a lettered disc that takes the focus when touched and turns
 * the value it stands for. While it holds the focus its rim turns pink and a mark
 * either side points the way its value moves — along the plot for `x`, up and
 * down it for `y`. The marks stand over every handle on the plot, so no other
 * handle covers them. A value that would take the disc over the top of the plot
 * or under its floor leaves the whole disc on the plot, its edge on the frame.
 */
export function plotHandle(
  ctx: AppContext,
  svg: SVGSVGElement,
  letter: string,
  cx: number,
  y: number,
  axis: "x" | "y",
  turns: { spec: NumericSpec; sense?: 1 | -1; fixed?: boolean },
): void {
  const cy = clamp(y, HANDLE_R, PLOT_H - HANDLE_R);
  const grp = document.createElementNS(NS, "g");
  grp.setAttribute("class", `dyn-handle${turns.fixed ? " is-fixed" : ""}`);
  grp.setAttribute("aria-label", `${letter} handle: ${turns.spec.label}`);
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("cx", cx.toFixed(1));
  c.setAttribute("cy", cy.toFixed(1));
  c.setAttribute("r", String(turns.fixed ? HANDLE_R / 2 : HANDLE_R));
  // A grip the unit is driving itself carries no letter and takes no touch.
  if (turns.fixed) {
    grp.append(c);
    svg.append(grp);
    return;
  }
  const label = document.createElementNS(NS, "text");
  label.setAttribute("x", cx.toFixed(1));
  label.setAttribute("y", (cy + 5).toFixed(1));
  label.setAttribute("text-anchor", "middle");
  label.textContent = letter;
  grp.append(c, label);
  // A point `along` the axis from the centre and `side` across it.
  const at = (along: number, side: number): string =>
    axis === "x" ? `${(cx + along).toFixed(1)},${(cy + side).toFixed(1)}` : `${(cx + side).toFixed(1)},${(cy + along).toFixed(1)}`;
  const marks = document.createElementNS(NS, "g");
  marks.setAttribute("class", "dyn-handle-mark");
  marks.setAttribute("data-letter", letter);

  for (const dir of [-1, 1] as const) {
    const arrow = document.createElementNS(NS, "polygon");
    arrow.setAttribute("points", `${at(dir * (HANDLE_R + 11), 0)} ${at(dir * (HANDLE_R + 5), -4)} ${at(dir * (HANDLE_R + 5), 4)}`);
    arrow.setAttribute("class", "dyn-handle-arrow");
    marks.appendChild(arrow);
  }
  // The grip is the control for its value: it carries the reading, and dragging
  // it along its own axis moves it.
  const held = turns.spec.focusKey ?? turns.spec.path;
  const value = ctx.store.num(turns.spec.path, turns.spec.fallback);
  grp.setAttribute("role", "slider");
  grp.setAttribute("tabindex", "0");
  grp.setAttribute("aria-valuenow", String(value));
  grp.setAttribute("aria-valuemin", String(turns.spec.min));
  grp.setAttribute("aria-valuemax", String(turns.spec.max));
  grp.setAttribute("aria-valuetext", formatValue(turns.spec, value));
  const node = grp as unknown as HTMLElement;
  makeTappable(node, () => ctx.focus.take(turns.spec));
  attachSpin(ctx, node, turns.spec, () => ctx.focus.take(turns.spec), { axis, ...(turns.sense ? { sense: turns.sense } : {}) });
  markFocus(ctx, grp, held, "is-held");
  markFocus(ctx, marks, held, "is-held");
  // Every handle's marks go in the one layer, kept after the last handle drawn.
  const layer = [...svg.children].find((n) => n.classList.contains("dyn-handle-marks")) ?? document.createElementNS(NS, "g");
  layer.setAttribute("class", "dyn-handle-marks");
  layer.appendChild(marks);
  svg.append(grp, layer);
}

/**
 * How far a block that holds the channel down from `threshold` is holding it, as a
 * fraction of the meter it is drawn on. The meter covers the threshold's own range.
 */
export function thresholdReduction(ctx: AppContext, strip: Strip, threshold: number): number {
  const level = simulatedLevel(ctx, strip, false)[0] ?? -96;
  return clampFraction(Math.max(0, level - threshold) / -COMP_THRESHOLD_MIN);
}

/** A caption over a value box, as the dynamics screens stack them down the right. */
export function dynSetting(ctx: AppContext, spec: NumericSpec, caption = spec.label): HTMLElement {
  return el("div", {
    class: "dyn-set",
    children: [el("span", { class: "dyn-set-caption", text: caption }), valueBox(ctx, spec)],
  });
}

/** The block's own input and output, as the dynamics screens meter them. OUT reads `attenuationDb` lower. */
export function dynMeters(ctx: AppContext, strip: Strip, attenuationDb = 0, gr?: GrSpec): HTMLElement {
  const stereo = strip.kind !== "monoIn";
  const column = (caption: string, offset: number, pair: boolean, mark?: GrSpec): HTMLElement => {
    const bars = meter({ levels: simulatedLevel(ctx, strip, pair).map((db) => db - offset), source: strip.id, offset });
    // The OUT meter's offset is what the block is taking off, so the ticker
    // works it out again on every tick rather than keeping the built one.
    if (mark) markReduction(bars, mark);
    return el("div", { class: "dyn-io-col", children: [el("span", { class: "dyn-io-caption", text: caption }), bars] });
  };
  // An FX channel is fed by one bus and returns two, so it is the one block
  // whose IN and OUT are not the same width.
  const inPair = stereo && strip.kind !== "fx";
  return el("div", {
    class: "dyn-io",
    children: [column("IN", 0, inPair), column("OUT", attenuationDb, stereo, gr)],
  });
}

/**
 * The frame the three dynamics screens share. `gateDb` is what a gate takes off:
 * the reduction meter and the OUT meter show it where it is given, and the
 * compressor's reduction otherwise.
 */
function dynScreen(
  ctx: AppContext,
  strip: Strip,
  plot: HTMLElement,
  right: (HTMLElement | null)[],
  gr: GrSpec,
): HTMLElement {
  // The OUT meter reads as far below IN as the bar beside it reads, less what
  // the block adds back after it.
  const db = blockReduction(ctx.store, gr);
  return dynFrame(plot, db / gr.scale, [...right, dynMeters(ctx, strip, blockNetDb(ctx.store, gr), gr)], gr);
}

/**
 * The curve, the reduction meter beside it and what stands to their right. An
 * insert effect that works the way a dynamics block works is drawn in it too.
 */
export function dynFrame(
  plot: HTMLElement,
  reduction: number,
  right: (HTMLElement | null)[],
  gr?: GrSpec,
): HTMLElement {
  const bar = el("div", {
    class: "dyn-gr",
    children: [el("i", { style: { height: `${clampFraction(reduction) * 100}%` } })],
  });
  if (gr) markReduction(bar, gr);
  return el("div", { class: "dyn-screen", children: [plot, bar, ...right] });
}

/** The lowest threshold the dynamics blocks reach, which their meters run to. */
const COMP_THRESHOLD_MIN = -54;

export const gateScreen: ScreenDef = {
  id: "ch.gate",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const b = `ch.${strip.id}`;
    const threshold = gateThreshold(b);
    const range = dbSpec(`${b}.gate.range`, "Range", -73, 0, GATE_DEFAULTS.range, 1, 0);
    const attack = msSpec(`${b}.gate.attack`, "Attack", 0.092, 80, GATE_DEFAULTS.attack);
    const hold = msSpec(`${b}.gate.hold`, "Hold", 0.02, 1960, GATE_DEFAULTS.hold, 1, 1);
    const decay = msSpec(`${b}.gate.decay`, "Decay", 9.3, 999, GATE_DEFAULTS.decay, 1);
    ctx.setKnobs([threshold, range, attack, hold, decay]);
    const on = ctx.store.bool(`${b}.gate.on`, false);
    const t = ctx.store.num(threshold.path, threshold.fallback);
    const r = ctx.store.num(range.path, range.fallback);

    return {
      main: dynScreen(
        ctx,
        strip,
        plotPanel((svg) => {
          plotRules(svg, [0.8], [0.2]);
          // A gate passes what is over the threshold and holds the rest down by
          // the range, so the curve is two parallel runs with a step between.
          plotCurve(svg, [
            [plotX(PLOT_MIN), plotY(PLOT_MIN + r)],
            [plotX(t), plotY(t + r)],
            [plotX(t), plotY(t)],
            [plotX(PLOT_MAX), plotY(PLOT_MAX)],
          ]);
          plotHandle(ctx, svg, "R", plotX(t), plotY(t + r), "y", { spec: range });
          plotHandle(ctx, svg, "T", plotX(t), plotY(t), "x", { spec: threshold });
        }),
        [
          el("div", {
            class: "dyn-sets",
            children: [attack, hold, decay].map((s) => dynSetting(ctx, s)),
          }),
        ],
        { kind: "gate", base: b, level: strip.id, scale: GR_METER_DB, makeup: 0 },
      ),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBadge("GATE", "gate", on, () => void ctx.store.set(`${b}.gate.on`, !on)),
    };
  },
};

/**
 * COMP (user guide, "COMP screen"). The curve fills the left of the screen, the
 * settings the right, and the block's own meters the far right.
 */
export const compScreen: ScreenDef = {
  id: "ch.comp",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const b = `ch.${strip.id}`;
    // While 1-knob is on, its level holds the focus and no other value turns.
    const oneKnob = ctx.store.bool(`${b}.comp.oneKnob.on`, false);
    const level = oneKnobDepth(`${b}.comp.oneKnob.level`);
    if (oneKnob) ctx.focus.pin(level);
    else ctx.focus.unpin();
    const threshold = compThreshold(b);
    const ratio = compRatioSpec(`${b}.comp.ratio`, COMP_DEFAULTS.ratio, false);
    // The unit works the makeup gain out itself while Auto Makeup is on, so the
    // division reads it and does not turn it.
    const autoMakeup = ctx.store.bool(`${b}.comp.autoMakeup`, false);
    const gain = { ...dbSpec(`${b}.comp.gain`, "Gain", 0, 18, COMP_DEFAULTS.gain, 0.5, 1), ...(autoMakeup ? { locked: true } : {}) };
    const attack = msSpec(`${b}.comp.attack`, "Attack", 0.092, 80, COMP_DEFAULTS.attack);
    const release = msSpec(`${b}.comp.release`, "Release", 9.3, 999, COMP_DEFAULTS.release, 1);
    // Five parameters over four divisions: the bar carries a step to the rest.
    ctx.setKnobs([threshold, ratio, gain, attack, release]);

    const on = ctx.store.bool(`${b}.comp.on`, false);
    const makeup = autoMakeup;
    const t = ctx.store.num(threshold.path, threshold.fallback);
    const r = Math.max(1, ctx.store.num(ratio.path, ratio.fallback));
    const g = ctx.store.num(gain.path, gain.fallback);
    const outAt = compResponse(t, r, COMP_KNEE_WIDTH[ctx.store.str(`${b}.comp.knee`, COMP_DEFAULTS.knee)] ?? 16, g);
    // While its own knob is driving the curve, the grips go to half-size rings
    // without letters and the curve takes the focus colour, as the EQ's do.
    const held = oneKnob ? ({ fixed: true } as const) : {};
    const compPlot = (draw: (svg: SVGSVGElement) => void): HTMLElement => {
      const node = plotPanel(draw);
      if (oneKnob) node.classList.add("is-oneknob");
      return node;
    };

    return {
      main: dynScreen(
        ctx,
        strip,
        compPlot((svg) => {
          plotRules(svg, [0.8], [0.2]);
          const knee = Math.min(Math.max(t, PLOT_MIN), PLOT_MAX);
          // A point a decibel draws a rounded knee round; the threshold is a whole
          // decibel, so a hard knee keeps its corner.
          plotCurve(
            svg,
            Array.from({ length: PLOT_SPAN + 1 }, (_, i) => PLOT_MIN + i).map((db) => [plotX(db), plotY(outAt(db))] as const),
          );
          // G lifts the whole curve with the gain; R stands on its far end, which
          // a higher ratio takes down.
          for (const [letter, cx, turns] of [
            ["G", HANDLE_R, { spec: gain }],
            ["R", PLOT_W - HANDLE_R, { spec: ratio, sense: -1 }],
          ] as const) {
            plotHandle(ctx, svg, letter, cx, plotY(outAt(PLOT_MIN + (cx / PLOT_W) * PLOT_SPAN)), "y", { ...turns, ...held });
          }
          plotHandle(ctx, svg, "T", plotX(knee), plotY(outAt(knee)), "x", { spec: threshold, ...held });
        }),
        [
          el("div", {
            class: "dyn-row dyn-row-makeup",
            children: oneKnob
              ? [oneKnobPanel(ctx, level, `${b}.comp.oneKnob.on`)]
              : [
                  el("span", { class: "dyn-caption", text: "Auto\nMakeup" }),
                  pulldown(ctx, makeup ? "On" : "Off", ["Off", "On"], (v) =>
                    void ctx.store.set(`${b}.comp.autoMakeup`, v === "On"),
                  ),
                  oneKnobButton(ctx, `${b}.comp.oneKnob.on`),
                ],
          }),
          el("div", {
            class: "dyn-row dyn-row-knee",
            children: [
              el("span", { class: "dyn-caption", text: "Knee" }),
              oneKnob
                ? lockedPulldown(ctx.store.str(`${b}.comp.knee`, "Medium"))
                : pulldown(ctx, ctx.store.str(`${b}.comp.knee`, "Medium"), COMP_KNEES, (v) =>
                    void ctx.store.set(`${b}.comp.knee`, v),
                  ),
            ],
          }),
          el("div", { class: "dyn-sets", children: [attack, release].map((s) => dynSetting(ctx, s)) }),
        ],
        { kind: "comp", base: b, level: strip.id, scale: COMP_GR_METER_DB, makeup: g },
      ),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBadge("COMP", "comp", on, () => void ctx.store.set(`${b}.comp.on`, !on)),
    };
  },
};

export const duckerScreen: ScreenDef = {
  id: "ch.ducker",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const b = `ch.${strip.id}`;
    const threshold = duckerThreshold(b);
    const range = dbSpec(`${b}.ducker.range`, "Range", -70, 0, -24, 1, 0);
    const attack = msSpec(`${b}.ducker.attack`, "Attack", 0.092, 80, 20.17);
    const decay = msSpec(`${b}.ducker.decay`, "Decay", 1.3, 5000, 1000, 1, 1);
    ctx.setKnobs([range, attack, decay, threshold]);
    const on = ctx.store.bool(`${b}.ducker.on`, false);
    const rangeDb = ctx.store.num(range.path, range.fallback);

    return {
      main: dynScreen(
        ctx,
        strip,
        plotPanel((svg) => {
          // The envelope: level held down to the range while the key sounds, and
          // let back up when it stops. Time runs across, level down.
          const top = duckY(0);
          const floor = duckY(rangeDb);
          const [fall, hold, rise] = [DUCK_FALL, DUCK_HOLD, DUCK_RISE];
          plotCurve(svg, [
            [0, top],
            [fall[0] * PLOT_W, top],
            [fall[1] * PLOT_W, floor],
            [hold * PLOT_W, floor],
            [rise[0] * PLOT_W, top],
            [PLOT_W, top],
          ]);
          plotRules(svg, [fall[1], rise[0]], [floor / PLOT_H]);
          plotHandle(ctx, svg, "R", HANDLE_R, floor, "y", { spec: range });
          plotHandle(ctx, svg, "A", fall[1] * PLOT_W, PLOT_H - HANDLE_R, "x", { spec: attack });
          plotHandle(ctx, svg, "D", rise[0] * PLOT_W, PLOT_H - HANDLE_R, "x", { spec: decay });
        }),
        [
          el("div", {
            class: "dyn-row dyn-row-source",
            children: [
              el("span", { class: "dyn-caption", text: "Ducker Source" }),
              (() => {
                const sources = duckerSources(ctx);
                const held = ctx.store.str(`${b}.ducker.source`, DUCKER_SOURCE_DEFAULT);
                // The box carries the channel's own name; the list under it
                // carries the numbers alone.
                const box = sources.find((s) => s.label === held)?.boxed ?? held;
                // The unit lays the list out three rows by eight: the mono
                // channels along the first, the stereo ones along the second
                // with the stereo bus at its far end, and the mixes on the third.
                const mono = sources.filter((s) => s.strip.kind === "monoIn").length;
                const stereo = sources.filter((s) => s.strip.kind === "stIn").length;
                const place = (_o: string, i: number): { row: number; column: number } => {
                  if (i < mono) return { row: 1, column: i + 1 };
                  if (i < mono + stereo) return { row: 2, column: i - mono + 1 };
                  if (i === mono + stereo) return { row: 2, column: DUCKER_SOURCE_COLUMNS };
                  return { row: 3, column: i - mono - stereo };
                };
                return pulldown(ctx, box, sources.map((s) => s.label), (v) => void ctx.store.set(`${b}.ducker.source`, v), {
                  label: "Ducker Source",
                  listClass: "ducker-source-list",
                  current: held,
                  place,
                });
              })(),
            ],
          }),
          el("div", { class: "dyn-sets", children: [dynSetting(ctx, threshold)] }),
        ],
        // The ducker hears the strip its key names, not its own channel.
        {
          kind: "ducker",
          base: b,
          level: duckerSources(ctx).find((s) => s.label === ctx.store.str(`${b}.ducker.source`, DUCKER_SOURCE_DEFAULT))?.strip.id ?? strip.id,
          scale: GR_METER_DB,
          makeup: 0,
        },
      ),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBadge("DUCKER", "ducker", on, () => void ctx.store.set(`${b}.ducker.on`, !on)),
    };
  },
};

/**
 * The ducking envelope's own axis. Level runs -100..+20 dB down the panel, and
 * the four corners stand at fixed fractions of the width.
 */
const DUCK_MIN = -100;
const DUCK_MAX = 20;
const duckY = (db: number): number => PLOT_H - ((db - DUCK_MIN) / (DUCK_MAX - DUCK_MIN)) * PLOT_H;
const DUCK_FALL = [0.162, 0.318] as const;
const DUCK_HOLD = 0.546;
const DUCK_RISE = [0.899, 1] as const;

/** How the DELAY screen names one time in four units. */
const DELAY_UNITS = [
  { label: "ms", per: 1, digits: 2 },
  { label: "frame", per: 0, digits: 2 },
  // Sound covers 0.343 m in a millisecond, which is 1.125 feet.
  { label: "meter", per: 0.343, digits: 1 },
  { label: "feet", per: 1.125, digits: 1 },
] as const;

/** The frame rates the DELAY screen counts a time in. `D` is drop frame. */
const DELAY_FRAME_RATES = ["24", "25", "29.97D", "29.97", "30D", "30", "60", "120"] as const;

const DELAY_FRAME_RATE_DEFAULT = "30";

/**
 * A rate carries its own name, so a drop-frame rate keeps its D; the frames a
 * time makes come from the number in that name.
 */
const frameRateOf = (label: string): number => Number.parseFloat(label);

/**
 * The rate the screen is counting in. A unit that stored the rate before it
 * carried its own name holds the number, which is read here and written back
 * as a name the next time one is picked.
 */
function delayFrameRate(ctx: AppContext, base: string): string {
  const held = ctx.store.str(`${base}.delay.frameRate`, "");
  if ((DELAY_FRAME_RATES as readonly string[]).includes(held)) return held;
  const older = String(ctx.store.num(`${base}.delay.frameRate`, NaN));
  return (DELAY_FRAME_RATES as readonly string[]).includes(older) ? older : DELAY_FRAME_RATE_DEFAULT;
}

/** The delay time's rotaries turn 135 degrees either side of 12 o'clock, their track with them. */
const DELAY_SWEEP_DEG = 270;

export const delayScreen: ScreenDef = {
  id: "ch.delay",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const b = `ch.${strip.id}`;
    const on = ctx.store.bool(`${b}.delay.on`, false);
    const rate = delayFrameRate(ctx, b);
    // One delay time, named in four units. Turning any of them turns the time.
    const ms = delayTime(b);
    // The value stays in milliseconds; each cell prints it in its own unit and
    // turns it by the step that unit reads in.
    const specs = DELAY_UNITS.map((u) => {
      const per = u.label === "frame" ? frameRateOf(rate) / 1000 : u.per;
      return {
        ...ms,
        label: u.label,
        // Each cell is framed on its own, though the four turn one time.
        focusKey: `${b}.delay.${u.label}`,
        step: 0.01 / per,
        fastStep: 0.1 / per,
        format: (v: number) => (v * per).toFixed(u.digits),
      };
    });
    ctx.setKnobs(specs);

    return {
      main: el("div", {
        class: "delay-screen",
        children: [
          el("div", {
            class: "delay-rate",
            children: [
              el("span", { class: "delay-caption", text: "Frame rate" }),
              // The unit sets the rates two across and four down.
              pulldown(ctx, rate, DELAY_FRAME_RATES, (v) => void ctx.store.set(`${b}.delay.frameRate`, v), {
                label: "Frame rate",
                columns: 2,
              }),
              el("span", { class: "delay-caption", text: "Frame / s" }),
            ],
          }),
          el("h2", { class: "section-band delay-title", text: "Delay Time" }),
          el("div", {
            class: "delay-cells",
            children: specs.map((spec) =>
              el("div", {
                class: "delay-cell",
                children: [
                  el("span", { class: "delay-cell-caption", text: spec.label }),
                  valueBox(ctx, spec),
                  knobControl(ctx, spec),
                ],
              }),
            ),
          }),
          dynMeters(ctx, strip),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBadge("DELAY", "delay", on, () => void ctx.store.set(`${b}.delay.on`, !on)),
    };
  },
};

/** Whether an EQ band is on; the band box switches it, and a band switched off shapes no curve. */
function eqBandOn(ctx: AppContext, base: string, band: string): boolean {
  return ctx.store.bool(`${base}.eq.${band}.on`, true);
}

/** The EQ's four bands: the name a reader hears, the shorter one the band box and the knobs show, and which way a held grip's marks point. */
const EQ_BANDS = [
  { key: "low", label: "LOW", box: "LOW", marks: "across" },
  { key: "lowMid", label: "LOW MID", box: "L-MID", marks: "updown" },
  { key: "highMid", label: "HIGH MID", box: "H-MID", marks: "updown" },
  { key: "high", label: "HIGH", box: "HIGH", marks: "across" },
] as const;

/** The EQ plot: log frequency across 20 Hz..20 kHz, gain up the middle. */
const EQ_HZ_MIN = 20;
const EQ_HZ_MAX = 20000;
const EQ_GAIN_MAX = 20;
const EQ_W = 414;
const EQ_H = 136;
const eqX = (hz: number): number => (Math.log10(hz / EQ_HZ_MIN) / Math.log10(EQ_HZ_MAX / EQ_HZ_MIN)) * EQ_W;
const eqY = (db: number): number => EQ_H / 2 - (db / (EQ_GAIN_MAX * 2)) * EQ_H;

export const eqScreen: ScreenDef = {
  id: "ch.eq",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const base = `ch.${strip.id}`;
    const bandKey = ctx.store.str("ui.eqBand", "low");
    const band = EQ_BANDS.find((b) => b.key === bandKey) ?? EQ_BANDS[0];
    // While 1-knob is on, its level holds the focus, no other value turns, and the
    // grips shrink to marks that pick nothing.
    const oneKnob = ctx.store.bool(`${base}.eq.oneKnob.on`, false);
    const level = oneKnobDepth(`${base}.eq.oneKnob.level`);
    if (oneKnob) ctx.focus.pin(level);
    else ctx.focus.unpin();
    // The screen opens holding the band picked last, on any channel.
    if (!oneKnob && ctx.focus.idle) ctx.focus.takeKey(`${base}.eq.${band.key}.grip`);
    const specs = eqBandSpecs(base, band);
    ctx.setKnobs([null, specs[0] ?? null, specs[1] ?? null, specs[2] ?? null]);
    const on = ctx.store.bool(`${base}.eq.on`, true);
    const shapes = EQ_SHAPES[band.key];
    const stored = ctx.store.str(`${base}.eq.${band.key}.shape`, "Bell");
    const shape = shapes.includes(stored) ? stored : (shapes[0] ?? "Bell");

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${EQ_W} ${EQ_H}`);
    svg.setAttribute("class", "eq-curve");
    svg.setAttribute("aria-hidden", "true");
    for (const [x1, y1, x2, y2] of [
      ...[100, 1000, 10000].map((hz) => [eqX(hz), 0, eqX(hz), EQ_H] as const),
      ...[10, 0, -10].map((db) => [0, eqY(db) + 0.5, EQ_W, eqY(db) + 0.5] as const),
    ]) {
      const rule = document.createElementNS(NS, "line");
      rule.setAttribute("x1", x1.toFixed(1));
      rule.setAttribute("y1", y1.toFixed(1));
      rule.setAttribute("x2", x2.toFixed(1));
      rule.setAttribute("y2", y2.toFixed(1));
      rule.setAttribute("class", "dyn-grid");
      svg.appendChild(rule);
    }
    const bands = EQ_BANDS.map((b) => ({
      hz: ctx.store.num(`${base}.eq.${b.key}.freq`, 1000),
      gain: ctx.store.num(`${base}.eq.${b.key}.gain`, 0),
      q: ctx.store.num(`${base}.eq.${b.key}.q`, 0.71),
      on: eqBandOn(ctx, base, b.key),
    }));
    // A band switched off keeps its grip where its values put it and adds nothing to the curve.
    const at = (hz: number): number =>
      bands.reduce((sum, s) => {
        if (!s.on) return sum;
        const octaves = Math.log2(hz / s.hz);
        return sum + s.gain * Math.exp(-((octaves * s.q) ** 2) * 2);
      }, 0);
    const points: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const hz = EQ_HZ_MIN * (EQ_HZ_MAX / EQ_HZ_MIN) ** (i / 96);
      points.push(`${eqX(hz).toFixed(1)},${eqY(at(hz)).toFixed(1)}`);
    }
    const area = document.createElementNS(NS, "polygon");
    area.setAttribute("points", `0,${eqY(0)} ${points.join(" ")} ${EQ_W},${eqY(0)}`);
    area.setAttribute("class", "eq-curve-fill");
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", points.join(" "));
    line.setAttribute("class", "eq-curve-line");
    svg.append(area, line);

    const plot = el("div", { class: `eq-plot${oneKnob ? " is-oneknob" : ""}`, children: [svg as unknown as HTMLElement] });
    // The grips pick the band, and the one touched takes the focus.
    for (const [i, b] of EQ_BANDS.entries()) {
      const s = bands[i];
      if (!s) continue;
      if (oneKnob) {
        plot.appendChild(
          el("span", {
            class: "eq-grip is-fixed",
            style: { left: `${eqX(s.hz).toFixed(1)}px`, top: `${eqY(s.gain).toFixed(1)}px` },
            attrs: { "aria-hidden": "true" },
          }),
        );
        continue;
      }
      const key = `${base}.eq.${b.key}.grip`;
      const hold = (): void => {
        ctx.focus.takeKey(key);
        void ctx.store.set("ui.eqBand", b.key);
      };
      const grip = el("button", {
        // A band switched off draws its grip hollow, the name in the ring's colour.
        class: `eq-grip${b.marks === "updown" ? " is-updown" : ""}${s.on ? "" : " is-off"}`,
        text: b.label.split(" ").map((w) => w[0]).join(""),
        style: { left: `${eqX(s.hz).toFixed(1)}px`, top: `${eqY(s.gain).toFixed(1)}px` },
        attrs: { "aria-label": `${b.label} band` },
        onTap: hold,
      });
      // Dragging a grip sets its band: the frequency along the graph, the gain up it.
      const [, freq, gain] = eqBandSpecs(base, b);
      if (freq) attachDrag(ctx, grip, freq, hold, { axis: "x" });
      if (gain) attachDrag(ctx, grip, gain, hold, { axis: "y" });
      markFocus(ctx, grip, key, "is-held");
      plot.appendChild(grip);
    }

    return {
      main: el("div", {
        class: "eq-screen",
        children: [
          // The box names the band held and switches that band on and off; 1-knob takes it away.
          ...(oneKnob
            ? []
            : [
                (() => {
                  const bandOn = eqBandOn(ctx, base, band.key);
                  return el("button", {
                    class: `eq-band${bandOn ? "" : " is-off"}`,
                    text: band.box,
                    attrs: { "aria-label": `${band.label} band on`, "aria-pressed": String(bandOn) },
                    onTap: () => void ctx.store.set(`${base}.eq.${band.key}.on`, !bandOn),
                  });
                })(),
              ]),
          ...(oneKnob
            ? [
                oneKnobPanel(
                  ctx,
                  level,
                  `${base}.eq.oneKnob.on`,
                  pulldown(ctx, ctx.store.str(`${base}.eq.oneKnob.type`, "Intensity"), EQ_ONE_KNOB_TYPES, (v) =>
                    setEqOneKnobType(ctx, base, v),
                  ),
                  (next) => setEqOneKnob(ctx, base, next),
                ),
              ]
            : [
                shapeBox(
                  pulldown(ctx, shape, shapes, (v) => void ctx.store.set(`${base}.eq.${band.key}.shape`, v), {
                    render: (option) => Icons.eqShape(option),
                    optionClass: "eq-shape-option",
                  }),
                  shape,
                  shapes.length > 1,
                ),
                oneKnobButton(ctx, `${base}.eq.oneKnob.on`, (next) => setEqOneKnob(ctx, base, next)),
              ]),
          plot,
          dynMeters(ctx, strip),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBadge("EQ", "eq", on, () => void ctx.store.set(`${base}.eq.on`, !on)),
    };
  },
};

/**
 * The shape box names the band's filter by its outline rather than in words. A
 * band with one shape keeps it in a dimmed box with no list to open.
 */
function shapeBox(node: HTMLElement, shape: string, open: boolean): HTMLElement {
  const box = open
    ? node
    : el("div", { class: "pulldown is-fixed", attrs: { "aria-disabled": "true" }, children: [el("span", { class: "pulldown-value" }), el("span", { class: "pulldown-mark" })] });
  const value = box.querySelector(".pulldown-value");
  if (value) {
    value.textContent = "";
    value.appendChild(Icons.eqShape(shape));
  }
  return box;
}

/** The filter shapes each EQ band can take: the outer bands a shelf and a pass filter besides the bell, the mid bands the bell alone. */
const EQ_SHAPES: Record<(typeof EQ_BANDS)[number]["key"], readonly string[]> = {
  low: ["Bell", "L.Shelf", "HPF"],
  lowMid: ["Bell"],
  highMid: ["Bell"],
  high: ["Bell", "H.Shelf", "LPF"],
};

/** A band's Q, frequency and gain, named as the readout bar names them. */
function eqBandSpecs(base: string, band: (typeof EQ_BANDS)[number]): NumericSpec[] {
  return [
    { ...intSpec(`${base}.eq.${band.key}.q`, `${band.box} Q`, 0.5, 16, 0.71), format: (v: number) => v.toFixed(2), step: 0.1 },
    logFreqSpec(`${base}.eq.${band.key}.freq`, `${band.box} Freq.`, EQ_HZ_MIN, EQ_HZ_MAX, 1000),
    { ...dbSpec(`${base}.eq.${band.key}.gain`, `${band.box} Gain`, -18, 18, 0, 0.5), format: (v: number) => v.toFixed(1) },
  ];
}

/** The kinds of curve 1-knob EQ turns. */
const EQ_ONE_KNOB_TYPES = ["Intensity", "Vocal", "Loudness"] as const;

/** Where each kind of curve leaves the level standing: its own neutral point. */
const EQ_ONE_KNOB_NEUTRAL: Record<string, number> = { Intensity: 50, Vocal: 0, Loudness: 0 };

/** Taking a kind of curve puts the level on that curve's neutral point. */
function setEqOneKnobType(ctx: AppContext, base: string, type: string): void {
  void ctx.store.set(`${base}.eq.oneKnob.type`, type);
  void ctx.store.set(`${base}.eq.oneKnob.level`, EQ_ONE_KNOB_NEUTRAL[type] ?? 0);
}

/** Switching 1-knob on takes the curve back to Intensity at its neutral point. */
function setEqOneKnob(ctx: AppContext, base: string, on: boolean): void {
  void ctx.store.set(`${base}.eq.oneKnob.on`, on);
  if (on) setEqOneKnobType(ctx, base, "Intensity");
}

/** Where a band keeps the gain the Intensity level scales. */
const eqOneKnobBase = (base: string, band: string): ParamPath => `${base}.eq.oneKnob.base.${band}`;

/** Loudness's curve: each band's switch and shape, and the hundredths of a dB each percent of the level gives it. */
const EQ_LOUDNESS: Record<(typeof EQ_BANDS)[number]["key"], { on: boolean; shape: string; q: number; freq: number; perPercent: number }> = {
  low: { on: true, shape: "Bell", q: 0.56, freq: 90, perPercent: 20 },
  lowMid: { on: true, shape: "Bell", q: 1, freq: 400, perPercent: -20 },
  highMid: { on: true, shape: "Bell", q: 1, freq: 2000, perPercent: 2 },
  high: { on: true, shape: "H.Shelf", q: 1, freq: 6000, perPercent: 10 },
};

/** Vocal's curve: each band's switch and shape. LOW is a high-pass filter, off at 0% and on above it. */
const EQ_VOCAL: Record<(typeof EQ_BANDS)[number]["key"], { on: boolean; shape: string; q: number; freq: number }> = {
  low: { on: false, shape: "HPF", q: 0.71, freq: 80 },
  lowMid: { on: true, shape: "Bell", q: 0.71, freq: 335 },
  highMid: { on: true, shape: "Bell", q: 0.71, freq: 3000 },
  high: { on: true, shape: "Bell", q: 0.71, freq: 8000 },
};

/** Where Vocal's LOW corner stands from each level on, in Hz. */
const EQ_VOCAL_LOW_FREQ: readonly (readonly [number, number])[] = [
  [0, 80], [3, 85], [6, 90], [9, 95], [12, 100], [24, 106], [36, 112], [39, 118], [42, 125], [69, 132], [96, 140],
];

/** Vocal's gains at each percent of the level, 0 to 100, in tenths of a dB. */
const EQ_VOCAL_GAIN: Record<"lowMid" | "highMid" | "high", readonly number[]> = {
  lowMid: [
    0, 0, -1, -1, -1, -1, -2, -2, -2, -3, -3, -3, -4, -4, -4, -5, -5, -7, -8, -10,
    -12, -13, -15, -17, -18, -20, -22, -23, -25, -27, -28, -30, -30, -31, -31, -31, -32, -32, -32, -33,
    -33, -33, -34, -34, -34, -35, -35, -37, -38, -40, -42, -43, -45, -47, -48, -50, -52, -53, -55, -57,
    -58, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60,
    -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60,
    -60,
  ],
  highMid: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4,
    4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 20, 20, 20, 20, 20, 20,
    20,
  ],
  high: [
    0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3,
    3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5,
    5, 5, 5, 5, 5, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 19, 18,
    16, 15, 14, 13, 11, 10, 9, 8, 6, 5, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
};

/** The ends of the range a band's gain reaches, in hundredths of a dB, where 1-knob's gains stop. */
const EQ_ONE_KNOB_GAIN_MAX = 1800;

/**
 * What 1-knob EQ does to the four bands. Switching it on, and taking Intensity
 * while it is on, keep the gains as they stand; the Intensity level then sets
 * each band to that gain times level / 50. Taking Loudness or Vocal sets that
 * curve's own switches and shapes with no gain, whatever the bands held.
 * Loudness's level sets each band's gain at the band's own rate per percent;
 * Vocal's sets the gains, and LOW's switch and corner, from its own table.
 * Every gain lands on a tenth of a dB.
 */
export function eqOneKnobWriteRule(store: DeviceStore): WriteRule {
  return (path) => {
    const [, base, what] = /^(ch\..+)\.eq\.oneKnob\.(on|type|level)$/.exec(path) ?? [];
    if (base === undefined || !store.bool(`${base}.eq.oneKnob.on`, false)) return [];
    const gainPath = (band: string): ParamPath => `${base}.eq.${band}.gain`;
    // The unit counts these gains in hundredths of a dB.
    const hundredths = (db: number): number => Math.round(db * 100);
    // A gain brought to nothing is held as 0, never as -0.
    const gain = (h: number): number => (clamp(h, -EQ_ONE_KNOB_GAIN_MAX, EQ_ONE_KNOB_GAIN_MAX) || 0) / 100;
    const type = store.str(`${base}.eq.oneKnob.type`, "Intensity");
    const keep = (): [ParamPath, ParamValue][] => EQ_BANDS.map((b) => [eqOneKnobBase(base, b.key), store.num(gainPath(b.key), 0)]);
    if (what === "on") return keep();
    if (what === "type") {
      if (type === "Intensity") return keep();
      const curve = type === "Loudness" ? EQ_LOUDNESS : type === "Vocal" ? EQ_VOCAL : null;
      if (!curve) return [];
      return EQ_BANDS.flatMap((b): [ParamPath, ParamValue][] => {
        const c = curve[b.key];
        const p = `${base}.eq.${b.key}`;
        return [[`${p}.on`, c.on], [`${p}.shape`, c.shape], [`${p}.q`, c.q], [`${p}.freq`, c.freq], [`${p}.gain`, 0]];
      });
    }
    const level = store.num(`${base}.eq.oneKnob.level`, 50);
    if (type === "Intensity") {
      // Each gain from the one kept, landing on a tenth of a dB.
      return EQ_BANDS.map((b) => {
        const kept = hundredths(store.num(eqOneKnobBase(base, b.key), store.num(gainPath(b.key), 0)));
        return [gainPath(b.key), gain(Math.round((kept * level) / 500) * 10)];
      });
    }
    if (type === "Loudness") {
      return EQ_BANDS.map((b) => [gainPath(b.key), gain(Math.round((EQ_LOUDNESS[b.key].perPercent * level) / 10) * 10)]);
    }
    if (type === "Vocal") {
      const at = clamp(Math.round(level), 0, 100);
      const corner = [...EQ_VOCAL_LOW_FREQ].reverse().find(([from]) => at >= from)?.[1] ?? EQ_VOCAL.low.freq;
      return [
        [`${base}.eq.low.on`, at > 0],
        [`${base}.eq.low.freq`, corner],
        ...(["lowMid", "highMid", "high"] as const).map((k): [ParamPath, ParamValue] => [gainPath(k), gain((EQ_VOCAL_GAIN[k][at] ?? 0) * 10)]),
      ];
    }
    return [];
  };
}

/**
 * What stands in [1-knob]'s row while it is on: the level it turns, framed, tied
 * by a short line to the lit button, on a panel of their own. EQ puts the kind of
 * curve in front of them.
 */
export function oneKnobPanel(
  ctx: AppContext,
  level: NumericSpec,
  onPath: string,
  lead?: HTMLElement,
  onTap?: (next: boolean) => void,
): HTMLElement {
  return el("div", {
    class: "oneknob-panel",
    children: [
      ...(lead ? [lead] : []),
      valueBox(ctx, level, "oneknob-level"),
      el("span", { class: "oneknob-link" }),
      oneKnobButton(ctx, onPath, onTap),
    ],
  });
}

/** A pulldown the unit keeps from opening while 1-knob is on, drawn as it always is. */
function lockedPulldown(value: string): HTMLElement {
  return el("div", {
    class: "pulldown",
    attrs: { "aria-disabled": "true" },
    children: [el("span", { class: "pulldown-value", text: value }), el("span", { class: "pulldown-mark" })],
  });
}

/** The [1 1-knob] button the COMP and EQ screens carry. */
export function oneKnobButton(ctx: AppContext, path: string, onTap?: (next: boolean) => void): HTMLElement {
  const on = ctx.store.bool(path, false);
  const node = el("button", {
    class: "oneknob",
    onTap: () => (onTap ? onTap(!on) : void ctx.store.set(path, !on)),
    children: [el("span", { class: "oneknob-mark", text: "1" }), el("span", { text: "1-knob" })],
  });
  setPressed(node, on);
  return node;
}

export const sendToScreen: ScreenDef = {
  id: "ch.sendto",
  toolbar: "sub",
  sideAtTop: true,
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    const base = `ch.${strip.id}`;
    const groups = sendGroups(ctx, strip);
    // A strip that has no send into the group last picked shows its first one,
    // and leaves the pick alone so another strip still comes up on it.
    const stored = ctx.store.str("ui.sendToGroup", "MIX");
    const group = groups.some((g) => g.key === stored) ? stored : (groups[0]?.key ?? "ST");
    const targets = sendTargets(ctx, strip, group);
    // A bus taking its sends at a fixed level gives the knob nothing to turn.
    const specs = targets.map((t) => (sendLocks(ctx, t).busFixed ? null : faderSpec(`${base}.send.${t.id}.level`, "Level")));
    ctx.setKnobs([specs[0] ?? null, specs[1] ?? null, null, null]);
    return {
      main: el("div", {
        class: "sendto-screen",
        children: targets.map((t) => {
          const onPath = `${base}.send.${t.id}.on`;
          const prePath = `${base}.send.${t.id}.pre`;
          const { busFixed, panLinked } = sendLocks(ctx, t);
          // The tap is taken against the stereo bus's own fader, so a send into
          // it is the reference and carries no tap of its own.
          const noTap = busFixed || t.kind === "stereo";
          // The send carries its own placing; the level is on the knob under it.
          // A bus on Pan Link places the send by its source channel instead, and
          // the row is named after what it is then reading.
          const placing = panLinked ? "PAN" : "Bal";
          const balSpec = panSpec(sendPanPath(ctx, strip, t), `${t.label} ${placing}`);
          const balance = ctx.store.num(balSpec.path, 0);
          // A fixed bus takes the send at one level, so the unit offers neither
          // the tap nor the placing. Both keep their place on the cell.
          const empty = (cls: string): HTMLElement => el("span", { class: `sendto-empty ${cls}` });
          return el("div", {
            class: "sendto-cell",
            children: [
              el("div", {
                class: "sendto-head",
                children: [
                  el("span", { class: "sendto-title", text: t.label }),
                  el("span", { class: "sendto-name", text: ctx.store.str(`ch.${t.id}.name`, "") }),
                ],
              }),
              el("div", {
                class: "sendto-body",
                children: [
                  toggle("ON", ctx.store.bool(onPath, false), () => void ctx.store.set(onPath, !ctx.store.bool(onPath, false)), "btn-switch btn-on"),
                  noTap
                    ? empty("sendto-empty-pre")
                    : toggle("PRE", ctx.store.bool(prePath, false), () => void ctx.store.set(prePath, !ctx.store.bool(prePath, false)), "btn-switch btn-pre"),
                  busFixed ? empty("sendto-empty-slider") : panSlider(balance),
                  busFixed
                    ? empty("sendto-empty-bal")
                    : el("div", {
                        class: "sendto-bal",
                        children: [
                          el("span", { class: "sendto-bal-caption", text: placing }),
                          valueBox(ctx, balSpec, panLinked ? "is-locked" : "", true, panLinked),
                        ],
                      }),
                ],
              }),
            ],
          });
        }),
      }),
      ...(groups.length > 1
        ? {
            side: groups.map((g) =>
              sideTab(g.label, g.key === group, () => void ctx.store.set("ui.sendToGroup", g.key), undefined, "sendto-tab"),
            ),
          }
        : {}),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: titleBox("SEND TO"),
    };
  },
};

/** The send-destination popup the HOME side menu's [Sends] button opens. */
export const sendsSelectScreen: ScreenDef = {
  id: "sends-select",
  // A sheet over HOME's main area: the toolbar it covers stays HOME's, and
  // goes dark with the rest of the screen under it.
  toolbar: "home",
  bankButton: true,
  sideAtTop: true,
  dimsBehind: true,
  build(ctx): ScreenBody {
    const current = sendsTarget(ctx);
    const pick = (v: string): void => {
      void ctx.store.set("ui.sendsTarget", v);
      ctx.nav.back();
    };
    // The destination in view carries its own colour, shared with the [Sends]
    // tab and the level knob.
    const option = (label: string, id: string, accent: string): HTMLElement =>
      toggle(label, current === id, () => pick(id), `sends-option ${accent}`);
    return {
      main: el("div", {
        class: "sends-popup",
        children: [
          option("STEREO", "ST", "sends-stereo"),
          el("div", { class: "sends-row", children: [option("MIX 1", "MIX1", "sends-mix"), option("MIX 2", "MIX2", "sends-mix")] }),
          el("div", { class: "sends-row sends-fx-row", children: [option("FX 1", "FX1", "sends-fx"), option("FX 2", "FX2", "sends-fx")] }),
        ],
      }),
      side: homeSide(ctx),
      headerLeft: sceneBox(ctx),
    };
  },
};

export const channelScreens: ScreenDef[] = [
  channelViewScreen,
  chSettingScreen,
  inputScreen,
  gateScreen,
  compScreen,
  eqScreen,
  duckerScreen,
  delayScreen,
  insFxScreen,
  effectSettingsScreen,
  sendToScreen,
  sendsSelectScreen,
];
