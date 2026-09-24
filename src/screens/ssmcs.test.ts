import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { SSMCS_DEFAULTS, factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { setMeterSource } from "./meters";
import { compResponse } from "./channel";
import { declarations, px, readStyle } from "../style/css-read";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(): Promise<Shell> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
  const shell = new Shell(buildRegistry(), store, unitById("URX44V"));
  await flush();
  return shell;
}

/** CH 1 with its COMP / EQ type set to the strip, on the screen asked for. */
async function strip(id = "ch.ssmcs"): Promise<Shell> {
  const shell = await mount();
  await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
  shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
  shell.ctx.nav.push({ id, strip: "ch1" });
  await flush();
  return shell;
}

const tap = (node: Element | null | undefined): void => {
  node?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  node?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("the channel view while the COMP / EQ type is SSMCS", () => {
  it("puts one SSMCS area where the COMP and EQ areas stand", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".cv-block-comp"), "COMP before the type is changed").not.toBeNull();
    expect(shell.root.querySelector(".cv-block-eq")).not.toBeNull();

    await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
    await flush();
    expect(shell.root.querySelector(".cv-block-ssmcs"), "the strip's own area").not.toBeNull();
    expect(shell.root.querySelector(".cv-block-comp"), "COMP is gone").toBeNull();
    expect(shell.root.querySelector(".cv-block-eq"), "and so is EQ").toBeNull();
  });

  it("opens the strip from that area", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    tap(shell.root.querySelector(".cv-block-ssmcs"));
    await flush();
    expect(shell.ctx.nav.current.id).toBe("ch.ssmcs");
  });

  it("leaves a stereo channel the areas it has, which have no strip to swap for", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch_5_6.compEqOrder", "SSMCS");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_5_6" });
    await flush();
    expect(shell.root.querySelector(".cv-block-ssmcs")).toBeNull();
    expect([...shell.root.querySelectorAll(".cv-block")].map((n) => n.className)).toEqual([
      "cv-block cv-block-eq",
      "cv-block cv-block-ducker",
    ]);
  });
});

describe("the SSMCS screens", () => {
  it("steps through the four in order, and stops at each end", async () => {
    const shell = await strip();
    const step = async (dir: "prev" | "next"): Promise<string> => {
      tap(shell.root.querySelector(`.ssmcs-page-${dir}`));
      await flush();
      return shell.ctx.nav.current.id;
    };
    expect(shell.root.querySelector(".ssmcs-page-prev"), "the first screen steps forward only").toBeNull();
    expect(await step("next")).toBe("ch.ssmcs.comp");
    expect(await step("next")).toBe("ch.ssmcs.sc");
    expect(await step("next")).toBe("ch.ssmcs.eq");
    expect(shell.root.querySelector(".ssmcs-page-next"), "the last steps back only").toBeNull();
    expect(await step("prev")).toBe("ch.ssmcs.sc");
    expect(await step("prev")).toBe("ch.ssmcs.comp");
    expect(await step("prev")).toBe("ch.ssmcs");
  });

  it("steps without stacking, so one back press leaves the strip", async () => {
    const shell = await strip();
    for (let i = 0; i < 3; i++) {
      tap(shell.root.querySelector(".ssmcs-page-next"));
      await flush();
    }
    expect(shell.ctx.nav.current.id).toBe("ch.ssmcs.eq");
    shell.ctx.nav.back();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("channel-view");
  });

  it("carries the strip's own switch in the toolbar on all four", async () => {
    for (const id of ["ch.ssmcs", "ch.ssmcs.comp", "ch.ssmcs.sc", "ch.ssmcs.eq"]) {
      const shell = await strip(id);
      const badge = shell.root.querySelector(".badge-ssmcs");
      expect(badge?.textContent, id).toBe("SSMCS");
      expect(badge?.getAttribute("aria-pressed"), `${id} ships on`).toBe("true");
      tap(badge);
      await flush();
      expect(shell.ctx.store.bool("ch.ch1.ssmcs.on", true), `${id} switches it`).toBe(false);
    }
  });

  it("hands the four knobs what each screen's readout bar names", async () => {
    const named = async (id: string): Promise<(string | null)[]> => {
      const shell = await strip(id);
      return [...shell.root.querySelectorAll(".knob-cell")].map((c) => c.querySelector(".knob-cell-label")?.textContent || null);
    };
    expect(await named("ch.ssmcs")).toEqual(["Comp Drive", "Morphing", null, "Out Gain"]);
    expect(await named("ch.ssmcs.comp")).toEqual(["Comp Drive", "Ratio", "Attack", "Release"]);
    expect(await named("ch.ssmcs.sc")).toEqual([null, "SC-Q", "SC-Freq.", "SC-Gain"]);
    expect(await named("ch.ssmcs.eq")).toEqual(["Mid Q", "Mid Freq.", "Mid Gain", "Out Gain"]);
  });
});

