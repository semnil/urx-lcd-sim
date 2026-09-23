// SETUP screen and its menus (user guide, "SETUP screen > Top menu").
//
// The menu names, button captions and option lists are the unit's own wording,
// not paraphrased.

import licenseText from "../../LICENSE?raw";
import type { AppContext } from "../app/context";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkColumn, udkFromColumns, udkLines, udkPath } from "../model/udk";
import { el, makeTappable, setPressed } from "../ui/dom";
import { brightnessSpec, intSpec } from "../ui/param-spec";
import { Icons } from "../ui/icons";
import { dateTimeSetScreen, dateTimeSpans, openDateTimeSet, openTimeZone, timeZoneScreen } from "./date-time";
import { patchSourceSheet } from "./output-patch";
import { button, dialog, menuButton, menuGrid, paramCell, pickColumn, pickDialog, pulldown, scrollbar, sideTab, toggle } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";
import { Shell } from "../app/shell";
import { buildRegistry } from "./index";
import { version as APP_VERSION } from "../../package.json";
import { factoryState } from "../model/defaults";
import { TIME_ZONE_SHIPPED } from "../model/time-zone";
import { dropTracksOverRate } from "../model/track-count";
import { dropInsertsOverRate } from "./insert-fx";
import { releaseOnRateChange } from "./recording";

/** The languages the unit offers. The simulator's messages are in English only, so the other two cannot be chosen. */
const LANGUAGES = [
  { value: "Japanese", top: "日本語", bottom: "Japanese", usable: false },
  { value: "English", top: "English", bottom: "English", usable: true },
  { value: "Chinese", top: "簡体中文", bottom: "Chinese, Simplified", usable: false },
];

const SAMPLING_RATES = [44100, 48000, 88200, 96000, 176400, 192000];

/** What a User Defined Knob can be put on, in the order the pulldown lists them. */
export const setupScreen: ScreenDef = {
  id: "setup",
  toolbar: "sub",
  knobToggle: false,
  build(ctx): ScreenBody {
    const open = (id: string) => () => ctx.nav.push({ id });
    // The four information / display menus stand together on a tray of their own,
    // User Defined Knobs stands alone, and the rest run three to a row.
    const tray = menuGrid(
      [
        menuButton("Version", open("setup.version")),
        menuButton("License", open("setup.license")),
        menuButton("Language", open("setup.language")),
        menuButton("Brightness", open("setup.brightness")),
      ],
      "setup-general",
    );

    const rest: HTMLElement[] = [
      menuButton("User Defined\nKnobs", open("setup.udk")),
      el("div"),
      el("div"),
      menuButton("Sampling\nFrequency", open("setup.rate")),
      menuButton("Output Patch", open("setup.patch")),
      menuButton("Peripheral", open("setup.peripheral")),
      menuButton("Power\nManagement", open("setup.power")),
    ];
    // The URX22 has no Date/Time menu (user guide note under GENERAL menu).
    if (ctx.model.hasDateTime) rest.push(menuButton("Date/Time", open("setup.datetime")));
    rest.push(menuButton("Software\nIntegration", open("setup.integration")));

    const mode = ctx.store.str("setup.operationMode", "Standard");
    const modeBox = el("button", {
      class: "mode-box",
      onTap: () => ctx.nav.push({ id: "setup.mode" }),
      children: [
        el("span", { class: "mode-caption", text: "Operation Mode" }),
        el("span", { class: "mode-value", text: mode }),
      ],
    });

    return {
      main: el("div", { class: "setup-main", children: [tray, menuGrid(rest, "setup-menu")] }),
      headerLeft: modeBox,
      // The screen names itself over the section the menus below belong to.
      headerCenter: el("div", {
        class: "setup-title",
        children: [
          el("h1", { class: "setup-title-main", text: "SETUP" }),
          el("p", { class: "setup-title-sub", text: "GENERAL" }),
        ],
      }),
    };
  },
};

