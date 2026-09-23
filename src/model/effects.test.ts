import { describe, expect, it } from "vitest";
import { formatValue } from "../ui/param-spec";
import { EFFECT_NAMES, FX_EFFECTS, INPUT_INSERT_EFFECTS, OUTPUT_INSERT_EFFECTS, effectFaces, effectParams, effectSpec } from "./effects";

// The catalogue is a transcription of what the unit prints, so the checks here
// read what a control would print rather than the number behind it.

/** What an effect's control reads at the value it comes up at. */
function readings(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const face of effectFaces(name)) {
    const values: Record<string, number> = {};
    for (const p of face.params) if (p.kind === "num") values[p.key] = p.fallback;
    for (const p of face.params) {
      // A multi-band effect repeats a row per band, so the page names the row.
      const row = face.label ? `${face.label} ${p.label}` : p.label;
      if (p.kind === "num") out[row] = formatValue(effectSpec("b", p, values), p.fallback);
      else if (p.kind === "select") out[row] = p.fallback;
      else out[row] = p.fallback ? "ON" : "OFF";
    }
  }
  return out;
}

/** The seconds the reverb on FX 2 stops on, from its own law. */
const REVR3_SECONDS = Array.from({ length: 70 }, (_, i) =>
  i <= 47 ? Number((0.3 + 0.1 * i).toFixed(1)) : i <= 57 ? Number((5.0 + 0.5 * (i - 47)).toFixed(1)) : i <= 67 ? i - 47 : i === 68 ? 25 : 30,
);

/** One control's reading at a value of its own. */
function reads(name: string, key: string, value: number, siblings: Record<string, number> = {}): string {
  const param = effectParams(name).find((p) => p.key === key);
  if (param?.kind !== "num") throw new Error(`${name} has no ${key}`);
  return formatValue(effectSpec("b", param, siblings), value);
}

