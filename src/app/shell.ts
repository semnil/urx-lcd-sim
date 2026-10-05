// The 480x272 frame: toolbar band, main area, side menu, multi-function knob
// strip. Everything a screen does not draw itself lives here, because the unit
// keeps these in place across screen changes.

import { clamp, combineWriteRules } from "../device/store";
import type { DeviceStore } from "../device/store";
import type { UnitModel } from "../model/types";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkPath } from "../model/udk";
import { INTERACTIVE, clear, el, setPressed, tappedControl } from "../ui/dom";
import { FocusController } from "../ui/focus";
import { Icons } from "../ui/icons";
import { attachFocusRing } from "../ui/focus-ring";
import type { Press } from "../ui/press";
import { attachPress } from "../ui/press";
import { PointerHolds, attachSpin, modalOf, setAriaValue, standsStill } from "../ui/widgets";
import type { Modal } from "../ui/widgets";
import type { NumericSpec } from "../ui/param-spec";
import { BRIGHTNESS_MAX, formatValue } from "../ui/param-spec";
import type { ScreenBody, ScreenRegistry } from "../screens/types";
import { holdsFile, recordMode } from "../screens/recording";
import { drawAtOneMoment } from "../screens/signal-flow";
import { dateDraftWriteRule } from "../screens/date-time";
import { hiZWriteRule } from "../screens/head-amp";
import { delaySyncWriteRule } from "../model/effects";
import { eqOneKnobWriteRule } from "../screens/channel";
import { pairWriteRule } from "../screens/stereo-link";
import { panLinkWriteRule } from "../screens/mix-bus";
import { screenOnly } from "../screens/screen-only";
import { bankSide, bankTotal, currentBank, stepBank } from "../screens/strip-state";
import type { AppContext, KnobReadout } from "./context";
import { Navigator } from "./navigator";
import type { RouteChange } from "./navigator";
import { scrimFilter } from "../ui/scrim";

/** Divisions the multi-function readout bar has. */
const KNOB_CELLS = 4;

/** How much black the glass carries at the bottom of the brightness range. */
const DIMMEST = 0.7;

export class Shell {
  readonly ctx: AppContext;
  readonly root: HTMLElement;

  private readonly lcd: HTMLElement;
  private readonly toolbarNode: HTMLElement;
  private readonly mainNode: HTMLElement;
  private readonly sideNode: HTMLElement;
  private readonly knobStripNode: HTMLElement;
  private readonly dimNode: HTMLElement;
  private knobs: (NumericSpec | KnobReadout | null)[] = [];
  /** Which four of them the readout bar is showing. */
  private knobPage = 0;
  private repaintScheduled = false;
  /** The screen the glass last drew. */
  private drawn: string | null = null;
  /** The strip of the screen the glass last drew. */
  private drawnStrip: string | undefined;
  /** How the stack has moved since the glass last drew. */
  private moves: RouteChange[] = [];
  /** What is layered over the screen, by its closer and bottom first, so nothing is dropped unclosed. */
  private readonly overlays = new Map<() => void, { node: HTMLElement; modal: Modal | undefined }>();
  private readonly onTab: (ev: KeyboardEvent) => void;
  private readonly onEscape: (ev: KeyboardEvent) => void;
  private readonly offStore: () => void;
  private readonly offWriteRule: () => void;
  private readonly offScreenOnly: () => void;
  private readonly press: Press;
  private readonly offFocusRing: () => void;
  private readonly offSwipe: () => void;