export const versionScreen: ScreenDef = {
  id: "setup.version",
  toolbar: "sub",
  title: () => "VERSION",
  build(ctx): ScreenBody {
    // The firmware version of the unit the simulator stands for, and the
    // simulator's own version behind a lower-case v that sets it apart.
    const cells: [string, string][] = [
      ["Total Version", ctx.store.str("device.version.total", "V1.3.1.0")],
      ["APP Version", `v${APP_VERSION}`],
    ];
    return {
      main: el("div", {
        class: "version-grid",
        children: cells.map(([k, v], row) =>
          el("div", {
            class: `version-entry version-row-${row}`,
            children: [
              el("span", { class: "version-key", text: k }),
              el("span", { class: "version-colon", text: ":" }),
              el("span", { class: "version-value", text: v }),
            ],
          }),
        ),
      }),
    };
  },
};

/** The height of the bar beside the licence text. */
const LICENSE_BAR_H = 187;

export const licenseScreen: ScreenDef = {
  id: "setup.license",
  toolbar: "sub",
  title: () => "LICENSE",
  build(ctx): ScreenBody {
    // The unit lists the licences its own software is under. This is the
    // simulator, so what it lists is the simulator's own terms.
    // The first line is the heading over a rule; the rest are paragraphs set to the
    // width of the text, each a blank line apart.
    const [heading = "", ...blocks] = licenseText.trim().split(/\n\s*\n/);
    const text = el("div", {
      class: "license-text",
      children: [
        el("h2", { class: "license-heading", text: heading.replace(/\s*\n\s*/g, " ") }),
        ...blocks.map((block) => el("p", { class: "license-para", text: block.replace(/\s*\n\s*/g, " ") })),
      ],
    });
    const bar = scrollbar(text, LICENSE_BAR_H, undefined, false, undefined, 0, { ctx, key: "license" });
    // The text holds nothing the keys can stop on, so the text itself is a stop, and the arrow keys scroll it.
    text.tabIndex = 0;
    return {
      main: el("div", { class: "license-body", children: [text, bar] }),
    };
  },
};

export const languageScreen: ScreenDef = {
  id: "setup.language",
  toolbar: "sub",
  title: () => "LANGUAGE",
  build(ctx): ScreenBody {
    const current = ctx.store.str("setup.language", "English");
    return {
      main: el("div", {
        class: "language-row",
        children: LANGUAGES.map((l) => {
          const node = el("button", {
            class: `lang-btn${l.usable ? "" : " is-disabled"}`,
            onTap: () => void ctx.store.set("setup.language", l.value),
            children: [el("span", { class: "lang-top", text: l.top }), el("span", { class: "lang-bottom", text: l.bottom })],
          });
          if (!l.usable) node.disabled = true;
          setPressed(node, l.value === current);
          return node;
        }),
      }),
    };
  },
};

export const brightnessScreen: ScreenDef = {
  id: "setup.brightness",
  toolbar: "sub",
  title: () => "BRIGHTNESS",
  build(ctx): ScreenBody {
    const spec = brightnessSpec();
    ctx.setKnobs([null, spec, null, null]);
    // The screen holds one value, so it wears the knob's focus from the moment it opens.
    ctx.focus.take(spec);
    return {
      main: el("div", { class: "single-param", children: [paramCell(ctx, spec)] }),
    };
  },
};

export const samplingRateScreen: ScreenDef = {
  id: "setup.rate",
  toolbar: "sub",
  title: () => "SAMPLING FREQUENCY",
  build(ctx): ScreenBody {
    const current = ctx.store.num("setup.samplingFrequency", 48000);
    const followUsb = ctx.store.bool("setup.followUsb", false);
    const label = (hz: number): string => `${(hz / 1000).toFixed(1).replace(/\.0$/, "")}kHz`;
    // Following the USB clock leaves the frequency the unit holds where it is
    // and keeps showing it lit; the row simply cannot be used until the switch
    // is turned off again.
    const rates = SAMPLING_RATES.map((hz) => {
      const cell = toggle(label(hz), hz === current, () => {
        if (followUsb) return;
        void ctx.store.set("setup.samplingFrequency", hz);
        dropInsertsOverRate(ctx, hz);
        dropTracksOverRate(ctx.store, hz);
        releaseOnRateChange(ctx.store, current, hz);
      }, "rate-btn");
      if (followUsb) cell.setAttribute("aria-disabled", "true");
      return cell;
    });
    return {
      main: el("div", {
        class: "rate-screen",
        children: [
          el("div", { class: `rate-row${followUsb ? " is-locked" : ""}`, children: rates }),
          toggle("Follow USB", followUsb, () => void ctx.store.set("setup.followUsb", !followUsb), "follow-usb"),
        ],
      }),
    };
  },
};

