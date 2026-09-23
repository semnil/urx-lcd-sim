// HOME (Overview) — the screen the unit starts on in Standard Mode.
//
// The main area holds a channel bank of four strips, and the side menu carries
// [Sends], the STEREO/CUE meter and the multi-function knob toggle.

import type { AppContext } from "../app/context";
import { STRIPS_PER_BANK, allStrips, bankCount, bankStrips, type Strip } from "../model/types";
import { el, formatPan, makeTappable } from "../ui/dom";
import { Icons } from "../ui/icons";
import { faderSpec, formatValue } from "../ui/param-spec";
import { attachSpin, fractionOf, knobGraphic, meter, panSlider, toggle } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";
import { fxShutOut } from "./effect-params";
import { headAmpSwitch, micLineConnector } from "./head-amp";
import { insertBase } from "./insert-fx";
import { sendLocks } from "./mix-bus";
import { isStereoLinked, linkPartner, stripPosition } from "./stereo-link";
import {
  bankName,
  bankSide,
  currentBank,
  currentBankStrips,
  phasePath,
  selectStrip,
  selectedStripId,
  sendsDestination,
  sendsTarget,
  sendsTargetLabel,
  sendsTo,
  setBank,
  setSide,
  setStripLane,
  sideStrips,
  stripColor,
  stripLane,
  stripLanes,
} from "./strip-state";
import { CUE_METER, lampState, meterLevels, simulatedLevel } from "./meters";
import { sceneNumber, sceneTitle } from "./scene";

/**
 * The pair of lamps every indicator block opens with: the left one is green
 * while the strip is passing signal at or under 0 dBFS, the right one is the
 * strip's clip lamp. They stand at the block's top left on every kind of strip.
 */
function indicatorLamps(ctx: AppContext, strip: Strip): HTMLElement {
  const levels = simulatedLevel(ctx, strip, strip.kind !== "monoIn");
  const { signal, clip } = lampState(levels);
  return el("div", {
    class: "ind-dots",
    attrs: { "data-lamp-source": strip.id, "data-lamp-channels": String(levels.length) },
    children: [
      el("span", { class: `dot dot-signal${signal ? " is-on" : ""}` }),
      el("span", { class: `dot dot-clip${clip ? " is-on" : ""}` }),
    ],
  });
}

/**
 * The processing badges the channel indicator area lists, per strip kind.
 *
 * The block is four rows of two cells, and a strip that has no badge for a
 * cell leaves it empty rather than closing the row up: the lamps, EQ and the
 * insert are at the same height on every strip.
 */
/** The phase mark of a strip's top row, lit while the phase is inverted. */
function phaseMark(inverted: boolean): HTMLElement {
  return el("span", {
    class: `sym sym-phase${inverted ? " is-on" : ""}`,
    attrs: { role: "img", "aria-label": "Φ" },
    children: [Icons.phase()],
  });
}

function indicatorRows(ctx: AppContext, strip: Strip): HTMLElement {
  const on = (suffix: string): boolean => ctx.store.bool(`ch.${strip.id}.${suffix}`, false);
  const inverted = ctx.store.bool(phasePath(ctx, strip), false);
  const badge = (label: string, active: boolean, kind: string): HTMLElement =>
    el("span", { class: `badge badge-${kind}${active ? " is-on" : ""}`, text: label });

  const row = (left: HTMLElement[], right: HTMLElement[] = []): HTMLElement =>
    el("div", {
      class: "ind-row",
      children: [el("span", { class: "ind-cell", children: left }), el("span", { class: "ind-cell", children: right })],
    });

  const lamps = indicatorLamps(ctx, strip);
  // The +48V mark stands while the strip is on a MIC/LINE connector, lit by
  // that connector's phantom power.
  const connector = micLineConnector(ctx, strip);
  const phantom = connector
    ? [el("span", { class: `sym${ctx.store.bool(headAmpSwitch(connector, "phantom"), false) ? " is-hot" : ""}`, text: "+48V" })]
    : [];
  const eq = badge("EQ", on("eq.on"), "eq");
  const insFx = badge("INS FX", ctx.store.bool(`${insertBase(ctx, strip)}.on`, false), "insfx");

  if (strip.kind === "monoIn") {
    return el("div", {
      class: "ind-block",
      children: [
        row([lamps, phaseMark(inverted)], phantom),
        row([badge("HPF", on("hpf.on"), "neutral")], [badge("GATE", on("gate.on"), "gate")]),
        row([badge("COMP", on("comp.on"), "comp")], [eq]),
        row([insFx]),
      ],
    });
  }

  const last =
    strip.kind === "stIn"
      ? badge("DUCKER", on("ducker.on"), "ducker")
      : strip.kind === "streaming"
        ? badge("DELAY", on("delay.on"), "delay")
        : insFx;
  // A stereo input inverts its two sides separately and its strip shows one
  // side at a time; the mark is lit while that side is inverted.
  const top = strip.kind === "stIn" ? [lamps, phaseMark(inverted)] : [lamps];
  // An FX return carries no processing of its own, so only its lamps show.
  const bare = strip.kind === "fx";
  return el("div", {
    class: "ind-block",
    children: [row(top, phantom), row([]), row([], bare || strip.kind === "streaming" ? [] : [eq]), row(bare ? [] : [last])],
  });
}

