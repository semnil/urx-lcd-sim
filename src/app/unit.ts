// Hand the unit's meters and clock to the parts of the glass that read them.
//
// One unit is mounted on a page at a time: the meters and the clock read
// whatever unit was handed over last, until its release puts the simulated
// unit's back.

import type { UnitServices } from "../device/unit";
import { setClockSource } from "../model/clock";
import { setClipSafeSource, setMeterSource } from "../screens/meters";

/** Make `unit`'s meters and clock the ones the glass reads. Returns the release. */
export function useUnit(unit: UnitServices): () => void {
  const levels = unit.levels;
  if (levels.kind === "device") {
    setMeterSource(levels.read);
    setClipSafeSource((n) => levels.clipSafe(n));
  } else {
    setMeterSource(null);
    setClipSafeSource(null);
  }
  setClockSource(unit.clock);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setMeterSource(null);
    setClipSafeSource(null);
    setClockSource(null);
  };
}
