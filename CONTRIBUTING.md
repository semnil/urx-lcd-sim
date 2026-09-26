# Contributing

> 日本語版は [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) を参照してください.

urx-lcd-sim is maintained by one person, but outside help is welcome — especially comparisons
with a unit you own. The screens are built from the user guide's figures, and the figures do not
always match the unit: what a list holds, how many entries there are and their letter case are
things a figure alone does not settle.

Security problems go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Ways to help

- **Compare a screen with a unit you own.** Name the model and the Total Version shown on the
  unit's SETUP → Version screen.
- **File an issue** using the bug report or feature request template.
- **Send a pull request.** For a new screen, or for anything that departs from the user guide,
  open an issue first — it is better to agree on the evidence before you write the code.

## Setup

The toolchain and the commands are in the README ([Running it](README.md#running-it)).

The simulated unit is kept in the browser between visits. To start from the unit as it ships,
use [Reset the unit] above the screen.

## Conventions

- Identifiers and comments in English. Comments describe behavior, not history.
- Keep diffs minimal and match the surrounding style. Formatting-only changes are not accepted
  on their own.
- **Zero runtime dependencies** — no npm packages or CDNs in the shipped page. Dev dependencies
  are fine.

## What is drawn

- **Only the inside of the 480x272 screen.** No casing, physical knobs, connectors, product
  colors, or colors taken from product photos.
- Channel and bus icons are drawn as a plain square in the channel color
  ([Channel screen toolbar](docs/en/screen-inventory.md#channel-screen-toolbar)). The knob drawings of USER DEFINED KNOBS
  are drawn.
- A control that is not built is drawn where the unit has it, as a button that does nothing,
  and is listed in [known-issues.md](docs/en/known-issues.md) when the decision is made.
- A value the unit turns with a knob must be reachable with an on-screen control.
  `src/app/knob-reach.test.ts` holds this.

## The user guide as a source

- The captures extracted into `reference/` are Yamaha's copyright and are gitignored. Never
  commit them, put them in a build, or attach them to an issue or pull request — cite the
  figure instead. Regenerating them is described in the README ("Where the appearance comes
  from").
- Take values from a figure as described in
  [design-tokens.md](docs/en/design-tokens.md#how-the-values-were-sampled), and only from the
  part of the figure the guide's page shows.
- Shapes, dimensions and colors may be measured from a figure. What appears on a screen, how
  many there are, and letter case are confirmed against a unit, screen by screen.

## Device integration

Screens read and write semantic dot paths only. `BindingTable` ships empty: never add an
address that was not verified against a connected unit
([Addressing parameters](docs/en/architecture.md#addressing-parameters)).
`src/device/bridge-transport.test.ts` holds this.

## Documentation

- `docs/en/` and `docs/ja/` are kept in sync, as are `README.md` and `README.ja.md`: a change to
  one changes the same section of the other.
- Diagrams use Mermaid. Render a diagram you touched before sending it.

## Commits and pull requests

- Commit subjects are English sentences in the imperative, split by semantic unit.
- Pull request titles take a type prefix — `bug:`, `feature:`, `perf:`, `docs:`, `chore:` or
  `release:` — and the title and body are in English.
- Record changes to the simulator in `CHANGES.md` and `CHANGES_ja.md` under Unreleased.
- Include before/after crops for changes on screen, taken with the same model, display scale
  and crop.
- The GitHub Pages workflow runs `pnpm test` and `pnpm build` on every pull request to `main`.
- A release is a pull request that changes nothing but `version` in `package.json`; see the
  README ("Hosting").

By contributing, you agree that your work is licensed under the [MIT license](LICENSE).
