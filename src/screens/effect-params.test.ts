import { describe, expect, it } from "vitest";
import type { Route } from "../app/navigator";
import { grBarShare } from "../model/dynamics";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { HANDLE_R, HANDLE_RING, PLOT_H, PLOT_MIN, PLOT_SPAN, PLOT_W } from "./channel";
import { setMeterSource } from "./meters";
import { buildRegistry } from "./index";

// Taking an effect, setting it, and the states the unit will not let a channel
// reach: an effect the sampling frequency is too high for, an effect another
// channel is already running, and a pair that has just changed its Signal Type.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(stack: Route[] = []): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  for (const route of stack) shell.ctx.nav.push(route);
  await flush();
  return shell;
}

const click = async (shell: Shell, selector: string, index = 0): Promise<void> => {
  shell.root.querySelectorAll<HTMLElement>(selector)[index]?.click();
  await flush();
};
const pick = async (shell: Shell, label: string): Promise<void> => {
  [...shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")]
    .find((b) => (b.textContent ?? "") === label)
    ?.click();
  await flush();
};
const captions = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".efx-cell-caption")].map((n) => n.textContent ?? "");
const values = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".efx-cell .value-box")].map((n) => n.textContent ?? "");
const knobLabels = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".knob-cell-label")].map((n) => n.textContent ?? "");

describe("taking an effect", () => {
  const openInsert = (strip: string): Promise<Shell> =>
    mount([{ id: "channel-view", strip }, { id: "ch.insfx", strip }]);

  it("switches the block on as it takes one, and off again with the effect", async () => {
    const shell = await openInsert("ch1");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true)).toBe(false);
    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Crunch");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", false), "the unit engages what it is given").toBe(true);

    await click(shell, ".insfx-effect");
    await pick(shell, "No Effect");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true)).toBe(false);
  });

  it("fills the effect with its own settings, and puts them back on the next take", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");
    expect(shell.ctx.store.num("ch.ch1.insFx.threshold", 0)).toBe(-10);

    await shell.ctx.store.set("ch.ch1.insFx.threshold", -30);
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");
    expect(shell.ctx.store.num("ch.ch1.insFx.threshold", 0), "taking it again is a fresh one").toBe(-10);

    // And the two companders are one screen that differs only in what it holds.
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-S");
    expect(shell.ctx.store.num("ch.ch1.insFx.threshold", 0)).toBe(-8);

    // The rows that are not numbers are filled too.
    await click(shell, ".insfx-effect");
    await pick(shell, "Clean");
    await shell.ctx.store.set("ch.ch1.insFx.spType", "BS 4x12");
    await shell.ctx.store.set("ch.ch1.insFx.gate", true);
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Clean");
    expect([shell.ctx.store.str("ch.ch1.insFx.spType", ""), shell.ctx.store.bool("ch.ch1.insFx.gate", true)]).toEqual([
      "JC 2x12",
      false,
    ]);
  });

  it("leaves the block's switch alone while the channel has nothing inserted", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".badge-title");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true), "the unit's switch does nothing there").toBe(false);

    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", false)).toBe(true);
    await click(shell, ".badge-title");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true), "and switches it once there is one").toBe(false);
  });

  it("offers an effect on one channel at a time", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");

    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    shell.ctx.nav.push({ id: "ch.insfx", strip: "ch2" });
    await flush();
    await click(shell, ".insfx-effect");
    const disabled = [...shell.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].map((b) => b.textContent);
    // The amps share one of the unit's own holders, so CH 1 holding one puts all
    // four out of CH 2's reach; Pitch Fix and the companders have their own.
    expect(disabled).toEqual(["Clean", "Crunch", "Lead", "Drive"]);
  });

  it("takes nothing from a tile the channel cannot use", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");

    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    shell.ctx.nav.push({ id: "ch.insfx", strip: "ch2" });
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Lead");
    expect(shell.ctx.store.str("ch.ch2.insFx.effect", ""), "CH 1 is holding the amp").toBe("No Effect");
    expect(shell.root.querySelector(".source-sheet"), "and the sheet stays up").not.toBeNull();

    // The control: the tile beside it is not held, and it is taken.
    await pick(shell, "Compander-H");
    expect(shell.ctx.store.str("ch.ch2.insFx.effect", "")).toBe("Compander-H");
  });

  it("gives the output buses one holder between them", async () => {
    const shell = await mount([{ id: "channel-view", strip: "bus.stereo" }, { id: "ch.insfx", strip: "bus.stereo" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");

    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.mix1" });
    shell.ctx.nav.push({ id: "ch.insfx", strip: "bus.mix1" });
    await flush();
    await click(shell, ".insfx-effect");
    const disabled = [...shell.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].map((b) => b.textContent);
    // The multi-band compressor and the two companders share one holder across
    // every output, so the stereo bus running one puts all three out of reach.
    expect(disabled).toEqual(["Compander-H", "Compander-S", "M.B.Comp"]);
  });

  it("gives the two sides of a stereo-linked pair one insert between them", async () => {
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    for (const id of ["ch1", "ch2"]) await shell.ctx.store.set(`ch.${id}.signalType`, "STEREO");
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");
    // The pair holds it on the lower-numbered channel, and the other half shows it.
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Compander-H");
    shell.ctx.nav.replace({ id: "ch.insfx", strip: "ch2" });
    await flush();
    expect(shell.root.querySelector(".insfx-effect")?.textContent).toBe("Compander-H");
  });

  it("drops the pair's insert whichever way the Signal Type moves", async () => {
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");

    const { setSignalType } = await import("./stereo-link");
    const strip = unitById("URX44V").inputs[0];
    if (!strip) throw new Error("no CH 1");
    setSignalType(shell.ctx, strip, "STEREO");
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("No Effect");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true)).toBe(false);
    expect(shell.ctx.store.str("ch.ch2.insFx.effect", ""), "and on the other half too").toBe("No Effect");

    // The other way round: a linked pair holding one, then unlinked.
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-S");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Compander-S");
    setSignalType(shell.ctx, strip, "MONO x 2");
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", ""), "unlinking takes it too").toBe("No Effect");
    expect(shell.ctx.store.str("ch.ch2.insFx.effect", "")).toBe("No Effect");
  });

  it("takes an effect off the channel when the sampling frequency passes its ceiling", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Pitch Fix");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", ""), "the channel is holding it to begin with").toBe("Pitch Fix");

    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.rate" });
    await flush();
    const rate = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")].find((b) => b.textContent === label)?.click();
      await flush();
    };
    await rate("96kHz");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("No Effect");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true)).toBe(false);
    await rate("48kHz");
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", ""), "and does not put it back").toBe("No Effect");
  });

  it("keeps the pair's insert when the Signal Type it already holds is picked again", async () => {
    // The insert goes when the Signal Type MOVES. Touching the value the list is
    // already showing is how an operator backs out of it.
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");
    const { setSignalType } = await import("./stereo-link");
    const strip = unitById("URX44V").inputs[0];
    if (!strip) throw new Error("no CH 1");
    setSignalType(shell.ctx, strip, "MONO x 2");
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Compander-H");
  });

  it("does not put an unrunnable insert back when a scene is recalled", async () => {
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Pitch Fix");
    const { recallScene, storeScene } = await import("./scene");
    // A scene is found by the title its bank holds, which is what naming it writes.
    await shell.ctx.store.set("scene.Standard.1.title", "with pitch");
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("setup.samplingFrequency", 96000);
    const { dropInsertsOverRate } = await import("./insert-fx");
    dropInsertsOverRate(shell.ctx, 96000);
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("No Effect");

    await recallScene(shell.ctx, 1);
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", ""), "the scene holds it, the frequency does not").toBe("No Effect");
  });

  it("leaves an effect the new frequency still runs where it is", async () => {
    // The control the check above needs: a frequency change that crosses no
    // ceiling takes nothing off the channel.
    const shell = await openInsert("ch1");
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");

    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.rate" });
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")].find((b) => b.textContent === "96kHz")?.click();
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.effect", "")).toBe("Compander-H");
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", false)).toBe(true);
  });
});

