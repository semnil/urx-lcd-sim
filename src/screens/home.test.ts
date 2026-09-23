import { describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { CH_COLOR_PALETTE, unitById } from "../model/units";
import { bankStrips } from "../model/types";
import { bankName, channelLabel } from "./strip-state";
import { buildRegistry } from "./index";
import { setMeterSource, startMeterTicker } from "./meters";
import { declarations, px, readStyle } from "../style/css-read";
import { version as packageVersion } from "../../package.json";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
/** What a control is called: its label where it carries one, else its words, as a mark drawn instead of a letter is named. */
const accessibleName = (n: Element): string => n.getAttribute("aria-label") ?? n.textContent ?? "";

async function mount(id: "URX44V" | "URX44" | "URX22" = "URX44V"): Promise<Shell> {
  const model = unitById(id);
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return shell;
}

const CSS = readStyle("lcd.css");
const TOKENS = readStyle("tokens.css");

describe("the auto-gain buttons, which this simulator does not build", () => {
  it("draws [AUTO] and [Auto Gain] where the unit has them, out of reach", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const auto = shell.root.querySelector<HTMLButtonElement>(".cv-gain-buttons .btn");
    expect([auto?.textContent, auto?.disabled, auto?.classList.contains("is-disabled")]).toEqual(["AUTO", true, true]);
    // [SAFE] beside it is a setting, so it still works.
    const safe = [...shell.root.querySelectorAll<HTMLButtonElement>(".cv-gain-buttons .btn")][1];
    expect([safe?.textContent, safe?.disabled]).toEqual(["SAFE", false]);

    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    const gain = [...shell.root.querySelectorAll<HTMLButtonElement>(".input-flag")].find((b) => b.textContent === "Auto Gain");
    expect([gain?.disabled, gain?.classList.contains("is-disabled")]).toEqual([true, true]);
    // Nothing stands behind them: the unit runs a routine rather than holding a
    // setting, so the store carries no value for one.
    expect(shell.ctx.store.has("ch.ch1.autoGain")).toBe(false);

    // A touch on [AUTO] is not a touch on the cell behind it, which opens INPUT.
    shell.ctx.nav.back();
    await flush();
    shell.root.querySelector<HTMLButtonElement>(".cv-gain-buttons .btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "the touch goes nowhere").toBe("channel-view");
  });
});

describe("the HOME send-destination tab", () => {
  it("names the destination on a line of its own, under the name and its mark", async () => {
    const shell = await mount();
    const tab = shell.root.querySelector(".sends-btn");
    expect(tab, "HOME draws the tab").not.toBeNull();

    const line = tab?.querySelector(".sends-line");
    expect([...(line?.children ?? [])].map((c) => c.className)).toEqual(["sends-label", "sends-mark"]);
    expect(line?.textContent, "the mark is drawn, not a character").toBe("Sends");
    expect(line?.querySelector(".sends-mark")?.getAttribute("aria-hidden")).toBe("true");
    // The destination is the line under it, so it cannot sit inside the first.
    expect(line?.querySelector(".sends-target")).toBeNull();
    expect(tab?.querySelector(".sends-target")?.textContent).toBe("ST");
  });

  it("names a numbered bus as the unit prints it, with the space", async () => {
    const shell = await mount();
    const target = (): string | undefined => shell.root.querySelector(".sends-target")?.textContent ?? undefined;
    // p047-1 has the stereo bus short and p157-1 a numbered one with the space.
    expect(target()).toBe("ST");
    for (const [id, label] of [
      ["MIX1", "MIX 1"],
      ["MIX2", "MIX 2"],
      ["FX1", "FX 1"],
      ["FX2", "FX 2"],
    ] as const) {
      await shell.ctx.store.set("ui.sendsTarget", id);
      await flush();
      expect(target(), id).toBe(label);
    }
  });

  it("puts the send to the destination in view on the strip's knob, the fader on it for STEREO", async () => {
    const shell = await mount();
    const readout = (): string | null | undefined => shell.root.querySelector(".strip-level-value")?.textContent;
    const label = (): string | null | undefined => shell.root.querySelector(".strip-level")?.getAttribute("aria-label");
    // The channel's own fader feeds the stereo bus, so STEREO shows the fader.
    expect([readout(), label()]).toEqual(["0.00", "CH 1 LEVEL"]);

    await shell.ctx.store.set("ui.sendsTarget", "MIX1");
    await flush();
    expect([readout(), label()], "the send, which ships at the bottom").toEqual(["-\u221e", "CH 1 Level"]);

    await shell.ctx.store.set("ch.ch1.send.bus.mix1.level", -12);
    await flush();
    expect(readout()).toBe("-12.0");
    expect(shell.ctx.store.num("ch.ch1.level", 0), "the fader stays where it was").toBe(0);
  });

  it("darkens the fader of a channel whose send to the stereo bus is switched off", async () => {
    const shell = await mount();
    const knob = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".strip-level");
    // STEREO is fed by the fader, and the send there carries the switch alone.
    expect([knob()?.getAttribute("aria-label"), knob()?.classList.contains("is-send-off")]).toEqual(["CH 1 LEVEL", false]);

    await shell.ctx.store.set("ch.ch1.send.bus.stereo.on", false);
    await flush();
    expect([knob()?.getAttribute("aria-label"), knob()?.classList.contains("is-send-off")]).toEqual(["CH 1 LEVEL", true]);

    const before = shell.ctx.store.num("ch.ch1.level", 0);
    knob()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.level", 0), "the fader still moves").toBeGreaterThan(before);
  });

  it("leaves a bus strip its own fader, since a bus has no send to a bus", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sendsTarget", "MIX1");
    await shell.ctx.store.set("ui.bankSide", "output");
    await flush();
    // Every bus keeps its fader, the one the destination names and the others.
    expect([...shell.root.querySelectorAll(".strip-level")].map((n) => n.getAttribute("aria-label"))).toEqual([
      "MIX 1 LEVEL",
      "MIX 2 LEVEL",
      "STEREO LEVEL",
    ]);
  });

  it("darkens the knob of a send that is switched off, and still turns it", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sendsTarget", "MIX1");
    await flush();
    const knob = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".strip-level");
    expect(knob()?.classList.contains("is-send-off"), "the send ships on").toBe(false);

    await shell.ctx.store.set("ch.ch1.send.bus.mix1.on", false);
    await flush();
    expect(knob()?.classList.contains("is-send-off")).toBe(true);

    // It is dark, not out of reach: the value still moves.
    const before = shell.ctx.store.num("ch.ch1.send.bus.mix1.level", -138);
    knob()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.send.bus.mix1.level", -138)).toBeGreaterThan(before);
    expect(knob()?.classList.contains("is-send-off"), "and stays dark").toBe(true);
  });

  it("runs off the right of the glass, with the two corners that meet it square", () => {
    const tab = declarations(CSS, ".sends-btn");
    const rail = declarations(CSS, ".side");

    // Every tab on the rail meets the edge of the glass, so the rail itself does
    // rather than each tab reaching past an inset.
    expect(px(rail["right"]), "the rail is flush with the edge").toBe(0);
    expect(px(rail["width"])).toBe(58);
    expect(tab["margin-right"], "so a tab needs nothing of its own").toBeUndefined();

    const square = (corner: string | undefined): boolean => /^0(px)?$/.test(corner ?? "");
    const [topLeft, topRight, bottomRight, bottomLeft] = (tab["border-radius"] ?? "").split(/\s+/);
    expect([square(topRight), square(bottomRight)], "the corners against the frame").toEqual([true, true]);
    expect([square(topLeft), square(bottomLeft)], "the corners standing free of it").toEqual([false, false]);
  });
});

describe("the channel-bank list", () => {
  const bankButton = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(".bank-btn");
  const options = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".bank-option")];
  const shownStrips = (shell: Shell): string[] =>
    [...shell.root.querySelectorAll(".strip-id")].map((n) => n.textContent ?? "");

  async function openList(shell: Shell): Promise<HTMLElement[]> {
    bankButton(shell)?.click();
    await flush();
    return options(shell);
  }

  it("opens the list instead of stepping the bank", async () => {
    const shell = await mount();
    const before = shownStrips(shell);
    const listed = await openList(shell);

    expect(listed.length, "the list holds every bank of both sides").toBe(4);
    expect(shell.ctx.nav.current.id).toBe("bank-select");
    // Stepping on tap is what this replaced: the bank behind the list is untouched.
    shell.ctx.nav.back();
    await flush();
    expect(shownStrips(shell)).toEqual(before);
  });

  it("names each bank by the channels in it, the long one over two lines", async () => {
    const shell = await mount();
    expect((await openList(shell)).map((o) => o.textContent)).toEqual(["CH 1 - 4", "CH 5 - 12", "FX 1 - 2", "MIX, ST\nSTREAMING"]);
  });

  it("marks the bank being shown, in that side's colour", async () => {
    const shell = await mount();
    const listed = await openList(shell);
    expect(listed.map((o) => o.classList.contains("is-on"))).toEqual([true, false, false, false]);
    expect(listed[0]?.className).toContain("bank-option-input");
    expect(listed[3]?.className).toContain("bank-option-output");
  });

  it("shows the bank that was picked", async () => {
    const shell = await mount();
    (await openList(shell)).at(-1)?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "picking closes the list").toBe("home");
    expect(shownStrips(shell)).toEqual(["MIX 1", "MIX 2", "STEREO", "STREAMING"]);

    const listed = await openList(shell);
    expect(listed.map((o) => o.classList.contains("is-on"))).toEqual([false, false, false, true]);
    listed[2]?.click();
    await flush();
    expect(shownStrips(shell)).toEqual(["FX1", "FX2"]);
  });

  it("gives the streaming strip [CUE] alone, with no position and no level to set", async () => {
    const shell = await mount();
    const bound: (string | null)[] = [];
    const inner = shell.ctx.setKnobs;
    shell.ctx.setKnobs = (specs): void => {
      bound.splice(0, bound.length, ...specs.map((s) => s?.path ?? null));
      inner(specs);
    };
    (await openList(shell)).at(-1)?.click();
    await flush();

    const strips = [...shell.root.querySelectorAll<HTMLElement>(".home-main > .strip")];
    const parts = (s: HTMLElement | undefined): string[] => [
      ...[...(s?.querySelectorAll(".strip-buttons .btn") ?? [])].map((b) => b.textContent ?? ""),
      ...(s?.querySelector(".strip-pan") ? ["pan"] : []),
      ...(s?.querySelector(".strip-level") ? ["level"] : []),
    ];
    expect(parts(strips[2]), "the stereo bus beside it").toEqual(["ON", "CUE", "pan", "level"]);
    expect(parts(strips[3]), "the streaming bus").toEqual(["CUE"]);
    expect(declarations(CSS, ".strip-buttons > .btn-cue:only-child")["grid-column"], "in CUE's own half").toBe("2");
    expect(bound, "and no knob turns a streaming level").toEqual([
      "ch.bus.mix1.level",
      "ch.bus.mix2.level",
      "ch.bus.stereo.level",
      null,
    ]);
  });

  it("splits the two sides under a band naming each", async () => {
    const shell = await mount();
    await openList(shell);
    const panel = shell.root.querySelector(".bank-popup");
    expect([...(panel?.querySelectorAll(".bank-band") ?? [])].map((n) => n.textContent)).toEqual(["INPUT", "OUTPUT"]);
    // Each band owns the row after it, so the sides cannot run together.
    const rows = [...(panel?.querySelectorAll(".bank-row") ?? [])];
    expect(rows.map((r) => r.querySelectorAll(".bank-option").length)).toEqual([3, 1]);
    expect([...(panel?.children ?? [])].map((n) => n.className)).toEqual([
      "bank-band",
      "bank-row",
      "bank-band",
      "bank-row",
    ]);
  });

  it("keeps the button that opened the list on the toolbar, and closes on a second tap", async () => {
    const shell = await mount();
    await openList(shell);
    expect(bankButton(shell), "the control that opened the list is still there").not.toBeNull();

    bankButton(shell)?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
    expect(shell.root.querySelector(".bank-popup"), "a second tap closes the list").toBeNull();
  });

  it("shows HOME's toolbar and side rail through the dark around it, the bank button lit above them", async () => {
    // As the [Sends] list does: the unit darkens HOME rather than blanking it.
    const shell = await mount();
    const toolbarLeft = (): string[] =>
      [...(shell.root.querySelector(".toolbar-left")?.children ?? [])].map((n) => n.className.replace(" is-lit", ""));
    const onHome = toolbarLeft();
    const icons = (): number => shell.root.querySelectorAll(".toolbar-icons .icon-btn").length;
    const iconsOnHome = icons();
    expect(onHome.length, "HOME puts the scene box and the bank button up there").toBe(2);

    await openList(shell);
    expect(shell.root.classList.contains("is-dimmed"), "the screen under the list goes dark").toBe(true);
    expect(toolbarLeft(), "the scene box and the bank button stay as HOME has them").toEqual(onHome);
    expect(bankButton(shell)?.classList.contains("is-lit"), "the button that opened the list stays lit").toBe(true);
    expect(icons(), "HOME's icons show through").toBe(iconsOnHome);
    expect(shell.root.querySelector(".side .sends-btn"), "and so does the side rail").not.toBeNull();
    expect(shell.root.querySelector(".udk-toggle"), "with the knob-mode toggle").not.toBeNull();
  });

  it("leaves what shows through deaf to a touch, and closes on its own two ways", async () => {
    const shell = await mount();
    const before = shownStrips(shell);

    const listed = await openList(shell);
    const behind = [...shell.root.querySelectorAll(".toolbar button, .toolbar [role='button'], .side button, .side [role='button']")].filter(
      (n) => !n.classList.contains("is-lit"),
    );
    expect(behind.length, "HOME's controls show through").toBeGreaterThan(0);
    expect(behind.filter((n) => !n.hasAttribute("inert")).map((n) => n.className), "and none of them answers").toEqual([]);
    expect(bankButton(shell)?.hasAttribute("inert"), "the control that opened the list stays live").toBe(false);

    // The lit option is the other way out, and it leaves the bank as it was.
    listed.find((o) => o.classList.contains("is-on"))?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
    expect(shownStrips(shell)).toEqual(before);
  });

  it("closes on a tap in the bare screen around it, but not on the panel", async () => {
    const shell = await mount();
    const tap = (selector: string): void => {
      shell.root.querySelector(selector)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };

    await openList(shell);
    tap(".bank-popup");
    await flush();
    expect(shell.root.querySelector(".bank-popup"), "the panel itself is not a way out").not.toBeNull();

    // What shows through the dark is bare screen to a touch.
    tap(".side");
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("leaves the [Sends] list's dimmed controls as they are", async () => {
    // Only a sheet that draws no ways out of its own turns what it dims deaf.
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".sends-btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("sends-select");
    expect(shell.root.querySelectorAll("[inert]").length).toBe(0);
  });

  it("leaves screens with their own exits alone when the bare screen is tapped", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    shell.root.querySelector(".side")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.ctx.nav.current.id, "SETUP has a back arrow, so its background is inert").toBe("setup");
  });

  it("reads the names off the strips, so a model with other banks gets other names", () => {
    // The URX22 is two mono channels short, which packs its banks differently.
    const small = unitById("URX22");
    expect(small.inputs.map((s) => s.label)).not.toEqual(unitById("URX44V").inputs.map((s) => s.label));
    expect([0, 1].map((b) => bankName(bankStrips(small.inputs, b)))).toEqual(["CH 1 - 6", "CH 7 - 10, FX 1 - 2"]);
    expect(bankName(bankStrips(small.outputs, 0))).toBe("MIX, ST\nSTREAMING");
  });
});

describe("the STEREO/CUE meter", () => {
  const frame = (shell: Shell): Element | null => shell.root.querySelector(".master-meter.is-cue");
  const cueButton = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(".btn-cue");

  it("is a plain meter until something is cued", async () => {
    const shell = await mount();
    expect(frame(shell)).toBeNull();
    expect(shell.root.querySelector(".cue-label")).toBeNull();
    expect(shell.root.querySelector(".cue-clear"), "nothing to empty").toBeNull();
    expect(shell.root.querySelector(".master-meter")?.getAttribute("aria-label")).toBe("STEREO meter");
  });

  it("frames itself and names itself once something is", async () => {
    const shell = await mount();
    cueButton(shell)?.click();
    await flush();
    expect(frame(shell), "the frame goes round the meter itself").not.toBeNull();
    expect(shell.root.querySelector(".cue-label")?.textContent).toBe("CUE");
    expect(shell.root.querySelector(".cue-clear svg"), "the bin sits on the frame").not.toBeNull();
    expect(shell.root.querySelector(".master-meter")?.getAttribute("aria-label")).toBe("CUE meter");
  });

  it("reads the cue bus while something is cued, and the stereo bus otherwise", async () => {
    const shell = await mount();
    const source = (): string | undefined => shell.root.querySelector<HTMLElement>(".master-meter .meter")?.dataset["meterSource"];
    expect(source()).toBe("bus.stereo");
    cueButton(shell)?.click();
    await flush();
    expect(source()).toBe("cue");
  });

  it("empties every cue from the bin", async () => {
    const shell = await mount();
    for (const button of shell.root.querySelectorAll<HTMLElement>(".btn-cue")) button.click();
    await flush();
    const cued = (): number =>
      [...shell.ctx.model.inputs, ...shell.ctx.model.outputs].filter((s) =>
        shell.ctx.store.bool(`ch.${s.id}.cue`, false),
      ).length;
    expect(cued(), "several strips are cued").toBeGreaterThan(1);

    // A bus can be cued from its own screen while the bank on HOME shows inputs,
    // so the bin has to reach the side that is not on the glass.
    await shell.ctx.store.set("ch.bus.mix1.cue", true);
    await flush();
    expect(cued(), "including an output the bank is not showing").toBeGreaterThan(1);

    shell.root.querySelector<HTMLElement>(".cue-clear")?.click();
    await flush();
    expect(cued()).toBe(0);
    expect(frame(shell), "and the frame goes with them").toBeNull();
  });

  it("leaves the bars their own colours", () => {
    // Recolouring them is what the frame replaced: the meter has to keep reading
    // as a meter while it is the cue meter.
    const frame = declarations(CSS, ".master-meter.is-cue::before");
    expect(frame["border"]).toContain("var(--accent-on)");
    expect(CSS).not.toContain(".is-cue .meter-bar");
  });

  it("holds the whole rail in place whether or not a cue is up", () => {
    // The name and the frame the cue state adds cost the box nothing: the frame
    // is drawn over it and the name stands in a row the box holds either way.
    expect(Object.keys(declarations(CSS, ".master-meter.is-cue")), "the state itself sets nothing").toEqual([]);
    const frame = declarations(CSS, ".master-meter.is-cue::before");
    expect([frame["position"], frame["inset"]]).toEqual(["absolute", "0"]);
    const box = declarations(CSS, ".master-meter");
    expect([box["flex"], px(box["height"])], "and the box neither grows nor shrinks").toEqual(["0 0 auto", 115]);
    expect(box["grid-template-rows"], "a band for the name over the bars").toBe("27px 80px");
    expect(declarations(CSS, ".master-meter .meter")["grid-row"], "the bars keep the second row").toBe("2");
    // The bin hangs off the box and breaks the frame behind it, so its pad
    // reaches past the corner it stands on.
    const bin = declarations(CSS, ".master-meter .cue-clear");
    expect(bin["position"]).toBe("absolute");
    expect([px(bin["top"]), px(bin["right"])]).toEqual([-2, 0]);
    expect([px(bin["width"]), px(bin["height"])]).toEqual([18, 18]);
    expect(px(bin["width"]), "wider than the frame it breaks").toBeGreaterThan(px(frame["border"]));
    // Nothing else on the rail can be resized by a neighbour either.
    expect(declarations(CSS, ".side > *")["flex-shrink"]).toBe("0");
  });

  it("keeps the name clear of the bin that stands beside it", () => {
    // The pad the bin breaks the frame with reaches back over the band the name
    // stands in, so the name is drawn over the pad rather than under it.
    const label = declarations(CSS, ".cue-label");
    expect(label["font-size"]).toBe("12.5px");
    expect([label["position"], label["z-index"]]).toEqual(["relative", "1"]);
    // The bin stands in the corner of its own pad, drawn at its own size so its
    // edges land on whole pixels.
    expect(declarations(CSS, ".master-meter .cue-clear")["place-items"]).toBe("start end");
    const glyph = declarations(CSS, ".cue-clear svg");
    expect([px(glyph["width"]), px(glyph["height"])]).toEqual([12, 14]);
  });

  it("draws the bars the unit's wider meter is drawn with", () => {
    // The dynamics screens draw the same meter, so the two share one rule.
    const bars = declarations(CSS, ".master-meter .meter");
    expect(bars["--meter-track"]).toBe("var(--meter-track-wide)");
    expect(bars["--meter-track"]).toBe(declarations(CSS, ".dyn-io .meter")["--meter-track"]);
    expect(px(bars["gap"])).toBe(4);
    expect(px(bars["height"])).toBe(80);
    expect(px(declarations(CSS, ".master-meter .meter-lane")["gap"])).toBe(3);
    expect(px(declarations(CSS, ".master-meter .meter-bar")["width"])).toBe(6);
    const clip = declarations(CSS, ".master-meter .meter-clip");
    expect([px(clip["width"]), px(clip["height"])]).toEqual([6, 6]);
    expect(clip["border-radius"], "the dot stays the round one the base rule draws").toBeUndefined();
  });
});

describe("a strip on the bank", () => {
  it("prints its level in dB, as the value boxes elsewhere do", async () => {
    const shell = await mount();
    // HOME draws no readout bar, so this is the only print of the level.
    expect(shell.root.querySelector(".strip-level-value")?.textContent).toBe("0.00");
    expect(shell.root.querySelector(".strip-level")?.getAttribute("aria-valuetext")).toBe("0.00dB");
  });

  it("prints a level in what the box holds, whatever the level", async () => {
    // The box is a fixed width, so the level drops a decimal below -10 rather
    // than running past it.
    const shell = await mount();
    const box = (): string | undefined => shell.root.querySelector(".strip-level-value")?.textContent ?? undefined;
    expect(box()).toBe("0.00");

    for (const [level, text] of [[-4, "-4.00"], [-25.6, "-25.6"], [-96, "-96.0"]] as const) {
      await shell.ctx.store.set("ch.ch1.level", level);
      await flush();
      expect(box()).toBe(text);
    }
  });

  it("fills the row to four whatever the bank holds", async () => {
    const shell = await mount();
    const slots = (): number => shell.root.querySelectorAll(".home-main > .strip").length;
    expect(slots(), "a full bank").toBe(4);

    // The last input bank of a URX44V carries FX 1 and FX 2 alone; the unit
    // leaves the remaining slots empty rather than widening the two.
    await shell.ctx.store.set("ui.bank", 2);
    await flush();
    expect(shell.root.querySelectorAll(".home-main > .strip-empty")).toHaveLength(2);
    expect(slots(), "and the row is still four wide").toBe(4);
  });
});

describe("the pair of lamps at the top of a strip's indicator block", () => {
  const lamps = (shell: Shell): { signal: boolean; clip: boolean } => {
    const block = shell.root.querySelector(".ind-block");
    return {
      signal: block?.querySelector(".dot-signal")?.classList.contains("is-on") === true,
      clip: block?.querySelector(".dot-clip")?.classList.contains("is-on") === true,
    };
  };

  const atLevel = async (shell: Shell, db: number): Promise<{ signal: boolean; clip: boolean }> => {
    setMeterSource((_, channels) => Array.from({ length: channels }, () => db));
    shell.ctx.repaint();
    await flush();
    return lamps(shell);
  };

  it("lights the left one green in range and the right one where the meter clips", async () => {
    const shell = await mount();
    try {
      expect(await atLevel(shell, -20)).toEqual({ signal: true, clip: false });
      expect(await atLevel(shell, 0), "0 dBFS is both the top of the range and the clip point").toEqual({
        signal: true,
        clip: true,
      });
      expect(await atLevel(shell, 6), "over the top only the clip lamp is lit").toEqual({ signal: false, clip: true });
      expect(await atLevel(shell, -96), "a silent channel lights neither").toEqual({ signal: false, clip: false });
    } finally {
      setMeterSource(null);
    }
  });

  it("stands them in the block's first row on every kind of strip", async () => {
    const shell = await mount();
    // Input channels, the stereo inputs, the FX returns and the output bank.
    for (const [bank, side] of [[0, "input"], [1, "input"], [2, "input"], [0, "output"]] as const) {
      await shell.ctx.store.set("ui.bankSide", side);
      await shell.ctx.store.set("ui.bank", bank);
      await flush();
      for (const block of shell.root.querySelectorAll(".ind-block")) {
        expect([...block.children].map((r) => r.className), `bank ${side} ${bank}`).toEqual([
          "ind-row",
          "ind-row",
          "ind-row",
          "ind-row",
        ]);
        expect(block.children[0]?.querySelector(".ind-dots"), "the lamps open the block").not.toBeNull();
      }
    }
  });
});

describe("the side rail", () => {
  it("is reserved by the screens that fill it and given back by the rest", async () => {
    const shell = await mount();
    expect(shell.root.classList.contains("has-side"), "HOME puts Sends and the meter there").toBe(true);

    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(shell.root.classList.contains("has-side"), "a channel view fills the glass instead").toBe(false);
    // The knob-mode button still sits down there; it belongs to the shell, not
    // to the screen, and the captures put it on the bottom edge either way.
    expect([...shell.root.querySelectorAll(".side > *")].map((n) => n.className)).toEqual(["udk-toggle"]);

    shell.ctx.nav.home();
    await flush();
    expect(shell.root.classList.contains("has-side"), "and HOME takes it back").toBe(true);
  });
});

describe("the colour rail along the bottom of a strip", () => {
  it("carries the channel colour of the strip it belongs to", async () => {
    const shell = await mount();
    const rails = [...shell.root.querySelectorAll<HTMLElement>(".home-main .strip:not(.strip-empty)")].map((s) =>
      s.style.getPropertyValue("--rail"),
    );
    expect(rails).toEqual(unitById("URX44V").inputs.slice(0, 4).map((s) => s.color));
  });
});

