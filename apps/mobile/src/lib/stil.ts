/** Gemeinsame Gestaltung. Sandplatz-Ton als Leitfarbe wie im Web. */
import { StyleSheet } from "react-native";

export const farben = {
  sand: "#c8663c",
  sandDunkel: "#9c4a29",
  sandHell: "#e8d5cb",
  linie: "#d8d2cc",
  text: "#24201d",
  textLeise: "#6b625b",
  flaeche: "#ffffff",
  hintergrund: "#faf8f6",
  gruen: "#3f7a4a",
  rot: "#a63232",
};

export const stil = StyleSheet.create({
  seite: { flex: 1, backgroundColor: farben.hintergrund },
  inhalt: { padding: 16, gap: 12 },
  titel: { fontSize: 24, fontWeight: "700", color: farben.text, letterSpacing: -0.5 },
  unterzeile: { fontSize: 15, color: farben.textLeise },
  karte: {
    backgroundColor: farben.flaeche,
    borderColor: farben.linie,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  knopf: {
    backgroundColor: farben.sand,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  knopfText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  feld: {
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: farben.flaeche,
    color: farben.text,
  },
  hinweisFehler: {
    backgroundColor: "#f7e3e3",
    color: farben.rot,
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  hinweisErfolg: {
    backgroundColor: "#e2efe4",
    color: farben.gruen,
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  zeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  leise: { color: farben.textLeise, fontSize: 14 },
});