describe("the screen an effect is set on", () => {
  const openParams = async (strip: string, effect: string): Promise<Shell> => {
    const shell = await mount([{ id: "channel-view", strip }, { id: "ch.insfx", strip }]);
    await click(shell, ".insfx-effect");
    await pick(shell, effect);
    return shell;
  };

  it("sets the effect on the screen it was taken on, with nothing to touch first", async () => {
    // URX44V, 2026-09-23: every effect's screen comes up ready to turn, so the
    // screen an effect is taken on is the screen that sets it.
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Clean");
    expect(shell.ctx.nav.current.id, "and it opens no screen under itself").toBe("ch.insfx");
    // The unit's own order (URX44V, 2026-09-22).
    expect(captions(shell)).toEqual([
      "Volume", "Distortion", "Blend", "Output", "Treble", "Middle", "Bass", "Presence",
    ]);
    // The panel prints the bare number, its unit left to the readout bar.
    expect(values(shell)).toEqual(["1.9", "0.0", "5.0", "-11.9", "4.0", "5.0", "6.1", "3.0"]);
    expect(shell.root.querySelectorAll(".efx-cell .value-box").length, "every value turns from its box").toBe(8);
    expect(knobLabels(shell)).toEqual(["Treble", "Middle", "Bass", "Presence"]);
    expect(shell.root.querySelector(".efx-page-next"), "and its pages step from here").not.toBeNull();
  });

  it("opens the effect it was taken on at its first page", async () => {
    const shell = await openParams("ch1", "Crunch");
    expect(captions(shell)).toEqual(["Type", "Gain", "Output", "Treble", "Middle", "Bass", "Presence"]);
    expect(values(shell)).toEqual(["Bright", "4.6", "-17.7", "5.3", "7.0", "4.7", "2.8"]);
  });

  it("puts every value it shows on the knobs, four divisions at a time", async () => {
    const shell = await openParams("ch1", "Compander-H");
    expect(knobLabels(shell)).toEqual(["Threshold", "Ratio", "Width", "Gain"]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell)).toEqual(["Attack", "Release", "", ""]);
  });

  it("turns a value from the box that shows it", async () => {
    const shell = await openParams("ch1", "Crunch");
    const box = shell.root.querySelectorAll<HTMLElement>(".efx-cell .value-box")[1];
    expect(box?.getAttribute("aria-label")).toBe("Gain");
    box?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.insFx.gain", 0)).toBeCloseTo(4.7, 5);
  });

  it("keeps its toolbar on a channel the arrows step onto that runs no effect", async () => {
    // The arrows are what put the screen on that channel, so dropping them there
    // ends the walk with no way back along it. Both kinds of channel with
    // nothing to set: one that has taken no insert, and one that carries none.
    const shell = await openParams("ch1", "Compander-H");
    for (const strip of ["ch2", "ch_5_6"]) {
      shell.ctx.nav.replace({ id: "ch.effect", strip });
      await flush();
      expect(shell.root.querySelector(".ch-selector"), `${strip} keeps the channel arrows`).not.toBeNull();
      expect(shell.root.querySelector(".badge-title"), `${strip} keeps the block's own name`).not.toBeNull();
      expect(shell.root.querySelectorAll(".efx-cell").length, `${strip} has nothing to set`).toBe(0);
    }
    // A channel that carries no insert is not offered one either.
    expect(shell.root.querySelector(".insfx-effect"), "and no effect to name").toBeNull();
  });

  it("opens a list the glass cannot hold on a sheet, and a short one under its box", async () => {
    const amp = await openParams("ch1", "Clean");
    await click(amp, ".efx-page-next");
    const list = (caption: string): HTMLElement | null | undefined =>
      [...amp.root.querySelectorAll<HTMLElement>(".efx-cell")]
        .find((c) => c.querySelector(".efx-cell-caption")?.textContent === caption)
        ?.querySelector<HTMLElement>(".pulldown");
    list("SP Type")?.click();
    await flush();
    expect(amp.root.querySelectorAll(".source-sheet .source-btn").length, "eight cabinets go on a sheet").toBe(8);
    expect(amp.root.querySelector(".dropdown-list")).toBeNull();
    await click(amp, ".source-back");
    list("Mic Position")?.click();
    await flush();
    expect(amp.root.querySelector(".dropdown-list"), "two options fit under the box").not.toBeNull();
    expect(amp.root.querySelector(".source-sheet")).toBeNull();
  });

  it("opens the note values in a place of their own five across, drawn as notes, rather than on a sheet", async () => {
    // Three rows of five from `---` at the top left, the notes drawn and `---` in
    // words, to the left of the Note's box (URX44V, 2026-09-22).
    const delay = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    await click(delay, ".efx-page-next");
    const note = [...delay.root.querySelectorAll<HTMLElement>(".efx-cell")].find(
      (c) => c.querySelector(".efx-cell-caption")?.textContent === "Note",
    );
    expect(note?.querySelector(".pulldown-value svg.icon-note"), "the box draws the one held").not.toBeNull();
    note?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    expect(delay.root.querySelector(".source-sheet"), "no sheet of its own").toBeNull();
    const list = delay.root.querySelector<HTMLElement>(".dropdown-list");
    expect(list?.classList.contains("efx-note-list"), "in the Note list's own place").toBe(true);
    const options = [...(list?.querySelectorAll<HTMLElement>(".dropdown-option.efx-note-option") ?? [])];
    expect(options.length, "fifteen, three rows of five").toBe(15);
    expect([options[0]?.textContent, options[0]?.querySelector("svg")], "--- in words, at the top left").toEqual(["---", null]);
    expect(options.slice(1).every((o) => o.querySelector("svg.icon-note") && o.textContent === ""), "the fourteen notes drawn").toBe(true);
    expect(options.map((o) => o.getAttribute("aria-label") ?? o.textContent).slice(0, 6), "each keeps its name, row by row").toEqual([
      "---", "1/32T", "1/16T", "1/16", "1/8T", "1/16.",
    ]);
    options.find((o) => o.getAttribute("aria-label") === "1/8")?.click();
    await flush();
    expect(delay.ctx.store.str("ch.fx2.effect.note", "")).toBe("1/8");
    expect(delay.root.querySelector(".dropdown-list"), "and it closes on the pick").toBeNull();
  });

  it("sets CLEAN's Cho / Off / Vib out as three buttons across two panels, with no caption, as the unit does", async () => {
    // Second page, upper row, the first two panels (URX44V, 2026-09-22). The
    // row is reached by the control's own name.
    const shell = await openParams("ch1", "Clean");
    await click(shell, ".efx-page-next");
    expect(captions(shell)).toEqual(["", "", "SP Type", "Speed", "Depth", "Gate Level", "Mic Position"]);
    const mod = shell.root.querySelector<HTMLElement>(".efx-cell.has-buttons");
    expect([mod?.style.gridRow, mod?.style.gridColumn], "upper row, two panels from the left").toEqual(["1", "1 / span 2"]);
    const gate = [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")][1];
    expect(gate?.style.gridColumn, "the next panel after the two").toBe("3");
    expect(mod?.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Cho/Off/Vib");
    const buttons = [...(mod?.querySelectorAll<HTMLElement>(".efx-button") ?? [])];
    expect(buttons.map((b) => [b.textContent, b.classList.contains("is-on")])).toEqual([["Cho", false], ["Off", true], ["Vib", false]]);
    buttons[2]?.click();
    await flush();
    expect(shell.ctx.store.str("ch.ch1.insFx.mod", "")).toBe("Vib");
    // SP Type and Mic Position stand at the foot of their panels, and SP Type runs on past its own.
    expect(
      [...shell.root.querySelectorAll(".efx-cell.is-foot .efx-cell-caption")].map((c) => c.textContent),
    ).toEqual(["SP Type", "Mic Position"]);
    expect([...shell.root.querySelectorAll(".efx-cell.is-foot.is-upper .efx-cell-caption")].map((c) => c.textContent)).toEqual(["SP Type"]);
    expect(
      [...shell.root.querySelectorAll(".efx-cell.is-division .efx-cell-caption")].map((c) => c.textContent),
      "both lists run the division's width",
    ).toEqual(["SP Type", "Mic Position"]);
    // The row of buttons, Gate and the two lists stand on the glass with no panel; Gate names its own
    // button, the dark button the row of buttons uses (URX44V, 2026-09-22).
    expect(shell.root.querySelectorAll(".efx-cell.is-bare").length).toBe(4);
    const gateButton = shell.root.querySelector<HTMLElement>(".efx-cell.is-bare:not(.has-buttons) .efx-button");
    expect([gateButton?.textContent, gateButton?.getAttribute("aria-pressed")]).toEqual(["Gate", "false"]);
    gateButton?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.insFx.gate", false)).toBe(true);
  });

  it("lays Crunch, Lead and Drive out as the unit does, their type a name turned by a knob", async () => {
    // URX44V, 2026-09-22. The first page: the type, Gain, Master where the amp has
    // one and Output along the upper row, Treble / Middle / Bass / Presence along the
    // lower. The second: Gate, Gate Level, SP Type and Mic Position where Clean
    // stands them.
    const upper: Record<string, string[]> = {
      Crunch: ["Type", "Gain", "", "Output"],
      Lead: ["Type", "Gain", "Master", "Output"],
      Drive: ["Amp Type", "Gain", "Master", "Output"],
    };
    for (const [amp, row] of Object.entries(upper)) {
      const shell = await openParams("ch1", amp);
      const placed = (): Record<string, string> =>
        Object.fromEntries(
          [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")].map((c) => [
            `${c.style.gridRow}/${c.style.gridColumn}`,
            c.querySelector(".efx-cell-caption")?.textContent || c.querySelector(".efx-button")?.textContent || "",
          ]),
        );
      const first = Object.fromEntries([
        ...row.map((caption, i) => [`1/${i + 1}`, caption] as const).filter(([, caption]) => caption !== ""),
        ["2/1", "Treble"], ["2/2", "Middle"], ["2/3", "Bass"], ["2/4", "Presence"],
      ]);
      expect(placed(), `${amp}, page one`).toEqual(first);
      // The type is a value box over a knob, and the knob steps it through the names.
      const type = shell.root.querySelector<HTMLElement>(".efx-cell .value-box");
      expect(type?.getAttribute("aria-label"), amp).toBe(row[0]);
      expect(shell.root.querySelector(".efx-cell .pulldown"), `${amp}: no list on page one`).toBeNull();
      type?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      await flush();
      const key = amp === "Drive" ? "ampType" : "type";
      expect(values(shell)[0], `${amp}: the next name down`).toBe({ Crunch: "Normal", Lead: "High", Drive: "Vintage1" }[amp]);
      expect(typeof shell.ctx.store.get(`ch.ch1.insFx.${key}`, ""), "held as its place in the list").toBe("number");

      await click(shell, ".efx-page-next");
      expect(placed(), `${amp}, page two`).toEqual({ "1/3": "Gate", "1/4": "SP Type", "2/3": "Gate Level", "2/4": "Mic Position" });
      expect(shell.root.querySelectorAll(".efx-cell.is-bare").length, `${amp}: Gate and the two lists on the glass`).toBe(3);
      expect([...shell.root.querySelectorAll(".efx-cell.is-foot.is-upper .efx-cell-caption")].map((c) => c.textContent)).toEqual(["SP Type"]);
    }
  });

  it("names every control it draws, whatever kind of control it is", async () => {
    // A reader moving across the grid hears the setting, not the value it holds.
    const shell = await openParams("ch1", "Clean");
    const named = [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")].map((c) => {
      const caption = c.querySelector(".efx-cell-caption")?.textContent ?? "";
      const control = c.querySelector<HTMLElement>(".value-box, .pulldown, .btn");
      const name = control?.getAttribute("aria-label") ?? "";
      return name.length > 0 && (caption === "" || name.startsWith(caption));
    });
    expect(named.filter((ok) => !ok).length, "every cell names its setting").toBe(0);
    expect(named.length).toBeGreaterThan(4);
  });

  it("gives the multi-band compressor the whole INS FX screen, as it gives a compander", async () => {
    // URX44V, 2026-09-23: opening INS FX on a bus running M.B.Comp lands on the
    // effect's own first page, not on an area that opens it.
    const shell = await mount([{ id: "channel-view", strip: "bus.stereo" }, { id: "ch.insfx", strip: "bus.stereo" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "M.B.Comp");
    expect([...shell.root.querySelectorAll(".dyn-handle text")].map((n) => n.textContent)).toEqual([
      "L", "M", "H", "LM", "MH",
    ]);
    expect(knobLabels(shell)).toEqual(["Low Gain", "Mid Gain", "High Gain", "Out Gain"]);
  });

  it("gives Pitch Fix the whole INS FX screen too, and leaves a guitar amp its area", async () => {
    // URX44V, 2026-09-23: INS FX opens on Pitch Fix's own first page.
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Pitch Fix");
    expect(shell.root.querySelector(".pitch-corner")?.textContent).toBe("Correction");
    expect(knobLabels(shell)).toEqual(["Coarce", "Fine", "Formant", ""]);

    await click(shell, ".insfx-effect");
    await pick(shell, "Clean");
    expect(knobLabels(shell), "its own first page, ready to turn").toEqual(["Treble", "Middle", "Bass", "Presence"]);
  });

  it("steps the multi-band compressor through its bands and one page each, as the unit lays them out", async () => {
    // URX44V, 2026-09-23. The first page carries the bands themselves: each drawn
    // from one crossover to the next, as high as its gain, with a grip on every
    // band's gain and on both crossovers, and Out Gain beside them. Then a page a
    // band, each with that band's curve, its Bypass and the two times under it.
    const shell = await openParams("bus.stereo", "M.B.Comp");
    const grips = (): string[] => [...shell.root.querySelectorAll(".dyn-handle text")].map((n) => n.textContent ?? "");
    const named = (): string => shell.root.querySelector(".mbc-band-name")?.textContent ?? "";
    expect(grips()).toEqual(["L", "M", "H", "LM", "MH"]);
    expect(captions(shell), "and the one row the page sets out").toEqual(["Out Gain"]);
    expect(knobLabels(shell)).toEqual(["Low Gain", "Mid Gain", "High Gain", "Out Gain"]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell), "the crossovers take the second row, and Release is not one of them").toEqual([
      "L-M Xover", "M-H Xover", "", "",
    ]);
    await click(shell, ".knob-page-prev");
    expect(shell.root.querySelector(".efx-page-prev"), "nothing before the first page").toBeNull();
    expect(named(), "no band is named on it").toBe("");
    // 125 Hz and 3.35 kHz stand about a quarter and three quarters across a
    // 20 Hz..20 kHz log axis, and +2 dB about 78% of the way up a -60..+19 dB one.
    const fills = [...shell.root.querySelectorAll(".mbc-fill")].map((r) => ({
      x: Number(r.getAttribute("x")),
      width: Number(r.getAttribute("width")),
      y: Number(r.getAttribute("y")),
    }));
    expect(fills.map((f) => Math.round(f.x))).toEqual([0, 70, 195]);
    expect(fills.map((f) => Math.round(f.x + f.width)), "each band reaches the next crossover").toEqual([70, 195, 263]);
    expect(fills.map((f) => Math.round(f.y)), "and stands as high as its own gain").toEqual([37, 37, 37]);
    expect(shell.root.querySelector(".efx-cell .value-box.is-focused")?.textContent, "Out Gain opens framed").toBe("4");

    for (const band of ["Low", "Mid", "High"]) {
      await click(shell, ".efx-page-next");
      expect(grips(), `${band}: the curve's own grips`).toEqual(["T", "R"]);
      expect(named()).toBe(band);
      expect([...shell.root.querySelectorAll(".dyn-set-caption")].map((n) => n.textContent)).toEqual(["Attack", "Release"]);
      expect(shell.root.querySelector(".mbc-bypass")?.textContent).toBe("Bypass");
      expect(knobLabels(shell)).toEqual(["Threshold", "Ratio", "Attack", "Release"]);
      await click(shell, ".knob-page-next");
      expect(knobLabels(shell), `${band}: its own gain takes the left of the second row`).toEqual([
        `${band} Gain`, "", "", "",
      ]);
      await click(shell, ".knob-page-prev");
      expect(
        shell.root.querySelector(".dyn-set .value-box.is-focused")?.previousElementSibling?.textContent,
        `${band}: the page opens with Attack framed`,
      ).toBe("Attack");
      // The band whose page is open is the one lit on the reduction meters.
      const lit = [...shell.root.querySelectorAll(".mbc-gr-bar")].map((n) => n.classList.contains("is-lit"));
      expect(lit).toEqual(["Low", "Mid", "High"].map((b) => b === band));
    }
    expect(shell.root.querySelector(".efx-page-next"), "nothing after the last").toBeNull();
    await click(shell, ".efx-page-prev");
    expect(named()).toBe("Mid");
  });

  it("lays an effect out two rows of four at a time, a short page in the lower row", async () => {
    // Ten controls over two pages, eight and two.
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    const rows = (): string[] => [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")].map((c) => c.style.gridRow);
    expect(captions(shell)).toEqual([
      "Diffusion", "Hi.Ratio", "Lo.Ratio", "Lo.Freq.", "Rev.Time", "Ini.Delay", "Decay", "Room Size",
    ]);
    expect(rows()).toEqual(["1", "1", "1", "1", "2", "2", "2", "2"]);
    await click(shell, ".efx-page-next");
    expect(captions(shell)).toEqual(["HPF", "LPF"]);
    expect(rows(), "the unit stands the two in the lower row").toEqual(["2", "2"]);
    expect(shell.root.querySelector(".efx-page-next")).toBeNull();
  });

  it("shows each value as a bare number, its unit left off", async () => {
    // The unit's Rev-X Hall: 800 rather than 800Hz, 2.49 rather than 2.49s.
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    expect(values(shell)).toEqual(["10", "0.8", "1.2", "800", "2.49", "3.2", "27", "29"]);
    await click(shell, ".efx-page-next");
    expect(values(shell)).toEqual(["32", "6.30"]);
  });

  it("reads the lower row first on the knobs, and frames its first value as a page opens", async () => {
    // The unit's Rev-X Hall: the readout bar and the pink frame start from the
    // lower row, on the page the screen opens on and on the page stepped to.
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    const framed = (): string | null =>
      shell.root.querySelector(".efx-cell .value-box.is-focused")?.closest(".efx-cell")?.querySelector(".efx-cell-caption")?.textContent ?? null;
    expect(knobLabels(shell)).toEqual(["Rev.Time", "Ini.Delay", "Decay", "Room Size"]);
    expect(framed()).toBe("Rev.Time");
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell)).toEqual(["Diffusion", "Hi.Ratio", "Lo.Ratio", "Lo.Freq."]);

    await click(shell, ".efx-page-next");
    expect(knobLabels(shell)).toEqual(["HPF", "LPF", "", ""]);
    expect(framed(), "the page stepped to frames its own first value").toBe("HPF");
  });

  it("reads every value in the knob division under its own panel, on every page of every effect", async () => {
    // The readout bar keeps each value under the panel it reads (URX44V, 2026-09-22):
    // a row at a time, the lower row first, and a row with nothing to turn takes
    // no page of the knobs.
    const effects: (readonly [string, string])[] = [
      ...["Clean", "Crunch", "Lead", "Drive", "Pitch Fix"].map((e) => ["ch1", e] as const),
      ...["Rev-X Hall", "Rev-X Room", "Rev-X Plate", "Mono Delay", "Ping Pong"].map((e) => ["fx1", e] as const),
      ...["Rev.R3 Hall", "Rev.R3 Room", "Rev.R3 Plate"].map((e) => ["fx2", e] as const),
    ];
    let checked = 0;
    for (const [strip, effect] of effects) {
      let shell: Shell;
      if (strip.startsWith("fx")) {
        shell = await mount([{ id: "channel-view", strip }, { id: "ch.effect", strip }]);
        await click(shell, ".insfx-effect");
        await pick(shell, effect);
      } else {
        shell = await openParams(strip, effect);
      }
      for (let page = 1; ; page++) {
        const turned = [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")]
          .filter((c) => c.querySelector(".value-box"))
          .map((c) => ({
            row: Number(c.style.gridRow),
            column: Number(c.style.gridColumn.split(" ")[0]),
            // The bar names a row as the unit names it there, which is the panel's
            // own name but for Pitch Fix's first row.
            caption: (c.querySelector<HTMLElement>(".value-box")?.getAttribute("aria-label") ?? "").replace("Coarse", "Coarce"),
          }));
        const rows = [2, 1].filter((r) => turned.some((c) => c.row === r));
        const expected = rows.map((r) => [1, 2, 3, 4].map((col) => turned.find((c) => c.row === r && c.column === col)?.caption ?? ""));
        const read: string[][] = [];
        for (const _ of rows) {
          read.push(knobLabels(shell));
          await click(shell, ".knob-page-next");
        }
        expect(read, `${effect}, page ${page}`).toEqual(expected);
        expect(shell.root.querySelector(".knob-page-next"), `${effect}, page ${page}: no knob page past its rows`).toBeNull();
        while (shell.root.querySelector(".knob-page-prev")) await click(shell, ".knob-page-prev");
        checked += turned.length;
        if (!shell.root.querySelector(".efx-page-next")) break;
        await click(shell, ".efx-page-next");
      }
    }
    expect(checked, "the sweep reads values, not empty pages").toBeGreaterThan(50);
  });

  it("lays Pitch Fix out over the unit's three pages, its switch in the corner of each", async () => {
    // URX44V, 2026-09-23. Page one is the pitch itself under a strip naming it,
    // page two the scale on a keyboard, page three the note limits and Mix.
    const shell = await openParams("ch1", "Pitch Fix");
    const band = (): string => shell.root.querySelector(".efx-band")?.textContent ?? "";
    const corner = (): string => shell.root.querySelector(".pitch-corner")?.textContent ?? "";
    expect(captions(shell)).toEqual(["Coarse", "Fine", "Formant"]);
    expect(band()).toBe("Pitch");
    expect(corner(), "[Correction] stands in the corner").toBe("Correction");
    // The unit spells the first row without its `s` on the readout bar alone.
    expect(knobLabels(shell)).toEqual(["Coarce", "Fine", "Formant", ""]);
    expect(shell.root.querySelector(".efx-cell .value-box")?.getAttribute("aria-label")).toBe("Coarse");

    await click(shell, ".efx-page-next");
    expect(captions(shell), "no panel on the page that sets the scale").toEqual([]);
    expect([...shell.root.querySelectorAll(".pitch-row-caption")].map((n) => n.textContent)).toEqual([
      "MIDI Control", "Key", "Scale",
    ]);
    expect([...shell.root.querySelectorAll(".pitch-note")].map((n) => n.textContent), "Chromatic takes every note").toEqual([
      "C", "D", "E", "F", "G", "A", "B", "C#", "D#", "F#", "G#", "A#",
    ]);
    expect(corner()).toBe("Correction");
    expect(knobLabels(shell), "and the bar carries nothing").toEqual(["", "", "", ""]);

    await click(shell, ".efx-page-next");
    expect(captions(shell)).toEqual(["Mix", "Limit Low", "Limit High", "Speed", "Tolerance"]);
    expect(band()).toBe("Note Limit Low/High");
    expect(knobLabels(shell)).toEqual(["Limit Low", "Limit High", "Speed", "Tolerance"]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell), "Mix stands in the upper row's third place").toEqual(["", "", "Mix", ""]);
    expect(shell.root.querySelector(".efx-page-next"), "three pages").toBeNull();
  });

  it("lights the notes of the scale on Pitch Fix's keyboard, and turns one over on a touch", async () => {
    // URX44V, 2026-09-23: every note carries a circle, lit where the correction
    // takes it. Choosing a scale fills them in; touching one turns it over and
    // takes the Scale to Custom, which the unit never leaves on its own.
    const shell = await openParams("ch1", "Pitch Fix");
    await click(shell, ".efx-page-next");
    const keys = (): HTMLElement[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".pitch-key, .pitch-key-black")];
    const lit = (): string[] =>
      keys().filter((n) => n.getAttribute("aria-pressed") === "true").map((n) => n.textContent ?? "");
    expect(keys().map((n) => n.textContent), "a key, and a circle on it, for every note").toEqual([
      "C", "D", "E", "F", "G", "A", "B", "C#", "D#", "F#", "G#", "A#",
    ]);
    expect(lit().length, "Chromatic takes them all").toBe(12);

    // The lists are the unit's own: a scale or a key chosen there fills the keyboard.
    const choose = async (caption: string, name: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".pitch-row")]
        .find((r) => r.querySelector(".pitch-row-caption")?.textContent === caption)
        ?.querySelector<HTMLElement>(".pulldown")
        ?.click();
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option, .source-btn")]
        .find((b) => b.textContent === name)
        ?.click();
      await flush();
    };
    const chooseScale = (name: string): Promise<void> => choose("Scale", name);
    await chooseScale("Major");
    expect(lit(), "C major takes the white notes").toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    await choose("Key", "D");
    // The keyboard is drawn white keys first, so D major lights five of them and
    // the two sharps after them.
    expect(lit()).toEqual(["D", "E", "G", "A", "B", "C#", "F#"]);

    // A note the operator turns off takes the Scale with it.
    keys().find((n) => n.textContent === "E")?.click();
    await flush();
    expect(lit()).toEqual(["D", "G", "A", "B", "C#", "F#"]);
    expect(shell.ctx.store.str("ch.ch1.insFx.scale", ""), "and the Scale reads Custom").toBe("Custom");
    // Choosing Custom itself changes nothing, and nothing takes the Scale back.
    await chooseScale("Custom");
    expect(lit()).toEqual(["D", "G", "A", "B", "C#", "F#"]);
    keys().find((n) => n.textContent === "E")?.click();
    await flush();
    expect(lit(), "the note comes back without the Scale following").toEqual(["D", "E", "G", "A", "B", "C#", "F#"]);
    expect(shell.ctx.store.str("ch.ch1.insFx.scale", "")).toBe("Custom");

    // A key chosen while the Scale reads Custom moves nothing either (URX44V, 2026-09-23).
    await choose("Key", "F");
    expect(lit()).toEqual(["D", "E", "G", "A", "B", "C#", "F#"]);

    await chooseScale("Single");
    expect(lit(), "Single takes the key alone").toEqual(["F"]);
  });

  it("opens on the first page, whichever page the effect before it was left on", async () => {
    const shell = await openParams("ch1", "Clean");
    await click(shell, ".efx-page-next");
    expect(captions(shell)[2]).toBe("SP Type");

    // Taking another effect on the screen the effect is set on.
    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");
    expect(captions(shell)[0], "the effect that follows opens on its own first page").toBe("Type");

    // And coming back to it from the channel view.
    await click(shell, ".efx-page-next");
    expect(captions(shell)).toEqual(["", "SP Type", "Gate Level", "Mic Position"]);
    shell.ctx.nav.back();
    await flush();
    await click(shell, ".cv-block-insfx");
    expect(captions(shell)[0], "the screen opens on the first page").toBe("Type");
  });

  it("opens an FX channel's effect on the first page from the channel view", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }]);
    await shell.ctx.store.set("ui.effectPage", 1);
    await click(shell, ".cv-block-fx");
    expect(captions(shell)[0]).toBe("Diffusion");
  });

  it("keeps a page the effect does not have inside the ones it does", async () => {
    // The page is one setting for every effect, and they do not all run that far.
    const shell = await openParams("ch1", "Clean");
    await shell.ctx.store.set("ui.effectPage", 5);
    await flush();
    expect(captions(shell)[2], "the last page it has").toBe("SP Type");
    expect(shell.root.querySelector(".efx-page-next"), "and nothing after it").toBeNull();
    expect(shell.root.querySelector(".efx-page-prev"), "with the way back to the first").not.toBeNull();
  });

  it("puts a knob under every value it lets the operator turn", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    const cells = [...shell.root.querySelectorAll(".efx-cell")];
    expect(cells.length).toBe(8);
    expect(cells.filter((c) => c.querySelector(".knob-graphic.is-control")).length).toBe(8);
  });

  it("steps the pages from where the SSMCS screens step theirs", async () => {
    const shell = await openParams("ch1", "Clean");
    expect(shell.root.querySelector(".efx-page-next.ssmcs-page-next"), "the next arrow").not.toBeNull();
    await click(shell, ".efx-page-next");
    expect(shell.root.querySelector(".efx-page-prev.ssmcs-page-prev"), "and the one back").not.toBeNull();
  });

  it("stands the block's own input and output beside the panels", async () => {
    const shell = await openParams("ch1", "Clean");
    const bars = (side: number): number =>
      shell.root.querySelectorAll(`.dyn-io .dyn-io-col:nth-child(${side}) .meter-bar`).length;
    expect(shell.root.querySelector(".dyn-io"), "the screen carries the meters").not.toBeNull();
    expect([bars(1), bars(2)], "a mono insert takes one and gives one").toEqual([1, 1]);
  });

  it("hands the bands back to the unit while its own knob is driving them", async () => {
    const shell = await openParams("bus.stereo", "M.B.Comp");
    await click(shell, ".efx-page-next");
    expect(knobLabels(shell)).toEqual(["Threshold", "Ratio", "Attack", "Release"]);
    const boxes = (): HTMLInputElement[] => [...shell.root.querySelectorAll<HTMLInputElement>(".dyn-set .value-box")];
    expect(boxes().length, "both times are the operator's").toBe(2);

    await shell.ctx.store.set("ch.bus.stereo.insFx.oneKnobOn", true);
    await flush();
    expect(boxes().length, "the rows stay where they are").toBe(2);
    expect(boxes().map((b) => b.getAttribute("aria-disabled")), "held by the unit").toEqual(["true", "true"]);
    expect(shell.root.querySelector(".mbc-bypass"), "and the unit takes [Bypass] off the page").toBeNull();
    expect(knobLabels(shell), "and the knob strip carries its level alone").toEqual(["1-knob Level", "", "", ""]);
    // The grips go small and lose their letters, as the EQ's do under its own knob.
    expect([...shell.root.querySelectorAll(".dyn-handle")].map((h) => h.classList.contains("is-fixed"))).toEqual([true, true]);
    expect(shell.root.querySelectorAll(".dyn-handle text").length, "and carry no letter").toBe(0);
    expect(shell.root.querySelector(".dyn-plot")?.classList.contains("is-oneknob")).toBe(true);

    // Out Gain is the one row the knob leaves to the operator.
    await click(shell, ".efx-page-prev");
    expect(shell.root.querySelectorAll(".efx-cell .value-box").length).toBe(1);
    expect(knobLabels(shell)).toEqual(["1-knob Level", "", "", ""]);
  });

  it("leaves CLEAN's Speed and Depth turnable whichever of Cho / OFF / Vib is taken, as the unit does", async () => {
    // Effect Reference Guide, "CLEAN Only": Speed / Depth set the vibrato and are
    // not available with Cho. On the unit that is what they do to the sound: the
    // two rows look and turn the same under all three (URX44V, 2026-09-22).
    const shell = await openParams("ch1", "Clean");
    await click(shell, ".efx-page-next");
    const speedDepth = (): (Element | null)[] =>
      [...shell.root.querySelectorAll(".efx-cell")]
        .filter((c) => ["Speed", "Depth"].includes(c.querySelector(".efx-cell-caption")?.textContent ?? ""))
        .map((c) => c.querySelector(".value-box"));
    for (const mod of ["Cho", "Off", "Vib"]) {
      await shell.ctx.store.set("ch.ch1.insFx.mod", mod);
      await flush();
      expect(speedDepth().map((n) => n?.classList.contains("value-box")), mod).toEqual([true, true]);
      expect(knobLabels(shell), mod).toEqual(["Speed", "Depth", "Gate Level", ""]);
    }
  });
});