describe("the strip's main screen", () => {
  it("switches the compressor and the EQ from the blocks that show them", async () => {
    const shell = await strip();
    const comp = shell.root.querySelector(".ssmcs-block-comp .badge-switch");
    const eq = shell.root.querySelector(".ssmcs-block-eq .badge-switch");
    expect([comp?.textContent, eq?.textContent]).toEqual(["COMP", "EQ"]);

    // They are the channel's own two switches, the same the COMP -> EQ type shows.
    tap(comp);
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.comp.on", false)).toBe(true);
    tap(shell.root.querySelector(".ssmcs-block-eq .badge-switch"));
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.eq.on", true)).toBe(false);
  });

  it("names the Sweet Spot Data on a button that drops the list of them", async () => {
    const shell = await strip();
    expect(shell.root.querySelector(".ssmcs-data")?.textContent).toBe("01 Basic");

    tap(shell.root.querySelector(".ssmcs-data"));
    await flush();
    const options = [...shell.root.querySelectorAll(".ssmcs-data-sheet .source-btn")];
    expect(options.length, "every setting the knob moves between").toBe(34);
    expect(options[0]?.getAttribute("aria-pressed"), "the one it is on").toBe("true");

    tap(options[3]);
    await flush();
    expect(shell.ctx.store.str("ch.ch1.ssmcs.data", "")).toBe("04 Sweep - Boost");
    expect(shell.root.querySelector(".ssmcs-data-sheet"), "the sheet closes on the pick").toBeNull();
  });
});