describe("the channel-bank marks", () => {
  const marks = (shell: Shell): number => shell.root.querySelectorAll(".bank-cell").length;

  it("draws one mark per bank the unit has", async () => {
    // A URX44V pages its inputs as CH 1 - 4 / CH 5 - 12 / FX 1 - 2; a URX22 has two
    // mono channels fewer, so its inputs fall into two banks.
    expect(marks(await mount("URX44V"))).toBe(3);
    expect(marks(await mount("URX22"))).toBe(2);
  });
});

describe("the screens the toolbar icons open", () => {
  const TOPS = ["setup", "microsd", "monitor"];

  async function at(shell: Shell, id: string): Promise<boolean> {
    shell.ctx.nav.openTop({ id });
    await flush();
    return shell.root.querySelector(".udk-toggle") !== null;
  }

  it("leaves the knob-mode toggle off SETUP, microSD and MONITOR", async () => {
    const shell = await mount();
    // The unit shows the toggle wherever the knobs mean something, but not on
    // the three menus the toolbar icons open.
    for (const id of TOPS) expect(await at(shell, id), id).toBe(false);
  });

  it("carries it on the screens under them", async () => {
    const shell = await mount();
    for (const id of ["setup.version", "microsd.recorder", "monitor.level"]) {
      expect(await at(shell, id), id).toBe(true);
    }
    expect(await at(shell, "home"), "home").toBe(true);
  });

  it("draws no back arrow, having only HOME underneath", async () => {
    const shell = await mount();
    const back = (): Element | null => shell.root.querySelector('[aria-label="Back"]');
    for (const id of TOPS) {
      shell.ctx.nav.openTop({ id });
      await flush();
      expect(back(), id).toBeNull();
      expect(shell.root.querySelector('[aria-label="HOME"]'), id).not.toBeNull();
      // The separator belongs to the pair of icons, so it goes with the arrow.
      expect(shell.root.querySelector(".toolbar-sep"), id).toBeNull();
      expect(shell.root.querySelector(".toolbar-icons")?.className, id).toBe("toolbar-icons is-home-only");
    }

    // One step further down there is a screen to step back to, and the arrow
    // appears for it.
    shell.ctx.nav.push({ id: "setup.version" });
    await flush();
    expect(back()).not.toBeNull();
    expect(shell.root.querySelector(".toolbar-sep")).not.toBeNull();
    expect(shell.root.querySelector(".toolbar-icons")?.className, "the arrow's band").toBe("toolbar-icons");
  });

  it("names every entry in the menu it opens", async () => {
    const shell = await mount();
    const captions = async (id: string): Promise<string[]> => {
      shell.ctx.nav.openTop({ id });
      await flush();
      return [...shell.root.querySelectorAll(".menu-btn")].map((b) => b.textContent ?? "");
    };
    expect(await captions("setup")).toContain("Version");
    expect(await captions("microsd")).toContain("Recorder");
    expect(await captions("monitor")).toContain("Oscillator");
    for (const id of TOPS) {
      expect((await captions(id)).every((c) => c.length > 0), `${id} names every entry`).toBe(true);
    }
  });
});

describe("the toolbar's icon row", () => {
  const icons = (shell: Shell): (string | null)[] =>
    [...shell.root.querySelectorAll(".toolbar-icons .icon-btn")].map((b) => b.getAttribute("aria-label"));

  it("stays up on the screens one step off HOME", async () => {
    const shell = await mount();
    const row = ["SETUP", "microSD", "MONITOR", "HOME"];
    expect(icons(shell), "HOME").toEqual(row);
    expect(shell.root.querySelector(".toolbar-icons")?.className, "HOME's band").toBe("toolbar-icons is-home");

    // The channel view and the send-destination sheet sit over HOME rather than
    // replacing it, so the icons stay reachable.
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(icons(shell), "channel view").toEqual(row);

    shell.ctx.nav.home();
    await flush();
    shell.root.querySelector<HTMLElement>(".sends-btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("sends-select");
    expect(icons(shell), "sends sheet").toEqual(row);
  });

  it("carries the bank button only where a screen asks for it", async () => {
    const shell = await mount();
    const bank = (): Element | null => shell.root.querySelector(".bank-btn");
    expect(bank(), "HOME").not.toBeNull();

    shell.root.querySelector<HTMLElement>(".sends-btn")?.click();
    await flush();
    expect(bank(), "the sheet leaves HOME's toolbar as it was").not.toBeNull();

    shell.ctx.nav.home();
    await flush();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(bank(), "the channel view names a channel instead of a bank").toBeNull();
    expect(shell.root.querySelector(".ch-selector")).not.toBeNull();
  });
});

describe("the send-destination sheet", () => {
  it("drops over the main area and keeps the rail it was opened from", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".sends-btn")?.click();
    await flush();

    expect(shell.root.querySelector(".sends-popup"), "the sheet is up").not.toBeNull();
    // The rail stays: the button that opened it is still on the glass, and so
    // is the meter beside it.
    expect(shell.root.querySelector(".side .sends-btn")).not.toBeNull();
    expect(shell.root.querySelector(".side .master-meter")).not.toBeNull();
    expect(shell.root.querySelector(".scene-box"), "and so is the scene box").not.toBeNull();

    // Everything the sheet does not cover goes dark, and the button it was
    // opened from stays lit above it.
    expect(shell.root.classList.contains("is-dimmed")).toBe(true);
    expect(shell.root.querySelector(".sends-btn")?.classList.contains("is-lit")).toBe(true);

    // A second tap on the button takes it away again.
    shell.root.querySelector<HTMLElement>(".sends-btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
    expect(shell.root.querySelector(".sends-popup")).toBeNull();
    expect(shell.root.classList.contains("is-dimmed"), "and the screen comes back up").toBe(false);
    expect(shell.root.querySelector(".sends-btn")?.classList.contains("is-lit")).toBe(false);
  });
});

describe("a processing block on the channel view", () => {
  it("turns the block on and off by its name, and opens its screen by the rest", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();

    const badge = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".badge-gate");
    expect(badge()?.tagName, "the name is a control, not a label").toBe("BUTTON");
    expect(badge()?.getAttribute("aria-pressed")).toBe("false");

    badge()?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.gate.on", false), "it switches the block").toBe(true);
    expect(badge()?.getAttribute("aria-pressed")).toBe("true");
    expect(shell.ctx.nav.current.id, "and stays on the view").toBe("channel-view");

    // The block around it gives the knob its threshold first, and opens the
    // screen that sets the block up at the next touch.
    shell.root.querySelector<HTMLElement>(".cv-block .cv-block-value")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "the first touch stays").toBe("channel-view");
    shell.root.querySelector<HTMLElement>(".cv-block .cv-block-value")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("ch.gate");
  });
});

describe("what a channel view's blocks draw", () => {
  it("draws the curve in EQ's title box and names the screen on the toolbar", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    const badge = shell.root.querySelector(".badge-title.badge-eq");
    expect(badge?.querySelector("svg.icon-eq-badge-curve"), "the curve rides in the box").not.toBeNull();
    expect(badge?.querySelectorAll("circle"), "five dots").toHaveLength(5);
    expect(badge?.textContent).toBe("EQ");
    expect(shell.root.querySelector<HTMLElement>(".toolbar")?.dataset.screen).toBe("ch.eq");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".badge-title svg.icon-eq-badge-curve"), "only EQ's box").toBeNull();
  });

  it("lays each rule of a dynamics plot on a whole column or row of pixels", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.gate", strip: "ch1" });
    await flush();
    const rules = [...shell.root.querySelectorAll(".dyn-plot line.dyn-grid")].slice(0, 2);
    expect(rules.map((l) => [l.getAttribute("x1"), l.getAttribute("y1")])).toEqual([
      ["158.5", "0.0"],
      ["0.0", "34.5"],
    ]);
  });

  it("rules the EQ panel and lights the gate's last lamp when it is passing", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();

    // Three lines down the EQ panel and one across it, behind the curve.
    const eq = shell.root.querySelector(".eq-thumb");
    expect([...(eq?.querySelectorAll(".eq-grid") ?? [])], "the grid the unit rules").toHaveLength(4);
    expect(eq?.querySelector("polyline"), "and the curve over it").not.toBeNull();
    // The curve runs the whole width, two rows deep: the upper row and a lighter row under it.
    const curves = [...(eq?.querySelectorAll("polyline") ?? [])];
    expect(curves.map((c) => [c.getAttribute("class"), c.getAttribute("stroke-width")]), "two rows deep").toEqual([
      ["eq-thumb-edge", "2"],
      ["eq-thumb-core", "1"],
    ]);
    const firstPoint = (c: Element | undefined): number[] => (c?.getAttribute("points") ?? "").split(" ")[0]!.split(",").map(Number);
    const lastX = Number((curves[0]?.getAttribute("points") ?? "").split(" ").at(-1)!.split(",")[0]);
    expect([firstPoint(curves[0])[0], lastX], "across the whole panel").toEqual([0, 78]);
    expect(firstPoint(curves[1])[1]! - firstPoint(curves[0])[1]!, "the lighter row half a pixel down").toBe(0.5);

    // The lamps read the signal against the threshold and the range: shut, held
    // under the threshold, or passing. A gate that is off lights none of them.
    const lamps = (): string[] =>
      [...shell.root.querySelectorAll(".block-lamp")].map((l) =>
        l.classList.contains("is-on")
          ? "on"
          : l.classList.contains("is-holding")
            ? "hold"
            : l.classList.contains("is-shut")
              ? "shut"
              : "",
      );

    // CH 1 is on its MIC/LINE connector: at +24 dB of A.Gain its level stands between -60 and -10.
    await shell.ctx.store.set("ch.ch1.gain", 24);
    await shell.ctx.store.set("ch.ch1.gate.threshold", 0);
    await flush();
    expect(lamps(), "the gate is off, so nothing is lit").toEqual(["", "", ""]);

    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await shell.ctx.store.set("ch.ch1.gate.range", -60);
    await flush();
    expect(lamps(), "under the threshold but not yet down to the range").toEqual(["", "hold", ""]);

    await shell.ctx.store.set("ch.ch1.gate.range", -10);
    await flush();
    expect(lamps(), "shut to the range").toEqual(["shut", "", ""]);

    await shell.ctx.store.set("ch.ch1.gate.threshold", -96);
    await flush();
    expect(lamps(), "over the threshold").toEqual(["", "", "on"]);
  });

  it("lights the ducker's lamps for its source against the threshold and the range", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_9_10" });
    await flush();

    const lamps = (): string[] =>
      [...shell.root.querySelectorAll(".block-lamp")].map((l) =>
        l.classList.contains("is-on")
          ? "on"
          : l.classList.contains("is-holding")
            ? "hold"
            : l.classList.contains("is-shut")
              ? "shut"
              : "",
      );

    // The source is CH1, whose level stands between -60 and -10 at +24 dB of
    // A.Gain (the gate's lamps above read the same signal).
    await shell.ctx.store.set("ch.ch1.gain", 24);
    await flush();
    expect(lamps(), "the ducker is off, so nothing is lit").toEqual(["", "", ""]);

    await shell.ctx.store.set("ch.ch_9_10.ducker.on", true);
    await shell.ctx.store.set("ch.ch_9_10.ducker.threshold", 0);
    await flush();
    expect(lamps(), "the source is under the threshold, so the channel is left alone").toEqual(["", "", "on"]);

    await shell.ctx.store.set("ch.ch_9_10.ducker.threshold", -60);
    await shell.ctx.store.set("ch.ch_9_10.ducker.range", -70);
    await flush();
    expect(lamps(), "over the threshold but not a range over it").toEqual(["", "hold", ""]);

    await shell.ctx.store.set("ch.ch_9_10.ducker.range", 0);
    await flush();
    expect(lamps(), "held right down to the range").toEqual(["shut", "", ""]);

    // A channel that is off meters nothing, so a source switched to it is under
    // any threshold.
    await shell.ctx.store.set("ch.ch_9_10.ducker.source", "CH2");
    await shell.ctx.store.set("ch.ch2.on", false);
    await flush();
    expect(lamps(), "the source is read by its own name").toEqual(["", "", "on"]);
  });

  it("marks the compressor's threshold across both of its bars", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();

    const at = (): string => shell.root.querySelector<HTMLElement>(".comp-thresh")?.style.left ?? "";
    const low = at();
    await shell.ctx.store.set("ch.ch1.comp.threshold", -4);
    await flush();
    expect(parseFloat(at()), "a higher threshold stands further right").toBeGreaterThan(parseFloat(low));
    expect(shell.root.querySelectorAll(".comp-bar"), "over the level and the reduction").toHaveLength(2);
  });
});

describe("where the side rail starts", () => {
  it("hangs off the toolbar on the screens the unit hangs it on, and lower on the rest", async () => {
    const shell = await mount();
    const at = async (route: { id: string; strip?: string }): Promise<boolean> => {
      shell.ctx.nav.home();
      await flush();
      if (route.id !== "home") shell.ctx.nav.push(route);
      await flush();
      return shell.root.classList.contains("side-at-top");
    };
    for (const id of ["home", "monitor.level"]) {
      expect(await at({ id }), id).toBe(true);
    }
    expect(await at({ id: "ch.sendto", strip: "ch1" }), "ch.sendto").toBe(true);
    for (const id of ["monitor.osc", "scene.list", "setup.patch", "microsd.recorder"]) {
      expect(await at({ id }), id).toBe(false);
    }
  });
});

describe("the SEND TO destination tabs", () => {
  const tabs = (shell: Shell): { label: string; on: boolean }[] =>
    [...shell.root.querySelectorAll(".sendto-tab")].map((t) => ({
      label: t.textContent ?? "",
      on: t.classList.contains("is-on"),
    }));
  const cells = (shell: Shell): string[] =>
    [...shell.root.querySelectorAll(".sendto-title")].map((t) => t.textContent ?? "");

  it("ships every send switched on with nothing going through it, the tap after the fader", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();

    // The unit ships the send open and the level at the bottom, so a channel
    // reaches every bus the moment its level is raised.
    const on = [...shell.root.querySelectorAll(".sendto-cell .btn-on")];
    const pre = [...shell.root.querySelectorAll(".sendto-cell .btn-pre")];
    expect(on.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    expect(pre.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    // The knob under each cell reads the level, and it starts at the bottom.
    expect([...shell.root.querySelectorAll(".knob-cell-value")].slice(0, 2).map((c) => c.textContent)).toEqual([
      "-\u221e",
      "-\u221e",
    ]);
  });

  it("stacks the three groups down the rail, one of them lit", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();

    expect(tabs(shell).map((t) => t.label)).toEqual(["STEREO", "MIX\n1-2", "FX\n1-2"]);
    expect(tabs(shell).filter((t) => t.on).map((t) => t.label), "exactly one is lit").toEqual(["MIX\n1-2"]);
    expect(cells(shell)).toEqual(["MIX 1", "MIX 2"]);
  });

  it("offers a ducker every channel and the three mixer buses, by their numbers alone", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.ducker", strip: "ch_5_6" });
    await flush();
    // The box carries the channel's own name; the list under it the numbers.
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".dyn-row-source .pulldown");
    expect(box()?.textContent).toContain("CH 1");

    box()?.click();
    await flush();
    expect(shell.root.querySelector(".source-sheet"), "the list opens under its box, not on a sheet").toBeNull();
    const list = shell.root.querySelector(".dropdown-list.ducker-source-list");
    expect(list, "and carries its own place").not.toBeNull();
    expect([...(list?.children ?? [])].map((o) => o.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5/6",
      "7/8",
      "9/10",
      "11/12",
      "ST",
      "MIX 1",
      "MIX 2",
    ]);

    const lit = (): (string | null)[] =>
      [...shell.root.querySelectorAll(".dropdown-option[aria-pressed='true']")].map((o) => o.textContent);
    expect(lit(), "the key it ships on is the one marked").toEqual(["1"]);

    // A key that is a bus resolves to that bus's own level.
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((b) => b.textContent === "MIX 1")?.click();
    await flush();
    expect(shell.ctx.store.str("ch.ch_5_6.ducker.source", "")).toBe("MIX 1");
    expect(box()?.textContent).toContain("MIX 1");

    box()?.click();
    await flush();
    expect(lit(), "and the list marks it on the way back").toEqual(["MIX 1"]);
  });

  it("reads the ducker's lamps from the strip its key names, bus or channel", async () => {
    // The key the ducker listens to is loud; everything else is silent.
    setMeterSource((id) => (id === "bus.mix1" ? [-2] : [-90]));
    try {
      const shell = await mount();
      await shell.ctx.store.set("ch.ch_5_6.ducker.on", true);
      await shell.ctx.store.set("ch.ch_5_6.ducker.threshold", -40);
      await shell.ctx.store.set("ch.ch_5_6.ducker.range", -24);
      await shell.ctx.store.set("ch.ch_5_6.ducker.source", "1");
      shell.ctx.nav.push({ id: "channel-view", strip: "ch_5_6" });
      await flush();
      const lamps = (): string[] =>
        [...shell.root.querySelectorAll(".cv-block-ducker .block-lamp")].map((l) => l.className);
      expect(lamps().some((c) => c.includes("is-on")), "a silent key leaves the channel open").toBe(true);

      await shell.ctx.store.set("ch.ch_5_6.ducker.source", "MIX 1");
      await flush();
      expect(lamps().some((c) => c.includes("is-shut")), "a loud bus key shuts it").toBe(true);
    } finally {
      setMeterSource(null);
    }
  });

  it("counts a delay in every frame rate the unit offers, drop frame included", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".delay-rate .pulldown");
    expect(box()?.textContent).toContain("30");

    box()?.click();
    await flush();
    // The unit sets the eight two across and four down.
    const rows = [...shell.root.querySelectorAll(".source-sheet .source-row")].map((r) =>
      [...r.children].map((c) => (c.classList.contains("source-btn") ? c.textContent : null)),
    );
    expect(rows).toEqual([
      ["24", "25"],
      ["29.97D", "29.97"],
      ["30D", "30"],
      ["60", "120"],
    ]);

    [...shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")].find((b) => b.textContent === "29.97D")?.click();
    await flush();
    expect(shell.ctx.store.str("ch.bus.stream.delay.frameRate", ""), "the rate keeps its own name").toBe("29.97D");
    expect(box()?.textContent).toContain("29.97D");
    // 1.00 ms at 29.97 frames a second is 0.03 of a frame: a drop-frame rate
    // counts by the number in its name.
    const frame = [...shell.root.querySelectorAll(".delay-cell")].find((c) => (c.textContent ?? "").includes("frame"));
    expect(frame?.querySelector(".value-box")?.textContent).toBe("0.03");
  });

  it("keeps the readout bar on a strip that binds no knob, its divisions empty", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.input", strip: "bus.stream" });
    await flush();
    const cells = [...shell.root.querySelectorAll(".knob-cell")];
    expect(cells, "the bar keeps its four divisions").toHaveLength(4);
    expect(cells.every((c) => c.classList.contains("is-empty")), "with nothing on them").toBe(true);
  });

  it("lays the ducker's key list out three rows by eight, the stereo bus at the end of the second", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.ducker", strip: "ch_5_6" });
    await flush();
    shell.root.querySelector<HTMLElement>(".dyn-row-source .pulldown")?.click();
    await flush();
    const at = (label: string): string => {
      const node = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === label);
      return `${node?.style.gridRow ?? ""}/${node?.style.gridColumn ?? ""}`;
    };
    expect([at("1"), at("4")], "the mono channels along the first row").toEqual(["1/1", "1/4"]);
    expect([at("5/6"), at("11/12")], "the stereo ones along the second").toEqual(["2/1", "2/4"]);
    expect(at("ST"), "and the stereo bus at its far end").toBe("2/8");
    expect([at("MIX 1"), at("MIX 2")], "the mixes on the third").toEqual(["3/1", "3/2"]);
  });

  it("names a send's placing after what it reads while the bus is on Pan Link", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.pan", -63);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();
    const cell = (): Element | undefined => [...shell.root.querySelectorAll(".sendto-cell")][0];
    expect(cell()?.querySelector(".sendto-bal-caption")?.textContent).toBe("Bal");

    await shell.ctx.store.set("ch.bus.mix1.panLink", true);
    await flush();
    expect(cell()?.querySelector(".sendto-bal-caption")?.textContent, "it reads the channel's own PAN").toBe("PAN");
    expect(cell()?.querySelector(".sendto-bal .value-box")?.textContent).toBe("L63");
    expect(cell()?.querySelector(".sendto-bal .value-box")?.getAttribute("aria-label")).toBe("MIX 1 PAN");

    await shell.ctx.store.set("ch.bus.mix1.panLink", false);
    await flush();
    expect(cell()?.querySelector(".sendto-bal-caption")?.textContent).toBe("Bal");
  });

  it("gives a send into the stereo bus no tap of its own, and keeps its placing", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sendToGroup", "ST");
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();

    const cell = shell.root.querySelector(".sendto-cell");
    expect(cells(shell)).toEqual(["STEREO"]);
    expect(cell?.querySelector(".btn-on"), "the switch stays").not.toBeNull();
    expect(cell?.querySelector(".btn-pre"), "the tap is the stereo fader itself").toBeNull();
    expect(cell?.querySelector(".sendto-empty-pre"), "and its room is kept").not.toBeNull();
    expect(cell?.querySelector(".pan-slider"), "a channel places its send into the stereo bus").not.toBeNull();
    expect(cell?.querySelector(".sendto-bal")).not.toBeNull();
  });

  it("gives an FX return the stereo bus and both MIX buses, and no FX bus", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "fx1" });
    await flush();

    expect(tabs(shell).map((t) => t.label), "an FX return reaches no FX bus").toEqual(["STEREO", "MIX\n1-2"]);
    expect(tabs(shell).filter((t) => t.on).map((t) => t.label)).toEqual(["MIX\n1-2"]);
    expect(cells(shell)).toEqual(["MIX 1", "MIX 2"]);
    // The four values the cell carries, and the level on the knob under it.
    expect([...shell.root.querySelectorAll(".sendto-cell .btn-on")].map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
    ]);
    expect([...shell.root.querySelectorAll(".sendto-cell .btn-pre")]).toHaveLength(2);
    expect([...shell.root.querySelectorAll(".sendto-bal")]).toHaveLength(2);
    expect([...shell.root.querySelectorAll(".knob-cell-value")].slice(0, 2).map((c) => c.textContent)).toEqual([
      "-\u221e",
      "-\u221e",
    ]);
  });

  it("keeps a MIX bus without a rail, since the stereo bus is all it reaches", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "bus.mix1" });
    await flush();
    expect(tabs(shell)).toHaveLength(0);
    expect(cells(shell)).toEqual(["STEREO"]);
  });

  it("shows an FX return its first group when the one last picked is not one of its own", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sendToGroup", "FX");
    shell.ctx.nav.push({ id: "ch.sendto", strip: "fx1" });
    await flush();
    expect(tabs(shell).filter((t) => t.on).map((t) => t.label)).toEqual(["STEREO"]);
    expect(cells(shell)).toEqual(["STEREO"]);
    expect(shell.ctx.store.str("ui.sendToGroup", ""), "and leaves the pick for the strips that have it").toBe("FX");
  });

  it("turns an FX return's MIX send from the knob under its HOME strip", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sendsTarget", "MIX1");
    await shell.ctx.store.set("ui.bank", 2);
    await flush();
    const level = (): HTMLElement | null | undefined =>
      shell.root.querySelector('[data-lamp-source="fx1"]')?.closest(".strip")?.querySelector<HTMLElement>(".strip-level");
    expect(level()?.getAttribute("aria-label"), "a send, not the strip's own fader").toBe("FX1 Level");
    expect(level()?.classList.contains("is-sends-mix")).toBe(true);
    expect(level()?.querySelector(".strip-level-value")?.textContent).toBe("-\u221e");

    await shell.ctx.store.set("ch.fx1.send.bus.mix1.level", -12);
    await flush();
    expect(level()?.querySelector(".strip-level-value")?.textContent).toBe("-12.0");
  });

  it("shows the destinations of the group that is picked", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();

    const pick = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".sendto-tab")].find((t) => t.textContent === label)?.click();
      await flush();
    };
    await pick("FX\n1-2");
    expect(cells(shell)).toEqual(["FX1", "FX2"]);
    await pick("STEREO");
    expect(cells(shell)).toEqual(["STEREO"]);
    expect(tabs(shell).filter((t) => t.on).map((t) => t.label)).toEqual(["STEREO"]);
  });

  it("places each send by its own balance, not by the channel's pan", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "ch1" });
    await flush();

    await shell.ctx.store.set("ch.ch1.pan", -40);
    await shell.ctx.store.set("ch.ch1.send.bus.mix1.balance", 21);
    await flush();
    const values = [...shell.root.querySelectorAll(".sendto-bal .value-box")].map((b) => b.textContent);
    expect(values, "MIX 1 carries its own placing; MIX 2 is untouched").toEqual(["R21", "C"]);
  });

  it("gives a bus no chooser, being the far end of a send itself", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.sendto", strip: "bus.mix1" });
    await flush();

    expect(tabs(shell), "a MIX bus reaches the stereo bus and nothing else").toEqual([]);
    expect(cells(shell)).toEqual(["STEREO"]);
  });
});

