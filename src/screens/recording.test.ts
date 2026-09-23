import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { formatClock, pauseTake, recordTake, startRecorderClock, stopTake, takeOpen, takeSeconds } from "./recording";

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
