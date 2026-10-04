// Entry point: build the store on a simulated device, mount the screen, and put
// the model selector and transport indicator in the surrounding chrome.
//
// The chrome is the simulator's own UI, not the unit's — it is deliberately
// outside the 480x272 frame so nothing on the LCD is something the hardware
// would not show.

import "./style/tokens.css";
import "./style/app.css";
import "./style/lcd.css";

import { cardInSlot, modelOf, openKeeper, openKept, restore, type Settled, startSaving, type Opened } from "./app/persist";
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

/** How long [Reset the unit]'s [Reset] does nothing after the question appears, longer than a double click. */
const RESET_HOLD_MS = 500;

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
 * (`opened`), on a model `"picked"`, or on [Reset the unit] (`"reset"`) with
 * `card` (its paths and values) put back in the slot.
 */
async function boot(
  modelId: ModelId,
  mount: HTMLElement,
  how: "opened" | "picked" | "reset" = "opened",
  card: Record<string, ParamValue> = {},
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
  // A reset starts from the unit as it ships, and stores it with the card at once.
  if (how !== "reset") await restore(store, modelId, carries ? shown : kept);
  for (const [path, value] of Object.entries(card)) await store.restore(path, value);
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
      ...(how === "reset" ? { first: "unit" } : how === "picked" ? { first: "model" } : {}),
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
    void saving.settle().then((settled) => boot(modelSelect.value as ModelId, mount, "picked", {}, undefined, settled));
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
                el("span", { class: "chrome-reset-ask", text: "Drop everything and start again?" }),
                el("button", { class: "chrome-button is-danger", text: "Reset", onTap: (ev) => {
                  if (ev instanceof MouseEvent && (ev.detail > 1 || performance.now() - askedAt < RESET_HOLD_MS)) return;
                  void boot(modelId, mount, "reset", cardInSlot(store));
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

  const link = buildLinkIndicator(store);

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
        el("div", { class: "chrome-controls", children: [modelSelect, zoomSelect, resetBox, link.root] }),
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
  // does; picking another model writes it first, and leaving the page leaves it
  // for the next start.
  disposeMounted = (): void => {
    saving.stop();
    offNotice();
    link.stop();
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
