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
//               read what it passes in, and an action runs only where it says so

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

/** An operation the unit carries out on its own memory, card or recorder. */
export type UnitAction =
  | "scene.recall"
  | "scene.store"
  | "scene.protect"
  | "scene.delete"
  | "settings.save"
  | "settings.load"
  | "card.insert"
  | "card.eject"
  | "card.format"
  | "card.test"
  | "card.delete"
  | "card.rename"
  | "card.newFolder"
  | "recorder.arm"
  | "recorder.record"
  | "recorder.pause"
  | "recorder.stop"
  | "playback.start"
  | "playback.pause"
  | "playback.stop";

export interface UnitActions {
  /**
   * Carry out `action`. `emulate` is what the simulated unit does for it; a unit
   * that carries the action out itself, or refuses it, does not run it. True when
   * the action was taken.
   */
  perform(action: UnitAction, emulate: () => unknown): boolean;
}

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

/** Every action carried out on the simulated memory, card and recorder. */
export const emulatedActions: UnitActions = {
  perform(_action, emulate) {
    void emulate();
    return true;
  },
};

/** Every action refused, each one reported to `onRefused`. */
export function refusedActions(onRefused?: (action: UnitAction) => void): UnitActions {
  return {
    perform(action) {
      onRefused?.(action);
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
