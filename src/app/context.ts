// What every screen is handed: the values, the unit's shape, the focus, and the
// way to move between screens.

import type { DeviceStore } from "../device/store";
import type { UnitModel } from "../model/types";
import type { FocusController } from "../ui/focus";
import type { NumericSpec } from "../ui/param-spec";
import type { Navigator } from "./navigator";

export interface AppContext {
  store: DeviceStore;
  model: UnitModel;
  focus: FocusController;
  nav: Navigator;
  /** Rebuild the current screen. Screens call this after a state change. */
  repaint(): void;
  /**
   * Bind the four multi-function knobs for the screen being built. A screen
   * that declares nothing leaves the strip empty, which is what the unit shows
   * on screens with no knob-controlled parameters.
   */
  setKnobs(specs: (NumericSpec | null)[]): void;
  /**
   * Put an element over the whole screen — a dialog box or a popup menu. It is
   * mounted inside the 480x272 frame, so it covers the glass and nothing else,
   * and it survives repaints until the returned closer is called. `onClose`
   * runs with it, whether the caller closes it or the screen it belongs to
   * goes away under it.
   */
  overlay(node: HTMLElement, onClose?: () => void): () => void;
}
