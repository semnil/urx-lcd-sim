// Entry point: build the store on a simulated device, mount the screen, and put
// the model selector and transport indicator in the surrounding chrome.
//
// The chrome is the simulator's own UI, not the unit's — it is deliberately
// outside the 480x272 frame so nothing on the LCD is something the hardware
// would not show.

import "./style/tokens.css";
import "./style/app.css";
import "./style/lcd.css";

import { cardInSlot, modelOf, openKeeper, openKept, restore, sceneMemories, type Settled, startSaving, type Opened } from "./app/persist";
import { Shell } from "./app/shell";
import type { ParamValue } from "./device/path";
import { DeviceStore } from "./device/store";
import { SimTransport } from "./device/sim-transport";
import { factoryState } from "./model/defaults";
import type { ModelId } from "./model/types";
import { unitById } from "./model/units";
import { buildRegistry } from "./screens";
import { startDateTimeClock } from "./screens/date-time";
import { startMeterTicker } from "./screens/meters";
import { startRecorderClock } from "./screens/recording";
import { el } from "./ui/dom";
import { Icons } from "./ui/icons";
import { buildLinkIndicator } from "./ui/link-indicator";
import { buildPanel } from "./ui/panel";

const MODEL_IDS: ModelId[] = ["URX44V", "URX44", "URX22"];

/** Display scale for the screen. 100 is the size the unit draws it at. */
const ZOOM_PERCENTS = [50, 75, 100, 150, 200] as const;
const DEFAULT_ZOOM = 100;

/** How long a confirmation button does nothing after the question appears, longer than a double click. */
const CONFIRM_HOLD_MS = 500;

/** What the chrome says while the browser does not take the unit. */
const UNKEPT_TEXT = "The browser is not keeping the unit: changes made now will not come back after a reload.";

/** What the chrome says once another tab has stored the unit and this one stores it no more. */
const ELSEWHERE_TEXT = "Another tab has stored the unit, so this tab no longer stores it: changes made here will not come back after a reload.";

/** What the chrome says where the browser gives the simulator nowhere to keep the unit. */
const NO_STORE_TEXT = "This browser does not let the simulator keep the unit: changes made now will not come back after a reload.";

/** What the chrome says where the last changes made before this start were dropped. */
const DROPPED_TEXT = "The last changes made before this start were not kept: another tab stored the unit first.";

/** What the chrome says where the browser refused the last changes made before this start. */
const REFUSED_BEFORE_TEXT = "The browser refused to store the last changes made before this start, so they were not kept.";

/** What the chrome says where the start shows changes a page left that the browser refused to take in. */
const CARRIED_TEXT = "The browser refused to store the last changes made before this start: they are shown here, and stored at the next write it takes.";

function applyZoom(percent: number): void {
  document.documentElement.style.setProperty("--zoom", String(percent / 100));
  document.documentElement.dataset["zoom"] = String(percent);
}

function currentZoom(): number {
  const stored = Number(document.documentElement.dataset["zoom"]);
  return ZOOM_PERCENTS.includes(stored as (typeof ZOOM_PERCENTS)[number]) ? stored : DEFAULT_ZOOM;
}

/** Opening ?zoom=150 starts at that scale; anything else falls back to 100. */
function requestedZoom(): number {
  const asked = Number(new URLSearchParams(window.location.search).get("zoom"));
  return ZOOM_PERCENTS.includes(asked as (typeof ZOOM_PERCENTS)[number]) ? asked : DEFAULT_ZOOM;
}

/** Teardown for whatever is mounted: the shell's listeners, the meters, the link. */
let disposeMounted: (() => void) | null = null;

/** Leaves a change of the mounted unit still waiting to be stored for the next start. */
let leaveMounted: (() => void) | null = null;

/** Where the browser keeps the unit, and the name of what this page leaves on leaving. */
const keeper = openKeeper();
const tab = crypto.randomUUID();

/**
 * Start `modelId` in `mount`: on opening the page with what the browser held
 * (`opened`), on a model `"picked"`, or after an initialization with the values
 * that operation leaves in place.
 */
