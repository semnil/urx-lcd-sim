import { afterEach, describe, expect, it } from "vitest";
import type { Route } from "../app/navigator";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { GEQ_BANDS, GEQ_PAGES, geqBandPath, geqPageBands, geqResponse } from "../model/geq";
import { findStrip } from "../model/types";
import { unitById } from "../model/units";
import { setEqType } from "./geq";
import { buildRegistry } from "./index";

// The GEQ screen of a bus on Flex12GEQ: the sliders four bands at a time, the
// swipe and the GEQ graph that step them, the twelve-band limit Available
// counts down to, and the GEQ Link that writes one side's settings on the other.

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const shells: Shell[] = [];
afterEach(() => {
  for (const shell of shells.splice(0)) {
    shell.destroy();
    shell.root.remove();
  }
});

/** A URX44V on the page, opened on `start`, with `id` on Flex12GEQ. */
async function mount(id = "bus.stereo", start: Route[] = [{ id: "ch.geq", strip: id }]): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, []);
  shells.push(shell);
  document.body.append(shell.root);
  const strip = findStrip(model, id);
  if (strip && (strip.kind === "stereo" || strip.kind === "mix")) setEqType(shell.ctx, strip, "Flex12GEQ");
  for (const route of start) shell.ctx.nav.push(route);
  await flush();
  return shell;
}

const boxes = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".geq-box")];
const names = (shell: Shell): string[] => boxes(shell).map((b) => b.textContent ?? "");
const box = (shell: Shell, name: string): HTMLElement => {
  const node = boxes(shell).find((b) => b.textContent === name);
  if (!node) throw new Error(`no ${name} box`);
  return node;
};
const readout = (shell: Shell): [string, string][] =>
  [...shell.root.querySelectorAll(".knob-cell")].map((c) => [c.querySelector(".knob-cell-value")?.textContent ?? "", c.querySelector(".knob-cell-label")?.textContent ?? ""]);
const available = (shell: Shell): string => shell.root.querySelector(".geq-available-count")?.textContent ?? "";
const band = (shell: Shell, side: "l" | "r", n: number): number => shell.ctx.store.num(geqBandPath("ch.bus.stereo", side, n), 99);
const press = async (node: HTMLElement, key: string, times = 1): Promise<void> => {
  for (let i = 0; i < times; i++) node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await flush();
};

