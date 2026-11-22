// SCENE LIST's follow of its selection, per unit. It stands apart from scene.ts so the shell
// can let go of a list it no longer draws without importing the screen.
import type { DeviceStore } from "../device/store";

/** What SCENE LIST knows of following its selection, per unit. */
export interface FollowState {
  /** The selection whose row the list has brought into view, or that a touch on the list made. */
  followed?: number;
  /** A follow a draw asked for that has not reached a list that could show it. */
  pending: boolean;
  /** The unit announced a selection of its own since the list last brought a row into view or was touched. */
  moved: boolean;
  /**
   * The touches on rows whose writes have not settled: the last row touched, and the rows the
   * touches stood on — the one selected before the first of them and each one touched — which a
   * refusal can put back.
   */
  tap?: { no: number; rows: Set<number> } | undefined;
  /** How many of those writes are out. */
  writes: number;
  /** The list last drawn, and the wait for it to have a height. */
  body?: HTMLElement | undefined;
  watch?: ResizeObserver | undefined;
}
export const follows = new WeakMap<DeviceStore, FollowState>();

/**
 * Stop waiting for a list that is no longer drawn: a draw of the next screen replaces it, and a
 * glass given up shows nothing more. A follow still owed stays owed, for the next SCENE LIST drawn.
 */
export function releaseSceneFollow(store: DeviceStore): void {
  const st = follows.get(store);
  if (!st) return;
  st.watch?.disconnect();
  st.watch = undefined;
  st.body = undefined;
}