  constructor(
    private readonly registry: ScreenRegistry,
    store: DeviceStore,
    model: UnitModel,
  ) {
    const nav = new Navigator({ id: "home" });
    const focus = new FocusController();
    this.ctx = {
      store,
      model,
      focus,
      nav,
      repaint: () => this.scheduleRepaint(),
      setKnobs: (specs) => {
        this.knobs = specs;
      },
      rewindKnobs: () => {
        this.knobPage = 0;
        this.scheduleRepaint();
      },
      overlay: (node, onClose) => {
        // Marked so the Escape handler knows something is layered over the screen.
        node.dataset["overlay"] = "";
        // The control whose touch or key put it up, or else where the focus stood when it went up.
        const tapped = tappedControl();
        const opener = tapped?.isConnected === true ? tapped : document.activeElement;
        const refocus = this.focusPlace(opener);
        this.lcd.appendChild(node);
        const close = (): void => {
          if (!this.overlays.delete(close)) return;
          node.remove();
          this.shutBehind();
          focus.sweep(this.lcd);
          onClose?.();
          // A focus it leaves on nothing goes back there, or to the control drawn in that place since.
          if (document.activeElement && document.activeElement !== document.body) return;
          if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
          else refocus();
        };
        const modal = modalOf(node);
        if (modal) modal.close = close;
        this.overlays.set(close, { node, modal });
        this.shutBehind();
        return close;
      },
    };

    this.toolbarNode = el("div", { class: "toolbar", attrs: { role: "toolbar" } });
    this.mainNode = el("div", { class: "main" });
    this.sideNode = el("div", { class: "side" });
    this.knobStripNode = el("div", { class: "knob-strip" });
    this.dimNode = el("div", { class: "lcd-dim", attrs: { "aria-hidden": "true" } });
    this.lcd = el("div", {
      class: "lcd",
      attrs: { role: "application", "aria-label": `${model.id} LCD` },
      children: [this.toolbarNode, this.mainNode, this.sideNode, this.knobStripNode, this.dimNode, scrimFilter()],
    });
    this.root = this.lcd;

    nav.onChange((route, change) => {
      this.moves.push(change);
      focus.release();
      this.knobPage = 0;
      // USER DEFINED KNOBS mode goes off on every jump to a top-level screen, on a
      // step back onto a screen drawn without its toggle, and on the way into the
      // channel-bank list; every other move keeps it.
      const off =
        change === "openTop" ||
        (change === "back" && this.registry.get(route.id)?.knobToggle === false) ||
        (change === "push" && route.id === "bank-select");
      if (off) void store.set("ui.userDefinedKnobs", false);
      // A list or a dialog belongs to the screen that opened it.
      this.closeOverlays();
      this.scheduleRepaint();
    });
    this.offStore = store.onChange(() => this.scheduleRepaint());
    // A linked pair holds one set of values, so an edit to one of its channels
    // carries onto the other, the DATE / TIME popup keeps its day inside the
    // month it holds, HI-Z brings its connector's A.Gain down to what it
    // reaches, a delay's Sync sets its time from the note and the tempo,
    // 1-knob EQ sets the four bands from its curve and level, and Pan Link
    // puts each send into its bus where the send's source is.
    // They are installed here because every screen and every gesture
    // reaches the store through this one context.
    this.offWriteRule = store.setWriteRule(
      combineWriteRules(
        pairWriteRule(store, model),
        dateDraftWriteRule(store),
        hiZWriteRule(store),
        delaySyncWriteRule(store),
        eqOneKnobWriteRule(store),
        panLinkWriteRule({ store, model }),
      ),
    );
    this.offScreenOnly = store.setScreenOnly(screenOnly);
    this.offSwipe = this.attachSwipe();
    this.attachBackdrop();
    this.press = attachPress(this.lcd);
    this.offFocusRing = attachFocusRing(this.lcd);
    this.onTab = this.buildTabTrap();
    window.addEventListener("keydown", this.onTab);
    this.onEscape = this.buildEscapeHandler();
    window.addEventListener("keydown", this.onEscape);
    this.render();
  }

  /** Give up the window and anything layered over the screen. */
  destroy(): void {
    window.removeEventListener("keydown", this.onTab);
    window.removeEventListener("keydown", this.onEscape);
    this.offStore();
    this.offWriteRule();
    this.offScreenOnly();
    this.press.off();
    this.offFocusRing();
    this.offSwipe();
    this.closeOverlays();
  }

  private closeOverlays(): void {
    for (const close of [...this.overlays.keys()]) close();
  }

  /** The layer over the screen that is on top, if anything is. */
  private topLayer(): { node: HTMLElement; modal: Modal | undefined } | undefined {
    return [...this.overlays.values()].at(-1);
  }

  /** The screen behind a modal takes no keys and no pointer while one is up. */
  private shutBehind(): void {
    const shut = [...this.overlays.values()].some((layer) => layer.modal !== undefined);
    for (const node of [this.toolbarNode, this.mainNode, this.sideNode, this.knobStripNode]) node.toggleAttribute("inert", shut);
  }