describe("the compressor the strip runs", () => {
  it("makes up no gain of its own: under the corner the curve is at unity", () => {
    // The corner the factory Comp Drive puts the compressor at, and a level well
    // under it.
    const at = compResponse(-20, 2.5, [10.0, 8.5], 0);
    expect(at(-70)).toBeCloseTo(-70, 5);
    expect(at(-60)).toBeCloseTo(-60, 5);
  });

  it("lifts the whole curve by the Out Gain and nothing else", () => {
    const plain = compResponse(-20, 2.5, [10.0, 8.5], 0);
    const lifted = compResponse(-20, 2.5, [10.0, 8.5], 6);
    for (const db of [-70, -30, -10, 0, 10]) expect(lifted(db) - plain(db)).toBeCloseTo(6, 5);
  });

  it("draws the curve at unity under the corner, so nothing is made up on the glass", async () => {
    const shell = await strip("ch.ssmcs.comp");
    const points = (shell.root.querySelector(".dyn-plot .dyn-curve-line")?.getAttribute("points") ?? "")
      .split(" ")
      .map((p) => p.split(",").map(Number) as [number, number]);
    // The curve is drawn a decibel at a time from -80 dB, on a plot 198x130 that
    // reads -80..+20 dB both ways, so a level well under the corner lands on the
    // plot's own diagonal.
    for (const db of [-70, -50, -40]) {
      const at = points[db + 80];
      expect(at?.[0], `${db} dB across`).toBeCloseTo(((db + 80) / 100) * 198, 1);
      expect(at?.[1], `${db} dB up`).toBeCloseTo(((20 - db) / 100) * 130, 1);
    }
  });

  it("draws the same curve on the side chain screen, without the two handles", async () => {
    const comp = await strip("ch.ssmcs.comp");
    const sc = await strip("ch.ssmcs.sc");
    const points = (shell: Shell): string | null | undefined =>
      shell.root.querySelector(".dyn-plot .dyn-curve-line")?.getAttribute("points");

    expect(points(sc), "the compressor's curve, not the filter's").toBe(points(comp));
    expect(comp.root.querySelectorAll(".dyn-handle").length).toBe(2);
    expect(sc.root.querySelectorAll(".dyn-handle").length).toBe(0);
  });

  it("names the filter's three shortly on the rows, the readout bar keeping the SC- names", async () => {
    const shell = await strip("ch.ssmcs.sc");
    expect([...shell.root.querySelectorAll(".ssmcs-sets .dyn-set-caption")].map((n) => n.textContent)).toEqual([
      "Q",
      "Frequency",
      "Gain",
    ]);
    expect([...shell.root.querySelectorAll(".knob-cell .knob-cell-label")].map((n) => n.textContent).filter((t) => t)).toEqual([
      "SC-Q",
      "SC-Freq.",
      "SC-Gain",
    ]);
  });

  it("sets Comp Drive and Ratio from the two grips on the curve", async () => {
    // User guide, "SSMCS > COMP screen": the compressor is set by working its graph directly.
    const shell = await strip("ch.ssmcs.comp");
    const drag = async (letter: string, dx: number, dy: number): Promise<void> => {
      shell.root
        .querySelector(`[aria-label^="${letter} handle"]`)
        ?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
      await flush();
    };
    const drive = (): number => shell.ctx.store.num("ch.ch1.ssmcs.compDrive", 0);
    const ratio = (): number => shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0);
    const [d0, r0] = [drive(), ratio()];
    // More drive takes the corner D stands on to the left.
    await drag("D", -40, 0);
    expect(drive()).toBeGreaterThan(d0);
    // A higher ratio takes the far end R stands on down.
    await drag("R", 0, 20);
    expect(ratio()).toBeGreaterThan(r0);
  });

  it("steps the ratio through the unit's stops from 38:1 to INF and back, a key press at a time", async () => {
    // The stops the unit's knob takes above 38:1 (URX44V, 2026-09-22).
    const shell = await strip("ch.ssmcs.comp");
    const cell = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find((c) => c.querySelector(".knob-cell-label")?.textContent === "Ratio");
    const reading = (): string => cell()?.querySelector(".knob-cell-value")?.textContent ?? "";
    const key = async (name: string): Promise<void> => {
      cell()?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await flush();
    };
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 38);
    await flush();
    const read = [reading()];
    for (let i = 0; i < 16; i++) {
      await key("ArrowUp");
      read.push(reading());
    }
    expect(read).toEqual([
      "38.0:1", "40.0:1", "45.0:1", "50.0:1", "55.0:1", "60.0:1", "65.0:1", "70.0:1", "80.0:1", "90.0:1",
      "100:1", "150:1", "200:1", "300:1", "500:1", "INF:1", "INF:1",
    ]);
    expect(shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0)).toBe(Number.POSITIVE_INFINITY);
    await key("ArrowDown");
    expect(reading(), "and back down one stop").toBe("500:1");
  });

  it("steps the ratio through the unit's stops from 4.00:1 up to 38.0:1", async () => {
    // The stops the unit's knob takes from 4.00:1 (URX44V, 2026-09-22), read to three figures.
    const shell = await strip("ch.ssmcs.comp");
    const cell = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find((c) => c.querySelector(".knob-cell-label")?.textContent === "Ratio");
    const reading = (): string => cell()?.querySelector(".knob-cell-value")?.textContent ?? "";
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 4);
    await flush();
    const read = [reading()];
    while (!read.includes("38.0:1") && read.length < 60) {
      cell()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await flush();
      read.push(reading());
    }
    expect(read.map((r) => r.replace(":1", "")).join(" ")).toBe(
      "4.00 4.10 4.20 4.30 4.40 4.50 4.60 4.70 4.80 4.90 5.00 5.20 5.40 5.60 5.80 6.00 6.20 6.40 6.60 6.80 " +
        "7.00 7.50 8.00 8.50 9.00 9.50 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0 " +
        "22.0 24.0 26.0 28.0 30.0 32.0 34.0 36.0 38.0",
    );
    // Below 4.00:1 the knob takes sixty stops of 0.05 from 1.00:1 (URX44V, 2026-09-23).
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 1);
    await flush();
    const low = [reading()];
    for (let i = 0; i < 60; i++) {
      cell()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await flush();
      low.push(reading());
    }
    expect([low[0], low[1], low[59], low[60]]).toEqual(["1.00:1", "1.05:1", "3.95:1", "4.00:1"]);
    expect(new Set(low).size, "sixty-one stops, each its own value").toBe(61);
  });

  it("switches the filter from the button over the three rows", async () => {
    const shell = await strip("ch.ssmcs.sc");
    const button = shell.root.querySelector(".ssmcs-sc-switch");
    expect([button?.textContent, button?.getAttribute("aria-pressed")]).toEqual(["Side Chain", "true"]);
    tap(button);
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.ssmcs.sc.on", true)).toBe(false);
  });
});