describe("a compander", () => {
  const openParams = async (strip: string, effect: string): Promise<Shell> => {
    const shell = await mount([{ id: "channel-view", strip }, { id: "ch.insfx", strip }]);
    await click(shell, ".insfx-effect");
    await pick(shell, effect);
    return shell;
  };
  /** What the drawn curve says the effect puts out for an input level. */
  const curve = (shell: Shell): ((db: number) => number) => {
    const pts = (shell.root.querySelector(".dyn-curve-line")?.getAttribute("points") ?? "")
      .split(" ")
      .map((p) => p.split(",").map(Number));
    return (db) => PLOT_MIN + ((PLOT_H - (pts[db - PLOT_MIN]?.[1] ?? NaN)) / PLOT_H) * PLOT_SPAN;
  };

  it("is drawn on the frame the channel's own compressor is drawn on", async () => {
    const shell = await openParams("ch1", "Compander-H");
    expect(shell.root.querySelector(".dyn-curve"), "the curve down the left").not.toBeNull();
    expect(shell.root.querySelector(".dyn-gr"), "the reduction meter beside it").not.toBeNull();
    expect([...shell.root.querySelectorAll(".dyn-set-caption")].map((n) => n.textContent)).toEqual([
      "Attack", "Release", "Ratio",
    ]);
    // The narrow box prints the millisecond as `m`, as the channel's own COMP does.
    expect([...shell.root.querySelectorAll(".dyn-set .value-box")].map((n) => n.textContent)).toEqual([
      "1m", "229m", "3.5:1",
    ]);
    // The readout bar under the screen keeps the whole word.
    await click(shell, ".knob-page-next");
    expect([...shell.root.querySelectorAll(".knob-cell-value")].map((n) => n.textContent)).toEqual(["1ms", "229ms"]);
    expect(shell.root.querySelectorAll(".efx-cell").length, "and no panels").toBe(0);
    expect(shell.root.querySelector(".dyn-io"), "the block's own input and output").not.toBeNull();
  });

  it("carries a grip for the gain, the band and the threshold", async () => {
    const shell = await openParams("ch1", "Compander-H");
    expect([...shell.root.querySelectorAll(".dyn-handle")].map((n) => n.getAttribute("aria-label"))).toEqual([
      "W handle: Width", "T handle: Threshold", "G handle: Gain",
    ]);
  });

  it("turns the value its grip stands for, the way the grip stands", async () => {
    const shell = await openParams("ch1", "Compander-H");
    const grip = (letter: string): HTMLElement | null =>
      shell.root.querySelector<HTMLElement>(`.dyn-handle[aria-label^="${letter} handle"]`);
    const press = async (letter: string, key: string): Promise<void> => {
      grip(letter)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await flush();
    };
    expect(grip("T")?.getAttribute("role"), "a grip that turns a value is a control").toBe("slider");
    expect(grip("T")?.getAttribute("aria-valuetext")).toBe("-10.0dB");

    grip("T")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(grip("T")?.classList.contains("is-held"), "touching it draws the border round it").toBe(true);
    expect(shell.ctx.focus.holds("ch.ch1.insFx.threshold"), "and the focus is on what it turns").toBe(true);

    await press("T", "ArrowRight");
    expect(shell.ctx.store.num("ch.ch1.insFx.threshold", 0), "T moves the threshold").toBeCloseTo(-9.9, 5);
    await press("G", "ArrowUp");
    expect(shell.ctx.store.num("ch.ch1.insFx.gain", -99), "G moves the output gain").toBeCloseTo(0, 5);
    await press("G", "ArrowDown");
    expect(shell.ctx.store.num("ch.ch1.insFx.gain", 0)).toBeCloseTo(-0.1, 5);
    await press("W", "ArrowRight");
    expect(shell.ctx.store.num("ch.ch1.insFx.width", 0), "and W the width of the band").toBe(7);
  });

  it("holds the output at the crossing of the rules and slopes away from it", async () => {
    // Compander-H comes up at -10.0dB, 3.5:1, 6dB wide, with the gain at its
    // ceiling. The line is flat from the crossing (0dB in, 0dB out) to the right
    // edge; from the crossing down to the threshold the ratio sets the slope; the
    // band under it is 1.0:1; below the band it falls 5:1.
    const at = curve(await openParams("ch1", "Compander-H"));
    expect(at(10), "flat from the crossing to the right edge").toBeCloseTo(0, 1);
    expect(at(0), "the crossing itself").toBeCloseTo(0, 1);
    expect(at(-4), "3.5:1 from the crossing down").toBeCloseTo(-1.14, 1);
    expect(at(-10), "at the threshold").toBeCloseTo(-2.86, 1);
    expect(at(-16), "the foot of the band, 1.0:1 under the threshold").toBeCloseTo(-8.86, 1);
    expect(at(-16) - at(-10), "the band itself is 1.0:1").toBeCloseTo(-6, 1);
    expect(at(-26), "and what falls below it is pulled down 5:1").toBeCloseTo(-58.86, 1);
    expect((at(-16) - at(-26)) / 10, "the slope below the band").toBeCloseTo(5, 1);
  });

  it("pulls what falls below the band down harder on Compander-H than on Compander-S", async () => {
    // Measured through the unit: H at 5:1 against S's 1.5:1.
    const h = curve(await openParams("ch1", "Compander-H"));
    const s = curve(await openParams("ch2", "Compander-S"));
    const slope = (at: (db: number) => number, foot: number): number => (at(foot) - at(foot - 10)) / 10;
    // H's band foot is at -16dB, S's at -32dB (-8.0dB threshold, 24dB wide).
    expect(slope(h, -16), "Compander-H").toBeCloseTo(5, 1);
    expect(slope(s, -32), "Compander-S").toBeCloseTo(1.5, 1);
  });

  it("moves the curve when the values that shape it are turned", async () => {
    const shell = await openParams("ch1", "Compander-H");
    const cx = (letter: string): number =>
      Number(shell.root.querySelector(`.dyn-handle[aria-label^="${letter} handle"] circle`)?.getAttribute("cx"));
    const before = cx("W");
    await shell.ctx.store.set("ch.ch1.insFx.width", 30);
    await flush();
    expect(curve(shell)(-26), "the band does not bend the curve").toBeCloseTo(-18.86, 1);
    expect(cx("W"), "the width moves the grip that stands for it").toBeLessThan(before);

    await shell.ctx.store.set("ch.ch1.insFx.gain", -6);
    await flush();
    expect(curve(shell)(10), "the gain takes the flat top down with it").toBeCloseTo(-6, 1);
    expect(curve(shell)(-26), "and the whole of the line with it").toBeCloseTo(-24.86, 1);

    await shell.ctx.store.set("ch.ch1.insFx.gain", 0);
    await shell.ctx.store.set("ch.ch1.insFx.ratio", 1);
    await flush();
    expect(curve(shell)(-4), "at 1.0:1 the slope from the crossing is 1.0:1 too").toBeCloseTo(-4, 1);
    expect(curve(shell)(-26)).toBeCloseTo(-26, 1);
  });

  it("runs its flat top along the rule the gain stands on", async () => {
    // The gain's ceiling is 0.0dB, where the line leaves the crossing of the rules.
    const shell = await openParams("ch1", "Compander-H");
    const rules = [...shell.root.querySelectorAll(".dyn-plot line.dyn-grid")];
    const across = rules.find((n) => n.getAttribute("y1") === n.getAttribute("y2"));
    const down = rules.find((n) => n.getAttribute("x1") === n.getAttribute("x2"));
    const top = Number(
      shell.root.querySelector(`.dyn-handle[aria-label^="G handle"] circle`)?.getAttribute("cy"),
    );
    // A rule is snapped to the middle of a pixel row, so it lands within half a
    // pixel of the level it stands for.
    expect(Math.abs(Number(across?.getAttribute("y1")) - top), "the flat top runs on the rule across").toBeLessThanOrEqual(0.5);
    expect(curve(shell)(0), "and the corner sits where the rules cross").toBeCloseTo(0, 1);
    expect(
      Math.abs(Number(down?.getAttribute("x1")) - ((0 - PLOT_MIN) / PLOT_SPAN) * PLOT_W),
      "the rule down the plot stands at 0dB in",
    ).toBeLessThanOrEqual(0.5);
  });

  it("stands the gain's grip at the top right, its ring a ring's width from the frame", async () => {
    const shell = await openParams("ch1", "Compander-H");
    const disc = (letter: string): SVGCircleElement | null =>
      shell.root.querySelector<SVGCircleElement>(`.dyn-handle[aria-label^="${letter} handle"] circle`);
    const cx = Number(disc("G")?.getAttribute("cx"));
    // The ring straddles the radius, so the disc reaches half a ring past it.
    expect(PLOT_W - (cx + HANDLE_R + HANDLE_RING / 2), "a ring's width of frame beside it").toBeCloseTo(HANDLE_RING, 5);
    expect(Number(disc("G")?.getAttribute("cy")), "on the curve, in the top half").toBeLessThan(PLOT_H / 2);
    expect([...shell.root.querySelectorAll(".dyn-handle")].at(-1)?.getAttribute("aria-label"), "drawn last, over the rest").toBe(
      "G handle: Gain",
    );
  });

  it("keeps no disc more than half under another, whatever the band and the threshold", async () => {
    // W stops half a disc short of T rather than passing under it, and G — whose
    // place along the plot says nothing — steps past T when the threshold reaches it.
    const shell = await openParams("ch1", "Compander-H");
    const cx = (letter: string): number =>
      Number(shell.root.querySelector(`.dyn-handle[aria-label^="${letter} handle"] circle`)?.getAttribute("cx"));
    const bad: string[] = [];
    for (let t = -54; t <= 0; t += 3) {
      for (const w of [1, 6, 24, 90]) {
        await shell.ctx.store.set("ch.ch1.insFx.threshold", t);
        await shell.ctx.store.set("ch.ch1.insFx.width", w);
        await flush();
        const [W, T, G] = [cx("W"), cx("T"), cx("G")];
        for (const [a, b, pair] of [[W, T, "W/T"], [T, G, "T/G"], [W, G, "W/G"]] as const) {
          if (Math.abs(a - b) < HANDLE_R - 0.001) bad.push(`t=${t} w=${w} ${pair} ${Math.abs(a - b).toFixed(1)}`);
        }
        for (const [letter, x] of [["W", W], ["T", T], ["G", G]] as const) {
          if (x < HANDLE_R - 0.001 || x > PLOT_W - HANDLE_R + 0.001) bad.push(`t=${t} w=${w} ${letter} off the plot`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("drags a grip along the axis it stands on, and the band out from under the threshold", async () => {
    const shell = await openParams("ch1", "Compander-H");
    const drag = async (letter: string, dx: number): Promise<void> => {
      shell.root
        .querySelector<HTMLElement>(`.dyn-handle[aria-label^="${letter} handle"]`)
        ?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 240, clientY: 120, bubbles: true }));
      await flush();
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 240 + dx, clientY: 120 }));
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
    };

    await drag("T", 40);
    expect(shell.ctx.store.num("ch.ch1.insFx.threshold", -99), "T to the right raises the threshold").toBeGreaterThan(-10);
    // W stands at the foot of the band, so widening it carries the grip the other way.
    await drag("W", -40);
    expect(shell.ctx.store.num("ch.ch1.insFx.width", 0), "W to the left widens the band").toBeGreaterThan(6);
  });

  it("shows how far it is holding the channel down", async () => {
    setMeterSource(() => [-6]);
    try {
      const shell = await openParams("ch1", "Compander-H");
      const bar = (): string | undefined => shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height;
      // 4 dB over the threshold, on the reduction bars' scale.
      expect(bar()).toBe(`${grBarShare(4) * 100}%`);
      await shell.ctx.store.set("ch.ch1.insFx.threshold", -3);
      await flush();
      expect(bar(), "under the threshold it holds nothing down").toBe("0%");
      await shell.ctx.store.set("ch.ch1.insFx.threshold", -10);
      await shell.ctx.store.set("ch.ch1.insFx.on", false);
      await flush();
      expect(bar(), "and a block that is off holds nothing either").toBe("0%");
    } finally {
      setMeterSource(null);
    }
  });

  it("puts every one of its values on the knobs", async () => {
    const shell = await openParams("ch1", "Compander-H");
    expect(knobLabels(shell)).toEqual(["Threshold", "Ratio", "Width", "Gain"]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell)).toEqual(["Attack", "Release", "", ""]);
  });

  it("sets the effect on the screen the effect was taken on, with no second screen under it", async () => {
    // A compander fills the screen, so the effect area is the screen that sets it.
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-S");
    expect(shell.ctx.nav.current.id, "the INS FX screen itself").toBe("ch.insfx");
    expect(shell.root.querySelectorAll(".dyn-handle").length, "the grips are on it").toBe(3);
    expect([...shell.root.querySelectorAll(".dyn-set .value-box")].map((n) => n.textContent), "and the values turn").toEqual([
      "25m", "165m", "4.0:1",
    ]);
    expect(shell.root.querySelector(".efx-rack"), "nothing opens a screen under it").toBeNull();
    expect(shell.root.querySelectorAll(".dyn-io").length, "one pair of meters").toBe(1);
    expect(knobLabels(shell), "and the readout bar carries its values").toEqual(["Threshold", "Ratio", "Width", "Gain"]);
  });
});

