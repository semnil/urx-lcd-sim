# How the screens connect

A map of which screen leads to which. One screen is one `ScreenDef`, and an arrow is a control that
opens the screen it points at. What each screen holds is in [screen-inventory.md](screen-inventory.md);
the stack and the way back are in [architecture.md](architecture.md), "Registering a screen".

Sheets and dialogs (the effect picker, the colour list, a confirmation) are not screens. Nothing pushes
them on the stack — they lie over the screen that is open — so they are not on this map.

## The screens above the rest

```mermaid
flowchart LR
  RAIL["Toolbar and side rail<br>reachable from any screen"]
  RAIL --> SETUP[["SETUP GENERAL<br>(setup)"]]:::ref
  RAIL --> SD[["microSD top menu<br>(microsd)"]]:::ref
  RAIL --> MON[["MONITOR top menu<br>(monitor)"]]:::ref
  RAIL --> BANK["(bank-select)"]

  HOME["HOME (Overview)<br>(home)"]
  HOME --> CV[["Channel view<br>(channel-view)"]]:::ref
  HOME --> SENDS["(sends-select)"]
  HOME --> SCENE["SCENE (menu)<br>(scene)"]
  SCENE --> SLIST["SCENE LIST<br>(scene.list)"]
  SLIST --> STITLE["(scene.title)"]
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## The channel screens

```mermaid
flowchart LR
  CV[["Channel view<br>(channel-view)"]]:::ref
  CV --> CHSET["CH SETTING<br>(ch.setting)"]
  CV --> CHIN["INPUT<br>(ch.input)"]
  CV --> GATE["GATE<br>(ch.gate)"]
  CV --> COMP["COMP<br>(ch.comp)"]
  CV --> EQ["EQ<br>(ch.eq)"]
  CV --> DUCK["DUCKER<br>(ch.ducker)"]
  CV --> DLY["DELAY<br>(ch.delay)"]
  CV --> SENDTO["SEND TO<br>(ch.sendto)"]
  CV --> INS["INS FX<br>(ch.insfx)"]
  CV --> FXP["Parameter settings<br>(ch.effect)"]
  CV --> SSM

  subgraph SSMCS["SSMCS - the round arrows swap these"]
    direction LR
    SSM["SSMCS main<br>(ch.ssmcs)"]
    SSC["SSMCS COMP<br>(ch.ssmcs.comp)"]
    SSS["SSMCS COMP Side Chain<br>(ch.ssmcs.sc)"]
    SSE["SSMCS EQ<br>(ch.ssmcs.eq)"]
    SSM --- SSC --- SSS --- SSE
  end
  style SSMCS fill:#f2f2fa,stroke:#9098a8;
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## Under SETUP, microSD and MONITOR

```mermaid
flowchart LR
  SETUP[["SETUP GENERAL<br>(setup)"]]:::ref
  SETUP --> SMODE["Operation Mode<br>(setup.mode)"]
  SETUP --> SUDK["User Defined Knobs<br>(setup.udk)"]
  SUDK --> SUDKA["(setup.udk.assign)"]
  SETUP --> SRATE["Sampling Frequency<br>(setup.rate)"]
  SETUP --> SPATCH["Output Patch<br>(setup.patch)"]
  SETUP --> SPER["Peripheral<br>(setup.peripheral)"]
  SETUP --> SPOW["Power Management<br>(setup.power)"]
  SETUP --> SDT["Date/Time<br>(setup.datetime)"]
  SDT --> SDTS["(setup.datetime.set)"]
  SDT --> SDTZ["(setup.datetime.zone)"]
  SETUP --> SINT["Software Integration<br>(setup.integration)"]
  SETUP --> SBRI["Brightness<br>(setup.brightness)"]
  SETUP --> SLANG["Language<br>(setup.language)"]
  SETUP --> SVER["Version<br>(setup.version)"]
  SETUP --> SLIC["License<br>(setup.license)"]

  SD[["microSD top menu<br>(microsd)"]]:::ref
  SD --> SDREC["RECORDER<br>(microsd.recorder)"]
  SD --> SDSL["SAVE/LOAD<br>(microsd.saveload)"]
  SD --> SDTOOL["TOOLS<br>(microsd.tools)"]
  SDSL --> SDNAME["(microsd.name)"]
  SDTOOL --> SDNAME

  MON[["MONITOR top menu<br>(monitor)"]]:::ref
  MON --> MLEV["Monitor<br>(monitor.level)"]
  MON --> MPH["Phones<br>(monitor.phones)"]
  MON --> MOSC["Oscillator<br>(monitor.osc)"]
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## Reading the map

- **A yellow node with double side bars is drawn in another figure as well.** That is where a
  figure hands over: Channel view in the first goes on in "The channel screens", and the SETUP
  GENERAL, microSD and MONITOR top menus go on in "Under SETUP, microSD and MONITOR".
- **The first line of a node is the user guide's name for the screen.** The `()` under it is the
  screen id inside this simulator. Where the guide names no screen (the bank list, the sends sheet,
  name entry, the assignment popups), the node carries the id alone, in `()`.
- **The side rail opens just above HOME.** SETUP, microSD and MONITOR open from any screen, and one
  press of the back arrow from them returns to HOME (`openTop()`). Every other arrow stacks on the
  screen it was pressed from (`push()`).
- **The four SSMCS screens swap.** The round arrows at the edges of the glass replace rather than stack
  (`replace()`), so the back arrow returns to the channel view from any of the four. The channel view
  opens the main one.
- **The effect screen has two ways in.** An insert opens `ch.insfx` from the channel view's INS FX
  block, an FX channel opens `ch.effect` from its own panel. Both are the effect's settings screen
  itself, with no area to touch first.
- **Name entry opens from two places.** A scene's name (`scene.title`) and a card folder's or file's
  name (`microsd.name`) are built the same way, and each returns where it was opened from.
- **A channel screen carries its strip.** The arrows either side of the toolbar's channel name change
  the strip without leaving the screen, and a block the strip does not carry opens no screen.