describe("the strip's EQ screen", () => {
  it("puts the three bands on the graph and follows the one picked", async () => {
    const shell = await strip("ch.ssmcs.eq");
    expect([...shell.root.querySelectorAll(".eq-grip")].map((g) => g.textContent)).toEqual(["L", "M", "H"]);
    expect(shell.root.querySelector(".ssmcs-band")?.textContent, "the one the screen opens on").toBe("Mid");

    tap(shell.root.querySelector('.eq-grip[aria-label="Low band"]'));
    await flush();
    expect(shell.root.querySelector(".ssmcs-band")?.textContent).toBe("Low");
    expect([...shell.root.querySelectorAll(".knob-cell .knob-cell-label")].map((n) => n.textContent).filter((t) => t)).toEqual([
      "Low Q",
      "Low Freq.",
      "Low Gain",
      "Out Gain",
    ]);
  });

  it("sets a band's frequency along the graph and its gain up it, from its grip", async () => {
    // User guide, "SSMCS > EQ screen": each band is set by working the EQ graph directly.
    const shell = await strip("ch.ssmcs.eq");
    const values = (): number[] =>
      ["low.freq", "low.gain", "mid.freq", "mid.gain"].map((k) => shell.ctx.store.num(`ch.ch1.ssmcs.eq.${k}`, 0));
    const before = values();
    shell.root
      .querySelector('.eq-grip[aria-label="Low band"]')
      ?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140, clientY: 80, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 140, clientY: 80, bubbles: true }));
    await flush();
    expect(values().map((v, i) => Math.sign(v - (before[i] ?? 0))), "Low up and right, Mid where it was").toEqual([1, 1, 0, 0]);
    expect(shell.root.querySelector(".ssmcs-band")?.textContent, "and the drag picks the band").toBe("Low");
  });

  it("switches the band the graph is set on from the button beside the block's switch", async () => {
    const shell = await strip("ch.ssmcs.eq");
    const band = shell.root.querySelector(".ssmcs-band");
    expect(band?.getAttribute("aria-pressed")).toBe("true");
    tap(band);
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.ssmcs.eq.mid.on", true)).toBe(false);
    expect(shell.root.querySelector(".ssmcs-band")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves the curve flat while every band is at no gain", async () => {
    const shell = await strip("ch.ssmcs.eq");
    const points = (shell.root.querySelector(".eq-curve-line")?.getAttribute("points") ?? "").split(" ");
    const ys = new Set(points.map((p) => p.split(",")[1]));
    expect([...ys], "one height the whole way across").toEqual(["68.0"]);
  });

  it("bends the curve to the band it is given, keeping the peak at the frequency set", async () => {
    const shell = await strip("ch.ssmcs.eq");
    await shell.ctx.store.set("ch.ch1.ssmcs.eq.mid.freq", 1002);
    await shell.ctx.store.set("ch.ch1.ssmcs.eq.mid.gain", 12);
    await flush();
    const points = (shell.root.querySelector(".eq-curve-line")?.getAttribute("points") ?? "")
      .split(" ")
      .map((p) => p.split(",").map(Number) as [number, number]);
    const peak = points.reduce((best, p) => ((p[1] ?? 0) < (best[1] ?? 0) ? p : best));
    // 1 kHz stands where its decade does on a plot ruled 20 Hz to 20 kHz.
    expect(peak[0] / 414).toBeCloseTo(Math.log10(1002 / 20) / 3, 2);
    // 12 dB up a plot that reads 20 dB either side of the middle.
    expect(peak[1]).toBeCloseTo(68 - (12 / 40) * 136, 0);
  });

  it("gives the bell the width the guide's own draws, not the width its number names", async () => {
    const shell = await strip("ch.ssmcs.eq");
    await shell.ctx.store.set("ch.ch1.ssmcs.eq.mid.freq", 1002);
    await shell.ctx.store.set("ch.ch1.ssmcs.eq.mid.gain", 12);
    await shell.ctx.store.set("ch.ch1.ssmcs.eq.mid.q", 1);
    await flush();
    const points = (shell.root.querySelector(".eq-curve-line")?.getAttribute("points") ?? "")
      .split(" ")
      .map((p) => p.split(",").map(Number) as [number, number]);
    const at = (hz: number): number => {
      const x = (Math.log10(hz / 20) / 3) * 414;
      const near = points.reduce((best, p) => (Math.abs((p[0] ?? 0) - x) < Math.abs((best[0] ?? 0) - x) ? p : best));
      return ((68 - (near[1] ?? 0)) / 136) * 40;
    };
    // An octave off the middle of a bell set to Q 1 and 12 dB. A biquad taking the
    // number as its own Q reads 3.9 dB here, and one half of it 7.4.
    expect(at(2004)).toBeCloseTo(5.7, 0);
    expect(at(501)).toBeCloseTo(5.8, 0);
  });
});

