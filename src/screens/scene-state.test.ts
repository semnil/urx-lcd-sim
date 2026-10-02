import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import type { UnitModel } from "../model/types";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { applyScene, inScene } from "../model/scene-state";
import { applySettings, captureSettings } from "../model/settings-file";
import { recallScene, storeScene } from "./scene";
import { setSignalType } from "./stereo-link";
import { LEVEL_MIN_DB } from "../ui/param-spec";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(model: UnitModel["id"] = "URX44V"): Promise<Shell> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById(model))));
  const shell = new Shell(buildRegistry(), store, unitById(model));
  await flush();
  return shell;
}

describe("what a scene carries", () => {
  it("takes the mixer and leaves the unit's own settings where they are", () => {
    // Measured from a unit's own settings file: a scene holds the routing, the
    // sends, the faders, the processing, the names and the colours, and leaves
    // out the monitor and phones buses, the oscillator, the streaming bus, the
    // output patch, the recorder and the unit's settings.
    for (const path of [
      "ch.ch1.level",
      "ch.ch1.send.bus.mix1.on",
      "ch.ch1.gain",
      "ch.ch1.phantom",
      "ch.ch1.comp.threshold",
      "ch.ch1.name",
      "ch.ch1.color",
      "ch.ch1.source",
      "ch.bus.stereo.level",
      "source.usb-daw-1-2.digitalGain",
    ]) {
      expect(inScene(path), path).toBe(true);
    }
    for (const path of [
      "ch.bus.stream.level",
      "ch.bus.stream.color",
      "ch.bus.stream.source",
      "monitor.1.level",
      "phones.1.level",
      "osc.on",
      "setup.outputPatch.tab",
      "sd.trackCount",
      "setup.brightness",
      "ui.selectedStrip",
      "scene.current",
    ]) {
      expect(inScene(path), path).toBe(false);
    }
  });
});

