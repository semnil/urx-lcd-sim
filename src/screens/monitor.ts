// MONITOR screen: the Monitor, Phones and Oscillator menus (user guide,
// "MONITOR screen").

import type { AppContext } from "../app/context";
import { el, formatLevel } from "../ui/dom";
import type { NumericSpec } from "../ui/param-spec";
import { OSC_LEVEL_MARKS, dbSpec, faderSpec, intSpec, logFreqSpec, markedDial, scaleSpec } from "../ui/param-spec";
import { Icons } from "../ui/icons";
import { knobControl, knobGraphic, menuButton, menuGrid, meter, paramCell, pickerGrid, pickerSheet, sideTab, toggle, valueBox } from "../ui/widgets";
import { OSC_TARGETS } from "../model/oscillator";
import { findStrip } from "../model/types";
import { fxShutOut } from "./effect-params";
import { meterLevels, oscillatorLevel } from "./meters";
import type { ScreenBody, ScreenDef } from "./types";

const OSC_MODES = ["Sine Wave", "Pink Noise", "Burst Noise"] as const;

/**
 * What a monitor bus can listen to, as the sheet lays them out: None alone at
 * the start of the first row and STEREO at its end, the two mix buses under them.
 */
const BUS_SOURCE_ROWS: (string | null)[][] = [
  ["None", null, null, "STEREO"],
  ["MIX 1", "MIX 2", null, null],
];

/** The sheet the Source button drops: the guide's "The screen closes
 * automatically after selection." */
function monitorSourceSheet(ctx: AppContext, bus: number): HTMLElement {
  const path = `monitor.${bus}.source`;
  const current = ctx.store.str(path, "STEREO");
  return pickerSheet(ctx, {
    title: `MONITOR ${bus}`,
    label: `Monitor ${bus} source`,
    build: (close) =>
      pickerGrid(
        BUS_SOURCE_ROWS.map((row) =>
          row.map((label) =>
            label === null
              ? null
              : toggle(label, label === current, () => {
                  void ctx.store.set(path, label);
                  close();
                  ctx.repaint();
                }, "source-btn"),
          ),
        ),
      ),
  });
}

/** The monitor / phones buses the model carries, numbered as the unit names them. */
function busNumbers(ctx: AppContext): number[] {
  return Array.from({ length: ctx.model.monitorBuses }, (_, i) => i + 1);
}

export const monitorScreen: ScreenDef = {
  id: "monitor",
  toolbar: "sub",
  title: () => "MONITOR",
  knobToggle: false,
  build(ctx): ScreenBody {
    return {
      main: menuGrid(
        [
          menuButton("Monitor", () => ctx.nav.push({ id: "monitor.level" })),
          menuButton("Phones", () => ctx.nav.push({ id: "monitor.phones" })),
          menuButton("Oscillator", () => ctx.nav.push({ id: "monitor.osc" })),
        ],
        "menu-grid-wide",
      ),
    };
  },
};

export const monitorLevelScreen: ScreenDef = {
  id: "monitor.level",
  toolbar: "sub",
  sideAtTop: true,
  // Each bus prints its own level beside its rotary, as the unit does.
  knobStrip: false,
  title: () => "MONITOR",
  build(ctx): ScreenBody {
    const tab = ctx.store.str("ui.monitorTab", "Level");
    const buses = busNumbers(ctx);
    const specs = buses.map((n) => faderSpec(`monitor.${n}.level`, `Monitor ${n}`));
    // The Setting tab carries no level control, so it hands the knobs nothing.
    if (tab !== "Setting") ctx.setKnobs([specs[0] ?? null, specs[1] ?? null, null, null]);

    const strips = buses.map((n) => {
      if (tab === "Setting") {
        const src = ctx.store.str(`monitor.${n}.source`, "STEREO");
        const interrupt = ctx.store.bool(`monitor.${n}.cueInterrupt`, true);
        const mono = ctx.store.bool(`monitor.${n}.mono`, false);
        return el("div", {
          class: "mon-strip",
          children: [
            el("div", { class: "mon-head", text: String(n) }),
            el("span", { class: "mon-caption", text: "Source" }),
            el("button", {
              class: "btn mon-source",
              onTap: () => void monitorSourceSheet(ctx, n),
              attrs: { "aria-label": `Monitor ${n} source` },
              children: [
                el("span", { text: src }),
                el("span", { class: "mon-source-copy", children: [Icons.copy()] }),
              ],
            }),
            toggle("CUE\nInterrupt", interrupt, () => void ctx.store.set(`monitor.${n}.cueInterrupt`, !interrupt), "mon-btn mon-cue"),
            toggle("MONO", mono, () => void ctx.store.set(`monitor.${n}.mono`, !mono), "mon-btn mon-mono"),
          ],
        });
      }
      const spec = specs[n - 1];
      const on = ctx.store.bool(`monitor.${n}.on`, true);
      // The meter carries the bus as its source, so the ticker keeps it moving
      // without the screen being rebuilt.
      const source = `monitor.${n}`;
      return el("div", {
        class: "mon-strip",
        children: [
          el("div", { class: "mon-head", text: String(n) }),
          el("div", { class: "mon-meter", children: [meter({ levels: meterLevels(ctx.store, source, 2), source })] }),
          toggle("ON", on, () => void ctx.store.set(`monitor.${n}.on`, !on), "btn-switch btn-on"),
          el("div", { class: "mon-level", children: spec ? [knobControl(ctx, spec), valueBox(ctx, spec)] : [] }),
        ],
      });
    });

    return {
      main: el("div", { class: "mon-main", children: strips }),
      side: (["Level", "Setting"] as const).map((t) =>
        sideTab(t, t === tab, () => void ctx.store.set("ui.monitorTab", t), t === "Level" ? Icons.fader() : Icons.gearSolid(), "is-name-lifted"),
      ),
    };
  },
};

