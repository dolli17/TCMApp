/**
 * Ablage der Sitzung im Schluesselbund
 *
 * Die Wertmarken gehoeren in den Schluesselbund (iOS) bzw. den Keystore
 * (Android), nicht in AsyncStorage - dort liegen sie unverschluesselt in der
 * Datensicherung. expo-secure-store warnt aber ab 2048 Byte je Eintrag, und
 * eine Supabase-Sitzung ist mit Nutzerdaten schnell groesser. Lange Werte
 * werden deshalb in Stuecke geteilt; unter dem eigentlichen Schluessel steht
 * dann nur ein Verweis mit der Anzahl.
 *
 * Wer vor dem Update angemeldet war, hat seine Sitzung noch in AsyncStorage.
 * Beim ersten Lesen zieht sie in den Schluesselbund um - so bleibt man nach
 * dem Update angemeldet und die alte Kopie verschwindet.
 *
 * Ohne Bezug auf React Native gebaut, damit die Logik in Vitest laeuft.
 */

/** Was wir von expo-secure-store brauchen. */
export interface SichererSpeicher {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Was wir von AsyncStorage brauchen - nur noch fuer den Umzug. */
export interface AlterSpeicher {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

/** Die Schnittstelle, die supabase-js als `auth.storage` erwartet. */
export interface SitzungsSpeicher {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Grenze von expo-secure-store je Eintrag, in Byte (UTF-8). */
export const STUECK_BYTES = 2048;

const VERWEIS = "__stuecke__:";

/** Byte eines Zeichens in UTF-8 - ohne TextEncoder, den nicht jede Laufzeit hat. */
function utf8Bytes(zeichen: string): number {
  const cp = zeichen.codePointAt(0)!;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * Teilt nach Byte, nie mitten in einem Zeichen: Umlaute im Namen eines
 * Mitglieds stehen in den Nutzerdaten der Sitzung.
 */
export function inStuecke(wert: string, maxBytes = STUECK_BYTES): string[] {
  const stuecke: string[] = [];
  let aktuell = "";
  let bytes = 0;
  for (const zeichen of wert) {
    const b = utf8Bytes(zeichen);
    if (bytes + b > maxBytes) {
      stuecke.push(aktuell);
      aktuell = "";
      bytes = 0;
    }
    aktuell += zeichen;
    bytes += b;
  }
  if (aktuell || stuecke.length === 0) stuecke.push(aktuell);
  return stuecke;
}

/** SecureStore erlaubt nur Buchstaben, Ziffern, ".", "-" und "_" im Schluessel. */
export function sichererSchluessel(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

function stueckSchluessel(key: string, i: number): string {
  return `${key}.${i}`;
}

function anzahlAus(verweis: string | null): number {
  if (!verweis?.startsWith(VERWEIS)) return 0;
  const n = Number.parseInt(verweis.slice(VERWEIS.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function sitzungsSpeicherBauen(
  sicher: SichererSpeicher,
  alt?: AlterSpeicher,
): SitzungsSpeicher {
  async function stueckeLoeschen(key: string, ab: number, bis: number) {
    for (let i = ab; i < bis; i++) {
      await sicher.deleteItemAsync(stueckSchluessel(key, i));
    }
  }

  async function lesen(key: string): Promise<string | null> {
    const kopf = await sicher.getItemAsync(key);
    if (kopf === null) return null;
    const anzahl = anzahlAus(kopf);
    if (anzahl === 0) return kopf;

    let wert = "";
    for (let i = 0; i < anzahl; i++) {
      const stueck = await sicher.getItemAsync(stueckSchluessel(key, i));
      // Ein fehlendes Stueck heisst: kaputt geschrieben. Lieber neu anmelden
      // als eine halbe Sitzung an supabase-js geben.
      if (stueck === null) return null;
      wert += stueck;
    }
    return wert;
  }

  async function schreiben(key: string, wert: string): Promise<void> {
    const bisher = anzahlAus(await sicher.getItemAsync(key));
    const stuecke = inStuecke(wert);

    if (stuecke.length === 1) {
      await sicher.setItemAsync(key, wert);
      await stueckeLoeschen(key, 0, bisher);
      return;
    }

    // Erst die Stuecke, dann der Verweis darauf.
    for (let i = 0; i < stuecke.length; i++) {
      await sicher.setItemAsync(stueckSchluessel(key, i), stuecke[i]!);
    }
    await sicher.setItemAsync(key, `${VERWEIS}${stuecke.length}`);
    await stueckeLoeschen(key, stuecke.length, bisher);
  }

  return {
    async getItem(roh) {
      const key = sichererSchluessel(roh);
      try {
        const wert = await lesen(key);
        if (wert !== null || !alt) return wert;
      } catch {
        // Schluesselbund nicht lesbar: wie abgemeldet behandeln, nicht abstuerzen.
        return null;
      }

      // Umzug aus AsyncStorage. Die alte Kopie verschwindet erst, wenn die
      // neue sicher steht - sonst waere man nach einem Fehler abgemeldet.
      const vorher = await alt.getItem(roh).catch(() => null);
      if (vorher === null) return null;
      try {
        await schreiben(key, vorher);
        await alt.removeItem(roh);
      } catch {
        // Beim naechsten Start noch einmal versuchen.
      }
      return vorher;
    },

    async setItem(roh, wert) {
      await schreiben(sichererSchluessel(roh), wert);
    },

    async removeItem(roh) {
      const key = sichererSchluessel(roh);
      try {
        const anzahl = anzahlAus(await sicher.getItemAsync(key));
        await stueckeLoeschen(key, 0, anzahl);
        await sicher.deleteItemAsync(key);
      } finally {
        // Eine liegengebliebene alte Kopie darf nach dem Abmelden nicht
        // beim naechsten Start als Sitzung zurueckkommen.
        await alt?.removeItem(roh).catch(() => undefined);
      }
    },
  };
}
