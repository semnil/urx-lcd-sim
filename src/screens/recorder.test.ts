import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { freeBytes } from "../model/card";
import { recordTake, stopTake } from "./recording";

// Track Count is a value with eight settings. It sits in the toolbar as a box
// that opens the list of them, rather than as eight buttons taking up the screen.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  shell.ctx.nav.push({ id: "microsd.recorder" });
  await flush();
  return shell;
}

const box = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(".dropdown-box");
const options = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")];

async function openList(shell: Shell): Promise<HTMLElement[]> {
  box(shell)?.click();
  await flush();
  return options(shell);
}

describe("the RECORDER track count", () => {
  it("sits in the toolbar, not as a row of buttons on the screen", async () => {
    const shell = await mount();
    expect(box(shell)?.textContent).toBe("Track Count▼");
    expect(shell.root.querySelector(".toolbar-left .dropdown-box"), "it is a toolbar control").not.toBeNull();
    expect(options(shell).length, "the settings are out of sight until it is opened").toBe(0);
  });

  it("opens every setting, with the one in force lit", async () => {
    const shell = await mount();
    const listed = await openList(shell);
    expect(listed.map((o) => o.textContent)).toEqual([
      "2 Tracks",
      "4 Tracks",
      "6 Tracks",
      "8 Tracks",
      "10 Tracks",
      "12 Tracks",
      "14 Tracks",
      "16 Tracks",
    ]);
    expect(listed.filter((o) => o.classList.contains("is-on")).map((o) => o.textContent)).toEqual(["16 Tracks"]);
  });

  it("takes the setting picked and closes", async () => {
    const shell = await mount();
    const listed = await openList(shell);
    listed.find((o) => o.textContent === "8 Tracks")?.click();
    await flush();
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(8);
    expect(shell.root.querySelector(".dropdown-sheet"), "picking closes the list").toBeNull();
    // Four stereo slots for eight tracks, which is what the count is for.
    expect(shell.root.querySelectorAll(".rec-slot").length).toBe(4);
    expect((await openList(shell)).filter((o) => o.classList.contains("is-on")).map((o) => o.textContent)).toEqual([
      "8 Tracks",
    ]);
  });

  it("closes on a tap beside the list, leaving the setting alone", async () => {
    const shell = await mount();
    await openList(shell);
    const before = shell.ctx.store.num("sd.trackCount", 0);
    shell.root.querySelector(".dropdown-sheet")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.root.querySelector(".dropdown-sheet")).toBeNull();
    expect(shell.ctx.store.num("sd.trackCount", 0)).toBe(before);
  });

  it("keeps a tap on the list itself from closing it", async () => {
    const shell = await mount();
    await openList(shell);
    shell.root.querySelector(".dropdown-list")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.root.querySelector(".dropdown-sheet"), "the tray is not a way out").not.toBeNull();
  });

  it("gives Escape to the list, not to the screen behind it", async () => {
    const shell = await mount();
    await openList(shell);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    expect(shell.root.querySelector(".dropdown-sheet"), "the list closed").toBeNull();
    expect(shell.ctx.nav.current.id, "RECORDER stayed open").toBe("microsd.recorder");

    // With the list shut, the key goes back to leaving the screen.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
  });
});

describe("the record-track source sheet", () => {
  it("covers the RECORDER rather than replacing it, and names the track", async () => {
    const shell = await mount();
    const depth = shell.ctx.nav.depth;
    shell.root.querySelector<HTMLElement>(".rec-slot-src")?.click();
    await flush();

    expect(shell.ctx.nav.depth, "a sheet is not a screen").toBe(depth);
    expect(shell.root.querySelector(".rec-slots"), "the recorder is still under it").not.toBeNull();
    expect(shell.root.querySelector(".source-title")?.textContent).toBe("REC Track 1/2");
  });

  it("lists the stereo pairs three rows deep, with the two that stand apart on the first", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".rec-slot-src")?.click();
    await flush();

    const rows = [...shell.root.querySelectorAll(".source-row")].map((row) =>
      [...row.children].map((cell) => (cell.classList.contains("source-spacer") ? null : cell.textContent)),
    );
    expect(rows).toEqual([
      ["None", null, null, "STEREO"],
      ["CH 1/2", "CH 3/4", "CH 5/6", "CH 7/8"],
      ["CH 9/10", "CH 11/12", "MIX 1", "MIX 2"],
    ]);
  });

  it("writes the pick the recorder card reads back", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".rec-slot-src")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".source-btn")].find((b) => b.textContent === "MIX 2")?.click();
    await flush();

    expect(shell.root.querySelector(".source-popup"), "the sheet is gone").toBeNull();
    expect(shell.root.querySelector<HTMLElement>(".rec-slot-src")?.textContent).toBe("MIX 2");
  });
});

describe("moving between the RECORDER tabs", () => {
  const tab = (shell: Shell, name: string): HTMLElement | undefined =>
    [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.textContent === name);

  it("holds a loading modal up before the tab that reads the card appears", async () => {
    const shell = await mount();
    tab(shell, "Play")?.click();
    await flush();

    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Loading...");
    expect(shell.root.querySelector(".dialog-actions"), "there is nothing to answer").toBeNull();
    expect(shell.root.querySelector(".dialog-spinner"), "it waits on a ring").not.toBeNull();
    expect(shell.ctx.store.str("ui.sdTab", "Record"), "the tab has not moved yet").toBe("Record");
  });

  it("goes straight to Record, which is the tab the screen opens on", async () => {
    const shell = await mount();
    tab(shell, "Play")?.click();
    await flush();
    // Leave and come back so the wait is not still running.
    shell.ctx.nav.home();
    await flush();
    await shell.ctx.store.set("ui.sdTab", "Play");
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();

    tab(shell, "Record")?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-text"), "no wait for it").toBeNull();
    expect(shell.ctx.store.str("ui.sdTab", "Play")).toBe("Record");
  });
});

describe("the bar beside a list that does not fit", () => {
  it("keeps its pink rim off until the list is the thing being turned", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".rec-slot-src")?.click();
    await flush();
    // The record-source sheet holds ten items in twelve cells, so it draws none.
    expect(shell.root.querySelector(".scrollbar")?.hasAttribute("hidden")).not.toBe(false);
  });
});

describe("what a take costs on the card", () => {
  it("costs a take at the frequency it was recorded at", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    const take = async (from: number, to: number): Promise<number> => {
      const before = freeBytes(store);
      recordTake(store, from);
      await flush();
      stopTake(store, to);
      await flush();
      return before - freeBytes(store);
    };

    await store.set("setup.samplingFrequency", 48000);
    await store.set("sd.trackCount", 2);
    const at48 = await take(1_000, 11_000);

    await store.set("setup.samplingFrequency", 96000);
    const at96 = await take(100_000, 110_000);

    expect(at48, "ten seconds of two tracks at 48 kHz").toBe(10 * 48_000 * 3 * 2);
    expect(at96, "and twice that at 96 kHz").toBe(at48 * 2);
  });
});
