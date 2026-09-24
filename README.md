# urx-lcd-sim

An **unofficial** operation simulator for the YAMAHA URX series (URX22 / URX44 / URX44V): the
unit's 4.3-inch LCD touch screen, driven in a browser.

It exists to walk through the unit's screens and operating procedures without the hardware in
front of you. It is a standalone project, and it talks to no hardware by itself.

> 日本語: [README.ja.md](README.ja.md)

[Open the simulator](https://urx-lcd-sim.semnil.com/)

## What it does

- Navigation from HOME (Overview) through channel view, SETUP, MONITOR, SCENE, microSD and the
  dedicated channel screens
- Touch operation of the on-screen controls (buttons, value boxes, pulldowns, lists, dialogs)
- The INS FX and FX-channel effects: choosing one, and setting that effect's own parameters
- USER DEFINED KNOBS mode
- URX22 / URX44 / URX44V model switching, which changes the strip inventory and the menus
- Display scale of 50% / 75% / 100% / 150% / 200% (also `?zoom=150`)
- Full keyboard operation (Tab to move, Enter / Space to activate, arrows to turn a value)
- Scene memories, a microSD card holding takes and settings files, and the whole unit kept in the
  browser between visits; [Reset the unit] starts again from the unit as it ships

The unit's physical controls are not reproduced. Every value is reached on the glass: drag it,
turn the wheel over it, or use the arrow keys. The knob strip along the bottom of the screen is a
readout on the unit; here a cell holding a value turns it the same way.

Meters show a synthetic signal, which follows the faders, the oscillator, what is in CUE and the A.Gain. The
simulator carries no audio, and a take it records carries none either.

## Running it

Use Node.js from `.node-version` and the pnpm version in `package.json`.

```bash
pnpm install
pnpm dev
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Typecheck and production build |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | Typecheck only |

No runtime dependencies. The dev dependencies are TypeScript, Vite and Vitest.

## Hosting

[GitHub Pages](https://urx-lcd-sim.semnil.com/) serves the released production build.
The [GitHub Pages workflow](.github/workflows/pages.yml) runs tests, typechecking and a production
build for pull requests targeting `main` and pushes to `main`. Deployment follows only when the
push changes `package.json`'s `version` and those checks pass. Changes to other manifest fields
and ordinary merges run the checks without publishing.

To release, merge the application changes first, then merge a separate pull request that only
updates `version` in `package.json`. This is the application's version source, also used by the
simulator's VERSION screen. The workflow compares the commits before and after that push and
deploys only `dist/` built from the pushed commit. Deployment jobs queue without replacing a
pending job and fetch `main` again immediately before publishing. If a later version change has
landed, the older run skips deployment; ordinary subsequent changes do not prevent the release.
A failed release can be retried by re-running its original Actions run while it is still the
latest version update. There is no manual deployment trigger that bypasses these checks.
After the checks pass, the workflow tags the tested commit as `v<version>` and creates a draft
GitHub Release with generated release notes. Stable `X.Y.Z` versions and `-alpha`, `-beta`, or
`-rc` suffixes optionally followed by digits and dots are accepted; the suffixed versions are marked as
prereleases. Publish the draft manually after reviewing it. Pages deployment waits for the tag
and draft to exist, but does not wait for the draft to be published.

A retry reuses an existing tag only if it resolves to the same tested commit, and preserves an
existing Release and its edited notes. If tag creation succeeds but Release creation fails,
re-running completes the draft. A conflicting tag fails the run without moving it. Superseded
version updates still receive their tag and draft; the latest-version check controls Pages only.

The repository's **Settings → Pages** uses **GitHub Actions** as its source, with
`urx-lcd-sim.semnil.com` as the custom domain and **Enforce HTTPS** enabled. The domain's DNS
(Domain Name System) record is a `CNAME` pointing to `semnil.github.io`. The custom domain is
configured in Pages settings; this Actions deployment does not use a `CNAME` file.

## Documentation

Under [docs/en/](docs/en/), with the same documents in Japanese under [docs/ja/](docs/ja/):

| Document | Contents |
| --- | --- |
| [architecture.md](docs/en/architecture.md) | Layers, value flow, how a screen is registered |
| [device-integration.md](docs/en/device-integration.md) | Putting a real unit behind the screens |
| [screen-inventory.md](docs/en/screen-inventory.md) | Every screen the unit has, and what is built |
| [screen-map.md](docs/en/screen-map.md) | Which screen leads to which |
| [known-issues.md](docs/en/known-issues.md) | What the unit has and this simulator does not build |
| [design-tokens.md](docs/en/design-tokens.md) | Where the palette and the dimensions came from |

## Where the appearance comes from

The palette and the dimensions were sampled pixel by pixel from the 480x272 screen captures
embedded in the user guide (English, revision D0). The factory channel values are a URX44V's own
settings after a factory reset. Details are in [design-tokens.md](docs/en/design-tokens.md).

`reference/` holds those extracted captures. They are Yamaha's copyright, so the directory is
gitignored and appears in neither the repository nor a build. To regenerate it locally:

```bash
node scripts/extract-ug-screens.mjs --pdf <path to the user guide PDF>
```

Some captures are shown only in part on the guide's pages. The part the pages show is written to
`reference/ug-lcd/visible.json` by the following (needs python3 with pypdf and cryptography):

```bash
python3 scripts/ug-visible-ranges.py --pdf <path to the user guide PDF>
```

## Relationship to the hardware

The simulator owns no device protocol. Values live behind `DeviceTransport`
(`src/device/transport.ts`), and by default a `SimTransport` holds them in this process. Driving
hardware means a host application injects its own device link into a `BridgeTransport`.

There is no path by which an unvalidated address reaches a unit: the path-to-address table
(`BindingTable`) starts empty, and a write to an unbound path is refused.

## Disclaimer

This software is provided "as is", without warranty of any kind, and the authors are not liable
for any damage to hardware, loss of settings, or other loss arising from its use. Nothing here
writes to a unit on its own: the binding table ships empty, and driving hardware takes a host
application that supplies both a validated catalog and a device link. Building that integration
means sending data to hardware, which always carries some risk.

## License

[MIT](LICENSE) © semnil

The build bundles the IBM Plex Sans typeface (Copyright © 2017 IBM Corp., with Reserved Font Name "Plex") under
the SIL Open Font License 1.1. The font files and the license text are in `public/fonts/` and are copied into the
build unchanged.

## Trademark notice

YAMAHA, URX22, URX44, and URX44V are trademarks of Yamaha Corporation. This is an
unofficial, independent project and is not affiliated with, sponsored by, or endorsed
by Yamaha.