export const udkScreen: ScreenDef = {
  id: "setup.udk",
  toolbar: "sub",
  title: () => "USER DEFINED KNOBS",
  build(ctx): ScreenBody {
    const bank = ctx.store.num("setup.udk.bank", 1);
    const banks = el("div", {
      class: "udk-banks",
      children: [
        el("span", { class: "udk-caption", text: "Bank" }),
        ...UDK_BANKS.map((b) => toggle(String(b), b === bank, () => void ctx.store.set("setup.udk.bank", b), "udk-bank")),
      ],
    });
    // Each knob has a column: the card naming what it is on, the shorter name
    // the readout bar carries, and a picture of the knob itself.
    const knobs = UDK_KNOBS.map((k) => {
      const slot = udkPath(bank, k);
      const assign = udkAssignment(ctx.store.str(slot, UDK_UNASSIGNED));
      const card = el("div", {
        class: "udk-knob",
        attrs: { "aria-label": `Knob ${k}: ${assign.value}` },
        children: [
          el("span", { class: "udk-knob-id", text: k }),
          el("span", { class: "udk-knob-copy", children: [Icons.copy()] }),
          el("span", {
            class: "udk-knob-name",
            children: udkLines(assign).map((line) => el("span", { text: line })),
          }),
        ],
      });
      makeTappable(card, () => {
        // The unit opens a dialog of its own to pick from, rather than dropping
        // a list over the card.
        void ctx.store.set("ui.udkKnob", k);
        void ctx.store.set("ui.udkPick", assign.value);
        ctx.nav.push({ id: "setup.udk.assign" });
      });
      return el("div", {
        class: "udk-slot",
        children: [
          card,
          el("span", { class: "udk-knob-short", text: assign.short }),
          el("span", { class: "udk-dial", attrs: { "aria-hidden": "true" } }),
        ],
      });
    });
    return {
      main: el("div", {
        class: "udk-screen",
        children: [banks, el("div", { class: "udk-rule" }), el("div", { class: "udk-knobs", children: knobs })],
      }),
    };
  },
};

/**
 * Picking what a knob is on (user guide, "Assigning functions to the user
 * defined knobs"). Three columns narrow from left to right — the Function, then
 * its Parameter 1, then its Parameter 2 — and the dialog keeps the pick to
 * itself until [OK] is touched.
 */
export const udkAssignScreen: ScreenDef = {
  id: "setup.udk.assign",
  toolbar: "sub",
  shellExits: false,
  knobToggle: false,
  build(ctx): ScreenBody {
    const bank = ctx.store.num("setup.udk.bank", 1);
    const knob = ctx.store.str("ui.udkKnob", UDK_KNOBS[0]);
    const picked = udkAssignment(ctx.store.str("ui.udkPick", UDK_UNASSIGNED));

    // Narrowing a column clears what stood to the right of it, then settles on
    // the first entry each remaining column offers.
    const settle = (fn: string, p1: string, p2: string): void => {
      const firstP1 = p1 || (udkColumn("p1", fn)[0] ?? "");
      const firstP2 = p2 || (udkColumn("p2", fn, firstP1)[0] ?? "");
      const next = udkFromColumns(fn, firstP1, firstP2);
      if (next) void ctx.store.set("ui.udkPick", next.value);
      ctx.repaint();
    };

    return {
      main: pickDialog({
        title: "USER DEFINED KNOBS",
        sub: `Bank ${bank}, Knob ${knob}`,
        onCancel: () => ctx.nav.back(),
        onOk: () => {
          void ctx.store.set(udkPath(bank, knob), picked.value);
          ctx.nav.back();
        },
        body: [
          el("div", {
            class: "pick-dialog-cols",
            children: [
              pickColumn("Function", udkColumn("fn"), picked.fn, (v) => settle(v, "", ""), "", { ctx, key: "pick.udk.fn" }),
              pickColumn("Parameter 1", udkColumn("p1", picked.fn), picked.p1, (v) => settle(picked.fn, v, ""), "", { ctx, key: "pick.udk.p1" }),
              pickColumn("Parameter 2", udkColumn("p2", picked.fn, picked.p1), picked.p2, (v) => settle(picked.fn, picked.p1, v), "", { ctx, key: "pick.udk.p2" }),
            ],
          }),
        ],
      }),
    };
  },
};

