// SETUP screen and its menus (user guide, "SETUP screen > Top menu").
//
// The menu names, button captions and option lists are the unit's own wording,
// not paraphrased.

import licenseText from "../../LICENSE?raw";
import type { AppContext } from "../app/context";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkColumn, udkFromColumns, udkLines, udkPath } from "../model/udk";
import { aimed, el, makeTappable, markShut, setPressed, writing } from "../ui/dom";
import { brightnessSpec, intSpec } from "../ui/param-spec";
import { Icons } from "../ui/icons";
import { dateTimeSetScreen, dateTimeSpans, openDateTimeSet, openTimeZone, timeZoneScreen } from "./date-time";
import { draftTitle } from "./title-entry";
import { patchSourceSheet } from "./output-patch";
import { button, dialog, holdsModal, menuButton, menuGrid, paramCell, pickColumn, pickDialog, pulldown, scrollbar, sideTab, toggle } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";
import { Shell } from "../app/shell";
import { buildRegistry } from "./index";
import { factoryState } from "../model/defaults";
import { TIME_ZONE_SHIPPED } from "../model/time-zone";
import { dropTracksOverRate } from "../model/track-count";
import { INTEGRATION_DAW } from "../model/types";
import { dropInsertsOverRate } from "./insert-fx";
import { holdsFile, recordMode, releaseOnRateChange } from "./recording";
import { dropSendsOverRate } from "./effect-params";

/** The commit the simulator was built from, shortened. The build defines it (vite.config.ts), and so does a
 *  host that bundles this source; where neither does, APP Version reads "unknown". */
declare const __URX_LCD_SIM_COMMIT__: string | undefined;

/** The languages the unit offers. The simulator's messages are in English only, so the other two cannot be chosen. */
const LANGUAGES = [
  { value: "Japanese", top: "日本語", bottom: "Japanese", usable: false },
  { value: "English", top: "English", bottom: "English", usable: true },
  { value: "Chinese", top: "簡体中文", bottom: "Chinese, Simplified", usable: false },
];

const SAMPLING_RATES = [44100, 48000, 88200, 96000, 176400, 192000];

/** What [Software Integration] tells a pointer resting on it while nothing says whether a DAW holds the unit. */
const INTEGRATION_TOOLTIP = "Not available on the unit; left usable here for screenshots.";