describe("the microSD menu", () => {
  it("carries USB Storage Mode in the toolbar, not among the menu entries", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    await flush();

    const usb = shell.root.querySelector(".usb-storage");
    expect(usb, "the button is drawn").not.toBeNull();
    expect(usb?.closest(".toolbar"), "in the toolbar").not.toBeNull();
    expect(shell.root.querySelector(".main .usb-storage"), "and not in the main area").toBeNull();
    expect([...shell.root.querySelectorAll(".menu-btn")].map((b) => b.textContent)).toEqual([
      "Recorder",
      "Save/Load",
      "Tools",
    ]);
  });

  it("carries the card-eject button between the title and the icon row", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    await flush();

    const eject = shell.root.querySelector(".sd-eject");
    expect(eject, "the button is drawn").not.toBeNull();
    expect(eject?.closest(".toolbar"), "in the toolbar").not.toBeNull();
    expect(eject?.querySelector("svg"), "carrying the card mark").not.toBeNull();
    // It stands before the icon row, which is what puts it left of HOME.
    expect(eject?.nextElementSibling?.classList.contains("toolbar-icons")).toBe(true);

    // No other screen has a card to take out.
    shell.ctx.nav.home();
    await flush();
    expect(shell.root.querySelector(".sd-eject")).toBeNull();
  });

  it("puts the three entries and the card-eject button out of reach while USB Storage Mode is on", async () => {
    // With the mode on, Recorder / Save/Load / Tools stand darkened and out of
    // reach, and no card-eject button is drawn.
    const shell = await mount();
    await shell.ctx.store.set("sd.usbStorage", true);
    shell.ctx.nav.openTop({ id: "microsd" });
    await flush();
    const entries = [...shell.root.querySelectorAll<HTMLElement>(".menu-btn")];
    expect(entries.map((b) => [b.textContent, b.classList.contains("is-disabled"), b.getAttribute("aria-disabled")])).toEqual([
      ["Recorder", true, "true"],
      ["Save/Load", true, "true"],
      ["Tools", true, "true"],
    ]);
    expect(shell.root.querySelector(".sd-eject"), "no card to take out").toBeNull();
    const depth = shell.ctx.nav.depth;
    entries[0]?.click();
    await flush();
    expect(shell.ctx.nav.depth, "a tap opens nothing").toBe(depth);

    await shell.ctx.store.set("sd.usbStorage", false);
    await flush();
    expect(shell.root.querySelectorAll(".menu-btn.is-disabled"), "back in reach when the mode is off").toHaveLength(0);
    expect(shell.root.querySelector(".sd-eject")).not.toBeNull();
  });

  it("leaves HOME and the other screens in reach while USB Storage Mode is on, as the unit does", async () => {
    // The user guide's NOTE under "USB Storage Mode button" says no other menu can be
    // reached; the unit goes HOME and opens the other screens (URX44V, 2026-09-22).
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    await flush();
    shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.usbStorage", false)).toBe(true);

    shell.root.querySelector<HTMLElement>('[aria-label="HOME"]')?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
    for (const id of ["setup", "monitor", "channel-view"]) {
      shell.root.querySelector<HTMLElement>('[aria-label="HOME"]')?.click();
      await flush();
      if (id === "channel-view") shell.ctx.nav.push({ id, strip: "ch1" });
      else shell.root.querySelector<HTMLElement>(`[aria-label="${id.toUpperCase()}"]`)?.click();
      await flush();
      expect(shell.ctx.nav.current.id, id).toBe(id);
    }
    expect(shell.ctx.store.bool("sd.usbStorage", false), "and the mode stays on").toBe(true);
  });
});

