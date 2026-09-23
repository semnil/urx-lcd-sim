// Entry point: build the store on a simulated device, mount the screen, and put
// the model selector and transport indicator in the surrounding chrome.
//
// The chrome is the simulator's own UI, not the unit's — it is deliberately
// outside the 480x272 frame so nothing on the LCD is something the hardware
// would not show.

import "./style/tokens.css";
import "./style/app.css";
import "./style/lcd.css";

import { forget, restore, startSaving } from "./app/persist";
import { Shell } from "./app/shell";
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

async function boot(modelId: ModelId, mount: HTMLElement): Promise<void> {
  disposeMounted?.();
  disposeMounted = null;
  const model = unitById(modelId);
  const store = new DeviceStore();
  const transport = new SimTransport(factoryState(model));
  await store.attach(transport);
  await restore(store, modelId);
  const stopSaving = startSaving(store, modelId);

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
  modelSelect.addEventListener("change", () => void boot(modelSelect.value as ModelId, mount));

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
  // screen. It asks in place first, since it drops everything the unit holds.
  const resetBox = el("span", { class: "chrome-reset" });
  const drawReset = (asking: boolean): void => {
    const ask = el("button", {
      class: "chrome-button",
      text: "Reset the unit",
      onTap: () => drawReset(true),
    });
    resetBox.replaceChildren(
      ...(asking
        ? [
            el("span", { class: "chrome-reset-ask", text: "Drop everything and start again?" }),
            el("button", { class: "chrome-button is-danger", text: "Reset", onTap: () => {
              forget();
              void boot(modelId, mount);
            } }),
            el("button", { class: "chrome-button", text: "Cancel", onTap: () => drawReset(false) }),
          ]
        : [ask]),
    );
    if (asking) resetBox.querySelector<HTMLElement>(".is-danger")?.focus();
  };
  drawReset(false);

  const link = el("span", {
    class: `chrome-link chrome-link-${store.kind}`,
    text: store.kind === "sim" ? "Simulated device" : "Connected unit",
  });

  mount.replaceChildren(
    el("header", {
      class: "chrome",
      children: [
        el("h1", { class: "chrome-title", text: "URX LCD Simulator" }),
        el("div", { class: "chrome-controls", children: [modelSelect, zoomSelect, resetBox, link] }),
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

  // The meters, the recorder's counter and the DATE / TIME clock are the things
  // on screen that move without an input event. They are refreshed in place
  // rather than by repainting, so a repaint never interrupts a knob drag or a
  // list's scroll.
  const stopMeters = startMeterTicker(store, shell.root);
  const stopClock = startRecorderClock(store, shell.root);
  const stopDateTime = startDateTimeClock(store, shell.root);
  disposeMounted = (): void => {
    stopSaving();
    stopMeters();
    stopClock();
    stopDateTime();
    shell.destroy();
    transport.close();
  };
}

window.addEventListener("beforeunload", () => disposeMounted?.());

const mount = document.getElementById("app");
if (mount) {
  applyZoom(requestedZoom());
  void boot("URX44V", mount);
}