  private scheduleRepaint(): void {
    if (this.repaintScheduled) return;
    this.repaintScheduled = true;
    queueMicrotask(() => {
      this.repaintScheduled = false;
      this.render();
    });
  }

  render(): void {
    const route = this.ctx.nav.current;
    const def = this.registry.get(route.id);
    if (def?.needsCard === true && !this.ctx.store.bool("sd.mounted", true)) {
      this.ctx.nav.openTop({ id: "microsd" });
      return;
    }
    const refocus = this.focusPlace();
    // The same screen of the same strip drawn again keeps down what is held down.
    const repress = this.drawn === route.id && this.drawnStrip === route.strip ? this.press.carry() : () => undefined;
    const rescroll = this.scrollPlace();
    this.dim();
    this.drawn = route.id;
    // Which screen is up, for a test driving the page from outside.
    this.lcd.dataset["screen"] = route.id;
    this.moves = [];
    this.drawnStrip = route.strip;
    this.knobs = [];
    clear(this.mainNode);
    clear(this.sideNode);
    clear(this.toolbarNode);
    clear(this.knobStripNode);
    this.ctx.focus.sweep(this.lcd);

    if (!def) {
      this.mainNode.appendChild(el("p", { class: "screen-missing", text: `No screen registered for "${route.id}"` }));
      return;
    }

    const body = drawAtOneMoment(() => def.build(this.ctx, route));
    this.mainNode.appendChild(body.main);
    // USER DEFINED KNOBS mode replaces the readout strip with the bank
    // assignments, so it shows even where the screen suppresses the normal one.
    const udkMode = this.ctx.store.bool("ui.userDefinedKnobs", false);
    const ownStrip = body.knobStrip ?? def.knobStrip ?? this.knobs.some(Boolean);
    const showStrip = udkMode || ownStrip;
    this.lcd.classList.toggle("has-knobs", showStrip);
    this.lcd.classList.toggle("has-readout", ownStrip);
    this.lcd.classList.toggle("is-udk", udkMode);
    this.lcd.classList.toggle("is-dimmed", def.dimsBehind === true);
    this.lcd.classList.toggle("side-at-top", def.sideAtTop === true);
    const exits = def.shellExits !== false;
    // The main area gives up the side rail only to a screen that fills it: the
    // captures show a channel view running the whole width of the glass.
    const side = body.side ?? [];
    this.lcd.classList.toggle("has-side", side.length > 0);
    for (const s of side) this.sideNode.appendChild(s);
    if (def.knobToggle !== false) this.sideNode.appendChild(this.buildKnobToggle(udkMode));
    // Names the screen on the bar, for the rules a single screen's title takes.
    this.toolbarNode.dataset.screen = route.id;
    const dims = def.dimsBehind === true;
    this.buildToolbar(def.toolbar, def.title?.(this.ctx, route), body, def.bankButton === true, exits || dims);
    if (showStrip) this.buildKnobStrip(udkMode);
    if (dims && !exits) {
      for (const node of [this.toolbarNode, this.sideNode]) {
        for (const control of node.querySelectorAll(INTERACTIVE)) {
          if (!control.classList.contains("is-lit")) control.toggleAttribute("inert", true);
        }
      }
    }
    // A sheet over the screen, one that darkens it or one that takes the whole
    // glass, holds the knob bar under it out of reach: its knobs turn nothing
    // until the sheet goes.
    if (dims || body.main.classList.contains("pick-dialog")) {
      for (const control of this.knobStripNode.querySelectorAll(INTERACTIVE)) control.toggleAttribute("inert", true);
    }
    repress();
    rescroll();
    refocus();
  }

  /**
   * The step that puts each list carrying `data-scroll-keep` back where the list
   * of the same mark was scrolled before the redraw. A list whose mark no list
   * carried before the redraw starts from its top.
   */
  private scrollPlace(): () => void {
    const lists = (): HTMLElement[] => [...this.mainNode.querySelectorAll<HTMLElement>("[data-scroll-keep]")];
    const was = new Map(lists().map((node) => [node.dataset.scrollKeep, node.scrollTop]));
    return () => {
      for (const node of lists()) {
        const top = was.get(node.dataset.scrollKeep);
        if (top !== undefined) node.scrollTop = top;
      }
    };
  }