describe("the SCENE menu the scene box opens", () => {
  it("stands between the scene box and the list", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".scene-box")?.click();
    await flush();
    // The box opens the menu, not the list: the unit shows SCENE first.
    expect(shell.ctx.nav.current.id).toBe("scene");
    expect(shell.root.querySelector(".toolbar-title")?.textContent).toBe("SCENE");
    const entries = [...shell.root.querySelectorAll(".menu-btn")].map((b) => b.textContent);
    expect(entries).toEqual(["Scene List"]);

    shell.root.querySelector<HTMLElement>(".menu-btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("scene.list");
    expect(shell.root.querySelector(".toolbar-title")?.textContent).toBe("SCENE LIST");
    // Two steps down, so the arrow back to the menu is there.
    expect(shell.root.querySelector('[aria-label="Back"]')).not.toBeNull();
  });

  it("marks the last recalled scene with a glyph ahead of its number on Store/Recall, and prints each number alone", async () => {
    const shell = await mount();
    await shell.ctx.store.set("scene.current", 2);
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const numbers = [...shell.root.querySelectorAll(".scene-list .list-row .scene-no")];
    expect(numbers.slice(1, 4).map((n) => n.textContent)).toEqual(["01", "02", "03"]);
    const marks = (): (string | null)[] =>
      [...shell.root.querySelectorAll(".scene-list .list-row .scene-no")].map((n) => n.querySelector("svg")?.getAttribute("class") ?? null);
    expect(marks().slice(1, 4), "Store/Recall").toEqual([null, "icon-recalled", null]);
    await shell.ctx.store.set("ui.sceneMenu", "Edit");
    await flush();
    expect(marks().slice(1, 4), "Edit draws no mark").toEqual([null, null, null]);
  });

  it("lists 00 and every number from 01 to 63 on Standard, and on Simple the presets before the numbers Standard has not stored", async () => {
    const shell = await mount();
    await shell.ctx.store.set("scene.Standard.3.title", "Band");
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const rows = (): Element[] => [...shell.root.querySelectorAll(".scene-list .list-row")];
    const numbers = (): string[] => rows().map((r) => r.querySelector(".scene-no")?.textContent ?? "");
    const titles = (): string[] => rows().map((r) => r.querySelectorAll(".list-cell")[1]?.textContent ?? "");
    expect(numbers()).toEqual(Array.from({ length: 64 }, (_, i) => String(i).padStart(2, "0")));
    expect(titles().slice(0, 5)).toEqual(["Initial Data", "No Scene", "No Scene", "Band", "No Scene"]);
    const factories = (): number[] => rows().flatMap((r, i) => (r.querySelector(".scene-lock .icon-factory") ? [i] : []));
    expect(factories(), "00 alone carries the factory").toEqual([0]);
    expect(rows()[0]?.classList.contains("is-selected"), "the first row until one is picked").toBe(true);
    await shell.ctx.store.set("scene.bank", "Simple");
    await flush();
    expect(numbers().slice(0, 5)).toEqual(["P01", "P02", "P03", "01", "02"]);
    expect(numbers(), "Standard's 03 is not on Simple").not.toContain("03");
    expect(numbers(), "nor is 00").not.toContain("00");
    expect(factories(), "the presets").toEqual([0, 1, 2]);
    expect(numbers()).toHaveLength(3 + 62);
    expect(rows()[0]?.classList.contains("is-selected"), "the first preset").toBe(true);
  });

  it("opens the other bank at its first row, even where it lists the number picked on this one", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const rows = (): Element[] => [...shell.root.querySelectorAll(".scene-list .list-row")];
    rows()[5]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("scene.selected", -1), "05 on Standard").toBe(5);
    [...shell.root.querySelectorAll<HTMLElement>(".scene-bank")].find((b) => b.textContent === "Simple")?.click();
    await flush();
    expect(rows().findIndex((r) => r.classList.contains("is-selected")), "P01, though Simple lists 05 too").toBe(0);
  });

  it("draws the list's thumb no shorter than 15px, its foot at the end of the well once the list is scrolled to its end", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const body = shell.root.querySelector<HTMLElement>(".scene-list .list-body");
    const thumb = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".scene-scrollbar .scroll-thumb");
    // 63 rows of 38px, three of them in view.
    const put = (scrollTop: number): void => {
      for (const [name, value] of [["scrollHeight", 63 * 38], ["clientHeight", 3 * 38], ["scrollTop", scrollTop]] as const) {
        if (body) Object.defineProperty(body, name, { configurable: true, value });
      }
      body?.dispatchEvent(new Event("scroll"));
    };
    put(0);
    expect([thumb()?.style.height, thumb()?.style.top]).toEqual(["15px", "0px"]);
    put(60 * 38);
    expect(Number.parseFloat(thumb()?.style.top ?? "") + 15).toBeCloseTo(111);
  });

  it("names the recalled scene on HOME the way the list names it", async () => {
    const shell = await mount();
    const box = (): string[] => [...(shell.root.querySelector(".scene-box")?.children ?? [])].map((c) => c.textContent ?? "");
    expect(box(), "a factory unit").toEqual(["00", "Initial Data"]);
    await shell.ctx.store.set("scene.Standard.3.title", "Band");
    await shell.ctx.store.set("scene.current", 3);
    await flush();
    expect(box()).toEqual(["03", "Band"]);
    await shell.ctx.store.set("scene.current", 101);
    await flush();
    expect(box(), "a preset").toEqual(["P01", "Live Music 0"]);
  });

  it("asks with a marked dialog box", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".scene-actions .btn")]
      .find((b) => b.textContent === "Recall")
      ?.click();
    await flush();

    const box = shell.root.querySelector(".dialog");
    expect(box, "the dialog is up").not.toBeNull();
    expect(box?.querySelector(".dialog-mark svg"), "and carries the information mark").not.toBeNull();
    expect(box?.querySelector(".dialog-text")?.textContent).toContain("Recall scene");
    expect([...(box?.querySelectorAll(".dialog-actions .btn") ?? [])].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
  });

  const sceneList = async (state: Record<string, number | string>): Promise<Shell> => {
    const shell = await mount();
    for (const [path, value] of Object.entries(state)) await shell.ctx.store.set(path, value);
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    return shell;
  };
  const editButtons = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".scene-actions.is-edit .btn")];
  const shut = (shell: Shell): boolean[] => editButtons(shell).map((b) => b.classList.contains("is-disabled"));
  const tap = async (node: HTMLElement | undefined): Promise<void> => {
    node?.click();
    await flush();
  };
  const pick = (shell: Shell, selector: string, text: string): HTMLElement | undefined =>
    [...shell.root.querySelectorAll<HTMLElement>(selector)].find((b) => b.textContent === text);

  it("edits on three glyph buttons, and a protected scene takes a padlock that shuts Delete, Title and Store", async () => {
    const shell = await sceneList({ "scene.Standard.1.title": "sample date", "scene.selected": 1, "ui.sceneMenu": "Edit" });
    expect(editButtons(shell).map((b) => b.getAttribute("aria-label"))).toEqual(["Protect", "Delete", "Title"]);
    expect(editButtons(shell).map((b) => b.querySelector("svg")?.getAttribute("class"))).toEqual(["icon-lock", "icon-trash", "icon-rename"]);
    expect(pick(shell, ".scene-actions .btn", "Store"), "Store and Recall give way to them").toBeUndefined();
    expect(shut(shell), "a stored scene").toEqual([false, false, false]);
    const padlock = (): Element | null | undefined =>
      shell.root.querySelectorAll(".scene-list .list-row")[1]?.querySelector(".scene-lock.is-protected .icon-lock");
    expect(padlock()).toBeNull();

    await tap(editButtons(shell)[0]);
    expect(shell.ctx.store.num("scene.Standard.1.protect", 0)).toBe(1);
    expect(padlock(), "the padlock in its Lock cell").not.toBeNull();
    expect(shut(shell), "Delete and Title shut").toEqual([false, true, true]);
    await tap(editButtons(shell)[1]);
    expect(shell.root.querySelector(".dialog"), "a shut Delete asks nothing").toBeNull();
    await tap(editButtons(shell)[2]);
    expect(shell.ctx.nav.current.id, "a shut Title opens nothing").toBe("scene.list");
    await shell.ctx.store.set("ui.sceneMenu", "Store/Recall");
    await flush();
    expect(pick(shell, ".scene-actions .btn", "Store")?.classList.contains("is-disabled"), "nor can it be stored over").toBe(true);

    await shell.ctx.store.set("ui.sceneMenu", "Edit");
    await flush();
    await tap(editButtons(shell)[0]);
    expect(padlock(), "Protect again lifts it").toBeNull();
    expect(shut(shell)).toEqual([false, false, false]);
  });

  it("asks before deleting a scene by its number, and clears it on OK alone", async () => {
    const shell = await sceneList({ "scene.Standard.5.title": "Band", "scene.Standard.5.protect": 0, "scene.selected": 5, "ui.sceneMenu": "Edit" });
    await tap(editButtons(shell)[1]);
    const box = shell.root.querySelector(".dialog");
    expect(box?.querySelector(".dialog-text")?.textContent).toBe('Delete "Scene Memory #05"?');
    expect([...(box?.querySelectorAll(".dialog-actions .btn") ?? [])].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    await tap(pick(shell, ".dialog-actions .btn", "Cancel"));
    expect(shell.ctx.store.str("scene.Standard.5.title", ""), "Cancel keeps it").toBe("Band");

    await tap(editButtons(shell)[1]);
    await tap(pick(shell, ".dialog-actions .btn", "OK"));
    expect(shell.ctx.store.str("scene.Standard.5.title", "")).toBe("");
    expect(shell.root.querySelectorAll(".scene-list .list-row")[5]?.querySelectorAll(".list-cell")[1]?.textContent).toBe("No Scene");
  });

  it("shuts all three on an empty number and a factory scene, and Store and Edit on Simple's list in Standard Mode", async () => {
    const shell = await sceneList({ "scene.selected": 7, "ui.sceneMenu": "Edit" });
    expect(shut(shell), "No Scene").toEqual([true, true, true]);
    await tap(editButtons(shell)[1]);
    expect(shell.root.querySelector(".dialog")).toBeNull();
    await shell.ctx.store.set("scene.selected", 0);
    await flush();
    expect(shut(shell), "00 Initial Data").toEqual([true, true, true]);
    const editTab = (): Element | undefined => [...shell.root.querySelectorAll(".side-tab")][1];
    expect(editTab()?.classList.contains("is-disabled"), "its Edit menu shut").toBe(true);

    await shell.ctx.store.set("scene.Simple.9.title", "Live");
    await shell.ctx.store.set("scene.bank", "Simple");
    await shell.ctx.store.set("scene.selected", 9);
    await flush();
    const shutOnSimple = async (): Promise<(boolean | undefined)[]> => {
      await shell.ctx.store.set("ui.sceneMenu", "Store/Recall");
      await flush();
      return [editTab()?.classList.contains("is-disabled"), pick(shell, ".scene-actions .btn", "Store")?.classList.contains("is-disabled")];
    };
    expect(await shutOnSimple(), "Simple's scene in Standard Mode").toEqual([true, true]);
    await shell.ctx.store.set("setup.operationMode", "Simple");
    await flush();
    expect(await shutOnSimple(), "and in Simple Mode").toEqual([false, false]);
  });

  it("names an empty number on the title entry sheet when it is stored, and asks before storing over a stored scene", async () => {
    const shell = await sceneList({ "scene.Standard.4.title": "Band", "scene.selected": 7 });
    await tap(pick(shell, ".scene-actions .btn", "Store"));
    expect(shell.ctx.nav.current.id, "an empty number opens the sheet").toBe("scene.title");
    expect(shell.root.querySelector(".title-text")?.textContent, "on the recalled scene's title").toBe("Initial Data");
    await tap(pick(shell, ".pick-dialog-btn", "Cancel"));
    expect([shell.ctx.store.str("scene.Standard.7.title", ""), shell.ctx.store.num("scene.current", 0)], "Cancel stores nothing").toEqual(["", 0]);

    await tap(pick(shell, ".scene-actions .btn", "Store"));
    await tap(pick(shell, ".title-key", "x"));
    await tap(pick(shell, ".pick-dialog-btn", "OK"));
    expect([shell.ctx.nav.current.id, shell.ctx.store.str("scene.Standard.7.title", ""), shell.ctx.store.num("scene.current", 0)]).toEqual([
      "scene.list", "Initial Datax", 7,
    ]);

    await shell.ctx.store.set("scene.selected", 4);
    await flush();
    await tap(pick(shell, ".scene-actions .btn", "Store"));
    expect(shell.ctx.nav.current.id, "a stored scene keeps the list").toBe("scene.list");
    expect(shell.root.querySelector(".dialog .dialog-text")?.textContent).toBe('Store to "Scene Memory #04"?');
    await tap(pick(shell, ".dialog-actions .btn", "Cancel"));
    expect(shell.ctx.store.num("scene.current", 0), "Cancel leaves the recalled scene").toBe(7);
    await tap(pick(shell, ".scene-actions .btn", "Store"));
    await tap(pick(shell, ".dialog-actions .btn", "OK"));
    expect([shell.ctx.store.num("scene.current", 0), shell.ctx.store.str("scene.Standard.4.title", "")]).toEqual([4, "Band"]);
  });

  it("takes no more than 16 characters for a title", async () => {
    const shell = await sceneList({ "scene.Standard.2.title": "0123456789abcde", "scene.selected": 2, "ui.sceneMenu": "Edit" });
    await tap(editButtons(shell)[2]);
    const typed = (): string => shell.root.querySelector(".title-text")?.textContent ?? "";
    await tap(pick(shell, ".title-key", "q"));
    expect(typed()).toBe("0123456789abcdeq");
    await tap(pick(shell, ".title-key", "w"));
    await tap(pick(shell, ".title-key", "space"));
    expect(typed(), "a 17th character changes nothing").toBe("0123456789abcdeq");
    await tap(shell.root.querySelector<HTMLElement>('.title-key[aria-label="Backspace"]') ?? undefined);
    await tap(pick(shell, ".title-key", "w"));
    expect(typed()).toBe("0123456789abcdew");
  });

  it("renames a scene on the keyboard sheet, writing the title on OK alone", async () => {
    const shell = await sceneList({ "scene.Standard.2.title": "Band", "scene.selected": 2, "ui.sceneMenu": "Edit" });
    const typed = (): string => shell.root.querySelector(".title-text")?.textContent ?? "";
    const faces = (): string[] => [...shell.root.querySelectorAll(".title-key")].map((k) => k.textContent ?? "");
    const key = (face: string): HTMLElement | undefined => pick(shell, ".title-key", face);
    const named = (name: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.title-key[aria-label="${name}"]`);

    await tap(editButtons(shell)[2]);
    expect(shell.ctx.nav.current.id).toBe("scene.title");
    expect([pick(shell, ".pick-dialog-btn", "Cancel"), pick(shell, ".pick-dialog-btn", "OK")].every(Boolean)).toBe(true);
    expect(typed(), "the title as it stands").toBe("Band");
    expect(faces().slice(0, 10).join("")).toBe("qwertyuiop");
    expect(faces().slice(10, 19).join("")).toBe("asdfghjkl");
    expect(faces().slice(19, 28), "Shift, seven letters and backspace").toEqual(["Shift", ..."zxcvbnm", ""]);
    expect(faces().slice(28), "the foot row").toEqual(["123", "space", "@", ".", "<", ">"]);
    const placed = (i: number): string[] => {
      const node = shell.root.querySelectorAll<HTMLElement>(".title-key")[i];
      return [node?.style.gridColumn ?? "", node?.style.gridRow ?? ""];
    };
    expect([placed(0), placed(10), placed(27), placed(29), placed(33)], "q, a half a key in, backspace two keys wide, space three, > at the end").toEqual([
      ["1 / span 4", "1"], ["3 / span 4", "2"], ["33 / span 8", "3"], ["7 / span 12", "4"], ["34 / span 7", "4"],
    ]);

    await tap(key("Shift"));
    expect(key("Shift")?.classList.contains("is-on"), "Shift lit").toBe(true);
    expect(faces().slice(0, 10).join("")).toBe("QWERTYUIOP");
    await tap(key("Q"));
    await tap(key("Q"));
    expect(typed(), "Shift stays on").toBe("BandQQ");
    await tap(key("Shift"));
    expect(key("Shift")?.classList.contains("is-on"), "and goes off on the next tap").toBe(false);

    await tap(key("123"));
    expect(faces().slice(0, 10).join("")).toBe("1234567890");
    expect(faces().slice(10, 18).join("")).toBe("-/:;()\\&");
    expect(faces().slice(18, 25), "#+-, five marks and backspace").toEqual(["#+-", ...".,?!'", ""]);
    expect(faces()[25]).toBe("ABC");
    await tap(key("1"));
    await tap(key("#+-"));
    expect(faces().slice(0, 10).join("")).toBe("[]{}#%^*+=");
    expect(faces().slice(10, 18).join("")).toBe("_|~<>$\\\"");
    expect(faces()[18]).toBe("123");
    await tap(key("="));
    await tap(key("ABC"));
    expect(faces()[0]).toBe("q");
    expect(typed()).toBe("BandQQ1=");

    await tap(named("Move left") ?? undefined);
    await tap(named("Move left") ?? undefined);
    await tap(key("space"));
    expect(typed(), "typed where the cursor stands").toBe("BandQQ 1=");
    await tap(named("Backspace") ?? undefined);
    await tap(named("Backspace") ?? undefined);
    await tap(named("Move right") ?? undefined);
    expect(typed()).toBe("BandQ1=");

    await tap(pick(shell, ".pick-dialog-btn", "Cancel"));
    expect([shell.ctx.nav.current.id, shell.ctx.store.str("scene.Standard.2.title", "")], "Cancel writes nothing").toEqual(["scene.list", "Band"]);

    await tap(editButtons(shell)[2]);
    expect(typed(), "the sheet opens on the title again").toBe("Band");
    shell.root.querySelector<HTMLElement>(".title-clear")?.click();
    await flush();
    expect(typed()).toBe("");
    await tap(pick(shell, ".pick-dialog-btn", "OK"));
    expect([shell.ctx.nav.current.id, shell.ctx.store.str("scene.Standard.2.title", "")], "OK does nothing on an empty field").toEqual(["scene.title", "Band"]);
    await tap(pick(shell, ".pick-dialog-btn", "Cancel"));

    await tap(editButtons(shell)[2]);
    await tap(key("s"));
    await tap(pick(shell, ".pick-dialog-btn", "OK"));
    expect([shell.ctx.nav.current.id, shell.ctx.store.str("scene.Standard.2.title", "")]).toEqual(["scene.list", "Bands"]);
  });

  it("keeps the unit's keys out of the Tab order and takes a browser's keys in the field", async () => {
    const shell = await sceneList({ "scene.Standard.2.title": "Band", "scene.selected": 2, "ui.sceneMenu": "Edit" });
    await tap(editButtons(shell)[2]);
    const typed = (): string => shell.root.querySelector(".title-text")?.textContent ?? "";
    const field = (): HTMLElement => shell.root.querySelector<HTMLElement>(".title-field") as HTMLElement;
    const keys = (): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".title-key")];
    /** A key sent as a browser sends it, answering whether the sheet took it. */
    const send = async (name: string, from?: HTMLElement, init: KeyboardEventInit = {}): Promise<boolean> => {
      const ev = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
      (from ?? field()).dispatchEvent(ev);
      await flush();
      return ev.defaultPrevented;
    };

    expect([keys().length, keys().filter((k) => k.tabIndex >= 0).length], "the unit's keys hold no Tab stop").toEqual([34, 0]);
    expect([field().tabIndex, field().getAttribute("role")], "the field holds one, and reads as a text box").toEqual([0, "textbox"]);

    expect(await send("s")).toBe(true);
    expect(typed()).toBe("Bands");

    await send("ArrowLeft");
    await send("ArrowLeft");
    await send("!");
    expect(typed(), "typed where the caret stands, in a layout the sheet does not show").toBe("Ban!ds");
    await send("Backspace");
    expect(typed()).toBe("Bands");

    expect(await send("é"), "a character the unit cannot type is left alone").toBe(false);
    expect(await send("F1")).toBe(false);
    expect(await send("v", undefined, { ctrlKey: true }), "and a shortcut passes through").toBe(false);
    expect(await send("q", undefined, { isComposing: true }), "nothing is typed while an IME is composing").toBe(false);
    // The clear button answers Space itself, so the field must leave that key alone.
    await send(" ", shell.root.querySelector<HTMLElement>(".title-clear") ?? undefined);
    expect(typed(), "a key on the button inside the field is not the field's").toBe("Bands");

    await tap(pick(shell, ".title-key", "Shift"));
    await send("a");
    expect(typed(), "the case comes from the browser's own key, not the sheet's Shift").toBe("Banads");

    await shell.ctx.store.set("ui.titleEntry.text", "0123456789abcdef");
    await shell.ctx.store.set("ui.titleEntry.cursor", 16);
    await flush();
    await send("z");
    expect(typed(), "a 17th character changes nothing").toBe("0123456789abcdef");
  });
});

describe("the sheets a value is picked on", () => {
  const overlays = (shell: Shell): number => shell.root.querySelectorAll("[data-overlay]").length;
  const open = async (shell: Shell, opener: string): Promise<void> => {
    shell.root.querySelector<HTMLElement>(opener)?.click();
    await flush();
  };

  // One sheet, three screens: the same panel, name band and way out. A pick and
  // the way out both have to hand the sheet back to the shell, not merely take
  // its node off the page — the shell holds the way to shut whatever is layered
  // over the screen and would be left holding one for a sheet that is gone.
  const SHEETS: [string, string[], string, string, string][] = [
    ["input source", ["channel-view", "ch.input"], ".input-source-btn", ".source-sheet", ".source-btn"],
    ["record source", ["microsd", "microsd.recorder"], ".rec-slot-src", ".source-sheet", ".source-btn"],
    ["colour", ["channel-view", "ch.setting"], ".chs-color-box", ".color-sheet", ".color-swatch"],
  ];

  for (const [name, stack, opener, sheet, choice] of SHEETS) {
    it(`shuts the ${name} sheet on a pick and on the way out, leaving nothing over the screen`, async () => {
      const shell = await mount();
      const [top, under] = stack as [string, string];
      if (top === "microsd") shell.ctx.nav.openTop({ id: top });
      else shell.ctx.nav.push({ id: top, strip: "ch1" });
      shell.ctx.nav.push({ id: under, strip: "ch1" });
      await flush();
      expect(overlays(shell), "nothing is layered over the screen to start with").toBe(0);

      await open(shell, opener);
      expect(shell.root.querySelector(sheet), "the sheet is up").not.toBeNull();
      expect(overlays(shell)).toBe(1);
      expect(shell.root.querySelector(`${sheet} .source-title`), "with its name band").not.toBeNull();
      expect(shell.root.querySelector(`${sheet} .source-back`), "and the way out").not.toBeNull();

      shell.root.querySelector<HTMLElement>(choice)?.click();
      await flush();
      expect(shell.root.querySelector(sheet), "a pick shuts it").toBeNull();
      expect(overlays(shell), "and leaves nothing behind").toBe(0);

      await open(shell, opener);
      shell.root.querySelector<HTMLElement>(`${sheet} .source-back`)?.click();
      await flush();
      expect(shell.root.querySelector(sheet), "the way out shuts it").toBeNull();
      expect(overlays(shell), "and leaves nothing behind either").toBe(0);
    });
  }
});

describe("CH SETTING: what a channel is tapped at and what colour it carries", () => {
  const setting = async (id: string): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: id });
    shell.ctx.nav.push({ id: "ch.setting", strip: id });
    await flush();
    return shell;
  };
  const recOptions = async (shell: Shell): Promise<string[]> => {
    shell.root.querySelector<HTMLElement>(".chs-rec-field .pulldown")?.click();
    await flush();
    return [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].map((o) => o.textContent ?? "");
  };
  const pickCompEq = async (shell: Shell, value: string): Promise<void> => {
    shell.root.querySelector<HTMLElement>(".chs-comp-field .pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === value)?.click();
    await flush();
  };

  it("offers every stage of the strip on a mono channel and the two an EQ leaves on a stereo one", async () => {
    // The strip order is fixed (Φ → HPF → GATE → COMP → EQ → INS FX → fader), so
    // the tap can only stand where a stage begins. A stereo input has an EQ and
    // nothing else, so the stages either side of it are all it can offer.
    expect(await recOptions(await setting("ch1"))).toEqual([
      "PRE GATE",
      "PRE COMP",
      "PRE EQ",
      "PRE INS FX",
      "PRE FADER",
    ]);
    expect(await recOptions(await setting("ch_9_10"))).toEqual(["PRE EQ", "PRE FADER"]);
  });

  it("drops PRE EQ while the morphing strip is in, and moves a tap standing on it", async () => {
    const shell = await setting("ch1");
    await pickCompEq(shell, "SSMCS");
    expect(await recOptions(shell)).toEqual(["PRE GATE", "PRE COMP", "PRE INS FX", "PRE FADER"]);

    await pickCompEq(shell, "COMP->EQ");
    shell.root.querySelector<HTMLElement>(".chs-rec-field .pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "PRE EQ")?.click();
    await flush();
    expect(shell.ctx.store.str("ch.ch1.recPoint", "")).toBe("PRE EQ");

    // Nothing is left to tap ahead of, so the tap falls back a stage.
    await pickCompEq(shell, "SSMCS");
    expect(shell.ctx.store.str("ch.ch1.recPoint", "")).toBe("PRE COMP");
  });

  it("carries the chosen colour wherever the channel is drawn, and none when it has none", async () => {
    const shell = await setting("ch1");
    shell.root.querySelector<HTMLElement>(".chs-color-box")?.click();
    await flush();
    const buttons = [...shell.root.querySelectorAll<HTMLElement>(".color-swatch")];
    const swatches = buttons.map((b) => b.textContent ?? "");
    expect(swatches, "the palette and the channel that carries none").toEqual([
      "Blue",
      "Orange",
      "Yellow",
      "Purple",
      "Cyan",
      "Magenta",
      "Red",
      "Green",
      "LtGreen",
      "White",
      "Off",
    ]);
    // Each button is the colour it stands for and names itself in whichever of
    // black and white reads on it.
    const blue = buttons[0];
    // The stylesheet normalises a hex to rgb(), so the palette entry is put
    // through the same normalisation to be compared with.
    const asWritten = (hex: string): string => {
      const probe = document.createElement("div");
      probe.style.background = hex;
      return probe.style.background;
    };
    expect(blue?.style.background, "the button is the colour it stands for").toBe(asWritten(CH_COLOR_PALETTE[0].hex));
    expect(blue?.style.color).toBe("rgb(255, 255, 255)");
    expect(buttons[2]?.style.color, "black on the yellow one").toBe("rgb(0, 0, 0)");
    expect(buttons[10]?.style.color, "grey on the one that takes the colour away").toBe("var(--text-secondary)");
    // The one that takes the colour away stands apart, on a face of its own.
    expect(buttons[10]?.style.background).not.toBe(buttons[9]?.style.background);
    expect(shell.root.querySelector(".color-gap"), "with a place left before it").not.toBeNull();
    // Nothing marks the colour in force: the field it was picked in shows it.
    expect(buttons.filter((b) => b.classList.contains("is-on"))).toEqual([]);

    [...shell.root.querySelectorAll<HTMLElement>(".color-swatch")].find((b) => b.textContent === "Red")?.click();
    await flush();
    const picked = shell.ctx.store.str("ch.ch1.color", "");
    const painted = (sel: string): string => shell.root.querySelector<HTMLElement>(sel)?.style.background ?? "";
    // The factory state already seeds a colour, so the tap has to be shown to
    // write the one it names rather than merely to leave something behind.
    expect(picked, "the tap writes the colour on the button").toBe(
      CH_COLOR_PALETTE.find((c) => c.name === "Red")?.hex,
    );
    // The stylesheet reads a hex back as rgb(), so the swatch in the field is the
    // yardstick the other two are held to.
    const shown = painted(".chs-color");
    expect(shown, "the field it was picked in").not.toBe("");
    expect(painted(".ch-chip-icon"), "and the chip in the toolbar").toBe(shown);

    shell.ctx.nav.home();
    await flush();
    expect(painted(".strip-icon"), "and the strip on HOME").toBe(shown);

    await shell.ctx.store.set("ch.ch1.color", "Off");
    await flush();
    expect(painted(".strip-icon"), "a channel with none paints none").toBe("");
    // The rail reads the same property, so it has to come back empty rather than
    // carrying the word the store keeps.
    const rail = shell.root.querySelector<HTMLElement>(".strip")?.style.getPropertyValue("--rail");
    expect(rail, "and its rail carries nothing").toBe("");
  });

  it("closes the palette on the way out without changing the colour", async () => {
    const shell = await setting("ch1");
    const before = shell.ctx.store.str("ch.ch1.color", "");
    shell.root.querySelector<HTMLElement>(".chs-color-box")?.click();
    await flush();
    expect(shell.root.querySelector(".color-sheet"), "the palette is up").not.toBeNull();

    shell.root.querySelector<HTMLElement>(".source-back")?.click();
    await flush();
    expect(shell.root.querySelector(".color-sheet"), "the way out closes it").toBeNull();
    expect(shell.ctx.store.str("ch.ch1.color", ""), "on the colour it was opened with").toBe(before);
  });
});

describe("POWER MANAGEMENT", () => {
  const open = async (): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.power" });
    await flush();
    return shell;
  };
  const enable = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(".power-screen > .btn");
  const press = async (shell: Shell, label: string): Promise<void> => {
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === label)?.click();
    await flush();
  };

  it("ships with the auto power off function on, and lights the switch for it", async () => {
    // The guide: "For the URX44V model, the auto power off function is enabled
    // in default settings."
    const shell = await open();
    expect(shell.ctx.store.bool("setup.power.autoPowerOff", false)).toBe(true);
    expect(enable(shell)?.classList.contains("is-on")).toBe(true);
    // Only the unlit face is overridden, so the lit one keeps the switch colour.
    expect(declarations(CSS, ".power-screen > .btn")["background"]).toBeUndefined();
    expect(declarations(CSS, ".power-screen > .btn:not(.is-on)")["background"]).toBe("var(--surface-btn)");
    expect(declarations(CSS, ".btn-toggle.is-on")["background"]).toBe("var(--accent-on)");
  });

  it("asks before the function is turned off, and only then", async () => {
    const shell = await open();
    const off = (): boolean => !shell.ctx.store.bool("setup.power.autoPowerOff", true);

    enable(shell)?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-text")?.textContent).toContain("will increase power");
    expect(off(), "nothing changes while the box is up").toBe(false);

    await press(shell, "Cancel");
    expect(off(), "and Cancel leaves it on").toBe(false);

    enable(shell)?.click();
    await flush();
    await press(shell, "OK");
    expect(off()).toBe(true);
    expect(enable(shell)?.classList.contains("is-on")).toBe(false);

    enable(shell)?.click();
    await flush();
    expect(shell.root.querySelector(".dialog"), "switching it back on asks nothing").toBeNull();
    expect(off()).toBe(false);
  });
});

describe("the side rail's tabs", () => {
  const open = async (id: string): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id });
    await flush();
    return shell;
  };
  const tabs = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".side-tab")];

  it("lights the tab that names the menu on screen, even when the rail has one", async () => {
    // SOFTWARE INTEGRATION's single [DAW] tab is lit, as a rail lights the tab
    // for the menu in view.
    const shell = await open("setup.integration");
    expect(tabs(shell).map((t) => t.textContent)).toEqual(["DAW"]);
    expect(tabs(shell)[0]?.classList.contains("is-on")).toBe(true);
  });

  it("keeps room for the glyph on a tab that has none, and drops it where the unit does", async () => {
    // The unit sets [DAW]'s name at the same height as the names beside it, so
    // the empty glyph box is still there. The SEND TO tabs are the one family
    // the unit gives no glyph at all, and they centre the name instead.
    const shell = await open("setup.integration");
    expect(tabs(shell)[0]?.querySelector(".side-tab-icon")).not.toBeNull();
    expect(declarations(CSS, ".sendto-tab .side-tab-icon")["display"]).toBe("none");
  });

  it("marks a tab whose name takes two lines, so it can keep the same box", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    const wrapped = tabs(shell).filter((t) => t.classList.contains("side-tab-wrapped"));
    expect(wrapped.map((t) => t.textContent)).toEqual(["Save/\nLoad"]);
    // The mark only changes what is inside the box; the box itself does not grow.
    expect(px(declarations(CSS, ".side-tab")["height"])).toBe(52);
    expect(declarations(CSS, ".side-tab-wrapped")["height"]).toBeUndefined();
  });
});

describe("the sampling frequency row", () => {
  const open = async (): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.rate" });
    await flush();
    return shell;
  };
  const cells = (shell: Shell): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")];
  const lit = (shell: Shell): string | undefined => cells(shell).find((c) => c.classList.contains("is-on"))?.textContent ?? undefined;
  const tap = async (shell: Shell, label: string): Promise<void> => {
    cells(shell).find((c) => c.textContent === label)?.click();
    await flush();
  };

  it("ships on 48kHz with the unit on its own clock", async () => {
    // The screen opens with [Follow USB] unlit and 48kHz lit.
    const shell = await open();
    expect(shell.ctx.store.bool("setup.followUsb", true)).toBe(false);
    expect(lit(shell)).toBe("48kHz");
    expect(shell.root.querySelector(".follow-usb")?.classList.contains("is-on")).toBe(false);
  });

  it("takes a frequency while the unit is on its own clock", async () => {
    const shell = await open();
    await tap(shell, "96kHz");
    expect(shell.ctx.store.num("setup.samplingFrequency", 0)).toBe(96000);
    expect(lit(shell)).toBe("96kHz");
  });

  it("keeps the frequency it holds while it follows the USB clock, and takes no other", async () => {
    const shell = await open();
    shell.root.querySelector<HTMLElement>(".follow-usb")?.click();
    await flush();
    expect(shell.root.querySelector(".rate-row")?.classList.contains("is-locked")).toBe(true);

    await tap(shell, "176.4kHz");
    expect(shell.ctx.store.num("setup.samplingFrequency", 0), "the row cannot be taken").toBe(48000);
    expect(lit(shell), "and goes on showing what the unit holds").toBe("48kHz");
    expect(cells(shell).every((c) => c.getAttribute("aria-disabled") === "true")).toBe(true);

    shell.root.querySelector<HTMLElement>(".follow-usb")?.click();
    await flush();
    await tap(shell, "176.4kHz");
    expect(shell.ctx.store.num("setup.samplingFrequency", 0)).toBe(176400);
  });

  it("is one segmented control, rounded only at the two ends of the row", () => {
    // Six cells and their gaps fill the row, only the outer corners curve, and
    // the peripheral menu's row takes the same gap.
    const row = declarations(CSS, ".rate-row");
    const cell = declarations(CSS, ".rate-btn");
    expect(px(row["gap"])).toBe(px(declarations(CSS, ".peripheral-group .btn-row")["gap"]));
    expect(px(cell["min-width"]) * 6 + px(row["gap"]) * 5).toBe(448);
    expect(cell["border-radius"], "the cells in the middle are square").toBe("0");
    expect(declarations(CSS, ".rate-btn:first-child")["border-radius"]).toBe("var(--radius-md) 0 0 var(--radius-md)");
    expect(declarations(CSS, ".rate-btn:last-child")["border-radius"]).toBe("0 var(--radius-md) var(--radius-md) 0");
  });

  it("dims the locked row instead of repainting it, so the frequency stays readable", () => {
    // The unit dims the microSD buttons it locks to this share of their
    // brightness: face (74,81,90) and name (255,255,255) become (33,40,41) and
    // (123,121,123). A control that has to keep its own colour is dimmed by the
    // same amount.
    const factor = Number(declarations(TOKENS, ":root")["--dim-disabled"]);
    const rgb = (token: string): number[] =>
      [1, 3, 5].map((i) => parseInt((declarations(TOKENS, ":root")[token] ?? "").slice(i, i + 2), 16));
    expect([rgb("--surface"), rgb("--text")], "the plain face and name").toEqual([
      [74, 81, 90],
      [255, 255, 255],
    ]);
    const dimmed: [number[], number[]][] = [
      [rgb("--surface"), [33, 40, 41]],
      [rgb("--text"), [123, 121, 123]],
    ];
    for (const [plain, want] of dimmed) {
      plain.forEach((channel, i) => {
        expect(Math.abs(channel * factor - (want[i] ?? NaN)), `${plain} dimmed lands on ${want}`).toBeLessThanOrEqual(3);
      });
    }
    expect(declarations(CSS, ".rate-row.is-locked")["filter"]).toBe("brightness(var(--dim-disabled))");
    expect(declarations(CSS, ".rate-row.is-locked .btn")["pointer-events"]).toBe("none");
  });

  it("lights a chosen option in the selected colour, not the switch colour", () => {
    // A chosen option takes --accent-selected, not the colour an [ON] switch
    // lights in; the peripheral menu and the input-source sheet take it too.
    const option = declarations(CSS, ".rate-btn.is-on")["background"];
    expect(option).toBe("var(--accent-selected)");
    expect(option).not.toBe(declarations(CSS, ".btn-toggle.is-on")["background"]);
    for (const rule of [".peripheral-group .btn.is-on", ".source-btn.is-on"]) {
      expect(declarations(CSS, rule)["background"], `${rule} takes the same colour`).toBe(option);
    }
    // The switch beside the row is a switch, so it keeps the switch colour and
    // stands on the plain button face while it is off.
    expect(declarations(CSS, ".follow-usb")["background"]).toBeUndefined();
    expect(declarations(CSS, ".follow-usb:not(.is-on)")["background"]).toBe("var(--surface-btn)");
  });
});

describe("the oscillator's Assign tab", () => {
  it("takes FX 2 up to 96kHz, and above it leaves its place empty and keeps what it holds, on every model", async () => {
    // User guide, "Oscillator menu", Assign: FX 2 cannot be assigned at 176.4 kHz or 192 kHz.
    // The unit takes the button off the screen and brings it back with its assignment (URX44V, 2026-09-22).
    for (const id of ["URX22", "URX44", "URX44V"] as const) {
      const shell = await mount(id);
      shell.ctx.nav.openTop({ id: "monitor" });
      shell.ctx.nav.push({ id: "monitor.osc" });
      await shell.ctx.store.set("ui.oscTab", "Assign");
      await flush();
      const cells = (): Element[] => [...(shell.root.querySelector(".osc-assign")?.children ?? [])];
      const fx2 = (): HTMLElement | undefined =>
        [...shell.root.querySelectorAll<HTMLElement>(".osc-target")].find((b) => b.textContent === "FX 2");
      await shell.ctx.store.set("osc.assign.fx2", false);
      await flush();
      fx2()?.click();
      await flush();
      expect(shell.ctx.store.bool("osc.assign.fx2", false), `${id} takes FX 2 at 48 kHz`).toBe(true);

      for (const rate of [176400, 192000]) {
        await shell.ctx.store.set("setup.samplingFrequency", rate);
        await flush();
        expect(fx2(), `${id} ${rate}: no FX 2 button`).toBeUndefined();
        expect(cells()[5]?.classList.contains("osc-target-gap"), `${id} ${rate}: its place stays in the grid`).toBe(true);
        expect(cells().length, "the other buttons keep their places").toBe(9);
        expect(shell.ctx.store.bool("osc.assign.fx2", false), "the assignment is kept").toBe(true);
      }
      await shell.ctx.store.set("setup.samplingFrequency", 96000);
      await flush();
      expect(fx2()?.classList.contains("is-on"), `${id}: back lit at 96 kHz`).toBe(true);
      // Each box is lit in the colour of its kind of bus (URX44V, 2026-09-22).
      expect(
        [...shell.root.querySelectorAll(".osc-target")].map((b) => [...b.classList].find((c) => /^osc-(mix|fx|stereo)$/.test(c))),
      ).toEqual(["osc-mix", "osc-mix", "osc-mix", "osc-mix", "osc-fx", "osc-fx", "osc-stereo", "osc-stereo"]);
    }
  });
});

describe("the titles the toolbar shows", () => {
  it("puts BRIGHTNESS and PERIPHERAL in upper case, where the guide's own figures draw them mixed", async () => {
    const shell = await mount();
    const titleOf = async (id: string): Promise<string> => {
      shell.ctx.nav.openTop({ id: "setup" });
      shell.ctx.nav.push({ id });
      await flush();
      return shell.root.querySelector(".toolbar-title")?.textContent ?? "";
    };
    expect([await titleOf("setup.brightness"), await titleOf("setup.peripheral")]).toEqual(["BRIGHTNESS", "PERIPHERAL"]);
    expect(await titleOf("setup.language"), "a title the guide already draws in upper case is unchanged").toBe("LANGUAGE");
  });
});

describe("the screen backlight", () => {
  const veil = (shell: Shell): number => {
    const node = shell.root.querySelector<HTMLElement>(".lcd-dim");
    return node?.hidden ? 0 : Number(node?.style.opacity ?? "0");
  };

  it("lays black over the whole glass below the top of the range", async () => {
    const shell = await mount();
    expect(veil(shell), "the factory setting is the top of the range").toBe(0);

    await shell.ctx.store.set("setup.brightness", 5);
    await flush();
    const half = veil(shell);
    expect(half).toBeGreaterThan(0);

    await shell.ctx.store.set("setup.brightness", 0);
    await flush();
    expect(veil(shell), "and darkens all the way down").toBeGreaterThan(half);
    expect(veil(shell), "without putting the glass out").toBeLessThan(1);
  });

  it("covers what is layered over the screen as well as the screen", async () => {
    // A dialog box is on the glass too, so the backlight dims it with the rest.
    const dim = declarations(CSS, ".lcd-dim");
    expect(Number(dim["z-index"])).toBeGreaterThan(Number(declarations(CSS, ".dialog-overlay")["z-index"]));
    expect(dim["pointer-events"], "and never takes a tap").toBe("none");
  });
});

describe("picking what a user defined knob is on", () => {
  const openPicker = async (): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.udk" });
    await flush();
    shell.root.querySelector<HTMLElement>(".udk-knob")?.click();
    await flush();
    return shell;
  };
  const column = (shell: Shell, n: number): string[] =>
    [...(shell.root.querySelectorAll(".pick-dialog-col")[n]?.querySelectorAll(".btn.pick-dialog-row") ?? [])].map(
      (b) => b.textContent ?? "",
    );
  const lit = (shell: Shell, n: number): string | undefined =>
    [...(shell.root.querySelectorAll(".pick-dialog-col")[n]?.querySelectorAll<HTMLElement>(".btn.pick-dialog-row") ?? [])]
      .find((b) => b.classList.contains("is-on"))?.textContent ?? undefined;
  const pick = async (shell: Shell, n: number, label: string): Promise<void> => {
    [...(shell.root.querySelectorAll(".pick-dialog-col")[n]?.querySelectorAll<HTMLElement>(".btn.pick-dialog-row") ?? [])]
      .find((b) => b.textContent === label)
      ?.click();
    await flush();
  };
  const press = async (shell: Shell, label: string): Promise<void> => {
    [...shell.root.querySelectorAll<HTMLElement>(".pick-dialog-btn")].find((b) => b.textContent === label)?.click();
    await flush();
  };

  it("opens the unit's own dialog rather than dropping a list over the card", async () => {
    const shell = await openPicker();
    expect(shell.ctx.nav.current.id).toBe("setup.udk.assign");
    expect(shell.root.querySelector(".pick-dialog-sub")?.textContent).toBe("Bank 1, Knob A");
    // The guide's appendix "Functions that can be assigned to the user defined
    // knobs" is the first column.
    expect(column(shell, 0)).toEqual(["No Assign", "Brightness", "Monitor", "Phones", "Oscillator"]);
  });

  it("narrows the columns from the left", async () => {
    const shell = await openPicker();
    await pick(shell, 0, "Monitor");
    expect(column(shell, 1), "Parameter 1 follows the Function").toEqual(["Monitor 1", "Monitor 2"]);
    expect(column(shell, 2), "and Parameter 2 follows that").toEqual(["Level"]);
    expect([lit(shell, 1), lit(shell, 2)], "each column settles on its first entry").toEqual(["Monitor 1", "Level"]);

    await pick(shell, 0, "Oscillator");
    expect(column(shell, 1)).toEqual(["Level"]);
    expect(column(shell, 2), "Oscillator has no second parameter").toEqual([]);

    await pick(shell, 0, "Phones");
    await pick(shell, 1, "Phones 2");
    expect([lit(shell, 0), lit(shell, 1), lit(shell, 2)]).toEqual(["Phones", "Phones 2", "Level"]);
  });

  it("keeps the pick to the dialog until OK is touched", async () => {
    const shell = await openPicker();
    const slot = (): string => shell.ctx.store.str("setup.udk.1.A", "");
    const shipped = slot();
    expect(shipped, "bank 1's knob A ships on Phones 1").toBe("Phones 1 Level");
    await pick(shell, 0, "Monitor");
    expect(slot(), "nothing is written while the dialog is up").toBe(shipped);

    await press(shell, "Cancel");
    expect(shell.ctx.nav.current.id).toBe("setup.udk");
    expect(slot(), "and Cancel leaves it alone").toBe(shipped);

    shell.root.querySelector<HTMLElement>(".udk-knob")?.click();
    await flush();
    await pick(shell, 0, "Monitor");
    await press(shell, "OK");
    expect(shell.ctx.nav.current.id).toBe("setup.udk");
    expect(slot()).toBe("Monitor 1 Level");
    const card = shell.root.querySelector(".udk-knob-name");
    expect([...(card?.children ?? [])].map((n) => n.textContent)).toEqual([
      "Monitor",
      "Monitor 1",
      "Level",
    ]);

    // Opening it again starts on what the knob is already on.
    shell.root.querySelector<HTMLElement>(".udk-knob")?.click();
    await flush();
    expect([lit(shell, 0), lit(shell, 1), lit(shell, 2)]).toEqual(["Monitor", "Monitor 1", "Level"]);
  });
});

describe("the USER DEFINED KNOBS bar", () => {
  const cells = (shell: Shell): { value: string; label: string }[] =>
    [...shell.root.querySelectorAll(".knob-strip .knob-cell")].map((c) => ({
      value: c.querySelector(".knob-cell-value")?.textContent ?? "",
      label: c.querySelector(".knob-cell-label")?.textContent ?? "",
    }));

  async function udk(shell: Shell): Promise<void> {
    await shell.ctx.store.set("ui.userDefinedKnobs", true);
    await flush();
  }

  it("dashes a knob with nothing on it, under an empty name band", async () => {
    // Bank 4 ships with nothing on any knob.
    const shell = await mount();
    await shell.ctx.store.set("setup.udk.bank", 4);
    await udk(shell);
    // The dash stands where a value would, which is where the unit puts it.
    expect(cells(shell)).toEqual(Array.from({ length: 4 }, () => ({ value: "---", label: "" })));
  });

  it("carries the assignments the unit ships with on bank 1", async () => {
    const shell = await mount();
    await udk(shell);
    expect(cells(shell).map((c) => c.label)).toEqual(["Phones 1", "Phones 2", "", ""]);
    expect(cells(shell).slice(2).map((c) => c.value), "C and D ship with nothing on them").toEqual(["---", "---"]);
  });

  it("names the knob once something is on it, and reads what it turns", async () => {
    // The band carries the assignment's shorter name and the parameter's own
    // reading stands over it, the way the ordinary bar carries a value.
    const shell = await mount();
    await shell.ctx.store.set("setup.udk.bank", 4);
    await shell.ctx.store.set("setup.udk.4.A", "Monitor 1 Level");
    await shell.ctx.store.set("monitor.1.level", -4);
    await udk(shell);
    expect(cells(shell)[0]).toEqual({ value: "-4.00", label: "Monitor 1" });
    expect(cells(shell)[1]).toEqual({ value: "---", label: "" });
  });
});

describe("a dedicated channel screen's toolbar", () => {
  const open = async (id: string): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id, strip: "ch1" });
    await flush();
    return shell;
  };

  it("puts the block's name in the middle of the bar, not beside the channel", async () => {
    for (const [id, label] of [["ch.comp", "COMP"], ["ch.gate", "GATE"], ["ch.eq", "EQ"]] as const) {
      const shell = await open(id);
      const badge = shell.root.querySelector<HTMLElement>(".toolbar-center .badge-title");
      expect(badge?.textContent, `${id} names the block in the middle`).toBe(label);
      expect(shell.root.querySelector(".ch-selector .badge-title"), "and not beside the selector").toBeNull();
    }
  });

  it("names a screen that switches nothing in the same box, unpressable", async () => {
    for (const [id, label] of [["ch.setting", "CH SETTING"], ["ch.input", "INPUT"], ["ch.sendto", "SEND TO"]] as const) {
      const shell = await open(id);
      const box = shell.root.querySelector<HTMLElement>(".toolbar-center .badge-title");
      expect(box?.textContent, `${id} names itself in the middle`).toBe(label);
      expect(box?.classList.contains("badge-plain"), `${id} is a name, not a switch`).toBe(true);
      expect(box?.tagName, "so it is not a button").not.toBe("BUTTON");
      expect(shell.root.querySelector(".toolbar-title"), "and no plain caption stands beside it").toBeNull();
    }
  });

  it("turns the block on and off from that name", async () => {
    const shell = await open("ch.comp");
    const badge = shell.root.querySelector<HTMLElement>(".toolbar-center .badge-title");
    expect(badge?.getAttribute("aria-pressed")).toBe("false");
    badge?.click();
    await flush();
    expect(shell.root.querySelector(".toolbar-center .badge-title")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows [1-knob] from the setting the unit keeps and flips that setting", async () => {
    for (const block of ["comp", "eq"]) {
      const shell = await open(`ch.${block}`);
      const button = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".oneknob");
      expect(button()?.getAttribute("aria-pressed"), `${block} starts off`).toBe("false");
      // Off, the button stands in the row by itself; on, the panel draws it again.
      button()?.click();
      await flush();
      expect(shell.ctx.store.bool(`ch.ch1.${block}.oneKnob.on`, false), `${block} turns the setting on`).toBe(true);
      await shell.ctx.store.set(`ch.ch1.${block}.oneKnob.on`, false);
      await flush();
      await shell.ctx.store.set(`ch.ch1.${block}.oneKnob.on`, true);
      await flush();
      expect(button()?.getAttribute("aria-pressed"), `${block} follows the setting`).toBe("true");
      button()?.click();
      await flush();
      expect(shell.ctx.store.bool(`ch.ch1.${block}.oneKnob.on`, true), `${block} turns the setting off`).toBe(false);
    }
  });

  it("narrows the channel box, which the channel view leaves wide", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".ch-chip")?.classList.contains("is-narrow"), "the channel view keeps it wide").toBe(false);

    const sub = await open("ch.comp");
    expect(sub.root.querySelector(".ch-chip")?.classList.contains("is-narrow")).toBe(true);
    const wide = px(declarations(CSS, ".ch-chip")["width"]);
    expect(px(declarations(CSS, ".ch-chip.is-narrow")["width"])).toBeLessThan(wide);
  });

  it("carries the short name of a strip whose own name is too long for the narrow box", async () => {
    // The wide chip spells STREAMING in full and the narrow chip carries its
    // short name, each with the channel in view.
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    await flush();
    expect(shell.root.querySelector(".ch-chip-id")?.textContent, "the wide chip spells it").toBe("STREAMING L");

    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    expect(shell.root.querySelector(".ch-chip-id")?.textContent, "the narrow one abbreviates").toBe("STR L");
  });

  it("prints the millisecond mark in the value box the bar spells out", async () => {
    const shell = await open("ch.comp");
    const box = [...shell.root.querySelectorAll<HTMLElement>(".dyn-set .value-box")];
    expect(box.map((b) => b.textContent)).toEqual(["34.58m", "218.0m"]);
    const cells = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell-value")].map((c) => c.textContent);
    expect(cells, "the bar has room for the whole unit").toContain("34.58ms");
  });

  it("prints a dynamics threshold in whole dB", async () => {
    for (const id of ["ch.comp", "ch.gate"]) {
      const shell = await open(id);
      const cell = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find(
        (c) => c.querySelector(".knob-cell-label")?.textContent === "Threshold",
      );
      expect(cell?.querySelector(".knob-cell-value")?.textContent, `${id} threshold`).toMatch(/^-?\d+dB$/);
    }
  });
});

describe("the readout bar with more parameters than divisions", () => {
  const openComp = async (): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    return shell;
  };

  it("shows four of them and a step to the rest", async () => {
    const shell = await openComp();
    const labels = (): (string | null)[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell-label")].map((n) => n.textContent);
    expect(labels()).toEqual(["Threshold", "Ratio", "Gain", "Attack"]);
    expect(shell.root.querySelector(".knob-page-prev"), "the first page has nothing before it").toBeNull();

    const next = shell.root.querySelector<HTMLElement>(".knob-page-next");
    expect(next, "and a step to the page after it").not.toBeNull();
    next?.click();
    await flush();
    expect(labels()[0]).toBe("Release");
    expect(shell.root.querySelector(".knob-page-next"), "the last page has nothing after it").toBeNull();
    expect(shell.root.querySelector(".knob-page-prev"), "only the step back").not.toBeNull();
  });

  it("draws no step where four divisions hold everything", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.ducker", strip: "ch1" });
    await flush();
    expect(shell.root.querySelectorAll(".knob-cell").length).toBe(4);
    expect(shell.root.querySelector(".knob-page-next")).toBeNull();
  });

  it("goes back to the first page when the screen changes", async () => {
    const shell = await openComp();
    shell.root.querySelector<HTMLElement>(".knob-page-next")?.click();
    await flush();
    shell.ctx.nav.back();
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    expect([...shell.root.querySelectorAll<HTMLElement>(".knob-cell-label")][0]?.textContent).toBe("Threshold");
  });
});

describe("the channel the dedicated screens show", () => {
  it("steps one channel at a time, a two-channel strip through both of its channels", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const seen: string[] = [];
    for (let i = 0; i < 25; i++) {
      seen.push(shell.root.querySelector(".ch-chip-id")?.textContent ?? "");
      shell.root.querySelector<HTMLElement>('.ch-arrow[aria-label="Next channel"]')?.click();
      await flush();
    }
    expect(seen).toEqual([
      ...Array.from({ length: 12 }, (_, i) => `CH ${i + 1}`),
      "FX 1 L", "FX 1 R", "FX 2 L", "FX 2 R", "MIX 1 L", "MIX 1 R", "MIX 2 L", "MIX 2 R",
      "STEREO L", "STEREO R", "STREAMING L", "STREAMING R", "CH 1",
    ]);
  });

  it("shortens STEREO and STREAMING in the narrow box", () => {
    const unit = unitById("URX44V");
    const find = (id: string) => {
      const strip = [...unit.inputs, ...unit.outputs].find((s) => s.id === id);
      if (!strip) throw new Error(id);
      return strip;
    };
    expect([
      channelLabel(find("bus.stereo"), 1, true),
      channelLabel(find("bus.stereo"), 1, false),
      channelLabel(find("bus.stream"), 0, true),
      channelLabel(find("bus.mix2"), 1, true),
      channelLabel(find("fx1"), 0, true),
      channelLabel(find("ch_5_6"), 1, true),
      channelLabel(find("ch1"), 0, true),
    ]).toEqual(["ST R", "STEREO R", "STR L", "MIX 2 R", "FX 1 L", "CH 6", "CH 1"]);
  });

  it("lets a stereo input's name area pick the channel its screens open on, leaving the selection alone", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.bank", 1);
    shell.ctx.repaint();
    await flush();
    const name = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".strip-name")].find((n) => n.querySelector(".strip-id")?.textContent === "CH 5/6");
    expect(name()?.querySelector(".strip-id .is-other")?.textContent, "CH 5 first, CH 6 in the dark ink").toBe("6");
    expect(declarations(CSS, ".strip-id .is-other")["color"]).toBe("var(--strip-id-other)");
    expect(declarations(TOKENS, ":root")["--strip-id-other"]).toBe("#000000");
    const selected = shell.ctx.store.str("ui.selectedStrip", "");
    name()?.click();
    await flush();
    expect(name()?.querySelector(".strip-id .is-other")?.textContent, "a tap swaps the channel").toBe("5");
    expect(shell.ctx.store.str("ui.selectedStrip", ""), "the selection stays").toBe(selected);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_5_6" });
    await flush();
    expect(shell.root.querySelector(".ch-chip-id")?.textContent, "the screens open on CH 6").toBe("CH 6");
    const gain = shell.root.querySelector<HTMLElement>(".cv-gain .meter");
    expect([gain?.dataset["meterLane"], gain?.querySelectorAll(".meter-bar").length], "its gain meter shows CH 6 alone").toEqual(["1", 1]);
  });

  it("opens a bus from HOME on its L channel", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.bankSide", "output");
    await shell.ctx.store.set("ui.bank", 0);
    await shell.ctx.store.set("ui.selectedStrip", "bus.mix1");
    await shell.ctx.store.set("ui.lane.bus.mix1", 1);
    shell.ctx.repaint();
    await flush();
    shell.root.querySelector<HTMLElement>('[aria-label="MIX 1 settings"]')?.click();
    await flush();
    expect(shell.root.querySelector(".ch-chip-id")?.textContent).toBe("MIX 1 L");
  });
});

describe("EQ's shape list and Operation Mode's previews", () => {
  it("offers each EQ band the shapes it can take, as outlines stacked in the list", async () => {
    const shell = await mount();
    const shapesOf = async (band: string): Promise<string[] | null> => {
      await shell.ctx.store.set("ui.eqBand", band);
      shell.ctx.nav.home();
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
      await flush();
      const box = shell.root.querySelector<HTMLElement>(".eq-screen > .pulldown");
      if (box?.classList.contains("is-fixed")) return null;
      box?.click();
      await flush();
      const options = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option.eq-shape-option")];
      expect(options.every((o) => o.querySelector("svg.icon-eq-shape") !== null), `${band} draws outlines`).toBe(true);
      return options.map((o) => o.getAttribute("aria-label") ?? "");
    };
    expect(await shapesOf("low")).toEqual(["Bell", "L.Shelf", "HPF"]);
    expect(await shapesOf("high")).toEqual(["Bell", "H.Shelf", "LPF"]);
    expect(await shapesOf("lowMid"), "a mid band keeps its bell").toBeNull();
    const fixed = shell.root.querySelector(".eq-screen > .pulldown.is-fixed");
    expect([fixed?.getAttribute("aria-disabled"), fixed?.querySelector(".pulldown-mark") !== null], "its box stays, mark and all, out of use").toEqual(["true", true]);
    expect(declarations(CSS, ".eq-screen > .pulldown.is-fixed")["opacity"], "at half its brightness").toBe("0.5");
    expect(CSS, "the mark is not hidden").not.toMatch(/\.pulldown\.is-fixed \.pulldown-mark\s*\{\s*visibility: hidden/);
    const option = declarations(CSS, ".btn.dropdown-option.eq-shape-option");
    expect([px(option["width"]), px(option["height"])], "the size of the shape box").toEqual([94, 38]);
  });

  it("switches the held EQ band on and off from the band box, the curve leaving a band that is off and its grip hollow", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.eqBand", "high");
    await shell.ctx.store.set("ch.ch1.eq.high.gain", 12);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".eq-screen > .eq-band");
    const curve = (): string => shell.root.querySelector(".eq-curve-line")?.getAttribute("points") ?? "";
    const flat = curve().split(" ").every((p) => p.endsWith(",68.0"));
    const seen = [[box()?.textContent, box()?.classList.contains("is-off"), box()?.getAttribute("aria-pressed"), flat]];
    box()?.click();
    await flush();
    seen.push([box()?.textContent, box()?.classList.contains("is-off"), box()?.getAttribute("aria-pressed"), curve().split(" ").every((p) => p.endsWith(",68.0"))]);
    const grip = (label: string): Element | null => shell.root.querySelector(`.eq-grip[aria-label="${label} band"]`);
    expect([grip("HIGH")?.classList.contains("is-off"), grip("LOW")?.classList.contains("is-off")], "the band's grip hollow, the others as they were").toEqual([true, false]);
    box()?.click();
    await flush();
    seen.push([box()?.textContent, box()?.classList.contains("is-off"), shell.ctx.store.bool("ch.ch1.eq.high.on", false), false]);
    expect(seen, "on with its boost, off and flat, on again").toEqual([
      ["HIGH", false, "true", false],
      ["HIGH", true, "false", true],
      ["HIGH", false, true, false],
    ]);
    await shell.ctx.store.set("ch.ch1.eq.low.on", false);
    await shell.ctx.store.set("ch.ch1.eq.oneKnob.on", true);
    await flush();
    expect([box(), shell.root.querySelectorAll(".eq-grip.is-fixed").length, shell.root.querySelector(".eq-plot")?.classList.contains("is-oneknob")], "1-knob takes the box away and marks the plot").toEqual([null, 4, true]);
    const off = declarations(CSS, ".eq-screen > .eq-band.is-off");
    expect([off["background"], off["color"]], "the pale face of a strip's unlit [ON]").toEqual(["var(--accent-cue)", "var(--text-inverse)"]);
    // The box is on the switch's list, which draws its band from --pb-band.
    expect(declarations(CSS, ".lcd .eq-screen > .eq-band.is-off")["--pb-band"]).toBe("var(--switch-band)");
    const hollow = declarations(CSS, ".eq-grip.is-off");
    expect([hollow["background"], hollow["color"], declarations(CSS, ".eq-grip.is-off.is-held")["color"]], "a grip on the graph's own ground, named in its ring's colour").toEqual([
      "var(--graph-bg)",
      "var(--handle-ring)",
      "var(--accent-focus)",
    ]);
  });

  it("names the knobs of the middle bands L-MID and H-MID, as the band box does", async () => {
    const shell = await mount();
    const labels = async (band: string): Promise<string[]> => {
      await shell.ctx.store.set("ui.eqBand", band);
      shell.ctx.nav.openTop({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
      await flush();
      return [...shell.root.querySelectorAll(".knob-cell-label")].map((l) => l.textContent ?? "").filter(Boolean);
    };
    expect(await labels("lowMid")).toEqual(["L-MID Q", "L-MID Freq.", "L-MID Gain"]);
    expect(await labels("highMid")).toEqual(["H-MID Q", "H-MID Freq.", "H-MID Gain"]);
    expect(await labels("high")).toEqual(["HIGH Q", "HIGH Freq.", "HIGH Gain"]);
  });

  it("leaves a band switched off out of the channel view's EQ thumbnail", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.eq.low.gain", 12);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const first = (): string => shell.root.querySelector(".eq-thumb .eq-thumb-edge")?.getAttribute("points")?.split(" ")[0] ?? "";
    const boosted = first();
    await shell.ctx.store.set("ch.ch1.eq.low.on", false);
    await flush();
    expect([boosted, first()]).toEqual(["0.0,9.7", "0.0,21.0"]);
  });

  it("previews Standard Mode with a still of HOME and leaves Simple Mode's frame empty", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    const subscribe = store.onChange.bind(store);
    let released = 0;
    vi.spyOn(store, "onChange").mockImplementation((listener) => {
      const off = subscribe(listener);
      return () => {
        released++;
        off();
      };
    });
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.mode" });
    await flush();
    const standard = shell.root.querySelector(".mode-preview-standard");
    expect(standard?.querySelectorAll(".strip").length, "HOME's strips").toBe(4);
    expect(standard?.querySelector("[id]"), "no ids copied").toBeNull();
    expect(standard?.firstElementChild?.hasAttribute("inert"), "no stop for the Tab key in the still").toBe(true);
    expect(shell.root.querySelector(".mode-preview-simple")?.children.length, "Simple's frame stays empty").toBe(0);
    expect(released, "the shell drawn for it lets the store go").toBeGreaterThan(0);
    expect(declarations(CSS, ".mode-preview .lcd")["transform"]).toBe("scale(0.4146)");
  });
});

describe("what the dedicated channel screens draw", () => {
  const open = async (id: string): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id, strip: "ch1" });
    await flush();
    return shell;
  };

  it("gives GATE, COMP and DUCKER the same plot, reduction bar and meters", async () => {
    for (const id of ["ch.gate", "ch.comp", "ch.ducker"]) {
      const shell = await open(id);
      expect(shell.root.querySelector(".dyn-plot"), `${id} draws the plot`).not.toBeNull();
      expect(shell.root.querySelector(".dyn-gr"), `${id} draws the reduction bar`).not.toBeNull();
      expect(
        [...shell.root.querySelectorAll(".dyn-io-caption")].map((n) => n.textContent),
        `${id} meters the block in and out`,
      ).toEqual(["IN", "OUT"]);
    }
  });

  it("draws the head amp's mark by its horizontal marks: A.Gain +8 left and +55 right, D.Gain -14 left and +15 right, and A.Gain with HI-Z on by the ends of its range", async () => {
    const shell = await mount();
    const turn = async (strip: string, gain: number): Promise<string | undefined> => {
      await shell.ctx.store.set(`ch.${strip}.gain`, gain);
      shell.ctx.nav.openTop({ id: "channel-view", strip });
      await flush();
      return shell.root.querySelector<HTMLElement>(".cv-gain-stack .knob-pointer")?.style.transform;
    };
    expect(await turn("ch1", 8), "A.Gain +8").toBe("rotate(270deg)");
    expect(await turn("ch1", 55), "A.Gain +55").toBe("rotate(450deg)");
    // CH 9/10 ships on USB MAIN B, whose digital gain it shows.
    const turnDigital = async (gain: number): Promise<string | undefined> => {
      await shell.ctx.store.set("source.usb-main-b.digitalGain", gain);
      shell.ctx.nav.openTop({ id: "channel-view", strip: "ch_9_10" });
      await flush();
      return shell.root.querySelector<HTMLElement>(".cv-gain-stack .knob-pointer")?.style.transform;
    };
    expect(await turnDigital(-14), "D.Gain -14").toBe("rotate(270deg)");
    expect(await turnDigital(15), "D.Gain +15").toBe("rotate(450deg)");
    // With HI-Z on, the travel runs from -8 at its start to +40 at its end.
    await shell.ctx.store.set("ch.ch3.hiZ", true);
    expect(await turn("ch3", -8), "A.Gain -8 with HI-Z on").toBe("rotate(210deg)");
    expect(await turn("ch3", 16), "A.Gain +16 with HI-Z on").toBe("rotate(360deg)");
    expect(await turn("ch3", 40), "A.Gain +40 with HI-Z on").toBe("rotate(510deg)");
  });

  it("draws the oscillator level's mark by its marks: -50 dB left, -8 dB right", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "monitor" });
    shell.ctx.nav.push({ id: "monitor.osc" });
    const turns = async (db: number): Promise<string[]> => {
      await shell.ctx.store.set("osc.level", db);
      await flush();
      return [...shell.root.querySelectorAll<HTMLElement>(".knob-pointer")].map((p) => p.style.transform);
    };
    expect(await turns(-50)).toContain("rotate(270deg)");
    expect(await turns(-8)).toContain("rotate(450deg)");
  });

  it("turns the delay time's four rotaries through 270 degrees, 1 ms at the start", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    const turns = [...shell.root.querySelectorAll<HTMLElement>(".delay-cell .knob-pointer")].map((p) => p.style.transform);
    expect(turns).toEqual(["rotate(225deg)", "rotate(225deg)", "rotate(225deg)", "rotate(225deg)"]);
  });

  it("rounds COMP's corner by the Knee setting, lowering the T handle under the hard corner", async () => {
    const heldAt = async (knee: string): Promise<number> => {
      const shell = await mount();
      const state: Record<string, number | string> = { "ch.ch1.comp.threshold": -33, "ch.ch1.comp.ratio": 3, "ch.ch1.comp.gain": 18, "ch.ch1.comp.knee": knee };
      for (const [path, value] of Object.entries(state)) await shell.ctx.store.set(path, value);
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
      await flush();
      const handle = [...shell.root.querySelectorAll(".dyn-handle")].find((g) => g.querySelector("text")?.textContent === "T");
      return Number(handle?.querySelector("circle")?.getAttribute("cy"));
    };
    const hard = await heldAt("Hard");
    const medium = await heldAt("Medium");
    const soft = await heldAt("Soft");
    // The hard corner stands at -33 + 18 = -15 dB on the 171-row axis spanning 100 dB.
    expect(hard).toBeCloseTo(171 - (65 / 100) * 171, 0);
    expect(medium - hard, "a 16 dB knee takes a little over 2 rows off the corner").toBeGreaterThan(2);
    expect(medium - hard).toBeLessThan(3);
    expect(soft - hard, "a 52 dB knee takes more").toBeGreaterThan(6);
  });

  it("steps COMP's ratio to INF, writing a place where the SSMCS strip writes three figures", async () => {
    // The stops the unit's COMP knob takes and how it writes them (URX44V, 2026-09-23):
    // the SSMCS strip's ratios, each with a decimal place from 100:1 up too.
    const shell = await open("ch.comp");
    const cell = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find((c) => c.querySelector(".knob-cell-label")?.textContent === "Ratio");
    const reading = (): string => cell()?.querySelector(".knob-cell-value")?.textContent ?? "";
    const up = async (): Promise<void> => {
      cell()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await flush();
    };
    await shell.ctx.store.set("ch.ch1.comp.ratio", 38);
    await flush();
    const top = [reading()];
    for (let i = 0; i < 15; i++) {
      await up();
      top.push(reading());
    }
    expect(top).toEqual([
      "38.0:1", "40.0:1", "45.0:1", "50.0:1", "55.0:1", "60.0:1", "65.0:1", "70.0:1", "80.0:1", "90.0:1",
      "100.0:1", "150.0:1", "200.0:1", "300.0:1", "500.0:1", "INF:1",
    ]);
    expect(shell.ctx.store.num("ch.ch1.comp.ratio", 0)).toBe(Number.POSITIVE_INFINITY);

    await shell.ctx.store.set("ch.ch1.comp.ratio", 1);
    await flush();
    const low = [reading()];
    for (let i = 0; i < 60; i++) {
      await up();
      low.push(reading());
    }
    expect([low[0], low[1], low[59], low[60]], "and sixty stops of 0.05 from the bottom").toEqual([
      "1.00:1", "1.05:1", "3.95:1", "4.00:1",
    ]);
  });

  it("stacks one setting on DUCKER, two on COMP and three on GATE", async () => {
    const count = async (id: string): Promise<string[]> =>
      [...(await open(id)).root.querySelectorAll<HTMLElement>(".dyn-set-caption")].map((n) => n.textContent ?? "");
    expect(await count("ch.ducker")).toEqual(["Threshold"]);
    expect(await count("ch.comp")).toEqual(["Attack", "Release"]);
    expect(await count("ch.gate")).toEqual(["Attack", "Hold", "Decay"]);
  });

  it("prints a ducking decay past a second in seconds, and the shorter times in ms", async () => {
    const shell = await open("ch.ducker");
    await shell.ctx.store.set("ch.ch1.ducker.decay", 4800);
    await flush();
    const cells = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")];
    const read = (label: string): string | undefined =>
      cells.find((c) => c.querySelector(".knob-cell-label")?.textContent === label)
        ?.querySelector(".knob-cell-value")?.textContent ?? undefined;
    expect(read("Decay")).toBe("4.8s");
    expect(read("Attack")).toBe("20.17ms");
  });

  it("names one delay time in four units, all turning the same value", async () => {
    const shell = await open("ch.delay");
    expect([...shell.root.querySelectorAll<HTMLElement>(".delay-cell-caption")].map((n) => n.textContent)).toEqual([
      "ms",
      "frame",
      "meter",
      "feet",
    ]);
    const boxes = (): (string | null)[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".delay-cell .value-box")].map((n) => n.textContent);
    expect(boxes()).toEqual(["1.00", "0.03", "0.3", "1.1"]);
    await shell.ctx.store.set("ch.ch1.delay.ms", 10);
    await flush();
    expect(boxes(), "one value, four ways of naming it").toEqual(["10.00", "0.30", "3.4", "11.3"]);
  });

  it("picks the EQ band from the grips on the plot", async () => {
    const shell = await open("ch.eq");
    expect(shell.root.querySelector(".eq-band")?.textContent).toBe("LOW");
    const grips = [...shell.root.querySelectorAll<HTMLElement>(".eq-grip")];
    expect(grips.map((g) => g.getAttribute("aria-label"))).toEqual([
      "LOW band",
      "LOW MID band",
      "HIGH MID band",
      "HIGH band",
    ]);
    grips[3]?.click();
    await flush();
    expect(shell.root.querySelector(".eq-band")?.textContent).toBe("HIGH");
    expect(shell.root.querySelector(".eq-grip.is-held")?.getAttribute("aria-label")).toBe("HIGH band");
  });

  it("gives +48V and the phase switch the classes their lit colours hang on", async () => {
    const shell = await open("ch.input");
    const flags = [...shell.root.querySelectorAll<HTMLElement>(".input-flag")];
    const named = (cls: string): HTMLElement | undefined => flags.find((f) => f.classList.contains(cls));
    expect(named("is-phantom")?.textContent).toBe("+48V");
    expect(named("is-phase")?.getAttribute("aria-label")).toBe("Φ");
    // Drawn as the mark HOME draws, a bar running through a ring and out of it, not as a letter.
    expect(named("is-phase")?.querySelector("svg")?.getAttribute("class")).toBe("icon-phase");
    expect(named("is-phase")?.textContent).toBe("");
    expect(
      flags.filter((f) => f.classList.contains("is-phantom") || f.classList.contains("is-phase")).length,
      "no other button claims one of those colours",
    ).toBe(2);
  });

  it("steps to the same screen on the next channel, never to another one", async () => {
    // The arrows carry the screen with them: the only thing they change is which
    // channel it is drawn for.
    for (const id of ["ch.input", "ch.setting"]) {
      const shell = await mount();
      // STREAMING R is the last channel in the list.
      await shell.ctx.store.set("ui.lane.bus.stream", 1);
      shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
      shell.ctx.nav.push({ id, strip: "bus.stream" });
      await flush();
      const next = [...shell.root.querySelectorAll<HTMLElement>(".ch-arrow")].at(-1);
      expect(next?.getAttribute("aria-label")).toBe("Next channel");
      next?.click();
      await flush();
      expect(shell.ctx.nav.current.id, `${id} stays on itself`).toBe(id);
      expect(shell.ctx.nav.current.strip, "and lands on the first channel").toBe("ch1");
    }
  });

  it("steps from the channel the screen is drawn for, not from whatever HOME left selected", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.selectedStrip", "ch1");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch3" });
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch3" });
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".ch-arrow")].at(-1)?.click();
    await flush();
    expect(shell.ctx.nav.current.strip).toBe("ch4");
  });

  it("does not open CH SETTING from the CH SETTING screen", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
    await flush();
    const depth = shell.ctx.nav.depth;
    shell.root.querySelector<HTMLElement>(".ch-chip")?.click();
    await flush();
    expect(shell.ctx.nav.depth, "the name has nothing left to open").toBe(depth);

    shell.ctx.nav.replace({ id: "ch.input", strip: "ch1" });
    await flush();
    shell.root.querySelector<HTMLElement>(".ch-chip")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "from anywhere else it still opens it").toBe("ch.setting");
  });

  it("names CH SETTING and INPUT in the wider box, and SEND TO in the narrow one", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
    await flush();
    const classes = (): string[] => [...(shell.root.querySelector<HTMLElement>(".badge-title")?.classList ?? [])];
    expect(shell.root.querySelector(".badge-title")?.textContent).toBe("CH SETTING");
    expect(classes()).toEqual(["badge", "badge-title", "badge-plain", "badge-setting"]);

    shell.ctx.nav.replace({ id: "ch.input", strip: "ch1" });
    await flush();
    expect(classes()).toEqual(["badge", "badge-title", "badge-plain", "badge-input"]);

    shell.ctx.nav.replace({ id: "ch.sendto", strip: "ch1" });
    await flush();
    expect(classes()).toEqual(["badge", "badge-title", "badge-plain"]);
  });

  it("shows on INPUT only what the strip actually carries", async () => {
    const openFor = async (strip: string): Promise<Shell> => {
      const shell = await mount();
      shell.ctx.nav.push({ id: "channel-view", strip });
      shell.ctx.nav.push({ id: "ch.input", strip });
      await flush();
      return shell;
    };
    const shown = async (strip: string): Promise<string[]> => {
      const shell = await openFor(strip);
      return [
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-flag")].map(accessibleName),
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-col-caption")].map((n) => n.textContent ?? ""),
        ...(shell.root.querySelector(".input-source-btn") ? ["Input Source"] : []),
      ];
    };
    // A mono channel has the whole head amp; a stereo pair has no phantom power,
    // no clip guard and no filter; a bus has no head amp at all.
    expect(await shown("ch1")).toEqual(["+48V", "Clip Safe", "Auto Gain", "Φ", "HPF", "A.Gain", "HPF Freq.", "Input Source"]);
    expect(await shown("ch_5_6")).toEqual(["Φ", "D.Gain", "Input Source"]);
    expect(await shown("bus.stereo")).toEqual([]);
    expect(await shown("bus.stream"), "STREAMING keeps what it is fed from").toEqual(["Input Source"]);

    // The two panels and the level going in are drawn for every one of them.
    for (const strip of ["ch1", "ch_5_6", "bus.stereo", "bus.stream"]) {
      const shell = await openFor(strip);
      expect(
        [...shell.root.querySelectorAll(".input-meter")].map((n) => n.className),
        `${strip} meters what arrives`,
      ).toEqual(["input-meter input-meter-a", "input-meter input-meter-b"]);
      expect(shell.root.querySelectorAll(".input-panel").length, `${strip} keeps both panels`).toBe(2);
    }
  });

  it("drops the analog head amp's buttons while a mono channel is off its MIC/LINE connector", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch3" });
    await flush();
    const onInput = async (): Promise<string[]> => {
      shell.ctx.nav.push({ id: "ch.input", strip: "ch3" });
      await flush();
      const shown = [
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-flag")].map(accessibleName),
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-col-caption")].map((n) => n.textContent ?? ""),
      ];
      shell.ctx.nav.back();
      await flush();
      return shown;
    };
    const marks = (): string[] => [...shell.root.querySelectorAll<HTMLElement>(".cv-gain-flags > *")].map(accessibleName);

    // CH 3 is on MIC/LINE 3, a connector that takes HI-Z.
    expect(await onInput()).toEqual(["+48V", "HI-Z", "Clip Safe", "Auto Gain", "Φ", "HPF", "A.Gain", "HPF Freq."]);
    expect(marks()).toEqual(["+48V", "Φ", "HPF", "HI-Z"]);

    await shell.ctx.store.set("ch.ch3.source", "USB DAW 3/4");
    expect(await onInput(), "the digital gain, and what does not belong to the head amp").toEqual(["Φ", "HPF", "D.Gain", "HPF Freq."]);
    expect(marks(), "the two cells keep their places, empty").toEqual(["", "Φ", "HPF", ""]);

    await shell.ctx.store.set("ch.ch3.source", "MIC/LINE 3/4");
    expect(await onInput(), "back on the connector, all of it again").toEqual(["+48V", "HI-Z", "Clip Safe", "Auto Gain", "Φ", "HPF", "A.Gain", "HPF Freq."]);
  });

  it("prints an INPUT frequency without its unit in the box and with it in the bar", async () => {
    const shell = await open("ch.input");
    const box = [...shell.root.querySelectorAll<HTMLElement>(".input-col .value-box")].at(-1);
    expect(box?.textContent).toBe("80.0");
    const cells = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")];
    expect(
      cells.find((c) => c.querySelector(".knob-cell-label")?.textContent === "HPF Freq.")
        ?.querySelector(".knob-cell-value")?.textContent,
    ).toBe("80.0Hz");
  });
});

describe("the grips on a dedicated screen's graph", () => {
  // User guide, "GATE screen", "COMP screen", "DUCKER screen" and "EQ screen":
  // the values are set by working the graph directly.
  const open = async (id: string): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id, strip: "ch1" });
    await flush();
    return shell;
  };
  const drag = async (shell: Shell, selector: string, dx: number, dy: number): Promise<void> => {
    const node = shell.root.querySelector(selector);
    expect(node, selector).not.toBeNull();
    node?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
    await flush();
  };
  /** Which way each value moved: 1 up, -1 down, 0 not at all. */
  const moved = async (shell: Shell, selector: string, dx: number, dy: number, paths: string[]): Promise<number[]> => {
    const before = paths.map((p) => shell.ctx.store.num(p, 0));
    await drag(shell, selector, dx, dy);
    return paths.map((p, i) => Math.sign(shell.ctx.store.num(p, 0) - (before[i] ?? 0)));
  };

  it("moves each dynamics grip's value the way the grip stands on the graph", async () => {
    const gate = await open("ch.gate");
    expect(await moved(gate, '[aria-label^="T handle"]', 40, 0, ["ch.ch1.gate.threshold"]), "GATE T right").toEqual([1]);
    expect(await moved(gate, '[aria-label^="R handle"]', 0, -20, ["ch.ch1.gate.range"]), "GATE R up").toEqual([1]);

    const comp = await open("ch.comp");
    expect(await moved(comp, '[aria-label^="T handle"]', -40, 0, ["ch.ch1.comp.threshold"]), "COMP T left").toEqual([-1]);
    expect(await moved(comp, '[aria-label^="G handle"]', 0, -20, ["ch.ch1.comp.gain"]), "COMP G up").toEqual([1]);
    // R stands on the curve's far end, which a higher ratio takes down.
    expect(await moved(comp, '[aria-label^="R handle"]', 0, 20, ["ch.ch1.comp.ratio"]), "COMP R down").toEqual([1]);

    const ducker = await open("ch.ducker");
    // The factory state leaves these to the screen's own fallbacks, which the store does not hold.
    await ducker.ctx.store.set("ch.ch1.ducker.range", -24);
    await ducker.ctx.store.set("ch.ch1.ducker.attack", 20.17);
    await ducker.ctx.store.set("ch.ch1.ducker.decay", 1000);
    await flush();
    expect(await moved(ducker, '[aria-label^="R handle"]', 0, -20, ["ch.ch1.ducker.range"]), "DUCKER R up").toEqual([1]);
    expect(await moved(ducker, '[aria-label^="A handle"]', 40, 0, ["ch.ch1.ducker.attack"]), "DUCKER A right").toEqual([1]);
    expect(await moved(ducker, '[aria-label^="D handle"]', 40, 0, ["ch.ch1.ducker.decay"]), "DUCKER D right").toEqual([1]);
  });

  it("leaves COMP's grips still while 1-knob holds the values, and G while Auto Makeup holds the gain", async () => {
    const comp = await open("ch.comp");
    await comp.ctx.store.set("ch.ch1.comp.autoMakeup", true);
    await flush();
    expect(await moved(comp, '[aria-label^="G handle"]', 0, -20, ["ch.ch1.comp.gain"])).toEqual([0]);
    await comp.ctx.store.set("ch.ch1.comp.oneKnob.on", true);
    await flush();
    expect(await moved(comp, '[aria-label^="T handle"]', 40, 0, ["ch.ch1.comp.threshold"])).toEqual([0]);
    expect(await moved(comp, '[aria-label^="R handle"]', 0, 20, ["ch.ch1.comp.ratio"])).toEqual([0]);
  });

  it("sets a band's frequency along the EQ graph and its gain up it, and picks the band", async () => {
    const eq = await open("ch.eq");
    const grip = (label: string): string => `.eq-grip[aria-label="${label} band"]`;
    expect(eq.ctx.store.str("ui.eqBand", "low")).toBe("low");
    expect(
      await moved(eq, grip("HIGH"), -40, -20, ["ch.ch1.eq.high.freq", "ch.ch1.eq.high.gain", "ch.ch1.eq.low.freq", "ch.ch1.eq.low.gain"]),
      "the band dragged, not the one held before",
    ).toEqual([-1, 1, 0, 0]);
    expect(eq.ctx.store.str("ui.eqBand", ""), "and the drag picks it").toBe("high");

    // While 1-knob turns EQ the grips are marks that pick nothing.
    await eq.ctx.store.set("ch.ch1.eq.oneKnob.on", true);
    await flush();
    expect(eq.root.querySelector(".eq-grip:not(.is-fixed)")).toBeNull();
  });
});

describe("the MONITOR Level cards", () => {
  const open = async (): Promise<Shell> => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "monitor" });
    shell.ctx.nav.push({ id: "monitor.level" });
    await flush();
    return shell;
  };

  it("carries the switch every other ON on the glass is", async () => {
    const shell = await open();
    const on = [...shell.root.querySelectorAll(".mon-strip .btn")].filter((b) => b.textContent === "ON");
    expect(on).toHaveLength(2);
    for (const b of on) expect(b.classList.contains("btn-switch"), "the shared 40px switch").toBe(true);
  });

  it("keeps each bus meter moving, and silent while the bus is off", async () => {
    // The ticker only writes into a meter that names its source, so a meter
    // without one stands still however the level moves. Only the ticker's clock
    // is faked; the screen still settles on real timers.
    const shell = await open();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      const meters = [...shell.root.querySelectorAll<HTMLElement>(".mon-meter [data-meter-source]")];
      expect(meters.map((m) => m.dataset["meterSource"])).toEqual(["monitor.1", "monitor.2"]);
      const heights = (): string[] =>
        [...shell.root.querySelectorAll<HTMLElement>(".mon-meter .meter-bar")].map((b) => b.style.getPropertyValue("--unlit"));
      const stop = startMeterTicker(shell.ctx.store, shell.root, 50);
      vi.advanceTimersByTime(60);
      const first = heights();
      vi.setSystemTime(Date.now() + 700);
      vi.advanceTimersByTime(60);
      expect(heights(), "the bars move").not.toEqual(first);
      await shell.ctx.store.set("monitor.1.on", false);
      vi.advanceTimersByTime(60);
      expect(heights().slice(0, 2), "bus 1 off reads the floor").toEqual(["100%", "100%"]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns the level with the same rotary and value box the channel screens use", async () => {
    const shell = await open();
    const row = shell.root.querySelector(".mon-strip .mon-level");
    expect(row?.querySelector(".knob-graphic.is-control"), "a rotary that turns").not.toBeNull();
    expect(row?.querySelector(".value-box[role='spinbutton']"), "a value box that takes the knob").not.toBeNull();
  });
});

describe("the MONITOR Setting toggles", () => {
  it("draws CUE Interrupt and MONO as one kind of toggle, lit or pale", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "monitor" });
    shell.ctx.nav.push({ id: "monitor.level" });
    await shell.ctx.store.set("ui.monitorTab", "Setting");
    await shell.ctx.store.set("monitor.1.cueInterrupt", true);
    await shell.ctx.store.set("monitor.2.cueInterrupt", false);
    await shell.ctx.store.set("monitor.1.mono", false);
    await shell.ctx.store.set("monitor.2.mono", true);
    await flush();
    const cue = [...shell.root.querySelectorAll<HTMLElement>(".mon-cue")];
    const mono = [...shell.root.querySelectorAll<HTMLElement>(".mon-mono")];
    expect([cue.length, mono.length]).toEqual([2, 2]);
    for (const b of [...cue, ...mono]) expect(b.classList.contains("mon-btn"), (b.textContent ?? "").replace("\n", " ")).toBe(true);
    expect(cue.map((b) => b.classList.contains("is-on")), "the off one takes the pale face").toEqual([true, false]);
    expect(mono.map((b) => b.classList.contains("is-on")), "and MONO follows its own bus").toEqual([false, true]);
  });
});

describe("the LCD", () => {
  it("carries the filter its sheets and dialogs darken the screen with", async () => {
    const shell = await mount();
    expect(shell.root.querySelector("filter#lcd-scrim")?.closest(".lcd")).toBe(shell.root);
  });
});

describe("a carded list's scroll bar", () => {
  it("stands straight after the list that holds the scroll host", async () => {
    for (const id of ["scene.list", "microsd.saveload"]) {
      const shell = await mount();
      shell.ctx.nav.push({ id });
      await flush();
      const bar = shell.root.querySelector<HTMLElement>(".scrollbar");
      expect(bar?.previousElementSibling?.classList.contains("list-view"), id).toBe(true);
      expect(bar?.previousElementSibling?.querySelector(".scroll-host"), id).not.toBeNull();
    }
  });
});

describe("screens laid out from the guide's figures", () => {
  it("heads OUTPUT PATCH, Peripheral, POWER MANAGEMENT, SOFTWARE INTEGRATION and DELAY with the one section band", async () => {
    const shell = await mount();
    const band = async (id: string, strip?: string): Promise<string[]> => {
      shell.ctx.nav.openTop(strip ? { id: "channel-view", strip } : { id: "setup" });
      shell.ctx.nav.push(strip ? { id, strip } : { id });
      await flush();
      return [...shell.root.querySelectorAll(".section-band")].map((b) => b.textContent ?? "");
    };
    expect(await band("setup.patch")).toEqual(["ANALOG"]);
    expect(await band("setup.peripheral")).toEqual(["USB Main"]);
    expect(await band("setup.power")).toEqual(["Auto Power Off"]);
    expect(await band("setup.integration")).toEqual(["DAW Integration"]);
    expect(await band("ch.delay", "bus.stream")).toEqual(["Delay Time"]);
  });

  it("offers only English on LANGUAGE, and draws a knob picture under each USER DEFINED KNOBS column", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup.language" });
    await flush();
    const buttons = [...shell.root.querySelectorAll<HTMLButtonElement>(".lang-btn")];
    expect(buttons.map((b) => [b.querySelector(".lang-bottom")?.textContent, b.disabled, b.classList.contains("is-disabled")])).toEqual([
      ["Japanese", true, true],
      ["English", false, false],
      ["Chinese, Simplified", true, true],
    ]);
    buttons[0]?.click();
    buttons[2]?.click();
    await flush();
    expect(shell.ctx.store.str("setup.language", "English")).toBe("English");

    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.udk" });
    await flush();
    expect([...shell.root.querySelectorAll(".udk-slot")].map((s) => s.querySelectorAll(".udk-dial").length)).toEqual([1, 1, 1, 1]);
  });

  it("opens EQ holding the band picked last on any channel, LOW at first, and names the mid bands L-MID and H-MID", async () => {
    const shell = await mount();
    const eq = async (strip: string): Promise<void> => {
      shell.ctx.nav.openTop({ id: "channel-view", strip });
      shell.ctx.nav.push({ id: "ch.eq", strip });
      await flush();
    };
    const held = (): string[] => [...shell.root.querySelectorAll(".eq-grip.is-held")].map((g) => g.textContent ?? "");
    const box = (): string => shell.root.querySelector(".eq-band")?.textContent ?? "";
    await eq("ch1");
    expect([held(), box()], "LOW at first").toEqual([["L"], "LOW"]);
    shell.root.querySelectorAll<HTMLElement>(".eq-grip")[2]?.click();
    await flush();
    expect([held(), box()]).toEqual([["HM"], "H-MID"]);
    await eq("ch2");
    expect([held(), box()], "another channel's EQ holds the same band").toEqual([["HM"], "H-MID"]);
    shell.root.querySelectorAll<HTMLElement>(".eq-grip")[1]?.click();
    await flush();
    await eq("ch1");
    expect([held(), box()], "and back on the first channel too").toEqual([["LM"], "L-MID"]);
    expect([...shell.root.querySelectorAll(".eq-grip")].map((g) => g.classList.contains("is-updown")), "the mid bands mark up and down").toEqual([false, true, true, false]);

    // A knob taking the focus keeps it through the next repaint.
    const q = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find((c) => c.querySelector(".knob-cell-label")?.textContent === "L-MID Q");
    q?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    await shell.ctx.store.set("ch.ch1.eq.lowMid.gain", 3);
    await flush();
    expect([q !== undefined, held()], "the band gives the focus up to the knob").toEqual([true, []]);
  });

  it("offers only Standard Mode, and shows the pause mark on RECORDER's middle button while a take records", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.mode" });
    await flush();
    const cards = [...shell.root.querySelectorAll<HTMLButtonElement>(".mode-card")];
    expect(cards.map((c) => [c.querySelector(".mode-card-title")?.textContent, c.disabled])).toEqual([["Simple Mode", true], ["Standard Mode", false]]);
    cards[0]?.click();
    await flush();
    expect(shell.ctx.store.str("setup.operationMode", "Standard")).toBe("Standard");

    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();
    const button = (cls: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.rec-transport .${cls}`);
    const state = (): [boolean, string, boolean, boolean] => [
      button("rec-rec")?.classList.contains("is-armed") ?? false,
      button("rec-play")?.querySelector("svg")?.getAttribute("class") ?? "",
      button("rec-play")?.classList.contains("is-paused") ?? false,
      shell.root.querySelector(".rec-meta") !== null,
    ];
    expect(state(), "as it opens").toEqual([false, "icon-transport-play", false, false]);
    button("rec-play")?.click();
    await flush();
    expect([state(), shell.ctx.store.str("sd.rec", "idle"), shell.ctx.store.bool("sd.playing", false)], "play with nothing armed does nothing").toEqual([
      [false, "icon-transport-play", false, false],
      "idle",
      false,
    ]);
    button("rec-rec")?.click();
    await flush();
    expect(state(), "record arms it, the mark blinking").toEqual([true, "icon-transport-play", false, false]);
    button("rec-play")?.click();
    await flush();
    expect(state(), "play starts the take, the mark lit steady").toEqual([false, "icon-pause", false, true]);
    button("rec-play")?.click();
    await flush();
    expect(state(), "pause holds it, its mark red").toEqual([false, "icon-pause", true, true]);
    button("rec-play")?.click();
    await flush();
    expect(state(), "and the same button goes on").toEqual([false, "icon-pause", false, true]);
    button("rec-stop")?.click();
    await flush();
    expect(state(), "stop leaves recording for the state it opened in").toEqual([false, "icon-transport-play", false, false]);
    button("rec-rec")?.click();
    await flush();
    button("rec-rec")?.click();
    await flush();
    expect([state(), shell.ctx.store.str("sd.rec", "")], "record pressed again while armed does what stop does").toEqual([
      [false, "icon-transport-play", false, false],
      "idle",
    ]);
    button("rec-rec")?.click();
    await flush();
    button("rec-play")?.click();
    await flush();
    button("rec-rec")?.click();
    await flush();
    expect(shell.ctx.store.str("sd.rec", ""), "record leaves a running take alone").toBe("recording");
  });

  it("holds the recorder's tabs, sources and Track Count in recording mode, and marks recording mode off the RECORDER screen", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();
    const q = <T extends HTMLElement>(sel: string): T | null => shell.root.querySelector<T>(sel);
    const held = (): [boolean, boolean, string] => [
      q<HTMLButtonElement>(".toolbar-left .dropdown-box")?.disabled ?? false,
      q(".toolbar-left .dropdown-box")?.classList.contains("is-disabled") ?? false,
      q(".toolbar-left .dropdown-box")?.textContent ?? "",
    ];
    expect(held(), "stopped").toEqual([false, false, "Track Count▼"]);
    q(".rec-transport .rec-rec")?.click();
    await flush();
    expect(held(), "armed: the box keeps its name, darkened").toEqual([true, true, "Track Count▼"]);
    const source = (): HTMLElement | null => q(".rec-slot-src");
    const sourceLook = source()?.className;
    source()?.click();
    await flush();
    expect([shell.root.querySelector("[data-overlay]"), source()?.className], "a source looks as it did and opens nothing").toEqual([null, sourceLook]);
    q(".rec-transport .rec-play")?.click();
    await flush();
    expect(held(), "recording").toEqual([true, true, "Track Count▼"]);
    expect(q(".rec-meta [data-rec-clock]")?.textContent, "the counter the clock keeps running").toBe("00:00:00");
    [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.textContent?.includes("Play"))?.click();
    await flush();
    expect([shell.ctx.store.str("ui.sdTab", "Record"), shell.root.querySelector("[data-overlay]"), q(".side-tab.is-on")?.textContent], "the tabs stay put").toEqual([
      "Record",
      null,
      "Record",
    ]);
    q(".sd-eject")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.mounted", false), "the card stays in").toBe(true);

    shell.ctx.nav.home();
    await flush();
    const sdIcon = (): HTMLElement | null => q('.toolbar-icons .icon-btn[aria-label^="microSD"]');
    expect([sdIcon()?.querySelector(".rec-dot") !== null, shell.ctx.store.str("sd.rec", "")], "off the screen the take goes on, HOME's microSD icon dotted").toEqual([true, "recording"]);
    sdIcon()?.click();
    await flush();
    const entry = (name: string): HTMLElement | undefined => [...shell.root.querySelectorAll<HTMLElement>(".menu-btn")].find((b) => b.textContent === name);
    expect(
      [entry("Recorder")?.querySelector(".rec-dot") !== null, entry("Save/Load")?.classList.contains("is-disabled"), entry("Tools")?.classList.contains("is-disabled"), q(".usb-storage")?.classList.contains("is-disabled"), q(".sd-eject")?.classList.contains("is-disabled")],
      "the microSD menu: Recorder dotted, the rest out of reach",
    ).toEqual([true, true, true, true, true]);
    entry("Tools")?.click();
    q(".usb-storage")?.click();
    await flush();
    expect([shell.ctx.nav.current.id, shell.root.querySelector("[data-overlay]")], "nothing but Recorder answers").toEqual(["microsd", null]);
    entry("Recorder")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("microsd.recorder");

    q(".rec-transport .rec-play")?.click();
    await flush();
    shell.ctx.nav.home();
    await flush();
    expect(sdIcon()?.querySelector(".rec-dot") !== null, "a paused take is still open").toBe(true);
    await shell.ctx.store.set("sd.rec", "armed");
    await flush();
    expect(sdIcon()?.querySelector(".rec-dot") !== null, "armed is recording mode too").toBe(true);
    await shell.ctx.store.set("sd.rec", "idle");
    await flush();
    expect(sdIcon()?.querySelector(".rec-dot"), "stopped, no dot").toBeNull();
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();
    const sourceIdle = q(".rec-slot-src");
    sourceIdle?.click();
    await flush();
    expect(shell.root.querySelector("[data-overlay]") !== null, "stopped, a source opens its list").toBe(true);
  });

  it("stands OSCILLATOR's [ON] as the switch HOME's strips use", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "monitor" });
    shell.ctx.nav.push({ id: "monitor.osc" });
    await flush();
    const on = shell.root.querySelector(".osc-on");
    expect([on?.classList.contains("btn-switch"), on?.classList.contains("btn-on")]).toEqual([true, true]);
  });

  it("sets the licence out as a heading over a rule and paragraphs, and turns Auto Power Off's Time with the fourth knob, its card's dot lit at the bottom of the range", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.license" });
    await flush();
    const text = shell.root.querySelector(".license-text");
    const paras = [...(text?.querySelectorAll(".license-para") ?? [])].map((p) => p.textContent ?? "");
    expect([text?.firstElementChild?.className, text?.firstElementChild?.textContent, paras.length > 1, paras.some((p) => p.includes("\n"))]).toEqual(["license-heading", "MIT License", true, false]);
    expect(paras[0], "a paragraph runs its lines together").toBe("Copyright (c) 2026 semnil");

    await shell.ctx.store.set("setup.power.autoPowerOffMinutes", 2);
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.power" });
    await flush();
    const cells = [...shell.root.querySelectorAll(".knob-cell")].map((c) => c.querySelector(".knob-cell-label")?.textContent ?? "");
    expect(cells.slice(0, 4), "Time on the fourth knob").toEqual(["", "", "", "Time"]);
    expect(shell.root.querySelector(".param-cell .knob-arc-fill"), "the card's knob at 2 keeps its dot").not.toBeNull();
    shell.ctx.nav.openTop({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    await shell.ctx.store.set("ch.bus.stream.delay.ms", 0);
    await flush();
    const delayKnob = shell.root.querySelector(".delay-cell .knob-graphic");
    expect(delayKnob?.querySelector(".knob-arc-fill") ?? null, "a channel screen's knob at the bottom has none").toBeNull();
  });

  it("centres the time zone's name in its box and keeps the date and the time at the two ends of theirs", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.datetime" });
    await flush();
    const boxes = [...shell.root.querySelectorAll(".dt-value")].map((b) => b.classList.contains("dt-value-single"));
    expect(boxes).toEqual([false, true]);
    const single = declarations(CSS, ".dt-screen .dt-value.dt-value-single");
    expect([single["justify-content"], single["padding"]]).toEqual(["center", "0"]);
  });

  it("carries the copy mark on the channel view's chip but not on CH SETTING's, where the Icon box previews the icon's stand-in", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".ch-chip .ch-chip-copy"), "the channel view").not.toBeNull();
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".ch-chip .ch-chip-copy"), "CH SETTING").toBeNull();
    const icon = shell.root.querySelector<HTMLElement>(".chs-icon-box .chs-icon");
    expect([icon !== null, icon?.style.background !== ""]).toEqual([true, true]);
  });

  it("lists VERSION as the unit's firmware and the simulator's own version, one to a row", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup.version" });
    await flush();
    const cells = [...shell.root.querySelectorAll<HTMLElement>(".version-entry")].map((e) => [
      e.querySelector(".version-key")?.textContent ?? "",
      e.querySelector(".version-value")?.textContent ?? "",
      /version-row-(\d)/.exec(e.className)?.[1] ?? "",
    ]);
    expect(cells).toEqual([
      ["Total Version", "V1.3.1.0", "0"],
      ["APP Version", `v${packageVersion}`, "1"],
    ]);
  });

  it("marks a menu name that fits on one line apart from one on two", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    const entry = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".menu-btn")].find((b) => b.textContent === label);
    expect(entry("Version")?.classList.contains("is-one-line")).toBe(true);
    expect(entry("User Defined\nKnobs")?.classList.contains("is-one-line")).toBe(false);
  });

  it("draws a strip's phase mark, lit while the phase is inverted", async () => {
    const shell = await mount();
    const mark = (): Element | null => shell.root.querySelector(".strip .sym-phase");
    expect(mark()?.querySelector("svg.icon-phase"), "a drawn ring and stem, not a character").not.toBeNull();
    expect(mark()?.classList.contains("is-on")).toBe(false);
    await shell.ctx.store.set("ch.ch1.phase", true);
    await flush();
    expect(mark()?.classList.contains("is-on")).toBe(true);
  });

  it("inverts the side of a stereo pair the INPUT screen has in view", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_5_6" });
    shell.ctx.nav.push({ id: "ch.input", strip: "ch_5_6" });
    await flush();
    const phase = (): HTMLButtonElement | undefined =>
      [...shell.root.querySelectorAll<HTMLButtonElement>(".input-flag")].find((b) => accessibleName(b) === "Φ");
    expect([...shell.root.querySelectorAll(".input-flag")].filter((b) => accessibleName(b) === "Φ").length).toBe(1);
    expect(phase()?.classList.contains("is-on")).toBe(false);

    phase()?.click();
    await flush();
    expect([
      shell.ctx.store.bool("ch.ch_5_6.phase.l", false),
      shell.ctx.store.bool("ch.ch_5_6.phase.r", false),
      shell.ctx.store.has("ch.ch_5_6.phase"),
    ], "the L side alone, and no control writes a path the screens do not read").toEqual([true, false, false]);

    const next = [...shell.root.querySelectorAll<HTMLButtonElement>(".ch-arrow")].find(
      (b) => b.getAttribute("aria-label") === "Next channel",
    );
    next?.click();
    await flush();
    expect(phase()?.classList.contains("is-on"), "the R side is not inverted").toBe(false);
    phase()?.click();
    await flush();
    expect([shell.ctx.store.bool("ch.ch_5_6.phase.l", false), shell.ctx.store.bool("ch.ch_5_6.phase.r", false)]).toEqual([true, true]);
  });

  it("keeps a stereo pair's Φ mark on the side the channel view is showing", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_9_10" });
    await flush();
    const marks = (): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".cv-gain .flag.is-phase")];
    expect(marks().map((n) => [n.getAttribute("aria-label"), n.querySelector("svg")?.getAttribute("class")])).toEqual([["Φ", "icon-phase"]]);

    await shell.ctx.store.set("ch.ch_9_10.phase.l", true);
    await flush();
    expect(marks()[0]?.classList.contains("is-on")).toBe(true);
    await shell.ctx.store.set("ui.lane.ch_9_10", 1);
    await flush();
    expect(marks()[0]?.classList.contains("is-on"), "the R side is not inverted").toBe(false);
    await shell.ctx.store.set("ch.ch_9_10.phase.r", true);
    await flush();
    expect(marks()[0]?.classList.contains("is-on")).toBe(true);
  });

  it("lights a stereo strip's Φ mark for the side its name area is showing", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.bank", 1);
    await flush();
    const strip = (): Element | null | undefined =>
      shell.root.querySelector('[data-lamp-source="ch_5_6"]')?.closest(".strip");
    const mark = (): Element | null | undefined => strip()?.querySelector(".sym-phase");
    expect(strip()?.querySelectorAll(".sym-phase").length).toBe(1);
    expect(mark()?.querySelector("svg.icon-phase"), "a drawn ring and stem, not a character").not.toBeNull();

    await shell.ctx.store.set("ch.ch_5_6.phase.l", true);
    await flush();
    expect(mark()?.classList.contains("is-on")).toBe(true);
    strip()?.querySelector<HTMLElement>(".strip-name")?.click();
    await flush();
    expect(mark()?.classList.contains("is-on"), "the name area moved the strip to its R side").toBe(false);
    await shell.ctx.store.set("ch.ch_5_6.phase.r", true);
    await flush();
    expect(mark()?.classList.contains("is-on")).toBe(true);
  });

  it("marks CH SETTING's name with the rename mark", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".chs-mark-edit svg")?.getAttribute("class")).toBe("icon-rename");
  });

  it("draws the bank button's down mark rather than printing a character", async () => {
    const shell = await mount();
    const mark = shell.root.querySelector(".bank-btn .bank-mark");
    expect(mark?.textContent).toBe("");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("channel, monitor and microSD screens laid out from the guide's figures", () => {
  it("marks the centre only on a knob placed from the centre", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".cv-pan .knob-centre-mark"), "PAN").not.toBeNull();
    expect(shell.root.querySelector(".cv-level .knob-centre-mark"), "LEVEL").toBeNull();
    expect(shell.root.querySelector(".cv-gain .knob-centre-mark"), "the head amp").toBeNull();
    // A stereo input's digital gain runs -24..+24 and still lights from the bottom.
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_9_10" });
    await flush();
    expect(shell.root.querySelector(".cv-gain .knob-centre-mark"), "a symmetric gain").toBeNull();
    expect(shell.root.querySelector(".cv-pan .knob-centre-mark"), "BALANCE").not.toBeNull();
  });

  it("lets GATE's reduction meter and OUT meter show the range while the signal is under the threshold", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.gate", strip: "ch1" });
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await shell.ctx.store.set("ch.ch1.gate.threshold", 0);
    await shell.ctx.store.set("ch.ch1.gate.range", -19);
    await flush();
    expect(shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height, "19 of the meter's 38 dB").toBe("50%");
    const out = shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")[1];
    expect(out?.dataset["meterOffset"], "OUT reads the range lower").toBe("19");
    await shell.ctx.store.set("ch.ch1.gate.threshold", -96);
    await flush();
    expect(shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height, "open, nothing taken off").toBe("0%");
  });

  it("marks each of the head amp's flags with what sets it, so each takes that button's colour", async () => {
    // CH 3 is one of the channels that carries HI-Z on this unit.
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch3" });
    for (const key of ["phantom", "phase", "hiZ", "hpf.on"]) await shell.ctx.store.set(`ch.ch3.${key}`, true);
    await flush();
    const mark = (text: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".cv-gain .flag")].find((n) => (n.getAttribute("aria-label") ?? n.textContent) === text);
    expect(
      [
        ["+48V", "is-phantom"],
        ["Φ", "is-phase"],
      ].map(([text, kind]) => {
        const node = mark(text ?? "");
        return [text, node?.classList.contains(kind ?? ""), node?.classList.contains("is-on")];
      }),
    ).toEqual([
      ["+48V", true, true],
      ["Φ", true, true],
    ]);
    // HPF and HI-Z claim nothing of their own: they take the lit mark's colour.
    for (const text of ["HPF", "HI-Z"]) {
      expect([text, mark(text)?.className], `${text} is lit and unclaimed`).toEqual([text, "flag is-on"]);
    }
  });

  it("keeps the reduction bar and the OUT meter moving with the signal between repaints", async () => {
    // Nothing writes to the store here, so nothing rebuilds the screen: if the
    // bar moves, the ticker moved it.
    const shell = await mount();
    // CH 1 is on its MIC/LINE connector: the A.Gain brings its signal up to the threshold.
    await shell.ctx.store.set("ch.ch1.gain", 24);
    await shell.ctx.store.set("ch.ch1.comp.on", true);
    await shell.ctx.store.set("ch.ch1.comp.threshold", -40);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();

    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      const bar = (): string | undefined => shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height;
      const offset = (): string | undefined =>
        [...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")][1]?.dataset["meterOffset"];
      const stop = startMeterTicker(shell.ctx.store, shell.root, 50);
      vi.advanceTimersByTime(60);
      const firstBar = bar();
      const firstOffset = offset();
      vi.setSystemTime(Date.now() + 700);
      vi.advanceTimersByTime(60);
      expect(bar(), "the reduction bar moves with the signal").not.toBe(firstBar);
      expect(offset(), "and so does the OUT meter it feeds").not.toBe(firstOffset);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets DUCKER's reduction meter follow its key against the threshold and the range", async () => {
    // The key is loud; the ducked channel itself is silent, so a bar reading
    // the channel rather than the key cannot move.
    setMeterSource((id) => (id === "ch1" ? [-6] : [-90]));
    try {
      const shell = await mount();
      await shell.ctx.store.set("ch.ch_9_10.ducker.on", true);
      await shell.ctx.store.set("ch.ch_9_10.ducker.source", "1");
      await shell.ctx.store.set("ch.ch_9_10.ducker.threshold", -40);
      await shell.ctx.store.set("ch.ch_9_10.ducker.range", -24);
      shell.ctx.nav.push({ id: "channel-view", strip: "ch_9_10" });
      shell.ctx.nav.push({ id: "ch.ducker", strip: "ch_9_10" });
      await flush();
      const bar = (): string | undefined => shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height;
      // The key stands 34 dB over, so the ducker is closed to its whole range.
      expect(bar()).toBe(`${(24 / 38) * 100}%`);

      await shell.ctx.store.set("ch.ch_9_10.ducker.range", -10);
      await flush();
      expect(bar(), "and no further than the range it is given").toBe(`${(10 / 38) * 100}%`);

      await shell.ctx.store.set("ch.ch_9_10.ducker.threshold", 0);
      await flush();
      expect(bar(), "a key under the threshold holds nothing down").toBe("0%");

      await shell.ctx.store.set("ch.ch_9_10.ducker.threshold", -40);
      await shell.ctx.store.set("ch.ch_9_10.ducker.on", false);
      await flush();
      expect(bar(), "and a block that is off holds nothing down").toBe("0%");
    } finally {
      setMeterSource(null);
    }
  });

  it("reads a block's OUT as far below its IN as the reduction beside them, and above it where the makeup is deeper", async () => {
    setMeterSource(() => [-6]);
    try {
      const shell = await mount();
      await shell.ctx.store.set("ch.ch1.comp.on", true);
      await shell.ctx.store.set("ch.ch1.comp.threshold", -20);
      await shell.ctx.store.set("ch.ch1.comp.ratio", 20);
      await shell.ctx.store.set("ch.ch1.comp.gain", 0);
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
      await flush();
      const out = (): number =>
        Number([...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")][1]?.dataset["meterOffset"] ?? 0);
      expect(out(), "OUT reads lower by what the block takes off").toBeGreaterThan(0);

      await shell.ctx.store.set("ch.ch1.comp.gain", 18);
      await flush();
      expect(out(), "and higher where the makeup is deeper than the reduction").toBeLessThan(0);

      await shell.ctx.store.set("ch.ch1.comp.on", false);
      await flush();
      expect(out(), "a block that is off leaves them alike").toBe(0);
    } finally {
      setMeterSource(null);
    }
  });

  it("leaves IN and OUT reading alike where the block takes nothing off", async () => {
    const shell = await mount();
    for (const [screen, strip] of [
      ["ch.delay", "bus.stream"],
      ["ch.insfx", "ch1"],
    ]) {
      shell.ctx.nav.home();
      shell.ctx.nav.push({ id: "channel-view", strip: strip ?? "" });
      shell.ctx.nav.push({ id: screen ?? "", strip: strip ?? "" });
      await flush();
      const cols = [...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")];
      expect(cols, `${screen} draws both columns`).toHaveLength(2);
      expect(cols.map((c) => Number(c.dataset["meterOffset"] ?? 0)), `${screen} meters them alike`).toEqual([0, 0]);
    }
  });

  it("lets COMP's reduction meter follow the curve it draws, not the distance over the threshold", async () => {
    setMeterSource(() => [-6]);
    try {
      const shell = await mount();
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
      await shell.ctx.store.set("ch.ch1.comp.on", true);
      await shell.ctx.store.set("ch.ch1.comp.threshold", -20);
      await flush();
      const bar = (): string | undefined => shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height;
      const share = (): number => Number.parseFloat(bar() ?? "0");
      // How far the curve sits under unity at the level going in, on a meter
      // that runs the threshold's own 54: at 3:1 with a Medium knee that is the
      // 14 dB over the threshold less what the ratio lets through.
      expect(bar()).toBe(`${((-6 + 2 - (-20 + 14 / 3 + 2)) / 54) * 100}%`);

      await shell.ctx.store.set("ch.ch1.comp.ratio", 1);
      await flush();
      expect(bar(), "a compressor at 1:1 takes nothing off").toBe("0%");

      const at3 = ((-6 + 2 - (-20 + 14 / 3 + 2)) / 54) * 100;
      await shell.ctx.store.set("ch.ch1.comp.ratio", 20);
      await flush();
      expect(share(), "and a steeper ratio takes more").toBeGreaterThan(at3);

      await shell.ctx.store.set("ch.ch1.comp.on", false);
      await flush();
      expect(bar(), "a block that is off holds nothing down").toBe("0%");
    } finally {
      setMeterSource(null);
    }
  });

  it("runs GATE's rules on over the curve's fill in a clipped copy", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.gate", strip: "ch1" });
    await flush();
    const lit = shell.root.querySelector(".dyn-curve .dyn-grid-lit");
    expect(lit?.querySelectorAll("line.dyn-grid")).toHaveLength(2);
    const id = /url\(#(.+)\)/.exec(lit?.getAttribute("clip-path") ?? "")?.[1];
    expect(shell.root.querySelector(`clipPath#${id} polygon`), "clipped to the fill").not.toBeNull();
  });

  it("names an EQ band's shape by its outline", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    const box = shell.root.querySelector(".eq-screen > .pulldown");
    expect(box?.querySelector("svg.icon-eq-shape"), "the outline").not.toBeNull();
    expect(box?.textContent, "and no word").toBe("");
    expect(box?.getAttribute("aria-label")).toContain("Bell");
  });

  it("classes INPUT's right-hand buttons and DELAY's value box apart", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch3" });
    shell.ctx.nav.push({ id: "ch.input", strip: "ch3" });
    await flush();
    const cls = (name: string): string =>
      [...shell.root.querySelectorAll<HTMLElement>(".btn.if-right")].find((b) => b.textContent === name)?.className ?? "";
    expect(cls("HI-Z")).toContain("is-hiz");
    expect(cls("HPF")).toContain("is-hpf");
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    await flush();
    expect(shell.root.querySelector(".cv-block-value.cv-delay-value")).not.toBeNull();
  });

  it("gives TOOLS the eject button and reports a test once it has run, holding a modal up while it runs", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "microsd.tools" });
    await shell.ctx.store.set("ui.sdToolsTab", "Test");
    await flush();
    expect(shell.root.querySelector(".toolbar-right .sd-eject, .sd-eject"), "the eject button").not.toBeNull();
    expect(shell.root.querySelector(".tools-free")).not.toBeNull();
    expect(shell.root.querySelector(".tools-report"), "nothing before a test").toBeNull();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      shell.root.querySelector<HTMLElement>(".tools-screen > .btn")?.click();
      // The test starts on the touch, with nothing asked first.
      expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Testing in progress...");
      expect(shell.root.querySelector(".dialog-spinner"), "it waits on a ring").not.toBeNull();
      expect(shell.root.querySelector(".dialog-actions"), "there is nothing to answer").toBeNull();
      vi.advanceTimersByTime(1);
      expect(shell.ctx.store.bool("sd.tested", false), "no result while it runs").toBe(false);
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(shell.root.querySelector(".dialog-overlay"), "the modal takes itself down").toBeNull();
    const rows = [...shell.root.querySelectorAll(".tools-report-row")].map((r) => r.textContent);
    expect(rows).toEqual([
      "Card specs: Pass",
      "BUS Interface: UHS-I or higher,  SDR104",
      "UHS Speed Class: 1 or higher",
      "Speed Class: 10 or higher",
      "2 Tracks Recording: Max 96kHz",
      "Multi Tracks Recording: Max 96kHz",
    ]);
  });

  it("drops a card test that is still running once the card goes, leaving no result", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.tools" });
    await shell.ctx.store.set("ui.sdToolsTab", "Test");
    await flush();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      shell.root.querySelector<HTMLElement>(".tools-screen > .btn")?.click();
      expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Testing in progress...");
      await shell.ctx.store.set("sd.mounted", false);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(shell.ctx.nav.current.id).toBe("microsd");
    expect(shell.ctx.store.bool("sd.tested", false)).toBe(false);
  });

  it("shows a take's frequency and time on RECORDER only while it records", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "microsd.recorder" });
    await flush();
    expect(shell.root.querySelector(".rec-meta")).toBeNull();
    await shell.ctx.store.set("sd.rec", "recording");
    await flush();
    const meta = (): (string | null)[] => [...(shell.root.querySelector(".rec-meta")?.children ?? [])].map((c) => c.textContent);
    expect(meta()).toEqual(["48.0kHz", "00:00:00"]);
    // The frequency is the one the unit is running, not one the screen holds.
    await shell.ctx.store.set("setup.samplingFrequency", 44100);
    await flush();
    expect(meta()[0]).toBe("44.1kHz");
  });

  it("sets the tab names of the microSD screens, SCENE LIST and MONITOR at the heights the guide gives each", async () => {
    const shell = await mount();
    const marked = async (id: string, cls: string): Promise<boolean[]> => {
      shell.ctx.nav.push({ id });
      await flush();
      return [...shell.root.querySelectorAll(".side-tab")].map((t) => t.classList.contains(cls));
    };
    expect(await marked("microsd.recorder", "is-name-raised")).toEqual([false, true, true]);
    expect(await marked("microsd.saveload", "is-name-raised")).toEqual([false, true]);
    expect(await marked("microsd.saveload", "is-name-apart"), "Save/Load").toEqual([true, false]);
    expect(await marked("microsd.tools", "is-name-raised")).toEqual([false, true]);
    expect(await marked("scene.list", "is-name-raised"), "SCENE LIST raises none by 3px").toEqual([false, false]);
    expect(await marked("scene.list", "is-name-lifted"), "SCENE LIST's Edit").toEqual([false, true]);
    expect(await marked("scene.list", "is-name-close"), "Store/Recall").toEqual([true, false]);
    expect(await marked("monitor.level", "is-name-raised")).toEqual([false, false]);
    expect(await marked("monitor.level", "is-name-lifted"), "MONITOR").toEqual([true, true]);
    expect(await marked("monitor.osc", "is-name-lifted"), "OSCILLATOR").toEqual([false, false]);
    expect(await marked("setup.patch", "patch-tab"), "Output Patch").toEqual([true, true]);
    expect(await marked("setup.peripheral", "patch-tab"), "Peripheral").toEqual([false, false]);
    expect(await marked("monitor.osc", "osc-tab"), "OSCILLATOR's tabs carry their own name weight").toEqual([true, true]);
    await shell.ctx.store.set("ui.oscTab", "Assign");
    expect(await marked("monitor.osc", "osc-tab"), "on the Assign tab too").toEqual([true, true]);
    await shell.ctx.store.set("ui.oscTab", "OSC");
    expect(await marked("monitor.level", "osc-tab"), "MONITOR's do not").toEqual([false, false]);
  });

  it("draws the readout bar's page step as a glyph", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    const step = shell.root.querySelector(".knob-page-step");
    expect(step?.querySelector("svg.icon-page-step")).not.toBeNull();
    expect(step?.textContent).toBe("");
  });
});