/**
 * Which of the three Sends colours the destination in view carries. STEREO
 * keeps the strip's own grey knob; MIX and FX tint it.
 */
function sendsAccent(ctx: AppContext): "st" | "mix" | "fx" {
  const t = sendsTarget(ctx);
  if (t.startsWith("MIX")) return "mix";
  if (t.startsWith("FX")) return "fx";
  return "st";
}

/**
 * One HOME strip. `linkedTo` is the channel this one is stereo-linked with when
 * that channel stands immediately to its left, which puts the link mark in the
 * gap between the two.
 */
function stripView(ctx: AppContext, strip: Strip, selected: boolean, linkedTo?: Strip): HTMLElement {
  const base = `ch.${strip.id}`;
  const name = ctx.store.str(`${base}.name`, "");
  // The knob under a strip sets the send to the destination in view. The stereo
  // bus is fed by the strip's own fader, so it is the fader that stands there,
  // and its send carries the switch alone.
  const dest = sendsDestination(ctx);
  const sends = dest !== undefined && sendsTo(strip, dest);
  const levelSpec =
    sends && dest.kind !== "stereo" ? faderSpec(`${base}.send.${dest.id}.level`, "Level") : faderSpec(`${base}.level`, "LEVEL");
  const level = ctx.store.num(levelSpec.path, levelSpec.fallback);
  // A send that is switched off still turns, and says so by going dark.
  const sendOff = sends && !ctx.store.bool(`${base}.send.${dest.id}.on`, true);
  const stereo = strip.kind !== "monoIn";
  const lane = stripLane(ctx, strip);
  // A stereo input's first line names both channels; the one its screens do not
  // open on is set in the dark ink.
  const idLine =
    strip.kind === "stIn"
      ? el("span", {
          class: "strip-id",
          children: [
            document.createTextNode("CH "),
            el("span", { class: lane === 0 ? "" : "is-other", text: String(strip.channels[0] ?? "") }),
            document.createTextNode("/"),
            el("span", { class: lane === 1 ? "" : "is-other", text: String(strip.channels[1] ?? "") }),
          ],
        })
      : el("span", { class: "strip-id", text: strip.label });

  // An FX channel whose effects the sampling frequency has all put out of reach
  // keeps the first line of its name row and nothing else: no mark, no name, and
  // none of the controls under them. The rail runs dark in place of the colour.
  const shut = fxShutOut(ctx, strip);
  const nameArea = el("div", {
    class: "strip-name",
    children: shut
      ? [el("span", { class: "strip-labels", children: [idLine] })]
      : [
          el("span", { class: "strip-icon", style: { background: stripColor(ctx, strip) } }),
          el("span", {
            class: "strip-labels",
            children: [idLine, el("span", { class: "strip-title", text: name })],
          }),
        ],
  });

  const accent = sendsAccent(ctx);
  // An FX return sends to the stereo bus and to both MIX buses but not to an
  // FX bus, so the controls that would set one go away only while an FX bus is
  // the destination in view.
  const sendless = strip.kind === "fx" && accent === "fx";
  // The streaming bus is fed and heard: no on/off, no position and no level, so
  // its strip keeps [CUE] alone.
  const streaming = strip.kind === "streaming";
  const indicators = indicatorRows(ctx, strip);
  makeTappable(indicators, () => {
    selectStrip(ctx, strip.id);
    if (selected) {
      // Only a stereo input remembers which channel its screens open on; the
      // other two-channel strips open on L.
      if (stripLanes(strip) === 2 && strip.kind !== "stIn") setStripLane(ctx, strip, 0);
      ctx.nav.push({ id: "channel-view", strip: strip.id });
    } else ctx.repaint();
  });
  indicators.setAttribute("aria-label", `${strip.label} settings`);

  const onBtn = toggle("ON", ctx.store.bool(`${base}.on`, true), () => {
    void ctx.store.set(`${base}.on`, !ctx.store.bool(`${base}.on`, true));
  }, "btn-switch btn-on");
  const cueBtn = toggle("CUE", ctx.store.bool(`${base}.cue`, false), () => {
    void ctx.store.set(`${base}.cue`, !ctx.store.bool(`${base}.cue`, false));
  }, "btn-switch btn-cue");

  const panValue = ctx.store.num(stripPosition(ctx, strip).path, 0);

  // HOME suppresses the knob strip, so this readout is the only place the
  // strip's level is reachable and it carries the control.
  const strippedLevel = el("div", {
    class: "strip-level",
    attrs: {
      role: "slider",
      "aria-label": `${strip.label} ${levelSpec.label}`,
      "aria-valuenow": String(level),
      "aria-valuemin": String(levelSpec.min),
      "aria-valuemax": String(levelSpec.max),
      "aria-valuetext": formatValue(levelSpec, level),
    },
    children: [
      knobGraphic(fractionOf(levelSpec, level)),
      el("div", { class: "strip-level-value", text: levelSpec.format(level) }),
    ],
  });
  if (accent !== "st") strippedLevel.classList.add(`is-sends-${accent}`);
  if (sendOff) strippedLevel.classList.add("is-send-off");
  // A bus taking its sends at a fixed level keeps the reading and takes no turn.
  const levelLocked = sends && dest !== undefined && sendLocks(ctx, dest).busFixed;
  if (levelLocked) {
    strippedLevel.classList.add("is-locked");
    strippedLevel.setAttribute("aria-disabled", "true");
  } else {
    strippedLevel.tabIndex = 0;
    attachSpin(ctx, strippedLevel, levelSpec);
  }

  // The mark hangs out of this strip into the gap, so the strip stops clipping.
  // A selection frame reaching the mark carries on round it, on the side of the
  // strip that is selected.
  const framed = linkedTo && (selected ? "right" : selectedStripId(ctx) === linkedTo.id ? "left" : "");
  const linkMark = linkedTo
    ? el("span", {
        class: `strip-link${framed ? ` is-framed is-framed-${framed}` : ""}`,
        attrs: { role: "img", "aria-label": `${linkedTo.label} and ${strip.label} stereo link` },
        children: [Icons.link()],
      })
    : undefined;

  const node = el("div", {
    class: `strip${selected ? " is-selected" : ""}${linkMark ? " is-linked" : ""}`,
    // The rail is the strip's own colour, and a dark grey where the channel
    // cannot be used: the same bar, drawn in another colour.
    style: { "--rail": shut ? "var(--strip-rail-shut)" : stripColor(ctx, strip) },
    attrs: { "aria-label": `${strip.label} ${shut ? "" : name}`.trim() },
    children: shut
      ? [nameArea]
      : [
      nameArea,
      el("div", {
        class: "strip-mid",
        children: sendless
          ? // The meter's column is held so the block keeps the width it has on
            // every other strip.
            [indicators, el("div", { class: "strip-meter-gap" })]
          : [indicators, meter({ levels: simulatedLevel(ctx, strip, stereo), source: strip.id })],
      }),
      el("div", { class: "strip-buttons", children: streaming ? [cueBtn] : [onBtn, cueBtn] }),
      ...(streaming
        ? []
        : [
            el("div", {
              class: "strip-pan",
              title: formatPan(panValue),
              children: [...(linkMark ? [linkMark] : []), panSlider(panValue)],
            }),
          ]),
      ...(sendless || streaming ? [] : [strippedLevel]),
        ],
  });
  // On a stereo input the name area picks which of its channels the screens
  // open on and which side its Φ mark shows, and leaves the selection alone.
  makeTappable(nameArea, () => {
    if (strip.kind === "stIn") setStripLane(ctx, strip, lane === 0 ? 1 : 0);
    else selectStrip(ctx, strip.id);
    ctx.repaint();
  });
  return node;
}

