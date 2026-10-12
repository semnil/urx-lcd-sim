// The glass embedded in another page.
//
// The page hands in the unit (src/device/unit.ts) and the model; this mounts the
// 480x272 glass under one root element and nothing around it: no unit model or
// display scale selector, no Device menu, no link indicator, and nothing stored
// in the browser. The stylesheet is closed under the root (src/embed-css.ts) and
// the glass takes no key pressed with nothing focused, so the page's own rules
// and keys stay the page's.

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
import { EMBED_ROOT } from "./ui/widgets";
import { buildPanel } from "./ui/panel";
import { type FontUrls, scopeStylesheet } from "./embed-css";

export type { FontUrls } from "./embed-css";
export type { CardFile, LevelReader, SceneBank, Unit, UnitAction, UnitActions, UnitClock, UnitLevels, UnitOp } from "./device/unit";
export { computerClock, refusedActions } from "./device/unit";
export type { DeviceTransport, Notify } from "./device/transport";
export type { ParamPath, ParamValue } from "./device/path";
export type { ModelId } from "./model/types";

/** The class the embedded glass's root carries, which its stylesheet is scoped to. */
export const ROOT_CLASS = EMBED_ROOT;

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
}

export interface EmbeddedSim {
  /** The glass's root element, carrying ROOT_CLASS. */
  readonly root: HTMLElement;
  readonly store: DeviceStore;
  setZoom(percent: ZoomPercent): void;
  /** Take the glass out of the page and let the unit go, closing its values' transport. */
  dispose(): void;
}

let styleUsers = 0;
let styleNode: HTMLStyleElement | null = null;

/** Put the scoped stylesheet on the page while any glass is mounted. Returns the release. */
function holdStylesheet(fonts: FontUrls): () => void {
  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.dataset[EMBED_ROOT.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = "";
    styleNode.textContent = scopeStylesheet(`${tokensCss}\n${lcdCss}`, EMBED_ROOT, fonts);
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
  const releaseStyle = holdStylesheet(options.fonts ?? {});
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
  const shell = new Shell(buildRegistry(), store, model, [], { actions: options.unit.actions, ownsDocument: false });
  const root = document.createElement("div");
  root.className = EMBED_ROOT;
  const setZoom = (percent: ZoomPercent): void => root.style.setProperty("--zoom", String(percent / 100));
  setZoom(options.zoom ?? 100);
  root.appendChild(buildPanel(shell));
  host.appendChild(root);
  const stopMeters = startMeterTicker(store, shell.root);
  const stopClock = startRecorderClock(store, shell.root, shell.ctx.actions);
  const stopDateTime = startDateTimeClock(store, shell.root);
  let disposed = false;
  return {
    root,
    store,
    setZoom,
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
