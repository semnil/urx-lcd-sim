import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";

/** What a screen hands back for the shell to place inside the 480x272 frame. */
export interface ScreenBody {
  /** The main area. */
  main: HTMLElement;
  /**
   * Side-menu entries down the right edge. The HOME screen puts [Sends] and the
   * STEREO/CUE meter here; SETUP-family screens put their menu tabs here.
   */
  side?: HTMLElement[];
  /** What the screen puts at the left of the toolbar (scene box, channel selector). */
  headerLeft?: HTMLElement;
  /** What the screen puts in the middle of the toolbar, in place of a title. */
  headerCenter?: HTMLElement;
  /** What the screen puts in the toolbar just left of the shell's icon row. */
  headerRight?: HTMLElement;
}

export interface ScreenDef {
  id: string;
  /** Centred toolbar caption, e.g. "SETUP", "MONITOR", "SCENE LIST". */
  title?(ctx: AppContext, route: Route): string;
  /**
   * "home" shows the full icon row (SETUP / microSD / MONITOR / HOME); "sub"
   * shows the home button, and the back arrow where there is a screen under
   * this one to step back to.
   */
  toolbar: "home" | "sub";
  /** Whether the toolbar carries the channel-bank button. */
  bankButton?: boolean;
  /**
   * Whether the shell draws its own ways off the screen: the toolbar's back and
   * HOME icons. A screen that sets this false is left through its own controls,
   * or by a tap on the bare screen around it.
   */
  shellExits?: boolean;
  /**
   * Whether the USER DEFINED KNOBS toggle stands at the foot of the side rail.
   * The three screens the toolbar icons open — SETUP, microSD and MONITOR —
   * leave it out; the screens under them carry it.
   */
  knobToggle?: boolean;
  /**
   * Whether the side rail starts directly under the toolbar. Most screens leave
   * 6px more above the first tab.
   */
  sideAtTop?: boolean;
  /**
   * Whether the screen is a sheet over the one below it. The shell darkens
   * everything outside the main area, leaving the control the screen marks
   * `is-lit` — the button the sheet was opened from — at full strength. The
   * toolbar's icons show through even where `shellExits` is false; there, every
   * control under the dark but the lit one is inert, and a touch on it is a
   * touch on the bare screen.
   */
  dimsBehind?: boolean;
  /**
   * Whether the four-cell knob readout strip is drawn along the bottom. Left
   * unset it follows the knobs: the strip appears once the screen assigns one.
   * `false` suppresses it even so — the HOME (Overview) screen binds the knobs
   * to the four send levels and prints each value on its own strip instead.
   * `true` draws it with its cells empty on a screen that assigns nothing.
   */
  knobStrip?: boolean;
  /**
   * Whether the screen works on the card in the slot. With no card there the
   * shell opens the microSD screen in its place.
   */
  needsCard?: boolean;
  build(ctx: AppContext, route: Route): ScreenBody;
}

export class ScreenRegistry {
  private readonly screens = new Map<string, ScreenDef>();

  register(...defs: ScreenDef[]): this {
    for (const d of defs) this.screens.set(d.id, d);
    return this;
  }

  get(id: string): ScreenDef | undefined {
    return this.screens.get(id);
  }

  ids(): string[] {
    return [...this.screens.keys()];
  }
}
