/**
 * Nachrichten in Stapeln verschicken und sagen, was wieder freizugeben ist.
 *
 * Die Edge Functions notification-mails und notification-pushes haken erst ab
 * und senden dann. Scheitert ein Stapel, gaben sie bisher alle abgeholten
 * Benachrichtigungen frei, auch die aus Stapeln, die schon draußen waren. Der
 * nächste Lauf schickte die dann ein zweites Mal (B9). Freigegeben wird jetzt
 * nur, was nachweislich nicht rausging.
 *
 * Wie dienstschluessel.ts hier statt neben den Functions, damit es testbar
 * ist. Neben beiden Functions liegt ein Symlink hierher. Keine Importe: die
 * Functions laufen in Deno.
 */

/** Eine Nachricht und die Benachrichtigungen, die sie ausliefert. */
export interface Sendung<N> {
  nachricht: N;
  ids: readonly string[];
}

export interface Versandergebnis {
  /** Der Fehler des gescheiterten Stapels, sonst null. */
  fehler: unknown;
  /** Ids, die keine Nachricht ausgeliefert hat: diese wieder freigeben. */
  freizugeben: string[];
}

/**
 * Sendet die Nachrichten in Stapeln der Größe `groesse`, der Reihe nach.
 *
 * Beim ersten gescheiterten Stapel ist Schluss: die übrigen holt der nächste
 * Lauf nach. Eine Id wird nur freigegeben, wenn keine ihrer Nachrichten in
 * einem erfolgreichen Stapel war. Bei Pushes trägt jedes Gerät dieselben Ids;
 * ist ein Gerät bedient, fehlt die Nachricht lieber auf dem zweiten, als dass
 * das erste sie doppelt bekommt.
 */
export async function inStapelnSenden<N>(
  sendungen: readonly Sendung<N>[],
  groesse: number,
  senden: (stapel: N[], start: number) => Promise<void>,
): Promise<Versandergebnis> {
  let gesendetBis = 0;
  let fehler: unknown = null;

  for (let start = 0; start < sendungen.length; start += groesse) {
    const teil = sendungen.slice(start, start + groesse);
    try {
      await senden(
        teil.map((s) => s.nachricht),
        start,
      );
    } catch (e) {
      fehler = e;
      break;
    }
    gesendetBis = start + teil.length;
  }

  if (fehler === null) return { fehler, freizugeben: [] };

  const zugestellt = new Set(sendungen.slice(0, gesendetBis).flatMap((s) => s.ids));
  const offen = new Set(
    sendungen
      .slice(gesendetBis)
      .flatMap((s) => s.ids)
      .filter((id) => !zugestellt.has(id)),
  );
  return { fehler, freizugeben: [...offen] };
}