describe("storing and recalling a scene", () => {
  it("puts the mixer back where it was when the scene was stored", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.level", -12);
    await shell.ctx.store.set("ch.ch1.name", "Kick");
    await shell.ctx.store.set("ch.ch2.comp.on", true);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await storeScene(shell.ctx, "Standard", 1);

    // Move the mixer somewhere else, then come back.
    await shell.ctx.store.set("ch.ch1.level", 3);
    await shell.ctx.store.set("ch.ch1.name", "Snare");
    await shell.ctx.store.set("ch.ch2.comp.on", false);
    await recallScene(shell.ctx, 1);
    expect([
      shell.ctx.store.num("ch.ch1.level", 0),
      shell.ctx.store.str("ch.ch1.name", ""),
      shell.ctx.store.bool("ch.ch2.comp.on", false),
    ]).toEqual([-12, "Kick", true]);
    expect(shell.ctx.store.num("scene.current", -1), "and it is the scene in view").toBe(1);
  });

  it("puts back a ratio stored at the top of its travel", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    await shell.ctx.store.set("scene.Standard.1.title", "top");
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 40);
    await recallScene(shell.ctx, 1);
    expect(shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves the streaming bus where the unit keeps it", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stream.level", -4);
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("ch.bus.stream.level", -18);
    await recallScene(shell.ctx, 1);
    expect(shell.ctx.store.num("ch.bus.stream.level", 99)).toBe(-18);
    const stored = Object.keys(JSON.parse(shell.ctx.store.str("scene.Standard.1.state", "{}")) as object);
    expect(stored.filter((p) => p.startsWith("ch.bus.stream")), "and the stored copy holds none of it").toEqual([]);
    expect(stored, "which is not how it holds the stereo bus").toContain("ch.bus.stereo.level");
  });

  it("puts the sends into a bus on Pan Link where their sources are, whatever the stored scene holds", async () => {
    // A scene stored while Pan Link left each send's own placing where it was.
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("ch.ch1.pan", -40);
    await s.set("ch.bus.mix1.panLink", true);
    await s.restore("ch.ch1.send.bus.mix1.balance", 21);
    await storeScene(shell.ctx, "Standard", 1);
    await recallScene(shell.ctx, 1);
    expect(s.num("ch.ch1.send.bus.mix1.balance", 0)).toBe(-40);
  });

  it("puts back only what a scene carries, whatever the stored copy holds", async () => {
    const shell = await mount();
    const brightness = shell.ctx.store.num("setup.brightness", 99);
    await applyScene(shell.ctx.store, { "ch.ch1.level": -9, "monitor.1.level": -40, "setup.brightness": 1 });
    expect([
      shell.ctx.store.num("ch.ch1.level", 99),
      shell.ctx.store.num("monitor.1.level", 99),
      shell.ctx.store.num("setup.brightness", 99),
    ]).toEqual([-9, 0, brightness]);
  });

  it("leaves the monitor, the oscillator and the unit's settings alone", async () => {
    const shell = await mount();
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("monitor.1.level", -20);
    await shell.ctx.store.set("osc.on", true);
    await shell.ctx.store.set("setup.brightness", 3);
    await recallScene(shell.ctx, 1);
    expect([
      shell.ctx.store.num("monitor.1.level", 0),
      shell.ctx.store.bool("osc.on", false),
      shell.ctx.store.num("setup.brightness", 0),
    ]).toEqual([-20, true, 3]);
  });

  it("puts back a gain above +40 dB stored with HI-Z off, over a connector whose HI-Z is on", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch3.gain", 60);
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("ch.ch3.hiZ", true);
    expect(shell.ctx.store.num("ch.ch3.gain", 99), "HI-Z brought it down").toBe(40);
    await recallScene(shell.ctx, 1);
    expect([shell.ctx.store.num("ch.ch3.gain", 99), shell.ctx.store.bool("ch.ch3.hiZ", true)]).toEqual([60, false]);
  });

  it("brings the unit's own mixer back from scene 00, which nothing stores over", async () => {
    const shell = await mount();
    const factory = shell.ctx.store.num("ch.ch1.level", 99);
    await shell.ctx.store.set("ch.ch1.level", -30);
    await shell.ctx.store.set("ch.ch1.gain", 40);
    await recallScene(shell.ctx, 0);
    expect([shell.ctx.store.num("ch.ch1.level", 99), shell.ctx.store.num("ch.ch1.gain", 99)]).toEqual([factory, -8]);
    expect(shell.ctx.store.num("scene.current", -1)).toBe(0);
  });

  it("lays each preset over the unit's own mixer, as the unit holds P01 to P03", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    const shippedColor = s.str("ch.ch1.color", "");
    await s.set("ch.ch1.color", "Green");
    const stereo = (): string[] => ["ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"].map((id) => s.str(`ch.${id}.source`, ""));

    await recallScene(shell.ctx, 101);
    expect([s.str("ch.ch1.name", ""), s.num("ch.ch1.gain", 0), s.bool("ch.ch1.comp.on", false), s.str("ch.ch1.eq.low.shape", ""), s.num("ch.ch1.level", 0)]).toEqual([
      "Dyn.Mic",
      40,
      true,
      "HPF",
      LEVEL_MIN_DB,
    ]);
    expect(stereo(), "P01's stereo channels").toEqual(["AUX IN", "USB MAIN A", "USB SUB", "None"]);
    expect([s.str("ch.fx1.effect.type", ""), s.str("ch.fx1.name", "-"), s.bool("ch.fx2.on", true), s.str("ch.fx2.name", "-"), s.str("ch.bus.mix2.name", "")]).toEqual([
      "Rev-X Plate",
      "Reverb",
      false,
      "",
      "MIX3",
    ]);
    expect(s.num("source.usb-main-a.digitalGain", -1), "USB MAIN A's digital gain").toBe(0);
    expect(s.str("ch.ch1.color", ""), "what a preset does not set comes back as the unit ships it").toBe(shippedColor);
    expect([s.num("ch.ch1.eq.high.gain", 99), s.bool("ch.ch1.ssmcs.on", true)], "HIGH shows 0 dB, and SSMCS is off").toEqual([0, false]);
    await s.set("ch.ch1.eq.oneKnob.level", 100);
    expect(s.num("ch.ch1.eq.lowMid.gain", 0), "1-knob's Intensity scales the preset's curve").toBe(-16);
    expect(s.num("ch.ch1.eq.high.gain", 0), "HIGH from the +7 dB the preset keeps under a band at 0 dB").toBe(14);
    await s.set("ch.ch1.eq.oneKnob.level", 25);
    expect(s.num("ch.ch1.eq.lowMid.gain", 0), "from the curve the preset holds at 50").toBe(-4);

    await recallScene(shell.ctx, 102);
    expect([s.str("ch.ch3.name", ""), s.num("ch.ch3.gain", 0), s.bool("ch.ch3.hiZ", false), s.bool("ch.ch3.eq.on", true)]).toEqual(["Gt./Ba.", 15, true, false]);
    expect(s.str("ch.ch1.name", ""), "P02's CH 1").toBe("Dyn.Mic");

    await recallScene(shell.ctx, 103);
    expect(stereo(), "P03's stereo channels").toEqual(["USB DAW 1/2", "None", "None", "None"]);
    expect([s.str("ch.ch1.recPoint", ""), s.str("ch.ch_5_6.recPoint", ""), s.bool("ch.ch1.eq.oneKnob.on", true), s.bool("ch.bus.mix1.eq.on", true)]).toEqual([
      "PRE GATE",
      "PRE EQ",
      false,
      false,
    ]);
    expect(s.num("scene.current", -1)).toBe(103);

    await recallScene(shell.ctx, 0);
    expect([s.str("ch.ch1.name", ""), s.str("ch.ch1.eq.low.shape", ""), s.str("ch.ch_5_6.source", ""), s.num("source.usb-main-a.digitalGain", 0)]).toEqual([
      "ch 1",
      "L.Shelf",
      "AUX IN",
      -14,
    ]);
  });

  it("lays a preset's channels onto a URX22's, its HI-Z CH 2 taking the preset's CH 3 and the four stereo channels from CH 3/4 in order", async () => {
    const shell = await mount("URX22");
    const s = shell.ctx.store;
    await recallScene(shell.ctx, 101);
    expect(["ch1", "ch2"].map((id) => s.str(`ch.${id}.name`, "")), "P01's CH 1-2").toEqual(["Dyn.Mic", "Dyn.Mic"]);
    await recallScene(shell.ctx, 102);
    expect(["ch1", "ch2"].map((id) => s.str(`ch.${id}.name`, "")), "P02's CH 1-2").toEqual(["Dyn.Mic", "Gt./Ba."]);
    expect([s.bool("ch.ch2.hiZ", false), s.num("ch.ch2.gain", 0), s.bool("ch.ch1.hiZ", true)], "CH 2 on HI-Z at +15 dB, CH 1 not").toEqual([true, 15, false]);
    expect(["ch_3_4", "ch_5_6", "ch_7_8", "ch_9_10"].map((id) => s.str(`ch.${id}.source`, ""))).toEqual(["AUX IN", "USB MAIN A", "USB SUB", "None"]);
    expect(s.has("ch.ch3.name"), "and no channel it does not have").toBe(false);
    await recallScene(shell.ctx, 103);
    expect([s.str("ch.ch2.name", ""), s.str("ch.ch2.recPoint", "")], "P03's CH 2").toEqual(["Gt./Ba.", "PRE GATE"]);
  });

  it("brings a source's digital gain the scene does not name back to 0 dB", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("scene.Standard.1.title", "take one");
    await storeScene(shell.ctx, "Standard", 1);
    await s.set("source.usb-daw-1-2.digitalGain", 10);
    await recallScene(shell.ctx, 1);
    expect(s.num("source.usb-daw-1-2.digitalGain", 99), "a stored scene").toBe(0);
    await s.set("source.hdmi.digitalGain", -6);
    await recallScene(shell.ctx, 0);
    expect([s.num("source.hdmi.digitalGain", 99), s.num("source.usb-main-a.digitalGain", 0)], "scene 00").toEqual([0, -14]);
  });

  it("brings a source's digital gain a settings file does not name back to 0 dB", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("source.usb-main-a.digitalGain", 6);
    const file = captureSettings(s);
    await s.set("source.usb-daw-1-2.digitalGain", 10);
    await s.set("source.usb-main-a.digitalGain", -3);
    await applySettings(s, file);
    expect([s.num("source.usb-daw-1-2.digitalGain", 99), s.num("source.usb-main-a.digitalGain", 99)]).toEqual([0, 6]);
  });

  it("stores the mixer when a number is named for the first time", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch3.level", -7);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    shell.ctx.nav.push({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await shell.ctx.store.set("scene.selected", 2);
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".scene-actions .btn")].find((b) => b.textContent === "Store")?.click();
    await flush();
    const field = shell.root.querySelector<HTMLElement>(".title-field");
    expect(field, "the title sheet opens on a number that holds nothing").not.toBeNull();
    [...shell.root.querySelectorAll<HTMLElement>(".pick-dialog-ok")][0]?.click();
    await flush();

    await shell.ctx.store.set("ch.ch3.level", 0);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 40);
    await recallScene(shell.ctx, 2);
    expect(shell.ctx.store.num("ch.ch3.level", 99)).toBe(-7);
    expect(shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0), "a ratio at the top of its travel too").toBe(Number.POSITIVE_INFINITY);
  });
});

