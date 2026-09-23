import { describe, expect, it } from "vitest";
import { factoryState } from "./defaults";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import type { UnitModel } from "./types";
import { bankCount, bankStrips, findStrip, STRIPS_PER_BANK } from "./types";
import { URX22, URX44, URX44V, inputChannels, monoStripId } from "./units";

describe("unit models", () => {
  it("gives URX44V four mono channels and four stereo pairs from CH 5/6", () => {
    const mono = URX44V.inputs.filter((s) => s.kind === "monoIn").map((s) => s.label);
    const stereo = URX44V.inputs.filter((s) => s.kind === "stIn").map((s) => s.label);

    expect(mono).toEqual(["CH 1", "CH 2", "CH 3", "CH 4"]);
    expect(stereo).toEqual(["CH 5/6", "CH 7/8", "CH 9/10", "CH 11/12"]);
  });

  it("shifts the URX22 stereo pairs down to start at CH 3/4", () => {
    const stereo = URX22.inputs.filter((s) => s.kind === "stIn").map((s) => s.label);
    expect(URX22.inputs.filter((s) => s.kind === "monoIn")).toHaveLength(2);
    expect(stereo).toEqual(["CH 3/4", "CH 5/6", "CH 7/8", "CH 9/10"]);
  });

  it("withholds the Date/Time menu from the URX22", () => {
    expect(URX22.hasDateTime).toBe(false);
    expect(URX44.hasDateTime).toBe(true);
  });

  it("never leaves a strip id shared between two strips", () => {
    for (const model of [URX22, URX44, URX44V]) {
      const ids = [...model.inputs, ...model.outputs].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("channel banks", () => {
  it("pages four strips at a time", () => {
    expect(STRIPS_PER_BANK).toBe(4);
    expect(bankStrips(URX44V.inputs, 0).map((s) => s.id)).toEqual(["ch1", "ch2", "ch3", "ch4"]);
    expect(bankStrips(URX44V.inputs, 1).map((s) => s.id)).toEqual(["ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"]);
  });

  it("lays the URX44V banks out the way the unit does", () => {
    // INPUT steps CH 1 - 4 -> CH 5 - 12 -> FX 1 - 2, and OUTPUT holds MIX / ST / STREAMING
    // in one bank.
    expect(bankCount(URX44V.inputs)).toBe(3);
    expect(bankStrips(URX44V.inputs, 2).map((s) => s.label)).toEqual(["FX1", "FX2"]);
    expect(bankCount(URX44V.outputs)).toBe(1);
    expect(bankStrips(URX44V.outputs, 0).map((s) => s.label)).toEqual(["MIX 1", "MIX 2", "STEREO", "STREAMING"]);
  });

  it("derives the smaller models' banks from their own strip counts", () => {
    // The URX44 carries the same eleven-minus-PAD inputs as the URX44V, so it
    // pages the same three banks. The URX22 has two fewer mono channels, which
    // is eight strips and therefore two banks — a consequence of the confirmed
    // four-per-bank rule, not a second reading off hardware.
    expect(bankCount(URX44.inputs)).toBe(3);
    expect(bankCount(URX22.inputs)).toBe(2);
    expect(bankStrips(URX22.inputs, 0).map((s) => s.label)).toEqual(["CH 1", "CH 2", "CH 3/4", "CH 5/6"]);
    expect(bankStrips(URX22.inputs, 1).map((s) => s.label)).toEqual(["CH 7/8", "CH 9/10", "FX1", "FX2"]);
  });

  it("puts a short final bank in its own page rather than dropping it", () => {
    const banks = bankCount(URX44V.inputs);
    const last = bankStrips(URX44V.inputs, banks - 1);
    expect(last.length).toBeGreaterThan(0);
    expect(banks * STRIPS_PER_BANK).toBeGreaterThanOrEqual(URX44V.inputs.length);
  });

  it("reports at least one bank even for a short side", () => {
    expect(bankCount([])).toBe(1);
  });

  it("finds a strip on either side by id", () => {
    expect(findStrip(URX44V, "bus.stereo")?.kind).toBe("stereo");
    expect(findStrip(URX44V, "ch_9_10")?.kind).toBe("stIn");
    expect(findStrip(URX44V, "nope")).toBeUndefined();
  });
});

describe("factory state", () => {
  it("seeds the device-captured head-amp gain on the mono channels", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.ch1.gain")).toBe(-8);
    expect(state.get("ch.ch1.level")).toBe(0);
    expect(state.get("ch.ch1.on")).toBe(true);
  });

  it("seeds the device-captured gate and comp values", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.ch1.gate.threshold")).toBe(-50);
    expect(state.get("ch.ch1.gate.range")).toBe(-56);
    expect(state.get("ch.ch1.comp.threshold")).toBe(-18);
    expect(state.get("ch.ch1.comp.ratio")).toBe(3);
  });

  it("leaves gate and comp off but EQ on, as the capture has them", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.ch1.gate.on")).toBe(false);
    expect(state.get("ch.ch1.comp.on")).toBe(false);
    expect(state.get("ch.ch1.eq.on")).toBe(true);
  });

  it("gives a stereo channel a balance and no pan", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.ch_5_6.balance")).toBe(0);
    expect(state.has("ch.ch_5_6.pan")).toBe(false);
  });

  it("gives the STREAMING strip the delay the other outputs do not have", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.bus.stream.delay.on")).toBe(false);
    expect(state.has("ch.bus.mix1.delay.on")).toBe(false);
  });

  it("patches the mono channels from MIC/LINE in pairs", () => {
    const state = factoryState(URX44V);
    expect(state.get("ch.ch1.source")).toBe("MIC/LINE 1/2");
    expect(state.get("ch.ch2.source")).toBe("MIC/LINE 1/2");
    expect(state.get("ch.ch3.source")).toBe("MIC/LINE 3/4");
    expect(state.get("ch.ch4.source")).toBe("MIC/LINE 3/4");
  });

  it("patches the stereo channels from AUX IN and the three USB MAIN returns", () => {
    for (const model of [URX44V, URX44]) {
      const state = factoryState(model);
      expect(
        ["ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"].map((id) => state.get(`ch.${id}.source`)),
        model.id,
      ).toEqual(["AUX IN", "USB MAIN A", "USB MAIN B", "USB MAIN C"]);
    }
    // The URX22's stereo strips start two channels lower and take the same table.
    const small = factoryState(URX22);
    expect(["ch_3_4", "ch_5_6", "ch_7_8", "ch_9_10"].map((id) => small.get(`ch.${id}.source`))).toEqual([
      "AUX IN",
      "USB MAIN A",
      "USB MAIN B",
      "USB MAIN C",
    ]);
  });

  it("ships the STREAMING bus listening to the stereo bus", () => {
    for (const model of [URX44V, URX44, URX22]) {
      expect(factoryState(model).get("ch.bus.stream.source"), model.id).toBe("STEREO");
    }
  });

  it("gives an FX return a send into each MIX bus and none into an FX bus", () => {
    for (const model of [URX44V, URX44, URX22]) {
      const state = factoryState(model);
      for (const fx of ["fx1", "fx2"]) {
        for (const mix of ["bus.mix1", "bus.mix2"]) {
          expect(state.get(`ch.${fx}.send.${mix}.level`), `${model.id} ${fx} -> ${mix}`).toBe(LEVEL_MIN_DB);
          expect(state.get(`ch.${fx}.send.${mix}.on`)).toBe(true);
          expect(state.get(`ch.${fx}.send.${mix}.pre`)).toBe(false);
          expect(state.get(`ch.${fx}.send.${mix}.balance`)).toBe(0);
        }
        expect(state.has(`ch.${fx}.send.fx2.level`), "an FX return reaches no FX bus").toBe(false);
        expect(state.get(`ch.${fx}.send.bus.stereo.on`), "and still reaches the stereo bus").toBe(true);
      }
      // A MIX bus is the far end of a send and reaches the stereo bus alone.
      expect(state.has("ch.bus.mix1.send.bus.mix2.level")).toBe(false);
      expect(state.get("ch.bus.mix1.send.bus.stereo.on")).toBe(true);
    }
  });

  it("starts on Standard mode with the first input strip selected", () => {
    const state = factoryState(URX44V);
    expect(state.get("setup.operationMode")).toBe("Standard");
    expect(state.get("ui.selectedStrip")).toBe("ch1");
    expect(state.get("ui.bankSide")).toBe("input");
  });
});

describe("the high-impedance connectors", () => {
  it("marks the channels whose connector takes an instrument, and no others", () => {
    const hiZ = (m: UnitModel): string[] => m.inputs.filter((str) => str.hiZ).map((str) => str.label);
    expect(hiZ(URX44V), "CH 3 and CH 4 on the four-mono units").toEqual(["CH 3", "CH 4"]);
    expect(hiZ(URX44)).toEqual(["CH 3", "CH 4"]);
    expect(hiZ(URX22), "CH 2 on the two-mono unit").toEqual(["CH 2"]);
  });
});

describe("strip ids", () => {
  it("reads back from an id the input channels of every strip of every unit, and none from any other strip", () => {
    for (const model of [URX44V, URX44, URX22]) {
      for (const strip of [...model.inputs, ...model.outputs]) {
        const expected = strip.kind === "monoIn" || strip.kind === "stIn" ? strip.channels : [];
        expect(inputChannels(strip.id), `${model.id} ${strip.id}`).toEqual(expected);
      }
      for (const strip of model.inputs.filter((s) => s.kind === "monoIn")) {
        expect(monoStripId(strip.channels[0] ?? 0), `${model.id} ${strip.label}`).toBe(strip.id);
      }
    }
  });
});
