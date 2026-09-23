import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { clockParts, setClock } from "../model/clock";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import type { Route } from "../app/navigator";
import { refreshDateTime } from "./date-time";
import { buildRegistry } from "./index";

// The buttons that carry the mark the guide's legend calls "Shows a separate
// popup screen for making detailed settings." Each one has to drop a sheet, and
// the sheet has to carry what the unit offers on that button.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(stack: Route[], id: "URX44V" | "URX44" | "URX22" = "URX44V"): Promise<Shell> {
  const model = unitById(id);
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  for (const route of stack) shell.ctx.nav.push(route);
  await flush();
  return shell;
}

const sheet = (shell: Shell): HTMLElement | null => shell.root.querySelector(".source-sheet");
const tiles = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".source-sheet .source-btn")].map((b) => (b.textContent ?? "").replace("\n", " "));
const title = (shell: Shell): string => shell.root.querySelector(".source-sheet .source-title")?.textContent ?? "";
const tap = async (shell: Shell, selector: string, index = 0): Promise<void> => {
  shell.root.querySelectorAll<HTMLElement>(selector)[index]?.click();
  await flush();
};
const pick = async (shell: Shell, label: string): Promise<void> => {
  [...shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")]
    .find((b) => (b.textContent ?? "").replace("\n", " ") === label)
    ?.click();
  await flush();
};

describe("the OUTPUT PATCH source buttons", () => {
  const open = (id: "URX44V" | "URX22" = "URX44V"): Promise<Shell> =>
    mount([{ id: "setup" }, { id: "setup.patch" }], id);

  it("drops a sheet named after the output, not a value that steps on each touch", async () => {
    const shell = await open();
    expect(sheet(shell), "no sheet before the touch").toBeNull();
    await tap(shell, ".patch-btn");
    expect(title(shell)).toBe("MAIN OUT");
    expect(shell.ctx.store.str("setup.outputPatch.mainOut", ""), "the touch alone takes nothing").toBe("STEREO");
  });

  it("offers every analog source the unit offers, on both analog outputs", async () => {
    // The guide gives one list for the tab — the callout names the buttons in
    // the plural and one list follows it — so LINE OUT offers what MAIN OUT does.
    const want = ["None", "STEREO", "STREAMING", "MIX 1", "MIX 2", "MONITOR 1", "MONITOR 2"];
    for (const index of [0, 1]) {
      const shell = await open();
      await tap(shell, ".patch-btn", index);
      expect(tiles(shell)).toEqual(want);
    }
  });

  it("takes the source that is touched and shuts the sheet", async () => {
    const shell = await open();
    await tap(shell, ".patch-btn");
    await pick(shell, "MONITOR 2");
    expect(shell.ctx.store.str("setup.outputPatch.mainOut", "")).toBe("MONITOR 2");
    expect(sheet(shell)).toBeNull();
  });

  it("puts the channels a USB output can take on its list, as many as the unit has", async () => {
    const shell = await open();
    await shell.ctx.store.set("setup.outputPatch.tab", "USB");
    await flush();
    await tap(shell, ".patch-btn");
    expect(title(shell)).toBe("USB MAIN A");
    expect(tiles(shell)).toEqual([
      "None", "STEREO", "STREAMING",
      "MIX 1", "MIX 2", "CH 1/2", "CH 3/4",
      "CH 5/6", "CH 7/8", "CH 9/10", "CH 11/12",
      "CH 1", "CH 2", "CH 3", "CH 4",
    ]);

    const small = await open("URX22");
    await small.ctx.store.set("setup.outputPatch.tab", "USB");
    await flush();
    await tap(small, ".patch-btn");
    const short = tiles(small);
    expect(short).not.toContain("CH 11/12");
    expect(short).not.toContain("CH 3");
    expect(short).toContain("CH 9/10");
    expect(short).toContain("CH 2");
  });

  it("asks before [Default] puts its own tab's outputs back, and [Cancel] leaves them as they are", async () => {
    // User guide, "Output Patch menu": the settings are reset once [OK] is tapped on the dialog [Default] shows.
    const shell = await open();
    const patch = (): string[] =>
      ["mainOut", "usbMainA"].map((k) => shell.ctx.store.str(`setup.outputPatch.${k}`, ""));
    const answer = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>('[role="dialog"] .dialog-actions .btn')]
        .find((b) => b.textContent === label)
        ?.click();
      await flush();
    };
    await shell.ctx.store.set("setup.outputPatch.mainOut", "MIX 2");
    await shell.ctx.store.set("setup.outputPatch.usbMainA", "CH 1/2");
    await flush();

    await tap(shell, ".patch-default");
    expect(shell.root.querySelectorAll('[role="dialog"]').length, "a dialog, not the reset").toBe(1);
    expect(shell.root.querySelector('[role="dialog"] .dialog-text')?.textContent, "in the unit's words").toBe("Reset to Default?");
    expect(shell.root.querySelector('[role="dialog"] .dialog.is-caution'), "under the information mark").toBeNull();
    expect(patch()).toEqual(["MIX 2", "CH 1/2"]);
    await answer("Cancel");
    expect(shell.root.querySelector('[role="dialog"]')).toBeNull();
    expect(patch()).toEqual(["MIX 2", "CH 1/2"]);

    await tap(shell, ".patch-default");
    await answer("OK");
    expect(shell.root.querySelector('[role="dialog"]')).toBeNull();
    expect(patch(), "the Analog tab's outputs alone go back").toEqual(["STEREO", "CH 1/2"]);
    expect(shell.ctx.store.str("setup.outputPatch.lineOut", "")).toBe("MIX 1");

    // And the USB tab's [Default] puts back its own four, leaving the analog ones (URX44V, 2026-09-22).
    await shell.ctx.store.set("setup.outputPatch.mainOut", "MIX 2");
    await shell.ctx.store.set("setup.outputPatch.usbSub", "None");
    await shell.ctx.store.set("setup.outputPatch.tab", "USB");
    await flush();
    await tap(shell, ".patch-default");
    await answer("OK");
    expect([...patch(), shell.ctx.store.str("setup.outputPatch.usbSub", "")]).toEqual(["MIX 2", "STEREO", "STEREO"]);
  });
});

