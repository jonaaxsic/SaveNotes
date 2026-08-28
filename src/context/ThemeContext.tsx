import React, { createContext, useContext, useState, useRef, ReactNode } from "react";

type Theme = "light" | "dark";
type DrawerAction = "organize" | "calendar" | "createManual" | "settings" | "exit";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  drawerVisible: boolean;
  toggleDrawer: () => void;
  setDrawerVisible: (v: boolean) => void;
  onDrawerAction: (action: DrawerAction) => void;
  setDrawerActionHandler: (handler: (action: DrawerAction) => void) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const handlerRef = useRef<((action: DrawerAction) => void) | null>(null);
  const theme: Theme = isDark ? "dark" : "light";
  const toggle = () => setIsDark((v) => !v);
  const setTheme = (t: Theme) => setIsDark(t === "dark");
  const toggleDrawer = () => setDrawerVisible((v) => !v);
  const onDrawerAction = (action: DrawerAction) => handlerRef.current?.(action);
  const setDrawerActionHandler = (handler: (action: DrawerAction) => void) => { handlerRef.current = handler; };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggle, setTheme, drawerVisible, toggleDrawer, setDrawerVisible, onDrawerAction, setDrawerActionHandler }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}