describe("a channel view's insert block", () => {
  it("leaves its own switch alone while the channel carries nothing", async () => {
    const shell = await mount([{ id: "channel-view", strip: "ch1" }]);
    const badge = (): HTMLElement | null =>
      shell.root.querySelector<HTMLElement>('.cv-block[aria-label="INS FX"] .badge-switch');
    badge()?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true), "the unit's switch does nothing there").toBe(false);

    shell.ctx.nav.push({ id: "ch.insfx", strip: "ch1" });
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Crunch");
    shell.ctx.nav.back();
    await flush();
    badge()?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.insFx.on", true), "and switches it once there is one").toBe(false);
  });

  it("draws the pair's insert on both halves while they are linked", async () => {
    const shell = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    for (const id of ["ch1", "ch2"]) await shell.ctx.store.set(`ch.${id}.signalType`, "STEREO");
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Compander-H");

    // The pair holds it on CH 1; CH 2's own block and HOME strip show it too.
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    await flush();
    const block = shell.root.querySelector('.cv-block[aria-label="INS FX"]');
    expect(block?.textContent).toBe("INS FXCompander-H");
    expect(block?.querySelector(".badge-switch")?.getAttribute("aria-pressed")).toBe("true");

    shell.ctx.nav.home();
    await flush();
    const lit = [...shell.root.querySelectorAll(".strip .badge-insfx.is-on")].length;
    expect(lit, "both halves light it on HOME").toBe(2);
  });
});

