import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { setMeterSource, startMeterTicker } from "./meters";

// Signal Type is a setting of a channel PAIR. Both channels have to agree about
// it, the pair has to be the adjacent one, and the screens have to say which two
// channels are joined — otherwise a stereo pair looks exactly like two mono
// channels that happen to be side by side.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Mounted {
  shell: Shell;
  store: DeviceStore;
}

async function mount(): Promise<Mounted> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return { shell, store };
}

async function open(shell: Shell, id: string, strip: string): Promise<void> {
  shell.ctx.nav.push({ id, strip });
  await flush();
}

async function goHome(shell: Shell): Promise<void> {
  shell.ctx.nav.home();
  await flush();
}

/** The CH SETTING field whose caption starts with `caption`. */
function field(shell: Shell, caption: string): HTMLElement | undefined {
  return [...shell.root.querySelectorAll<HTMLElement>(".chs-field")].find((f) =>
    (f.textContent ?? "").startsWith(caption),
  );
}

/** Open the CH SETTING Signal Type list and take `value` from it. */
async function pickSignalType(shell: Shell, value: string): Promise<void> {
  const pulldown = field(shell, "Signal Type")?.querySelector<HTMLElement>(".pulldown");
  expect(pulldown, "CH SETTING offers Signal Type").not.toBeNull();
  if ((pulldown?.textContent ?? "").includes(value)) return;
  pulldown?.click();
  await flush();
  const option = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === value);
  expect(option, `the list offers ${value}`).toBeDefined();
  option?.click();
  await flush();
}

/** Put a pair in stereo without going through the screen that writes it. */
async function link(store: DeviceStore, ...ids: string[]): Promise<void> {
  for (const id of ids) await store.set(`ch.${id}.signalType`, "STEREO");
  await flush();
}

/** Every value a channel is placed by: its own place and each of its sends'. */
function placings(store: DeviceStore, id: string): number[] {
  const paths = [
    `ch.${id}.pan`,
    `ch.${id}.balance`,
    ...store.pathsUnder(`ch.${id}.send`).filter((p) => p.endsWith(".balance")),
  ];
  return paths.map((p) => store.num(p, NaN));
}

const marks = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".strip-link")];

/** The channel ID of the strip each link mark is drawn in. */
const markedStrips = (shell: Shell): string[] =>
  marks(shell).map((m) => m.closest(".strip")?.querySelector(".strip-id")?.textContent ?? "");

