// Entry point: build the store on a simulated device, mount the screen, and put
// the model selector and transport indicator in the surrounding chrome.
//
// The chrome is the simulator's own UI, not the unit's — it is deliberately
// outside the 480x272 frame so nothing on the LCD is something the hardware
// would not show.

import "./style/tokens.css";
import "./style/app.css";
import "./style/lcd.css";

import { cardInSlot, forget, keepModel, lastModel, restore, startSaving } from "./app/persist";
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
import { buildPanel } from "./ui/panel";

const MODEL_IDS: ModelId[] = ["URX44V", "URX44", "URX22"];

/** Display scale for the screen. 100 is the size the unit draws it at. */
const ZOOM_PERCENTS = [50, 75, 100, 150, 200] as const;
const DEFAULT_ZOOM = 100;

/** How long [Reset the unit]'s [Reset] does nothing after the question appears, longer than a double click. */
const RESET_HOLD_MS = 500;

/** What the chrome says while the browser does not take the unit. */
const UNKEPT_TEXT = "The browser is not keeping the unit: changes made now will not come back after a reload.";

/** What the chrome says once another tab has stored the unit and this one stores it no more. */
const ELSEWHERE_TEXT = "Another tab has stored the unit, so this tab no longer stores it: changes made here will not come back after a reload.";

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

/** Stores a change of the mounted unit still waiting to be stored. */
let flushMounted: (() => void) | null = null;

/** Start `modelId` in `mount`, with `card` (its paths and values) put back in the slot. */
async function boot(modelId: ModelId, mount: HTMLElement, card: Record<string, ParamValue> = {}): Promise<void> {
  disposeMounted?.();
  disposeMounted = null;
  flushMounted = null;
  keepModel(modelId);
  const model = unitById(modelId);
  const store = new DeviceStore();
  const transport = new SimTransport(factoryState(model));
  await store.attach(transport);
  await restore(store, modelId);
  // Stands under the chrome's controls while the browser refuses the unit, full
  // or blocked, and goes once a write is taken again. Once another tab has
  // stored the unit, it says so instead and stays until the unit starts again.
  const unkept = el("p", { class: "chrome-unkept", text: UNKEPT_TEXT, attrs: { role: "status" } });
  unkept.hidden = true;
  const saving = startSaving(
    store,
    modelId,
    undefined,
    (kept) => {
      unkept.hidden = kept;
    },
    () => {
      unkept.textContent = ELSEWHERE_TEXT;
      unkept.hidden = false;
    },
  );
  flushMounted = saving.flush;
  for (const [path, value] of Object.entries(card)) await store.restore(path, value);

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
  modelSelect.addEventListener("change", () => {
    saving.flush();
    void boot(modelSelect.value as ModelId, mount);
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

  // The unit as it ships, for a start from nothing: what the unit's own
  // Initialize All Memories does, on the simulator's chrome rather than a
  // screen. The card in the slot stays as it stands. It asks first, with the
  // focus on [Cancel], since it drops everything the unit holds, on a panel under
  // the button that moves nothing else on the page. [Cancel] and Escape on the
  // question take it back and leave the focus on [Reset the unit]. A click on
  // [Reset] does nothing for the second click of a double click, nor until
  // RESET_HOLD_MS after the question appears.
  const resetBox = el("span", { class: "chrome-reset" });
  let askedAt = 0;
  const drawReset = (asking: boolean, refocus = false): void => {
    const ask = el("button", {
      class: "chrome-button",
      text: "Reset the unit",
      attrs: { "aria-expanded": String(asking) },
      onTap: () => {
        if (!asking) drawReset(true);
      },
    });
    const cancel = el("button", { class: "chrome-button", text: "Cancel", onTap: () => drawReset(false, true) });
    if (asking) askedAt = performance.now();
    resetBox.replaceChildren(
      ask,
      ...(asking
        ? [
            el("span", {
              class: "chrome-reset-panel",
              children: [
                el("span", { class: "chrome-reset-ask", text: "Drop all but the card and start again?" }),
                el("button", { class: "chrome-button is-danger", text: "Reset", onTap: (ev) => {
                  if (ev instanceof MouseEvent && (ev.detail > 1 || performance.now() - askedAt < RESET_HOLD_MS)) return;
                  const card = cardInSlot(store);
                  forget();
                  void boot(modelId, mount, card);
                } }),
                cancel,
              ],
            }),
          ]
        : []),
    );
    if (asking) cancel.focus();
    else if (refocus) ask.focus();
  };
  resetBox.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || ev.isComposing || !resetBox.querySelector(".chrome-reset-ask")) return;
    ev.preventDefault();
    drawReset(false, true);
  });
  drawReset(false);

  const link = el("span", {
    class: `chrome-link chrome-link-${store.kind}`,
    text: store.kind === "sim" ? "Simulated device" : "Connected unit",
  });

  // A control of the chrome that holds the focus as the chrome is drawn again
  // hands it to the same control of the new one: a selector by its name, and
  // [Reset] of the question to [Reset the unit].
  const focused = document.activeElement;
  const held = focused instanceof HTMLElement && mount.querySelector(".chrome")?.contains(focused) ? focused : null;
  mount.replaceChildren(
    el("header", {
      class: "chrome",
      children: [
        el("h1", { class: "chrome-title", text: "URX LCD Simulator" }),
        el("div", { class: "chrome-controls", children: [modelSelect, zoomSelect, resetBox, link] }),
        unkept,
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
  if (held?.closest(".chrome-reset")) resetBox.querySelector("button")?.focus();
  else if (held) [modelSelect, zoomSelect].find((s) => s.getAttribute("aria-label") === held.getAttribute("aria-label"))?.focus();

  // The meters, the recorder's counter and the DATE / TIME clock are the things
  // on screen that move without an input event. They are refreshed in place
  // rather than by repainting, so a repaint never interrupts a knob drag or a
  // list's scroll.
  const stopMeters = startMeterTicker(store, shell.root);
  const stopClock = startRecorderClock(store, shell.root);
  const stopDateTime = startDateTimeClock(store, shell.root);
  // Tearing down drops a change still waiting to be stored, as [Reset the unit]
  // does; leaving the page and picking another model store it first.
  disposeMounted = (): void => {
    saving.stop();
    stopMeters();
    stopClock();
    stopDateTime();
    shell.destroy();
    transport.close();
  };
}

// Leaving the page stores a change still waiting. A page the browser keeps to
// bring back on [Back] runs on as it was; a page let go is torn down.
window.addEventListener("pagehide", (ev) => {
  flushMounted?.();
  if (!ev.persisted) disposeMounted?.();
});

const mount = document.getElementById("app");
if (mount) {
  applyZoom(requestedZoom());
  const last = lastModel();
  void boot(MODEL_IDS.find((id) => id === last) ?? "URX44V", mount);
}