describe("the MONITOR Setting source button", () => {
  const open = async (): Promise<Shell> => {
    const shell = await mount([{ id: "monitor" }, { id: "monitor.level" }]);
    await shell.ctx.store.set("ui.monitorTab", "Setting");
    await flush();
    return shell;
  };

  it("lays None and STEREO across the first row and the two mix buses under them", async () => {
    // The unit's sheet: None at the left end of the first row and STEREO at its
    // right end, two cells empty between them; MIX 1 and MIX 2 at the start of
    // the second row.
    const shell = await open();
    await tap(shell, ".mon-source");
    expect(title(shell)).toBe("MONITOR 1");
    const rows = [...shell.root.querySelectorAll(".source-sheet .source-row")].map((row) =>
      [...row.children].map((c) => (c.classList.contains("source-btn") ? c.textContent : null)),
    );
    expect(rows).toEqual([
      ["None", null, null, "STEREO"],
      ["MIX 1", "MIX 2", null, null],
    ]);
  });

  it("writes to the bus whose button was touched", async () => {
    const shell = await open();
    await tap(shell, ".mon-source", 1);
    await pick(shell, "MIX 2");
    expect(shell.ctx.store.str("monitor.2.source", "")).toBe("MIX 2");
    expect(shell.ctx.store.str("monitor.1.source", ""), "and leaves the other alone").toBe("STEREO");
  });
});