describe("the stereo link of a mono channel pair", () => {
  it("writes Signal Type to both channels of the pair, not to the one on screen", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");

    expect(store.str("ch.ch1.signalType", "")).toBe("STEREO");
    expect(store.str("ch.ch2.signalType", ""), "the partner follows").toBe("STEREO");
    // The pair CH1 owns is CH2 alone; nothing beyond it moves.
    expect(store.str("ch.ch3.signalType", "")).toBe("MONO x 2");
    expect(store.str("ch.ch4.signalType", "")).toBe("MONO x 2");
  });

  it("takes the partner from the even channel too", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch4");
    await pickSignalType(shell, "STEREO");

    expect(store.str("ch.ch3.signalType", ""), "CH 4 pairs with the channel below it").toBe("STEREO");
    expect(store.str("ch.ch2.signalType", "")).toBe("MONO x 2");
  });

  it("marks the link in the gap, from the right-hand channel of each pair", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2", "ch3", "ch4");
    await goHome(shell);

    // Two pairs, two gaps: CH 1|CH 2 and CH 3|CH 4. A mark on CH 1 or CH 3 would
    // fall in the gap before the pair, and a pairing of CH 2 with CH 3 would put
    // one mark in the gap between the pairs.
    expect(markedStrips(shell)).toEqual(["CH 2", "CH 4"]);
    expect(marks(shell)[0]?.parentElement?.className).toBe("strip-pan");
    expect(marks(shell).map((m) => m.getAttribute("aria-label"))).toEqual([
      "CH 1 and CH 2 stereo link",
      "CH 3 and CH 4 stereo link",
    ]);
  });

  it("carries the selection frame round itself, on the side of the selected channel", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2");
    await goHome(shell);
    const mark = (): string => shell.root.querySelector(".strip-link")?.className ?? "";

    // The frame of the left channel reaches the mark from the left and the right
    // channel's from the right; with neither selected there is no frame to carry.
    await store.set("ui.selectedStrip", "ch1");
    await flush();
    expect(mark()).toBe("strip-link is-framed is-framed-left");

    await store.set("ui.selectedStrip", "ch2");
    await flush();
    expect(mark()).toBe("strip-link is-framed is-framed-right");

    await store.set("ui.selectedStrip", "ch3");
    await flush();
    expect(mark()).toBe("strip-link");
  });

  it("marks nothing while the pair runs as two mono channels", async () => {
    const { shell } = await mount();
    await goHome(shell);
    expect(marks(shell)).toHaveLength(0);
  });

  it("marks nothing when the partner is not on screen beside it", async () => {
    const { shell, store } = await mount();
    // CH 3 pairs with CH 4, which stands to its right, so the gap on its left
    // belongs to no pair.
    await link(store, "ch3");
    await goHome(shell);
    expect(markedStrips(shell)).toEqual([]);
  });

  it("keeps one meter on each channel of a linked pair", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2");
    await goHome(shell);

    const lanes = [...shell.root.querySelectorAll(".strip")].map((s) => s.querySelectorAll(".meter-lane").length);
    expect(lanes.slice(0, 4), "a linked pair is still two channels on HOME").toEqual([1, 1, 1, 1]);

    // The channel view meters the channel, not the pair, on both halves.
    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelectorAll(".cv-onoff .meter-lane"), id).toHaveLength(1);
    }
  });

  it("meters the pair in stereo on the GATE, COMP, EQ and INS FX screens, CH 1 on the left", async () => {
    // Each channel reads a level of its own, so the lanes say which side is which.
    const levels: Record<string, number> = { ch1: -12, ch2: -36 };
    setMeterSource((id, channels) => Array.from({ length: channels }, () => levels[id] ?? -96));
    const unlit = (db: number): string => `${(1 - (db + 60) / 60) * 100}%`;
    try {
      const { shell, store } = await mount();
      const lanes = (col: number): string[] =>
        [...shell.root.querySelectorAll<HTMLElement>(`.dyn-io .dyn-io-col:nth-child(${col}) .meter-bar`)].map((b) =>
          b.style.getPropertyValue("--unlit"),
        );
      for (const screen of ["ch.gate", "ch.comp", "ch.eq", "ch.insfx"]) {
        await goHome(shell);
        await open(shell, "channel-view", "ch1");
        await open(shell, screen, "ch1");
        expect([lanes(1).length, lanes(2).length], `${screen} on a mono channel`).toEqual([1, 1]);
      }

      await link(store, "ch1", "ch2");
      for (const id of ["ch1", "ch2"]) {
        for (const screen of ["ch.gate", "ch.comp", "ch.eq", "ch.insfx"]) {
          await goHome(shell);
          await open(shell, "channel-view", id);
          await open(shell, screen, id);
          expect([lanes(1).length, lanes(2).length], `${screen} on ${id}: IN and OUT in stereo`).toEqual([2, 2]);
          expect(lanes(1), `${screen} on ${id}`).toEqual([unlit(-12), unlit(-36)]);
        }
      }

      // The ticker keeps both sides moving, each from its own channel.
      levels["ch1"] = -48;
      levels["ch2"] = -6;
      const stop = startMeterTicker(store, shell.root, 20);
      await new Promise((resolve) => setTimeout(resolve, 60));
      stop();
      expect(lanes(1), "after a tick").toEqual([unlit(-48), unlit(-6)]);
    } finally {
      setMeterSource(null);
    }
  });
});