describe("a recall puts back what the stored copy holds", () => {
  // An edit carries other writes with it (Sync's delay time, a linked pair's
  // partner). Putting a stored copy back is not an edit: every value comes back
  // as it was stored, whatever order the copy holds them in.
  const targets = [
    ["scene", async (shell: Shell, apply: () => Promise<void>) => {
      await shell.ctx.store.set("scene.Standard.1.title", "take one");
      await storeScene(shell.ctx, "Standard", 1);
      await apply();
      await recallScene(shell.ctx, 1);
    }],
    ["settings file", async (shell: Shell, apply: () => Promise<void>) => {
      const saved = captureSettings(shell.ctx.store);
      await apply();
      await applySettings(shell.ctx.store, saved);
    }],
  ] as const;

  for (const [target, roundTrip] of targets) {
    for (const type of ["Mono Delay", "Ping Pong"]) {
      it(`keeps a ${type} time turned by hand under Sync (${target})`, async () => {
        const shell = await mount();
        const store = shell.ctx.store;
        await store.set("ch.fx2.effect.type", type);
        await store.set("ch.fx2.effect.bpm", 120);
        await store.set("ch.fx2.effect.note", "1/4");
        await store.set("ch.fx2.effect.sync", true);
        expect(store.num("ch.fx2.effect.delay", 0), "Sync set the time from the note").toBe(500);
        await store.set("ch.fx2.effect.delay", 505);
        await roundTrip(shell, async () => {
          await store.set("ch.fx2.effect.sync", false);
          await store.set("ch.fx2.effect.delay", 600);
        });
        expect([store.num("ch.fx2.effect.delay", 0), store.bool("ch.fx2.effect.sync", false)]).toEqual([505, true]);
      });
    }

    it(`keeps two channels stored apart over a linked pair (${target})`, async () => {
      const shell = await mount();
      const store = shell.ctx.store;
      await store.set("ch.ch1.level", -10);
      await store.set("ch.ch2.level", -20);
      const strip = unitById("URX44V").inputs[0];
      if (!strip) throw new Error("no CH 1");
      await roundTrip(shell, async () => {
        setSignalType(shell.ctx, strip, "STEREO");
        await flush();
        expect(store.num("ch.ch2.level", 0), "linking put the pair on CH 1's values").toBe(-10);
      });
      expect([store.num("ch.ch1.level", 0), store.num("ch.ch2.level", 0), store.str("ch.ch2.signalType", "")]).toEqual([
        -10,
        -20,
        "MONO x 2",
      ]);
    });
  }
});

