import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { paletteFuer, type Farbpalette, type ThemeName } from "@tcm/ui";
import { stilFuer, type Stil } from "./stil";

export type ThemeWahl = "system" | "hell" | "dunkel";

const SPEICHER = "tcm-theme";

interface ThemeKontext {
  theme: ThemeName;
  wahl: ThemeWahl;
  setzeWahl: (w: ThemeWahl) => void;
  farben: Farbpalette;
  stil: Stil;
}

const Kontext = createContext<ThemeKontext | null>(null);

/**
 * Vorgabe ist die Systemeinstellung; wer von Hand waehlt, ueberstimmt sie
 * dauerhaft. Die Wahl liegt in AsyncStorage, damit sie den Neustart ueberlebt.
 */
export function ThemeAnbieter({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [wahl, setWahlIntern] = useState<ThemeWahl>("system");

  useEffect(() => {
    AsyncStorage.getItem(SPEICHER).then((w) => {
      if (w === "hell" || w === "dunkel" || w === "system") setWahlIntern(w);
    });
  }, []);

  function setzeWahl(w: ThemeWahl) {
    setWahlIntern(w);
    void AsyncStorage.setItem(SPEICHER, w);
  }

  const theme: ThemeName = wahl === "system" ? (system === "dark" ? "dunkel" : "hell") : wahl;

  return (
    <Kontext.Provider
      value={{ theme, wahl, setzeWahl, farben: paletteFuer(theme), stil: stilFuer(theme) }}
    >
      {children}
    </Kontext.Provider>
  );
}

export function useTheme(): ThemeKontext {
  const k = useContext(Kontext);
  if (!k) throw new Error("useTheme braucht den ThemeAnbieter im Baum.");
  return k;
}
