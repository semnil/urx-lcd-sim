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
- A closed decision, with what was rejected and what led to it, has its home under `docs/en/decisions/` and `docs/ja/decisions/`. The other documents say what the simulator is now
- The screen's state stays in the browser. To check from the factory state, use [Initialize All Memories] outside the screen (docs/en/architecture.md, "What survives a reload")
- The main checkout is the operator's. Ask before each fast-forward of it; without that permission, check a merged commit in a detached worktree of `origin/main`
- Merge when the operator says so and the checks are complete, with `gh pr merge --merge --match-head-commit <sha>`. The remote branch goes with the merge; what is left to clear is the worktree, the local branch and the main checkout's pull
- To see that a merge was published, compare the `assets/index-*.js` name that the site's `index.html` points to with the one in `dist/index.html` built from the same commit (the bundle carries the commit it was built from)
- Hand an image to the operator by the URL the running Vite serves it at (`work/` is served too), not by a relative path. For two images or more, or for candidates to choose between, make `work/<name>.html` with the enlarged images, headings and the figures in a table, and write only its URL
- `public/og-image.png` is a still capture with no tool in the repository to make it again: cut `.panel` out at 1280x800 and a device pixel ratio of 1, and paste it on the centre of 1200x630 of `#14161a`. Take it again when the look of the screen changes a great deal
- Do not set a word of the running text of a document in bold to stress it

## Checking a change on the screen

- The unit's screen has a fixed layout: a part that comes, goes or changes its value moves no other part. After touching such a part, make both states and compare the `getBoundingClientRect` of the parts of that screen; fix it if one moved. Told to remove everything but one thing, empty the rest and keep the frames and the positions of what stays. A box whose column says what it means goes in a grid column of fixed width, and every state with a different number of parameters is made and compared
- A capture taken with the browser's scroll bars hidden does not show them. After adding or changing a box that scrolls, measure each box's bar width and its sideways overflow in a browser that shows scroll bars (`src/style/columns.test.ts`, "the browser's own scroll bars", fails when a box is left out of the rules that hide them)
- A text size is chosen by drawing the candidates and taking the least pixel difference from the figure with the element's window slid, and its place by measuring how far the rows and columns of the ink are off. Then capture every screen again and see that no screen's difference from its figure grew. A value chosen by a score that allows sliding is compared again on the captured screen without sliding, and is left out on a screen where it does worse. Where the figure compared with is of another kind of strip, that screen's difference is no ground for a size or a place
- When what a stored state of the screen means is changed, check starting from a value the version before saved. `ui.*` values are stored in the browser as well and come back on a reload (all but the paths in `IN_FLIGHT` of `src/app/persist.ts`)

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
- Before raising a point with the operator, look it up in the guide's text as well as its figures; the text settles some of what no figure shows
- Before asking the operator to read a state on the unit, look for a figure of that state in `reference/ug-lcd/` and use it; ask only for what no figure shows
- A sheet or a list no figure shows is not copied from a similar screen: have each one confirmed
- A figure that shows a state does not say what causes it. Do not widen it to other tabs, rows or modes; have the conditions confirmed one at a time
- What the guide's text says is confirmed on the unit too, where the panel can do it
- A part whose name changes with the model is raised as unconfirmed on every model but the one it was confirmed on
- An icon is not chosen by pixel difference alone: compare what can be read of its shape (the number of teeth, the depth of a notch) by a measure of its own
- Where a figure shows the shape of a curve, match the figure before taking the law of the sound
- Write that a point was confirmed only where the sentence claims no more than the operator saw

## Relationship to the hardware

- The screens read and write values only by semantic dot paths. `BindingTable` ships empty, and no address that has not been verified on hardware is added to it (docs/en/architecture.md, "Addressing parameters"; `src/device/bridge-transport.test.ts` pins this)