export const outputPatchScreen: ScreenDef = {
  id: "setup.patch",
  toolbar: "sub",
  title: () => "OUTPUT PATCH",
  build(ctx): ScreenBody {
    const tab = ctx.store.str("setup.outputPatch.tab", "Analog");
    const rows: { caption: string; path: string }[] =
      tab === "Analog"
        ? [
            { caption: "MAIN OUT", path: "setup.outputPatch.mainOut" },
            ...(ctx.model.hasLineOut ? [{ caption: "LINE OUT", path: "setup.outputPatch.lineOut" }] : []),
          ]
        : [
            { caption: "USB MAIN A", path: "setup.outputPatch.usbMainA" },
            { caption: "USB MAIN B", path: "setup.outputPatch.usbMainB" },
            { caption: "USB MAIN C", path: "setup.outputPatch.usbMainC" },
            { caption: "USB SUB", path: "setup.outputPatch.usbSub" },
          ];

    const grid = el("div", {
      class: "patch-grid",
      children: rows.map((r) =>
        el("div", {
          class: "patch-cell",
          children: [
            el("span", { class: "patch-caption", text: r.caption }),
            el("button", {
              class: "btn patch-btn",
              onTap: () => void patchSourceSheet(ctx, r.caption, r.path, tab),
              attrs: { "aria-label": `${r.caption} output source` },
              children: [
                el("span", { text: ctx.store.str(r.path, "STEREO") }),
                el("span", { class: "patch-copy", children: [Icons.copy()] }),
              ],
            }),
          ],
        }),
      ),
    });

    const side = (["Analog", "USB"] as const).map((t) =>
      sideTab(t, t === tab, () => void ctx.store.set("setup.outputPatch.tab", t), t === "Analog" ? Icons.plug() : Icons.usb(), "patch-tab"),
    );

    return {
      main: el("div", {
        class: "patch-screen",
        children: [
          el("div", { class: "section-band", text: tab.toUpperCase() }),
          grid,
          // [Default] asks first, and [OK] puts back the outputs on this tab alone.
          button("Default", () => ctx.overlay(dialog({ message: PATCH_DEFAULT_ASK, onOk: () => resetPatch(ctx, rows.map((r) => r.path)) })), "patch-default"),
        ],
      }),
      side,
    };
  },
};

/** What the unit asks before [Default] puts the patch back. */
const PATCH_DEFAULT_ASK = "Reset to Default?";

/** Put the outputs at `paths` back on the sources the unit ships them on. */
function resetPatch(ctx: AppContext, paths: readonly string[]): void {
  const shipped = factoryState(ctx.model);
  for (const p of paths) {
    const value = shipped.get(p);
    if (value !== undefined) void ctx.store.set(p, value);
  }
}

export const peripheralScreen: ScreenDef = {
  id: "setup.peripheral",
  toolbar: "sub",
  title: () => "PERIPHERAL",
  build(ctx): ScreenBody {
    const tab = ctx.store.str("setup.peripheral.tab", "Main");
    const tabs: string[] = ["Main", ...(ctx.model.hasHDMI ? ["HDMI"] : [])];
    let main: HTMLElement;
    if (tab === "HDMI") {
      const enabled = ctx.store.bool("setup.peripheral.hdmiEnable", true);
      const channels = ctx.store.str("setup.peripheral.hdmiChannels", "2 Channels");
      main = el("div", {
        class: "peripheral-screen",
        children: [
          el("div", { class: "section-band", text: "HDMI" }),
          el("div", { class: "peripheral-group peripheral-hdcp", children: [el("span", { class: "peripheral-caption", text: "HDCP" }), toggle("Enable", enabled, () => void ctx.store.set("setup.peripheral.hdmiEnable", !enabled))] }),
          el("div", {
            class: "peripheral-group peripheral-channels",
            children: [
              el("span", { class: "peripheral-caption", text: "Input Audio Channels" }),
              el("div", {
                class: "btn-row",
                children: (["2 Channels", "Multi Channels"] as const).map((c) =>
                  toggle(c, c === channels, () => void ctx.store.set("setup.peripheral.hdmiChannels", c)),
                ),
              }),
            ],
          }),
        ],
      });
    } else {
      const suppression = ctx.store.str("setup.peripheral.usbSuppression", "None");
      main = el("div", {
        class: "peripheral-screen",
        children: [
          el("div", { class: "section-band", text: "USB Main" }),
          el("div", {
            class: "peripheral-group",
            children: [
              el("span", { class: "peripheral-caption", text: "Generic Driver Audio Channel Suppression" }),
              el("div", {
                class: "btn-row",
                children: (["None", "2 Channels"] as const).map((c) =>
                  toggle(c, c === suppression, () => void ctx.store.set("setup.peripheral.usbSuppression", c)),
                ),
              }),
              el("p", { class: "peripheral-note", text: "(Changes will be applied at the next power cycle)" }),
            ],
          }),
        ],
      });
    }
    return {
      main,
      side: tabs.map((t) => sideTab(t, t === tab, () => void ctx.store.set("setup.peripheral.tab", t), t === "Main" ? Icons.usb() : Icons.hdmi())),
    };
  },
};