/** What a User Defined Knob can be put on, in the order the pulldown lists them. */
export const setupScreen: ScreenDef = {
  id: "setup",
  toolbar: "sub",
  knobToggle: false,
  build(ctx): ScreenBody {
    const open = (id: string) => aimed(() => ctx.nav.push({ id }), { kind: "screen", id });
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

    // In recording mode, armed, recording or paused, and while playback holds a
    // file, playing or paused, Sampling Frequency takes the face of an entry out
    // of reach and opens nothing. While playback holds a file, so does the
    // Operation Mode box.
    const held = holdsFile(ctx.store);
    const rateShut = recordMode(ctx.store) || held;
    const rest: HTMLElement[] = [
      menuButton("User Defined\nKnobs", open("setup.udk")),
      el("div"),
      el("div"),
      markShut(menuButton("Sampling\nFrequency", rateShut ? () => undefined : open("setup.rate")), rateShut),
      menuButton("Output Patch", open("setup.patch")),
      menuButton("Peripheral", open("setup.peripheral")),
      menuButton("Power\nManagement", open("setup.power")),
    ];
    // The URX22 has no Date/Time menu (user guide note under GENERAL menu); its place stays empty.
    rest.push(ctx.model.hasDateTime ? menuButton("Date/Time", open("setup.datetime")) : el("div"));
    // The unit offers Software Integration only while a compatible DAW holds it, and
    // otherwise as an entry out of reach. A page that knows whether one does says so
    // at INTEGRATION_DAW, and the entry follows it as the unit's does. With nothing
    // saying, it opens and works, and its tooltip says the unit does not offer it.
    if (ctx.store.has(INTEGRATION_DAW)) {
      const daw = ctx.store.bool(INTEGRATION_DAW, false);
      rest.push(markShut(menuButton("Software\nIntegration", daw ? open("setup.integration") : () => undefined), !daw));
    } else {
      const integration = menuButton("Software\nIntegration", open("setup.integration"));
      integration.title = INTEGRATION_TOOLTIP;
      rest.push(integration);
    }

    const mode = ctx.store.str("setup.operationMode", "Standard");
    const modeBox = markShut(
      el("button", {
        class: "mode-box",
        onTap: held ? () => undefined : aimed(() => ctx.nav.push({ id: "setup.mode" }), { kind: "screen", id: "setup.mode" }),
        children: [
          el("span", { class: "mode-caption", text: "Operation Mode" }),
          el("span", { class: "mode-value", text: mode }),
        ],
      }),
      held,
    );

    // Console Lock (System firmware V1.5) stands on the bar, left of HOME, as wide as the
    // Operation Mode box (p126-1).
    const consoleLock = el("button", {
      class: "console-lock-btn",
      onTap: open("setup.consoleLock"),
      children: [Icons.consoleLockSmall(), el("span", { text: "Console Lock" })],
    });

    return {
      main: el("div", { class: "setup-main", children: [tray, menuGrid(rest, "setup-menu")] }),
      headerLeft: modeBox,
      headerRight: consoleLock,
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

/** How long a touch on the lock screen has to be held before the unit unlocks (read off a URX44V). */
export const UNLOCK_HOLD_MS = 1200;
/** How long the opened padlock stays up before HOME comes back (read off a URX44V). */
export const UNLOCKED_MS = 900;

/**
 * The lock screen, laid over the whole glass. The unit takes nothing but a touch held on it: a short
 * touch puts a faint circle round the padlock and lets it go, a hold grows a light circle out of the
 * padlock over the screen, the padlock opens, and HOME comes back. The lock is kept nowhere, so a
 * reload starts the simulator unlocked, as the unit starts unlocked after it is switched off and on.
 * No figure shows it; its words, its layout and its timings were read off a URX44V.
 */
export function lockConsole(ctx: AppContext): void {
  const padlock = el("span", { class: "console-locked-padlock", children: [Icons.consoleLock()] });
  const ring = el("span", { class: "console-locked-ring", attrs: { "aria-hidden": "true" } });
  const node = holdsModal(el("div", {
    class: "console-locked",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": "CONSOLE LOCK", tabindex: "0" },
    children: [
      ring,
      el("h1", { class: "console-locked-title", text: "CONSOLE LOCK" }),
      el("p", { class: "console-locked-hold", text: "Touch and Hold the Screen to Unlock the Console." }),
      el("p", { class: "console-locked-note", text: "A password is required if one is set." }),
      padlock,
    ],
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unlocked = false;
  const stop = (): void => {
    if (unlocked) return;
    clearTimeout(timer);
    timer = undefined;
    node.classList.remove("is-holding");
  };
  const start = (): void => {
    if (unlocked || timer !== undefined) return;
    node.classList.add("is-holding");
    timer = setTimeout(() => {
      unlocked = true;
      node.classList.add("is-unlocked");
      padlock.replaceChildren(Icons.consoleUnlocked());
      timer = setTimeout(() => {
        close();
        if (!ctx.store.str(CONSOLE_PASSWORD, "")) {
          void ctx.store.set(LOCKED, 0);
          ctx.nav.home();
          return;
        }
        // With a password set, the opened padlock gives way to Type the password, and every way off
        // it but the right password puts the lock screen back.
        askPassword(ctx, "unlock");
        const off = ctx.nav.onChange((route) => {
          if (ctx.store.num(LOCKED, 0) !== 1) return off();
          if (route.id === ENTER_PASSWORD || route.id === "scene.title") return;
          off();
          lockConsole(ctx);
        });
      }, UNLOCKED_MS);
    }, UNLOCK_HOLD_MS);
  };
  node.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    node.setPointerCapture?.(ev.pointerId);
    start();
  });
  for (const type of ["pointerup", "pointercancel"]) node.addEventListener(type, stop);
  // A key held down on the screen stands for a touch held on it.
  node.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      ev.preventDefault();
      start();
    }
  });
  node.addEventListener("keyup", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") stop();
  });
  // A key held down and the focus then taken elsewhere lets go of the hold: its release lands elsewhere.
  node.addEventListener("blur", stop);
  void ctx.store.set(LOCKED, 1);
  const close = ctx.overlay(node, () => clearTimeout(timer));
  node.focus({ preventScroll: true });
}

/**
 * CONSOLE LOCK (SETUP > Console Lock, System firmware V1.5; p067-1): the button that locks the
 * unit, and [Change Password] for the password the unlock asks for.
 */
