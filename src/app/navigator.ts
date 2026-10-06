// Screen navigation.
//
// The unit's toolbar has a back arrow and a home button, so the screens form a
// stack with HOME at the bottom. The back arrow pops one entry; the home button
// empties the stack. A screen is addressed by id plus an optional argument (the
// strip a dedicated channel screen is showing).

export interface Route {
  id: string;
  /** Strip id for the channel-scoped screens; unused elsewhere. */
  strip?: string;
}

/** How the stack moved: named by the method that moved it. */
export type RouteChange = "push" | "replace" | "back" | "home" | "openTop";

export type RouteListener = (route: Route, change: RouteChange) => void;

export class Navigator {
  private stack: Route[];
  private readonly listeners = new Set<RouteListener>();

  /** `above` is what stands over HOME from the start, the top of it the screen up. */
  constructor(home: Route = { id: "home" }, above: Route[] = []) {
    this.stack = [home, ...above];
  }

  get current(): Route {
    const top = this.stack[this.stack.length - 1];
    // The stack is seeded with home in the constructor and pop() refuses to
    // empty it, so this fallback is unreachable defensive cover for the type.
    return top ?? { id: "home" };
  }

  get depth(): number {
    return this.stack.length;
  }

  get canGoBack(): boolean {
    return this.stack.length > 1;
  }

  /** Open a screen on top of the current one. */
  push(route: Route): void {
    this.stack.push(route);
    this.emit("push");
  }

  /** Replace the top of the stack — used when a screen gives way to another in its place. */
  replace(route: Route): void {
    this.stack[this.stack.length - 1] = route;
    this.emit("replace");
  }

  /**
   * Put the screen on top, and every channel screen under it, onto `strip` —
   * what a channel screen's arrows do, so the screens under it come back on
   * the strip stepped to. A screen under it with no strip stays as it is.
   */
  stepStrip(strip: string): void {
    const top = this.stack.length - 1;
    this.stack = this.stack.map((route, i) => (i === top || route.strip !== undefined ? { ...route, strip } : route));
    this.emit("replace");
  }

  /** The toolbar's back arrow. Never empties the stack. */
  back(): void {
    if (!this.canGoBack) return;
    this.stack.pop();
    this.emit("back");
  }

  /** The toolbar's home button. */
  home(): void {
    const bottom = this.stack[0];
    this.stack = [bottom ?? { id: "home" }];
    this.emit("home");
  }

  /** Jump to a top-level screen: home plus that screen, so back returns home. */
  openTop(route: Route): void {
    const bottom = this.stack[0] ?? { id: "home" };
    this.stack = route.id === bottom.id ? [bottom] : [bottom, route];
    this.emit("openTop");
  }

  onChange(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: RouteChange): void {
    for (const l of [...this.listeners]) l(this.current, change);
  }
}