export const homeScreen: ScreenDef = {
  id: "home",
  toolbar: "home",
  bankButton: true,
  sideAtTop: true,
  knobStrip: false,
  build(ctx): ScreenBody {
    const strips = currentBankStrips(ctx);
    const selected = selectedStripId(ctx);

    const main = el("div", {
      class: "home-main",
      children: strips.map((s, i) => {
        // The mark belongs to the gap, so the right-hand channel of the pair
        // draws it and only when its partner is the strip beside it.
        const partner = isStereoLinked(ctx, s) ? linkPartner(ctx, s) : undefined;
        const linkedTo = partner && strips[i - 1]?.id === partner.id ? partner : undefined;
        return stripView(ctx, s, s.id === selected, linkedTo);
      }),
    });
    // A bank shorter than four leaves the remaining slots empty, as the unit does.
    for (let i = strips.length; i < STRIPS_PER_BANK; i++) main.appendChild(el("div", { class: "strip strip-empty" }));

    // The four multi-function knobs carry the send level of the four strips
    // shown (user guide, "Send level knob"). The streaming bus has no level.
    ctx.setKnobs(
      Array.from({ length: STRIPS_PER_BANK }, (_, i) => {
        const s = strips[i];
        return s && s.kind !== "streaming" ? faderSpec(`ch.${s.id}.level`, "LEVEL") : null;
      }),
    );

    return { main, side: homeSide(ctx), headerLeft: sceneBox(ctx) };
  },
};