describe("the INS FX effect button", () => {
  const open = (strip: string): Promise<Shell> =>
    mount([{ id: "channel-view", strip }, { id: "ch.insfx", strip }]);
  const disabledTiles = (shell: Shell): string[] =>
    [...shell.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].map((b) => b.textContent ?? "");

  it("offers the effects the channel takes", async () => {
    const mono = await open("ch1");
    await tap(mono, ".insfx-effect");
    expect(title(mono), "the same band on every channel").toBe("EFFECT TYPE");
    expect(tiles(mono)).toEqual([
      "No Effect", "Clean", "Crunch", "Lead", "Drive", "Pitch Fix", "Compander-H", "Compander-S",
    ]);

    // The guide's effect list says the amps and Pitch Fix cannot be used when
    // the signal type is stereo; the companders run in stereo on such a pair. The
    // sheet keeps every name and leaves the ones it cannot take unusable.
    const linked = await open("ch1");
    for (const id of ["ch1", "ch2"]) await linked.ctx.store.set(`ch.${id}.signalType`, "STEREO");
    await flush();
    await tap(linked, ".insfx-effect");
    expect(tiles(linked)).toEqual([
      "No Effect", "Clean", "Crunch", "Lead", "Drive", "Pitch Fix", "Compander-H", "Compander-S",
    ]);
    expect(disabledTiles(linked)).toEqual(["Clean", "Crunch", "Lead", "Drive", "Pitch Fix"]);

    // A stereo input carries no insert at all, so the screen offers none.
    const stereoIn = await open("ch_9_10");
    expect(stereoIn.root.querySelector(".insfx-effect"), "no effect button on a stereo input").toBeNull();

    const bus = await open("bus.stereo");
    await tap(bus, ".insfx-effect");
    expect(tiles(bus)).toEqual(["No Effect", "Compander-H", "Compander-S", "M.B.Comp"]);
  });

  it("shuts off the effects the sampling frequency is too high for", async () => {
    // The same list gives each effect its ceiling: the amps and the companders
    // run to 96 kHz, Pitch Fix to 48 kHz.
    const shell = await open("ch1");
    const disabled = async (rate: number): Promise<string[]> => {
      await shell.ctx.store.set("setup.samplingFrequency", rate);
      await flush();
      shell.root.querySelector<HTMLElement>(".source-back")?.click();
      await flush();
      await tap(shell, ".insfx-effect");
      return [...shell.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].map((b) => b.textContent ?? "");
    };
    expect(await disabled(48000)).toEqual([]);
    expect(await disabled(96000)).toEqual(["Pitch Fix"]);
    expect(await disabled(192000)).toEqual([
      "Clean", "Crunch", "Lead", "Drive", "Pitch Fix", "Compander-H", "Compander-S",
    ]);
  });

  it("takes the effect that is touched", async () => {
    const shell = await open("ch1");
    await tap(shell, ".insfx-effect");
    await pick(shell, "Crunch");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Crunch");
    expect(sheet(shell)).toBeNull();
  });
});

