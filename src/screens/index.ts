// Every screen the simulator can show. Adding a screen is one entry here plus
// one module; nothing else in the app enumerates screens.

import { channelScreens } from "./channel";
import { bankSelectScreen, homeScreen } from "./home";
import { microsdScreens } from "./microsd";
import { monitorScreens } from "./monitor";
import { sceneScreen, sceneTopScreen } from "./scene";
import { ssmcsScreens } from "./ssmcs";
import { setupScreens } from "./setup";
import { titleEntryScreen } from "./title-entry";
import { ScreenRegistry } from "./types";

export function buildRegistry(): ScreenRegistry {
  return new ScreenRegistry().register(
    homeScreen,
    bankSelectScreen,
    sceneTopScreen,
    sceneScreen,
    titleEntryScreen,
    ...setupScreens,
    ...monitorScreens,
    ...microsdScreens,
    ...channelScreens,
    ...ssmcsScreens,
  );
}

export { ScreenRegistry };