  /**
   * The step that puts the page's focus back on the control it stood on once the
   * same screen is drawn again: the control of the same kind at the same place, or
   * else the one control of that kind with the same words, or else, for a page step,
   * the one step the other way, or else the control that now stands at that place.
   * A screen put in place of this one takes the focus onto its one control of the
   * same kind and name, or else, for a page step, its one step the other way. Any
   * other screen leaves the focus where the rebuild left it. The control it starts
   * from is `active`, the one holding the focus unless another is named.
   */
  private focusPlace(active: Element | null = document.activeElement): () => void {
    if (!active || active === this.root || !this.root.contains(active)) return () => undefined;
    // A control's kind is its tag and its classes, less the ones naming its state.
    const kind = (node: Element): string => [node.tagName, ...[...node.classList].filter((c) => !c.startsWith("is-"))].join(" ");
    const was = kind(active);
    // A page step carries its way in its classes, as `-prev` or `-next`.
    const turned = was.replace(/-(prev|next)\b/g, (_step, way: string) => (way === "prev" ? "-next" : "-prev"));
    const otherWay = (): Element | undefined => {
      if (turned === was) return undefined;
      const steps = [...this.root.querySelectorAll(active.tagName)].filter((n) => kind(n) === turned);
      return steps.length === 1 ? steps[0] : undefined;
    };
    if (this.drawn !== this.ctx.nav.current.id) {
      if (this.moves.length === 0 || this.moves.some((move) => move !== "replace")) return () => undefined;
      const name = (node: Element): string | null => node.getAttribute("aria-label") ?? node.textContent;
      const said = name(active);
      return () => {
        const alike = [...this.root.querySelectorAll(active.tagName)].filter((n) => kind(n) === was && name(n) === said);
        const node = alike.length === 1 ? alike[0] : otherWay();
        if (node) (node as HTMLElement).focus({ preventScroll: true });
      };
    }
    const path: number[] = [];
    for (let node: Element = active; node !== this.root && node.parentElement; node = node.parentElement) {
      path.unshift([...node.parentElement.children].indexOf(node));
    }
    return () => {
      let node: Element | undefined = this.root;
      for (const i of path) node = node?.children[i];
      const there = node !== this.root ? node : undefined;
      if (!node || node === this.root || kind(node) !== was) {
        const alike = [...this.root.querySelectorAll(active.tagName)].filter((n) => kind(n) === was && n.textContent === active.textContent);
        node = alike.length === 1 ? alike[0] : (otherWay() ?? (there?.matches(INTERACTIVE) ? there : undefined));
      }
      if (node && "focus" in node) (node as HTMLElement).focus({ preventScroll: true });
    };
  }

  /**
   * The backlight. Below the top of its range the unit darkens the whole glass,
   * so the screen is drawn as it is and a black veil is laid over it.
   */
  private dim(): void {
    const level = clamp(this.ctx.store.num("setup.brightness", BRIGHTNESS_MAX), 0, BRIGHTNESS_MAX);
    const veil = ((BRIGHTNESS_MAX - level) / BRIGHTNESS_MAX) * DIMMEST;
    this.dimNode.style.opacity = veil.toFixed(3);
    this.dimNode.hidden = veil === 0;
  }