export const phonesScreen: ScreenDef = {
  id: "monitor.phones",
  toolbar: "sub",
  // Each bus prints its own level beside its rotary, as the unit does.
  knobStrip: false,
  title: () => "PHONES",
  build(ctx): ScreenBody {
    const buses = busNumbers(ctx);
    const specs = buses.map((n) => scaleSpec(`phones.${n}.level`, `Phones ${n}`, 2));
    ctx.setKnobs([specs[0] ?? null, specs[1] ?? null, null, null]);
    return {
      main: el("div", {
        class: "mon-main",
        children: buses.map((n) => {
          const spec = specs[n - 1];
          const level = ctx.store.num(`phones.${n}.level`, 2);
          return el("div", {
            class: "mon-strip mon-strip-tall",
            children: [
              el("div", { class: "mon-head", text: String(n) }),
              el("div", {
                class: "mon-level",
                children: [
                  spec ? knobControl(ctx, spec) : knobGraphic(0),
                  spec ? valueBox(ctx, spec) : el("span", { text: level.toFixed(1) }),
                ],
              }),
            ],
          });
        }),
      }),
    };
  },
};

export const oscillatorScreen: ScreenDef = {
  id: "monitor.osc",
  toolbar: "sub",
  title: () => "OSCILLATOR",
  build(ctx): ScreenBody {
    const tab = ctx.store.str("ui.oscTab", "OSC");
    const mode = ctx.store.str("osc.mode", "Sine Wave");
    const on = ctx.store.bool("osc.on", false);
    // The oscillator's own level reads the way a fader's does.
    const levelSpec = { ...dbSpec("osc.level", "Level", -96, 0, -14), format: formatLevel, markAt: markedDial(OSC_LEVEL_MARKS) };

    // The two tabs the screen carries, whichever of them is up.
    const oscTabs = (): HTMLElement[] =>
      (["OSC", "Assign"] as const).map((t) =>
        sideTab(t, t === tab, () => void ctx.store.set("ui.oscTab", t), t === "OSC" ? Icons.sine() : Icons.clipboard(), "osc-tab"),
      );

    if (tab === "Assign") {
      return {
        main: el("div", {
          class: "osc-assign",
          children: [
            ...OSC_TARGETS.map((t) => {
              // An FX bus the sampling frequency has shut out leaves its place in the
              // grid empty; the assignment it holds comes back with the button.
              const bus = findStrip(ctx.model, t.meter);
              if (bus && fxShutOut(ctx, bus)) return el("span", { class: "osc-target-gap", attrs: { "aria-hidden": "true" } });
              const active = ctx.store.bool(`osc.assign.${t.id}`, t.shipped);
              return toggle(t.label, active, () => void ctx.store.set(`osc.assign.${t.id}`, !active), `osc-target osc-${t.bus}`);
            }),
            el("button", {
              class: "btn osc-clear",
              text: "Clear All",
              onTap: () => {
                for (const t of OSC_TARGETS) void ctx.store.set(`osc.assign.${t.id}`, false);
              },
            }),
          ],
        }),
        side: oscTabs(),
      };
    }

    // What the mode adds ahead of Level, which the fourth knob always carries.
    const modeSpecs =
      mode === "Sine Wave"
        ? [logFreqSpec("osc.frequency", "Frequency", 20, 20000, 1000)]
        : mode === "Burst Noise"
          ? [
              { ...intSpec("osc.width", "Width", 0.1, 10, 0.1), format: (v: number) => v.toFixed(1), step: 0.1, unit: "s" },
              intSpec("osc.interval", "Interval", 1, 30, 1, "s"),
            ]
          : [];
    // The mode's parameters end on the second knob, however many it brings, and
    // Level is on the fourth.
    const knobs: (NumericSpec | null)[] = [null, null, null, levelSpec];
    for (const [i, spec] of modeSpecs.entries()) {
      const slot = i + 2 - modeSpecs.length;
      if (slot >= 0) knobs[slot] = spec;
    }
    ctx.setKnobs(knobs);

    return {
      // The modes and what they bring take the left three columns; the output —
      // its switch over its level — stands in the column that leaves free.
      main: el("div", {
        class: "osc-screen",
        children: [
          el("p", { class: "osc-caption", text: "Oscillator Mode" }),
          el("div", {
            class: "osc-mode-row",
            children: OSC_MODES.map((m) => toggle(m, m === mode, () => void ctx.store.set("osc.mode", m), "osc-mode")),
          }),
          el("div", {
            class: "osc-params",
            // Each box stands under the knob that turns it, so they end on the
            // second column as the knobs end on the second.
            children: [
              ...Array.from({ length: Math.max(0, 2 - modeSpecs.length) }, () => el("div")),
              ...modeSpecs.map((spec) => paramCell(ctx, spec)),
            ],
          }),
          el("div", {
            class: "osc-output",
            children: [
              toggle("ON", on, () => void ctx.store.set("osc.on", !on), "btn-switch btn-on osc-on"),
              paramCell(ctx, levelSpec),
              // What the oscillator is putting out, beside the level that sets it.
              el("div", {
                class: "osc-meter",
                children: [meter({ levels: [oscillatorLevel(ctx.store)], source: "osc" })],
              }),
            ],
          }),
        ],
      }),
      side: oscTabs(),
    };
  },
};

export const monitorScreens: ScreenDef[] = [monitorScreen, monitorLevelScreen, phonesScreen, oscillatorScreen];
