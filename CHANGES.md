# Changes

## Unreleased

- Publish the simulator on GitHub Pages at `urx-lcd-sim.semnil.com` after a separate application version update is merged into `main` and tests and the production build pass. Ordinary merges and pull requests run checks without deploying.
- Queue deployments and skip superseded version updates immediately before publishing, including retries of older runs.
- Automatically tag tested version updates and create draft GitHub Releases with generated notes. Retries preserve existing releases and refuse to move conflicting tags.
- Draw the corners of the effect screens' panels and of Cho / Off / Vib, Gate and Sync in the same pixels as the other screens' cells and buttons, with Cho / Off / Vib set at 59 / 60 / 59 pixels wide.
- Draw the corners of the GATE, COMP and DUCKER settings panels in the sunk cells' pixels, as the guide's figures draw them, and so the same panels on the effect and SSMCS screens.
