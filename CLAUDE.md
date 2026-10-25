# CLAUDE.md — urx-lcd-sim

An unofficial simulator that lets you operate the 4.3-inch LCD touch screen (480x272) of the YAMAHA URX22 / URX44 / URX44V in a browser.
The overview and the commands are in README.md, and the structure and the flow of values are in docs/en/architecture.md; those are the source of truth. This file holds only the working rules they do not.

## Development

- The dev server is `pnpm dev --port 5188 --strictPort` (the same settings as `.claude/launch.json`)
- Pass or fail is decided by `pnpm test` (Vitest + jsdom) and `pnpm typecheck`, plus `pnpm test:e2e` (Playwright over `e2e/` on Chromium; `e2e/clip.spec.ts` also runs on WebKit, and `e2e/embed.spec.ts` runs as its own `embed` project against a second dev server). In an environment where Chromium is installed at `/opt/pw-browsers/chromium` (Claude Code's cloud environment), run it with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:e2e` rather than letting it fail. In an environment without WebKit, add `--project=chromium --project=embed` and leave only the WebKit side to CI
- A unit test has a limit of 5,000 ms each, and a load on every core nearly doubles its time, which makes it a test that fails now and then. Split a test that walks dozens of screens or values into an `it.each` per screen or value, start the Shell on the screen it reads with `new Shell(registry, store, model, [route])` (rather than drawing HOME and throwing it away), and wait for a redraw on `setImmediate` (`setTimeout(0)` idles about 1 ms each time)
- jsdom's `.click()` goes through neither the element at the pressed position nor the move of focus. When you add a menu, a dialog or a sheet, add one E2E test to `e2e/` that goes from opening it to answering it with real clicks. When you add a screen, add the way to it to `e2e/tour.ts` (`src/app/e2e-tour.test.ts` pins this)
- Every push to main whose checks pass publishes Pages; no tag and no GitHub Release is created. The steps are in README.md, "Hosting"
- The project keeps no change-log file (`CHANGES.md` or the like). The merged pull requests are the record of what changed
- **Override of the global CLAUDE.md's 「ドキュメント」 language rule**: this file is written entirely in English, and the documents are written in English, each of the pairs below with its Japanese counterpart beside it
- The pairs are `docs/en/` and `docs/ja/` for docs, `README.md` and `README.ja.md` for the README, `CONTRIBUTING.md` and `CONTRIBUTING.ja.md`, `SECURITY.md` and `SECURITY.ja.md`, and `CODE_OF_CONDUCT.md` and `CODE_OF_CONDUCT.ja.md`. When you touch a document that holds a Mermaid diagram, render it to check
- CONTRIBUTING's "What is drawn", "The user guide as a source" and "Device integration" mirror "What is drawn", "Primary source" and "Relationship to the hardware" below, written for outside contributors
- What has been decided not to build has its home in `docs/en/known-issues.md` and `docs/ja/known-issues.md`. Write it there when the decision is made
- The screen's state stays in the browser. To check from the factory state, use [Initialize All Memories] outside the screen (docs/en/architecture.md, "What survives a reload")

## What is drawn

- Only the inside of the screen (480x272) is drawn. Do not bring in the enclosure, the physical knobs, the connectors, the product's colors, or a palette taken from product photos
- A control decided not to be built is drawn as the face of a button that cannot be used, at the same position as on the unit, and pressing it does nothing (examples are in the controls table of docs/en/known-issues.md)
- Drawings of knobs on the screen (USER DEFINED KNOBS) may be drawn. Channel/bus icons (drawings of a person, a guitar, a laptop and the like) are not drawn; a single-colored square stands in for them (docs/en/screen-inventory.md, "Channel screen toolbar")
- A value the unit operates with a knob is made reachable by a control on the screen (`src/app/knob-reach.test.ts` pins this)

## Primary source (the user guide's screen captures)

- `reference/` is Yamaha's copyrighted work and is in `.gitignore`. Keep it out of commits, builds and anything published. To regenerate it, see README.md, "Where the appearance comes from"
- When a public document (docs/, README) gives the reason something is not built, avoid direct wording such as rights matters
- How values are taken from the figures is defined by docs/en/design-tokens.md, "How the values were sampled". Pixels outside the range printed on the page (`reference/ug-lcd/visible.json`) are not used as evidence. A figure number written in docs is the extracted name in `reference/ug-lcd/`
- The guide's figures sometimes differ from the unit. Shapes, dimensions and colors may be measured from the figures. What is listed, how many there are and letter case are not settled by a figure alone: implement it, then confirm those points with the operator (confirm letter case screen by screen, rather than inferring it from other screens)
- For a dimension or a shape no figure shows, do not write or propose "photograph the unit and measure it" as what settles it (a photograph cannot be measured pixel by pixel). Follow the operator's instruction or the form of an existing screen
- A settled fact about a screen is written in the code's comments, the docs and the tests

## Relationship to the hardware

- The screens read and write values only by semantic dot paths. `BindingTable` ships empty, and no address that has not been verified on hardware is added to it (docs/en/architecture.md, "Addressing parameters"; `src/device/bridge-transport.test.ts` pins this)