describe("the GEQ screen", () => {
  it("opens on the first four bands of the side in view, the first holding the focus, their gains on the readout bar", async () => {
    const shell = await mount();
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 1), 9);
    await flush();
    expect(names(shell)).toEqual(["20", "25", "31.5", "40"]);
    expect(readout(shell)).toEqual([
      ["0.0dB", "Gain"],
      ["9.0dB", "Gain"],
      ["0.0dB", "Gain"],
      ["0.0dB", "Gain"],
    ]);
    expect(box(shell, "20").classList.contains("is-held")).toBe(true);
    expect([...shell.root.querySelectorAll(".geq-dot")].findIndex((d) => d.classList.contains("is-held"))).toBe(0);
  });

  it("stands each box at its gain, 3px to a dB from the 0 dB line, its bar running from that line to the box", async () => {
    const shell = await mount();
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 1), 9);
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 3), -14);
    await flush();
    expect(boxes(shell).map((b) => [b.style.left, b.style.top])).toEqual([
      ["26px", "46px"],
      ["131px", "19px"],
      ["236px", "46px"],
      ["341px", "88px"],
    ]);
    const bars = [...shell.root.querySelectorAll(".geq-bar")].map((b) => [b.getAttribute("x"), b.getAttribute("y"), b.getAttribute("height")]);
    expect(bars).toEqual([
      ["30", "60", "0"],
      ["135", "33", "27"],
      ["240", "60", "0"],
      ["345", "60", "42"],
    ]);
  });

  describe("a swipe across the sliders", () => {
    const swipe = async (shell: Shell, from: number, to: number, on = ".geq-sliders"): Promise<void> => {
      const area = shell.root.querySelector(on);
      area?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: from, clientY: 150 }));
      area?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: to, clientY: 150 }));
      await flush();
    };

    it("to the left shows the next four bands and to the right the four before, and a short move steps nothing", async () => {
      const shell = await mount();
      await swipe(shell, 300, 200);
      expect(names(shell)).toEqual(["50", "63", "80", "100"]);
      await swipe(shell, 300, 270);
      expect(names(shell)).toEqual(["50", "63", "80", "100"]);
      await swipe(shell, 200, 300);
      expect(names(shell)).toEqual(["20", "25", "31.5", "40"]);
      await swipe(shell, 200, 300);
      expect(names(shell), "the first page goes no further back").toEqual(["20", "25", "31.5", "40"]);
    });

    it("stops at the last page, which shows three bands and leaves the fourth readout cell empty", async () => {
      const shell = await mount();
      for (let i = 0; i < GEQ_PAGES + 2; i++) await swipe(shell, 300, 200);
      expect(names(shell)).toEqual(["12.5k", "16k", "20k"]);
      expect(readout(shell).map(([, label]) => label)).toEqual(["Gain", "Gain", "Gain", ""]);
    });

    it("leaves the focus on its band, lit by the band's dot alone, and frames the box again on the band's page", async () => {
      const shell = await mount();
      box(shell, "31.5").click();
      await flush();
      const held = (): [boolean[], number, boolean] => [
        boxes(shell).map((b) => b.classList.contains("is-held")),
        [...shell.root.querySelectorAll(".geq-dot")].findIndex((d) => d.classList.contains("is-held")),
        shell.root.querySelector<HTMLElement>(".geq-shade")?.hidden === true,
      ];
      expect(held()).toEqual([[false, false, true, false], 2, false]);
      await swipe(shell, 300, 200);
      expect(held()).toEqual([[false, false, false, false], 2, true]);
      await swipe(shell, 200, 300);
      expect(held()).toEqual([[false, false, true, false], 2, false]);
    });

    it("steps nothing when the touch is taken away rather than let go", async () => {
      const shell = await mount();
      const area = shell.root.querySelector(".geq-sliders");
      area?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 300, clientY: 150 }));
      area?.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true, cancelable: true, clientX: 200, clientY: 150 }));
      await flush();
      expect(names(shell)).toEqual(["20", "25", "31.5", "40"]);
    });

    it("steps nothing when it starts on a box", async () => {
      const shell = await mount();
      await swipe(shell, 300, 200, ".geq-box");
      expect(names(shell)).toEqual(["20", "25", "31.5", "40"]);
    });
  });

  it("brings the sliders to the bands under a touch on the GEQ graph, and its window with them", async () => {
    const shell = await mount();
    const graph = (): HTMLElement | null => shell.root.querySelector(".geq-graph");
    graph()?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 250, detail: 1 }));
    await flush();
    expect(names(shell)).toEqual(["800", "1k", "1.25k", "1.6k"]);
    expect(shell.root.querySelector(".geq-window")?.getAttribute("x")).toBe("209");
    graph()?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 415, detail: 1 }));
    await flush();
    expect(names(shell), "past the last band, the last page").toEqual(["12.5k", "16k", "20k"]);
  });

  it("steps the sliders on by a key on the GEQ graph, from the last page round to the first", async () => {
    const shell = await mount();
    const key = async (): Promise<void> => {
      const graph = shell.root.querySelector(".geq-graph");
      graph?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      graph?.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      await flush();
    };
    await key();
    expect(names(shell)).toEqual(["50", "63", "80", "100"]);
    for (let i = 1; i < GEQ_PAGES; i++) await key();
    expect(names(shell)).toEqual(["20", "25", "31.5", "40"]);
  });

  it("shows no channel for a strip the unit does not have", async () => {
    const shell = await mount("bus.stereo", [{ id: "ch.geq", strip: "nope" }]);
    expect([shell.root.querySelector(".geq-screen"), shell.root.querySelector(".screen-missing")?.textContent]).toEqual([null, "No channel selected"]);
  });

  it("counts down Available as bands leave 0 dB, and holds a band at 0 dB still while twelve stand away from it", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    expect(available(shell)).toBe("12");
    for (let n = 4; n < 15; n++) await s.set(geqBandPath("ch.bus.stereo", "l", n), -3);
    await flush();
    expect(available(shell)).toBe("1");
    await press(box(shell, "20"), "ArrowUp");
    expect([available(shell), band(shell, "l", 0)]).toEqual(["0", 0.5]);
    expect(boxes(shell).map((b) => b.classList.contains("is-shut")), "the bands at 0 dB are drawn as unable to move").toEqual([false, true, true, true]);
    await press(box(shell, "25"), "ArrowUp");
    await press(box(shell, "25"), "End");
    expect(band(shell, "l", 1), "the thirteenth band stays at 0 dB").toBe(0);
    await press(box(shell, "20"), "ArrowUp");
    expect(band(shell, "l", 0), "a band already away from 0 dB still turns").toBe(1);
    await press(box(shell, "20"), "ArrowDown", 2);
    await press(box(shell, "25"), "ArrowDown");
    expect([band(shell, "l", 0), band(shell, "l", 1), available(shell)]).toEqual([0, -0.5, "0"]);
    expect(boxes(shell).map((b) => b.classList.contains("is-shut"))).toEqual([true, false, true, true]);
  });

  it.each([
    ["±15dB", [15, 12, 6, 0, -6, -12, -15], [15, 24, 42, 60, 78, 96, 105]],
    ["±12dB", [12, 6, 0, -6, -12], [15, 38, 60, 83, 105]],
    ["±6dB", [6, 3, 0, -3, -6], [15, 38, 60, 83, 105]],
    ["-24dB", [0, -6, -12, -18, -24], [15, 38, 60, 83, 105]],
    ["a value off the list, read as ±15dB", [15, 12, 6, 0, -6, -12, -15], [15, 24, 42, 60, 78, 96, 105]],
  ])("rules the area at %s from the limit's top to its bottom", async (limit, gains, rows) => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stereo.geq.l.limit", limit);
    await flush();
    const ticks = [...shell.root.querySelectorAll<HTMLElement>(".geq-tick")];
    expect(ticks.map((t) => t.textContent)).toEqual(gains.map((db) => (db > 0 ? `+${db}` : String(db))));
    expect(ticks.map((t) => t.style.top)).toEqual(rows.map((y) => `${y}px`));
  });

  it("keeps a band's dot and the curve inside the GEQ graph at -24dB", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stereo.geq.l.limit", "-24dB");
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 10), -24);
    await flush();
    const cy = Number(shell.root.querySelectorAll(".geq-dot")[10]?.getAttribute("cy"));
    const ys = (shell.root.querySelector(".geq-curve")?.getAttribute("points") ?? "").split(" ").map((p) => Number(p.split(",")[1]));
    expect(cy).toBe(37.5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(37.5);
  });

  describe("two fingers on two bands at 0 dB with eleven away", () => {
    /** A touch at `y`, as one finger among several. */
    const touch = (type: string, id: number, y: number): MouseEvent => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 });
      Object.defineProperties(ev, { pointerId: { value: id }, pointerType: { value: "touch" } });
      return ev;
    };
    const control = (shell: Shell, on: "box" | "cell", slot: number): HTMLElement | undefined =>
      on === "box" ? boxes(shell)[slot] : [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")][slot];

    it.each([
      ["bus.stereo", "Off", "box"],
      ["bus.stereo", "L>R", "box"],
      ["bus.mix1", "Off", "cell"],
      ["bus.mix1", "L>R", "cell"],
      ["bus.mix2", "Off", "box"],
      ["bus.mix2", "L>R", "cell"],
    ] as const)("on %s with the link %s, by its %s: the second finger's band stays at 0 dB, and moves once a band is back", async (id, link, on) => {
      const shell = await mount(id);
      const s = shell.ctx.store;
      const path = (side: "l" | "r", n: number): string => geqBandPath(`ch.${id}`, side, n);
      const away = (side: "l" | "r"): number => GEQ_BANDS.filter((_, n) => s.num(path(side, n), 0) !== 0).length;
      await s.set(`ch.${id}.geq.link`, link);
      for (let n = 4; n < 15; n++) await s.set(path("l", n), -3);
      await flush();
      control(shell, on, 0)?.dispatchEvent(touch("pointerdown", 1, 150));
      control(shell, on, 1)?.dispatchEvent(touch("pointerdown", 2, 150));
      window.dispatchEvent(touch("pointermove", 1, 120));
      await flush();
      window.dispatchEvent(touch("pointermove", 2, 120));
      await flush();
      window.dispatchEvent(touch("pointerup", 1, 120));
      window.dispatchEvent(touch("pointerup", 2, 120));
      await flush();
      expect([s.num(path("l", 0), 0) > 0, s.num(path("l", 1), 99), away("l"), available(shell)]).toEqual([true, 0, 12, "0"]);
      if (link !== "Off") expect(away("r")).toBe(12);
      await press(box(shell, "20"), "Home");
      await press(box(shell, "20"), "End");
      await press(box(shell, "20"), "ArrowDown", 30);
      expect(s.num(path("l", 0), 99)).toBe(0);
      await press(box(shell, "25"), "ArrowUp");
      expect([s.num(path("l", 1), 0), away("l")]).toEqual([0.5, 12]);
    });
  });

  it("turns a band in 0.5 dB steps inside the side's GEQ Limit", async () => {
    const shell = await mount();
    await press(box(shell, "40"), "ArrowUp", 3);
    expect(band(shell, "l", 3)).toBe(1.5);
    await press(box(shell, "40"), "End");
    expect(band(shell, "l", 3)).toBe(15);
    await shell.ctx.store.set("ch.bus.stereo.geq.l.limit", "-24dB");
    await flush();
    await press(box(shell, "31.5"), "Home");
    await press(box(shell, "25"), "End");
    expect([band(shell, "l", 2), band(shell, "l", 1)]).toEqual([-24, 0]);
  });

  it("shows the side the channel selector stands on", async () => {
    const shell = await mount();
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "r", 0), 4);
    await shell.ctx.store.set("ui.lane.bus.stereo", 1);
    await flush();
    expect(readout(shell)[0]).toEqual(["4.0dB", "Gain"]);
    await press(box(shell, "25"), "ArrowDown");
    expect([band(shell, "r", 1), band(shell, "l", 1)]).toEqual([-0.5, 0]);
  });

  it("switches the side's [GEQ] from its name in the toolbar", async () => {
    const shell = await mount();
    const title = shell.root.querySelector<HTMLElement>(".badge-title.badge-geq");
    expect(title?.getAttribute("aria-pressed")).toBe("true");
    title?.click();
    await flush();
    expect([shell.ctx.store.bool("ch.bus.stereo.geq.l.on", true), shell.ctx.store.bool("ch.bus.stereo.geq.r.on", false)]).toEqual([false, true]);
  });

  it("lights [GEQ Link] while the link is on", async () => {
    const shell = await mount();
    const link = (): string | null | undefined => shell.root.querySelector(".geq-link")?.getAttribute("aria-pressed");
    expect(link()).toBe("false");
    await shell.ctx.store.set("ch.bus.stereo.geq.link", "L>R");
    await flush();
    expect(link()).toBe("true");
  });

  it.each([
    ["a bus on 4band PEQ", "bus.mix2", false, "This channel has no GEQ screen"],
    ["a channel", "ch1", false, "This channel has no GEQ screen"],
    ["a bus over 48 kHz", "bus.stereo", true, "This channel has no GEQ screen at this sampling frequency"],
  ])("shows %s that it has no GEQ screen", async (_, id, overRate, text) => {
    const shell = await mount("bus.stereo", [{ id: "ch.geq", strip: id }]);
    if (overRate) await shell.ctx.store.set("setup.samplingFrequency", 88200);
    await flush();
    expect(shell.root.querySelector(".screen-missing")?.textContent).toBe(text);
  });

  it("is opened by a touch on the channel view's GEQ area", async () => {
    const shell = await mount("bus.mix1", [{ id: "channel-view", strip: "bus.mix1" }]);
    shell.root.querySelector<HTMLElement>(".cv-block-geq")?.click();
    await flush();
    expect([shell.ctx.nav.current.id, names(shell)]).toEqual(["ch.geq", ["20", "25", "31.5", "40"]]);
  });
});