/**
 * The side rail HOME carries: the [Sends] tab and the STEREO/CUE meter. The
 * send-destination sheet drops over the main area only, so it keeps the rail
 * the button that opened it stands in.
 */
export function homeSide(ctx: AppContext): HTMLElement[] {
  // The sheet darkens the screen behind it and leaves this button lit, so the
  // one control that is still live reads as live.
  const open = ctx.nav.current.id === "sends-select";
  const sends = el("button", {
    class: `sends-btn sends-${sendsAccent(ctx)}${open ? " is-lit" : ""}`,
    onTap: () => {
      if (open) ctx.nav.back();
      else ctx.nav.push({ id: "sends-select" });
    },
    children: [
      el("span", {
        class: "sends-line",
        children: [
          el("span", { class: "sends-label", text: "Sends" }),
          el("span", { class: "sends-mark", attrs: { "aria-hidden": "true" } }),
        ],
      }),
      el("span", { class: "sends-target", text: sendsTargetLabel(ctx) }),
    ],
  });

  const cueActive = allStrips(ctx.model).some((s) => ctx.store.bool(`ch.${s.id}.cue`, false));
  const masterStrip = ctx.model.outputs.find((s) => s.kind === "stereo") ?? ctx.model.outputs[0];
  const clearCue = (): void => {
    for (const s of allStrips(ctx.model)) void ctx.store.set(`ch.${s.id}.cue`, false);
  };
  // While anything is cued the meter reads the cue bus rather than the stereo
  // bus: a frame around it, its name over it, and the bin in the corner that
  // empties the cue.
  const masterMeterId = cueActive ? CUE_METER : (masterStrip?.id ?? CUE_METER);
  const masterMeter = el("div", {
    class: `master-meter${cueActive ? " is-cue" : ""}`,
    children: [
      ...(cueActive ? [el("div", { class: "cue-label", text: "CUE" })] : []),
      meter({ levels: meterLevels(ctx.store, masterMeterId, 2), source: masterMeterId }),
      ...(cueActive
        ? [
            el("button", {
              class: "cue-clear",
              attrs: { "aria-label": "Clear cue" },
              onTap: clearCue,
              children: [Icons.trashSmall()],
            }),
          ]
        : []),
    ],
  });
  // Touching the meter is CLEAR CUE (user guide, "STEREO/CUE meter").
  makeTappable(masterMeter, clearCue);
  masterMeter.setAttribute("aria-label", cueActive ? "CUE meter" : "STEREO meter");

  return [sends, masterMeter];
}

/**
 * The bank list the toolbar's channel-bank button opens: a sheet over HOME's
 * main area, with HOME's toolbar and side rail dark around it. It draws no ways
 * out of its own, so a touch on what shows through closes it.
 */
export const bankSelectScreen: ScreenDef = {
  id: "bank-select",
  toolbar: "home",
  bankButton: true,
  sideAtTop: true,
  dimsBehind: true,
  shellExits: false,
  build(ctx): ScreenBody {
    const side = bankSide(ctx);
    const bank = currentBank(ctx);
    const sections: HTMLElement[] = [];
    for (const listed of ["input", "output"] as const) {
      const strips = sideStrips(ctx, listed);
      const row = el("div", { class: "bank-row" });
      for (let i = 0; i < bankCount(strips); i++) {
        const pick = (): void => {
          setSide(ctx, listed);
          setBank(ctx, i);
          ctx.nav.back();
        };
        row.appendChild(
          toggle(bankName(bankStrips(strips, i)), listed === side && i === bank, pick, `bank-option bank-option-${listed}`),
        );
      }
      sections.push(el("div", { class: "bank-band", text: listed === "input" ? "INPUT" : "OUTPUT" }), row);
    }
    return {
      main: el("div", { class: "bank-popup", children: sections }),
      side: homeSide(ctx),
      headerLeft: sceneBox(ctx),
    };
  },
};

/** The scene name box at the top-left of the HOME toolbar; opens the SCENE screen. */
export function sceneBox(ctx: AppContext): HTMLElement {
  const no = ctx.store.num("scene.current", 0);
  return el("button", {
    class: "scene-box",
    onTap: () => ctx.nav.openTop({ id: "scene" }),
    children: [
      el("span", { class: "scene-no", text: sceneNumber(no) }),
      el("span", { class: "scene-title", text: sceneTitle(ctx, no) }),
    ],
  });
}