describe("what SCENE LIST's rows tell assistive technology", () => {
  it("describes each row by the marks it carries: the factory, the padlock and the recalled scene's glyph", async () => {
    const shell = await mount();
    const s = shell.ctx.store;
    await s.set("scene.Standard.1.title", "Prot");
    await s.set("scene.Standard.2.title", "Open");
    shell.ctx.nav.push({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const rows = (): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".scene-list .list-row")];
    const described = (): (string | null)[] => rows().slice(0, 3).map((r) => r.getAttribute("aria-description"));
    const button = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".scene-actions .btn")].find((b) => (b.getAttribute("aria-label") ?? b.textContent) === label);
    const tap = async (node: HTMLElement | undefined): Promise<void> => {
      node?.click();
      await flush();
    };
    expect(described(), "00 ships with the unit and is the one recalled; 01 and 02 carry no mark").toEqual(["recalled, factory scene", null, null]);

    await tap(rows()[1]);
    await s.set("ui.sceneMenu", "Edit");
    await flush();
    expect(button("Protect")?.getAttribute("aria-pressed"), "[Protect] before it is pressed").toBe("false");
    await tap(button("Protect"));
    expect(s.num("scene.Standard.1.protect", 0)).toBe(1);
    expect(button("Protect")?.getAttribute("aria-pressed"), "[Protect] once 01 is protected").toBe("true");
    expect(described(), "the Edit tab draws no recalled glyph").toEqual(["factory scene", "protected", null]);

    await s.set("ui.sceneMenu", "Store/Recall");
    await flush();
    await tap(rows()[2]);
    await tap(button("Recall"));
    await tap([...shell.root.querySelectorAll<HTMLElement>("[role=dialog] .btn")].find((b) => b.textContent === "OK"));
    await flush();
    expect(s.num("scene.current", -1)).toBe(2);
    expect(described(), "02 recalled").toEqual(["factory scene", "protected", "recalled"]);
  });

  it("names the list, whose rows the arrow keys, Home and End step the focus along, the selection staying where it is", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.nav.push({ id: "scene" });
      shell.ctx.nav.push({ id: "scene.list" });
      await flush();
      const body = shell.root.querySelector(".scene-list .list-body");
      const rows = [...shell.root.querySelectorAll<HTMLElement>(".scene-list .list-row")];
      /** A key going down on the row holding the focus: whether the list took it, and the rows that hold the focus and the selection then. */
      const key = (name: string): (boolean | number)[] => {
        const ev = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
        document.activeElement?.dispatchEvent(ev);
        return [ev.defaultPrevented, rows.indexOf(document.activeElement as HTMLElement), shell.ctx.store.num("scene.selected", 0)];
      };
      expect([body?.getAttribute("role"), body?.getAttribute("aria-label"), rows.length]).toEqual(["listbox", "Scene List", 64]);
      rows[0]?.focus();
      const seen = ["ArrowDown", "ArrowDown", "ArrowUp", "End", "ArrowDown", "Home", "ArrowUp", "ArrowRight"].map((name) => [name, ...key(name)]);
      expect(seen).toEqual([
        ["ArrowDown", true, 1, 0],
        ["ArrowDown", true, 2, 0],
        ["ArrowUp", true, 1, 0],
        ["End", true, 63, 0],
        ["ArrowDown", true, 63, 0],
        ["Home", true, 0, 0],
        ["ArrowUp", true, 0, 0],
        ["ArrowRight", false, 0, 0],
      ]);
      const selected = [...shell.root.querySelectorAll(".scene-list .list-row")].map((r) => r.getAttribute("aria-selected")).indexOf("true");
      expect([shell.ctx.store.num("scene.selected", 0), selected], "the selection where it was").toEqual([0, 0]);
      (body as HTMLElement | null)?.focus();
      expect([document.activeElement === body, ...key("ArrowDown")], "the list itself leaves the key to its own scroll").toEqual([true, false, -1, 0]);
    } finally {
      shell.destroy();
      shell.root.remove();
    }
  });
});
