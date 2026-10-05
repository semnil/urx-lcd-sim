// A way onto every screen the simulator registers, by touches alone, from a
// unit fresh from the factory. `src/app/e2e-tour.test.ts` holds it to the
// registry, so a screen added without a stop here fails `pnpm test`.

import type { Locator, Page } from "@playwright/test";

/** The glass. */
export const lcd = (page: Page): Locator => page.locator(".lcd[data-screen]:not([inert])");

/** A button on the glass, by its accessible name. */
export const button = (page: Page, name: string | RegExp, exact = false): Locator =>
  lcd(page).getByRole("button", { name, exact }).first();

/** The screen up on the glass. */
export const screenOf = (page: Page): Promise<string | null> => lcd(page).getAttribute("data-screen");

const onScreen = async (page: Page, id: string, timeout: number): Promise<boolean> =>
  page
    .locator(`.lcd[data-screen="${id}"]:not([inert])`)
    .waitFor({ timeout })
    .then(() => true, () => false);

/**
 * Touch `target` until screen `id` is up. A block or a strip that is not yet
 * selected takes the first touch to select it and opens its screen on the
 * second, so a second touch goes in where the first opened nothing.
 */
export async function tapInto(page: Page, target: Locator, id: string, at?: { x: number; y: number }): Promise<void> {
  await target.click(at ? { position: at } : {});
  if (await onScreen(page, id, 500)) return;
  await target.click(at ? { position: at } : {});
  if (!(await onScreen(page, id, 2000))) throw new Error(`a touch on ${String(target)} left ${await screenOf(page)} up, not ${id}`);
}

/** Pick `option` in the pulldown named `name`. */
async function pick(page: Page, name: string, option: string): Promise<void> {
  await button(page, name).click();
  await lcd(page).getByRole("option", { name: option, exact: true }).click();
}

/** Step the channel bank on HOME to `bank`. */
async function bank(page: Page, name: string): Promise<void> {
  await tapInto(page, lcd(page).getByRole("button", { name: /channel bank/ }), "bank-select");
  await tapInto(page, button(page, name), "home");
}

/**
 * A block of the channel view, touched where the block itself answers: off the
 * switches and value boxes inside it, and clear of its band, where a quick tap
 * that sinks the block now misses it (the sunk face is clipped there before it
 * has slid down).
 */
async function block(page: Page, name: string | RegExp, id: string): Promise<void> {
  const node = button(page, name, true);
  const at = await node.evaluate((n) => {
    const r = n.getBoundingClientRect();
    for (let y = r.top + 4; y < r.bottom - 12; y += 4) {
      for (let x = r.left + 4; x < r.right - 4; x += 4) {
        const hit = document.elementFromPoint(x, y);
        if (hit && n.contains(hit) && hit.closest("button, [role='button'], [role='spinbutton'], [role='slider']") === n) return { x: x - r.left, y: y - r.top };
      }
    }
    return null;
  });
  if (!at) throw new Error(`no part of the ${String(name)} block answers for itself`);
  await tapInto(page, node, id, at);
}

export interface Stop {
  /** The screen it reaches. */
  id: string;
  /** The stop it goes on from; HOME where there is none. */
  from?: string;
  /** The touches from there. */
  go(page: Page): Promise<void>;
}

const to = (id: string, from: string | undefined, name: string, exact = false): Stop => ({
  id,
  ...(from === undefined ? {} : { from }),
  go: (page) => tapInto(page, button(page, name, exact), id),
});

