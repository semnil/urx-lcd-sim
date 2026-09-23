// User Defined Knobs.
//
// Four pages of four knobs, each holding the name of what it turns. The SETUP
// screen assigns them, the knob readout bar shows the page in force, and the
// factory state seeds every slot unassigned, so the shape lives here rather
// than in each of the three.

import type { ParamPath } from "../device/path";
import { path } from "../device/path";
import { formatLevel } from "../ui/dom";
import type { NumericSpec } from "../ui/param-spec";
import { brightnessSpec, dbSpec, faderSpec, scaleSpec } from "../ui/param-spec";

/** The pages the knobs are spread over, in the order the bank buttons list them. */
export const UDK_BANKS = [1, 2, 3, 4] as const;

/** The four knobs on each page. */
export const UDK_KNOBS = ["A", "B", "C", "D"] as const;

/** What a knob carries until one is chosen. */
export const UDK_UNASSIGNED = "No Assign";

/** What each knob carries on a unit as it ships, by bank and knob; every knob not named is unassigned. */
export const UDK_SHIPPED: Readonly<Record<string, string>> = {
  "1.A": "Phones 1 Level",
  "1.B": "Phones 2 Level",
  "2.A": "Brightness Screen",
  "2.D": "Oscillator Level",
  "3.A": "Monitor 1 Level",
  "3.B": "Monitor 2 Level",
};

/** Where one knob's assignment is kept. */
export function udkPath(bank: number, knob: string): ParamPath {
  return path("setup", "udk", bank, knob);
}

/**
 * One thing a knob can be put on. The unit picks it in three steps — Function,
 * then Parameter 1, then Parameter 2 — and the guide's appendix "Functions that
 * can be assigned to the user defined knobs" is this table.
 */
export interface UdkAssignment {
  /** The name the store keeps. */
  value: string;
  /** The three columns of the picker, blank where the appendix prints "---". */
  fn: string;
  p1: string;
  p2: string;
  /** The shorter name the readout bar carries under the value. */
  short: string;
  /** The parameter, or null while nothing is on the knob. */
  spec: NumericSpec | null;
}

export const UDK_ASSIGNMENTS: readonly UdkAssignment[] = [
  { value: UDK_UNASSIGNED, fn: UDK_UNASSIGNED, p1: "", p2: "", short: "", spec: null },
  {
    value: "Brightness Screen",
    fn: "Brightness",
    p1: "Screen",
    p2: "",
    short: "BRT Screen",
    spec: brightnessSpec(),
  },
  // The bar prints a monitor level bare, and the oscillator's in dB.
  ...[1, 2].map((n) => ({
    value: `Monitor ${n} Level`,
    fn: "Monitor",
    p1: `Monitor ${n}`,
    p2: "Level",
    short: `Monitor ${n}`,
    spec: { ...faderSpec(path("monitor", n, "level"), `Monitor ${n}`), unit: "" },
  })),
  ...[1, 2].map((n) => ({
    value: `Phones ${n} Level`,
    fn: "Phones",
    p1: `Phones ${n}`,
    p2: "Level",
    short: `Phones ${n}`,
    spec: scaleSpec(path("phones", n, "level"), `Phones ${n}`, 2),
  })),
  {
    value: "Oscillator Level",
    fn: "Oscillator",
    p1: "Level",
    p2: "",
    short: "OSC Level",
    spec: { ...dbSpec(path("osc", "level"), "Level", -96, 0, -14), format: formatLevel },
  },
];

/** The assignment a knob carries, by the name kept in the store. */
export function udkAssignment(value: string): UdkAssignment {
  return UDK_ASSIGNMENTS.find((a) => a.value === value) ?? (UDK_ASSIGNMENTS[0] as UdkAssignment);
}

/** What the assignment card writes, top to bottom. */
export function udkLines(a: UdkAssignment): string[] {
  return [a.fn, a.p1, a.p2].filter(Boolean);
}

/** The distinct entries of one picker column, in the order the unit lists them. */
export function udkColumn(column: "fn" | "p1" | "p2", fn?: string, p1?: string): string[] {
  const rows = UDK_ASSIGNMENTS.filter((a) => (fn === undefined || a.fn === fn) && (p1 === undefined || a.p1 === p1));
  return [...new Set(rows.map((a) => a[column]).filter(Boolean))];
}

/** The assignment a set of picked columns comes to, or null while it is short. */
export function udkFromColumns(fn: string, p1: string, p2: string): UdkAssignment | null {
  return UDK_ASSIGNMENTS.find((a) => a.fn === fn && a.p1 === p1 && a.p2 === p2) ?? null;
}
