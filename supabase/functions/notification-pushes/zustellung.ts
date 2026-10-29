/**
 * Was APNs und FCM gemeinsam haben: eine Nachricht je Gerät und eine
 * Antwort, die sagt, ob das Gerät noch lebt.
 *
 * Anders als bei Expo gibt es keine Stapel. Jedes Gerät ist ein eigener
 * Aufruf, und ein Fehler betrifft nur dieses Gerät. Deshalb bricht hier nichts
 * beim ersten Fehler ab wie in inStapelnSenden: Ist Apple kurz weg, sollen
 * die Android-Geräte ihre Nachricht trotzdem bekommen.
 */

export type Anbieter = "expo" | "apns" | "fcm";

export interface Geraet {
  token: string;
  provider: Anbieter | string;
}

/** Eine Nachricht, unabhängig vom Anbieter. */
export interface Meldung {
  titel: string;
  text: string;
  badge: number;
  /** Nur Zeichenketten: FCM nimmt in data nichts anderes. */
  daten: Record<string, string>;
}

export interface Zustellung {
  /**
   * gesendet: angenommen. tot: Gerät abgemeldet, stilllegen. abgelehnt: die
   * Nachricht ist kaputt, ein zweiter Versuch hilft nicht. fehler:
   * vorübergehend (Netz, 5xx, 429, Anmeldung beim Anbieter), wieder freigeben.
   */
  ergebnis: "gesendet" | "tot" | "abgelehnt" | "fehler";
  /** Für das Log, ohne Marke. */
  grund?: string;
}

export type Zusteller = (marke: string, meldung: Meldung) => Promise<Zustellung>;

/** Jeder Aufruf höchstens `gleichzeitig` auf einmal, Ergebnisse in Eingabereihenfolge. */
export async function nebenlaeufig<T, E>(
  eingaben: readonly T[],
  gleichzeitig: number,
  arbeit: (eingabe: T) => Promise<E>,
): Promise<E[]> {
  const ergebnisse: E[] = new Array(eingaben.length);
  let naechste = 0;
  const arbeiter = Array.from({ length: Math.min(gleichzeitig, eingaben.length) }, async () => {
    while (naechste < eingaben.length) {
      const i = naechste++;
      ergebnisse[i] = await arbeit(eingaben[i]!);
    }
  });
  await Promise.all(arbeiter);
  return ergebnisse;
}

/**
 * Was am Ende wieder freizugeben ist: was irgendwo vorübergehend scheiterte,
 * aber auf keinem anderen Weg rausging. Wie in inStapelnSenden fehlt eine
 * Nachricht lieber auf dem zweiten Gerät, als dass das erste sie doppelt
 * bekommt.
 */
export function freizugeben(gescheitert: Iterable<string>, zugestellt: Iterable<string>): string[] {
  const draussen = new Set(zugestellt);
  return [...new Set([...gescheitert].filter((id) => !draussen.has(id)))];
}
