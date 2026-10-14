// The glass embedded in another page.
//
// The page hands in the unit (src/device/unit.ts) and the model; this mounts the
// 480x272 glass in a shadow tree under one element and nothing around it: no
// unit model or display scale selector, no Device menu, no link indicator, and
// nothing stored in the browser. The page's rules do not reach inside the shadow
// tree and the glass's do not reach out of it (src/embed-css.ts), and the glass
// takes no key pressed with nothing focused, so the page's own rules and keys
// stay the page's. The page can hold controls shut, each with its reason
// (src/ui/locks.ts).

import tokensCss from "./style/tokens.css?inline";
import lcdCss from "./style/lcd.css?inline";
import { Shell } from "./app/shell";
import { useUnit } from "./app/unit";
import type { ParamPath, ParamValue } from "./device/path";
import { DeviceStore } from "./device/store";
import type { WriteFailure } from "./device/store";
import type { Unit } from "./device/unit";
import { factoryState } from "./model/defaults";
import type { ModelId } from "./model/types";
import { unitById } from "./model/units";
import { buildRegistry } from "./screens";
import { startDateTimeClock } from "./screens/date-time";
import { startMeterTicker } from "./screens/meters";
import { startRecorderClock } from "./screens/recording";
import { GLASS_ROOT } from "./ui/widgets";
import { buildPanel } from "./ui/panel";
import type { SimLock } from "./ui/locks";
import { type EmbeddedStylesheet, type FontUrls, embedStylesheet } from "./embed-css";

export type { FontUrls } from "./embed-css";
export type { CardFile, LevelReader, SceneBank, Unit, UnitAction, UnitActions, UnitClock, UnitLevels, UnitOp } from "./device/unit";
export { computerClock, refusedActions } from "./device/unit";
export type { DeviceTransport, Notify } from "./device/transport";
export type { ParamPath, ParamValue } from "./device/path";
export type { ModelId } from "./model/types";
export type { LockTarget, SimLock } from "./ui/locks";

/** The class the element the glass stands on in the page carries; the glass is drawn in its shadow tree. */
export const ROOT_CLASS = "urx-lcd-sim";

/** Display scales the glass is drawn at, in percent. 100 is the size the unit draws it at, doubled. */
export const ZOOM_PERCENTS = [50, 75, 100, 150, 200] as const;
export type ZoomPercent = (typeof ZOOM_PERCENTS)[number];

export interface EmbedOptions {
  model: ModelId;
  unit: Unit;
  /** The URL of each font file the stylesheet names under `/fonts/`; a file not named loads from `/fonts/`. */
  fonts?: FontUrls;
  /** The display scale the glass starts at. 100 by default. */
  zoom?: ZoomPercent;
  /** A write the unit refused, after the glass has put the value back. */
  onWriteFailure?: (failure: WriteFailure) => void;
  /** The controls the glass draws held shut from its first paint. None by default. */
  locks?: readonly SimLock[];
  /**
   * Whether an insert effect's values, as one is chosen, come from the page: the glass writes the effect
   * and its switch and shows the values the unit answers with. False by default, where the glass fills
   * them with the effect's own settings.
   */
  insertValuesFromPage?: boolean;
}

export interface EmbeddedSim {
  /** The element the glass stands on in the page, carrying ROOT_CLASS; the glass is drawn in its shadow tree. */
  readonly root: HTMLElement;
  readonly store: DeviceStore;
  setZoom(percent: ZoomPercent): void;
  /**
   * Hold `locks` shut and nothing else, and draw the glass again under them. A
   * control whose value, screen or operation is held is drawn out of reach with
   * a padlock at its top right corner and the lock's reason as its tooltip and
   * its description, and does nothing however it is touched, turned or keyed.
   */
  setLocks(locks: readonly SimLock[]): void;
  /** Take the glass out of the page and let the unit go, closing its values' transport. */
  dispose(): void;
}

let styleUsers = 0;
let styleNode: HTMLStyleElement | null = null;

/** The stylesheet split for the page and for the shadow tree, made for the fonts the first glass was mounted with. */
function stylesheet(fonts: FontUrls): EmbeddedStylesheet {
  return embedStylesheet(`${tokensCss}\n${lcdCss}`, GLASS_ROOT, fonts);
}

/** Put the page's half of the stylesheet — the fonts and the registered properties — on the page while any glass is mounted. Returns the release. */
function holdStylesheet(sheets: EmbeddedStylesheet): () => void {
  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.dataset[ROOT_CLASS.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = "";
    styleNode.textContent = sheets.page;
    document.head.appendChild(styleNode);
  }
  styleUsers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--styleUsers === 0) {
      styleNode?.remove();
      styleNode = null;
    }
  };
}

/** Mount the glass of `options.model` at the end of `host`, reading and writing through `options.unit`. */
export async function mountSim(host: HTMLElement, options: EmbedOptions): Promise<EmbeddedSim> {
  const sheets = stylesheet(options.fonts ?? {});
  const releaseStyle = holdStylesheet(sheets);
  const model = unitById(options.model);
  const store = new DeviceStore();
  try {
    await store.attach(options.unit.params);
  } catch (err) {
    releaseStyle();
    throw err;
  }
  const offFailure = options.onWriteFailure ? store.onWriteFailure(options.onWriteFailure) : () => undefined;
  // Ahead of the first screen, so the screen draws the unit's meters and clock from its first paint.
  const releaseUnit = useUnit(options.unit);
  const shell = new Shell(buildRegistry(), store, model, [], {
    actions: options.unit.actions,
    ownsDocument: false,
    ...(options.locks ? { locks: options.locks } : {}),
    ...(options.insertValuesFromPage ? { insertValuesFromPage: true } : {}),
  });
  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = sheets.shadow;
  const glass = document.createElement("div");
  glass.className = GLASS_ROOT;
  const setZoom = (percent: ZoomPercent): void => glass.style.setProperty("--zoom", String(percent / 100));
  setZoom(options.zoom ?? 100);
  glass.appendChild(buildPanel(shell));
  shadow.append(style, glass);
  host.appendChild(root);
  const stopMeters = startMeterTicker(store, shell.root);
  const stopClock = startRecorderClock(store, shell.root, shell.ctx.actions);
  const stopDateTime = startDateTimeClock(store, shell.root);
  let disposed = false;
  return {
    root,
    store,
    setZoom,
    setLocks: (locks) => shell.setLocks(locks),
    dispose() {
      if (disposed) return;
      disposed = true;
      stopMeters();
      stopClock();
      stopDateTime();
      releaseUnit();
      offFailure();
      shell.destroy();
      options.unit.params.close();
      root.remove();
      releaseStyle();
    },
  };
}

/** The values the unit of `model` holds as it ships, by path: every path the glass reads and writes. */
export function shippedValues(model: ModelId): Map<ParamPath, ParamValue> {
  return factoryState(unitById(model));
}
