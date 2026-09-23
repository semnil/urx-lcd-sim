# Changes

## Unreleased

- Publish the simulator on GitHub Pages at `urx-lcd-sim.semnil.com` after a separate application version update is merged into `main` and tests and the production build pass. Ordinary merges and pull requests run checks without deploying.
- Queue deployments and skip superseded version updates immediately before publishing, including retries of older runs.
- Automatically tag tested version updates and create draft GitHub Releases with generated notes. Retries preserve existing releases and refuse to move conflicting tags.
