# Summary

<!-- What changes, and why. Link the issue this closes, if there is one. -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Performance
- [ ] Documentation
- [ ] Chore / dependencies

## Testing

<!-- Only what this PR's own checks do not already report. The GitHub Pages workflow runs
     `pnpm test` and `pnpm build` (typecheck included) on every pull request to main, and
     its result is in the checks above — do not restate it here.

     The assumptions line is answered, never used to defer: an observation you could take
     yourself is taken before opening this, and what is left names what would settle it. -->

- [ ] Compared with a unit — model and Total Version:
- [ ] Compared with the user guide — language, revision and page:
- [ ] Ran something the checks do not cover — say what and what it showed:
- [ ] Nothing beyond the checks
- [ ] Assumptions this PR rests on are listed here, each with what would settle it — or "none"

## UI changes

<!-- Before/after crops of the part that changed, taken with the same model, display scale and
     crop. Screenshots of the simulator only: no copies of the user guide's figures. Remove
     this section if the pull request changes nothing on screen. -->

## Checklist

<!-- Only what the checks cannot decide. -->

- [ ] Tests added for new behavior
- [ ] `docs/en` and `docs/ja` (and `README.md` / `README.ja.md`) updated together
- [ ] `CHANGES.md` and `CHANGES_ja.md` updated together
- [ ] A control or screen left unbuilt is drawn where the unit has it and listed in `docs/*/known-issues.md`
- [ ] Nothing from `reference/` is committed, and no address is added to `BindingTable` without verification on hardware
