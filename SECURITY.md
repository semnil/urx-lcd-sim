# Security Policy

> 日本語版は [SECURITY.ja.md](SECURITY.ja.md) を参照してください.

urx-lcd-sim is a static web page served by GitHub Pages. There is no server component, no
account system, and no telemetry, and the page makes no network requests of its own beyond
loading its own files. What the simulated unit holds is kept in the browser's `localStorage`
under a single key, and the only input the page reads from its URL is `?zoom=`.

## Supported versions

Only the version published at <https://urx-lcd-sim.semnil.com> is supported. Fixes ship as a
new release rather than as a backport.

## Reporting a vulnerability

Report it privately through GitHub —
**[Security → Report a vulnerability](https://github.com/semnil/urx-lcd-sim/security/advisories/new)**.
Please do not open a public issue for a security problem.

Helpful details:

- The version (shown as APP Version on the simulator's SETUP → Version screen), and the browser
  and OS
- What an attacker gains, and the steps to reproduce it

This is a single-maintainer project, so handling is best effort: expect a first reply within
about a week. You will be credited in the advisory unless you prefer otherwise.

## In scope

- Script execution in the page, reachable from a crafted URL or from text the page renders,
  including names typed into the simulated unit
- A write reaching a host application's device link for a path that `BindingTable` does not
  bind (see [Addressing parameters](docs/en/architecture.md#addressing-parameters))
- The site at <https://urx-lcd-sim.semnil.com> serving anything other than the build of a tested
  commit on `main`, including through a takeover of its domain
- The release workflow: tags, draft Releases, and the permissions its jobs receive
- Secrets exposed in the repository, in CI, or in a release

## Out of scope

- Vulnerabilities in the unit's firmware, in the units themselves, or in Yamaha's software —
  report those to Yamaha
- A host application that puts its own device link behind `BridgeTransport` — report those to
  that application
- Findings that require an attacker who already runs script on the site's origin or code on
  your machine, including writing its `localStorage`
- GitHub Pages itself — report that to GitHub
- Scanner output with no demonstrated impact
