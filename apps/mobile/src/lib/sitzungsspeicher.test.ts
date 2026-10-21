import { describe, expect, it } from "vitest";
import {
  type AlterSpeicher,
  type SichererSpeicher,
  inStuecke,
  sichererSchluessel,
  sitzungsSpeicherBauen,
  STUECK_BYTES,
} from "./sitzungsspeicher";

function schluesselbund(kaputt = false): SichererSpeicher & { daten: Map<string, string> } {
  const daten = new Map<string, string>();
  return {
    daten,
    async getItemAsync(k) {
      return daten.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      if (kaputt) throw new Error("Schluesselbund gesperrt");
      // Wie expo-secure-store: zu lange Werte sind ein Fehler.
      if (new TextEncoder().encode(v).length > STUECK_BYTES) throw new Error("zu lang");
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error("ungueltiger Schluessel");
      daten.set(k, v);
    },
    async deleteItemAsync(k) {
      daten.delete(k);
    },
  };
}

function asyncStorage(start: Record<string, string> = {}): AlterSpeicher & { daten: Map<string, string> } {
  const daten = new Map(Object.entries(start));
  return {
    daten,
    async getItem(k) {
      return daten.get(k) ?? null;
    },
    async removeItem(k) {
      daten.delete(k);
    },
  };
}

const KEY = "sb-abc-auth-token";
const lang = (n: number) => JSON.stringify({ access_token: "x".repeat(n), user: { name: "Jürgen Müßig" } });

describe("inStuecke", () => {
  it("laesst kurze Werte ganz", () => {
    expect(inStuecke("abc")).toEqual(["abc"]);
    expect(inStuecke("")).toEqual([""]);
  });

  it("teilt nach Byte und nie mitten in einem Umlaut", () => {
    const wert = "ä".repeat(1500); // 3000 Byte
    const stuecke = inStuecke(wert);
    expect(stuecke.join("")).toBe(wert);
    expect(stuecke).toHaveLength(2);
    for (const s of stuecke) expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(STUECK_BYTES);
  });

  it("zaehlt Emoji mit vier Byte", () => {
    const stuecke = inStuecke("🎾".repeat(600), 2048);
    expect(stuecke.map((s) => new TextEncoder().encode(s).length)).toEqual([2048, 352]);
  });
});

describe("sichererSchluessel", () => {
  it("ersetzt Zeichen, die SecureStore ablehnt", () => {
    expect(sichererSchluessel("sb-127-auth-token")).toBe("sb-127-auth-token");
    expect(sichererSchluessel("sb:x/y")).toBe("sb_x_y");
  });
});

describe("sitzungsSpeicherBauen", () => {
  it("speichert und liest kurze Werte direkt", async () => {
    const sicher = schluesselbund();
    const speicher = sitzungsSpeicherBauen(sicher);
    await speicher.setItem(KEY, "kurz");
    expect(sicher.daten.get(KEY)).toBe("kurz");
    expect(await speicher.getItem(KEY)).toBe("kurz");
  });

  it("teilt lange Sitzungen ab 2 KB und setzt sie wieder zusammen", async () => {
    const sicher = schluesselbund();
    const speicher = sitzungsSpeicherBauen(sicher);
    const wert = lang(5000);
    await speicher.setItem(KEY, wert);
    expect(sicher.daten.get(KEY)).toBe("__stuecke__:3");
    expect(sicher.daten.has(`${KEY}.2`)).toBe(true);
    expect(await speicher.getItem(KEY)).toBe(wert);
  });

  it("raeumt ueberzaehlige Stuecke auf, wenn der Wert kuerzer wird", async () => {
    const sicher = schluesselbund();
    const speicher = sitzungsSpeicherBauen(sicher);
    await speicher.setItem(KEY, lang(5000));
    await speicher.setItem(KEY, lang(2500));
    expect(sicher.daten.has(`${KEY}.1`)).toBe(true);
    expect(sicher.daten.has(`${KEY}.2`)).toBe(false);
    await speicher.setItem(KEY, "kurz");
    expect([...sicher.daten.keys()]).toEqual([KEY]);
  });

  it("entfernt Verweis und alle Stuecke", async () => {
    const sicher = schluesselbund();
    const speicher = sitzungsSpeicherBauen(sicher);
    await speicher.setItem(KEY, lang(5000));
    await speicher.removeItem(KEY);
    expect(sicher.daten.size).toBe(0);
    expect(await speicher.getItem(KEY)).toBeNull();
  });

  it("gibt bei fehlendem Stueck null statt einer halben Sitzung", async () => {
    const sicher = schluesselbund();
    const speicher = sitzungsSpeicherBauen(sicher);
    await speicher.setItem(KEY, lang(5000));
    sicher.daten.delete(`${KEY}.1`);
    expect(await speicher.getItem(KEY)).toBeNull();
  });

  it("zieht eine bestehende Sitzung aus AsyncStorage um", async () => {
    const wert = lang(3000);
    const sicher = schluesselbund();
    const alt = asyncStorage({ [KEY]: wert });
    const speicher = sitzungsSpeicherBauen(sicher, alt);

    expect(await speicher.getItem(KEY)).toBe(wert);
    expect(alt.daten.has(KEY)).toBe(false);
    expect(sicher.daten.get(KEY)).toBe("__stuecke__:2");
    // Beim naechsten Start kommt sie aus dem Schluesselbund.
    expect(await sitzungsSpeicherBauen(sicher).getItem(KEY)).toBe(wert);
  });

  it("behaelt die alte Kopie, wenn der Umzug scheitert", async () => {
    const alt = asyncStorage({ [KEY]: "sitzung" });
    const speicher = sitzungsSpeicherBauen(schluesselbund(true), alt);
    expect(await speicher.getItem(KEY)).toBe("sitzung");
    expect(alt.daten.get(KEY)).toBe("sitzung");
  });

  it("gibt null, wenn nirgends etwas liegt", async () => {
    const speicher = sitzungsSpeicherBauen(schluesselbund(), asyncStorage());
    expect(await speicher.getItem(KEY)).toBeNull();
  });

  it("loescht beim Abmelden auch eine liegengebliebene alte Kopie", async () => {
    const sicher = schluesselbund();
    const alt = asyncStorage({ [KEY]: "alt" });
    const speicher = sitzungsSpeicherBauen(sicher, alt);
    await speicher.setItem(KEY, "neu");
    await speicher.removeItem(KEY);
    expect(alt.daten.size).toBe(0);
    expect(await speicher.getItem(KEY)).toBeNull();
  });
});