export const consoleLockScreen: ScreenDef = {
  id: "setup.consoleLock",
  toolbar: "sub",
  title: () => "CONSOLE LOCK",
  build(ctx): ScreenBody {
    const lock = el("button", {
      class: "console-lock-tile",
      onTap: () => lockConsole(ctx),
      children: [
        Icons.consoleLock(),
        el("span", { class: "console-lock-caption", text: "CONSOLE LOCK" }),
        el("span", { class: "console-lock-note", text: "A password is required if one is set." }),
      ],
    });
    const password = el("button", {
      class: "menu-btn console-lock-password",
      onTap: () => {
        if (ctx.store.str(CONSOLE_PASSWORD, "")) askPassword(ctx, "change");
        else openChangePassword(ctx, "push");
      },
      children: [el("span", { text: "Change\nPassword" }), el("span", { class: "console-lock-copy", children: [Icons.copy()] })],
    });
    return { main: el("div", { class: "console-lock-screen", children: [lock, password] }) };
  },
};

/** Where Change Password and Type the password hold what is typed while they are open. */
const PASSWORD_DRAFT = "ui.consoleLock.draft";
/** Whether the unit is locked; Type the password looks here while it stands in for the lock screen. */
const LOCKED = "ui.consoleLock.locked";
/** What Type the password is asked for: "unlock" or "change". */
const PURPOSE = "ui.consoleLock.purpose";
const ENTER_PASSWORD = "setup.consoleLock.enter";
/** The password the unlock asks for. Kept for the session only (persist.ts, IN_FLIGHT). */
export const CONSOLE_PASSWORD = "ui.consoleLock.password";
/** The most characters a password takes (user guide, "Console Lock menu"). */
const PASSWORD_MAX = 8;
/** How long the unit shows that the two passwords differ before Change Password comes back (read off a URX44V). */
export const MISMATCH_MS = 2000;

/** A message the unit shows for a moment over the screen, with the information mark and no button. */
function notice(ctx: AppContext, message: string, ms: number, after: () => void): void {
  const node = holdsModal(el("div", {
    class: "dialog-overlay",
    attrs: { role: "alertdialog", "aria-modal": "true", "aria-label": message },
    children: [
      el("div", {
        class: "dialog",
        children: [
          el("div", {
            class: "dialog-ask",
            children: [el("span", { class: "dialog-mark", children: [Icons.info()] }), el("p", { class: "dialog-text", text: message })],
          }),
        ],
      }),
    ],
  }));
  const timer = setTimeout(() => {
    close();
    after();
  }, ms);
  const close = ctx.overlay(node, () => clearTimeout(timer));
}

/**
 * Change Password (CONSOLE LOCK, System firmware V1.5): a sheet over the screen with a field for the
 * new password and one to confirm it. Each field opens the title keyboard, which shows an asterisk for
 * each character. [OK] with the two the same sets the password; with them different, the unit says so
 * for two seconds and gives the sheet back as it was. No figure shows it; its words were read off a
 * URX44V and so was its layout, on the confirmation dialog's sheet.
 */
export const consolePasswordScreen: ScreenDef = {
  id: "setup.consoleLock.password",
  toolbar: "sub",
  shellExits: false,
  leavesOnTouchAround: false,
  dimsBehind: true,
  build(ctx): ScreenBody {
    const field = (key: "new" | "confirm", label: string): HTMLElement => {
      const typed = ctx.store.str(`${PASSWORD_DRAFT}.${key}`, "");
      return el("div", {
        class: "console-password-row",
        children: [
          el("span", { class: "console-password-label", text: label }),
          el("button", {
            class: "console-password-field",
            attrs: { "aria-label": label.replace(/:$/, "") },
            onTap: () => {
              draftTitle(ctx, {
                path: "",
                title: typed,
                max: PASSWORD_MAX,
                empty: true,
                masked: true,
                onOk: (text) => void ctx.store.set(`${PASSWORD_DRAFT}.${key}`, text),
              });
              ctx.nav.push({ id: "scene.title" });
            },
            children: [
              el("span", { class: "console-password-stars", text: "*".repeat(typed.length) }),
              el("span", { class: "console-password-mark", children: [Icons.rename()] }),
            ],
          }),
        ],
      });
    };
    const ok = (): void => {
      const typed = ctx.store.str(`${PASSWORD_DRAFT}.new`, "");
      if (typed !== ctx.store.str(`${PASSWORD_DRAFT}.confirm`, "")) {
        notice(ctx, "Entered Password do not match, please re-enter.", MISMATCH_MS, () => undefined);
        return;
      }
      // Both left empty, the password goes; the unit says the same either way.
      void ctx.store.set(CONSOLE_PASSWORD, typed);
      notice(ctx, "Password Changed.", MISMATCH_MS, () => ctx.nav.back());
    };
    return {
      main: el("div", {
        class: "dialog console-password",
        children: [
          el("div", {
            class: "console-password-head",
            children: [Icons.consoleLock(), el("h1", { class: "console-password-title", text: "Change Password" })],
          }),
          field("new", "New Password:"),
          field("confirm", "Confirm Password:"),
          el("div", { class: "dialog-actions", children: [button("Cancel", () => ctx.nav.back()), button("OK", ok)] }),
        ],
      }),
    };
  },
};