describe("the effect catalogue", () => {
  it("names every effect the two insert menus and the two FX channels offer", () => {
    const menus = [
      ...INPUT_INSERT_EFFECTS,
      ...OUTPUT_INSERT_EFFECTS,
      ...(FX_EFFECTS.fx1 ?? []),
      ...(FX_EFFECTS.fx2 ?? []),
    ];
    const missing = menus.filter((o) => o.name !== "No Effect" && effectParams(o.name).length === 0);
    expect(missing.map((o) => o.name)).toEqual([]);
    // Nothing in the catalogue is unreachable from a menu either.
    const offered = new Set(menus.map((o) => o.name));
    expect(EFFECT_NAMES.filter((n) => !offered.has(n))).toEqual([]);
  });

  it("keeps every effect's own value inside the control that sets it", () => {
    const outside: string[] = [];
    for (const name of EFFECT_NAMES) {
      for (const face of effectFaces(name)) {
        const values: Record<string, number> = {};
        for (const p of face.params) if (p.kind === "num") values[p.key] = p.fallback;
        for (const p of face.params) {
          if (p.kind === "select" && !p.options.includes(p.fallback)) outside.push(`${name} ${p.label}`);
          if (p.kind !== "num") continue;
          const spec = effectSpec("b", p, values);
          if (p.fallback < spec.min || p.fallback > spec.max) outside.push(`${name} ${p.label} = ${p.fallback}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it("keeps an effect's own keys clear of the ones the channel holds beside them", () => {
    // The values hang off the same prefix as the name of the effect and its
    // switch, so a key called one of those would be the same path as the other.
    const clash: string[] = [];
    for (const name of EFFECT_NAMES) {
      for (const p of effectParams(name)) {
        if (["on", "effect", "type"].includes(p.key) && !(name === "Crunch" || name === "Lead")) clash.push(`${name} ${p.key}`);
      }
    }
    // Crunch and Lead do print a row called Type; it is an insert, and an insert
    // keeps its name under `effect` rather than under `type`.
    expect(clash).toEqual([]);
    for (const name of ["Crunch", "Lead"]) {
      expect(effectParams(name).map((p) => p.key)).toContain("type");
    }
    for (const fx of [...(FX_EFFECTS.fx1 ?? []), ...(FX_EFFECTS.fx2 ?? [])]) {
      expect(effectParams(fx.name).map((p) => p.key), fx.name).not.toContain("type");
    }
  });

  it("reads a filter frequency the way each family prints one", () => {
    // The reverb on FX 1 prints whole hertz under a kilohertz; everything else
    // prints three figures throughout.
    expect(reads("Rev-X Hall", "hpf", 22.4)).toBe("22Hz");
    expect(reads("Rev-X Hall", "hpf", 31.5)).toBe("32Hz");
    expect(reads("Rev-X Hall", "lowFreq", 250)).toBe("250Hz");
    expect(reads("Rev-X Hall", "lpf", 1000)).toBe("1.00kHz");
    expect(reads("Rev-X Hall", "lpf", 18000)).toBe("18.0kHz");
    expect(reads("Rev.R3 Hall", "hpf", 1)).toBe("21.2Hz");
    expect(reads("Rev.R3 Hall", "lpf", 0)).toBe("50.0Hz");
    expect(reads("Mono Delay", "lpf", 100)).toBe("16.0kHz");
  });

  it("reads THRU at the end of the window each filter passes the whole band at", () => {
    expect(reads("Rev.R3 Hall", "hpf", 0), "the high-pass passes everything at the bottom").toBe("THRU");
    expect(reads("Rev.R3 Hall", "lpf", 101), "the low-pass at the top").toBe("THRU");
    expect(reads("Mono Delay", "hpf", 0)).toBe("THRU");
    expect(reads("Ping Pong", "lpf", 101)).toBe("THRU");
  });

  it("reads a reverb's first reflections at the times the unit prints", () => {
    expect(reads("Rev-X Hall", "initialDelay", 0.1)).toBe("0.1ms");
    expect(reads("Rev-X Hall", "initialDelay", 6.4)).toBe("6.4ms");
    expect(reads("Rev.R3 Hall", "initialDelay", 41)).toBe("41.0ms");
    expect(reads("Rev.R3 Hall", "initialDelay", 200)).toBe("200.0ms");
  });

  it("moves a REV-X reverb time when the room around it moves", () => {
    // The two are one setting: turning Room Size changes what the reverb time
    // reads without the reverb time's own control being touched.
    const small = reads("Rev-X Hall", "revTime", 23, { roomSize: 0 });
    const large = reads("Rev-X Hall", "revTime", 23, { roomSize: 31 });
    expect([small, large]).toEqual(["0.89s", "2.68s"]);
    // And the three rooms run for different lengths at the same setting.
    expect(reads("Rev-X Room", "revTime", 23, { roomSize: 0 })).toBe("1.32s");
    expect(reads("Rev-X Plate", "revTime", 23, { roomSize: 0 })).toBe("1.53s");
  });

  it("reads a delay time to a tenth of a millisecond at every length", () => {
    expect(reads("Mono Delay", "delay", 500)).toBe("500.0ms");
    expect(reads("Mono Delay", "delay", 2000)).toBe("2000.0ms");
    expect(reads("Ping Pong", "delay", 1350)).toBe("1350.0ms");
  });

  it("reads a gain that has faded out as no number at all", () => {
    expect(reads("Clean", "output", 0)).toBe("-∞");
    expect(reads("Clean", "output", 127)).toBe("0.0dB");
    expect(reads("M.B.Comp", "lowGain", 0)).toBe("-∞");
    expect(reads("M.B.Comp", "lowGain", 55)).toBe("18dB");
  });

  it("reads a value either side of zero with a minus below it and no plus above it", () => {
    // Ping Pong's FB.Gain and Pitch Fix's Coarse, Fine and Formant (URX44V, 2026-09-22).
    expect([14, 0, -14].map((v) => reads("Ping Pong", "feedback", v))).toEqual(["14%", "0%", "-14%"]);
    // The unit prints no unit beside either of the two (URX44V, 2026-09-23).
    expect([3, -3].map((v) => reads("Pitch Fix", "coarse", v))).toEqual(["3", "-3"]);
    expect([10, -10].map((v) => reads("Pitch Fix", "fine", v))).toEqual(["10", "-10"]);
    expect([5, -5].map((v) => reads("Pitch Fix", "formant", v))).toEqual(["5", "-5"]);
  });

  it("reads the balance between a reverb's reflections and its tail", () => {
    expect(reads("Rev.R3 Hall", "erBalance", 0)).toBe("E63>R");
    expect(reads("Rev.R3 Hall", "erBalance", 63)).toBe("E=R");
    expect(reads("Rev.R3 Hall", "erBalance", 126)).toBe("E<R63");
  });

  it("comes up at the settings the unit comes up at", () => {
    // Every effect, every row: these are the values the unit holds after a reset,
    // and taking an effect puts them back.
    const want: Record<string, Record<string, string>> = {
    "Compander-H": { "Threshold": "-10.0dB", "Ratio": "3.5:1", "Width": "6dB", "Gain": "0.0dB", "Attack": "1ms", "Release": "229ms" },
    "Compander-S": { "Threshold": "-8.0dB", "Ratio": "4.0:1", "Width": "24dB", "Gain": "0.0dB", "Attack": "25ms", "Release": "165ms" },
    "M.B.Comp": { "Main 1-knob": "OFF", "Main 1-knob Level": "0", "Main L-M Xover": "125Hz", "Main M-H Xover": "3.35kHz", "Main Release": "75ms", "Main Out Gain": "4dB", "Low Bypass": "OFF", "Low Threshold": "-20dB", "Low Ratio": "2.0:1", "Low Attack": "30ms", "Low Gain": "2dB", "Mid Bypass": "OFF", "Mid Threshold": "-20dB", "Mid Ratio": "2.0:1", "Mid Attack": "40ms", "Mid Gain": "2dB", "High Bypass": "OFF", "High Threshold": "-20dB", "High Ratio": "2.0:1", "High Attack": "10ms", "High Gain": "2dB" },
    "Pitch Fix": { "Pitch Correction": "ON", "Pitch Coarse": "0", "Pitch Fine": "0", "Pitch Formant": "0", "MIDI Control": "Off", "Key": "C", "Scale": "Chromatic", "C": "ON", "C#": "ON", "D": "ON", "D#": "ON", "E": "ON", "F": "ON", "F#": "ON", "G": "ON", "G#": "ON", "A": "ON", "A#": "ON", "B": "ON", "Note Limit Low/High Mix": "126", "Note Limit Low/High Limit Low": "C-2", "Note Limit Low/High Limit High": "G8", "Note Limit Low/High Speed": "100", "Note Limit Low/High Tolerance": "50" },
    "Clean": { "Volume": "1.9", "Distortion": "0.0", "Blend": "5.0", "": "Off", "Speed": "5.0", "Depth": "5.0", "Bass": "6.1", "Middle": "5.0", "Treble": "4.0", "Presence": "3.0", "Output": "-11.9dB", "Gate": "OFF", "Gate Level": "2.0", "SP Type": "JC 2x12", "Mic Position": "Center" },
    "Crunch": { "Type": "Bright", "Gain": "4.6", "Bass": "4.7", "Middle": "7.0", "Treble": "5.3", "Presence": "2.8", "Output": "-17.7dB", "Gate": "OFF", "Gate Level": "2.0", "SP Type": "AC 4x10", "Mic Position": "Center" },
    "Lead": { "Type": "High", "Gain": "10.0", "Master": "4.9", "Bass": "6.6", "Middle": "8.0", "Treble": "3.0", "Presence": "2.9", "Output": "-19.4dB", "Gate": "OFF", "Gate Level": "2.0", "SP Type": "BS 4x12", "Mic Position": "Center" },
    "Drive": { "Amp Type": "Vintage2", "Gain": "7.5", "Master": "4.0", "Bass": "4.0", "Middle": "5.0", "Treble": "8.0", "Presence": "9.0", "Output": "-19.1dB", "Gate": "OFF", "Gate Level": "2.0", "SP Type": "AM 4x12", "Mic Position": "Center" },
    "Rev-X Hall": { "Diffusion": "10", "Hi.Ratio": "0.8", "Lo.Ratio": "1.2", "Lo.Freq.": "800Hz", "Rev.Time": "2.49s", "Ini.Delay": "3.2ms", "Decay": "27", "Room Size": "29", "HPF": "32Hz", "LPF": "6.30kHz" },
    "Rev-X Room": { "Diffusion": "8", "Hi.Ratio": "0.7", "Lo.Ratio": "1.1", "Lo.Freq.": "800Hz", "Rev.Time": "0.78s", "Ini.Delay": "3.2ms", "Decay": "5", "Room Size": "15", "HPF": "40Hz", "LPF": "4.50kHz" },
    "Rev-X Plate": { "Diffusion": "8", "Hi.Ratio": "0.9", "Lo.Ratio": "1.0", "Lo.Freq.": "800Hz", "Rev.Time": "2.66s", "Ini.Delay": "3.2ms", "Decay": "5", "Room Size": "18", "HPF": "80Hz", "LPF": "8.00kHz" },
    "Rev.R3 Hall": { "Density": "3", "FB.Gain": "0%", "E/R Delay": "1.7ms", "E/R Bal.": "E8>R", "Rev.Time": "1.80s", "Ini.Delay": "39.5ms", "Hi.Ratio": "0.7", "Diffusion": "7", "HPF": "80.0Hz", "LPF": "4.50kHz" },
    "Rev.R3 Room": { "Density": "1", "FB.Gain": "0%", "E/R Delay": "3.2ms", "E/R Bal.": "E15>R", "Rev.Time": "1.60s", "Ini.Delay": "3.2ms", "Hi.Ratio": "0.4", "Diffusion": "7", "HPF": "140Hz", "LPF": "9.00kHz" },
    "Rev.R3 Plate": { "Density": "2", "FB.Gain": "0%", "E/R Delay": "0.1ms", "E/R Bal.": "E=R", "Rev.Time": "2.00s", "Ini.Delay": "19.0ms", "Hi.Ratio": "0.9", "Diffusion": "6", "HPF": "160Hz", "LPF": "9.00kHz" },
    "Mono Delay": { "HPF": "150Hz", "LPF": "8.50kHz", "Delay": "500.0ms", "FB.Gain": "20%", "Hi.Ratio": "0.7", "Sync": "OFF", "BPM": "120", "Note": "1/4" },
    "Ping Pong": { "HPF": "THRU", "LPF": "15.0kHz", "Delay Time": "500.0ms", "FB.Gain": "14%", "Hi.Ratio": "0.4", "Sync": "OFF", "BPM": "120", "Note": "1/4" },
    };
    expect(Object.fromEntries(EFFECT_NAMES.map((n) => [n, readings(n)]))).toEqual(want);
  });

  it("comes up on a setting each of its controls can stop on", () => {
    // A value between two stops prints a number the control cannot produce: the
    // first detent in either direction jumps somewhere else.
    const between: string[] = [];
    for (const name of EFFECT_NAMES) {
      for (const p of effectParams(name)) {
        if (p.kind !== "num") continue;
        const travel = effectSpec("b", p, {}).travel;
        if (!travel) continue;
        if (travel.valueAt(travel.position(p.fallback)) !== p.fallback) between.push(`${name} ${p.label}`);
      }
    }
    expect(between).toEqual([]);
  });

  it("reads every leg of the tables a reading is taken from", () => {
    // The laws are piecewise, and a point in the first leg says nothing about
    // the legs above it.
    expect([0, 47, 48, 57, 58, 67, 68, 69].map((i) => reads("Rev.R3 Hall", "revTime", REVR3_SECONDS[i] ?? 0))).toEqual([
      "0.30s", "5.00s", "5.50s", "10.0s", "11.0s", "20.0s", "25.0s", "30.0s",
    ]);
    // REV-X reverb time grows in four steps of its own, and again with the room.
    expect([0, 47, 57, 67, 69].map((i) => reads("Rev-X Hall", "revTime", i, { roomSize: 0 }))).toEqual([
      "0.10s", "1.72s", "3.43s", "6.87s", "10.3s",
    ]);
    // A band's make-up runs steeply below the middle of its scale and evenly above.
    expect([1, 10, 19, 20, 37, 55].map((i) => reads("M.B.Comp", "lowGain", i))).toEqual([
      "-60dB", "-40dB", "-19dB", "-17dB", "0dB", "18dB",
    ]);
    // An amp's output is read between the settings the unit was read at.
    expect([1, 8, 20, 40, 64, 96, 127].map((i) => reads("Clean", "output", i))).toEqual([
      "-57.3dB", "-48.0dB", "-32.1dB", "-20.1dB", "-11.9dB", "-4.9dB", "0.0dB",
    ]);
  });

  it("names the one slot the two delays do not share", () => {
    // The two take different lengths, so the row the unit calls Delay on one it
    // calls Delay Time on the other.
    expect(effectParams("Mono Delay").find((p) => p.key === "delay")?.label).toBe("Delay");
    expect(effectParams("Ping Pong").find((p) => p.key === "delay")?.label).toBe("Delay Time");
  });

  it("moves every reading it prints, one setting to the next", () => {
    // A control whose reading repeats leaves the operator turning it with the
    // screen saying nothing, which is what a step too fine for the reading does.
    const repeated: string[] = [];
    for (const name of EFFECT_NAMES) {
      for (const p of effectParams(name)) {
        if (p.kind !== "num") continue;
        const spec = effectSpec("b", p, {});
        const travel = spec.travel;
        let value = spec.min;
        let last = formatValue(spec, value);
        for (let i = 0; i < 6000; i++) {
          const next = travel ? travel.step(value, 1) : Math.min(spec.max, value + spec.step);
          if (next === value) break;
          const reading = formatValue(spec, next);
          if (reading === last) {
            repeated.push(`${name} ${p.label}: ${reading} at ${value} and ${next}`);
            break;
          }
          value = next;
          last = reading;
        }
      }
    }
    expect(repeated).toEqual([]);
  });

  it("ships no value the browser's own storage cannot carry back", () => {
    // What the unit holds is written as JSON, which turns an infinity into
    // nothing and reads it back as the fallback.
    const lost: string[] = [];
    for (const name of EFFECT_NAMES) {
      for (const p of effectParams(name)) {
        if (JSON.parse(JSON.stringify({ v: p.fallback })).v !== p.fallback) lost.push(`${name} ${p.key}`);
      }
    }
    expect(lost).toEqual([]);
  });

  it("gives the multi-band compressor a page per band, and Pitch Fix the unit's three", () => {
    expect(effectFaces("M.B.Comp").map((f) => f.label)).toEqual(["Main", "Low", "Mid", "High"]);
    expect(effectFaces("Pitch Fix").map((f) => f.label)).toEqual(["Pitch", "", "Note Limit Low/High"]);
    // The rest are one processor apiece, so they are one page.
    expect(EFFECT_NAMES.filter((n) => effectFaces(n).length > 1)).toEqual(["M.B.Comp", "Pitch Fix"]);
  });
});
