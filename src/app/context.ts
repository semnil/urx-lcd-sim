// What every screen is handed: the values, the unit's shape, the focus, and the
// way to move between screens.

import type { DeviceStore } from "../device/store";
import type { UnitActions } from "../device/unit";
import type { UnitModel } from "../model/types";
import type { FocusController } from "../ui/focus";
import type { Locks } from "../ui/locks";
import type { NumericSpec } from "../ui/param-spec";
import type { Navigator } from "./navigator";

export interface AppContext {
  store: DeviceStore;
  model: UnitModel;
  focus: FocusController;
  nav: Navigator;
  /** The operations the unit carries out on its memory, card and recorder. */
  actions: UnitActions;
  /** What the page the glass is embedded in holds shut (src/ui/locks.ts); nothing on a page of its own. */
  locks: Locks;
  /**
   * Whether the values of an insert effect, as one is chosen, come from the page the glass is embedded
   * in: the glass then writes the effect and its switch, and the values are what the page answers.
   * On a page of its own the glass fills them with the effect's own settings.
   */
  insertValuesFromPage?: boolean;
  /** Rebuild the current screen. Screens call this after a state change. */
  repaint(): void;
  /**
   * Bind the four multi-function knobs for the screen being built. A screen
   * that declares nothing leaves the strip empty, which is what the unit shows
   * on screens with no knob-controlled parameters. A readout names a control
   * and prints a word in its division, and its knob turns nothing.
   */
  setKnobs(specs: (NumericSpec | KnobReadout | null)[]): void;
  /** Put the readout bar back on its first page, as a change of screen does. */
  rewindKnobs(): void;
  /**
   * Put an element over the whole screen — a dialog box or a popup menu. It is
   * mounted inside the 480x272 frame, so it covers the glass and nothing else,
   * and it survives repaints until the returned closer is called. `onClose`
   * runs with it, whether the caller closes it or the screen it belongs to
   * goes away under it.
   */
  overlay(node: HTMLElement, onClose?: () => void): () => void;
}

/** A division of the readout bar that shows a word over a control's name and turns nothing. */
export interface KnobReadout {
  label: string;
  text: string;
}
