"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * How the top bar's panel is drawn, when it is not simply following the menu
 * style (0.150.0).
 *
 * `match` (the default, and what an install that chose nothing stores) means
 * the panel follows `menu_style` like it always has — `simple`, `semi`, `mega`
 * or `big`. `columns` is the top bar's own fifth shape and is chosen on the
 * Themes screen as "Top bar panel".
 *
 * A context rather than a prop because the choice has to reach `TopBarPanel`
 * through nine theme headers and the classic one, every one of which already
 * passes `menuStyle` down to two different panels: a second prop through all
 * of them would be eleven edits for one value that only one component reads,
 * and a header added later would have to remember it. The provider renders no
 * element, so nothing moves in the markup; `themeChrome()` and classic's chrome
 * are the two places that mount it.
 */
export type TopBarStyle = "match" | "columns";

const TopBarStyleContext = createContext<TopBarStyle>("match");

export function TopBarStyleProvider({ value, children }: { value: TopBarStyle; children: ReactNode }) {
  return <TopBarStyleContext.Provider value={value}>{children}</TopBarStyleContext.Provider>;
}

export function useTopBarStyle(): TopBarStyle {
  return useContext(TopBarStyleContext);
}
