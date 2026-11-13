# Decisions about how changes are made

> 日本語版は [../../ja/decisions/development-flow.md](../../ja/decisions/development-flow.md) を参照してください.

Closed decisions about pull requests that run side by side, long branches, reviews, and how the
project is published and documented, with what led to them. The rules that hold day to day are in
`AGENTS.md`, "Development".

## Parallel pull requests are made independent of the merge order

- **Decision** (2026-10-04): where a test of one pull request collides with a change of behaviour
  in another that is open beside it, a form that does not depend on which merges first is looked
  for before anything else. It is shown to pass as a whole, and to hold under mutation, on a tree
  that merges the two, and then it is pushed.
- **Reason**: a pull request that left the collision to the order of merging ("the one merged
  later rewrites it") was sent back in review for failing once the other was merged. A form that
  needs no order to be decided was chosen over deciding one.
- **How it is done**:
  - A fix two pull requests both carry goes to one of them.
    [#43](https://github.com/semnil/urx-lcd-sim/pull/43) fixed one path of a defect that
    [#35](https://github.com/semnil/urx-lcd-sim/pull/35) fixed on every path, so the fix was
    taken out of #43. Where the same fix is found on both sides while main is merged in, the
    judgement goes to one function and the other applies it, and the tests go to one side with a
    line added for what only the other checked.
  - A test that pins a behaviour another pull request changes is rewritten as a relation that
    holds before and after it: "a drag with Shift moves a fifth of a plain drag", "the wheel with
    Shift turns as far as an arrow key with Shift", in place of the size of the step.
  - Whether the other pull request's tests hold the value that was taken out is checked by
    mutating the merged tree. That day the wheel's step with Shift was held by neither, the
    mutation survived, and a test of the relation was added.
  - The merge is tried in a detached worktree made for it, the other branches merged in one at a
    time. Where both sides only added tests, both are kept and the names of the tests on each
    side are counted before the run.
- **What happened** (2026-10-04): the review of #43 found that its tests would fail once
  [#37](https://github.com/semnil/urx-lcd-sim/pull/37) was merged and that it fixed a part of
  what #35 fixed. The same day a review of #35 asked for a block that
  [#40](https://github.com/semnil/urx-lcd-sim/pull/40) adds to be put into #35 as well. The
  review was revised and that point withdrawn: #40 was merged first, #35 was carried onto it, and
  a regression test over the keys shows the two restrictions holding together. A defect the same review found
  that was there before #35, saving onto a full card, was left out of #35 and fixed in
  [#46](https://github.com/semnil/urx-lcd-sim/pull/46).

## Carrying a long branch onto main

- **Decision**: a branch carried onto a main that has moved is integrated where nothing conflicts
  as well as where something does, and what the pull request says is measured again on the new
  tree.
- **Where integration is needed without a conflict**:
  - A part main added falls outside a rule the branch wrote, a change on main takes away what a
    test of the branch rests on, or what the branch's docs say no longer holds on main. Before a
    merge of main is committed, what the pull requests taken in confirmed is set against the
    places the branch's docs say "not confirmed" or "confirmed only on".
  - CSS collides by specificity. A rule of the branch that merged without conflict,
    `.lcd.is-udk:not(.has-readout) .main`, outweighed main's rule for a sheet that covers the
    glass by its `:not()`, and a test of main failed. It was written as a rule of the same
    specificity placed after the other.
  - Where main changed a mechanism, the branch's new paths are put on it. Where main rebuilt a
    module the branch touched, the branch's behaviour is written again on main's mechanism rather
    than the hunks fitted together, and the commit messages are rewritten to the new diff.
  - Where main already carries the same fix, the branch's diff for it goes in the rebase. The
    commit is made one of docs and tests alone and given a new title.
- **How it is checked**:
  - Every file that had no conflict and was not edited for the integration equals the tree
    `git merge-tree --write-tree origin/main <old tip>` gives. A file edited for it is checked by
    the lines below.
  - Every commit that touches `src/` is unpacked with `git archive` and put through
    `tsc --noEmit` and the whole suite. A correction is folded into the commit that changed the
    behaviour, and the types are checked again after folding.
  - After a module is written again on main's mechanism, the lines each side added that are gone
    are counted as sets, file by file, and only the rewritten places may be among them. The
    rewritten branches are mutated.
  - The pull request's figures are taken again by the script that took them and compared pixel
    by pixel with the ones before. What its text measured is measured on the new tree, or kept
    with the old tip's hash beside it.
  - The push is `--force-with-lease=<branch>:<the hash it had>`.
- **What happened** (2026-10-04 and 05): three branches were carried onto main in a day (23, 47
  and 44 commits), and a fourth five times as its siblings were merged. One was pushed with a
  corrected line that had not been through the type check, and failed in CI. Mutating a module
  written again on main's mechanism brought out a defect in it, a save that dropped a change made
  while it waited.

## A review that points at a defect a sibling fixed

- **Decision**: where a review points at a defect that a sibling pull request, since merged, has
  fixed, the branch is carried onto the main that holds the fix and the point is measured there.
- **What happened** (2026-10-04): a second review of
  [#45](https://github.com/semnil/urx-lcd-sim/pull/45) said that another finger changes the value
  under the finger that drags. It had read the code at the base #45 was first cut from, and #37,
  merged by then, had fixed it. The defect was shown on the old base (a second finger took both
  values to 4.00 dB) and shown gone on main (one value alone, at 3.20 dB), and a test that drags
  two values at once was added to hold it.

## A change to what a stored value means

- **Decision**: when what a stored state of the screen means is changed, the change is checked
  starting from a value the version before saved (`AGENTS.md`, "Checking a change on the screen").
- **What happened** (2026-09-27, the review of
  [#22](https://github.com/semnil/urx-lcd-sim/pull/22)): a value the version before had saved
  with Edit open and the list switched to Simple (`scene.bank=Simple`, `ui.sceneMenu=Edit`)
  brought Edit back when the new version was opened on it and switched to Standard.

## No change-log file

- Decided on 2026-10-16. What was removed and what replaced it are in
  [#95](https://github.com/semnil/urx-lcd-sim/pull/95).

## Pages on every push, no tag and no Release

- Decided on 2026-10-25. The flow that remains, and APP Version showing the commit a build was
  made from, are in [#133](https://github.com/semnil/urx-lcd-sim/pull/133).
- **History**: from v0.3.0 to v1.0.0 the merge of a pull request that changed only `version` in
  `package.json` made a tag and a draft Release, and Pages was published from that push. `version`
  no longer moves.

## English as the base language

- Decided on 2026-10-20. What was translated and linked is in
  [#112](https://github.com/semnil/urx-lcd-sim/pull/112).
- **History**: the texts of pull requests already merged were left as they were. What Japanese
  they hold is quotation (search terms, headings of the Japanese documents, text on the screen,
  the names of a form's choices) and one heading as it stood when its pull request was written.

## The three longest tests were split

- Decided on 2026-09-27: the limit of 5,000 ms a test stays, and the tests were split. What was
  split and how long the tests took before and after are in
  [#25](https://github.com/semnil/urx-lcd-sim/pull/25).