describe("the DATE / TIME popup buttons", () => {
  // The computer's clock stands at 00:00 UTC on the first of January 2020: 9:00 in Tokyo, the moment p064-1 shows.
  const NOW = Date.UTC(2020, 0, 1, 0, 0, 0);
  const open = (): Promise<Shell> => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    return mount([{ id: "setup" }, { id: "setup.datetime" }]);
  };
  afterEach(() => {
    vi.useRealTimers();
  });
  const reading = (shell: Shell): string =>
    [...(shell.root.querySelector(".dt-value")?.querySelectorAll("span") ?? [])]
      .map((s) => s.textContent ?? "")
      .filter(Boolean)
      .join(" ");
  const dialog = (shell: Shell): HTMLElement | null => shell.root.querySelector(".pick-dialog");
  const press = async (shell: Shell, selector: string): Promise<void> => {
    shell.root.querySelector<HTMLElement>(`.pick-dialog ${selector}`)?.click();
    await flush();
  };
  const rows = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".pick-dialog .btn.pick-dialog-row")];
  const lit = (shell: Shell): string[] => rows(shell).filter((r) => r.classList.contains("is-on")).map((r) => r.textContent ?? "");
  /** The dialog's own buttons, as their labels and the shape they are drawn in. */
  const buttons = (shell: Shell): string[][] =>
    [...shell.root.querySelectorAll(".pick-dialog > .btn")].map((b) => [b.textContent ?? "", b.className]);

  it("reads the computer's clock in the format the screen is set to", async () => {
    const shell = await open();
    expect(reading(shell), "a unit as it ships runs on the computer's clock, in Tokyo").toBe("01 / 01 / 2020 09 : 00");
    await shell.ctx.store.set("setup.dateTime.dateFormat", "DD/MM/YYYY");
    await shell.ctx.store.set("setup.dateTime.timeFormat", "12h");
    await setClock(shell.ctx.store, { year: 2020, month: 3, day: 1, hour: 21, minute: 0 });
    await flush();
    expect(reading(shell)).toBe("01 / 03 / 2020 09 : 00 PM");
  });

  it("reads the clock in the time zone the unit is set to", async () => {
    const shell = await open();
    await shell.ctx.store.set("setup.dateTime.timeZone", "London");
    await flush();
    expect(reading(shell), "nine hours behind Tokyo in January").toBe("01 / 01 / 2020 00 : 00");
    await shell.ctx.store.set("setup.dateTime.timeZone", "Tokyo");
    await flush();
    expect(reading(shell)).toBe("01 / 01 / 2020 09 : 00");
  });

  it("stops the day at the last day of the month the popup holds", async () => {
    const shell = await open();
    await tap(shell, ".dt-value");
    const dayBox = (): HTMLElement | null => shell.root.querySelectorAll<HTMLElement>(".dt-box")[2] ?? null;
    await shell.ctx.store.set("ui.dateTimeDraft.day", 31);
    await shell.ctx.store.set("ui.dateTimeDraft.year", 2026);
    await shell.ctx.store.set("ui.dateTimeDraft.month", 2);
    await flush();
    expect(dayBox()?.getAttribute("aria-valuemax"), "February 2026 has 28 days").toBe("28");
    expect(shell.ctx.store.num("ui.dateTimeDraft.day", 0), "a day past it comes down as the month turns").toBe(28);
    await shell.ctx.store.set("ui.dateTimeDraft.year", 2028);
    await flush();
    expect(dayBox()?.getAttribute("aria-valuemax"), "and a leap year's 29").toBe("29");
    expect(shell.ctx.store.num("ui.dateTimeDraft.day", 0), "a day that fits is left alone").toBe(28);
  });

  it("moves the reading on as the clock runs, without drawing the screen again", async () => {
    const shell = await open();
    const time = shell.root.querySelector('[data-clock="time"]');
    vi.setSystemTime(NOW + 61_000);
    refreshDateTime(shell.ctx.store, shell.root);
    expect(reading(shell)).toBe("01 / 01 / 2020 09 : 01");
    expect(shell.root.querySelector('[data-clock="time"]'), "the same node, written in place").toBe(time);

    // A clock set away from the computer's runs on from where it was set.
    await setClock(shell.ctx.store, { year: 2026, month: 9, day: 21, hour: 23, minute: 59 });
    vi.setSystemTime(NOW + 61_000 + 60_000);
    refreshDateTime(shell.ctx.store, shell.root);
    expect(reading(shell)).toBe("09 / 22 / 2026 00 : 00");
  });

  it("applies the clock on [OK] and leaves it on [Cancel]", async () => {
    // The guide: touch [OK] to apply and close, [Cancel] to close without.
    const shell = await open();
    await tap(shell, ".dt-value");
    expect(shell.ctx.nav.current.id).toBe("setup.datetime.set");
    await shell.ctx.store.set("ui.dateTimeDraft.year", 2026);
    await press(shell, ".pick-dialog-cancel");
    expect(clockParts(shell.ctx.store).year, "Cancel takes nothing").toBe(2020);
    expect(dialog(shell)).toBeNull();

    await tap(shell, ".dt-value");
    expect(shell.ctx.store.num("ui.dateTimeDraft.year", 0), "it opens on the clock, not on the draft Cancel left").toBe(2020);
    await shell.ctx.store.set("ui.dateTimeDraft.year", 2026);
    await press(shell, ".pick-dialog-ok");
    expect(clockParts(shell.ctx.store)).toEqual({ year: 2026, month: 1, day: 1, hour: 9, minute: 0, second: 0 });
    expect(dialog(shell)).toBeNull();
    expect(shell.ctx.nav.current.id).toBe("setup.datetime");
  });

  it("stands [Cancel] and [OK] on the dialog the way the USER DEFINED KNOBS dialog does", async () => {
    const shell = await open();
    await tap(shell, ".dt-value");
    expect(shell.root.querySelector(".pick-dialog-title")?.textContent).toBe("DATE / TIME");
    const knobs = await mount([{ id: "setup" }, { id: "setup.udk" }, { id: "setup.udk.assign" }]);
    expect(buttons(knobs).map(([label]) => label), "the knob dialog is open").toEqual(["Cancel", "OK"]);
    expect(buttons(shell)).toEqual(buttons(knobs));
    expect(shell.root.querySelector(".source-sheet"), "not a sheet with a way out of its own").toBeNull();
    // Year / Month / Day, a gap as wide as a slash, Hour : Min.
    const row = [...(shell.root.querySelector(".dt-fields")?.children ?? [])].map((c) =>
      c.classList.contains("dt-sep") ? `sep:${c.textContent}` : c.querySelector(".dt-field-caption")?.textContent,
    );
    expect(row).toEqual(["Year", "sep:/", "Month", "sep:/", "Day", "sep:", "Hour", "sep::", "Min"]);
  });

  it("names the time zone by city, in one column in the middle of the dialog", async () => {
    const shell = await open();
    const zone = shell.ctx.store.str("setup.dateTime.timeZone", "Tokyo");
    await tap(shell, ".dt-value", 1);
    expect(shell.root.querySelector(".pick-dialog-title")?.textContent).toBe("TIME ZONE");
    const knobs = await mount([{ id: "setup" }, { id: "setup.udk" }, { id: "setup.udk.assign" }]);
    expect(buttons(shell), "with the knob dialog's [Cancel] and [OK]").toEqual(buttons(knobs));
    const columns = shell.root.querySelectorAll(".pick-dialog-col");
    expect(columns.length).toBe(1);
    expect(columns[0]?.querySelector(".pick-dialog-head"), "under no caption").toBeNull();
    expect(columns[0]?.parentElement?.classList.contains("is-centred")).toBe(true);
    const cities = rows(shell).map((r) => r.textContent ?? "");
    expect(cities.length).toBeGreaterThan(100);
    expect(cities[0]).toBe("Abu Dhabi");
    expect(lit(shell), "it opens on the zone the unit is set to").toEqual([zone]);

    rows(shell).find((r) => r.textContent === "Auckland")?.click();
    await flush();
    expect(lit(shell)).toEqual(["Auckland"]);
    expect(shell.ctx.store.str("setup.dateTime.timeZone", ""), "a touched row is only the pick").toBe(zone);
    await press(shell, ".pick-dialog-ok");
    expect(shell.ctx.store.str("setup.dateTime.timeZone", "")).toBe("Auckland");
    expect(dialog(shell)).toBeNull();

    await tap(shell, ".dt-value", 1);
    rows(shell).find((r) => r.textContent === "Tokyo")?.click();
    await flush();
    await press(shell, ".pick-dialog-cancel");
    expect(shell.ctx.store.str("setup.dateTime.timeZone", ""), "Cancel takes nothing").toBe("Auckland");
  });
});

