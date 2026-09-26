import { describe, expect, it } from "vitest";
import { formatDb, formatGain, formatPan } from "./dom";
import { FocusController } from "./focus";
import { dbSpec, faderSpec, formatValue, freqSpec, intSpec, panSpec } from "./param-spec";
import { fractionOf } from "./widgets";

describe("value formatting", () => {
  it("prints a level to two decimals, as the unit's value boxes do", () => {
    expect(formatDb(0)).toBe("0.00");
    expect(formatDb(-4.4)).toBe("-4.40");
  });

  it("prints a head amp in whole dB, with a sign only over zero", () => {
    expect(formatGain(14)).toBe("+14");
    expect(formatGain(0)).toBe("0");
    expect(formatGain(-8)).toBe("-8");
    // The unit shows no fraction of a dB on the head amp, wherever it lands.
    expect(formatGain(3.4)).toBe("+3");
    expect(formatGain(2.5)).toBe("+3");
    expect(formatGain(-0.4)).toBe("0");
  });

  it("gives the off mark no unit, since it is not a number of dB", () => {
    const level = faderSpec("ch.ch1.level", "LEVEL");
    expect(formatValue(level, -96.5)).toBe("-\u221e");
    expect(formatValue(level, 0), "every other value carries it").toBe("0.00dB");
  });

  it("prints the bottom of the fader as -∞ rather than a number", () => {
    const level = faderSpec("ch.ch1.level", "LEVEL");
    expect(level.format(-96.5)).toBe("-\u221e");
    // The notch above off is a real level the fader holds, not another -∞.
    expect(level.format(-96)).toBe("-96.0");
  });

  it("drops a fader level to one decimal from -10 dB down, as the unit prints it", () => {
    const level = faderSpec("ch.ch1.level", "LEVEL");
    expect([level.format(0), level.format(-4), level.format(-9.6)]).toEqual(["0.00", "-4.00", "-9.60"]);
    expect([level.format(-10), level.format(-25.6), level.format(-96)]).toEqual(["-10.0", "-25.6", "-96.0"]);
    expect(level.format(10), "the top of the range keeps both").toBe("10.00");
  });

  it("keeps every level the fader stops on inside the strip's box", () => {
    // The HOME box is a fixed width, so no stop on the travel may print wider
    // than the widest the box is set for.
    const level = faderSpec("ch.ch1.level", "LEVEL");
    const travel = level.travel;
    if (!travel) throw new Error("a fader has a travel");
    const stops = new Set([level.min, level.max]);
    for (let v = level.min, i = 0; i < 100; i++) {
      const next = travel.step(v, 1);
      stops.add(next);
      if (next === v) break;
      v = next;
    }
    expect(stops.size, "the whole ladder, both ends included").toBeGreaterThan(30);
    expect(Math.max(...[...stops].map((v) => level.format(v).length))).toBe(5);
  });

  it("prints pan as L / C / R the way the unit labels it", () => {
    expect(formatPan(0)).toBe("C");
    expect(formatPan(-1)).toBe("L1");
    expect(formatPan(63)).toBe("R63");
  });

  it("prints a frequency to three significant figures, switching to kHz above a kilohertz", () => {
    const spec = freqSpec("p", "HPF Freq.", 20, 20000, 80);
    expect(formatValue(spec, 80)).toBe("80.0Hz");
    expect(formatValue(spec, 440)).toBe("440Hz");
    expect(formatValue(spec, 1000)).toBe("1.00kHz");
    expect(formatValue(spec, 11800)).toBe("11.8kHz");
    expect(spec.format(80), "the box beside a caption prints the number alone").toBe("80.0");
  });
});

describe("control geometry", () => {
  it("puts a value at its range position for the knob graphic", () => {
    const spec = dbSpec("p", "LEVEL", -96.5, 10);
    expect(fractionOf(spec, -96.5)).toBe(0);
    expect(fractionOf(spec, 10)).toBe(1);
  });
});

describe("FocusController", () => {
  it("holds one control at a time, a parameter or a control that turns none", () => {
    const focus = new FocusController();
    focus.take(panSpec("ch.ch1.pan"));
    focus.takeKey("scene.list");
    expect([focus.holds("ch.ch1.pan"), focus.holds("scene.list"), focus.spec]).toEqual([false, true, null]);
    focus.take(panSpec("ch.ch1.pan"));
    expect([focus.holds("scene.list"), focus.holds("ch.ch1.pan")]).toEqual([false, true]);
    focus.release();
    expect([focus.holds("ch.ch1.pan"), focus.spec]).toEqual([false, null]);
  });

  it("keeps a pinned value against every other take until it is released", () => {
    const focus = new FocusController();
    const level = intSpec("ch.ch1.comp.oneKnob.level", "1-knob", 0, 100, 0);
    focus.take(panSpec("ch.ch1.pan"));
    focus.pin(level);
    focus.take(panSpec("ch.ch1.pan"));
    focus.takeKey("scene.list");
    expect([focus.holds("ch.ch1.comp.oneKnob.level"), focus.turns("ch.ch1.comp.oneKnob.level"), focus.turns("ch.ch1.pan")]).toEqual([true, true, false]);
    focus.unpin();
    expect([focus.holds("ch.ch1.comp.oneKnob.level"), focus.turns("ch.ch1.pan")]).toEqual([false, true]);
    focus.pin(level);
    focus.release();
    focus.take(panSpec("ch.ch1.pan"));
    expect(focus.holds("ch.ch1.pan"), "a release lets go of the pin").toBe(true);
    focus.unpin();
    expect(focus.holds("ch.ch1.pan"), "and unpinning with nothing pinned leaves the focus").toBe(true);
  });

  it("holds one parameter at a time", () => {
    const focus = new FocusController();
    focus.take(panSpec("ch.ch1.pan"));
    focus.take(dbSpec("ch.ch2.level", "LEVEL", -96.5, 10));

    expect(focus.holds("ch.ch1.pan")).toBe(false);
    expect(focus.holds("ch.ch2.level")).toBe(true);
  });

  it("notifies on take and release, but not on re-taking the same parameter", () => {
    const focus = new FocusController();
    const seen: (string | null)[] = [];
    focus.onChange((spec) => seen.push(spec?.path ?? null));

    focus.take(panSpec("ch.ch1.pan"));
    focus.take(panSpec("ch.ch1.pan"));
    focus.release();
    focus.release();

    expect(seen).toEqual(["ch.ch1.pan", null]);
  });
});