describe("the control the knob turns", () => {
  const down = (node: Element | null | undefined): void => {
    node?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  };
  const handle = (shell: Shell, letter: string): Element | undefined =>
    [...shell.root.querySelectorAll(".dyn-handle")].find((g) => g.querySelector("text")?.textContent === letter);

  it("frames nothing until touched, then one control at a time: a DUCKER handle, then its Threshold box", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch_9_10" });
    shell.ctx.nav.push({ id: "ch.ducker", strip: "ch_9_10" });
    await flush();
    expect(shell.root.querySelectorAll(".is-held, .is-focused"), "nothing on opening").toHaveLength(0);
    handle(shell, "R")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(handle(shell, "R")?.classList.contains("is-held")).toBe(true);
    const box = (): Element | null => shell.root.querySelector(".dyn-sets .value-box");
    down(box());
    await flush();
    expect([handle(shell, "R")?.classList.contains("is-held"), box()?.classList.contains("is-focused")]).toEqual([false, true]);
    expect(shell.root.querySelectorAll(".is-held, .is-focused")).toHaveLength(1);
  });

  it("frames BRIGHTNESS's one value as the screen opens, the screen having nothing else to turn", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.brightness" });
    await flush();
    const box = shell.root.querySelector(".single-param .value-box");
    expect([shell.root.querySelector(".toolbar-title")?.textContent, box?.classList.contains("is-focused")]).toEqual(["BRIGHTNESS", true]);
    expect(shell.root.querySelectorAll(".is-held, .is-focused"), "and nothing else on the screen").toHaveLength(1);
  });

  it("frames only the DELAY cell touched, though the four turn one time", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    const boxes = (): boolean[] => [...shell.root.querySelectorAll(".delay-cell .value-box")].map((b) => b.classList.contains("is-focused"));
    down(shell.root.querySelectorAll(".delay-cell .value-box")[1]);
    await flush();
    expect(boxes()).toEqual([false, true, false, false]);
  });

  it("points each handle's marks the way its value moves", async () => {
    const shell = await mount();
    const axes = async (id: string, strip: string, letters: string[]): Promise<string[]> => {
      shell.ctx.nav.openTop({ id: "channel-view", strip });
      shell.ctx.nav.push({ id, strip });
      await flush();
      return letters.map((letter) => {
        const tips = [...shell.root.querySelectorAll(`.dyn-handle-mark[data-letter="${letter}"] .dyn-handle-arrow`)].map((p) => (p.getAttribute("points") ?? "").split(" ")[0] ?? "");
        const [a, b] = tips.map((pt) => pt.split(",").map(Number));
        return a && b && a[1] === b[1] ? "across" : "up and down";
      });
    };
    expect(await axes("ch.gate", "ch1", ["T", "R"])).toEqual(["across", "up and down"]);
    expect(await axes("ch.comp", "ch1", ["G", "T", "R"])).toEqual(["up and down", "across", "up and down"]);
    expect(await axes("ch.ducker", "ch_9_10", ["R", "A", "D"])).toEqual(["up and down", "across", "across"]);
  });

  it("draws GATE's held R with both marks over T, and keeps R's disc on the plot where the range takes it below", async () => {
    const shell = await mount();
    const open = async (threshold: number, range: number): Promise<SVGSVGElement | null> => {
      await shell.ctx.store.set("ch.ch1.gate.threshold", threshold);
      await shell.ctx.store.set("ch.ch1.gate.range", range);
      shell.ctx.nav.openTop({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.gate", strip: "ch1" });
      await flush();
      return shell.root.querySelector<SVGSVGElement>(".dyn-curve");
    };
    const cy = (letter: string): number => Number(handle(shell, letter)?.querySelector("circle")?.getAttribute("cy"));
    const svg = await open(-7, -20);
    handle(shell, "R")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    const children = [...(shell.root.querySelector(".dyn-curve")?.children ?? [])];
    const layer = children.at(-1);
    expect([svg !== null, layer?.getAttribute("class"), children.indexOf(handle(shell, "T") as Element) < children.length - 1]).toEqual([
      true,
      "dyn-handle-marks",
      true,
    ]);
    expect(layer?.querySelector('.dyn-handle-mark[data-letter="R"]')?.classList.contains("is-held"), "R's marks, held, over the handles").toBe(true);
    expect([cy("T"), cy("R")], "the range within the plot puts R on the curve").toEqual([46.2, 80.4]);
    await open(-50, -56);
    expect(cy("R"), "R's foot on the frame, the disc a radius up from the plot's floor").toBe(171 - 14.5);
  });

  it("keeps every handle's disc on the plot, its edge on the frame, where the value would take it past", async () => {
    const shell = await mount();
    const at = async (id: string, strip: string, state: Record<string, number>, letters: string[]): Promise<number[][]> => {
      for (const [path, value] of Object.entries(state)) await shell.ctx.store.set(path, value);
      shell.ctx.nav.openTop({ id: "channel-view", strip });
      shell.ctx.nav.push({ id, strip });
      await flush();
      return letters.map((letter) => {
        const c = handle(shell, letter)?.querySelector("circle");
        return [Number(c?.getAttribute("cx")), Number(c?.getAttribute("cy"))];
      });
    };
    const top = 14.5;
    const floor = 171 - 14.5;
    expect(await at("ch.comp", "ch1", { "ch.ch1.comp.threshold": 0, "ch.ch1.comp.ratio": 1, "ch.ch1.comp.gain": 18 }, ["R", "T"]), "COMP's R and T under the top").toEqual([
      [183.5, top],
      [158.4, top],
    ]);
    const marks = [...shell.root.querySelectorAll('.dyn-handle-mark[data-letter="R"] .dyn-handle-arrow')].map((a) => (a.getAttribute("points") ?? "").split(" ")[0]);
    expect(marks, "the marks stand either side of the disc where it is drawn").toEqual(["183.5,-11.0", "183.5,40.0"]);
    expect(await at("ch.comp", "ch1", { "ch.ch1.comp.threshold": -54, "ch.ch1.comp.ratio": 1, "ch.ch1.comp.gain": 0 }, ["G", "R"]), "COMP's G on the floor, R under the top").toEqual([
      [14.5, floor],
      [183.5, top],
    ]);
    expect(await at("ch.gate", "ch1", { "ch.ch1.gate.threshold": -72, "ch.ch1.gate.range": 0 }, ["T"]), "GATE's T on the floor").toEqual([[15.8, floor]]);
  });

  it("rims a list's bar when the list is touched, and leaves a popup's fields unframed", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await flush();
    const bar = (): Element | null => shell.root.querySelector(".scene-scrollbar");
    expect(bar()?.classList.contains("is-focused")).toBe(false);
    down(shell.root.querySelector(".scene-list .list-body"));
    await flush();
    expect(bar()?.classList.contains("is-focused")).toBe(true);

    // The LICENSE text holds nothing the keys stop on, so the text is the stop, and the keys bringing the focus to it rim its bar.
    shell.ctx.nav.push({ id: "setup.license" });
    await flush();
    const text = shell.root.querySelector<HTMLElement>(".license-text");
    expect([text?.tabIndex, shell.root.querySelector(".license-body .scrollbar")?.classList.contains("is-focused")]).toEqual([0, false]);
    text?.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(shell.root.querySelector(".license-body .scrollbar")?.classList.contains("is-focused")).toBe(true);

    shell.ctx.nav.push({ id: "setup.datetime.set" });
    await flush();
    down(shell.root.querySelector(".dt-box"));
    await flush();
    expect(shell.root.querySelector(".dt-box")?.classList.contains("is-focused"), "a popup's field").toBe(false);
  });

  it("does not sink a block whose touch only brings the focus to it, and sinks it once it holds the focus", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "channel-view", strip: "ch1" });
    await flush();
    const gate = (): HTMLElement | null => shell.root.querySelector<HTMLElement>('.cv-block[aria-label="GATE"]');
    // INS FX opens at the first touch, so nothing about it is held back.
    const insFx = shell.root.querySelector<HTMLElement>('.cv-block[aria-label="INS FX"]');
    expect([gate()?.getAttribute("data-press"), insFx?.getAttribute("data-press")]).toEqual(["none", null]);

    gate()?.click();
    await flush();
    expect(gate()?.getAttribute("data-press"), "holding the focus, the next touch opens it").toBeNull();
  });

  it("frames a channel view block's value at the first touch and opens its screen at the next", async () => {
    const shell = await mount();
    const cases = [
      ["ch1", "GATE", "ch.gate"],
      ["ch1", "COMP", "ch.comp"],
      ["ch_9_10", "DUCKER", "ch.ducker"],
      ["bus.stream", "DELAY", "ch.delay"],
    ] as const;
    for (const [strip, title, screen] of cases) {
      shell.ctx.nav.openTop({ id: "channel-view", strip });
      await flush();
      const blockOf = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.cv-block[aria-label="${title}"]`);
      expect(blockOf()?.querySelector(".is-focused"), `${title} opens unframed`).toBeNull();
      blockOf()?.click();
      await flush();
      expect(shell.ctx.nav.current.id, `${title} stays on the view`).toBe("channel-view");
      expect(blockOf()?.querySelector(".cv-block-value")?.classList.contains("is-focused"), `${title} frames its value`).toBe(true);
      expect(shell.root.querySelectorAll(".is-focused"), "and nothing else").toHaveLength(1);
      blockOf()?.click();
      await flush();
      expect(shell.ctx.nav.current.id, `${title} opens at the next touch`).toBe(screen);
    }
  });

  it("opens a block with nothing for the knob at the first touch", async () => {
    const shell = await mount();
    for (const [title, screen] of [["EQ", "ch.eq"], ["INS FX", "ch.insfx"]] as const) {
      shell.ctx.nav.openTop({ id: "channel-view", strip: "ch1" });
      await flush();
      shell.root.querySelector<HTMLElement>(`.cv-block[aria-label="${title}"]`)?.click();
      await flush();
      expect(shell.ctx.nav.current.id, title).toBe(screen);
    }
  });

  it("turns a framed block's value from the keys", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const before = shell.ctx.store.num("ch.ch1.gate.threshold", 0);
    shell.root.querySelector<HTMLElement>('.cv-block[aria-label="GATE"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.gate.threshold", 0)).toBe(before + 1);
    expect(shell.root.querySelector('.cv-block[aria-label="GATE"] .cv-block-value')?.classList.contains("is-focused")).toBe(true);
  });

  it("gives the knob 1-knob's depth on a block 1-knob turns", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.comp.oneKnob.on", true);
    await shell.ctx.store.set("ch.ch1.comp.oneKnob.level", 33);
    await shell.ctx.store.set("ch.ch1.eq.oneKnob.on", true);
    await shell.ctx.store.set("ch.ch1.eq.oneKnob.level", 50);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const comp = (): HTMLElement | null => shell.root.querySelector<HTMLElement>('.cv-block[aria-label="COMP"]');
    expect(comp()?.querySelector(".cv-oneknob-mark")?.textContent, "COMP carries the circled 1").toBe("1");
    expect(comp()?.querySelector(".cv-block-value")?.textContent, "and its depth").toBe("33%");
    expect(comp()?.querySelector(".comp-thresh"), "with no threshold marked").toBeNull();
    const eq = (): HTMLElement | null => shell.root.querySelector<HTMLElement>('.cv-block[aria-label="EQ"]');
    expect(eq()?.querySelector(".cv-eq-depth")?.textContent, "EQ prints its depth over the curve").toBe("50%");

    eq()?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "EQ now takes the knob first").toBe("channel-view");
    expect(eq()?.querySelector(".cv-eq-oneknob")?.classList.contains("is-focused"), "framing the graph").toBe(true);
    eq()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.eq.oneKnob.level", 0), "and turning the depth").toBe(49);

    await shell.ctx.store.set("ch.ch1.comp.oneKnob.on", false);
    await flush();
    expect(comp()?.querySelector(".cv-oneknob-mark"), "off, COMP shows its threshold again").toBeNull();
    expect(comp()?.querySelector(".comp-thresh")).not.toBeNull();
  });

  it("pins the focus to 1-knob's level on the COMP screen and holds every other value", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.comp.oneKnob.on", true);
    await shell.ctx.store.set("ch.ch1.comp.oneKnob.level", 50);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    const level = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".oneknob-panel .oneknob-level");
    expect(level()?.textContent, "the level stands on the panel").toBe("50");
    expect(level()?.classList.contains("is-focused"), "framed from the start").toBe(true);
    expect(shell.root.querySelector(".dyn-row-makeup .dyn-caption"), "Auto Makeup gives way to it").toBeNull();
    expect(shell.root.querySelector(".oneknob-panel .oneknob")?.getAttribute("aria-pressed")).toBe("true");

    const attack = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".dyn-sets .value-box");
    const before = shell.ctx.store.num("ch.ch1.comp.attack", 0);
    down(attack());
    attack()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(level()?.classList.contains("is-focused"), "touching Attack leaves the focus").toBe(true);
    expect(shell.root.querySelectorAll(".is-focused")).toHaveLength(1);
    expect(shell.ctx.store.num("ch.ch1.comp.attack", 0), "and Attack does not turn from the screen").toBe(before);

    const cell = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find((c) => c.querySelector(".knob-cell-label")?.textContent === label);
    const threshold = shell.ctx.store.num("ch.ch1.comp.threshold", 0);
    cell("Threshold")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.comp.threshold", 0), "the threshold is the unit's").toBe(threshold);
    expect(level()?.classList.contains("is-focused"), "and the knob strip does not take the focus either").toBe(true);
    cell("Attack")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("ch.ch1.comp.attack", 0), "nor its Attack").toBe(before);

    shell.root.querySelector<HTMLElement>(".dyn-row-knee .pulldown")?.click();
    await flush();
    expect(shell.root.querySelector(".dropdown-list"), "Knee does not open").toBeNull();

    shell.root.querySelector<HTMLElement>(".oneknob-panel .oneknob")?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.comp.oneKnob.on", true)).toBe(false);
    expect(shell.root.querySelectorAll(".is-focused"), "off, the pin lets go").toHaveLength(0);
    down(attack());
    await flush();
    expect(attack()?.classList.contains("is-focused"), "and Attack takes the focus again").toBe(true);
    shell.root.querySelector<HTMLElement>(".dyn-row-knee .pulldown")?.click();
    await flush();
    expect(shell.root.querySelector(".dropdown-list"), "while Knee opens once 1-knob is off").not.toBeNull();
  });

  it("pins the focus to 1-knob's level on the EQ screen and shrinks the grips to marks that pick nothing", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.eq.oneKnob.on", true);
    await shell.ctx.store.set("ch.ch1.eq.oneKnob.type", "Vocal");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".oneknob-panel .oneknob-level")?.classList.contains("is-focused")).toBe(true);
    expect(shell.root.querySelector(".oneknob-panel .pulldown .pulldown-value")?.textContent, "the kind of curve leads the panel").toBe("Vocal");
    expect(shell.root.querySelector(".eq-screen > .pulldown"), "in place of the band's shape").toBeNull();
    const grips = [...shell.root.querySelectorAll<HTMLElement>(".eq-grip")];
    expect(grips.map((g) => [g.classList.contains("is-fixed"), g.textContent])).toEqual(Array.from({ length: 4 }, () => [true, ""]));
    expect(shell.root.querySelector(".eq-plot")?.classList.contains("is-oneknob"), "the plot that draws its curve in magenta").toBe(true);
    const band = shell.ctx.store.str("ui.eqBand", "low");
    grips[3]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.ctx.store.str("ui.eqBand", "low"), "a grip picks no band").toBe(band);
    expect(shell.root.querySelectorAll(".is-focused, .is-held")).toHaveLength(1);
  });

  it("rims only the touched column in the USER DEFINED KNOBS picker, and the input source sheet's bar", async () => {
    const shell = await mount();
    shell.ctx.nav.openTop({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.udk" });
    shell.ctx.nav.push({ id: "setup.udk.assign" });
    await flush();
    const bars = (): boolean[] => [...shell.root.querySelectorAll(".pick-dialog-bar")].map((b) => b.classList.contains("is-focused"));
    expect(bars()).toEqual([false, false, false]);
    down(shell.root.querySelectorAll(".pick-dialog-rows")[1]);
    await flush();
    expect(bars()).toEqual([false, true, false]);

    shell.ctx.nav.openTop({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    shell.root.querySelector<HTMLElement>(".input-source-btn")?.click();
    await flush();
    const sheetBar = (): Element | null => shell.root.querySelector(".source-scrollbar");
    expect(sheetBar()?.classList.contains("is-focused")).toBe(false);
    down(sheetBar());
    await flush();
    expect(sheetBar()?.classList.contains("is-focused")).toBe(true);
  });
});

describe("the head amp belongs to the connector a channel is on", () => {
  const press = async (shell: Shell, key: string, times = 1): Promise<void> => {
    for (let i = 0; i < times; i++) {
      shell.root.querySelector(".input-col-a .value-box")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await flush();
    }
  };
  /** The INPUT screen's buttons and captions for `strip`, and its gain box. */
  const input = async (shell: Shell, strip: string): Promise<{ shown: string[]; box: string; range: string }> => {
    shell.ctx.nav.push({ id: "ch.input", strip });
    await flush();
    const box = shell.root.querySelector<HTMLElement>(".input-col-a .value-box");
    const out = {
      shown: [
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-flag")].map(accessibleName),
        ...[...shell.root.querySelectorAll<HTMLElement>(".input-col-caption")].map((n) => n.textContent ?? ""),
      ],
      box: box?.textContent ?? "",
      range: `${box?.getAttribute("aria-valuemin")}..${box?.getAttribute("aria-valuemax")}`,
    };
    shell.ctx.nav.back();
    await flush();
    return out;
  };
  /** Each HOME strip in view, with its +48V mark: lit, unlit, or none. */
  const homeMarks = async (shell: Shell): Promise<string[]> => {
    shell.ctx.repaint();
    await flush();
    return [...shell.root.querySelectorAll<HTMLElement>(".strip")].map((strip) => {
      const mark = [...strip.querySelectorAll<HTMLElement>(".sym")].find((n) => n.textContent === "+48V");
      return `${strip.querySelector(".strip-id")?.textContent ?? ""}:${mark ? (mark.classList.contains("is-hot") ? "lit" : "unlit") : "none"}`;
    });
  };

  it("keeps a mono channel's digital gain apart from the analog one, and one for each source", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    await store.set("ch.ch1.gain", 40);
    await store.set("ch.ch1.source", "USB DAW 1/2");
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector(".input-col-a .input-col-caption")?.textContent).toBe("D.Gain");
    expect(shell.root.querySelector(".input-col-a .value-box")?.textContent, "the digital gain as it ships, not the analog +40").toBe("0");
    await press(shell, "ArrowUp", 30);
    expect(shell.root.querySelector(".input-col-a .value-box")?.textContent, "the top of its range").toBe("+24");
    shell.ctx.nav.back();
    await flush();

    await store.set("ch.ch1.source", "MIC/LINE 1/2");
    expect((await input(shell, "ch1")).box, "the analog gain is where it was").toBe("+40");
    await store.set("ch.ch1.source", "USB DAW 1/2");
    expect(await input(shell, "ch1"), "and so is the digital one").toMatchObject({ box: "+24", range: "-24..24" });

    // Each source keeps its own: one never turned starts at 0.
    await store.set("ch.ch1.source", "USB DAW 3/4");
    expect((await input(shell, "ch1")).box, "a source of its own").toBe("0");
    await store.set("ch.ch1.source", "USB DAW 1/2");
    expect((await input(shell, "ch1")).box, "back to what USB DAW 1/2 was left at").toBe("+24");
  });

  it("gives the two channels of a mono pair one digital gain, linked or not", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "USB DAW 1/2");
    shell.ctx.nav.push({ id: "ch.input", strip: "ch2" });
    await flush();
    await press(shell, "ArrowUp", 10);
    shell.ctx.nav.back();
    await flush();
    expect([(await input(shell, "ch1")).box, (await input(shell, "ch2")).box], "turned on CH 2 while MONO x 2").toEqual(["+10", "+10"]);

    await store.set("ch.ch1.signalType", "STEREO");
    await store.set("ch.ch2.signalType", "STEREO");
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    await press(shell, "ArrowDown", 15);
    shell.ctx.nav.back();
    await flush();
    expect([(await input(shell, "ch1")).box, (await input(shell, "ch2")).box], "and while STEREO").toEqual(["-5", "-5"]);
    expect(store.pathsUnder("ch").filter((p) => /gain/i.test(p) && /digital/i.test(p)), "no channel keeps one of its own").toEqual([]);
  });

  it("shares a source's digital gain between every channel on it, and keeps it when they leave", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "USB DAW 1/2");
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    await press(shell, "ArrowUp", 10);
    shell.ctx.nav.back();
    await flush();

    for (const id of ["ch3", "ch4"]) await store.set(`ch.${id}.source`, "USB DAW 1/2");
    await store.set("ch.ch_5_6.source", "USB DAW 1/2");
    expect(
      [(await input(shell, "ch3")).box, (await input(shell, "ch_5_6")).box],
      "another pair, and a stereo channel, on the same source",
    ).toEqual(["+10", "+10"]);

    // CH 7/8 ships on USB MAIN A, 14 dB down.
    expect((await input(shell, "ch_7_8")).box).toBe("-14");
    shell.ctx.nav.push({ id: "ch.input", strip: "ch_7_8" });
    await flush();
    await press(shell, "ArrowUp", 9);
    shell.ctx.nav.back();
    await flush();
    await store.set("ch.ch_7_8.source", "USB MAIN B");
    expect((await input(shell, "ch_7_8")).box, "USB MAIN B's, as it ships").toBe("-14");
    await store.set("ch.ch_7_8.source", "USB MAIN A");
    expect((await input(shell, "ch_7_8")).box, "USB MAIN A kept what it was turned to").toBe("-5");
  });

  it("shows two channels on one connector the same head amp, and turns it for both", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    await store.set("ch.ch3.gain", 30);
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "MIC/LINE 3/4");

    const ch1 = await input(shell, "ch1");
    expect(ch1.shown, "MIC/LINE 3 takes HI-Z, so CH 1 on it carries the button").toEqual(["+48V", "HI-Z", "Clip Safe", "Auto Gain", "Φ", "HPF", "A.Gain", "HPF Freq."]);
    expect(ch1.box, "CH 3's gain").toBe("+30");
    expect((await input(shell, "ch2")).box, "CH 2 sits on MIC/LINE 4, CH 4's").toBe("-8");

    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    await press(shell, "ArrowUp");
    shell.ctx.nav.back();
    await flush();
    expect((await input(shell, "ch3")).box, "turned on CH 1, read on CH 3").toBe("+31");

    // The switches beside it are the connector's as well.
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    for (const name of ["+48V", "HI-Z", "Clip Safe"]) {
      [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === name)?.click();
      await flush();
    }
    const lit = (): string[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".input-flag.is-on")].map((b) => b.textContent ?? "");
    expect(lit(), "lit on CH 1").toEqual(["+48V", "HI-Z", "Clip Safe"]);
    shell.ctx.nav.replace({ id: "ch.input", strip: "ch3" });
    await flush();
    expect(lit(), "and on CH 3, on the same connector").toEqual(["+48V", "HI-Z", "Clip Safe"]);
    [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === "Clip Safe")?.click();
    await flush();
    shell.ctx.nav.replace({ id: "ch.input", strip: "ch1" });
    await flush();
    expect(lit(), "switched off on CH 3, off on CH 1").toEqual(["+48V", "HI-Z"]);
    shell.ctx.nav.replace({ id: "channel-view", strip: "ch1" });
    await flush();
    expect(
      [...shell.root.querySelectorAll<HTMLElement>(".cv-gain-flags .flag.is-on")].map((n) => n.textContent ?? ""),
      "CH 1's marks read the connector it is on, MIC/LINE 3",
    ).toEqual(["+48V", "HI-Z"]);
    shell.ctx.nav.back();
    await flush();
    expect(await homeMarks(shell), "HOME lights every channel on the connector").toEqual(["CH 1:lit", "CH 2:unlit", "CH 3:lit", "CH 4:unlit"]);
  });

  it("draws [Clip Safe] and [SAFE] engaged while Clip Safe holds the connector's gain down", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    /** Whether `strip`'s INPUT [Clip Safe] and channel view [SAFE] are drawn engaged. */
    const engaged = async (strip: string): Promise<boolean[]> => {
      shell.ctx.nav.replace({ id: "ch.input", strip });
      await flush();
      const clip = shell.root.querySelector<HTMLElement>(".input-flag.if-clip");
      shell.ctx.nav.replace({ id: "channel-view", strip });
      await flush();
      const safe = [...shell.root.querySelectorAll<HTMLElement>(".cv-gain-buttons .btn")].find((b) => b.textContent === "SAFE");
      return [clip, safe].map((b) => b?.classList.contains("is-engaged") ?? false);
    };
    // At +60 the connector's signal is over the clip level all the time.
    await store.set("ch.ch3.gain", 60);
    expect(await engaged("ch3"), "Clip Safe off").toEqual([false, false]);
    await store.set("ch.ch3.clipSafe", true);
    expect(await engaged("ch3"), "on, over a clipping signal").toEqual([true, true]);
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "MIC/LINE 3/4");
    expect(await engaged("ch1"), "CH 1 on the same connector").toEqual([true, true]);
    expect(await engaged("ch2"), "CH 2 on MIC/LINE 4").toEqual([false, false]);
    expect(store.num("ch.ch3.gain", 0), "the A.Gain stays where it was set").toBe(60);
  });

  it("meters an input channel as it arrives, before its fader, in the channel view and on INPUT", async () => {
    // A channel's own level reads -10 dB here, and its level as it arrives -30 dB.
    setMeterSource((id, channels) => Array.from({ length: channels }, () => (id.startsWith("in:") ? -30 : -10)));
    try {
      const shell = await mount();
      const unlit = (selector: string): string[] =>
        [...shell.root.querySelectorAll<HTMLElement>(`${selector} .meter-bar`)].map((b) => b.style.getPropertyValue("--unlit"));
      shell.ctx.nav.push({ id: "channel-view", strip: "ch3" });
      await flush();
      expect(unlit(".cv-gain-row"), "the channel view's meter").toEqual(["50%"]);
      shell.ctx.nav.push({ id: "ch.input", strip: "ch3" });
      await flush();
      expect(unlit(".input-meter"), "INPUT's two").toEqual(["50%", "50%"]);
      shell.ctx.nav.replace({ id: "channel-view", strip: "bus.mix1" });
      await flush();
      expect(unlit(".cv-gain-row"), "a bus reads its own level there").toEqual([`${(1 - 50 / 60) * 100}%`]);
    } finally {
      setMeterSource(null);
    }
  });

  it("keeps +48V and HI-Z on together, whichever of the two is pressed first", async () => {
    const shell = await mount();
    /** Press `order` on CH 3's INPUT screen and read which switches are lit. */
    const lit = async (order: string[]): Promise<string[]> => {
      shell.ctx.nav.push({ id: "ch.input", strip: "ch3" });
      await flush();
      for (const name of order) {
        [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === name)?.click();
        await flush();
      }
      const out = [...shell.root.querySelectorAll<HTMLElement>(".input-flag.is-on")].map((b) => b.textContent ?? "");
      shell.ctx.nav.back();
      await flush();
      return out;
    };
    expect(await lit(["+48V", "HI-Z"]), "+48V first").toEqual(["+48V", "HI-Z"]);
    expect(await lit(["+48V", "HI-Z"]), "both switched off again").toEqual([]);
    expect(await lit(["HI-Z", "+48V"]), "HI-Z first").toEqual(["+48V", "HI-Z"]);
  });

  it("stops A.Gain at +40 dB while the connector's HI-Z is on, and brings a gain above it down", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    /** Press [HI-Z] on `strip`'s INPUT screen. */
    const hiZ = async (strip: string): Promise<void> => {
      shell.ctx.nav.push({ id: "ch.input", strip });
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === "HI-Z")?.click();
      await flush();
      shell.ctx.nav.back();
      await flush();
    };
    await store.set("ch.ch3.gain", 60);
    expect((await input(shell, "ch3")).range, "HI-Z off").toBe("-8..70");
    await hiZ("ch3");
    expect(await input(shell, "ch3"), "switched on over +60").toMatchObject({ box: "+40", range: "-8..40" });

    shell.ctx.nav.push({ id: "ch.input", strip: "ch3" });
    await flush();
    await press(shell, "ArrowUp", 3);
    shell.ctx.nav.back();
    await flush();
    expect((await input(shell, "ch3")).box, "turned up, it stays at +40").toBe("+40");

    await hiZ("ch3");
    expect(await input(shell, "ch3"), "switched off, the gain stays where HI-Z put it").toMatchObject({ box: "+40", range: "-8..70" });
    await store.set("ch.ch3.gain", 30);
    await hiZ("ch3");
    expect((await input(shell, "ch3")).box, "a gain inside the range stays").toBe("+30");

    // The range is the connector's: CH 1 on MIC/LINE 3 reads CH 3's HI-Z, CH 2 on MIC/LINE 4 reads CH 4's.
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "MIC/LINE 3/4");
    expect([(await input(shell, "ch1")).range, (await input(shell, "ch2")).range]).toEqual(["-8..40", "-8..70"]);
  });

  it("takes HOME's +48V mark away while a mono channel is off its MIC/LINE connector", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    await store.set("ch.ch1.phantom", true);
    expect(await homeMarks(shell)).toEqual(["CH 1:lit", "CH 2:unlit", "CH 3:unlit", "CH 4:unlit"]);
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "USB DAW 1/2");
    expect(await homeMarks(shell)).toEqual(["CH 1:none", "CH 2:none", "CH 3:unlit", "CH 4:unlit"]);
  });

  it("gives a stereo channel on a MIC/LINE connector the analog head amp of the side in view", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    await store.set("ch.ch1.gain", 12);
    await store.set("ch.ch2.gain", 20);
    await store.set("ch.ch_5_6.source", "MIC/LINE 1/2");

    const left = await input(shell, "ch_5_6");
    expect(left.shown).toEqual(["+48V", "Clip Safe", "Auto Gain", "Φ", "A.Gain"]);
    expect(left.box, "CH 5 is on MIC/LINE 1").toBe("+12");
    await store.set("ui.lane.ch_5_6", 1);
    expect((await input(shell, "ch_5_6")).box, "CH 6 on MIC/LINE 2").toBe("+20");

    shell.ctx.nav.push({ id: "channel-view", strip: "ch_5_6" });
    await flush();
    expect([...shell.root.querySelectorAll<HTMLElement>(".cv-gain-buttons .btn")].map((b) => b.textContent)).toEqual(["AUTO", "SAFE"]);
    expect([...shell.root.querySelectorAll<HTMLElement>(".cv-gain-flags > *")].map(accessibleName)).toEqual(["+48V", "Φ"]);
    shell.ctx.nav.back();
    await flush();

    // Its switches are the connector's of the side in view: CH 6 is on MIC/LINE 2.
    await store.set("ch.ch2.phantom", true);
    shell.ctx.nav.push({ id: "ch.input", strip: "ch_5_6" });
    await flush();
    const phantomLit = (): boolean | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === "+48V")?.classList.contains("is-on");
    expect(phantomLit(), "CH 6's").toBe(true);
    await store.set("ui.lane.ch_5_6", 0);
    shell.ctx.repaint();
    await flush();
    expect(phantomLit(), "not CH 5's").toBe(false);
    shell.ctx.nav.back();
    await flush();

    await store.set("ch.ch_5_6.source", "MIC/LINE 3/4");
    await store.set("ui.lane.ch_5_6", 1);
    expect((await input(shell, "ch_5_6")).shown, "MIC/LINE 4 takes HI-Z").toEqual(["+48V", "HI-Z", "Clip Safe", "Auto Gain", "Φ", "A.Gain"]);

    await store.set("ui.bank", 1);
    expect((await homeMarks(shell))[0], "HOME marks it as it marks a mono channel: CH 6 is on MIC/LINE 4, its phantom off").toBe("CH 5/6:unlit");
    await store.set("ch.ch4.phantom", true);
    expect((await homeMarks(shell))[0], "lit by MIC/LINE 4's phantom").toBe("CH 5/6:lit");
    await store.set("ch.ch_5_6.source", "AUX IN");
    expect((await homeMarks(shell))[0]).toBe("CH 5/6:none");
  });

  it("shows no gain while a channel is on no source", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.source`, "None");
    await store.set("ch.ch_5_6.source", "None");
    expect((await input(shell, "ch_5_6")).shown, "the level bar alone on the left, Φ on the right").toEqual(["Φ"]);
    expect((await input(shell, "ch1")).shown).toEqual(["Φ", "HPF", "HPF Freq."]);

    for (const [route, strip] of [["ch.input", "ch_5_6"], ["channel-view", "ch_5_6"], ["channel-view", "ch1"]] as const) {
      shell.ctx.nav.push({ id: route, strip });
      await flush();
      const labels = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].map((c) => c.querySelector(".knob-cell-label")?.textContent ?? "");
      expect(labels[0], `${route} ${strip}: nothing on the gain's knob`).toBe("");
      if (route === "channel-view") {
        expect(
          [...shell.root.querySelectorAll<HTMLElement>(".cv-gain-flags > *")].map(accessibleName),
          `${strip}: a mono channel differs from a stereo one by HPF alone`,
        ).toEqual(strip === "ch1" ? ["", "Φ", "HPF", ""] : ["", "Φ"]);
        expect(shell.root.querySelector(".cv-caption")?.textContent, `${strip}: no gain named`).toBe("");
        expect(shell.root.querySelector(".cv-gain-stack .value-box"), `${strip}: no gain to turn`).toBeNull();
        expect(shell.root.querySelector(".cv-gain .meter"), `${strip}: the meter stays`).not.toBeNull();
      }
      shell.ctx.nav.back();
      await flush();
    }
  });

  it("makes the channel view's [SAFE] and INPUT's [Clip Safe] one switch", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".cv-gain-buttons .btn")].find((b) => b.textContent === "SAFE")?.click();
    await flush();
    shell.ctx.nav.push({ id: "ch.input", strip: "ch1" });
    await flush();
    const clip = [...shell.root.querySelectorAll<HTMLElement>(".input-flag")].find((b) => b.textContent === "Clip Safe");
    expect(clip?.classList.contains("is-on"), "switched on from the channel view, lit on INPUT").toBe(true);
  });
});