  private buildToolbar(
    kind: "home" | "sub",
    title: string | undefined,
    body: ScreenBody,
    bankButton: boolean,
    exits: boolean,
  ): void {
    const left = el("div", { class: "toolbar-left" });
    if (body.headerLeft) left.appendChild(body.headerLeft);
    if (bankButton) left.appendChild(this.bankButton());

    const center = el("div", { class: "toolbar-center" });
    if (body.headerCenter) center.appendChild(body.headerCenter);
    else if (title) center.appendChild(el("h1", { class: "toolbar-title", text: title }));

    if (!exits) {
      this.toolbarNode.append(left, center);
      // A screen that draws its own way off still gets the right of the bar.
      if (body.headerRight) this.toolbarNode.appendChild(body.headerRight);
      return;
    }
    if (body.headerRight) this.toolbarNode.appendChild(body.headerRight);

    const icons = el("div", { class: "toolbar-icons" });
    const iconBtn = (label: string, icon: SVGSVGElement, onTap: () => void): HTMLElement =>
      el("button", { class: "icon-btn", onTap, attrs: { "aria-label": label }, children: [icon] });

    if (kind === "home") {
      icons.classList.add("is-home");
      icons.appendChild(iconBtn("SETUP", Icons.setup(), () => this.ctx.nav.openTop({ id: "setup" })));
      if (this.ctx.model.hasSD) {
        const sd = iconBtn("microSD", Icons.storage(), () => this.ctx.nav.openTop({ id: "microsd" }));
        // Recording mode marks the icon with the record dot at its lower right,
        // and a file playback holds, playing or paused, with the play triangle
        // where the dot stands.
        if (recordMode(this.ctx.store)) {
          sd.classList.add("has-rec-dot");
          sd.appendChild(el("span", { class: "rec-dot", attrs: { "aria-hidden": "true" } }));
          sd.setAttribute("aria-label", "microSD, recording");
        } else if (holdsFile(this.ctx.store)) {
          sd.classList.add("has-play-mark");
          sd.appendChild(el("span", { class: "play-mark", attrs: { "aria-hidden": "true" } }));
          sd.setAttribute("aria-label", this.ctx.store.bool("sd.playing", false) ? "microSD, playing" : "microSD, paused");
        }
        icons.appendChild(sd);
      }
      icons.appendChild(iconBtn("MONITOR", Icons.monitor(), () => this.ctx.nav.openTop({ id: "monitor" })));
      icons.appendChild(el("span", { class: "toolbar-sep" }));
    } else if (this.ctx.nav.depth > 2) {
      // The arrow steps to the screen underneath. A screen the toolbar icons
      // open has only HOME under it, and the unit draws no arrow there.
      icons.appendChild(iconBtn("Back", Icons.back(), () => this.ctx.nav.back()));
      icons.appendChild(el("span", { class: "toolbar-sep" }));
    } else {
      icons.classList.add("is-home-only");
    }
    icons.appendChild(iconBtn("HOME", Icons.home(), () => this.ctx.nav.home()));

    this.toolbarNode.append(icons);
    this.toolbarNode.prepend(left, center);
  }

  /** The INPUT / OUTPUT channel-bank button, with one cell per bank. */
  private bankButton(): HTMLElement {
    const side = bankSide(this.ctx);
    const total = bankTotal(this.ctx, side);
    const active = currentBank(this.ctx);
    const cells = el("div", { class: "bank-cells" });
    for (let i = 0; i < total; i++) {
      cells.appendChild(el("span", { class: `bank-cell${i === active ? " is-active" : ""}` }));
    }
    return el("button", {
      class: `bank-btn bank-${side}${this.ctx.nav.current.id === "bank-select" ? " is-lit" : ""}`,
      attrs: {
        "aria-label": `${side === "input" ? "INPUT" : "OUTPUT"} channel bank ${active + 1} of ${total}`,
        "aria-expanded": String(this.ctx.nav.current.id === "bank-select"),
      },
      onTap: () => {
        if (this.ctx.nav.current.id === "bank-select") this.ctx.nav.back();
        else this.ctx.nav.push({ id: "bank-select" });
      },
      children: [
        el("span", {
          class: "bank-label",
          children: [el("span", { text: side === "input" ? "INPUT" : "OUTPUT" }), el("span", { class: "bank-mark", attrs: { "aria-hidden": "true" } })],
        }),
        cells,
      ],
    });
  }

  /** The round button that switches USER DEFINED KNOBS mode on and off. */
  private buildKnobToggle(on: boolean): HTMLElement {
    const node = el("button", {
      class: "udk-toggle",
      attrs: { "aria-label": "USER DEFINED KNOBS mode" },
      onTap: () => void this.ctx.store.set("ui.userDefinedKnobs", !on),
      children: [Icons.knob()],
    });
    setPressed(node, on);
    return node;
  }

  /** One division of the readout bar: the value it carries over what it names. */
  private knobCell(value: string, label: string, extraClass = ""): HTMLElement {
    return el("div", {
      class: `knob-cell ${extraClass}`.trim(),
      children: [
        el("div", { class: "knob-cell-value", text: value }),
        el("div", { class: "knob-cell-label", text: label }),
      ],
    });
  }

  /** Make a division the knob that turns `spec`: dragging it, the wheel over it and the arrow keys. */
  private turnCell(cell: HTMLElement, spec: NumericSpec, name: string, onEngage?: () => void): void {
    const v = this.ctx.store.num(spec.path, spec.fallback);
    cell.tabIndex = 0;
    cell.setAttribute("role", "slider");
    cell.setAttribute("aria-label", name);
    setAriaValue(cell, spec, v);
    if (standsStill(this.ctx, spec)) cell.setAttribute("aria-disabled", "true");
    attachSpin(this.ctx, cell, spec, onEngage);
  }