export const TOUR: Stop[] = [
  { id: "home", go: async () => undefined },
  { id: "bank-select", go: (page) => tapInto(page, lcd(page).getByRole("button", { name: /channel bank/ }), "bank-select") },
  to("sends-select", undefined, "Sends"),
  to("scene", undefined, "Initial Data"),
  to("scene.list", "scene", "Scene List"),
  {
    id: "scene.title",
    from: "scene.list",
    go: async (page) => {
      // 00 is a preset, which takes no store.
      await lcd(page).getByRole("option", { name: "01", exact: true }).click();
      await tapInto(page, button(page, "Store", true), "scene.title");
    },
  },

  to("setup", undefined, "SETUP", true),
  to("setup.mode", "setup", "Operation Mode"),
  to("setup.version", "setup", "Version", true),
  to("setup.license", "setup", "License", true),
  to("setup.language", "setup", "Language", true),
  to("setup.brightness", "setup", "Brightness", true),
  to("setup.udk", "setup", "User Defined Knobs"),
  to("setup.udk.assign", "setup.udk", "Knob C"),
  to("setup.rate", "setup", "Sampling Frequency"),
  to("setup.patch", "setup", "Output Patch"),
  to("setup.peripheral", "setup", "Peripheral"),
  to("setup.power", "setup", "Power Management"),
  to("setup.datetime", "setup", "Date/Time", true),
  to("setup.datetime.set", "setup.datetime", "Date / Time"),
  to("setup.datetime.zone", "setup.datetime", "Time Zone"),
  to("setup.integration", "setup", "Software Integration"),

  to("monitor", undefined, "MONITOR", true),
  to("monitor.level", "monitor", "Monitor", true),
  to("monitor.phones", "monitor", "Phones", true),
  to("monitor.osc", "monitor", "Oscillator", true),

  to("microsd", undefined, "microSD", true),
  to("microsd.recorder", "microsd", "Recorder", true),
  to("microsd.saveload", "microsd", "Save/Load", true),
  to("microsd.tools", "microsd", "Tools", true),
  { id: "microsd.name", from: "microsd.saveload", go: (page) => tapInto(page, button(page, "Save as"), "microsd.name") },

  to("channel-view", undefined, "CH 1 settings"),
  to("ch.setting", "channel-view", "CH 1 ch 1"),
  { id: "ch.input", from: "channel-view", go: (page) => block(page, /^A\.Gain /, "ch.input") },
  { id: "ch.gate", from: "channel-view", go: (page) => block(page, "GATE", "ch.gate") },
  { id: "ch.comp", from: "channel-view", go: (page) => block(page, "COMP", "ch.comp") },
  { id: "ch.eq", from: "channel-view", go: (page) => block(page, "EQ", "ch.eq") },
  { id: "ch.insfx", from: "channel-view", go: (page) => block(page, "INS FX", "ch.insfx") },
  to("ch.sendto", "channel-view", "SEND TO"),
  {
    id: "ch.ssmcs",
    go: async (page) => {
      await tapInto(page, button(page, "CH 1 settings"), "channel-view");
      await tapInto(page, button(page, "CH 1 ch 1"), "ch.setting");
      await pick(page, "COMP / EQ", "SSMCS");
      await tapInto(page, button(page, "Back", true), "channel-view");
      await block(page, "SSMCS", "ch.ssmcs");
    },
  },
  to("ch.ssmcs.comp", "ch.ssmcs", "Next SSMCS screen"),
  to("ch.ssmcs.sc", "ch.ssmcs.comp", "Next SSMCS screen"),
  to("ch.ssmcs.eq", "ch.ssmcs.sc", "Next SSMCS screen"),
  {
    id: "ch.ducker",
    go: async (page) => {
      await bank(page, "CH 5 - 12");
      await tapInto(page, button(page, "CH 5/6 settings"), "channel-view");
      await block(page, "DUCKER", "ch.ducker");
    },
  },
  {
    id: "ch.delay",
    go: async (page) => {
      await bank(page, "MIX, ST STREAMING");
      await tapInto(page, button(page, "STREAMING settings"), "channel-view");
      await block(page, "DELAY", "ch.delay");
    },
  },
  {
    id: "ch.effect",
    go: async (page) => {
      await bank(page, "FX 1 - 2");
      await tapInto(page, button(page, "FX1 settings"), "channel-view");
      await block(page, "FX1 effect", "ch.effect");
    },
  },
];

/** Open the page fresh from the factory and take the touches onto `stop`'s screen. */
export async function reach(page: Page, stop: Stop): Promise<void> {
  const chain: Stop[] = [];
  for (let s: Stop | undefined = stop; s; s = s.from === undefined ? undefined : TOUR.find((t) => t.id === s?.from)) chain.unshift(s);
  await page.goto("./");
  await page.locator('.lcd[data-screen="home"]:not([inert])').waitFor();
  for (const s of chain) await s.go(page);
  if ((await screenOf(page)) !== stop.id) throw new Error(`the way onto ${stop.id} ended on ${await screenOf(page)}`);
}