describe("where the strip puts its boxes", () => {
  const CSS = readStyle("lcd.css");
  const box = (selector: string): number[] => {
    const d = declarations(CSS, selector);
    return [px(d["left"]), px(d["top"]), px(d["width"]), px(d["height"])];
  };

  it("stands the two blocks and their parts where p108-1 has them", () => {
    // Read off the figure with the main area's own origin, the glass at 2,50.
    expect(box(".ssmcs-block-comp").slice(0, 2)).toEqual([0, 0]);
    expect(px(declarations(CSS, ".ssmcs-block")["height"])).toBe(90);
    expect(px(declarations(CSS, ".ssmcs-block-comp")["width"])).toBe(165);
    expect(box(".ssmcs-block-eq").slice(0, 3)).toEqual([173, 1, 237]);
    expect(box(".ssmcs-comp-thumb")).toEqual([69, 7, 81, 73]);
    expect(box(".ssmcs-eq-thumb")).toEqual([73, 7, 159, 75]);
    expect(box(".ssmcs-block .ssmcs-gr")).toEqual([155, 14, 4, 56]);
  });

  it("stands the two knob panels and the Sweet Spot Data where p108-1 has them", () => {
    const panel = declarations(CSS, ".ssmcs-knob-panel");
    expect([px(panel["top"]), px(panel["height"])]).toEqual([94, 84]);
    expect([px(declarations(CSS, ".ssmcs-drive")["left"]), px(declarations(CSS, ".ssmcs-drive")["width"])]).toEqual([10, 86]);
    expect([px(declarations(CSS, ".ssmcs-morphing")["left"]), px(declarations(CSS, ".ssmcs-morphing")["width"])]).toEqual([114, 300]);
    // The name, the value and the knob line up on the 86px column at the left,
    // whatever the panel's own width.
    expect(px(declarations(CSS, ".ssmcs-caption")["width"])).toBe(86);
    expect(declarations(CSS, ".ssmcs-caption")["text-align"]).toBe("center");
    expect(box(".lcd .ssmcs-knob-panel .value-box")).toEqual([17, 19, 52, 22]);
    // 37 rows of face over a 3px band, y167..206 in p108-1.
    expect(box(".lcd .ssmcs-data")).toEqual([84, 23, 202, 40]);
    expect(declarations(CSS, ".lcd .ssmcs-data")["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel-sunk)");
    expect(declarations(CSS, ".lcd .ssmcs-data")["padding"], "the name centres on the face above the band").toBe("0 0 3px");
    // The copy mark is 10x10 at x387..396 / y172..181, in a grey of its own, its strokes on whole pixels.
    const mark = declarations(CSS, ".ssmcs-data-mark");
    expect([mark["width"], mark["height"], mark["right"], mark["top"], mark["color"]].map((v) => v ?? "")).toEqual(["10px", "10px", "5px", "5px", "var(--ssmcs-data-mark)"]);
    expect(declarations(CSS, ".ssmcs-data-mark svg")["shape-rendering"]).toBe("crispEdges");
    expect(declarations(readStyle("tokens.css"), ":root")["--ssmcs-data-mark"]).toBe("#8c9694");
  });

  it("stands the compressor's plot and the side chain's switch where p110-1 and p111-1 have them", () => {
    // A 1px frame around the 198x130 the figure reads inside it.
    expect(box(".ssmcs-dyn .dyn-plot")).toEqual([19, 40, 200, 132]);
    // The key meter is the same bar an IN / OUT column carries: x7..12 /
    // y118..225 in both figures, six columns wide over 108 rows.
    expect(box(".ssmcs-sc-meter")).toEqual([5, 68, 6, 108]);
    expect(px(declarations(CSS, ".ssmcs-sc-meter .meter-bar")["width"])).toBe(6);
    expect([
      px(declarations(CSS, ".ssmcs-sc-meter .meter-clip")["width"]),
      px(declarations(CSS, ".ssmcs-sc-meter .meter-clip")["height"]),
    ]).toEqual([6, 6]);
    // 40 tall: 37 of face over the 3 px band every lit title box carries.
    expect(box(".lcd .ssmcs-sc-switch")).toEqual([249, 0, 167, 40]);
    expect(px(declarations(CSS, ".ssmcs-dyn .ssmcs-sets")["bottom"])).toBe(9);
  });

  it("stands the EQ band button where p112-1 has it, on the graph the EQ screen uses", () => {
    expect(box(".lcd .ssmcs-band")).toEqual([105, -1, 93, 38]);
    expect(box(".lcd .ssmcs-block-switch.badge-title")).toEqual([0, -1, 93, 38]);
    // The three carry their names smaller than a title box's own size.
    expect(declarations(CSS, ".lcd .ssmcs-block-switch.badge-title")["font-size"]).toBe("16.5px");
    expect(declarations(CSS, ".lcd .ssmcs-band")["font-size"]).toBe("17px");
    expect(declarations(CSS, ".lcd .ssmcs-sc-switch")["font-size"]).toBe("12.5px");
    expect(declarations(CSS, ".ssmcs-eq-plot"), "no frame of its own").toEqual({});
  });

  it("gives the channel view's area the two columns COMP and EQ had", () => {
    // The guide names the area but shows no figure of it, so it takes the shape
    // of the blocks it stands among: one badge over a body, two columns wide.
    expect(declarations(CSS, ".cv-block.cv-block-ssmcs")["grid-column"]).toBe("-4 / -2");
    expect(declarations(CSS, ".cv-block:has(~ .cv-block-ssmcs)")["grid-column"], "the block before it").toBe("-5");
    const body = declarations(CSS, ".cv-ssmcs");
    expect([body["display"], body["flex-direction"]], "the two curves side by side").toEqual(["flex", "row"]);
    // The pair keeps the proportions the main screen draws the same two curves at,
    // 81x73 and 159x75, so the EQ's reads about twice as wide as the compressor's.
    const w = (sel: string): number => px(declarations(CSS, sel)["width"]);
    const shared = declarations(CSS, ".cv-ssmcs-comp");
    const h = px(shared["height"]);
    expect(w(".cv-ssmcs-comp") / h).toBeCloseTo(81 / 73, 1);
    expect(w(".cv-ssmcs-eq") / h).toBeCloseTo(159 / 75, 1);
    expect(shared["background"], "the graph's own ground under both").toBe("var(--graph-bg)");
  });

  it("draws the same two curves in the channel view as on the main screen", async () => {
    const view = await mount();
    await view.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
    view.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const main = await strip();
    const curves = (shell: Shell, root: string): (string | null)[] =>
      [...shell.root.querySelectorAll(`${root} svg`)].map((s) => s.getAttribute("viewBox"));
    expect(curves(view, ".cv-ssmcs")).toEqual(curves(main, ".ssmcs-thumb"));
    // The compressor's curve carries the compressor's own colours and rules, not
    // the EQ's: the channel view drew it in the EQ's line before.
    for (const shell of [view, main]) {
      const comp = shell.root.querySelector(".dyn-curve");
      expect(comp?.querySelector(".dyn-curve-line"), "the compressor's line").not.toBeNull();
      expect(comp?.querySelectorAll(":scope > line.dyn-grid").length, "one rule each way").toBe(2);
    }
    expect(view.root.querySelectorAll(".cv-ssmcs .ssmcs-eq-curve .dyn-grid").length, "the EQ's six rules").toBe(6);

    // The EQ's rules stand at 100 Hz / 1 kHz / 10 kHz and +10 / 0 / -10 dB, as
    // they do on the EQ screen, each on one whole column or row of the 159x75 it
    // is drawn in.
    const rules = [...view.root.querySelectorAll(".cv-ssmcs .ssmcs-eq-curve .dyn-grid")];
    const across = rules.filter((r) => r.getAttribute("x1") === r.getAttribute("x2"));
    const down = rules.filter((r) => r.getAttribute("y1") === r.getAttribute("y2"));
    expect(across.map((r) => r.getAttribute("x1"))).toEqual(["37.5", "90.5", "143.5"]);
    expect(down.map((r) => r.getAttribute("y1"))).toEqual(["18.5", "37.5", "56.5"]);
  });

  it("lights the two block switches in shades of their own, both names in white", () => {
    // p112-1's [EQ] is a darker green than the EQ block's, and both switches
    // carry a darker band than the title badges they borrow their shape from.
    const eq = declarations(CSS, ".lcd .badge.badge-title.ssmcs-block-switch.badge-eq.is-on");
    expect([eq["background"], eq["color"], eq["--pt-band"]]).toEqual([
      "var(--ssmcs-switch-eq)",
      "var(--text)",
      "var(--ssmcs-switch-eq-band)",
    ]);
    const comp = declarations(CSS, ".lcd .badge.badge-title.ssmcs-block-switch.badge-comp.is-on");
    expect(comp["--pt-band"]).toBe("var(--ssmcs-switch-comp-band)");
    const TOKENS = readStyle("tokens.css");
    expect(declarations(TOKENS, ":root")["--ssmcs-switch-eq"]).toBe("#4aaa31");
    expect(declarations(TOKENS, ":root")["--ssmcs-switch-eq-band"]).toBe("#295519");
    expect(declarations(TOKENS, ":root")["--ssmcs-switch-comp-band"]).toBe("#6b2419");
  });

  it("lays the page arrows over the sides of the glass", () => {
    const arrow = declarations(CSS, ".lcd .ssmcs-page");
    expect([px(arrow["top"]), px(arrow["width"]), px(arrow["height"])]).toEqual([67, 36, 36]);
    expect(arrow["border-radius"], "a disc").toBe("50%");
    expect(px(declarations(CSS, ".ssmcs-page-prev")["left"])).toBe(2);
    expect(px(declarations(CSS, ".ssmcs-page-next")["left"])).toBe(384);
  });
});

describe("the side chain's own meter", () => {
  it("reads what the filter is feeding the detector, and its floor while the chain is open", async () => {
    setMeterSource(() => [-30]);
    try {
      const shell = await mount();
      await shell.ctx.store.set("ch.ch1.comp.on", false);
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.ssmcs.sc", strip: "ch1" });
      await flush();
      const bar = (): string => shell.root.querySelector<HTMLElement>(".ssmcs-sc-meter .meter-bar")?.style.getPropertyValue("--unlit") ?? "";
      expect(bar(), "nothing reaches the detector while the compressor is off").toBe("100%");

      await shell.ctx.store.set("ch.ch1.comp.on", true);
      await flush();
      const lit = bar();
      expect(lit, "the key is metered once the chain is closed").not.toBe("100%");

      await shell.ctx.store.set("ch.ch1.ssmcs.sc.gain", SSMCS_DEFAULTS.sc.gain + 6);
      await flush();
      expect(Number.parseFloat(bar()), "and the filter's gain lifts it").toBeLessThan(Number.parseFloat(lit));

      await shell.ctx.store.set("ch.ch1.ssmcs.sc.on", false);
      await flush();
      expect(bar(), "an open side chain feeds nothing").toBe("100%");
    } finally {
      setMeterSource(null);
    }
  });
});
