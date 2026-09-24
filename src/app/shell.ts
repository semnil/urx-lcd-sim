// The 480x272 frame: toolbar band, main area, side menu, multi-function knob
// strip. Everything a screen does not draw itself lives here, because the unit
// keeps these in place across screen changes.

import { clamp, combineWriteRules } from "../device/store";
import type { DeviceStore } from "../device/store";
import type { UnitModel } from "../model/types";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkPath } from "../model/udk";
import { INTERACTIVE, clear, el, setPressed } from "../ui/dom";
import { FocusController } from "../ui/focus";
import { Icons } from "../ui/icons";
import { attachFocusRing } from "../ui/focus-ring";
import { attachPress } from "../ui/press";
import { attachSpin } from "../ui/widgets";
import type { NumericSpec } from "../ui/param-spec";
import { BRIGHTNESS_MAX, formatValue } from "../ui/param-spec";
import type { ScreenBody, ScreenRegistry } from "../screens/types";
import { recordMode } from "../screens/recording";
import { dateDraftWriteRule } from "../screens/date-time";
import { hiZWriteRule } from "../screens/head-amp";
import { delaySyncWriteRule } from "../model/effects";
import { eqOneKnobWriteRule } from "../screens/channel";
import { pairWriteRule } from "../screens/stereo-link";
import { bankSide, bankTotal, currentBank, stepBank } from "../screens/strip-state";
import type { AppContext } from "./context";
import { Navigator } from "./navigator";
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
  private knobs: (NumericSpec | null)[] = [];
  /** Which four of them the readout bar is showing. */
  private knobPage = 0;
  private repaintScheduled = false;
  /** The screen the glass last drew. */
  private drawn: string | null = null;
  /** Closers for what is layered over the screen, so nothing is dropped unclosed. */
  private readonly overlays = new Set<() => void>();
  private readonly onEscape: (ev: KeyboardEvent) => void;
  private readonly offStore: () => void;
  private readonly offPress: () => void;
  private readonly offFocusRing: () => void;

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
      overlay: (node, onClose) => {
        // Marked so the Escape handler knows something is layered over the screen.
        node.dataset["overlay"] = "";
        this.lcd.appendChild(node);
        const close = (): void => {
          if (!this.overlays.delete(close)) return;
          node.remove();
          onClose?.();
        };
        this.overlays.add(close);
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

    nav.onChange(() => {
      focus.release();
      this.knobPage = 0;
      // A list or a dialog belongs to the screen that opened it.
      this.closeOverlays();
      this.scheduleRepaint();
    });
    this.offStore = store.onChange(() => this.scheduleRepaint());
    // A linked pair holds one set of values, so an edit to one of its channels
    // carries onto the other, the DATE / TIME popup keeps its day inside the
    // month it holds, HI-Z brings its connector's A.Gain down to what it
    // reaches, a delay's Sync sets its time from the note and the tempo, and
    // 1-knob EQ sets the four bands from its curve and level.
    // They are installed here because every screen and every gesture
    // reaches the store through this one context.
    store.setWriteRule(
      combineWriteRules(
        pairWriteRule(store, model),
        dateDraftWriteRule(store),
        hiZWriteRule(store),
        delaySyncWriteRule(store),
        eqOneKnobWriteRule(store),
      ),
    );
    this.attachSwipe();
    this.attachBackdrop();
    this.offPress = attachPress(this.lcd);
    this.offFocusRing = attachFocusRing(this.lcd);
    this.onEscape = this.buildEscapeHandler();
    window.addEventListener("keydown", this.onEscape);
    this.render();
  }

  /** Give up the window and anything layered over the screen. */
  destroy(): void {
    window.removeEventListener("keydown", this.onEscape);
    this.offStore();
    this.ctx.store.setWriteRule(null);
    this.offPress();
    this.offFocusRing();
    this.closeOverlays();
  }

  private closeOverlays(): void {
    for (const close of [...this.overlays]) close();
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
    this.dim();
    this.drawn = route.id;
    this.knobs = [];
    clear(this.mainNode);
    clear(this.sideNode);
    clear(this.toolbarNode);
    clear(this.knobStripNode);

    if (!def) {
      this.mainNode.appendChild(el("p", { class: "screen-missing", text: `No screen registered for "${route.id}"` }));
      return;
    }

    const body = def.build(this.ctx, route);
    this.mainNode.appendChild(body.main);
    // USER DEFINED KNOBS mode replaces the readout strip with the bank
    // assignments, so it shows even where the screen suppresses the normal one.
    const udkMode = this.ctx.store.bool("ui.userDefinedKnobs", false);
    const showStrip = udkMode || (def.knobStrip ?? this.knobs.some(Boolean));
    this.lcd.classList.toggle("has-knobs", showStrip);
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
    if (dims && !exits) {
      for (const node of [this.toolbarNode, this.sideNode]) {
        for (const control of node.querySelectorAll("button, [role='button']")) {
          if (!control.classList.contains("is-lit")) control.toggleAttribute("inert", true);
        }
      }
    }
    if (showStrip) this.buildKnobStrip(udkMode);
    refocus();
  }

  /**
   * The step that puts the page's focus back on the control it stood on once the
   * same screen is drawn again: the control of the same kind at the same place, or
   * else the one control of that kind with the same words. A different screen
   * leaves the focus where the rebuild left it.
   */
  private focusPlace(): () => void {
    const active = document.activeElement;
    if (this.drawn !== this.ctx.nav.current.id || !active || active === this.root || !this.root.contains(active)) return () => undefined;
    // A control's kind is its tag and its classes, less the ones naming its state.
    const kind = (node: Element): string => [node.tagName, ...[...node.classList].filter((c) => !c.startsWith("is-"))].join(" ");
    const was = kind(active);
    const path: number[] = [];
    for (let node: Element = active; node !== this.root && node.parentElement; node = node.parentElement) {
      path.unshift([...node.parentElement.children].indexOf(node));
    }
    return () => {
      let node: Element | undefined = this.root;
      for (const i of path) node = node?.children[i];
      if (!node || node === this.root || kind(node) !== was) {
        const alike = [...this.root.querySelectorAll(active.tagName)].filter((n) => kind(n) === was && n.textContent === active.textContent);
        node = alike.length === 1 ? alike[0] : undefined;
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
        // Recording mode marks the icon with the record dot at its lower right.
        if (recordMode(this.ctx.store)) {
          sd.classList.add("has-rec-dot");
          sd.appendChild(el("span", { class: "rec-dot", attrs: { "aria-hidden": "true" } }));
          sd.setAttribute("aria-label", "microSD, recording");
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
        "aria-haspopup": "listbox",
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
    cell.setAttribute("aria-valuenow", String(v));
    cell.setAttribute("aria-valuemin", String(spec.min));
    cell.setAttribute("aria-valuemax", String(spec.max));
    cell.setAttribute("aria-valuetext", formatValue(spec, v));
    if (spec.locked === true) cell.setAttribute("aria-disabled", "true");
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
        // A knob with something on it turns that, as a division does in the ordinary bar.
        if (spec) this.turnCell(cell, spec, assign.value);
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
   * A tap on the bare screen leaves a screen the shell draws no exits for. The
   * screen's own area and every button keep their taps.
   */
  private attachBackdrop(): void {
    this.lcd.addEventListener("click", (ev) => {
      if (this.registry.get(this.ctx.nav.current.id)?.shellExits !== false) return;
      if ((ev.target as HTMLElement).closest("button, [role='button'], .main")) return;
      this.ctx.nav.back();
    });
  }

  /**
   * Escape does what the toolbar's back arrow does, on every screen. Anything
   * layered over the screen owns the key while it is up, and a field being typed
   * into keeps it for the edit in hand — an IME composition included.
   */
  private buildEscapeHandler(): (ev: KeyboardEvent) => void {
    // On the window: a screen that draws no exits leaves focus on the document.
    return (ev) => {
      if (ev.key !== "Escape" || ev.isComposing) return;
      if (this.lcd.querySelector("[data-overlay]")) return;
      const target = ev.target instanceof HTMLElement ? ev.target : null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      ev.preventDefault();
      this.ctx.nav.back();
    };
  }

  /** Swiping the main area left or right steps the channel bank. */
  private attachSwipe(): void {
    let startX: number | null = null;
    this.mainNode.addEventListener("pointerdown", (ev) => {
      if ((ev.target as HTMLElement).closest(INTERACTIVE)) return;
      startX = ev.clientX;
    });
    this.mainNode.addEventListener("pointerup", (ev) => {
      if (startX === null) return;
      const dx = ev.clientX - startX;
      startX = null;
      if (this.ctx.nav.current.id !== "home" || Math.abs(dx) < 40) return;
      stepBank(this.ctx, dx < 0 ? 1 : -1);
    });
  }
}