/** Open Change Password with both fields empty, on top of CONSOLE LOCK or in place of Type the password. */
function openChangePassword(ctx: AppContext, how: "push" | "replace"): void {
  void ctx.store.set(`${PASSWORD_DRAFT}.new`, "");
  void ctx.store.set(`${PASSWORD_DRAFT}.confirm`, "");
  if (how === "push") ctx.nav.push({ id: "setup.consoleLock.password" });
  else ctx.nav.replace({ id: "setup.consoleLock.password" });
}

/** Ask for the password, to unlock or before Change Password. */
function askPassword(ctx: AppContext, purpose: "unlock" | "change"): void {
  void ctx.store.set(PURPOSE, purpose);
  void ctx.store.set(`${PASSWORD_DRAFT}.enter`, "");
  ctx.nav.push({ id: "setup.consoleLock.enter" });
}

/**
 * Type the password (System firmware V1.5): what the unit asks before it unlocks with a password set,
 * once the held touch has opened the padlock, and before Change Password. The wrong password is
 * refused for two seconds and the sheet comes back with what was typed. [Cancel] puts an unlock back on
 * the lock screen. No figure shows it; its words were read off a URX44V and so was its layout, on
 * Change Password's sheet.
 */
export const consoleEnterScreen: ScreenDef = {
  id: ENTER_PASSWORD,
  toolbar: "sub",
  shellExits: false,
  leavesOnTouchAround: false,
  dimsBehind: true,
  build(ctx): ScreenBody {
    const typed = ctx.store.str(`${PASSWORD_DRAFT}.enter`, "");
    const ok = (): void => {
      if (ctx.store.str(`${PASSWORD_DRAFT}.enter`, "") !== ctx.store.str(CONSOLE_PASSWORD, "")) {
        notice(ctx, "Incorrect password entered.", MISMATCH_MS, () => undefined);
        return;
      }
      if (ctx.store.str(PURPOSE, "") === "change") {
        openChangePassword(ctx, "replace");
        return;
      }
      void ctx.store.set(LOCKED, 0);
      ctx.nav.home();
    };
    return {
      main: el("div", {
        class: "dialog console-password is-enter",
        children: [
          el("div", {
            class: "console-password-head",
            children: [Icons.consoleLock(), el("h1", { class: "console-password-title", text: "Type the password" })],
          }),
          el("div", {
            class: "console-password-row",
            children: [
              el("span", { class: "console-password-label", text: "Password:" }),
              el("button", {
                class: "console-password-field",
                attrs: { "aria-label": "Password" },
                onTap: () => {
                  draftTitle(ctx, {
                    path: "",
                    title: typed,
                    max: PASSWORD_MAX,
                    empty: true,
                    masked: true,
                    onOk: (text) => void ctx.store.set(`${PASSWORD_DRAFT}.enter`, text),
                  });
                  ctx.nav.push({ id: "scene.title" });
                },
                children: [
                  el("span", { class: "console-password-stars", text: "*".repeat(typed.length) }),
                  el("span", { class: "console-password-mark", children: [Icons.rename()] }),
                ],
              }),
            ],
          }),
          el("div", { class: "dialog-actions", children: [button("Cancel", () => ctx.nav.back()), button("OK", ok)] }),
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
    // commit the simulator was built from.
    const cells: [string, string][] = [
      ["Total Version", ctx.store.str("device.version.total", "V1.3.1.0")],
      ["APP Version", typeof __URX_LCD_SIM_COMMIT__ === "string" ? __URX_LCD_SIM_COMMIT__ : "unknown"],
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
            onTap: writing("setup.language", () => void ctx.store.set("setup.language", l.value)),
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
    const followUsb = ctx.store.bool("setup.followUsb", true);
    const label = (hz: number): string => `${(hz / 1000).toFixed(1).replace(/\.0$/, "")}kHz`;
    // Following the USB clock leaves the frequency the unit holds where it is
    // and keeps showing it lit; the row simply cannot be used until the switch
    // is turned off again.
    const rates = SAMPLING_RATES.map((hz) => {
      // The frequency and what it takes off the inserts, the recorder, playback and HOME's [Sends] are one operation
      // of the store.
      const pick = (): void => {
        if (followUsb) return;
        ctx.store.operation(() => {
          void ctx.store.set("setup.samplingFrequency", hz);
          dropInsertsOverRate(ctx, hz);
          dropTracksOverRate(ctx.store, hz);
          releaseOnRateChange(ctx.store, current, hz);
          dropSendsOverRate(ctx.store, ctx.model, hz);
        });
      };
      const cell = toggle(label(hz), hz === current, writing(["setup.samplingFrequency", ...ctx.store.writesOf(pick)], pick), "rate-btn");
      if (followUsb) cell.setAttribute("aria-disabled", "true");
      return cell;
    });
    return {
      main: el("div", {
        class: "rate-screen",
        children: [
          el("div", { class: `rate-row${followUsb ? " is-locked" : ""}`, children: rates }),
          toggle("Follow USB", followUsb, writing("setup.followUsb", () => void ctx.store.set("setup.followUsb", !followUsb)), "follow-usb"),
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
        ...UDK_BANKS.map((b) => toggle(String(b), b === bank, writing("setup.udk.bank", () => void ctx.store.set("setup.udk.bank", b)), "udk-bank")),
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
      makeTappable(card, aimed(() => {
        // The unit opens a dialog of its own to pick from, rather than dropping
        // a list over the card.
        void ctx.store.set("ui.udkKnob", k);
        void ctx.store.set("ui.udkPick", assign.value);
        ctx.nav.push({ id: "setup.udk.assign" });
      }, { kind: "screen", id: "setup.udk.assign" }));
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
        coversBar: true,
        onCancel: () => ctx.nav.back(),
        onOk: writing(udkPath(bank, knob), () => {
          void ctx.store.set(udkPath(bank, knob), picked.value);
          ctx.nav.back();
        }),
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
              onTap: writing(r.path, () => void patchSourceSheet(ctx, r.caption, r.path, tab)),
              attrs: { "aria-label": `${r.caption}: ${ctx.store.str(r.path, "STEREO")}` },
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
      sideTab(t, t === tab, writing("setup.outputPatch.tab", () => void ctx.store.set("setup.outputPatch.tab", t)), t === "Analog" ? Icons.plug() : Icons.usb(), "patch-tab"),
    );

    return {
      main: el("div", {
        class: "patch-screen",
        children: [
          el("div", { class: "section-band", text: tab.toUpperCase() }),
          grid,
          // [Default] asks first, and [OK] puts back the outputs on this tab alone.
          button("Default", () => ctx.overlay(dialog({ message: PATCH_DEFAULT_ASK, onOk: writing(rows.map((r) => r.path), () => resetPatch(ctx, rows.map((r) => r.path))) })), "patch-default"),
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
          el("div", { class: "peripheral-group peripheral-hdcp", children: [el("span", { class: "peripheral-caption", text: "HDCP" }), toggle("Enable", enabled, writing("setup.peripheral.hdmiEnable", () => void ctx.store.set("setup.peripheral.hdmiEnable", !enabled)))] }),
          el("div", {
            class: "peripheral-group peripheral-channels",
            children: [
              el("span", { class: "peripheral-caption", text: "Input Audio Channels" }),
              el("div", {
                class: "btn-row",
                children: (["2 Channels", "Multi Channels"] as const).map((c) =>
                  toggle(c, c === channels, writing("setup.peripheral.hdmiChannels", () => void ctx.store.set("setup.peripheral.hdmiChannels", c))),
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
                  toggle(c, c === suppression, writing("setup.peripheral.usbSuppression", () => void ctx.store.set("setup.peripheral.usbSuppression", c))),
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
      side: tabs.map((t) => sideTab(t, t === tab, writing("setup.peripheral.tab", () => void ctx.store.set("setup.peripheral.tab", t)), t === "Main" ? Icons.usb() : Icons.hdmi())),
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
    const enabled = ctx.store.bool("setup.power.autoPowerOff", ctx.model.autoPowerOffShipped);
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
          toggle("Enable", enabled, writing("setup.power.autoPowerOff", () => {
            if (!enabled) {
              void ctx.store.set("setup.power.autoPowerOff", true);
              return;
            }
            ctx.overlay(
              dialog({
                message: AUTO_POWER_OFF_WARNING,
                onOk: writing("setup.power.autoPowerOff", () => void ctx.store.set("setup.power.autoPowerOff", false)),
              }),
            );
          })),
          paramCell(ctx, spec),
        ],
      }),
    };
  },
};

/** How many ids the DATE / TIME screen has handed out, so each node it names by id holds an id of its own. */
let dateTimeIds = 0;

/** Give `node` an id of its own, and return it. */
function labelId(node: HTMLElement): string {
  node.id = `dt-label-${++dateTimeIds}`;
  return node.id;
}

export const dateTimeScreen: ScreenDef = {
  id: "setup.datetime",
  toolbar: "sub",
  title: () => "DATE / TIME",
  build(ctx): ScreenBody {
    const row = (caption: string, node: HTMLElement): HTMLElement =>
      el("div", { class: "dt-row", children: [el("span", { class: "dt-caption", text: caption }), node] });
    // The top pair open a popup screen; the pair under them are pulldowns. A
    // popup is named by its row's caption and the parts it reads, and its name
    // follows the reading as the clock runs.
    const popupRow = (caption: string, parts: HTMLElement[], open: () => void): HTMLElement => {
      const head = el("span", { class: "dt-caption", text: caption });
      const node = el("button", {
        // One part stands in the middle of the box; two stand at its two ends.
        class: `btn dt-value${parts.length === 1 ? " dt-value-single" : ""}`,
        onTap: open,
        attrs: { "aria-labelledby": [head, ...parts].map(labelId).join(" ") },
        children: [
          ...parts,
          el("span", { class: "dt-copy", children: [Icons.copy()] }),
        ],
      });
      return el("div", { class: "dt-row", children: [head, node] });
    };
    return {
      main: el("div", {
        class: "dt-screen",
        children: [
          popupRow("Date / Time", dateTimeSpans(ctx), aimed(() => openDateTimeSet(ctx), { kind: "screen", id: "setup.datetime.set" })),
          popupRow("Time Zone", [el("span", { text: ctx.store.str("setup.dateTime.timeZone", TIME_ZONE_SHIPPED) })], aimed(() => openTimeZone(ctx), { kind: "screen", id: "setup.datetime.zone" })),
          row(
            "Display Format",
            el("div", {
              class: "dt-formats",
              children: [
                el("div", {
                  class: "dt-format",
                  children: [
                    el("span", { class: "dt-format-head", text: "Date" }),
                    pulldown(ctx, ctx.store.str("setup.dateTime.dateFormat", "MM/DD/YYYY"), ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD"], (v) => void ctx.store.set("setup.dateTime.dateFormat", v), {
                      path: "setup.dateTime.dateFormat",
                      label: "Date",
                    }),
                  ],
                }),
                el("div", {
                  class: "dt-format",
                  children: [
                    el("span", { class: "dt-format-head", text: "Time" }),
                    pulldown(ctx, ctx.store.str("setup.dateTime.timeFormat", "24h"), ["24h", "12h"], (v) => void ctx.store.set("setup.dateTime.timeFormat", v), { path: "setup.dateTime.timeFormat", label: "Time" }),
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
                pulldown(ctx, ctx.store.str(`setup.integration.${key}`, "MIX 1"), mixes, (v) => void ctx.store.set(`setup.integration.${key}`, v), { path: `setup.integration.${key}`, label: `for FX${i + 1}` }),
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
        onTap: writing("setup.operationMode", () => void ctx.store.set("setup.operationMode", value)),
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
  consoleLockScreen,
  consolePasswordScreen,
  consoleEnterScreen,
  operationModeScreen,
];