async function boot(
  modelId: ModelId,
  mount: HTMLElement,
  how: "opened" | "picked" | "reset" | "current" = "opened",
  retained: Record<string, ParamValue> = {},
  opened?: Opened,
  before: Settled = "kept",
): Promise<void> {
  disposeMounted?.();
  disposeMounted = null;
  leaveMounted = null;
  const { kept, shown, carried, dropped, refused } = opened ?? (await openKept(keeper));
  // Only the page's opening shows what a page left that the browser refused; a
  // model picked or a reset starts from the record, and what was left stays for later.
  const carries = how === "opened" && carried !== null;
  const model = unitById(modelId);
  const store = new DeviceStore();
  const transport = new SimTransport(factoryState(model));
  await store.attach(transport);
  // An initialization starts from the unit as it ships, then puts back what it leaves in place.
  if (how !== "reset" && how !== "current") await restore(store, modelId, carries ? shown : kept);
  for (const [path, value] of Object.entries(retained)) await store.restore(path, value);
  // A banner over the top centre of the page that says what was lost before this
  // start, and how storing stands now. What was lost (the last changes before the
  // start dropped, refused, or shown here and not yet stored) stays until the
  // banner is closed; changes shown here and not yet stored go once a write is
  // taken. How storing stands: the browser refusing the unit, full or blocked,
  // until a write is taken again; another tab having stored the unit, until the
  // unit starts again; the browser giving the simulator nowhere to keep it. It
  // lies over the page, so showing it moves nothing else. [×] or Escape closes
  // it; the browser's refusal brings it back at the next write it refuses, the
  // other tab at the next change to the unit.
  const noticeText = el("p", { attrs: { role: "status" } });
  const notice = el("div", {
    class: "chrome-notice",
    children: [
      noticeText,
      el("button", {
        class: "chrome-button chrome-notice-close",
        attrs: { type: "button", "aria-label": "Close" },
        children: [Icons.close()],
        onTap: () => closeNotice(),
      }),
    ],
  });
  notice.hidden = true;
  let storedElsewhere = false;
  let lost: string[] = [];
  let now: string | null = null;
  const render = (): void => {
    noticeText.textContent = [...lost, now].filter(Boolean).join(" ");
    notice.hidden = lost.length === 0 && now === null;
  };
  const showNotice = (text: string): void => {
    now = text;
    render();
  };
  const closeNotice = (): void => {
    const hadFocus = notice.contains(document.activeElement);
    lost = [];
    notice.hidden = true;
    if (hadFocus) modelSelect.focus();
  };
  notice.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !ev.isComposing) closeNotice();
  });
  const saving = startSaving(
    store,
    modelId,
    undefined,
    (taken) => {
      if (!taken) {
        showNotice(UNKEPT_TEXT);
        return;
      }
      if (now === UNKEPT_TEXT || now === NO_STORE_TEXT) now = null;
      lost = lost.filter((text) => text !== CARRIED_TEXT);
      render();
    },
    () => {
      storedElsewhere = true;
      showNotice(ELSEWHERE_TEXT);
    },
    {
      keeper,
      kept,
      tab: carries ? (carried as string) : tab,
      ...(how === "reset" || how === "current" ? { first: "unit" } : how === "picked" ? { first: "model" } : {}),
      ...(carries && shown.unit !== kept.unit ? { carried: true } : carries ? { first: "model" } : {}),
    },
  );
  if (carries) lost.push(CARRIED_TEXT);
  if (dropped || before === "moved") lost.push(DROPPED_TEXT);
  if (before === "refused") lost.push(REFUSED_BEFORE_TEXT);
  if (!keeper || refused) now = NO_STORE_TEXT;
  render();
  const offNotice = store.onChange(() => {
    if (storedElsewhere) showNotice(ELSEWHERE_TEXT);
  });
  leaveMounted = saving.leave;

  const shell = new Shell(buildRegistry(), store, model);
  const panel = buildPanel(shell);

  const modelSelect = el("select", { class: "chrome-select", attrs: { "aria-label": "Unit model" } }) as HTMLSelectElement;
  for (const id of MODEL_IDS) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    opt.selected = id === modelId;
    modelSelect.appendChild(opt);
  }
  // The change still waiting is written before the picked model's start reads what is stored.
  modelSelect.addEventListener("change", () => {
    if (active === "starting") {
      modelSelect.value = startingModel;
      return;
    }
    void restart("picked", modelSelect.value as ModelId);
  });

  const zoomSelect = el("select", { class: "chrome-select", attrs: { "aria-label": "Display scale" } }) as HTMLSelectElement;
  for (const percent of ZOOM_PERCENTS) {
    const opt = document.createElement("option");
    opt.value = String(percent);
    opt.textContent = `${percent}%`;
    opt.selected = percent === currentZoom();
    zoomSelect.appendChild(opt);
  }
  zoomSelect.addEventListener("change", () => applyZoom(Number(zoomSelect.value)));

  // Device holds both initialization scopes and their confirmation. A question
  // focuses [Cancel], and a second click cannot confirm it.
  let active: "menu" | "reset" | "current" | "starting" | null = null;
  const deviceBox = el("span", { class: "chrome-device" });
  let drawDevice: () => void;
  const focusDevice = (): void => deviceBox.querySelector<HTMLButtonElement>(":scope > button")?.focus();
  let startingModel = modelId;
  const restart = async (how: "picked" | "reset" | "current", nextModel = modelId): Promise<void> => {
    if (active === "starting") return;
    const refocusModel = document.activeElement === modelSelect;
    active = "starting";
    startingModel = nextModel;
    modelSelect.disabled = true;
    drawDevice();
    if (!refocusModel) focusDevice();
    const retained = how === "picked" ? {} : {
      ...cardInSlot(store),
      ...(how === "current" ? sceneMemories(store) : {}),
    };
    const settled = how === "picked" ? await saving.settle() : "kept";
    await boot(nextModel, mount, how, retained, undefined, settled);
    if (refocusModel) mount.querySelector<HTMLSelectElement>('[aria-label="Unit model"]')?.focus();
  };
  const closeDevice = (): void => {
    if (active === "starting") return;
    active = null;
    drawDevice();
    focusDevice();
  };
  const confirmation = (
    kind: "reset" | "current",
    label: string,
    question: string,
    verb: string,
    apply: () => void,
  ): HTMLElement => {
    const box = el("span", { class: kind === "reset" ? "chrome-reset" : "chrome-current" });
    const asking = active === kind;
    const askedAt = performance.now();
    const ask = el("button", {
      class: "chrome-button",
      text: label,
      attrs: { role: "menuitem", tabindex: "-1", "data-operation": kind },
      onTap: () => {
        if (active !== "menu") return;
        active = kind;
        drawDevice();
      },
    });
    ask.hidden = active !== "menu";
    box.hidden = active !== "menu" && !asking;
    box.append(ask);
    if (asking) {
      box.append(el("span", {
        class: "chrome-reset-panel",
        attrs: { role: "group", "aria-label": question },
        children: [
          el("span", { class: "chrome-reset-ask", text: question }),
          el("button", { class: "chrome-button is-danger", text: verb, onTap: (ev) => {
            if (active !== kind) return;
            if (ev instanceof MouseEvent && (ev.detail > 1 || performance.now() - askedAt < CONFIRM_HOLD_MS)) return;
            apply();
          } }),
          el("button", { class: "chrome-button", text: "Cancel", onTap: closeDevice }),
        ],
      }));
    }
    return box;
  };
  drawDevice = (): void => {
    const trigger = el("button", {
      class: "chrome-select chrome-device-trigger",
      text: "Device",
      attrs: { "aria-haspopup": "menu", "aria-controls": "device-menu", "aria-expanded": String(active !== null && active !== "starting"), ...(active === "starting" ? { "aria-disabled": "true" } : {}) },
      onTap: () => {
        if (active === "starting") return;
        if (active !== null) closeDevice();
        else {
          active = "menu";
          drawDevice();
        }
      },
    });
    const popup = el("span", {
      class: active === "menu" ? "chrome-device-popup chrome-device-menu" : "chrome-device-popup",
      attrs: { id: "device-menu", ...(active === "menu" ? { role: "menu", "aria-label": "Device" } : {}) },
      children: [
        confirmation(
          "current", "Initialize Current Memories",
          model.hasSD
            ? "Initialize current memories? Scene memories and the microSD card will stay."
            : "Initialize current memories? Scene memories will stay.",
          "Initialize", () => void restart("current"),
        ),
        confirmation("reset", "Reset the unit", "Drop everything and start again?", "Reset", () => void restart("reset")),
      ],
    });
    popup.hidden = active === null || active === "starting";
    deviceBox.replaceChildren(trigger, popup);
    if (active === "menu") popup.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    else if (active === "reset" || active === "current") {
      [...popup.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Cancel")?.focus();
    }
  };
  deviceBox.addEventListener("keydown", (ev) => {
    if (ev.isComposing || active === "starting") return;
    if (ev.key === "Escape" && active !== null) {
      ev.preventDefault();
      ev.stopPropagation();
      closeDevice();
    } else if (active === null && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
      ev.preventDefault();
      active = "menu";
      drawDevice();
      if (ev.key === "ArrowUp") deviceBox.querySelector<HTMLElement>('.chrome-reset [role="menuitem"]')?.focus();
    } else if (active === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) {
      ev.preventDefault();
      const items = [...deviceBox.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : (index + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  });
  const dismissDevice = (ev: PointerEvent): void => {
    if (active !== "menu" || deviceBox.contains(ev.target as Node)) return;
    active = null;
    drawDevice();
  };
  document.addEventListener("pointerdown", dismissDevice);
  deviceBox.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (active !== "menu" || deviceBox.contains(document.activeElement)) return;
      active = null;
      drawDevice();
    });
  });
  drawDevice();

  const link = buildLinkIndicator(store);

  // A control of the chrome that holds the focus as the chrome is drawn again
  // hands it to the same control of the new one: a selector by its name, and
  // an initialization's confirmation to [Device].
  const focused = document.activeElement;
  const held = focused instanceof HTMLElement && mount.querySelector(".chrome")?.contains(focused) ? focused : null;
  mount.replaceChildren(
    el("header", {
      class: "chrome",
      children: [
        el("h1", { class: "chrome-title", text: "URX LCD Simulator" }),
        el("div", {
          class: "chrome-controls",
          children: [modelSelect, zoomSelect, deviceBox, link.root],
        }),
        notice,
      ],
    }),
    panel,
    el("footer", {
      class: "chrome-foot",
      children: [
        el("p", {
          text:
            "Touch the screen. Drag a value, turn the wheel over it, or use the arrow keys to change it. " +
            "Meters show a synthetic signal — the simulator carries no audio.",
        }),
        el("p", {
          text:
            "Unofficial, independent simulator, not affiliated with, sponsored by or endorsed by Yamaha. " +
            "YAMAHA, URX22, URX44 and URX44V are trademarks of Yamaha Corporation.",
        }),
      ],
    }),
  );
  if (held?.closest(".chrome-device")) focusDevice();
  else if (held) [modelSelect, zoomSelect].find((s) => s.getAttribute("aria-label") === held.getAttribute("aria-label"))?.focus();

  // The meters, the recorder's counter and the DATE / TIME clock are the things
  // on screen that move without an input event. They are refreshed in place
  // rather than by repainting, so a repaint never interrupts a knob drag or a
  // list's scroll.
  const stopMeters = startMeterTicker(store, shell.root);
  const stopClock = startRecorderClock(store, shell.root);
  const stopDateTime = startDateTimeClock(store, shell.root);
  // Tearing down drops a change still waiting to be stored, as [Reset the unit]
  // does; picking another model writes it first, and leaving the page leaves it
  // for the next start.
  disposeMounted = (): void => {
    saving.stop();
    offNotice();
    link.stop();
    document.removeEventListener("pointerdown", dismissDevice);
    stopMeters();
    stopClock();
    stopDateTime();
    shell.destroy();
    transport.close();
  };
}

// Leaving the page leaves a change still waiting for the next start to take in.
// A page the browser keeps to bring back on [Back] runs on as it was, and its
// next write lets go of what it left; a page let go is torn down.
window.addEventListener("pagehide", (ev) => {
  leaveMounted?.();
  if (!ev.persisted) disposeMounted?.();
});

const mount = document.getElementById("app");
if (mount) {
  applyZoom(requestedZoom());
  void openKept(keeper).then((opened) => {
    const last = modelOf(opened.shown);
    return boot(MODEL_IDS.find((id) => id === last) ?? "URX44V", mount, "opened", {}, opened);
  });
}