describe("the GEQ Link", () => {
  it.each([
    ["L>R", "l", true],
    ["R>L", "r", true],
    ["Off", "l", false],
  ] as const)("at %s writes a band and the GEQ Limit set on side %s on the other side too: %s", async (link, side, carried) => {
    const shell = await mount();
    const s = shell.ctx.store;
    const other = side === "l" ? "r" : "l";
    await s.set("ch.bus.stereo.geq.link", link);
    await s.set(geqBandPath("ch.bus.stereo", side, 17), 6);
    await s.set(`ch.bus.stereo.geq.${side}.limit`, "±12dB");
    expect([band(shell, other, 17), s.str(`ch.bus.stereo.geq.${other}.limit`, "")]).toEqual(carried ? [6, "±12dB"] : [0, "±15dB"]);
  });

  const answers = (shell: Shell): string[] => [...shell.root.querySelectorAll(".dialog .btn")].map((b) => b.textContent ?? "");
  const answer = async (shell: Shell, label: string): Promise<void> => {
    [...shell.root.querySelectorAll<HTMLElement>(".dialog .btn")].find((b) => b.textContent === label)?.click();
    await flush();
  };
  const openLink = async (shell: Shell): Promise<void> => {
    shell.root.querySelector<HTMLElement>(".geq-link")?.click();
    await flush();
  };

  it.each([
    ["ST L → ST R", "l", "L>R"],
    ["ST R → ST L", "r", "R>L"],
  ] as const)("off, asks which side leads: %s gives the other side its limit and bands, then links them", async (choice, from, link) => {
    const shell = await mount();
    const s = shell.ctx.store;
    const to = from === "l" ? "r" : "l";
    await s.set(geqBandPath("ch.bus.stereo", from, 0), 0.5);
    await s.set(geqBandPath("ch.bus.stereo", to, 1), 3);
    await s.set(`ch.bus.stereo.geq.${from}.limit`, "±12dB");
    await flush();
    await openLink(shell);
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Make Link GEQ Parameters?");
    expect(answers(shell)).toEqual(["ST L → ST R", "ST R → ST L", "Cancel"]);
    await answer(shell, choice);
    expect(shell.root.querySelector(".dialog")).toBeNull();
    expect([s.str("ch.bus.stereo.geq.link", ""), band(shell, to, 0), band(shell, to, 1), s.str(`ch.bus.stereo.geq.${to}.limit`, "")]).toEqual([link, 0.5, 0, "±12dB"]);
    expect(shell.root.querySelector(".geq-link")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("on, asks whether to break the link, and [OK] breaks it with each side keeping what it holds", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("ch.bus.stereo.geq.link", "L>R");
    await s.set(geqBandPath("ch.bus.stereo", "l", 5), -4);
    await flush();
    await openLink(shell);
    expect([shell.root.querySelector(".dialog-text")?.textContent, answers(shell)]).toEqual(["Break Link GEQ Parameters?", ["Cancel", "OK"]]);
    await answer(shell, "Cancel");
    expect(s.str("ch.bus.stereo.geq.link", "")).toBe("L>R");
    await openLink(shell);
    await answer(shell, "OK");
    expect([s.str("ch.bus.stereo.geq.link", ""), band(shell, "l", 5), band(shell, "r", 5)]).toEqual(["Off", -4, -4]);
  });

  it("changes nothing when [Cancel] answers the question of which side leads", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set(geqBandPath("ch.bus.stereo", "l", 0), 2);
    await flush();
    await openLink(shell);
    await answer(shell, "Cancel");
    expect([s.str("ch.bus.stereo.geq.link", ""), band(shell, "r", 0), shell.root.querySelector(".dialog")]).toEqual(["Off", 0, null]);
  });

  it("leaves the other side's [GEQ] where it is", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("ch.bus.stereo.geq.link", "L>R");
    await s.set("ch.bus.stereo.geq.l.on", false);
    expect(s.bool("ch.bus.stereo.geq.r.on", false)).toBe(true);
  });
});

describe("the bands", () => {
  it("fill seven pages of four and a last of three", () => {
    expect(Array.from({ length: GEQ_PAGES }, (_, p) => geqPageBands(p).length)).toEqual([4, 4, 4, 4, 4, 4, 4, 3]);
    expect(geqPageBands(GEQ_PAGES - 1).map((b) => GEQ_BANDS[b])).toEqual(["12.5k", "16k", "20k"]);
  });

  it("each lift or cut their own frequency by their gain, and add where they meet", () => {
    const gains = GEQ_BANDS.map(() => 0);
    expect(geqResponse(gains)(1000)).toBe(0);
    gains[17] = 12;
    expect(geqResponse(gains)(1000)).toBeCloseTo(12, 9);
    expect(geqResponse(gains)(100)).toBeCloseTo(0, 1);
    gains[18] = -6;
    const both = geqResponse(gains)(1120);
    const one = (i: number, db: number): number => geqResponse(GEQ_BANDS.map((_, b) => (b === i ? db : 0)))(1120);
    expect(both).toBeCloseTo(one(17, 12) + one(18, -6), 9);
  });
});