  private buildKnobStrip(udk: boolean): void {
    if (udk) {
      const bank = this.ctx.store.num("setup.udk.bank", 1);
      for (const knob of UDK_KNOBS) {
        const assign = udkAssignment(this.ctx.store.str(udkPath(bank, knob), UDK_UNASSIGNED));
        // A knob with nothing on it carries a dash where a value would be, over
        // an empty name band.
        const spec = assign.spec;
        const value = spec ? formatValue(spec, this.ctx.store.num(spec.path, spec.fallback)) : "---";
        const cell = this.knobCell(value, spec ? assign.short : "", "is-udk");
        // A knob with something on it turns that, as a division does in the ordinary bar,
        // and goes on turning it while a screen's 1-knob pins the focus.
        if (spec) this.turnCell(cell, { ...spec, pinFree: true }, assign.value);
        this.knobStripNode.appendChild(cell);
      }
      // The page number sits astride the bar's top edge, and each end of the bar
      // is the step to the page beside it.
      this.knobStripNode.appendChild(el("div", { class: "knob-bank", text: String(bank) }));
      for (const [delta, mark] of [
        [-1, "\u2039"],
        [1, "\u203a"],
      ] as const) {
        const to = bank + delta;
        if (!UDK_BANKS.includes(to as (typeof UDK_BANKS)[number])) continue;
        this.knobStripNode.appendChild(
          el("button", {
            class: `knob-bank-step knob-bank-${delta < 0 ? "prev" : "next"}`,
            attrs: { "aria-label": `User defined knobs page ${to}` },
            onTap: () => void this.ctx.store.set("setup.udk.bank", to),
            text: mark,
          }),
        );
      }
      return;
    }
    const pages = Math.max(1, Math.ceil(this.knobs.length / KNOB_CELLS));
    const page = Math.min(this.knobPage, pages - 1);
    const shown = this.knobs.slice(page * KNOB_CELLS, (page + 1) * KNOB_CELLS);
    while (shown.length < KNOB_CELLS) shown.push(null);
    for (const spec of shown) {
      if (!spec) {
        // An empty division still carries the label band: the bar's is unbroken.
        this.knobStripNode.appendChild(
          el("div", { class: "knob-cell is-empty", children: [el("div", { class: "knob-cell-label" })] }),
        );
        continue;
      }
      if (!("path" in spec)) {
        this.knobStripNode.appendChild(this.knobCell(spec.text, spec.label));
        continue;
      }
      // On the unit this is a readout and the knob under it does the turning.
      // Nothing here draws those knobs, so the division is the knob: dragging
      // it, the wheel over it and the arrow keys move the value it names.
      // A division the unit is holding itself reads out and does not turn.
      const cell = this.knobCell(
        formatValue(spec, this.ctx.store.num(spec.path, spec.fallback)),
        spec.label,
        spec.locked === true ? "is-driven" : "",
      );
      this.turnCell(cell, spec, spec.label, spec.locked === true ? undefined : () => this.ctx.focus.take(spec));
      this.knobStripNode.appendChild(cell);
    }
    // More parameters than divisions: a step sits in the label band at each end
    // of the bar that has a page beyond it.
    for (const delta of [-1, 1] as const) {
      const to = page + delta;
      if (to < 0 || to >= pages) continue;
      this.knobStripNode.appendChild(
        el("button", {
          class: `knob-page-step knob-page-${delta < 0 ? "prev" : "next"}`,
          attrs: { "aria-label": `Knob page ${to + 1} of ${pages}` },
          onTap: () => {
            this.knobPage = to;
            this.scheduleRepaint();
          },
          children: [delta < 0 ? Icons.pageBack() : Icons.pageOn()],
        }),
      );
    }
  }

