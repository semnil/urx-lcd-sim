// The chrome's indicator of what the screen drives: the simulated device, or a
// unit connected through a BridgeTransport.

import type { DeviceStore } from "../device/store";
import { el } from "./dom";

/**
 * The indicator for the transport `store` is on, read again on every change to
 * the store, and the step that stops it following.
 */
export function buildLinkIndicator(store: DeviceStore): { root: HTMLElement; stop: () => void } {
  const root = el("span");
  const draw = (): void => {
    root.className = `chrome-link chrome-link-${store.kind}`;
    root.textContent = store.kind === "sim" ? "Simulated device" : "Connected unit";
  };
  draw();
  const off = store.onChange(draw);
  return { root, stop: () => void off() };
}