describe("an FX channel", () => {
  it("is the effect it is running, and says which", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }]);
    const block = shell.root.querySelector(".cv-block");
    expect(block?.textContent, "the channel's name over the effect's").toBe("FX1Rev-X Hall");
    // The name is a label: an FX channel's effect carries no switch of its own.
    expect(block?.querySelector(".badge-switch")).toBeNull();
    expect(shell.ctx.store.has("ch.fx1.effect.on"), "and the unit holds none").toBe(false);

    // Nor does taking an effect give it one.
    shell.ctx.nav.push({ id: "ch.effect", strip: "fx1" });
    await flush();
    await click(shell, ".insfx-effect");
    await pick(shell, "Ping Pong");
    expect(shell.ctx.store.str("ch.fx1.effect.type", "")).toBe("Ping Pong");
    expect(shell.ctx.store.has("ch.fx1.effect.on"), "taking one writes no switch").toBe(false);
  });

  it("opens its effect from the channel view, and its settings from there", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }]);
    await click(shell, ".cv-block");
    expect(shell.ctx.nav.current.id, "the panel opens what sets the effect").toBe("ch.effect");
    expect(captions(shell)).toEqual([
      "Diffusion", "Hi.Ratio", "Lo.Ratio", "Lo.Freq.", "Rev.Time", "Ini.Delay", "Decay", "Room Size",
    ]);
  });

  it("is fed by one bus and returns two, which its meters show", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    const bars = (side: number): number =>
      shell.root.querySelectorAll(`.dyn-io .dyn-io-col:nth-child(${side}) .meter-bar`).length;
    expect(bars(1), "one bar in").toBe(1);
    expect(bars(2), "two bars out").toBe(2);
  });

  it("moves the reverb time it prints when the room around it is turned", async () => {
    // The two are one setting on the unit, so the reading follows the value the
    // channel is holding rather than the one the effect comes up at.
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    const revTime = (): string =>
      [...shell.root.querySelectorAll(".efx-cell")]
        .find((c) => c.querySelector(".efx-cell-caption")?.textContent === "Rev.Time")
        ?.querySelector(".value-box")?.textContent ?? "";
    expect(revTime()).toBe("2.49");
    await shell.ctx.store.set("ch.fx1.effect.roomSize", 0);
    await flush();
    expect(revTime()).toBe("0.89");
  });

  it("opens the effect it is given on the first page", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    await click(shell, ".efx-page-next");
    expect(captions(shell)).toEqual(["HPF", "LPF"]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Rev-X Room");
    expect(captions(shell)[0]).toBe("Diffusion");
  });

  it("fills the effect with its own settings when the type changes", async () => {
    // The two reverbs and the two delays name some of their rows alike, so a
    // type change that left the values where they were would show one effect's
    // number under another effect's law.
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    expect(shell.ctx.store.str("ch.fx2.effect.type", "")).toBe("Mono Delay");
    expect(shell.ctx.store.num("ch.fx2.effect.hpf", -1)).toBe(35);
    await click(shell, ".insfx-effect");
    await pick(shell, "Rev.R3 Hall");
    expect(shell.ctx.store.num("ch.fx2.effect.hpf", -1)).toBe(24);
    expect(shell.ctx.store.num("ch.fx2.effect.feedback", -1)).toBe(0);
  });

  it("names the channel in the toolbar, and heads every list EFFECT TYPE", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    // The middle of the toolbar names the channel and switches nothing, unlike
    // the block name every other channel screen puts there.
    expect(shell.root.querySelector(".badge-title")?.textContent).toBe("FX2");
    expect(shell.root.querySelector(".badge-title")?.classList.contains("badge-plain")).toBe(true);
    expect(shell.root.querySelector(".insfx-effect")?.textContent).toBe("Mono Delay");

    await click(shell, ".insfx-effect");
    expect(shell.root.querySelector(".source-sheet .source-title")?.textContent).toBe("EFFECT TYPE");

    // An insert's list carries the same band, not the channel's own name.
    const insert = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(insert, ".insfx-effect");
    expect(insert.root.querySelector(".source-sheet .source-title")?.textContent).toBe("EFFECT TYPE");
    expect(insert.root.querySelector(".badge-title")?.textContent).toBe("INS FX");
  });

  it("stands [No Effect] alone at the head of the list, the effects under it", async () => {
    const insert = await mount([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    await click(insert, ".insfx-effect");
    const rows = [...insert.root.querySelectorAll(".source-sheet .source-row")].map((r) =>
      [...r.querySelectorAll(".source-btn")].map((b) => b.textContent),
    );
    expect(rows[0], "the first row takes it off and nothing else").toEqual(["No Effect"]);
    expect(rows[1], "the effects start at the left of the next row").toEqual(["Clean", "Crunch", "Lead", "Drive"]);
    expect(rows.flat().filter((n) => n === "No Effect").length, "and it is on the sheet once").toBe(1);

    // An FX channel is never without an effect, and its list runs three to a row:
    // the reverbs on the first, the two delays on the second.
    const fx = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    await click(fx, ".insfx-effect");
    const fxRows = [...fx.root.querySelectorAll(".source-sheet .source-row")].map((r) =>
      [...r.querySelectorAll(".source-btn")].map((b) => b.textContent),
    );
    expect(fxRows).toEqual([
      ["Rev-X Hall", "Rev-X Room", "Rev-X Plate"],
      ["Mono Delay", "Ping Pong"],
    ]);
  });

  it("offers each FX channel the reverbs that channel has", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    await click(shell, ".insfx-effect");
    expect([...shell.root.querySelectorAll(".source-sheet .source-btn")].map((b) => b.textContent)).toEqual([
      "Rev-X Hall", "Rev-X Room", "Rev-X Plate", "Mono Delay", "Ping Pong",
    ]);

    const two = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    await click(two, ".insfx-effect");
    expect([...two.root.querySelectorAll(".source-sheet .source-row")].map((r) =>
      [...r.querySelectorAll(".source-btn")].map((b) => b.textContent),
    )).toEqual([
      ["Rev.R3 Hall", "Rev.R3 Room", "Rev.R3 Plate"],
      ["Mono Delay", "Ping Pong"],
    ]);
  });

  it("sets a delay's time from the note and the tempo while Sync is on, and leaves the Note to be chosen either way", async () => {
    // Effect Reference Guide, "Delay Section": with tempo sync on the delay time
    // follows the Note and BPM settings. A quarter note at 120 BPM is 500 ms. On
    // the unit the time stays turnable under Sync and turning it leaves Sync on, and
    // Sync changes nothing about the Note's box or what it offers (URX44V, 2026-09-22).
    for (const [strip, effect] of [["fx2", "Mono Delay"], ["fx1", "Ping Pong"]] as const) {
      const shell = await mount([{ id: "channel-view", strip }, { id: "ch.effect", strip }]);
      await click(shell, ".insfx-effect");
      await pick(shell, effect);
      const base = `ch.${strip}.effect`;
      // The time stands on the first page, Sync and the Note on the second.
      const page = async (n: number): Promise<void> => {
        await shell.ctx.store.set("ui.effectPage", n);
        await flush();
      };
      const sync = async (): Promise<void> => {
        await page(1);
        [...shell.root.querySelectorAll<HTMLElement>(".efx-cell.is-bare .efx-button")].find((b) => b.textContent === "Sync")?.click();
        await flush();
      };
      const delay = (): number => shell.ctx.store.num(`${base}.delay`, -1);
      const control = (caption: string): Element | null | undefined =>
        [...shell.root.querySelectorAll(".efx-cell")]
          .find((c) => (c.querySelector(".efx-cell-caption")?.textContent ?? "").startsWith(caption))
          ?.querySelector(".value-box, .pulldown");
      await shell.ctx.store.set(`${base}.delay`, 333);
      await flush();
      expect(control("Delay")?.classList.contains("value-box"), `${effect}: the time turns with Sync off`).toBe(true);
      // The Note opens and takes a value with Sync off, and the time stays where it is.
      await page(1);
      (control("Note") as HTMLElement | null | undefined)?.click();
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>(".dropdown-list .dropdown-option")].find((b) => b.getAttribute("aria-label") === "1/8")?.click();
      await flush();
      expect([shell.ctx.store.str(`${base}.note`, ""), delay()], `${effect}: Note taken, time kept`).toEqual(["1/8", 333]);
      await shell.ctx.store.set(`${base}.note`, "1/4");
      await flush();

      await sync();
      expect(shell.ctx.store.bool(`${base}.sync`, false)).toBe(true);
      expect(delay(), `${effect}: 1/4 at 120 BPM`).toBe(500);
      expect(control("Note")?.getAttribute("aria-disabled"), "the Note as it was").toBeNull();
      await page(0);
      expect(control("Delay")?.classList.contains("value-box"), "and the time still turns with Sync on").toBe(true);

      await shell.ctx.store.set(`${base}.delay`, 600);
      expect([delay(), shell.ctx.store.bool(`${base}.sync`, false)], "turned by hand, with Sync left on").toEqual([600, true]);
      await shell.ctx.store.set(`${base}.bpm`, 121);
      expect(delay(), `${effect}: the next tempo puts it back on the note`).toBe(495.9);
      await shell.ctx.store.set(`${base}.bpm`, 60);
      expect(delay(), `${effect}: the tempo moves it`).toBe(1000);
      await shell.ctx.store.set(`${base}.note`, "1/8T");
      expect(delay(), `${effect}: and so does the note`).toBe(333.3);
      // A time past what the delay reaches stops at its end.
      await shell.ctx.store.set(`${base}.note`, "whole x2");
      expect(delay()).toBe(effect === "Mono Delay" ? 2700 : 1350);

      await sync();
      expect(shell.ctx.store.bool(`${base}.sync`, true)).toBe(false);
      await shell.ctx.store.set(`${base}.bpm`, 120);
      await flush();
      expect(delay(), `${effect}: with Sync off the tempo leaves the time alone`).toBe(effect === "Mono Delay" ? 2700 : 1350);
      expect(control("Note")?.getAttribute("aria-disabled")).toBeNull();
    }
  });

  it("shuts the FX 2 strip out at the frequencies that channel cannot run", async () => {
    // The strip keeps its name row and is still selected; the colour leaves its
    // mark and its rail, and its indicator area no longer opens the channel view.
    const shell = await mount();
    await shell.ctx.store.set("ui.bank", 2);
    await flush();
    const fx2 = (): HTMLElement | null =>
      [...shell.root.querySelectorAll<HTMLElement>(".strip")].find(
        (n) => (n.getAttribute("aria-label") ?? "").startsWith("FX2"),
      ) ?? null;
    expect(fx2()?.style.getPropertyValue("--rail"), "at 48 kHz it carries its own colour").toBe("#1965ff");

    await shell.ctx.store.set("setup.samplingFrequency", 192000);
    await flush();
    expect(fx2()?.style.getPropertyValue("--rail"), "the rail runs dark").toBe("var(--strip-rail-shut)");
    // The first line of the name row, and nothing else on the strip.
    expect(fx2()?.querySelector(".strip-id")?.textContent).toBe("FX2");
    expect(fx2()?.querySelector(".strip-icon"), "no mark").toBeNull();
    expect(fx2()?.querySelector(".strip-title"), "no name").toBeNull();
    for (const part of [".ind-block", ".meter", ".strip-buttons", ".strip-pan", ".strip-level"]) {
      expect(fx2()?.querySelector(part), `no ${part}`).toBeNull();
    }

    fx2()?.querySelector<HTMLElement>(".strip-name")?.click();
    await flush();
    expect(shell.ctx.store.str("ui.selectedStrip", ""), "it can still be selected").toBe("fx2");
    fx2()?.querySelector<HTMLElement>(".strip-name")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "and it does not open the channel view").toBe("home");

    // FX 1 runs at every frequency the unit takes, so its strip is untouched.
    const fx1 = [...shell.root.querySelectorAll<HTMLElement>(".strip")].find(
      (n) => (n.getAttribute("aria-label") ?? "").startsWith("FX1"),
    );
    expect(fx1?.style.getPropertyValue("--rail")).toBe("#1965ff");
    expect(fx1?.querySelector(".strip-icon"), "and keeps its mark").not.toBeNull();
  });

  it("offers FX 2 nothing at the frequencies that channel cannot run", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    await shell.ctx.store.set("setup.samplingFrequency", 192000);
    await flush();
    await click(shell, ".insfx-effect");
    expect([...shell.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].map((b) => b.textContent)).toEqual([
      "Rev.R3 Hall", "Rev.R3 Room", "Rev.R3 Plate", "Mono Delay", "Ping Pong",
    ]);
    // An FX channel has no [No Effect] to fall to, so the one it is running stays.
    expect(shell.ctx.store.str("ch.fx2.effect.type", "")).toBe("Mono Delay");

    // FX 1 runs all five at every frequency the unit takes.
    const one = await mount([{ id: "channel-view", strip: "fx1" }, { id: "ch.effect", strip: "fx1" }]);
    await one.ctx.store.set("setup.samplingFrequency", 192000);
    await flush();
    await click(one, ".insfx-effect");
    expect([...one.root.querySelectorAll(".source-sheet .source-btn.is-disabled")].length).toBe(0);
  });

  it("names the delay row what the unit names it on each of the two delays", async () => {
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    expect(captions(shell)).toEqual(["HPF", "LPF", "Delay", "FB.Gain", "Hi.Ratio"]);
    expect(values(shell)).toEqual(["150", "8.50", "500.0", "20", "0.7"]);
  });

  it("lays Rev.R3 out over two pages, in the panels the unit puts each control in", async () => {
    // URX44V, 2026-09-23, read on Rev.R3 Hall; the three Rev.R3 faces are built the same.
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    await click(shell, ".insfx-effect");
    await pick(shell, "Rev.R3 Hall");
    const placed = (): [string, string, string][] =>
      [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")].map((c) => [
        c.querySelector(".efx-cell-caption")?.textContent ?? "",
        c.style.gridRow,
        c.style.gridColumn,
      ]);
    expect(placed()).toEqual([
      ["Density", "1", "1"], ["FB.Gain", "1", "2"], ["E/R Delay", "1", "3"], ["E/R Bal.", "1", "4"],
      ["Rev.Time", "2", "1"], ["Ini.Delay", "2", "2"], ["Hi.Ratio", "2", "3"], ["Diffusion", "2", "4"],
    ]);
    // The readout bar reads the lower row, then the upper, each value under its panel.
    expect(knobLabels(shell)).toEqual(["Rev.Time", "Ini.Delay", "Hi.Ratio", "Diffusion"]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell)).toEqual(["Density", "FB.Gain", "E/R Delay", "E/R Bal."]);
    await click(shell, ".efx-page-next");
    expect(placed(), "the second page stands on the lower row").toEqual([["HPF", "2", "1"], ["LPF", "2", "2"]]);
    expect(shell.root.querySelector(".efx-page-next"), "two pages").toBeNull();
    expect(knobLabels(shell)).toEqual(["HPF", "LPF", "", ""]);
  });

  it("lays Mono Delay out over two pages, in the panels the unit puts each control in", async () => {
    // URX44V, 2026-09-22. Page one: HPF and LPF at the left of the upper row, Delay,
    // FB.Gain and Hi.Ratio at the left of the lower. Page two: Sync on its own
    // button, LPF again and BPM at the right of the upper row, and the Note list at
    // the right of the lower row, both on the glass.
    const shell = await mount([{ id: "channel-view", strip: "fx2" }, { id: "ch.effect", strip: "fx2" }]);
    const placed = (): [string, string, string][] =>
      [...shell.root.querySelectorAll<HTMLElement>(".efx-cell")].map((c) => [
        c.querySelector(".efx-cell-caption")?.textContent || c.querySelector(".efx-button")?.textContent || "",
        c.style.gridRow,
        c.style.gridColumn,
      ]);
    expect(placed()).toEqual([
      ["HPF", "1", "1"], ["LPF", "1", "2"], ["Delay", "2", "1"], ["FB.Gain", "2", "2"], ["Hi.Ratio", "2", "3"],
    ]);
    // The readout bar reads the lower row, then the upper, each value under its panel.
    expect(knobLabels(shell)).toEqual(["Delay", "FB.Gain", "Hi.Ratio", ""]);
    await click(shell, ".knob-page-next");
    expect(knobLabels(shell)).toEqual(["HPF", "LPF", "", ""]);
    await click(shell, ".efx-page-next");
    expect(placed()).toEqual([["Sync", "1", "1"], ["BPM", "1", "4"], ["Note", "2", "4"]]);
    expect(shell.root.querySelector(".efx-page-next"), "two pages").toBeNull();
    const bare = [...shell.root.querySelectorAll(".efx-cell.is-bare")];
    expect(bare.map((c) => c.querySelector(".efx-button, .pulldown")?.getAttribute("aria-label") ?? c.querySelector(".efx-button")?.textContent))
      .toEqual(["Sync", "Note: 1/4 (15 options)"]);
    expect(bare[0]?.querySelector(".efx-cell-caption")?.textContent, "Sync has no caption").toBe("");
    // The Note stands at the foot of its place, a panel wide rather than a division wide.
    expect([bare[1]?.classList.contains("is-foot"), bare[1]?.classList.contains("is-division")]).toEqual([true, false]);
    expect(knobLabels(shell), "BPM in the division under it, three left empty").toEqual(["", "", "", "BPM"]);
  });
});

describe("the compander's own meters", () => {
  const openInsert = (strip: string): Promise<Shell> =>
    mount([{ id: "channel-view", strip }, { id: "ch.insfx", strip }]);

  it("reads its OUT lower by what its bar is holding down", async () => {
    setMeterSource(() => [-6]);
    try {
      const shell = await openInsert("ch1");
      await click(shell, ".insfx-effect");
      await pick(shell, "Compander-H");
      await flush();
      const out = (): number =>
        Number([...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")][1]?.dataset["meterOffset"] ?? 0);
      const bar = (): number => Number.parseFloat(shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height ?? "0");
      expect(bar(), "the bar is holding the channel down").toBeGreaterThan(0);
      expect(bar() / 100, "and OUT reads that much lower").toBeCloseTo(grBarShare(out()), 6);

      await shell.ctx.store.set("ch.ch1.insFx.on", false);
      await flush();
      expect(bar(), "an effect that is off holds nothing down").toBe(0);
      expect(out()).toBe(0);
    } finally {
      setMeterSource(null);
    }
  });
});
