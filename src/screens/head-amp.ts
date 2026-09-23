// The head amp a channel shows (user guide, "Dedicated channel screen > INPUT
// screen" and "Channel view > Main area").
//
// The analog head amp — A.Gain, [+48V], [HI-Z] and [Clip Safe] — belongs to the
// MIC/LINE connector, not to a channel. A channel on a MIC/LINE source shows
// the head amp of the connector the side in view is fed from, so two channels
// on one connector show and turn the same values; they are kept under the mono
// channel of the connector's number. [HI-Z] stands only on a connector that
// takes it; while it is on, A.Gain stops at +40 dB. On any other
// source a channel shows that source's digital gain (`source-gain.ts`) and none
// of the analog head amp's buttons; on no source it shows no gain at all.

import type { AppContext } from "../app/context";
import type { ParamPath } from "../device/path";
import type { DeviceStore, WriteRule } from "../device/store";
import type { Strip } from "../model/types";
import { inputChannels, monoStripId } from "../model/units";
import { digitalGainPath, digitalGainShipped } from "../model/source-gain";
import type { NumericSpec } from "../ui/param-spec";
import { A_GAIN_HI_Z_MARKS, A_GAIN_HI_Z_MAX_DB, A_GAIN_MARKS, D_GAIN_MARKS, gainSpec } from "../ui/param-spec";
import { stripLane } from "./strip-state";

/**
 * The number of the MIC/LINE connector feeding lane `lane` of the channel
 * `stripId` — a mono channel's own, a stereo channel's on that side — or none
 * while it is on any other source.
 */
export function micLineJack(store: DeviceStore, stripId: string, lane: number): number | undefined {
  const channels = inputChannels(stripId);
  const pair = /^MIC\/LINE (\d+)\/(\d+)$/.exec(store.str(`ch.${stripId}.source`, ""));
  if (!pair || channels.length === 0) return undefined;
  // A mono channel takes the connector at its own place in its pair.
  const side = channels.length === 1 ? ((channels[0] ?? 1) % 2 === 1 ? 0 : 1) : lane;
  return Number(pair[side + 1]);
}

/**
 * The mono channel whose MIC/LINE connector feeds `strip` — the side in view,
 * for a stereo channel — or none while it is on any other source.
 */
export function micLineConnector(ctx: AppContext, strip: Strip): Strip | undefined {
  const connector = micLineJack(ctx.store, strip.id, strip.kind === "stIn" ? stripLane(ctx, strip) : 0);
  return ctx.model.inputs.find((s) => s.kind === "monoIn" && s.channels[0] === connector);
}

/** Where the connector numbered `n` keeps one of its analog head amp's values: under the mono channel of its number. */
export function jackParam(n: number, key: "gain" | "phantom" | "hiZ" | "clipSafe"): ParamPath {
  return `ch.${monoStripId(n)}.${key}`;
}

/** Where a connector keeps one of its analog head amp's switches. */
export function headAmpSwitch(connector: Strip, key: "phantom" | "hiZ" | "clipSafe"): ParamPath {
  return jackParam(connector.channels[0] ?? 0, key);
}

/**
 * The gain a channel's first column shows, or none, and the connector whose
 * analog head amp it is while it is one.
 */
export function headAmp(ctx: AppContext, strip: Strip): { spec: NumericSpec | undefined; connector: Strip | undefined } {
  const connector = micLineConnector(ctx, strip);
  if (connector) {
    const hiZ = ctx.store.bool(headAmpSwitch(connector, "hiZ"), false);
    const max = hiZ ? A_GAIN_HI_Z_MAX_DB : 70;
    return { connector, spec: gainSpec(`ch.${connector.id}.gain`, "A.Gain", -8, max, -8, hiZ ? A_GAIN_HI_Z_MARKS : A_GAIN_MARKS) };
  }
  const source = ctx.store.str(`ch.${strip.id}.source`, "");
  // A bus has no head amp, and a channel on no source has no gain.
  if ((strip.kind !== "monoIn" && strip.kind !== "stIn") || source === "None") return { connector, spec: undefined };
  return { connector, spec: gainSpec(digitalGainPath(source), "D.Gain", -24, 24, digitalGainShipped(source), D_GAIN_MARKS) };
}

/** Switching a connector's HI-Z on brings its A.Gain down to +40 dB where it stood above. Switching it off leaves the gain where it is. */
export function hiZWriteRule(store: DeviceStore): WriteRule {
  return (path, value) => {
    const connector = /^ch\.([^.]+)\.hiZ$/.exec(path)?.[1];
    if (connector === undefined || value !== true) return [];
    const gain = `ch.${connector}.gain`;
    return store.num(gain, -8) > A_GAIN_HI_Z_MAX_DB ? [[gain, A_GAIN_HI_Z_MAX_DB]] : [];
  };
}
