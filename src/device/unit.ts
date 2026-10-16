// The unit behind the screens.
//
// Everything the unit does by itself sits behind one Unit: the values it holds
// (`params`, the DeviceTransport the store attaches to), what its meters read
// (`levels`), the operations it carries out on its own memory, card and
// recorder (`actions`), and its clock (`clock`). The screens ask the Unit and
// never which kind of unit answers.
//
//   simulated   the values in this process, the meters reading the synthetic
//               signal, every action carried out on the simulated memory, the
//               computer's clock
//   device      a unit or a host that holds the values elsewhere: its meters
//               read what it passes in, and each operation is handed to it,
//               with its arguments, to carry out or refuse

import type { DeviceTransport } from "./transport";

/** Meter readings a unit passes in, in dB: one entry per channel asked for. */
export type LevelReader = (meterId: string, channels: number) => number[];

/** What the meters read: the synthetic signal, or the readings a unit passes in. */
export type UnitLevels =
  | { kind: "simulated" }
  | {
      kind: "device";
      read: LevelReader;
      /** Whether the Clip Safe of connector `n` is holding its gain down. */
      clipSafe(connector: number): boolean;
    };

/** The unit's clock, in milliseconds since the epoch. */
export interface UnitClock {
  now(): number;
}

/** The bank a scene is stored on. */
export type SceneBank = "Standard" | "Simple";

/** An entry on the card: the folder it is in and the name it carries there. */
export interface CardFile {
  dir: string;
  name: string;
}

/**
 * An operation the unit carries out on its own memory, card or recorder, with
 * everything the unit needs to carry it out: the scene number and its bank, the
 * entry on the card and the folder it is in, the name typed. Whether the unit
 * can carry it out — a scene stored under the number, a file on the card, room
 * for a take — is the unit's to decide.
 */
export type UnitOp =
  /** Put the scene stored under `scene` back on the mixer; 0 and the presets are the factory scenes. */
  | { kind: "scene.recall"; scene: number }
  /** Store the mixer as it stands under `scene` on `bank`, titled `title`. */
  | { kind: "scene.store"; bank: SceneBank; scene: number; title: string }
  /** Protect the scene stored under `scene` on `bank`, or let it go unprotected. */
  | { kind: "scene.protect"; bank: SceneBank; scene: number; protect: boolean }
  /** Delete the scene stored under `scene` on `bank`. */
  | { kind: "scene.delete"; bank: SceneBank; scene: number }
  /** Write the unit's settings to `file`, over a settings file of that name in its folder or as a new one. */
  | { kind: "settings.save"; file: CardFile }
  /** Put the settings file `file` back on the unit. */
  | { kind: "settings.load"; file: CardFile }
  | { kind: "card.insert" }
  | { kind: "card.eject" }
  /** Format the card, naming its volume `label`; an empty label leaves it Untitled. */
  | { kind: "card.format"; label: string }
  | { kind: "card.test" }
  /** Take `file` off the card. */
  | { kind: "card.delete"; file: CardFile }
  /** Give `file` the name `to` in its folder. */
  | { kind: "card.rename"; file: CardFile; to: string }
  /** Make a folder `file.name` in the folder `file.dir`. */
  | { kind: "card.newFolder"; file: CardFile }
  /** [●] on the recorder stopped. */
  | { kind: "recorder.arm" }
  /** [▶] on the recorder armed, or on a take paused. */
  | { kind: "recorder.record" }
  /** [⏸] on a take recording. */
  | { kind: "recorder.pause" }
  /** [■], or [●] pressed again while armed. */
  | { kind: "recorder.stop" }
  /** Play `file`, or go on with it where it is paused. */
  | { kind: "playback.start"; file: CardFile }
  | { kind: "playback.pause" }
  | { kind: "playback.stop" };

/** The kinds of operation the unit carries out. */
export type UnitAction = UnitOp["kind"];

/**
 * Who carries the operations out: the simulator, on its own memory, card and
 * recorder, or a unit that is handed each one and answers whether it took it.
 * The simulated unit also stops a take at the room the card has and a file at
 * its end; a device unit's recorder and playback move only as it reports them.
 */
export type UnitActions = { kind: "simulated" } | { kind: "device"; perform(op: UnitOp): boolean };

/** Everything of a Unit but its values. */
export interface UnitServices {
  levels: UnitLevels;
  clock: UnitClock;
  actions: UnitActions;
}

export interface Unit extends UnitServices {
  params: DeviceTransport;
}

/** The computer's clock. */
export const computerClock: UnitClock = { now: () => Date.now() };

/** Every operation carried out on the simulated memory, card and recorder. */
export const emulatedActions: UnitActions = { kind: "simulated" };

/** Every operation refused, each one reported to `onRefused`. */
export function refusedActions(onRefused?: (op: UnitOp) => void): UnitActions {
  return {
    kind: "device",
    perform(op) {
      onRefused?.(op);
      return false;
    },
  };
}

/** The simulated unit's meters, actions and clock. */
export const simulatedServices: UnitServices = {
  levels: { kind: "simulated" },
  clock: computerClock,
  actions: emulatedActions,
};
