// Where the oscillator's signal goes.
//
// The unit sends it to either lane of the two mix buses, to the two FX buses,
// and to either lane of the stereo bus. A lane it is assigned to carries the
// oscillator on top of whatever the mixer is already putting there.

export interface OscTarget {
  /** The tail of the path holding whether the oscillator is assigned here. */
  id: string;
  /** The name on the Assign screen's button. */
  label: string;
  /** The meter that reads this target. */
  meter: string;
  /** Which lane of that meter, or both where the target is not a side. */
  lane: number | null;
  /** Whether the unit ships assigned here. */
  shipped: boolean;
  /** The kind of bus, which the assigned box is lit in the colour of. */
  bus: "mix" | "fx" | "stereo";
}

export const OSC_TARGETS: readonly OscTarget[] = [
  { id: "mix1L", label: "MIX\n1 L", meter: "bus.mix1", lane: 0, shipped: false, bus: "mix" },
  { id: "mix1R", label: "MIX\n1 R", meter: "bus.mix1", lane: 1, shipped: false, bus: "mix" },
  { id: "mix2L", label: "MIX\n2 L", meter: "bus.mix2", lane: 0, shipped: false, bus: "mix" },
  { id: "mix2R", label: "MIX\n2 R", meter: "bus.mix2", lane: 1, shipped: false, bus: "mix" },
  { id: "fx1", label: "FX 1", meter: "fx1", lane: null, shipped: false, bus: "fx" },
  { id: "fx2", label: "FX 2", meter: "fx2", lane: null, shipped: false, bus: "fx" },
  { id: "stereoL", label: "STEREO\nL", meter: "bus.stereo", lane: 0, shipped: true, bus: "stereo" },
  { id: "stereoR", label: "STEREO\nR", meter: "bus.stereo", lane: 1, shipped: true, bus: "stereo" },
];
