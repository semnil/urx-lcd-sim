import { describe, expect, it } from "vitest";
import type { Route } from "../app/navigator";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { GEQ_BANDS, geqBandPath } from "../model/geq";
import { findStrip } from "../model/types";
import { unitById } from "../model/units";
import { dropGeqOverRate, setEqType, setGeqLimit } from "./geq";
import { buildRegistry } from "./index";

// Flex12GEQ on the stereo bus and the MIX buses: the EQ Type that runs it, each
// side's GEQ Limit, what the unit changes along with them, and where CH SETTING
// and the channel view show them.

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function mount(start: Route[] = []): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, start);
  await flush();
  return shell;
}

const strip = (shell: Shell, id: string) => {
  const s = findStrip(shell.ctx.model, id);
  if (!s) throw new Error(`no ${id}`);
  return s;
};

const bands = (shell: Shell, id: string, side: "l" | "r"): number[] => GEQ_BANDS.map((_, b) => shell.ctx.store.num(geqBandPath(`ch.${id}`, side, b), 99));

describe("the EQ Type", () => {
  it.each([
    ["bus.stereo", "Off"],
    ["bus.mix1", "L>R"],
  ])("ships %s on 4band PEQ, with its GEQ Link %s", async (id, link) => {
    const shell = await mount();
    expect([shell.ctx.store.str(`ch.${id}.eqType`, ""), shell.ctx.store.str(`ch.${id}.geq.link`, "")]).toEqual(["4band PEQ", link]);
  });

  it.each([
    ["bus.stereo", "Off"],
    ["bus.mix1", "Off"],
  ])("turns %s's EQ on when it goes to Flex12GEQ, and its GEQ Link to %s", async (id, link) => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set(`ch.${id}.eq.on`, false);
    setEqType(shell.ctx, strip(shell, id), "Flex12GEQ");
    await flush();
    expect([s.str(`ch.${id}.eqType`, ""), s.bool(`ch.${id}.eq.on`, false), s.str(`ch.${id}.geq.link`, "")]).toEqual(["Flex12GEQ", true, link]);
  });

  it("changes nothing else when it goes back to 4band PEQ", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    setEqType(shell.ctx, strip(shell, "bus.mix1"), "Flex12GEQ");
    await s.set("ch.bus.mix1.eq.on", false);
    await s.set("ch.bus.mix1.geq.link", "R>L");
    setEqType(shell.ctx, strip(shell, "bus.mix1"), "4band PEQ");
    await flush();
    expect([s.str("ch.bus.mix1.eqType", ""), s.bool("ch.bus.mix1.eq.on", true), s.str("ch.bus.mix1.geq.link", "")]).toEqual(["4band PEQ", false, "R>L"]);
  });
});

describe("the GEQ Limit", () => {
  it("pulls the side's bands into a narrower window, and leaves them there when it widens again", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set(geqBandPath("ch.bus.stereo", "l", 17), 10);
    await s.set(geqBandPath("ch.bus.stereo", "l", 7), -10);
    setGeqLimit(shell.ctx, strip(shell, "bus.stereo"), "l", "±6dB");
    await flush();
    expect([s.num(geqBandPath("ch.bus.stereo", "l", 17), 0), s.num(geqBandPath("ch.bus.stereo", "l", 7), 0)]).toEqual([6, -6]);
    setGeqLimit(shell.ctx, strip(shell, "bus.stereo"), "l", "±15dB");
    await flush();
    expect([s.num(geqBandPath("ch.bus.stereo", "l", 17), 0), s.num(geqBandPath("ch.bus.stereo", "l", 7), 0)]).toEqual([6, -6]);
  });

  it("takes a band above 0 dB to 0 dB at -24dB, and leaves a cut where it stands", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set(geqBandPath("ch.bus.stereo", "l", 17), 6);
    await s.set(geqBandPath("ch.bus.stereo", "l", 7), -6);
    setGeqLimit(shell.ctx, strip(shell, "bus.stereo"), "l", "-24dB");
    await flush();
    expect([s.num(geqBandPath("ch.bus.stereo", "l", 17), 99), s.num(geqBandPath("ch.bus.stereo", "l", 7), 0)]).toEqual([0, -6]);
  });

  it.each([
    ["Off", ["±12dB", "±15dB"], -15],
    ["L>R", ["±12dB", "±12dB"], -12],
  ])("with the GEQ Link %s, sets the other side to %j", async (link, limits, other) => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("ch.bus.stereo.geq.link", link);
    for (const side of ["l", "r"] as const) await s.set(geqBandPath("ch.bus.stereo", side, 7), -15);
    setGeqLimit(shell.ctx, strip(shell, "bus.stereo"), "l", "±12dB");
    await flush();
    expect([s.str("ch.bus.stereo.geq.l.limit", ""), s.str("ch.bus.stereo.geq.r.limit", "")]).toEqual(limits);
    expect(s.num(geqBandPath("ch.bus.stereo", "r", 7), 0)).toBe(other);
  });
});

