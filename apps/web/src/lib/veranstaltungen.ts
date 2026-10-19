import type {
  Database, EventInfo, EventKind, EventRegistrationStatus, EventStatus, EventZahlen, MitgliedEvent,
} from "@tcm/core";

/** Eine Zeile aus event_verwaltung, wie Liste und Detail sie lesen. */
export type EventZeile = Database["public"]["Functions"]["event_verwaltung"]["Returns"][number];

/** event_verwaltung liefert Enums als Text-Union und Stunden als Zahl - hier nur noch benannt. */
export function alsEvent(z: EventZeile): EventInfo & EventZahlen & {
  id: string; title: string; location: string | null; created_at: string; published_at: string | null;
} {
  return {
    ...z,
    kind: z.kind as EventKind,
    status: z.status as EventStatus,
    work_hours: z.work_hours == null ? null : Number(z.work_hours),
  };
}

/** Eine Zeile aus events_fuer_mitglied. */
export type MitgliedEventZeile = Database["public"]["Functions"]["events_fuer_mitglied"]["Returns"][number];

export function alsMitgliedEvent(z: MitgliedEventZeile): MitgliedEvent {
  return {
    ...z,
    kind: z.kind as EventKind,
    status: z.status as EventStatus,
    work_hours: z.work_hours == null ? null : Number(z.work_hours),
    mein_status: (z.mein_status as EventRegistrationStatus | null) ?? null,
  };
}