describe("the PAN / BAL choice a stereo pair carries", () => {
  const panBal = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".chs-panbal .btn")];

  it("is offered only once the pair is stereo", async () => {
    const { shell } = await mount();
    await open(shell, "ch.setting", "ch1");
    expect(panBal(shell), "two mono channels have one PAN each and nothing to choose").toHaveLength(0);

    await pickSignalType(shell, "STEREO");
    expect(panBal(shell).map((b) => b.textContent)).toEqual(["PAN", "BAL"]);
    // The pair comes up on its balance (p093-1).
    expect(panBal(shell).map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);

    // It reads as the Signal Type's own choice, so it follows it directly.
    const row = shell.root.querySelector(".chs-panbal");
    expect(row?.previousElementSibling?.textContent).toContain("Signal Type");
    expect(row?.nextElementSibling, "and closes the screen").toBeNull();
  });

  it("is picked from a list, not stepped by tapping the box", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    field(shell, "Signal Type")?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();

    // The tap opens the list and settles nothing by itself.
    expect(store.str("ch.ch1.signalType", "")).toBe("MONO x 2");
    const options = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")];
    expect(options.map((o) => o.textContent)).toEqual(["MONO x 2", "STEREO"]);
    expect(options[0]?.getAttribute("aria-pressed"), "the list shows where it stands").toBe("true");

    const list = options[0]?.closest<HTMLElement>(".dropdown-list");
    expect([list?.style.left, list?.style.top], "the list is placed against its box").not.toContain("");

    options[1]?.click();
    await flush();
    expect(store.str("ch.ch1.signalType", "")).toBe("STEREO");
    expect(shell.root.querySelector(".dropdown-list"), "and closes on the pick").toBeNull();
  });

  it("takes the list away with the screen that opened it", async () => {
    const { shell } = await mount();
    await open(shell, "ch.setting", "ch1");
    field(shell, "Signal Type")?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    expect(shell.root.querySelector(".dropdown-list")).not.toBeNull();

    shell.ctx.nav.back();
    await flush();
    expect(shell.root.querySelector(".dropdown-list"), "a list cannot outlive its screen").toBeNull();
  });

  it("is never offered on a channel that has no pair", async () => {
    const { shell } = await mount();
    await open(shell, "ch.setting", "ch_5_6");
    expect(field(shell, "Signal Type"), "a stereo input is stereo already").toBeUndefined();
    expect(panBal(shell)).toHaveLength(0);
  });

  it("moves both channels of the pair onto the balance", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    panBal(shell)[0]?.click();
    await flush();
    expect([store.str("ch.ch1.panBal", ""), store.str("ch.ch2.panBal", "")]).toEqual(["PAN", "PAN"]);

    panBal(shell)[1]?.click();
    await flush();
    expect(store.str("ch.ch1.panBal", "")).toBe("BAL");
    expect(store.str("ch.ch2.panBal", ""), "the partner follows").toBe("BAL");

    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .cv-caption")?.textContent).toBe("BALANCE");
    }
  });

  it("gives the pair one balance rather than one each", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2");
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.panBal`, "BAL");
    await store.set("ch.ch1.balance", 21);
    await store.set("ch.ch2.balance", -55);
    await flush();

    // A stereo pair is placed by one balance, so the upper half reads the same
    // value as the lower one and not a second setting of its own.
    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .value-box")?.textContent, id).toBe("R21");
    }
  });

  it("captions the position PAN while the pair is held on its two pans", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2");
    await open(shell, "channel-view", "ch1");
    expect(shell.root.querySelector(".cv-pan .cv-caption")?.textContent).toBe("PAN");
  });

  it("comes up on the pair's balance, not on two pans", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    expect([store.str("ch.ch1.panBal", ""), store.str("ch.ch2.panBal", "")]).toEqual(["BAL", "BAL"]);

    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .cv-caption")?.textContent, id).toBe("BALANCE");
    }
  });

  it("centres both channels when the pair is linked", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.pan", -40);
    await store.set("ch.ch1.send.bus.mix1.balance", 30);
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");

    expect(placings(store, "ch1").every((v) => v === 0), "CH 1 is centred everywhere").toBe(true);
    expect(placings(store, "ch2").every((v) => v === 0), "and so is CH 2").toBe(true);
    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .value-box")?.textContent, id).toBe("C");
    }
  });

  it("hard-pans the odd channel left and the even one right on PAN", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    panBal(shell)[0]?.click();
    await flush();

    expect(placings(store, "ch1").every((v) => v === -63), "CH 1 goes hard left").toBe(true);
    expect(placings(store, "ch2").every((v) => v === 63), "CH 2 goes hard right").toBe(true);
    for (const [id, reading] of [["ch1", "L63"], ["ch2", "R63"]]) {
      await open(shell, "channel-view", id ?? "");
      expect(shell.root.querySelector(".cv-pan .cv-caption")?.textContent, id).toBe("PAN");
      expect(shell.root.querySelector(".cv-pan .value-box")?.textContent, id).toBe(reading);
    }
  });

  it("centres the pair again when BAL is taken back", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    panBal(shell)[0]?.click();
    await flush();
    panBal(shell)[1]?.click();
    await flush();

    expect([...placings(store, "ch1"), ...placings(store, "ch2")].every((v) => v === 0)).toBe(true);
    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .value-box")?.textContent, id).toBe("C");
    }
  });

  it("centres the pair and returns it to PAN when it is unlinked", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    panBal(shell)[0]?.click();
    await flush();
    await pickSignalType(shell, "MONO x 2");

    expect([store.str("ch.ch1.panBal", ""), store.str("ch.ch2.panBal", "")]).toEqual(["PAN", "PAN"]);
    expect([...placings(store, "ch1"), ...placings(store, "ch2")].every((v) => v === 0), "nothing stays hard-panned").toBe(true);
    for (const id of ["ch1", "ch2"]) {
      await open(shell, "channel-view", id);
      expect(shell.root.querySelector(".cv-pan .cv-caption")?.textContent, id).toBe("PAN");
      expect(shell.root.querySelector(".cv-pan .value-box")?.textContent, id).toBe("C");
    }
  });

  it("carries the choice to the HOME slider the strip draws", async () => {
    const { shell, store } = await mount();
    await link(store, "ch1", "ch2");
    await store.set("ch.ch1.pan", -40);
    await store.set("ch.ch1.balance", 30);
    await goHome(shell);

    const slider = (): string => shell.root.querySelector<HTMLElement>(".strip .strip-pan")?.title ?? "";
    expect(slider(), "PAN while the pair is placed by two pans").toBe("L40");

    await store.set("ch.ch1.panBal", "BAL");
    await store.set("ch.ch2.panBal", "BAL");
    await flush();
    expect(slider()).toBe("R30");
  });
});

// What a linked pair holds one of. The collapse happens inside setSignalType,
// so these go through CH SETTING's pulldown; the `link()` helper writes
// signalType straight to the store and deliberately skips it.
describe("the values a stereo pair holds one of", () => {
  /** The values a linked pair shares, with a reading that is not the factory one. */
  const SHARED: [string, number | string | boolean][] = [
    ["level", -12],
    ["on", false],
    ["gate.threshold", -33],
    ["gate.on", true],
    ["hpf.freq", 100],
    ["comp.threshold", -25],
    ["recPoint", "PRE EQ"],
    ["send.bus.mix1.level", -6],
    ["send.bus.mix1.pre", true],
  ];

  /** The head amp, which each member keeps its own of. */
  const OWN: [string, number | boolean][] = [
    ["gain", 24],
    ["phantom", true],
    ["phase", true],
    ["hiZ", true],
    ["clipSafe", true],
  ];

  it("gives the pair one fader, one ON and one strip of processing when it is linked", async () => {
    const { shell, store } = await mount();
    for (const [key, value] of SHARED) await store.set(`ch.ch2.${key}`, value);
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");

    for (const [key] of SHARED) {
      expect(store.get(`ch.ch2.${key}`, "?"), `${key} is the pair's`).toEqual(store.get(`ch.ch1.${key}`, "!"));
    }
    // And the screen shows it: the two channel views read the same gate.
    const threshold = async (id: string): Promise<string> => {
      await open(shell, "channel-view", id);
      return shell.root.querySelector(".cv-block-value")?.textContent ?? "";
    };
    expect(await threshold("ch2")).toBe(await threshold("ch1"));
  });

  it("carries an edit on either member to the other", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");

    await store.set("ch.ch1.gate.threshold", -41);
    expect(store.num("ch.ch2.gate.threshold", 0), "the lower channel reaches the upper").toBe(-41);
    await store.set("ch.ch2.comp.threshold", -29);
    expect(store.num("ch.ch1.comp.threshold", 0), "and the upper reaches the lower").toBe(-29);
    await store.set("ch.ch1.send.bus.mix1.pre", true);
    expect(store.bool("ch.ch2.send.bus.mix1.pre", false)).toBe(true);

    // Through a control on the glass, not only a bare write.
    await goHome(shell);
    const onButton = shell.root.querySelector<HTMLElement>('[data-lamp-source="ch2"]')?.closest(".strip")?.querySelector<HTMLElement>(".btn-on");
    onButton?.click();
    await flush();
    expect([store.bool("ch.ch2.on", true), store.bool("ch.ch1.on", true)]).toEqual([false, false]);
  });

  it("leaves each member its own head amp", async () => {
    const { shell, store } = await mount();
    for (const [key, value] of OWN) await store.set(`ch.ch2.${key}`, value);
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");

    for (const [key, value] of OWN) {
      expect(store.get(`ch.ch2.${key}`, "?"), `${key} survives the link`).toEqual(value);
      expect(store.get(`ch.ch1.${key}`, "?"), `${key} is not copied over`).not.toEqual(value);
    }

    // And an edit on one member does not move the other, in either mode.
    for (const mode of ["PAN", "BAL"]) {
      await open(shell, "ch.setting", "ch1");
      [...shell.root.querySelectorAll<HTMLElement>(".chs-panbal .btn")].find((b) => b.textContent === mode)?.click();
      await flush();
      await store.set("ch.ch1.gain", 7);
      await store.set("ch.ch1.phantom", true);
      expect(store.num("ch.ch2.gain", 0), `${mode}: the partner's gain stands`).toBe(24);
      expect(store.bool("ch.ch2.phantom", false), `${mode}: and its +48V`).toBe(true);
      await store.set("ch.ch1.phantom", false);
    }
  });

  it("gives each member its own send placing outside BAL and one between them in BAL", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    const panBal = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".chs-panbal .btn")].find((b) => b.textContent === label);

    panBal("PAN")?.click();
    await flush();
    await store.set("ch.ch1.send.bus.mix1.balance", 20);
    expect(store.num("ch.ch2.send.bus.mix1.balance", 0), "outside BAL each send is its own").toBe(63);

    panBal("BAL")?.click();
    await flush();
    await store.set("ch.ch1.send.bus.mix1.balance", 20);
    expect(store.num("ch.ch2.send.bus.mix1.balance", 0), "on the balance the pair holds one").toBe(20);
  });

  it("leaves a pair that is not linked, and the strips beyond it, alone", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.level", -8);
    expect(store.num("ch.ch2.level", 0), "two mono channels stay two").toBe(0);

    await open(shell, "ch.setting", "ch1");
    await pickSignalType(shell, "STEREO");
    await store.set("ch.ch1.gate.threshold", -44);
    expect(store.num("ch.ch3.gate.threshold", 0), "the next pair is untouched").toBe(-50);
    expect(store.num("ch.ch4.gate.threshold", 0)).toBe(-50);

    // Only one half of a pair reading STEREO is not a linked pair.
    await store.set("ch.ch3.signalType", "STEREO");
    await store.set("ch.ch4.level", -3);
    expect(store.num("ch.ch3.level", 0), "a half-applied link carries nothing").toBe(0);
  });
});