describe("a sampling frequency over 48 kHz", () => {
  it("puts a bus on Flex12GEQ back on 4band PEQ with every band at 0 dB, and leaves the rest", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    setEqType(shell.ctx, strip(shell, "bus.stereo"), "Flex12GEQ");
    await s.set(geqBandPath("ch.bus.stereo", "l", 17), 2);
    await s.set(geqBandPath("ch.bus.stereo", "r", 3), -4);
    await s.set("ch.bus.stereo.geq.r.limit", "±6dB");
    await s.set("ch.bus.stereo.geq.l.on", false);
    dropGeqOverRate(shell.ctx, 88200);
    await flush();
    expect(s.str("ch.bus.stereo.eqType", "")).toBe("4band PEQ");
    expect([...bands(shell, "bus.stereo", "l"), ...bands(shell, "bus.stereo", "r")].every((g) => g === 0)).toBe(true);
    expect([s.str("ch.bus.stereo.geq.r.limit", ""), s.bool("ch.bus.stereo.geq.l.on", true), s.bool("ch.bus.stereo.eq.on", false)]).toEqual(["±6dB", false, true]);
  });

  it("leaves a bus on Flex12GEQ alone at 48 kHz", async () => {
    const shell = await mount();
    setEqType(shell.ctx, strip(shell, "bus.mix2"), "Flex12GEQ");
    dropGeqOverRate(shell.ctx, 48000);
    await flush();
    expect(shell.ctx.store.str("ch.bus.mix2.eqType", "")).toBe("Flex12GEQ");
  });
});

describe("CH SETTING of a bus", () => {
  const captions = (shell: Shell): string[] => [...shell.root.querySelectorAll(".chs-caption")].map((c) => c.textContent ?? "");

  it("shows GEQ Limit under BUS Type while the bus runs Flex12GEQ, for the side in view", async () => {
    const shell = await mount([{ id: "ch.setting", strip: "bus.mix1" }]);
    expect(captions(shell)).toEqual(["Color", "Icon", "Name", "EQ Type", "BUS Type"]);
    setEqType(shell.ctx, strip(shell, "bus.mix1"), "Flex12GEQ");
    await shell.ctx.store.set("ch.bus.mix1.geq.l.limit", "±12dB");
    await flush();
    expect(captions(shell)).toEqual(["Color", "Icon", "Name", "EQ Type", "BUS Type", "GEQ Limit"]);
    expect(shell.root.querySelector(".chs-geqlimit-field .pulldown")?.textContent).toContain("±12dB");
  });

  it("leaves EQ Type out over 48 kHz", async () => {
    const shell = await mount([{ id: "ch.setting", strip: "bus.stereo" }]);
    await shell.ctx.store.set("setup.samplingFrequency", 88200);
    await flush();
    expect(captions(shell)).toEqual(["Color", "Icon", "Name"]);
  });
});

describe("the channel view of a bus", () => {
  it("shows the GEQ area in place of the EQ area while the bus runs Flex12GEQ, switched by the side's [GEQ]", async () => {
    const shell = await mount([{ id: "channel-view", strip: "bus.stereo" }]);
    expect([shell.root.querySelector(".cv-block-eq"), shell.root.querySelector(".cv-block-geq")].map((n) => n !== null)).toEqual([true, false]);
    setEqType(shell.ctx, strip(shell, "bus.stereo"), "Flex12GEQ");
    await flush();
    expect([shell.root.querySelector(".cv-block-eq"), shell.root.querySelector(".cv-block-geq")].map((n) => n !== null)).toEqual([false, true]);
    const badge = shell.root.querySelector<HTMLElement>(".cv-block-geq .badge-geq");
    expect(badge?.getAttribute("aria-pressed")).toBe("true");
    badge?.click();
    await flush();
    expect([shell.ctx.store.bool("ch.bus.stereo.geq.l.on", true), shell.ctx.store.bool("ch.bus.stereo.geq.r.on", false)]).toEqual([false, true]);
  });

  it("marks each band of the side at its gain: 0 dB on the middle row, 1.2px to a dB, held to the slot", async () => {
    const shell = await mount([{ id: "channel-view", strip: "bus.stereo" }]);
    setEqType(shell.ctx, strip(shell, "bus.stereo"), "Flex12GEQ");
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 1), 10);
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 9), -15);
    await shell.ctx.store.set(geqBandPath("ch.bus.stereo", "l", 11), -24);
    await flush();
    const marks = [...shell.root.querySelectorAll(".cv-block-geq .geq-mark")].map((m) => [Number(m.getAttribute("x")), Number(m.getAttribute("y"))]);
    expect(marks).toHaveLength(31);
    expect([marks[0], marks[1], marks[9], marks[11], marks[30]]).toEqual([[9, 21], [11, 9], [27, 39], [31, 39], [69, 21]]);
  });
});
