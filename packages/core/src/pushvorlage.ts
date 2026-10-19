/**
 * Der Text einer Push-Nachricht.
 *
 * Wie die Mailvorlage hier und nicht neben der Edge Function, damit er
 * testbar ist. Neben supabase/functions/notification-pushes liegt ein
 * Symlink hierher. Keine Importe: die Function laeuft in Deno.
 */

export interface PushPosten {
  kind: string;
  title: string;
  body: string;
  event_id?: string | null;
}

export interface PushMeldung {
  titel: string;
  text: string;
  /** Pfad in der App, den ein Tippen auf die Nachricht oeffnet */
  ziel: string;
}

/**
 * Aus mehreren Posten wird eine Meldung.
 *
 * Eine Serienanlage mit sechzig Terminen erzeugt sechzig Benachrichtigungen in
 * Sekunden. Als sechzig Tonsignale waere das ein Grund, Push abzuschalten.
 * Der Sammeltitel sagt, worum es geht - "Änderungen an deinen Buchungen"
 * stimmt nicht, sobald eine Veranstaltung dabei ist.
 */
export function pushMeldung(items: PushPosten[]): PushMeldung {
  const ziel = pushZiel(items);
  if (items.length === 1) {
    const eins = items[0]!;
    return { titel: eins.title, text: eins.body, ziel };
  }

  const buchungen = items.every((i) => i.kind.startsWith("booking_") || i.kind.startsWith("player_"));
  const veranstaltungen = items.every((i) => i.kind.startsWith("event_"));
  return {
    titel: buchungen
      ? `${items.length} Änderungen an deinen Buchungen`
      : veranstaltungen
        ? `${items.length} Neuigkeiten zu Veranstaltungen`
        : `${items.length} Neuigkeiten vom TC Muckensturm`,
    text: items.map((i) => i.title).join(" · "),
    ziel,
  };
}

/** Geht es um genau eine Veranstaltung, oeffnet das Tippen sie; sonst die Nachrichten. */
export function pushZiel(items: PushPosten[]): string {
  const ids = new Set(items.map((i) => i.event_id ?? ""));
  const [id] = [...ids];
  if (items.length > 0 && ids.size === 1 && id) return `/verein/veranstaltung/${id}`;
  return "/nachrichten";
}