/** What the unit asks before the auto power off function is turned off. */
const AUTO_POWER_OFF_WARNING = "Disabling this function will increase power\ncunsumption.";

export const powerScreen: ScreenDef = {
  id: "setup.power",
  toolbar: "sub",
  title: () => "POWER MANAGEMENT",
  build(ctx): ScreenBody {
    const enabled = ctx.store.bool("setup.power.autoPowerOff", true);
    // The unit offers 2 to 20 minutes in one-minute steps (Specifications).
    const spec = intSpec("setup.power.autoPowerOffMinutes", "Time", 2, 20, 20, " min");
    ctx.setKnobs([null, null, null, spec]);
    return {
      main: el("div", {
        class: "power-screen",
        children: [
          el("div", { class: "section-band", text: "Auto Power Off" }),
          // Leaving it off keeps the unit powered up, so it asks before it goes
          // that way; switching it back on does not ask.
          toggle("Enable", enabled, () => {
            if (!enabled) {
              void ctx.store.set("setup.power.autoPowerOff", true);
              return;
            }
            ctx.overlay(
              dialog({
                message: AUTO_POWER_OFF_WARNING,
                onOk: () => void ctx.store.set("setup.power.autoPowerOff", false),
              }),
            );
          }),
          paramCell(ctx, spec),
        ],
      }),
    };
  },
};

export const dateTimeScreen: ScreenDef = {
  id: "setup.datetime",
  toolbar: "sub",
  title: () => "DATE / TIME",
  build(ctx): ScreenBody {
    const row = (caption: string, node: HTMLElement): HTMLElement =>
      el("div", { class: "dt-row", children: [el("span", { class: "dt-caption", text: caption }), node] });
    // The top pair open a popup screen; the pair under them are pulldowns.
    const popup = (parts: HTMLElement[], label: string, open: () => void): HTMLElement =>
      el("button", {
        // One part stands in the middle of the box; two stand at its two ends.
        class: `btn dt-value${parts.length === 1 ? " dt-value-single" : ""}`,
        onTap: open,
        attrs: { "aria-label": label },
        children: [
          ...parts,
          el("span", { class: "dt-copy", children: [Icons.copy()] }),
        ],
      });
    return {
      main: el("div", {
        class: "dt-screen",
        children: [
          row("Date / Time", popup(dateTimeSpans(ctx), "Set the date and time", () => openDateTimeSet(ctx))),
          row(
            "Time Zone",
            popup([el("span", { text: ctx.store.str("setup.dateTime.timeZone", TIME_ZONE_SHIPPED) })], "Select the time zone", () => openTimeZone(ctx)),
          ),
          row(
            "Display Format",
            el("div", {
              class: "dt-formats",
              children: [
                el("div", {
                  class: "dt-format",
                  children: [
                    el("span", { class: "dt-format-head", text: "Date" }),
                    pulldown(ctx, ctx.store.str("setup.dateTime.dateFormat", "MM/DD/YYYY"), ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD"], (v) =>
                      void ctx.store.set("setup.dateTime.dateFormat", v),
                    ),
                  ],
                }),
                el("div", {
                  class: "dt-format",
                  children: [
                    el("span", { class: "dt-format-head", text: "Time" }),
                    pulldown(ctx, ctx.store.str("setup.dateTime.timeFormat", "24h"), ["24h", "12h"], (v) => void ctx.store.set("setup.dateTime.timeFormat", v)),
                  ],
                }),
              ],
            }),
          ),
        ],
      }),
    };
  },
};

