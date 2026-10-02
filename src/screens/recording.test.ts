import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { cardStamp, freeBytes, readCard } from "../model/card";
import { unitById } from "../model/units";
import { formatClock, pausePlayback, pauseTake, playedSeconds, recordTake, startPlayback, startRecorderClock, stopTake, takeOpen, takeSeconds } from "./recording";

async function store(): Promise<DeviceStore> {
  const s = new DeviceStore();
  await s.attach(new SimTransport(factoryState(unitById("URX44V"))));
  return s;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the recorder's take", () => {
  it("counts whole seconds while recording, holds them while paused, and clears them at stop", async () => {
    const s = await store();
    await s.set("sd.rec", "armed");
    await s.set("sd.recSeconds", 42);
    const t0 = 1_000_000;
    recordTake(s, t0);
    expect([takeOpen(s), takeSeconds(s, t0 + 999), takeSeconds(s, t0 + 3500)], "starting from armed counts from nothing").toEqual([true, 0, 3]);
    pauseTake(s, t0 + 5200);
    expect([s.str("sd.rec", ""), takeSeconds(s, t0 + 60_000)], "paused, the count holds").toEqual(["paused", 5]);
    recordTake(s, t0 + 70_000);
    expect(takeSeconds(s, t0 + 72_000), "resumed, it goes on from there").toBe(7);
    stopTake(s);
    expect([takeOpen(s), takeSeconds(s, t0 + 90_000), s.str("sd.rec", "")]).toEqual([false, 0, "idle"]);
  });

  it("carries the part of a second each run records across a pause, into the take [■] leaves", async () => {
    const takeAfter = async (runs: number[]): Promise<number[]> => {
      const s = await store();
      await s.set("sd.rec", "armed");
      let t = 1_000_000;
      for (const ms of runs) {
        recordTake(s, t);
        t += ms;
        pauseTake(s, t);
      }
      stopTake(s, t);
      return readCard(s)
        .filter((e) => e.kind === "take")
        .map((e) => e.seconds);
    };
    expect(await takeAfter([900, 900]), "two runs of 0.9 s").toEqual([1]);
    expect(await takeAfter([1900, 1900, 1900]), "three runs of 1.9 s").toEqual([5]);
    expect(await takeAfter(Array<number>(10).fill(100)), "ten runs of 0.1 s").toEqual([1]);
    expect(await takeAfter([5700]), "one run of 5.7 s").toEqual([5]);
  });

  it("carries the part of a second each run plays across a pause", async () => {
    const s = await store();
    let t = 1_000_000;
    for (let i = 0; i < 5; i++) {
      startPlayback(s, 0, t);
      t += 900;
      pausePlayback(s, t);
    }
    expect(playedSeconds(s, t), "five runs of 0.9 s").toBe(4);
  });

  it("stops a take at the moment it fills the room the card has left", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const s = await store();
    // Room for ten seconds of two tracks at 48 kHz, and a little over.
    await s.set("sd.capacity", 10 * 48_000 * 3 * 2 + 1_000);
    await s.set("sd.trackCount", 2);
    await s.set("sd.rec", "armed");
    recordTake(s);
    vi.advanceTimersByTime(4_300);
    pauseTake(s);
    vi.advanceTimersByTime(60_000);
    recordTake(s);
    // 4.3 s before the pause, so the room runs out 5.7 s after the take goes on.
    const full = Date.now() + 5_700;
    const stop = startRecorderClock(s, document.createElement("div"), 4_000);
    vi.advanceTimersByTime(4_000);
    const short = s.str("sd.rec", "");
    vi.advanceTimersByTime(4_000);
    stop();
    const take = readCard(s).find((e) => e.kind === "take");
    expect(short, "the control: 8.3 s in, short of the room").toBe("recording");
    expect([s.str("sd.rec", ""), take?.seconds, freeBytes(s)], "stopped, the take in the room").toEqual(["idle", 10, 1_000]);
    expect(take?.stamp, "written at the moment the room ran out").toBe(cardStamp(s, full));
  });

  it("leaves a take [■] stops no longer than the card has room for", async () => {
    const takeAfter = async (capacity: number | undefined): Promise<number[]> => {
      const s = await store();
      if (capacity !== undefined) await s.set("sd.capacity", capacity);
      await s.set("sd.trackCount", 2);
      await s.set("sd.rec", "armed");
      recordTake(s, 1_000_000);
      stopTake(s, 1_030_000);
      return readCard(s).map((e) => e.seconds);
    };
    expect(await takeAfter(undefined), "the control: a card with room").toEqual([30]);
    expect(await takeAfter(10 * 48_000 * 3 * 2 + 1_000), "room for ten seconds").toEqual([10]);
  });

  it("prints the count as hh:mm:ss", () => {
    expect([formatClock(0), formatClock(59), formatClock(3725), formatClock(-3)]).toEqual(["00:00:00", "00:00:59", "01:02:05", "00:00:00"]);
  });

  it("keeps a counter on the page at the running time without a repaint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const s = await store();
    await s.set("sd.rec", "armed");
    recordTake(s);
    const root = document.createElement("div");
    const counter = document.createElement("span");
    counter.dataset["recClock"] = "";
    counter.textContent = "00:00:00";
    root.appendChild(counter);
    const stop = startRecorderClock(s, root, 200);
    vi.advanceTimersByTime(2_100);
    const running = counter.textContent;
    pauseTake(s);
    vi.advanceTimersByTime(5_000);
    stop();
    expect([running, counter.textContent]).toEqual(["00:00:02", "00:00:02"]);
  });
});
