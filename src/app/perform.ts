// Hand an operation to the unit behind the screens (src/device/unit.ts).
//
// A device unit is handed the operation and answers whether it took it, and
// nothing of the simulator's own memory, card or recorder moves. The simulated
// unit carries it out here, on the values of this process.

import type { UnitOp } from "../device/unit";
import { emulateCardOp } from "../screens/microsd";
import { emulateSceneOp } from "../screens/scene";
import type { AppContext } from "./context";

/** Carry `op` out on the unit `ctx` stands for. True when the unit took it; an operation the page holds shut is not taken. */
export function perform(ctx: AppContext, op: UnitOp): boolean {
  if (ctx.locks.op(op.kind)) return false;
  if (ctx.actions.kind === "device") return ctx.actions.perform(op);
  switch (op.kind) {
    case "scene.recall":
    case "scene.store":
    case "scene.protect":
    case "scene.delete":
      return emulateSceneOp(ctx, op);
    default:
      return emulateCardOp(ctx, op);
  }
}