export const integrationScreen: ScreenDef = {
  id: "setup.integration",
  toolbar: "sub",
  title: () => "SOFTWARE INTEGRATION",
  build(ctx): ScreenBody {
    const mixes = ["MIX 1", "MIX 2"];
    return {
      main: el("div", {
        class: "integration-screen",
        children: [
          el("div", { class: "section-band", text: "DAW Integration" }),
          el("p", { class: "integration-caption", text: "Post Fader Send for FX" }),
          ...(["fx1Send", "fx2Send"] as const).map((key, i) =>
            el("div", {
              class: "dt-row",
              children: [
                el("span", { class: "dt-caption", text: `for FX${i + 1}` }),
                pulldown(ctx, ctx.store.str(`setup.integration.${key}`, "MIX 1"), mixes, (v) => void ctx.store.set(`setup.integration.${key}`, v)),
              ],
            }),
          ),
        ],
      }),
      // The rail's tab names the menu on screen, and this screen has one menu,
      // so the tab is always the one taken.
      side: [sideTab("DAW", true, () => undefined)],
    };
  },
};

/**
 * A still of the HOME screen: a second shell drawn from the same store, copied and
 * let go. The copy carries no ids, is hidden from assistive technology and holds
 * no stop for the Tab key.
 */
function homeStill(ctx: AppContext): HTMLElement {
  const shell = new Shell(buildRegistry(), ctx.store, ctx.model);
  const still = shell.root.cloneNode(true) as HTMLElement;
  shell.destroy();
  for (const node of still.querySelectorAll("[id]")) node.removeAttribute("id");
  still.removeAttribute("role");
  still.setAttribute("aria-hidden", "true");
  still.setAttribute("inert", "");
  return still;
}

/**
 * Operation Mode, drawn as the start-up wizard's page: a white button at each
 * end of the toolbar in place of the shell's arrow and HOME, and the two modes
 * as wide cards. The mode is taken on the tap, so [Next] only leaves.
 */
export const operationModeScreen: ScreenDef = {
  id: "setup.mode",
  toolbar: "sub",
  title: () => "Operation Mode",
  shellExits: false,
  knobToggle: false,
  build(ctx): ScreenBody {
    const mode = ctx.store.str("setup.operationMode", "Standard");
    // Simple Mode is not built, so its card cannot be chosen.
    const card = (value: string, title: string, blurb: string, usable: boolean): HTMLElement => {
      const node = el("button", {
        class: `mode-card${usable ? "" : " is-disabled"}`,
        onTap: () => void ctx.store.set("setup.operationMode", value),
        children: [el("span", { class: "mode-card-title", text: title }), el("span", { class: "mode-card-blurb", text: blurb })],
      });
      if (!usable) node.disabled = true;
      setPressed(node, value === mode);
      return node;
    };
    return {
      main: el("div", {
        class: "mode-screen",
        children: [
          // Standard Mode's preview is a still of HOME; Simple Mode's frame stays empty.
          el("div", { class: "mode-preview mode-preview-simple" }),
          el("div", { class: "mode-preview mode-preview-standard", children: [homeStill(ctx)] }),
          card("Simple", "Simple Mode", "Quick and easy control with Assistant Features", false),
          card("Standard", "Standard Mode", "Full access to all parameters.", true),
        ],
      }),
      headerLeft: button("Back", () => ctx.nav.back(), "wizard-btn"),
      headerRight: button("Next", () => ctx.nav.back(), "wizard-btn wizard-next"),
    };
  },
};

export const setupScreens: ScreenDef[] = [
  setupScreen,
  versionScreen,
  licenseScreen,
  languageScreen,
  brightnessScreen,
  samplingRateScreen,
  udkScreen,
  udkAssignScreen,
  outputPatchScreen,
  peripheralScreen,
  powerScreen,
  dateTimeScreen,
  dateTimeSetScreen,
  timeZoneScreen,
  integrationScreen,
  operationModeScreen,
];
