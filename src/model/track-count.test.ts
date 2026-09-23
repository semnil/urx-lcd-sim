import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "./defaults";
import { unitById } from "./units";
import { buildRegistry } from "../screens/index";
import { trackCountAtRate, trackCountCeiling } from "./track-count";

// The recorder carries 16 tracks at 44.1 / 48 kHz, 8 at 88.2 / 96 and 2 at
// 176.4 / 192. The unit lowers its own count to fit a frequency it is given and
// does not raise it again when the frequency comes back down.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(id: "URX44V" | "URX22" = "URX44V"): Promise<Shell> {
  const model = unitById(id);
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return shell;
}

/** Take the SAMPLING FREQUENCY screen to `label`. */
async function pickRate(shell: Shell, label: string): Promise<void> {
  shell.ctx.nav.push({ id: "setup" });
  shell.ctx.nav.push({ id: "setup.rate" });
  await flush();
  [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")].find((b) => b.textContent === label)?.click();
  await flush();
  shell.ctx.nav.home();
  await flush();
}

describe("how many tracks a frequency carries", () => {
  it("names the ceiling of every frequency the unit runs at", () => {
    expect([44100, 48000].map(trackCountCeiling)).toEqual([16, 16]);
    expect([88200, 96000].map(trackCountCeiling)).toEqual([8, 8]);
    expect([176400, 192000].map(trackCountCeiling)).toEqual([2, 2]);
  });

  it("lowers a count that does not fit and leaves one that does", () => {
    expect(trackCountAtRate(16, 96000)).toBe(8);
    expect(trackCountAtRate(16, 192000)).toBe(2);
    expect(trackCountAtRate(8, 96000), "a count the frequency carries stands").toBe(8);
    expect(trackCountAtRate(2, 48000), "and a raise never gives one back").toBe(2);
  });
});

describe("the recorder when the sampling frequency moves", () => {
  it("loses the tracks the new frequency cannot carry, and does not get them back", async () => {
    const shell = await mount();
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(16);

    await pickRate(shell, "96kHz");
    expect(shell.ctx.store.num("sd.trackCount", 0), "16 does not fit 96 kHz").toBe(8);

    await pickRate(shell, "192kHz");
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(2);

    await pickRate(shell, "48kHz");
    expect(shell.ctx.store.num("sd.trackCount", 0), "coming back down gives nothing back").toBe(2);
  });

  it("leaves a count the new frequency still carries where it is", async () => {
    const shell = await mount();
    await shell.ctx.store.set("sd.trackCount", 8);
    await pickRate(shell, "96kHz");
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(8);
  });

  it("draws the counts the frequency cannot carry on a face that takes nothing", async () => {
    const shell = await mount();
    await shell.ctx.store.set("setup.samplingFrequency", 96000);
    shell.ctx.nav.push({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();
    shell.root.querySelector<HTMLElement>(".dropdown-box")?.click();
    await flush();

    const options = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")];
    expect(options.map((o) => o.textContent), "the list keeps all eight").toEqual([
      "2 Tracks",
      "4 Tracks",
      "6 Tracks",
      "8 Tracks",
      "10 Tracks",
      "12 Tracks",
      "14 Tracks",
      "16 Tracks",
    ]);
    expect(
      options.filter((o) => o.classList.contains("is-disabled")).map((o) => o.textContent),
      "and darkens the four 96 kHz cannot carry",
    ).toEqual(["10 Tracks", "12 Tracks", "14 Tracks", "16 Tracks"]);

    const held = shell.ctx.store.num("sd.trackCount", 0);
    options.find((o) => o.textContent === "16 Tracks")?.click();
    await flush();
    expect(shell.ctx.store.num("sd.trackCount", 0), "and takes nothing when one is pressed").toBe(held);
    expect(shell.root.querySelector(".dropdown-list"), "the list stays open").not.toBeNull();

    options.find((o) => o.textContent === "6 Tracks")?.click();
    await flush();
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(6);
  });

  it("says nothing on a unit with no recorder", async () => {
    const shell = await mount("URX22");
    expect(shell.ctx.store.has("sd.trackCount")).toBe(false);
    await pickRate(shell, "192kHz");
    expect(shell.ctx.store.has("sd.trackCount"), "and none is invented").toBe(false);
  });
});
