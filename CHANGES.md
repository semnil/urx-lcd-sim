# Changes

## Unreleased

- Publish the simulator on GitHub Pages at `urx-lcd-sim.semnil.com` after a separate application version update is merged into `main` and tests and the production build pass. Ordinary merges and pull requests run checks without deploying.
- Queue deployments and skip superseded version updates immediately before publishing, including retries of older runs.
- Automatically tag tested version updates and create draft GitHub Releases with generated notes. Retries preserve existing releases and refuse to move conflicting tags.
- Draw the corners of the effect screens' panels and of Cho / Off / Vib, Gate and Sync in the same pixels as the other screens' cells and buttons, with Cho / Off / Vib set at 59 / 60 / 59 pixels wide.
- Draw the corners of the GATE, COMP and DUCKER settings panels in the sunk cells' pixels, as the guide's figures draw them, and so the same panels on the effect and SSMCS screens.
- Draw the corners of Pitch Fix's [Correction] and M.B.Comp's [Bypass] in the same pixels as the other buttons.
- Recall a scene or load a settings file with every stored value as it was stored: a Mono Delay or Ping Pong time turned by hand under Sync, and two channels stored apart and recalled over a linked pair, came back changed.
- Set every EQ band's switch when a 1-knob curve is chosen, as the unit does: Loudness switches all four bands on, and Vocal switches LOW off and the other three on.
- Turn the value a user-defined knob holds by dragging, scrolling or using the arrow keys on its cell of the knob bar. The cells stay still while 1-knob is on, as on the unit.
- Draw the EQ curve with each band's filter shape (Bell, L.Shelf, H.Shelf, HPF, LPF) on the EQ screen and in the channel view's EQ block, with a Bell as wide as the guide's figure draws it.
- Correct the README, which described the knob bar as read-only.
- Draw the corners of the toolbar's channel box, the rows of USER DEFINED KNOBS' assignment sheet, MONITOR's Source, a dropdown list's panel, Pitch Fix's keyboard panel, the 1-knob panel and SSMCS's Sweet Spot Data in the pixels the guide's figures draw, and give Sweet Spot Data its band.
- Stand MONITOR's Source, the dynamics screens' settings and the RECORDER's Track Count list where the guide's figures have them, and Pitch Fix's keyboard panel level with the Scale list beside it.
- Draw lit [1-knob]'s corners over its panel, and the copy marks on Sweet Spot Data and MONITOR's Source, in the pixels and colours of the guide's figures.
- Draw every copy mark on whole pixels in the colours of the guide's figures, the RECORDER's in the softened form the unit shows, turn a RECORDER slot's source button as MONITOR's Source turns, and stand the time zone's box a pixel right of the date's.
- Draw the top right pixel of a RECORDER slot's copy mark, where it lies on the button's corner, in the colour the guide's figure shows.