  /**
   * A tap on the bare screen leaves a screen the shell draws no exits for, unless
   * the screen is left through its own controls alone. The
   * screen's own area, every control and whatever is laid over the screen keep
   * their taps. The knob bar is bare screen around its controls, and the whole
   * of it is under a sheet that holds its controls out of reach. A press that
   * went down on one of them is no tap on the bare screen wherever it is let go.
   */
  private attachBackdrop(): void {
    const keeps = (target: EventTarget | null): boolean =>
      (target as HTMLElement).closest(`${INTERACTIVE}, .main, [data-overlay]`) !== null;
    let pressKept = false;
    this.lcd.addEventListener(
      "pointerdown",
      (ev) => {
        pressKept = keeps(ev.target);
      },
      true,
    );
    this.lcd.addEventListener("click", (ev) => {
      const fromKept = pressKept;
      pressKept = false;
      const def = this.registry.get(this.ctx.nav.current.id);
      if (def?.shellExits !== false || def.leavesOnTouchAround === false) return;
      if (fromKept || keeps(ev.target)) return;
      this.ctx.nav.back();
    });
  }

  /**
   * Tab and Shift+Tab go round the controls of the modal on top, wherever the
   * focus stands, so the keys cannot leave it. A modal with none in it leaves
   * Tab to the page.
   */
  private buildTabTrap(): (ev: KeyboardEvent) => void {
    return (ev) => {
      if (ev.key !== "Tab") return;
      const top = this.topLayer();
      if (!top?.modal) return;
      const stops = [...top.node.querySelectorAll<HTMLElement>("*")].filter((n) => n.tabIndex >= 0);
      if (stops.length === 0) return;
      ev.preventDefault();
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const step = ev.shiftKey ? -1 : 1;
      const next = at < 0 ? (ev.shiftKey ? stops.length - 1 : 0) : (at + step + stops.length) % stops.length;
      stops[next]?.focus();
    };
  }

  /**
   * Escape does what the toolbar's back arrow does, on every screen. Anything
   * layered over the screen owns the key while it is up: it cancels the dialog,
   * the sheet or the list on top wherever on the glass the focus stands, or with
   * nothing focused. A field being typed into keeps it for the edit in hand — an
   * IME composition included. A control of the page around the glass keeps it whole.
   */
  private buildEscapeHandler(): (ev: KeyboardEvent) => void {
    // On the window: a screen that draws no exits leaves focus on the document.
    return (ev) => {
      if (ev.key !== "Escape" || ev.isComposing) return;
      const target = ev.target instanceof HTMLElement ? ev.target : null;
      if (target && target !== document.body && target !== document.documentElement && !this.lcd.contains(target)) return;
      if (this.lcd.querySelector("[data-overlay]")) {
        const cancel = this.topLayer()?.modal?.cancel;
        if (!cancel) return;
        ev.preventDefault();
        cancel();
        return;
      }
      if (target?.closest("input, textarea, [contenteditable], [role='textbox']")) return;
      ev.preventDefault();
      // A key held down goes back once, as the back arrow held down does.
      if (ev.repeat) return;
      this.ctx.nav.back();
    };
  }

  /** Swiping the main area left or right steps the channel bank. Returns the step that lets the window go. */
  private attachSwipe(): () => void {
    // On HOME a sideways finger steps the bank, and one up or down still scrolls the page.
    const swipes = (): boolean => this.ctx.nav.current.id === "home";
    const takeTouch = (): void => {
      this.mainNode.style.touchAction = swipes() ? "pan-y" : "";
    };
    takeTouch();
    this.ctx.nav.onChange(takeTouch);
    // A swipe is a press on the main area, off any control, let go over the main
    // area; a press let go anywhere else, or cancelled, steps nothing. Where it is
    // let go is where the pointer stands, not where its release is sent: a finger's
    // release is sent to the element it pressed on. A second finger neither takes
    // the swipe nor ends it.
    const holds = new PointerHolds<HTMLElement>();
    let stop = (): void => undefined;
    this.mainNode.addEventListener("pointerdown", (ev) => {
      if (!holds.take(ev, [this.mainNode]) || (ev.target as HTMLElement).closest(INTERACTIVE)) return;
      const startX = ev.clientX;
      stop = holds.follow(ev, [this.mainNode], () => undefined, (last) => {
        if (last?.type !== "pointerup" || !swipes()) return;
        const dx = last.clientX - startX;
        const over = document.elementFromPoint(last.clientX, last.clientY);
        if (Math.abs(dx) < 40 || over === null || !this.mainNode.contains(over)) return;
        stepBank(this.ctx, dx < 0 ? 1 : -1);
      });
    });
    return () => stop();
  }
}