describe("the INPUT Input Source button", () => {
  const open = (strip: string, id: "URX44V" | "URX44" | "URX22" = "URX44V"): Promise<Shell> =>
    mount([{ id: "channel-view", strip }, { id: "ch.input", strip }], id);

  it("moves a mono channel's partner onto the source that was picked", async () => {
    const shell = await open("ch1");
    await tap(shell, ".input-source-btn");
    await pick(shell, "AUX IN");
    expect([shell.ctx.store.str("ch.ch1.source", ""), shell.ctx.store.str("ch.ch2.source", "")]).toEqual([
      "AUX IN",
      "AUX IN",
    ]);

    // The other direction, the other pair, and a source that is no source.
    const other = await open("ch4");
    await tap(other, ".input-source-btn");
    await pick(other, "USB DAW 1/2");
    expect([other.ctx.store.str("ch.ch4.source", ""), other.ctx.store.str("ch.ch3.source", "")]).toEqual([
      "USB DAW 1/2",
      "USB DAW 1/2",
    ]);
    expect(other.ctx.store.str("ch.ch1.source", ""), "and nothing beyond the pair").toBe("MIC/LINE 1/2");

    await tap(other, ".input-source-btn");
    await pick(other, "None");
    expect([other.ctx.store.str("ch.ch4.source", ""), other.ctx.store.str("ch.ch3.source", "")]).toEqual(["None", "None"]);
  });

  it("writes the source on the box broken where the sheet breaks it", async () => {
    const shell = await open("ch_5_6");
    const box = (): string => shell.root.querySelector(".input-source-btn > span")?.textContent ?? "";
    // The unit writes AUX IN on one line and MIC/LINE 1/2 over two, as its sheet does.
    for (const [source, shown] of [
      ["AUX IN", "AUX IN"],
      ["MIC/LINE 1/2", "MIC/LINE\n1/2"],
      ["USB MAIN A", "USB MAIN A"],
      ["USB SUB", "USB SUB"],
      ["USB DAW 1/2", "USB DAW\n1/2"],
      ["microSD Playback", "microSD\nPlayback"],
      ["HDMI", "HDMI"],
      ["None", "None"],
    ] as const) {
      await shell.ctx.store.set("ch.ch_5_6.source", source);
      await flush();
      expect(box(), source).toBe(shown);
    }
    const stream = await open("bus.stream");
    await stream.ctx.store.set("ch.bus.stream.source", "MIX 1");
    await flush();
    expect(stream.root.querySelector(".input-source-btn > span")?.textContent, "the streaming bus's source").toBe("MIX 1");
  });

  it("leaves a stereo strip alone, because the strip is the pair", async () => {
    const shell = await open("ch_5_6");
    await tap(shell, ".input-source-btn");
    await pick(shell, "USB SUB");
    expect(shell.ctx.store.str("ch.ch_5_6.source", "")).toBe("USB SUB");
    expect(
      ["ch_7_8", "ch_9_10", "ch_11_12"].map((id) => shell.ctx.store.str(`ch.${id}.source`, "")),
      "the other stereo strips keep what they ship with",
    ).toEqual(["USB MAIN A", "USB MAIN B", "USB MAIN C"]);
  });

  it("lights the source each stereo strip ships on", async () => {
    for (const [id, want] of [
      ["ch_5_6", "AUX IN"],
      ["ch_7_8", "USB MAIN A"],
      ["ch_9_10", "USB MAIN B"],
      ["ch_11_12", "USB MAIN C"],
    ]) {
      const shell = await open(id ?? "");
      await tap(shell, ".input-source-btn");
      const lit = [...shell.root.querySelectorAll(".source-sheet .source-btn.is-on")].map((b) =>
        (b.textContent ?? "").replace("\n", " "),
      );
      expect(lit, id).toEqual([want]);
    }
  });

  it("opens INPUT from the STREAMING strip's head-amp column", async () => {
    const shell = await mount([{ id: "channel-view", strip: "bus.stream" }]);
    await tap(shell, ".cv-gain");
    expect([shell.ctx.nav.current.id, shell.ctx.nav.current["strip"]]).toEqual(["ch.input", "bus.stream"]);

    // A MIX bus has no input source, so its column opens nothing.
    const mix = await mount([{ id: "channel-view", strip: "bus.mix1" }]);
    const depth = mix.ctx.nav.depth;
    await tap(mix, ".cv-gain");
    expect(mix.ctx.nav.depth).toBe(depth);
  });

  it("offers the STREAMING bus the buses it can be fed from, with no None and no channel inputs", async () => {
    // The unit's sheet: STEREO at the left end of the first row, MIX 1 and MIX 2
    // at the start of the second. The streaming bus is always fed, so unlike the
    // MONITOR sheet there is no None.
    const shell = await open("bus.stream");
    await tap(shell, ".input-source-btn");
    const rows = [...shell.root.querySelectorAll(".source-sheet .source-row")].map((row) =>
      [...row.children].map((c) => (c.classList.contains("source-btn") ? c.textContent : null)),
    );
    expect(rows).toEqual([
      ["STEREO", null, null, null],
      ["MIX 1", "MIX 2", null, null],
    ]);
    expect(title(shell)).toBe("STREAMING");
    expect([...shell.root.querySelectorAll(".source-sheet .source-btn.is-on")].map((b) => b.textContent)).toEqual([
      "STEREO",
    ]);
    for (const absent of ["None", "MIC/LINE 1/2", "USB DAW 1/2", "AUX IN", "All Input", "All USB DAW"]) {
      expect(tiles(shell), `a bus cannot be fed from ${absent}`).not.toContain(absent);
    }
    expect(shell.root.querySelector(".source-sheet .source-scrollbar"), "two rows fit").toBeNull();
  });

  it("writes the STREAMING source and shows it on the button", async () => {
    const shell = await open("bus.stream");
    await tap(shell, ".input-source-btn");
    await pick(shell, "MIX 2");
    expect(shell.ctx.store.str("ch.bus.stream.source", "")).toBe("MIX 2");
    expect(sheet(shell), "the sheet closes on the pick").toBeNull();
    expect((shell.root.querySelector(".input-source-btn")?.textContent ?? "").replace("\n", " ")).toContain("MIX 2");
    expect(shell.ctx.store.str("monitor.1.source", ""), "and leaves the monitor's source alone").toBe("STEREO");
  });

  /** Touch a bulk button and answer the question the unit asks with it. */
  const bulk = async (shell: Shell, label: string, answer: "OK" | "Cancel"): Promise<string> => {
    await tap(shell, ".input-source-btn");
    await pick(shell, label);
    const ask = shell.root.querySelector(".dialog")?.textContent ?? "";
    [...shell.root.querySelectorAll<HTMLElement>(".dialog .btn")].find((b) => b.textContent === answer)?.click();
    await flush();
    return ask;
  };

  it("asks before a bulk button rewrites the channels, and takes nothing when the answer is no", async () => {
    const shell = await open("ch1");
    const held = shell.ctx.store.str("ch.ch_9_10.source", "");
    const ask = await bulk(shell, "All USB DAW", "Cancel");
    expect(ask).toContain("Change Input Source?");
    expect(ask).toContain("Ch1-12 All USB DAW");
    expect(shell.ctx.store.str("ch.ch_9_10.source", ""), "cancelling leaves every channel").toBe(held);
    expect(shell.ctx.store.str("ch.ch1.source", "")).toBe("MIC/LINE 1/2");
  });

  it("takes every channel to its own USB return, and leaves the USB-fed ones out of All Input", async () => {
    const shell = await open("ch1");
    await bulk(shell, "All USB DAW", "OK");
    expect(
      ["ch1", "ch2", "ch3", "ch4", "ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"].map((id) =>
        shell.ctx.store.str(`ch.${id}.source`, ""),
      ),
    ).toEqual([
      "USB DAW 1/2",
      "USB DAW 1/2",
      "USB DAW 3/4",
      "USB DAW 3/4",
      "USB DAW 5/6",
      "USB DAW 7/8",
      "USB DAW 9/10",
      "USB DAW 11/12",
    ]);

    // [All Input] patches the channels the unit has a connector for; the three
    // fed from the USB MAIN returns keep what they are on.
    await bulk(shell, "All Input", "OK");
    expect(
      ["ch1", "ch3", "ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"].map((id) => shell.ctx.store.str(`ch.${id}.source`, "")),
    ).toEqual(["MIC/LINE 1/2", "MIC/LINE 3/4", "AUX IN", "USB DAW 7/8", "USB DAW 9/10", "USB DAW 11/12"]);

    // A URX22 has fewer channels, so the table stops earlier.
    const small = await open("ch1", "URX22");
    const ask = await bulk(small, "All USB DAW", "OK");
    expect(ask, "and the question names the channels it carries").toContain("Ch1-10 All USB DAW");
    expect(small.ctx.store.str("ch.ch_9_10.source", "")).toBe("USB DAW 9/10");
    expect(tiles(small), "and never names a return the unit does not carry").not.toContain("USB DAW 11/12");
  });
});
